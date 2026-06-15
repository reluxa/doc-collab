import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { DOCS_ROOT } from "./config";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "./errors";
import { invalidateDocumentListCache } from "./document-list-cache";
import { markApiWrite } from "./api-write-echo";
import { resolveDocPath } from "./security";
import type { DocumentContent, DocumentId, DocumentMeta } from "../types/document";

// Re-export typed errors so consumers (API, MCP) don't import errors.ts directly.
export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
};

// ---------------------------------------------------------------------------
// ETag helpers
// ---------------------------------------------------------------------------

/** Compute a strong SHA-256 ETag from raw file bytes, formatted as a quoted string. */
async function computeETag(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hashHex}"`;
}

// ---------------------------------------------------------------------------
// Per-document async mutex
// ---------------------------------------------------------------------------

const locks = new Map<DocumentId, Promise<unknown>>();

async function withLock<T>(id: DocumentId, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id);
  const current: Promise<T> = (prev ? prev.then(fn, fn) : Promise.resolve().then(fn)).finally(() => {
    if (locks.get(id) === current) locks.delete(id);
  });
  locks.set(id, current);
  return current;
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first H1 heading from Markdown text, or fall back to the
 * filename without extension.
 */
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all documents in DOCS_ROOT. */
export async function listDocuments(): Promise<DocumentMeta[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(DOCS_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const docs: DocumentMeta[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (ext !== ".md") continue;

    const id = path.basename(entry.name, ".md");
    const filePath = path.resolve(DOCS_ROOT, entry.name);
    const stats = await fs.stat(filePath);

    let title = id;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      title = extractTitle(raw, id);
    } catch {
      // If we can't read it, fall back to the filename.
    }

    docs.push({
      id,
      title,
      modifiedAt: stats.mtime,
    });
  }

  // Sort by most recently modified first.
  docs.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return docs;
}

/**
 * Read a document by id.
 * @throws NotFoundError if the document does not exist
 * @throws BadRequestError / ForbiddenError from resolveDocPath
 */
export async function readDocument(id: DocumentId): Promise<DocumentContent> {
  const filePath = resolveDocPath(id);

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNotFound(err)) throw new NotFoundError(`Document not found: "${id}"`);
    throw err;
  }

  const etag = await computeETag(filePath);
  return { id, content, etag };
}

/**
 * Create a new document.
 * @throws ConflictError if a document with the same id already exists
 * @throws BadRequestError / ForbiddenError from resolveDocPath
 */
export async function createDocument(
  id: DocumentId,
  content: string,
): Promise<DocumentContent> {
  const filePath = resolveDocPath(id);

  // Check existence before writing.
  try {
    await fs.access(filePath);
    throw new ConflictError(`Document already exists: "${id}"`);
  } catch (err: unknown) {
    if (err instanceof ConflictError) throw err;
    if (!isAccessNotFound(err)) {
      throw err;
    }
  }

  await fs.mkdir(DOCS_ROOT, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");

  invalidateDocumentListCache();
  const etag = await computeETag(filePath);
  return { id, content, etag };
}

/**
 * Write (replace) a document's content with optimistic concurrency.
 *
 * The caller must supply `ifMatch` — the ETag from the last read.
 * The current file is re-hashed under a per-document lock; if the hash
 * mismatches a ConflictError is thrown.
 *
 * @throws ConflictError if the ETag does not match (concurrent modification)
 * @throws NotFoundError if the document does not exist
 * @throws BadRequestError / ForbiddenError from resolveDocPath
 */
export async function writeDocument(
  id: DocumentId,
  content: string,
  options: { ifMatch: string },
): Promise<DocumentContent> {
  const filePath = resolveDocPath(id);

  return withLock(id, async () => {
    // Verify the file still exists.
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError(`Document not found: "${id}"`);
    }

    // Re-hash under the lock.
    const currentETag = await computeETag(filePath);
    if (currentETag !== options.ifMatch) {
      throw new ConflictError(
        `Document was modified by another writer (etag mismatch)`,
      );
    }

    await fs.writeFile(filePath, content, "utf-8");
    invalidateDocumentListCache();
    const newETag = await computeETag(filePath);
    markApiWrite(id, newETag);

    // Create version snapshot inside the lock (best-effort, non-blocking).
    try {
      const { createVersion } = await import("./collab/versioning");
      await createVersion(id, {
        trigger: "user-save",
        author: "human",
        markdown: content,
        etag: newETag,
      });
    } catch {
      // Versioning is best-effort — never fail a write because of it.
    }

    return { id, content, etag: newETag };
  });
}

/**
 * Delete a document.
 * @throws NotFoundError if the document does not exist
 * @throws BadRequestError / ForbiddenError from resolveDocPath
 */
export async function deleteDocument(id: DocumentId): Promise<void> {
  const filePath = resolveDocPath(id);

  try {
    await fs.unlink(filePath);
    invalidateDocumentListCache();
  } catch (err: unknown) {
    if (isNotFound(err)) throw new NotFoundError(`Document not found: "${id}"`);
    throw err;
  }

  // Also delete all version snapshots for this document.
  try {
    const { deleteVersions } = await import("./collab/versioning");
    await deleteVersions(id);
  } catch {
    // Best-effort cleanup — the document itself is already gone.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function isAccessNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}
