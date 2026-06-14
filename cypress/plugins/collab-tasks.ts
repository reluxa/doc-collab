/**
 * Node-side Hocuspocus client helpers for collaborative editing E2E tests.
 *
 * Cypress cannot drive multiple browser tabs reliably, so a second peer is
 * simulated here via @hocuspocus/provider while the spec exercises the UI.
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { TiptapTransformer } from "@hocuspocus/transformer";
import type Cypress from "cypress";

import { COLLAB_FIELD } from "../../src/lib/collab/constants";
import { peerUpdateDocument } from "../../mcp-server/collab-peer";
import { createDocument } from "../../src/lib/documents";

const DEFAULT_WS_TOKEN = "dev-token-7f3a9b2c1d4e5f6a8b9c0d1e2f3a4b5c";

interface CollabTaskOptions {
  documentId: string;
  baseUrl?: string;
  token?: string;
}

interface CollabSetContentOptions extends CollabTaskOptions {
  text: string;
}

interface CollabAppendParagraphOptions extends CollabTaskOptions {
  text: string;
}

interface CollabReplaceParagraphOptions extends CollabTaskOptions {
  /** Zero-based index among top-level `paragraph` blocks in the document. */
  paragraphIndex: number;
  text: string;
}

interface CollabTwoSectionOptions extends CollabTaskOptions {
  sectionABody: string;
  sectionBBody: string;
}

interface McpUpdateDocumentOptions extends CollabTaskOptions {
  markdown: string;
}

interface McpCreateDocumentOptions {
  name: string;
  content: string;
}

function wsToken(): string {
  return process.env.WS_TOKEN ?? DEFAULT_WS_TOKEN;
}

function collabWsUrl(baseUrl: string, token: string): string {
  const wsBase = baseUrl.replace(/^http/i, "ws");
  return `${wsBase}/ws/collab?token=${encodeURIComponent(token)}`;
}

function waitForSynced(provider: HocuspocusProvider, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }

    const onSynced = () => {
      clearTimeout(timer);
      provider.off("synced", onSynced);
      resolve();
    };

    provider.on("synced", onSynced);

    const timer = setTimeout(() => {
      provider.off("synced", onSynced);
      reject(new Error("Timed out waiting for Hocuspocus provider to sync"));
    }, timeoutMs);
  });
}

async function withCollabProvider<T>(
  { documentId, baseUrl = "http://127.0.0.1:3000", token = wsToken() }: CollabTaskOptions,
  run: (provider: HocuspocusProvider, doc: Y.Doc) => Promise<T>,
): Promise<T> {
  const doc = new Y.Doc({ gc: true });
  const provider = new HocuspocusProvider({
    url: collabWsUrl(baseUrl, token),
    name: documentId,
    document: doc,
    token,
  });

  try {
    await waitForSynced(provider);
    return await run(provider, doc);
  } finally {
    provider.destroy();
    doc.destroy();
  }
}

function prosemirrorJsonToPlainText(json: {
  content?: Array<{ content?: Array<{ text?: string }> }>;
}): string {
  if (!json?.content?.length) return "";
  return json.content
    .map((block) => (block.content ?? []).map((node) => node.text ?? "").join(""))
    .filter(Boolean)
    .join("\n");
}

function paragraphDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function mergeDocumentContent(
  target: Y.Doc,
  json: { type: string; content: unknown[] },
): void {
  const patch = TiptapTransformer.toYdoc(json, COLLAB_FIELD);
  Y.applyUpdate(target, Y.encodeStateAsUpdate(patch));
  patch.destroy();
}

function replaceParagraphAt(doc: Y.Doc, paragraphIndex: number, text: string): void {
  const existing = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD) ?? {
    type: "doc",
    content: [],
  };
  const content = Array.isArray(existing.content) ? [...existing.content] : [];
  let paragraphCount = 0;
  for (let i = 0; i < content.length; i += 1) {
    const block = content[i] as { type?: string };
    if (block.type !== "paragraph") continue;
    if (paragraphCount === paragraphIndex) {
      content[i] = { type: "paragraph", content: [{ type: "text", text }] };
      mergeDocumentContent(doc, { type: "doc", content });
      return;
    }
    paragraphCount += 1;
  }
  throw new Error(`Paragraph index ${paragraphIndex} not found`);
}

function twoSectionDocument(sectionABody: string, sectionBBody: string) {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Section A" }] },
      { type: "paragraph", content: [{ type: "text", text: sectionABody }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section B" }] },
      { type: "paragraph", content: [{ type: "text", text: sectionBBody }] },
    ],
  };
}

export function registerCollabTasks(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions): void {
  const baseUrl = config.baseUrl ?? "http://127.0.0.1:3000";

  on("task", {
    collabSetContent({ documentId, text, token }: CollabSetContentOptions) {
      return withCollabProvider({ documentId, baseUrl, token }, async (_provider, doc) => {
        mergeDocumentContent(doc, paragraphDoc(text));
        await new Promise((resolve) => setTimeout(resolve, 300));
        return null;
      });
    },

    collabAppendParagraph({ documentId, text, token }: CollabAppendParagraphOptions) {
      return withCollabProvider({ documentId, baseUrl, token }, async (_provider, doc) => {
        const existing = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD) ?? {
          type: "doc",
          content: [],
        };
        const content = Array.isArray(existing.content) ? [...existing.content] : [];
        content.push({
          type: "paragraph",
          content: [{ type: "text", text }],
        });
        mergeDocumentContent(doc, { type: "doc", content });
        await new Promise((resolve) => setTimeout(resolve, 300));
        return null;
      });
    },

    collabReadPlainText({ documentId, token }: CollabTaskOptions) {
      return withCollabProvider({ documentId, baseUrl, token }, async (_provider, doc) => {
        const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
        return prosemirrorJsonToPlainText(json);
      });
    },

    collabReplaceParagraphAt({
      documentId,
      paragraphIndex,
      text,
      token,
    }: CollabReplaceParagraphOptions) {
      return withCollabProvider({ documentId, baseUrl, token }, async (_provider, doc) => {
        replaceParagraphAt(doc, paragraphIndex, text);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return null;
      });
    },

    collabSetTwoSectionDocument({
      documentId,
      sectionABody,
      sectionBBody,
      token,
    }: CollabTwoSectionOptions) {
      return withCollabProvider({ documentId, baseUrl, token }, async (_provider, doc) => {
        mergeDocumentContent(doc, twoSectionDocument(sectionABody, sectionBBody));
        await new Promise((resolve) => setTimeout(resolve, 300));
        return null;
      });
    },

    /** Same code path as MCP `update_document` / `peerUpdateDocument` (Story 13). */
    mcpUpdateDocument({ documentId, markdown }: McpUpdateDocumentOptions) {
      process.env.MCP_COLLAB = "1";
      return peerUpdateDocument(documentId, markdown).then(() => null);
    },

    /** Same code path as MCP `create_document` (disk + CRDT peer). */
    mcpCreateDocument({ name, content }: McpCreateDocumentOptions) {
      process.env.MCP_COLLAB = "1";
      return createDocument(name, content)
        .then(async () => {
          await peerUpdateDocument(name, content);
        })
        .then(() => null);
    },
  });
}
