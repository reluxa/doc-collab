/**
 * Backward-compat shim — cache store moved to documents.ts to break
 * circular dependency (documents.ts → document-list-cache.ts → documents.ts).
 */

export {
  invalidateDocumentListCache,
  listDocumentsCached,
  resetDocumentListCache,
} from "./documents";
