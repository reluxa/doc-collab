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

function mergeDocumentContent(target: Y.Doc, json: ReturnType<typeof paragraphDoc>): void {
  const patch = TiptapTransformer.toYdoc(json, COLLAB_FIELD);
  Y.applyUpdate(target, Y.encodeStateAsUpdate(patch));
  patch.destroy();
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
  });
}
