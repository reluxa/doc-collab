/**
 * Tracks recent persistence writes so filesystem watchers can ignore
 * echo events from Hocuspocus `onStoreDocument` (Story 13 §feedback loop).
 */

import { createHash } from "node:crypto";

const PERSIST_ECHO_WINDOW_MS = 5_000;

interface PersistRecord {
  contentHash: string;
  content: string;
  at: number;
}

const recentPersistence = new Map<string, PersistRecord>();

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Record a `.md` write originating from Y.Doc persistence. */
export function markPersistenceWrite(documentId: string, markdown: string): void {
  recentPersistence.set(documentId, {
    contentHash: hashContent(markdown),
    content: markdown,
    at: Date.now(),
  });
}

/** Return the last markdown persisted for a document (if known this session). */
export function getLastPersistedMarkdown(documentId: string): string | null {
  const record = recentPersistence.get(documentId);
  if (!record) return null;
  if (Date.now() - record.at > PERSIST_ECHO_WINDOW_MS * 4) return null;
  return record.content;
}

/** True when a watcher event matches a recent persistence write. */
export function isPersistenceEcho(documentId: string, markdown: string): boolean {
  const record = recentPersistence.get(documentId);
  if (!record) return false;
  if (Date.now() - record.at > PERSIST_ECHO_WINDOW_MS) return false;
  return record.contentHash === hashContent(markdown);
}

/** Reset state (tests). */
export function resetPersistenceEcho(): void {
  recentPersistence.clear();
}
