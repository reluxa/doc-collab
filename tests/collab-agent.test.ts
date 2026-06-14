/**
 * Story 13 — agent CRDT peer, section tools, external reconciliation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as Y from "yjs";
import { Server } from "@hocuspocus/server";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { TiptapTransformer } from "@hocuspocus/transformer";

import { WS_TOKEN } from "@/lib/config";
import { COLLAB_FIELD } from "@/lib/collab/constants";
import {
  applyCollabMarkdown,
  mergeExternalMarkdown,
  readCollabMarkdown,
  readCollabSection,
  reconcileExternalMarkdownIntoDoc,
  updateCollabSection,
} from "@/lib/collab/agent-document";
import { markdownToYDoc } from "@/lib/collab/md-bridge";
import {
  isPersistenceEcho,
  markPersistenceWrite,
  resetPersistenceEcho,
} from "@/lib/collab/persist-echo";

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
  mergeDocumentContent(doc, { type: "doc", content });
}

function mergeDefaultMarkdown(doc: Y.Doc, markdown: string): void {
  applyCollabMarkdown(doc, markdown);
}

function readDefaultPlainText(doc: Y.Doc): string {
  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  if (!json?.content?.length) return "";
  return json.content
    .map((block: { content?: Array<{ text?: string }> }) =>
      (block.content ?? []).map((node) => node.text ?? "").join(""),
    )
    .filter(Boolean)
    .join("\n");
}

const SECTION_DOC = `<!-- sec:sec1 -->
# Intro

Human intro body

<!-- sec:sec2 -->
## Details

Original details

<!-- sec:sec3 -->
## Footer

Footer text`;

describe("Story 13 — persistence echo suppression", () => {
  beforeEach(() => {
    resetPersistenceEcho();
  });

  it("treats recent persistence writes as echoes", () => {
    const md = "# Hello\n\nWorld";
    markPersistenceWrite("doc-a", md);
    expect(isPersistenceEcho("doc-a", md)).toBe(true);
    expect(isPersistenceEcho("doc-a", "# Other")).toBe(false);
  });
});

describe("Story 13 — external markdown merge", () => {
  it("applies disk-only section changes when live section unchanged", () => {
    const persisted = SECTION_DOC;
    const live = persisted.replace("Human intro body", "Human intro body (edited live)");
    const disk = persisted.replace("Original details", "Git-updated details");

    const merged = mergeExternalMarkdown(live, disk, persisted);
    expect(merged).toContain("Human intro body (edited live)");
    expect(merged).toContain("Git-updated details");
    expect(merged).not.toContain("Original details");
  });

  it("preserves live edits when disk section unchanged", () => {
    const persisted = SECTION_DOC;
    const live = persisted.replace("Footer text", "Live footer edit");
    const disk = persisted;

    const merged = mergeExternalMarkdown(live, disk, persisted);
    expect(merged).toContain("Live footer edit");
  });

  it("reconciles external disk changes into a live Y.Doc", () => {
    const doc = new Y.Doc({ gc: true });
    applyCollabMarkdown(doc, SECTION_DOC);
    markPersistenceWrite("merge-doc", SECTION_DOC);

    const diskEdit = SECTION_DOC.replace("Original details", "External git edit");
    reconcileExternalMarkdownIntoDoc(doc, "merge-doc", diskEdit);

    const result = readCollabMarkdown(doc);
    expect(result).toContain("External git edit");
    expect(result).toContain("Human intro body");
    doc.destroy();
  });
});

describe("Story 13 — section-scoped agent updates", () => {
  it("updateCollabSection changes only the target section", () => {
    const doc = new Y.Doc({ gc: true });
    applyCollabMarkdown(doc, SECTION_DOC);

    updateCollabSection(doc, "sec2", "Agent replaced details only");

    const markdown = readCollabMarkdown(doc);
    expect(markdown).toContain("Agent replaced details only");
    expect(markdown).toContain("Human intro body");
    expect(markdown).toContain("Footer text");
    expect(markdown).not.toContain("Original details");

    const section = readCollabSection(doc, "sec2");
    expect(section.body).toBe("Agent replaced details only");
    doc.destroy();
  });
});

describe("Story 13 — agent + human CRDT convergence", () => {
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
    "merges concurrent agent and human edits in the same section",
    async () => {
      const url = `ws://127.0.0.1:${port}/?token=${encodeURIComponent(WS_TOKEN)}`;
      const docHuman = new Y.Doc({ gc: true });
      const docAgent = new Y.Doc({ gc: true });

      const human = new HocuspocusProvider({
        url,
        name: "agent-human-same-section",
        document: docHuman,
        token: WS_TOKEN,
      });
      const agent = new HocuspocusProvider({
        url,
        name: "agent-human-same-section",
        document: docAgent,
        token: WS_TOKEN,
      });

      try {
        await Promise.all([waitForSynced(human), waitForSynced(agent)]);

        mergeParagraph(docHuman, "Baseline paragraph");
        await new Promise((resolve) => setTimeout(resolve, 300));

        mergeParagraph(docHuman, "Baseline paragraph — human added text");
        appendParagraph(docAgent, " and agent suffix");
        await new Promise((resolve) => setTimeout(resolve, 500));

        const humanText = readDefaultPlainText(docHuman);
        const agentText = readDefaultPlainText(docAgent);

        expect(humanText).toContain("human added text");
        expect(humanText).toContain("agent suffix");
        expect(agentText).toBe(humanText);
      } finally {
        human.destroy();
        agent.destroy();
        docHuman.destroy();
        docAgent.destroy();
      }
    },
    30_000,
  );

  it(
    "agent update_section preserves concurrent human edits in other sections",
    async () => {
      const url = `ws://127.0.0.1:${port}/?token=${encodeURIComponent(WS_TOKEN)}`;
      const docHuman = new Y.Doc({ gc: true });
      const docAgent = new Y.Doc({ gc: true });

      const human = new HocuspocusProvider({
        url,
        name: "agent-section-isolation",
        document: docHuman,
        token: WS_TOKEN,
      });
      const agent = new HocuspocusProvider({
        url,
        name: "agent-section-isolation",
        document: docAgent,
        token: WS_TOKEN,
      });

      try {
        await Promise.all([waitForSynced(human), waitForSynced(agent)]);

        mergeDefaultMarkdown(docHuman, SECTION_DOC);
        await new Promise((resolve) => setTimeout(resolve, 300));

        updateCollabSection(docHuman, "sec1", "Human rewrote intro");
        updateCollabSection(docAgent, "sec2", "Agent rewrote details");

        await new Promise((resolve) => setTimeout(resolve, 500));

        const humanMd = readCollabMarkdown(docHuman);
        const agentMd = readCollabMarkdown(docAgent);

        expect(humanMd).toContain("Human rewrote intro");
        expect(humanMd).toContain("Agent rewrote details");
        expect(agentMd).toBe(humanMd);
      } finally {
        human.destroy();
        agent.destroy();
        docHuman.destroy();
        docAgent.destroy();
      }
    },
    30_000,
  );
});

describe("Story 13 — no persistence reconciliation feedback loop", () => {
  beforeEach(() => {
    resetPersistenceEcho();
  });

  it("does not flag unrelated disk content as a persistence echo", () => {
    markPersistenceWrite("loop-doc", SECTION_DOC);
    expect(isPersistenceEcho("loop-doc", SECTION_DOC)).toBe(true);
    expect(isPersistenceEcho("loop-doc", `${SECTION_DOC}\n`)).toBe(false);
  });

  it("mergeExternalMarkdown keeps live edits when disk matches persisted baseline", () => {
    const persisted = SECTION_DOC;
    const live = persisted.replace("Footer text", "Unpersisted live footer");
    const merged = mergeExternalMarkdown(live, persisted, persisted);
    expect(merged).toContain("Unpersisted live footer");
  });

  it("applyCollabMarkdown is a no-op when markdown matches live doc", () => {
    const doc = markdownToYDoc(SECTION_DOC);
    const changed = applyCollabMarkdown(doc, SECTION_DOC);
    expect(changed).toBe(0);
    doc.destroy();
  });

  it("applyCollabMarkdown updates Tiptap default fragment with bullet lists", () => {
    const doc = new Y.Doc({ gc: true });
    mergeParagraph(doc, "Before");

    const withList = `# OpenClaw Test

## Purpose

Body text.

## Next steps

- Item one
- Item two
`;

    applyCollabMarkdown(doc, withList);
    const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
    const types = (json?.content ?? []).map((b: { type: string }) => b.type);
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    doc.destroy();
  });

  it("reconcileExternalMarkdownIntoDoc skips when disk matches live", () => {
    const doc = markdownToYDoc(SECTION_DOC);
    markPersistenceWrite("noop-doc", SECTION_DOC);
    const changed = reconcileExternalMarkdownIntoDoc(doc, "noop-doc", SECTION_DOC);
    expect(changed).toBe(0);
    doc.destroy();
  });
});
