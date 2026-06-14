/**
 * Tracks recent REST API document writes so the filesystem watcher can
 * ignore echo events from the editor's own auto-save (Phase 1).
 */

const API_WRITE_ECHO_WINDOW_MS = 5_000;

const globalForApiWrite = globalThis as unknown as {
  __docCollabApiWriteEcho?: Map<string, { etag: string; at: number }>;
};

function getApiWriteStore(): Map<string, { etag: string; at: number }> {
  if (!globalForApiWrite.__docCollabApiWriteEcho) {
    globalForApiWrite.__docCollabApiWriteEcho = new Map();
  }
  return globalForApiWrite.__docCollabApiWriteEcho;
}

/** Record a `.md` write from `writeDocument` (PUT /api/documents). */
export function markApiWrite(documentId: string, etag: string): void {
  getApiWriteStore().set(documentId, { etag, at: Date.now() });
}

/** True when a watcher event matches a recent API write. */
export function isApiWriteEcho(documentId: string, etag: string): boolean {
  const record = getApiWriteStore().get(documentId);
  if (!record) return false;
  if (Date.now() - record.at > API_WRITE_ECHO_WINDOW_MS) return false;
  return record.etag === etag;
}

/** Reset state (tests). */
export function resetApiWriteEcho(): void {
  getApiWriteStore().clear();
}
