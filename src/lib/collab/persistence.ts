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
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import StarterKit from "@tiptap/starter-kit";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import type { MarkdownSerializerState } from "prosemirror-markdown";

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

/** Schema used for headless Markdown serialization. Includes table extensions. */
const COLLAB_SCHEMA = getSchema([
  StarterKit.configure({
    undoRedo: false,
    codeBlock: false,
    link: false,
    underline: false,
  }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
]);

type TiptapJsonNode = {
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attrs?: Record<string, any>;
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

/** Render table as GFM markdown. */
function renderTableAsMarkdown(tableNode: TiptapJsonNode): string {
  const rows = tableNode.content ?? [];
  if (rows.length === 0) return "";

  const lines: string[] = [];
  // Determine column count from first row.
  const firstRow = rows[0];
  const firstRowCells = firstRow.content ?? [];
  const numCols = Math.max(firstRowCells.length, 1);

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const cells = row.content ?? [];
    const cellTexts: string[] = [];
    for (let ci = 0; ci < numCols; ci++) {
      const cell = cells[ci];
      if (cell) {
        cellTexts.push(inlineText(cell).replace(/\n/g, " "));
      } else {
        cellTexts.push("");
      }
    }
    lines.push(`| ${cellTexts.join(" | ")} |`);

    // After header row, add separator row.
    if (ri === 0) {
      const sep = numCols > 0 ? `|${Array(numCols).fill("---").join("|")}|` : "";
      lines.push(sep);
    }
  }

  return lines.join("\n");
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
    } else if (block.type === "table") {
      lines.push(renderTableAsMarkdown(block), "");
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
// ---------------------------------------------------------------------------
// Table serializers for prosemirror-markdown
// ---------------------------------------------------------------------------

/**
 * Register table serializers on the defaultMarkdownSerializer.
 */
function registerTableSerializers(): void {
  if ((defaultMarkdownSerializer.nodes as Record<string, unknown>)["table"]) return;

  (defaultMarkdownSerializer.nodes as Record<string, unknown>)["table"] = (
    state: MarkdownSerializerState,
    node: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      childCount: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      child: (i: number) => any;
    },
  ) => {
    state.write("\n\n");
    state.flushClose();
    const rows: string[] = [];
    let numCols = 0;

    for (let i = 0; i < node.childCount; i++) {
      const row = node.child(i);
      const cells: string[] = [];
      for (let j = 0; j < row.childCount; j++) {
        const cell = row.child(j);
        const text = state.serializeNodeInner(cell, j);
        cells.push(text.trim().replace(/\n/g, " "));
      }
      if (i === 0) numCols = cells.length;
      // Pad shorter rows.
      while (cells.length < numCols) cells.push("");
      rows.push(`| ${cells.join(" | ")} |`);

      if (i === 0 && numCols > 0) {
        rows.push(`|${Array(numCols).fill("---").join("|")}|`);
      }
    }

    state.write(rows.join("\n"));
    state.closeBlock(node);
  };

  // Table row/cell/header nodes are rendered inline via open/close.
  (defaultMarkdownSerializer.nodes as Record<string, unknown>)["table_row"] = (
    _state: MarkdownSerializerState,
    _node: unknown,
  ) => {
    // Handled by "table" node above.
  };

  (defaultMarkdownSerializer.nodes as Record<string, unknown>)["table_cell"] = (
    _state: MarkdownSerializerState,
    _node: unknown,
  ) => {
    // Handled by "table" node above.
  };

  (defaultMarkdownSerializer.nodes as Record<string, unknown>)["table_header"] = (
    _state: MarkdownSerializerState,
    _node: unknown,
  ) => {
    // Handled by "table" node above.
  };
}

registerTableSerializers();

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
