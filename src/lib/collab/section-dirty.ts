/**
 * Per-section dirty flags for incremental Markdown persistence (Story 14).
 */

import * as Y from "yjs";

import { ensureSchema } from "./doc-model";

const META_KEY = "meta";
const DIRTY_SECTIONS_KEY = "dirtySections";

function metaMap(doc: Y.Doc): Y.Map<unknown> {
  ensureSchema(doc);
  return doc.getMap(META_KEY);
}

function dirtyArray(doc: Y.Doc): Y.Array<string> {
  const meta = metaMap(doc);
  let arr = meta.get(DIRTY_SECTIONS_KEY) as Y.Array<string> | undefined;
  if (!arr) {
    arr = new Y.Array<string>();
    meta.set(DIRTY_SECTIONS_KEY, arr);
  }
  return arr;
}

/** Mark section ids as needing re-serialization on next persist. */
export function markSectionsDirty(doc: Y.Doc, sectionIds: string[]): void {
  if (sectionIds.length === 0) return;
  doc.transact(() => {
    const arr = dirtyArray(doc);
    const existing = new Set(arr.toArray());
    for (const id of sectionIds) {
      if (!existing.has(id)) arr.push([id]);
    }
  });
}

/** Return and clear dirty section ids. */
export function takeDirtySections(doc: Y.Doc): string[] {
  const arr = dirtyArray(doc);
  const ids = arr.toArray();
  if (ids.length > 0) arr.delete(0, ids.length);
  return ids;
}

/** Peek dirty ids without clearing (tests / diagnostics). */
export function peekDirtySections(doc: Y.Doc): string[] {
  return dirtyArray(doc).toArray();
}

/** Reset meta (tests). */
export function resetSectionDirtyMeta(doc: Y.Doc): void {
  metaMap(doc).delete(DIRTY_SECTIONS_KEY);
}
