/**
 * In-memory cache for document list metadata (Story 14).
 *
 * Avoids re-reading every `.md` file on each `GET /api/documents`.
 * Invalidated by the filesystem watcher and write paths.
 */

import type { DocumentMeta } from "../types/document";
import { listDocuments as listDocumentsUncached } from "./documents";

/** Shared across custom server + Next.js API bundles (separate module instances). */
const globalForDocList = globalThis as unknown as {
  __docCollabDocumentListCache?: DocumentMeta[] | null;
};

function getCacheStore(): { cached: DocumentMeta[] | null } {
  if (!globalForDocList.__docCollabDocumentListCache) {
    globalForDocList.__docCollabDocumentListCache = null;
  }
  return {
    get cached() {
      return globalForDocList.__docCollabDocumentListCache ?? null;
    },
    set cached(value: DocumentMeta[] | null) {
      globalForDocList.__docCollabDocumentListCache = value;
    },
  };
}

/** Drop cached list — call after any document add/change/delete. */
export function invalidateDocumentListCache(): void {
  globalForDocList.__docCollabDocumentListCache = null;
}

/** List documents, reusing cache when valid. */
export async function listDocumentsCached(): Promise<DocumentMeta[]> {
  const store = getCacheStore();
  if (store.cached) return store.cached;
  const docs = await listDocumentsUncached();
  store.cached = docs;
  return docs;
}

/** Reset state (tests). */
export function resetDocumentListCache(): void {
  invalidateDocumentListCache();
}
