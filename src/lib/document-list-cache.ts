/**
 * In-memory cache for document list metadata (Story 14).
 *
 * Avoids re-reading every `.md` file on each `GET /api/documents`.
 * Invalidated by the filesystem watcher and write paths.
 */

import type { DocumentMeta } from "../types/document";
import { listDocuments as listDocumentsUncached } from "./documents";

let cached: DocumentMeta[] | null = null;

/** Drop cached list — call after any document add/change/delete. */
export function invalidateDocumentListCache(): void {
  cached = null;
}

/** List documents, reusing cache when valid. */
export async function listDocumentsCached(): Promise<DocumentMeta[]> {
  if (cached) return cached;
  cached = await listDocumentsUncached();
  return cached;
}

/** Reset state (tests). */
export function resetDocumentListCache(): void {
  cached = null;
}
