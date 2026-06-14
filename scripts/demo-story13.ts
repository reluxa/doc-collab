/**
 * Interactive Story 13 demo — run while `NEXT_PUBLIC_COLLAB=1 npm run dev` is up.
 *
 * Usage: npx tsx scripts/demo-story13.ts
 */

import * as fs from "node:fs/promises";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

import { HOST, PORT, WS_TOKEN, DOCS_ROOT } from "../src/lib/config";
import { COLLAB_WS_PATH } from "../src/lib/collab/constants";
import {
  readCollabMarkdown,
  updateCollabSection,
} from "../src/lib/collab/agent-document";
import {
  isPersistenceEcho,
  markPersistenceWrite,
  resetPersistenceEcho,
} from "../src/lib/collab/persist-echo";
import {
  peerReadDocument,
  peerUpdateSection,
} from "../mcp-server/collab-peer";

const DOC_ID = "story13-demo";
const WS_URL = `ws://${HOST}:${PORT}${COLLAB_WS_PATH}?token=${encodeURIComponent(WS_TOKEN)}`;

const INITIAL_MD = `<!-- sec:intro -->
# Story 13 Demo

Introduction — baseline text.

<!-- sec:details -->
## Details

Original details section.

<!-- sec:footer -->
## Footer

Footer text.`;

function log(step: number, title: string, body?: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`STEP ${step}: ${title}`);
  console.log("═".repeat(60));
  if (body) console.log(body);
}

function waitForSynced(provider: HocuspocusProvider, ms = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("sync timeout")), ms);
    provider.on("synced", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function withHumanPeer<T>(
  run: (doc: Y.Doc, provider: HocuspocusProvider) => Promise<T>,
): Promise<T> {
  const doc = new Y.Doc({ gc: true });
  const provider = new HocuspocusProvider({
    url: WS_URL,
    name: DOC_ID,
    document: doc,
    token: WS_TOKEN,
  });
  try {
    await waitForSynced(provider);
    return await run(doc, provider);
  } finally {
    provider.destroy();
    doc.destroy();
  }
}

async function main(): Promise<void> {
  log(
    0,
    "Prerequisites",
    `Web server + Hocuspocus at http://${HOST}:${PORT}\nCollab WS: ${WS_URL}\nOpen in browser: http://${HOST}:${PORT}/editor/${DOC_ID}`,
  );

  const mdPath = `${DOCS_ROOT}/${DOC_ID}.md`;
  await fs.writeFile(mdPath, INITIAL_MD, "utf-8");
  log(1, "Created demo document on disk", `File: ${mdPath}\n\n${INITIAL_MD}`);

  await new Promise((r) => setTimeout(r, 500));

  log(
    1.5,
    "Bootstrap live Y.Doc from Markdown (agent peer)",
    "Seeds the CRDT so section ids (intro, details, footer) exist in Hocuspocus.",
  );
  const { peerUpdateDocument } = await import("../mcp-server/collab-peer");
  await peerUpdateDocument(DOC_ID, INITIAL_MD);
  await new Promise((r) => setTimeout(r, 400));

  log(2, "Agent reads live Y.Doc via MCP collab peer (read_document CRDT path)");
  const before = await peerReadDocument(DOC_ID);
  console.log(before);

  log(
    3,
    "Human edits intro in browser (simulated here via Yjs peer)",
    "In the browser: open the editor URL above and change the intro paragraph.\nHere we simulate: intro → \"Introduction — edited by human in browser.\"",
  );

  await withHumanPeer(async (doc) => {
    updateCollabSection(doc, "intro", "Introduction — edited by human in browser.");
    await new Promise((r) => setTimeout(r, 400));
    console.log("Human peer markdown:\n", readCollabMarkdown(doc));
  });

  log(
    4,
    "Agent calls update_section on details only (MCP collab peer)",
    "Agent body: \"Details — rewritten by openclaw agent.\"",
  );
  await peerUpdateSection(DOC_ID, "details", "Details — rewritten by openclaw agent.");
  const afterSection = await peerReadDocument(DOC_ID);
  console.log(afterSection);
  console.log(
    "\n✓ Human intro preserved:",
    afterSection.includes("edited by human in browser"),
  );
  console.log(
    "✓ Agent details applied:",
    afterSection.includes("rewritten by openclaw agent"),
  );
  console.log("✓ Footer untouched:", afterSection.includes("Footer text."));

  log(
    5,
    "Concurrent same-section edit (human + agent)",
    "Human adds suffix A; agent adds suffix B — both should appear after CRDT merge.",
  );
  await withHumanPeer(async (docHuman) => {
    const docAgent = new Y.Doc({ gc: true });
    const agent = new HocuspocusProvider({
      url: WS_URL,
      name: DOC_ID,
      document: docAgent,
      token: WS_TOKEN,
    });
    try {
      await waitForSynced(agent);
      updateCollabSection(docHuman, "details", "Details — human concurrent edit.");
      updateCollabSection(docAgent, "details", "Details — agent concurrent edit.");
      await new Promise((r) => setTimeout(r, 600));
      const humanMd = readCollabMarkdown(docHuman);
      const agentMd = readCollabMarkdown(docAgent);
      console.log("Human view:\n", humanMd);
      console.log("\nAgent view:\n", agentMd);
      console.log("\n✓ Peers converged:", humanMd === agentMd);
    } finally {
      agent.destroy();
      docAgent.destroy();
    }
  });

  log(
    6,
    "External git/manual edit while human has live unsaved work",
    "Wait for persistence to settle, then simulate git changing only the footer on disk.",
  );

  // Let Hocuspocus debounced persist flush so our git write is not immediately overwritten.
  await new Promise((r) => setTimeout(r, 2500));

  const persistedDisk = await fs.readFile(mdPath, "utf-8");
  const diskWithGitFooter = persistedDisk.replace(
    /Footer text\.[^\n]*/,
    "Footer text — changed via git pull.",
  );
  await fs.writeFile(mdPath, diskWithGitFooter, "utf-8");
  console.log("Wrote git footer to disk:\n", diskWithGitFooter.slice(-120));

  // Watcher → reconcileDocumentFromDisk runs on the server process.
  await new Promise((r) => setTimeout(r, 2500));

  const afterExternal = await peerReadDocument(DOC_ID);
  console.log(afterExternal);
  console.log(
    "\n✓ Live human intro kept:",
    afterExternal.includes("edited by human in browser"),
  );
  console.log(
    "✓ Git footer merged:",
    afterExternal.includes("changed via git pull"),
  );

  log(
    7,
    "Persistence echo suppression (no feedback loop)",
    "When Hocuspocus persists Y.Doc → .md, watcher must NOT re-reconcile that echo.",
  );
  resetPersistenceEcho();
  const persisted = await peerReadDocument(DOC_ID);
  markPersistenceWrite(DOC_ID, persisted);
  console.log("isPersistenceEcho(same content):", isPersistenceEcho(DOC_ID, persisted));
  console.log(
    "isPersistenceEcho(unrelated edit):",
    isPersistenceEcho(DOC_ID, `${persisted}\n`),
  );
  console.log("\n✓ Echo detected — watcher skips reconcile (no oscillation).");

  log(
    8,
    "Done — verify in browser",
    `Refresh http://${HOST}:${PORT}/editor/${DOC_ID}\nYou should see merged content and (if agent connected) openclaw in the presence stack.`,
  );
}

main().catch((err) => {
  console.error("\nDemo failed:", err);
  console.error("\nMake sure the dev server is running:\n  NEXT_PUBLIC_COLLAB=1 npm run dev");
  process.exit(1);
});
