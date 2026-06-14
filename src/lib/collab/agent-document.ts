/**
 * Agent-facing read/write helpers on a live `Y.Doc` (Story 13).
 *
 * Supports the browser's Tiptap `default` fragment and the Story 11 section
 * schema. Agent edits apply as Yjs updates so they merge with human edits.
 */

import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown";

import { NotFoundError } from "../errors";
import { applyMarkdownDiff } from "./md-bridge";
import {
  Section,
  splitMarkdown,
  serializeSections,
  reconcileSectionIds,
  stampAnchor,
} from "./sections";
import { COLLAB_FIELD } from "./constants";
import { serializeDocToMarkdown } from "./persistence";
import { getLastPersistedMarkdown } from "./persist-echo";

const COLLAB_SCHEMA = getSchema([
  StarterKit.configure({
    undoRedo: false,
    codeBlock: false,
    link: false,
    underline: false,
  }),
]);

function sectionsEqual(a: Section, b: Section): boolean {
  return a.heading === b.heading && a.body === b.body;
}

/** ProseMirror-markdown uses snake_case node names; Tiptap expects camelCase. */
const PM_TO_TIPTAP_NODE: Record<string, string> = {
  bullet_list: "bulletList",
  list_item: "listItem",
  ordered_list: "orderedList",
  hard_break: "hardBreak",
  code_block: "codeBlock",
  horizontal_rule: "horizontalRule",
};

/** ProseMirror-markdown mark names differ from Tiptap StarterKit (`strong` → `bold`). */
const PM_TO_TIPTAP_MARK: Record<string, string> = {
  strong: "bold",
  em: "italic",
  s: "strike",
};

function normalizeProsemirrorJsonForTiptap(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const obj = node as {
    type?: string;
    content?: unknown[];
    marks?: { type?: string; [key: string]: unknown }[];
    [key: string]: unknown;
  };

  const type =
    obj.type && PM_TO_TIPTAP_NODE[obj.type] ? PM_TO_TIPTAP_NODE[obj.type] : obj.type;

  const marks = obj.marks?.map((mark) => ({
    ...mark,
    type:
      mark.type && PM_TO_TIPTAP_MARK[mark.type] ? PM_TO_TIPTAP_MARK[mark.type] : mark.type,
  }));

  const normalized = {
    ...obj,
    type,
    ...(marks ? { marks } : {}),
  };

  if (!obj.content) return normalized;
  return {
    ...normalized,
    content: obj.content.map(normalizeProsemirrorJsonForTiptap),
  };
}

function applyDefaultFragmentMarkdown(doc: Y.Doc, markdown: string): void {
  const node = defaultMarkdownParser.parse(markdown);
  const json = normalizeProsemirrorJsonForTiptap(node.toJSON());
  const patch = TiptapTransformer.toYdoc(json, COLLAB_FIELD);

  // Replace the live fragment — Y.applyUpdate alone merges and duplicates blocks.
  doc.transact(() => {
    const target = doc.getXmlFragment(COLLAB_FIELD);
    if (target.length > 0) {
      target.delete(0, target.length);
    }
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(patch));
  });

  patch.destroy();
}

/** Read the canonical Markdown view of a collaborative document. */
export function readCollabMarkdown(doc: Y.Doc): string {
  return serializeDocToMarkdown(doc);
}

/** Apply a full-document Markdown update as CRDT-merged Yjs updates. */
export function applyCollabMarkdown(doc: Y.Doc, markdown: string): number {
  if (doc.share.has(COLLAB_FIELD)) {
    applyDefaultFragmentMarkdown(doc, markdown);
    return 1;
  }

  const current = serializeDocToMarkdown(doc);
  if (current === markdown) return 0;
  return applyMarkdownDiff(doc, markdown);
}

function listSectionsFromMarkdown(markdown: string): Section[] {
  return splitMarkdown(markdown);
}

/** Read a single section from the live document. */
export function readCollabSection(doc: Y.Doc, sectionId: string): Section {
  const sections = listSectionsFromMarkdown(readCollabMarkdown(doc));
  const section = sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new NotFoundError(`Section not found: "${sectionId}"`);
  }
  return section;
}

/** Replace one section's body (heading preserved) in the live document. */
export function updateCollabSection(
  doc: Y.Doc,
  sectionId: string,
  content: string,
): void {
  const markdown = readCollabMarkdown(doc);
  const sections = listSectionsFromMarkdown(markdown);
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index < 0) {
    throw new NotFoundError(`Section not found: "${sectionId}"`);
  }

  sections[index] = { ...sections[index], body: content };
  applyCollabMarkdown(doc, serializeSections(sections));
}

/**
 * Merge an external on-disk Markdown edit into the live document without
 * clobbering sections the human edited concurrently.
 */
export function mergeExternalMarkdown(
  liveMarkdown: string,
  diskMarkdown: string,
  persistedMarkdown: string | null,
): string {
  if (!liveMarkdown.trim()) return diskMarkdown;
  if (!persistedMarkdown) return diskMarkdown;

  const liveSections = splitMarkdown(liveMarkdown);
  const diskSections = splitMarkdown(diskMarkdown);
  const persistedSections = splitMarkdown(persistedMarkdown);

  const reconciledDisk = reconcileSectionIds(diskSections, liveSections);
  const liveById = new Map(liveSections.map((s) => [s.id, s]));
  const persistedById = new Map(persistedSections.map((s) => [s.id, s]));

  const merged: Section[] = reconciledDisk.map((diskSection) => {
    const liveSection = liveById.get(diskSection.id);
    const persistedSection = persistedById.get(diskSection.id);

    if (!liveSection || !persistedSection) return diskSection;

    const diskChanged = !sectionsEqual(diskSection, persistedSection);
    const liveChanged = !sectionsEqual(liveSection, persistedSection);

    if (diskChanged && !liveChanged) return diskSection;
    if (!diskChanged && liveChanged) return liveSection;
    if (diskChanged && liveChanged) return diskSection;
    return liveSection;
  });

  const mergedIds = new Set(merged.map((s) => s.id));
  for (const liveSection of liveSections) {
    if (!mergedIds.has(liveSection.id)) {
      merged.push(liveSection);
    }
  }

  return serializeSections(merged);
}

/** Apply an external `.md` change into a live `Y.Doc`. Returns sections touched. */
export function reconcileExternalMarkdownIntoDoc(
  doc: Y.Doc,
  documentId: string,
  diskMarkdown: string,
): number {
  const liveMarkdown = readCollabMarkdown(doc);
  const persistedMarkdown = getLastPersistedMarkdown(documentId);
  const merged = mergeExternalMarkdown(liveMarkdown, diskMarkdown, persistedMarkdown);
  if (merged === liveMarkdown) return 0;
  return applyCollabMarkdown(doc, merged);
}

/** Format a section as Markdown with its anchor comment. */
export function formatSectionMarkdown(section: Section): string {
  const body = section.heading
    ? `${section.heading}\n\n${section.body}`.trimEnd()
    : section.body;
  return stampAnchor(body, section.id);
}
