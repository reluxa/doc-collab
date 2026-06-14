/**
 * Section model: split Markdown into stable-ID sections.
 *
 * Sections are delimited by heading boundaries (default H1/H2).
 * Each section gets a stable nanoid persisted as an anchor comment:
 *   `<!-- sec:Vq3kР -->`
 *
 * Anchors are best-effort — recovery handles missing/duplicate/stripped
 * anchors via heading + position matching.
 *
 * This module is pure logic (no fs, no Yjs).  It splits Markdown into
 * `Section` objects and re-serialises them back to Markdown (round-trip safe).
 */

import { customAlphabet } from "nanoid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A section extracted from (or to be persisted to) a Markdown document. */
export interface Section {
  /** Stable identifier — survives edits, reorders, and anchor loss. */
  id: string;
  /** The heading line including the `#` markers, e.g. `## Introduction`. */
  heading: string;
  /** Body text between this heading and the next one (trimmed). */
  body: string;
}

/** Options controlling how a document is split. */
export interface SplitOptions {
  /**
   * Maximum heading level to split on.
   * @default 2 — splits at H1 and H2 headings.
   */
  maxLevel?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL-safe, 10-char nanoid (enough collision space for section IDs). */
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/**
 * Generate a new stable section ID.
 */
export function generateSectionId(): string {
  return nanoid();
}

/** Regex matching the anchor comment `<!-- sec:<id> -->`. */
const ANCHOR_RE = /^<!--\s*sec:([a-zA-Z0-9]+)\s*-->\s*\n?/;

/** Regex matching a heading line `# heading` through `###### heading`. */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a section ID from an anchor comment at the start of `text`,
 * or `null` if no valid anchor is present.
 */
export function extractAnchorId(text: string): string | null {
  const match = text.match(ANCHOR_RE);
  return match ? match[1] : null;
}

/**
 * Strip the anchor comment from the beginning of `text`, returning the
 * text without the anchor line.
 */
export function stripAnchor(text: string): string {
  return text.replace(ANCHOR_RE, "");
}

/**
 * Prepend an anchor comment to `text`.
 * If an anchor already exists at the start it is replaced.
 */
export function stampAnchor(text: string, id: string): string {
  const stripped = stripAnchor(text);
  return `<!-- sec:${id} -->\n${stripped}`;
}

/**
 * Check whether a heading line qualifies as a split boundary given
 * `maxLevel`.  For `maxLevel: 2` headings `#` and `##` return true.
 */
function isSplitHeading(line: string, maxLevel: number): boolean {
  const m = line.match(HEADING_RE);
  return m !== null && m[1].length <= maxLevel;
}

/**
 * Extract the heading text (without `#` markers) from a heading line.
 * Returns `null` if the line is not a heading.
 */
function extractHeadingText(line: string): string | null {
  const m = line.match(HEADING_RE);
  return m ? m[2].trim() : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a Markdown document into sections at heading boundaries.
 *
 * - Sections that start with an anchor comment keep their ID.
 * - Sections without an anchor get a fresh `nanoid`.
 * - The first section (before any heading) is included with an empty
 *   heading if it has non-whitespace content.
 *
 * @param md  Full Markdown text.
 * @returns   Array of `Section` objects in document order.
 */
export function splitMarkdown(
  md: string,
  options: SplitOptions = {},
): Section[] {
  const maxLevel = options.maxLevel ?? 2;
  const lines = md.split("\n");
  const sections: Section[] = [];

  let currentHeading = "";
  let currentBody: string[] = [];
  let currentId: string | null = null;
  // Stores the anchor ID that belongs to the NEXT heading we encounter.
  let pendingAnchorId: string | null = null;

  const flush = () => {
    const body = currentBody.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    if (!currentHeading && !body) return; // skip empty preamble
    if (!currentId) currentId = generateSectionId();
    sections.push({ id: currentId, heading: currentHeading, body });
  };

  for (const line of lines) {
    // Check for anchor comment — it belongs to the upcoming heading.
    if (ANCHOR_RE.test(line)) {
      const anchorMatch = line.match(ANCHOR_RE);
      if (anchorMatch) {
        pendingAnchorId = anchorMatch[1];
      }
      continue; // skip the anchor line itself
    }

    // Check for heading boundary.
    if (isSplitHeading(line.trim(), maxLevel)) {
      flush();
      currentHeading = line.trim();
      currentBody = [];
      // Apply pending anchor ID, or reset so a new ID gets generated.
      currentId = pendingAnchorId ?? null;
      pendingAnchorId = null;
      continue;
    }

    // Regular body line.
    pendingAnchorId = null; // anchor only applies if heading follows immediately
    currentBody.push(line);
  }

  flush();
  return sections;
}

/**
 * Serialize an array of sections back to Markdown with anchor comments.
 *
 * Sections are joined with a blank line between them.  The heading line
 * includes the original `#` markers.
 */
export function serializeSections(sections: Section[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    let text = "";
    if (section.heading) {
      text = section.heading;
    }
    if (section.body) {
      text = (text ? text + "\n" : "") + section.body;
    }
    parts.push(stampAnchor(text, section.id));
  }

  return parts.join("\n\n");
}

/**
 * Replace specific sections in a Markdown document (Story 14 incremental persist).
 * Unlisted sections are preserved verbatim from `baseMarkdown`.
 */
export function replaceSectionsInMarkdown(
  baseMarkdown: string,
  replacements: Section[],
): string {
  if (replacements.length === 0) return baseMarkdown;

  const base = splitMarkdown(baseMarkdown);
  const byId = new Map(replacements.map((s) => [s.id, s]));
  const replaced = new Set<string>();

  const merged = base.map((section) => {
    const next = byId.get(section.id);
    if (next) {
      replaced.add(section.id);
      return next;
    }
    return section;
  });

  for (const section of replacements) {
    if (!replaced.has(section.id)) merged.push(section);
  }

  return serializeSections(merged);
}

/** Extract one section's Markdown (for per-section PDF export). */
export function extractSectionMarkdown(
  fullMarkdown: string,
  sectionId: string,
): string | null {
  const section = splitMarkdown(fullMarkdown).find((s) => s.id === sectionId);
  if (!section) return null;
  return serializeSections([section]);
}

// ---------------------------------------------------------------------------
// Section ID recovery (§11.3)
//
// When anchors are lost, re-match sections to existing IDs by heading,
// position, and content similarity.
// ---------------------------------------------------------------------------

/**
 * Simple normalized token overlap: count of common tokens / max tokens.
 * Returns a value in [0, 1].
 */
function tokenOverlap(a: string, b: string): number {
  const tokensA = a.toLowerCase().split(/\b/).filter(Boolean);
  const tokensB = b.toLowerCase().split(/\b/).filter(Boolean);
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  let common = 0;
  for (const t of tokensB) {
    if (setA.has(t)) common++;
  }
  return common / Math.max(tokensA.length, tokensB.length);
}

/**
 * Reconcile a new set of sections (parsed from disk) with existing sections
 * (from the Y.Doc).  Returns a new array of sections where IDs are recovered
 * from the existing set when anchors are missing.
 *
 * Matching strategy (in order):
 * 1. Anchor match — ID already present from a valid anchor.
 * 2. Heading + position — same heading text at a compatible position.
 * 3. Content similarity — token overlap ≥ 0.6 against nearest unmatched.
 * 4. Mint new ID — no confident match.
 */
export function reconcileSectionIds(
  newSections: Section[],
  existingSections: Section[],
): Section[] {
  // Build lookup maps.
  const existingByHeading = new Map<string, Section[]>();
  for (const s of existingSections) {
    const list = existingByHeading.get(s.heading) ?? [];
    list.push(s);
    existingByHeading.set(s.heading, list);
  }

  const usedIds = new Set<string>();
  const existingIdSet = new Set(existingSections.map((s) => s.id));
  const result: Section[] = [];

  for (let i = 0; i < newSections.length; i++) {
    const section = { ...newSections[i] };

    // Strategy 1: anchor match — ID exists in both new and existing.
    // Only trust IDs that were actually in the existing set (from anchors).
    // Generated nanoids that don't match anything are treated as "no anchor".
    if (section.id && existingIdSet.has(section.id) && !usedIds.has(section.id)) {
      usedIds.add(section.id);
      result.push(section);
      continue;
    }

    // Strategy 2: heading + position match.
    const heading = section.heading;
    const candidates = existingByHeading.get(heading) ?? [];
    const positionMatch = candidates.find(
      (c) => !usedIds.has(c.id),
    );
    if (positionMatch) {
      section.id = positionMatch.id;
      usedIds.add(section.id);
      result.push(section);
      continue;
    }

    // Strategy 3: content similarity.
    const allUnmatched = existingSections.filter((c) => !usedIds.has(c.id));
    let bestMatch: Section | null = null;
    let bestScore = 0;
    for (const candidate of allUnmatched) {
      const score = tokenOverlap(section.body, candidate.body);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
    if (bestMatch) {
      section.id = bestMatch.id;
      usedIds.add(section.id);
      result.push(section);
      continue;
    }

    // Strategy 4: mint new ID.
    section.id = generateSectionId();
    usedIds.add(section.id);
    result.push(section);
  }

  return result;
}
