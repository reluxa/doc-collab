/**
 * Y.Doc persistence: serialize the live `Y.Doc` to disk as both `.md`
 * (git-friendly, agent interface) and `.ydoc` (binary snapshot for fast
 * reload and CRDT history).
 *
 * Called by Hocuspocus `onStoreDocument` hook (debounced 400ms, max 30s).
 * Uses the `md-bridge` from Story 11 to serialize `Y.Doc` → Markdown.
 *
 * Tombstone GC is triggered on `.ydoc` snapshot to bound memory growth.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Y from "yjs";

import { DOCS_ROOT } from "../config";
import { resolveDocPath } from "../security";
import { yDocToMarkdown } from "./md-bridge";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/**
 * Get the `.ydoc` snapshot path for a document id.
 * Lives alongside the `.md` in DOCS_ROOT.
 */
export function ydocPath(id: string): string {
  return resolveDocPath(id).replace(/\.md$/, ".ydoc");
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load a `.ydoc` snapshot from disk.
 *
 * @param id  Document id (filename without extension).
 * @returns   Binary update bytes, or `null` if no snapshot exists.
 */
export async function loadYDocSnapshot(id: string): Promise<Uint8Array | null> {
  const filePath = ydocPath(id);
  try {
    const data = await fs.readFile(filePath);
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Persist a `Y.Doc` to both `.md` and `.ydoc` on disk.
 *
 * - `.md`: canonical Markdown (via `yDocToMarkdown`), the git/agent artifact
 * - `.ydoc`: binary CRDT snapshot (`Y.encodeStateAsUpdate`) for fast reload
 *
 * @param id     Document id.
 * @param doc    The `Y.Doc` to persist.
 */
export async function storeYDocSnapshot(id: string, doc: Y.Doc): Promise<void> {
  const mdPath = resolveDocPath(id);
  const ydocFilePath = ydocPath(id);

  // Serialize to Markdown.
  const md = yDocToMarkdown(doc);
  await fs.writeFile(mdPath, md, "utf-8");

  // Encode and write binary snapshot.
  const update = Y.encodeStateAsUpdate(doc);
  await fs.writeFile(ydocFilePath, Buffer.from(update));
}
