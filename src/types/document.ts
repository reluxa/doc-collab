/**
 * A validated document identifier.
 * Maps to a filename without the `.md` extension.
 * Allowed: [A-Za-z0-9_-]{1,128}
 */
export type DocumentId = string;

/** Metadata returned by the document list endpoint. */
export interface DocumentMeta {
  id: DocumentId;
  title: string;
  modifiedAt: Date;
  /** Number of saved versions for this document. */
  versionCount?: number;
  /** URL path to the preview PNG image, or null if none exists yet. */
  previewUrl: string | null;
}

/** Document content returned by the read endpoint. */
export interface DocumentContent {
  id: DocumentId;
  content: string;
  etag: string;
}

/** Payload for creating a new document via the API. */
export interface CreateDocumentPayload {
  id: DocumentId;
  content: string;
}
