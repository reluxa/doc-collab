/**
 * Y.Doc persistence: serialize the live `Y.Doc` to disk as both `.md`
 * (git-friendly, agent interface) and `.ydoc` (binary snapshot for fast
 * reload and CRDT history).
 *
 * Called by Hocuspocus `onStoreDocument` hook (debounced 400ms, max 30s).
 * Uses the `md-bridge` from Story 11 to serialize section-structured docs,
 * or the live Tiptap `default` fragment when present.
 *
 * Tombstone GC is triggered on `.ydoc` snapshot to bound memory growth.
 */

import * as fs from "node:fs/promises";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { defaultMarkdownSerializer } from "prosemirror-markdown";

import { resolveDocPath } from "../security";
import { yDocToMarkdown, markdownToYDoc } from "./md-bridge";
import { COLLAB_FIELD } from "./constants";
import { markPersistenceWrite } from "./persist-echo";

/** StarterKit schema used for headless Markdown serialization. */
const COLLAB_SCHEMA = getSchema([
  StarterKit.configure({
    undoRedo: false,
    codeBlock: false,
    link: false,
    underline: false,
  }),
]);

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
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize the live Tiptap `default` fragment to Markdown, if present.
 * Uses prosemirror-markdown (no DOM) so this is safe on the Node server.
 */
export function yDocDefaultToMarkdown(doc: Y.Doc): string | null {
  if (!doc.share.has(COLLAB_FIELD)) return null;

  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  if (!json?.content?.length) return null;

  try {
    const node = COLLAB_SCHEMA.nodeFromJSON(json);
    return defaultMarkdownSerializer.serialize(node).trimEnd();
  } catch {
    return null;
  }
}

/**
 * Choose the best Markdown serialization for a `Y.Doc`.
 */
export function serializeDocToMarkdown(doc: Y.Doc): string {
  return yDocDefaultToMarkdown(doc) ?? yDocToMarkdown(doc);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Persist a `Y.Doc` to both `.md` and `.ydoc` on disk.
 */
export async function storeYDocSnapshot(id: string, doc: Y.Doc): Promise<void> {
  const mdPath = resolveDocPath(id);
  const ydocFilePath = ydocPath(id);

  // Trigger tombstone GC before snapshotting.
  if (doc.gc) {
    doc.gc = true;
  }

  const md = serializeDocToMarkdown(doc);
  await fs.writeFile(mdPath, md, "utf-8");

  markPersistenceWrite(id, md);

  const update = Y.encodeStateAsUpdate(doc);
  await fs.writeFile(ydocFilePath, Buffer.from(update));
}

/** Re-export for tests that use the section schema directly. */
export { markdownToYDoc };
