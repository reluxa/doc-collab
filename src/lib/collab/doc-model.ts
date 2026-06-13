/**
 * Y.Doc schema for collaborative document editing.
 *
 * Defines the structure of a `Y.Doc` that represents a single Markdown
 * document as an ordered set of sections.  Each section has its own
 * `Y.XmlFragment` so edits are localized and concurrent edits to
 * different sections never interfere.
 *
 * Schema:
 *   - `order: Y.Array<string>`  — ordered list of section IDs.
 *   - `sections: Y.Map<string, Y.XmlFragment>` — each section ID maps
 *     to its own ProseMirror-compatible XML fragment.
 *
 * Editing a section binds Tiptap to its fragment.
 * Reordering a section mutates `order`.  Edits and moves commute.
 */

import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

/** Key for the ordered list of section IDs in the Y.Doc. */
const ORDER_KEY = "order";

/** Key for the map of section ID → Y.XmlFragment in the Y.Doc. */
const SECTIONS_KEY = "sections";

// ---------------------------------------------------------------------------
// Y.Doc creation and accessors
// ---------------------------------------------------------------------------

/**
 * Create a new, empty `Y.Doc` with the collab schema initialized.
 *
 * The doc starts with an empty `order` array and an empty `sections` map.
 * Sections are added via `addSection`.
 */
export function createDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getArray<Y.XmlFragment>(ORDER_KEY);
  doc.getMap<string>(SECTIONS_KEY);
  return doc;
}

/**
 * Ensure the schema keys exist on a `Y.Doc` (idempotent).
 * Useful when loading a doc that was created elsewhere.
 */
export function ensureSchema(doc: Y.Doc): void {
  doc.getArray<Y.XmlFragment>(ORDER_KEY);
  doc.getMap<string>(SECTIONS_KEY);
}

/**
 * Get the ordered array of section IDs.
 */
export function getOrder(doc: Y.Doc): Y.Array<string> {
  return doc.getArray<string>(ORDER_KEY);
}

/**
 * Get the map of section ID → Y.XmlFragment.
 */
export function getSections(doc: Y.Doc): Y.Map<Y.XmlFragment> {
  return doc.getMap<Y.XmlFragment>(SECTIONS_KEY);
}

// ---------------------------------------------------------------------------
// Section operations
// ---------------------------------------------------------------------------

/**
 * Add a new section to the doc at a given position.
 * Creates a fresh `Y.XmlFragment` for the section.
 *
 * @param doc  The Y.Doc to modify.
 * @param id   Stable section ID (nanoid).
 * @param index Position in the order array (default: append).
 */
export function addSection(doc: Y.Doc, id: string, index?: number): void {
  const sections = getSections(doc);
  const order = getOrder(doc);

  // Create the fragment if it doesn't exist.
  if (!sections.has(id)) {
    sections.set(id, new Y.XmlFragment());
  }

  // Add to order at the given position.
  if (index !== undefined) {
    order.insert(index, [id]);
  } else {
    order.push([id]);
  }
}

/**
 * Remove a section from the doc by ID.
 * Removes it from both `order` and `sections`.
 */
export function removeSection(doc: Y.Doc, id: string): void {
  const sections = getSections(doc);
  const order = getOrder(doc);

  // Find and remove from order.
  const ids = order.toArray();
  const idx = ids.indexOf(id);
  if (idx !== -1) {
    order.delete(idx, 1);
  }

  // Remove the fragment.
  sections.delete(id);
}

/**
 * Get the `Y.XmlFragment` for a section, or `null` if not found.
 */
export function getSectionFragment(
  doc: Y.Doc,
  id: string,
): Y.XmlFragment | null {
  const sections = getSections(doc);
  return sections.get(id) ?? null;
}

/**
 * Move a section from one position to another in the order array.
 *
 * @param doc  The Y.Doc to modify.
 * @param id   Section ID to move.
 * @param fromIndex Current position.
 * @param toIndex   Target position.
 */
export function moveSection(
  doc: Y.Doc,
  id: string,
  fromIndex: number,
  toIndex: number,
): void {
  const order = getOrder(doc);
  order.delete(fromIndex, 1);
  order.insert(toIndex, [id]);
}

/**
 * Replace the entire content of a section's fragment with new text.
 * Used when applying a full section update from Markdown.
 *
 * @param doc  The Y.Doc to modify.
 * @param id   Section ID.
 * @param text Plain text content (heading + body).
 */
export function setSectionContent(
  doc: Y.Doc,
  id: string,
  text: string,
): void {
  const sections = getSections(doc);
  let existing = sections.get(id);
  if (!existing) {
    existing = new Y.XmlFragment();
    sections.set(id, existing);
  }
  // Clear existing content and insert new text.
  existing.delete(0, existing.length);
  const textNode = new Y.XmlText();
  textNode.insert(0, text);
  existing.push([textNode]);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Get all section IDs in document order.
 */
export function getSectionIds(doc: Y.Doc): string[] {
  return getOrder(doc).toArray();
}

/**
 * Get all section IDs that have fragments in the sections map.
 */
export function getSectionKeys(doc: Y.Doc): string[] {
  return Array.from(getSections(doc).keys());
}

/**
 * Get the plain text content of a section's fragment.
 * Returns `null` if the fragment is empty or not found.
 */
export function getSectionText(fragment: Y.XmlFragment | undefined): string | null {
  if (!fragment) return null;
  const parts: string[] = [];
  for (const item of fragment.toArray()) {
    if (item instanceof Y.XmlText) {
      parts.push(item.toString());
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}
