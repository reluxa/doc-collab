/**
 * Integration tests for CRDT convergence via Hocuspocus (Story 12).
 *
 * Covers the constitution critical path: two peers editing the same document
 * converge to identical content without data loss.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as Y from "yjs";
import { Server } from "@hocuspocus/server";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { TiptapTransformer } from "@hocuspocus/transformer";

import { WS_TOKEN } from "@/lib/config";
import { COLLAB_FIELD } from "@/lib/collab/constants";

const DOC_NAME = "convergence-test-doc";

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
      reject(new Error("Timed out waiting for provider sync"));
    }, timeoutMs);
  });
}

function mergeDocumentContent(doc: Y.Doc, json: { type: string; content: unknown[] }): void {
  const patch = TiptapTransformer.toYdoc(json, COLLAB_FIELD);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(patch));
  patch.destroy();
}

function paragraphDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function mergeParagraph(doc: Y.Doc, text: string): void {
  mergeDocumentContent(doc, paragraphDoc(text));
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

function appendParagraph(doc: Y.Doc, text: string): void {
  const existing = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD) ?? {
    type: "doc",
    content: [],
  };
  const content = Array.isArray(existing.content) ? [...existing.content] : [];
  content.push({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  const patch = TiptapTransformer.toYdoc({ type: "doc", content }, COLLAB_FIELD);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(patch));
  patch.destroy();
}

function readPlainText(doc: Y.Doc): string {
  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  if (!json?.content?.length) return "";
  return json.content
    .map((block: { content?: Array<{ text?: string }> }) =>
      (block.content ?? []).map((node) => node.text ?? "").join(""),
    )
    .filter(Boolean)
    .join("\n");
}

describe("Hocuspocus CRDT convergence", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = new Server({
      port: 0,
      address: "127.0.0.1",
      quiet: true,
      stopOnSignals: false,
      async onAuthenticate(data) {
        if (data.token !== WS_TOKEN) throw new Error("Unauthorized");
      },
    });
    await server.listen();
    port = server.address.port;
  });

  afterAll(async () => {
    await server.destroy();
  });

  it(
    "merges concurrent edits from two providers into identical content",
    async () => {
      const url = `ws://127.0.0.1:${port}/?token=${encodeURIComponent(WS_TOKEN)}`;

      const docA = new Y.Doc({ gc: true });
      const docB = new Y.Doc({ gc: true });

      const providerA = new HocuspocusProvider({
        url,
        name: DOC_NAME,
        document: docA,
        token: WS_TOKEN,
      });
      const providerB = new HocuspocusProvider({
        url,
        name: DOC_NAME,
        document: docB,
        token: WS_TOKEN,
      });

      try {
        await Promise.all([waitForSynced(providerA), waitForSynced(providerB)]);

        mergeParagraph(docA, "Peer A paragraph");
        await new Promise((resolve) => setTimeout(resolve, 200));

        appendParagraph(docB, "Peer B paragraph");
        await new Promise((resolve) => setTimeout(resolve, 500));

        const textA = readPlainText(docA);
        const textB = readPlainText(docB);

        expect(textA).toContain("Peer A paragraph");
        expect(textA).toContain("Peer B paragraph");
        expect(textB).toBe(textA);
      } finally {
        providerA.destroy();
        providerB.destroy();
        docA.destroy();
        docB.destroy();
      }
    },
    30_000,
  );

  it(
    "merges edits in different sections without interference",
    async () => {
      const url = `ws://127.0.0.1:${port}/?token=${encodeURIComponent(WS_TOKEN)}`;
      const tag = `section-${Date.now()}`;
      const sectionABase = `Body A ${tag}`;
      const sectionBBase = `Body B ${tag}`;

      const docA = new Y.Doc({ gc: true });
      const docB = new Y.Doc({ gc: true });

      const providerA = new HocuspocusProvider({
        url,
        name: `${DOC_NAME}-sections`,
        document: docA,
        token: WS_TOKEN,
      });
      const providerB = new HocuspocusProvider({
        url,
        name: `${DOC_NAME}-sections`,
        document: docB,
        token: WS_TOKEN,
      });

      try {
        await Promise.all([waitForSynced(providerA), waitForSynced(providerB)]);

        mergeDocumentContent(docA, twoSectionDocument(sectionABase, sectionBBase));
        await new Promise((resolve) => setTimeout(resolve, 300));

        replaceParagraphAt(docA, 0, `${sectionABase} edited-by-A`);
        replaceParagraphAt(docB, 1, `${sectionBBase} edited-by-B`);
        await new Promise((resolve) => setTimeout(resolve, 500));

        const textA = readPlainText(docA);
        const textB = readPlainText(docB);

        expect(textA).toContain("edited-by-A");
        expect(textA).toContain("edited-by-B");
        expect(textA).toContain(sectionABase);
        expect(textA).toContain(sectionBBase);
        expect(textB).toBe(textA);
      } finally {
        providerA.destroy();
        providerB.destroy();
        docA.destroy();
        docB.destroy();
      }
    },
    30_000,
  );
});
