/**
 * Markdown ↔ Y.Doc bridge.
 *
 * Provides three core operations:
 *
 * 1. `markdownToYDoc(md)` — parse Markdown, split into sections, and
 *    populate a new `Y.Doc` with the collab schema.
 * 2. `yDocToMarkdown(doc)` — serialize the `Y.Doc` back to Markdown
 *    with section anchor comments.
 * 3. `applyMarkdownDiff(doc, newMd)` — diff per-section against the
 *    current `Y.Doc` and apply only changed sections as Yjs updates.
 *
 * The bridge uses `sections.ts` for splitting/serialization and
 * `doc-model.ts` for the Y.Doc schema.  All operations are transactional
 * (wrapped in `doc.transact`) to ensure atomicity.
 *
 * Storage model: each section's heading + body is stored as plain text
 * in a `Y.XmlText` node inside the section's `Y.XmlFragment`.  This
 * keeps the implementation simple and round-trip safe.  In Phase 2 this
 * will be replaced with a proper Markdown → ProseMirror parser.
 */

import * as Y from "yjs";
import {
  Section,
  splitMarkdown,
  serializeSections,
  reconcileSectionIds,
} from "./sections";
import { markSectionsDirty } from "./section-dirty";
import {
  createDoc,
  ensureSchema,
  getSectionIds,
  getSections,
  addSection,
  removeSection,
  setSectionContent,
  getSectionText,
} from "./doc-model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex matching a heading line `# heading` through `###### heading`. */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Convert a section to plain text (heading + body) for storage in Y.Doc.
 */
function sectionToText(section: Section): string {
  return section.heading
    ? `${section.heading}\n\n${section.body}`
    : section.body;
}

/**
 * Parse plain text back into heading + body.
 */
function textToSection(text: string): { heading: string; body: string } {
  const firstLine = text.split("\n")[0];
  const headingMatch = firstLine.match(HEADING_RE);

  if (headingMatch) {
    const lines = text.split("\n");
    const bodyStart = lines.length > 1 && lines[1] === "" ? 2 : 1;
    return {
      heading: firstLine,
      body: lines.slice(bodyStart).join("\n"),
    };
  }

  return { heading: "", body: text };
}

/**
 * Check whether two sections differ (ignoring ID).
 */
function sectionsEqual(a: Section, b: Section): boolean {
  return a.heading === b.heading && a.body === b.body;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse Markdown text and populate a new `Y.Doc` with the collab schema.
 *
 * Splits the Markdown into sections at heading boundaries, assigns stable
 * IDs, and stores heading + body as text in each section's fragment.
 *
 * @param md   Full Markdown text.
 * @param opts Optional split options (max heading level, etc.).
 * @returns    A `Y.Doc` populated with the sections.
 */
export function markdownToYDoc(md: string, opts?: { maxLevel?: number }): Y.Doc {
  const doc = createDoc();
  const sections = splitMarkdown(md, opts);

  doc.transact(() => {
    for (const section of sections) {
      addSection(doc, section.id);
      setSectionContent(doc, section.id, sectionToText(section));
    }
  }, null);

  return doc;
}

/**
 * Serialize a `Y.Doc` back to Markdown with section anchor comments.
 *
 * Each section is serialized as its heading (if any) followed by its body,
 * preceded by an anchor comment `<!-- sec:<id> -->`.  Sections are joined
 * with a blank line.
 *
 * @param doc  The `Y.Doc` to serialize.
 * @returns    Markdown string with anchors.
 */
export function yDocToMarkdown(doc: Y.Doc): string {
  ensureSchema(doc);

  const sectionIds = getSectionIds(doc);
  const sectionsMap = getSections(doc);
  const sectionData: Section[] = [];

  for (const id of sectionIds) {
    const text = getSectionText(sectionsMap.get(id));
    if (text !== null) {
      const { heading, body } = textToSection(text);
      sectionData.push({ id, heading, body });
    }
  }

  return serializeSections(sectionData);
}

/**
 * Apply a Markdown diff against the current `Y.Doc`.
 *
 * Parses `newMd` into sections, reconciles IDs with existing sections,
 * and applies only the changed sections as Yjs updates.  Unchanged
 * sections are left intact (no tombstone churn).
 *
 * Sections present in `newMd` but not in the current `Y.Doc` are added.
 * Sections in the current `Y.Doc` but absent from `newMd` are removed.
 *
 * @param doc    The existing `Y.Doc` to update.
 * @param newMd  New Markdown text (from external source or persist).
 * @returns      The number of sections that were changed.
 */
export function applyMarkdownDiff(doc: Y.Doc, newMd: string): number {
  ensureSchema(doc);

  // Parse new Markdown into sections.
  const newSections = splitMarkdown(newMd);

  // Get current sections from the Y.Doc.
  const currentIds = getSectionIds(doc);
  const sectionsMap = getSections(doc);
  const currentSections: Section[] = currentIds.map((id) => {
    const text = getSectionText(sectionsMap.get(id));
    const section = text ? textToSection(text) : { heading: "", body: "" };
    return { id, ...section };
  });

  // Reconcile IDs — recover existing IDs even if anchors were lost.
  const reconciled =
    currentSections.length === 0
      ? newSections
      : reconcileSectionIds(newSections, currentSections);

  // Determine which sections changed, were added, or were removed.
  const currentIdSet = new Set(currentIds);
  const newIdSet = new Set(reconciled.map((s) => s.id));
  let changed = 0;
  const dirtyIds: string[] = [];

  doc.transact(() => {
    for (const section of reconciled) {
      const text = sectionToText(section);

      if (!currentIdSet.has(section.id)) {
        // New section — add to end.
        addSection(doc, section.id);
        setSectionContent(doc, section.id, text);
        changed++;
        dirtyIds.push(section.id);
      } else {
        // Existing section — check if content changed.
        const currentSection = currentSections.find((s) => s.id === section.id);
        if (currentSection && !sectionsEqual(currentSection, section)) {
          setSectionContent(doc, section.id, text);
          changed++;
          dirtyIds.push(section.id);
        }
      }
    }

    // Remove sections that are no longer in the new Markdown.
    for (const id of currentIds) {
      if (!newIdSet.has(id)) {
        removeSection(doc, id);
        changed++;
        dirtyIds.push(id);
      }
    }
  }, null);

  if (dirtyIds.length > 0) {
    markSectionsDirty(doc, dirtyIds);
  }

  return changed;
}

/**
 * Get the current sections from a `Y.Doc` as plain `Section` objects.
 * Useful for debugging or for the reconciler to compare against.
 */
export function getSectionsFromDoc(doc: Y.Doc): Section[] {
  ensureSchema(doc);
  const sectionIds = getSectionIds(doc);
  const sectionsMap = getSections(doc);
  return sectionIds.map((id) => {
    const text = getSectionText(sectionsMap.get(id));
    const section = text ? textToSection(text) : { heading: "", body: "" };
    return { id, ...section };
  });
}
