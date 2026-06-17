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
import { yDocToMarkdown, markdownToYDoc, getSectionsFromDoc } from "./md-bridge";
import { COLLAB_FIELD } from "./constants";
import { markPersistenceWrite } from "./persist-echo";
import { createVersion } from "./versioning";
import { takeDirtySections } from "./section-dirty";
import {
  normalizeMarkdownForCompare,
  replaceSectionsInMarkdown,
} from "./sections";

/** StarterKit schema used for headless Markdown serialization. */
const COLLAB_SCHEMA = getSchema([
  StarterKit.configure({
    undoRedo: false,
    codeBlock: false,
    link: false,
    underline: false,
  }),
]);

type TiptapJsonNode = {
  type?: string;
  attrs?: { level?: number };
  text?: string;
  content?: TiptapJsonNode[];
};

function inlineText(node: TiptapJsonNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(inlineText).join("");
}

function listItemText(node: TiptapJsonNode): string {
  return (node.content ?? [])
    .map((child) => (child.type === "paragraph" ? inlineText(child) : inlineText(child)))
    .filter(Boolean)
    .join("\n");
}

/** Fallback when prosemirror-markdown cannot serialize lists from Tiptap JSON. */
export function tiptapDocJsonToMarkdown(json: TiptapJsonNode): string {
  const lines: string[] = [];
  for (const block of json.content ?? []) {
    if (block.type === "heading") {
      const level = block.attrs?.level ?? 1;
      lines.push(`${"#".repeat(level)} ${inlineText(block)}`, "");
    } else if (block.type === "paragraph") {
      const text = inlineText(block);
      if (text) lines.push(text, "");
    } else if (block.type === "bulletList") {
      for (const item of block.content ?? []) {
        if (item.type === "listItem") lines.push(`- ${listItemText(item)}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

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
    return tiptapDocJsonToMarkdown(json);
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

  // Trigger tombstone GC before snapshotting (Story 14 — bound CRDT memory).
  if (doc.gc) {
    doc.gc = true;
  }

  let diskMd: string | null = null;
  try {
    diskMd = await fs.readFile(mdPath, "utf-8");
  } catch {
    // New document — no on-disk baseline yet.
  }

  const dirtyIds = takeDirtySections(doc);
  const canIncremental =
    diskMd !== null &&
    dirtyIds.length > 0 &&
    !doc.share.has(COLLAB_FIELD);

  const serialized = serializeDocToMarkdown(doc);
  const contentUnchanged =
    diskMd !== null &&
    normalizeMarkdownForCompare(diskMd) ===
      normalizeMarkdownForCompare(serialized);

  if (!contentUnchanged) {
    let md: string;
    if (canIncremental) {
      const replacements = getSectionsFromDoc(doc).filter((s) =>
        dirtyIds.includes(s.id),
      );
      md = replaceSectionsInMarkdown(diskMd!, replacements);
      if (process.env.PERSIST_LOG === "1") {
        console.log(
          `[persist] incremental ${id}: ${dirtyIds.length} section(s) [${dirtyIds.join(", ")}]`,
        );
      }
    } else {
      md = serialized;
    }

    await fs.writeFile(mdPath, md, "utf-8");
    markPersistenceWrite(id, md);

    // Create a version snapshot after persist (user-save trigger).
    try {
      await createVersion(id, {
        trigger: "user-save",
        author: "human",
        doc,
        markdown: md,
      });
    } catch {
      // Versioning is best-effort — never fail a persist because of it.
    }
  }

  const update = Y.encodeStateAsUpdate(doc);
  await fs.writeFile(ydocFilePath, Buffer.from(update));
}

/** Re-export for tests that use the section schema directly. */
export { markdownToYDoc };
