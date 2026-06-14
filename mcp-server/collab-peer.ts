/**
 * MCP collaboration peer — connects to the shared Hocuspocus server as a
 * Yjs client so agent edits merge with concurrent human edits (Story 13).
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

import { HOST, PORT, WS_TOKEN } from "../src/lib/config";
import { COLLAB_WS_PATH } from "../src/lib/collab/constants";
import {
  applyCollabMarkdown,
  formatSectionMarkdown,
  readCollabMarkdown,
  readCollabSection,
  updateCollabSection,
} from "../src/lib/collab/agent-document";
import { AGENT_PRESENCE_COLOR } from "../src/lib/collab/constants";

const AGENT_NAME = "openclaw";
const CONNECT_TIMEOUT_MS = 15_000;

function collabWebSocketUrl(): string {
  return `ws://${HOST}:${PORT}${COLLAB_WS_PATH}?token=${encodeURIComponent(WS_TOKEN)}`;
}

function waitForSynced(provider: HocuspocusProvider): Promise<void> {
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
      reject(new Error(`Timed out connecting to collab document`));
    }, CONNECT_TIMEOUT_MS);
  });
}

function setAgentAwareness(
  provider: HocuspocusProvider,
  sectionId?: string,
): void {
  const awareness = provider.awareness;
  if (!awareness) return;

  awareness.setLocalState({
    user: { name: AGENT_NAME, color: AGENT_PRESENCE_COLOR },
    ...(sectionId ? { sectionId } : {}),
  });
}

async function withCollabDocument<T>(
  documentId: string,
  sectionId: string | undefined,
  run: (doc: Y.Doc, provider: HocuspocusProvider) => Promise<T>,
): Promise<T> {
  const doc = new Y.Doc({ gc: true });
  const provider = new HocuspocusProvider({
    url: collabWebSocketUrl(),
    name: documentId,
    document: doc,
    token: WS_TOKEN,
  });

  try {
    await waitForSynced(provider);
    setAgentAwareness(provider, sectionId);
    return await run(doc, provider);
  } finally {
    provider.destroy();
    doc.destroy();
  }
}

/** Read collaborative Markdown (live Y.Doc truth). */
export async function peerReadDocument(documentId: string): Promise<string> {
  return withCollabDocument(documentId, undefined, async (doc) => readCollabMarkdown(doc));
}

/** Apply a full-document Markdown update through the CRDT. */
export async function peerUpdateDocument(
  documentId: string,
  markdown: string,
): Promise<void> {
  await withCollabDocument(documentId, undefined, async (doc) => {
    applyCollabMarkdown(doc, markdown);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

/** Read a single section from the live document. */
export async function peerReadSection(
  documentId: string,
  sectionId: string,
): Promise<{ id: string; heading: string; body: string; markdown: string }> {
  return withCollabDocument(documentId, sectionId, async (doc) => {
    const section = readCollabSection(doc, sectionId);
    return {
      id: section.id,
      heading: section.heading,
      body: section.body,
      markdown: formatSectionMarkdown(section),
    };
  });
}

/** Update a single section through the CRDT. */
export async function peerUpdateSection(
  documentId: string,
  sectionId: string,
  content: string,
): Promise<void> {
  await withCollabDocument(documentId, sectionId, async (doc, provider) => {
    setAgentAwareness(provider, sectionId);
    updateCollabSection(doc, sectionId, content);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

/** Whether MCP tools should use the CRDT peer (default: on). */
export function isMcpCollabEnabled(): boolean {
  return process.env.MCP_COLLAB !== "0";
}
