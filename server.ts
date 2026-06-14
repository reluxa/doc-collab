/**
 * Custom Next.js server that hosts Next.js, WebSocket, and a chokidar
 * file watcher on a single HTTP port.
 *
 * Usage:
 *   - Dev:  `npm run dev`  (uses `next dev` programmatically)
 *   - Prod: `npm start`    (uses `next` start programmatically)
 */

import http from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import path from "node:path";

import { DOCS_ROOT, HOST, PORT } from "./src/lib/config";
import { invalidateDocumentListCache } from "./src/lib/document-list-cache";
import { setupHocuspocusCollab } from "./src/lib/collab/hocuspocus";
import { setupWebSocketServer, broadcast, type DocChangedEvent } from "./src/lib/realtime";

// ---------------------------------------------------------------------------
// Chokidar file watcher
// ---------------------------------------------------------------------------

async function setupFileWatcher(): Promise<void> {
  const chokidar = (await import("chokidar")).default;

  const watcher = chokidar.watch(DOCS_ROOT, {
    // Wait for writes to complete before emitting events (avoids partial reads).
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
    // Ignore hidden files/directories; .md filter is in callbacks.
    ignored: [/^\./, /\/\./],
  });

  watcher.on("change", async (filePath: string) => {
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    const id = basename.slice(0, -3);

    invalidateDocumentListCache();

    const { readDocument } = await import("./src/lib/documents");
    const { reconcileDocumentFromDisk } = await import(
      "./src/lib/collab/reconcile-external"
    );
    const { isPersistenceEcho } = await import("./src/lib/collab/persist-echo");
    const { isApiWriteEcho } = await import("./src/lib/api-write-echo");

    try {
      const doc = await readDocument(id);

      if (isPersistenceEcho(id, doc.content) || isApiWriteEcho(id, doc.etag)) {
        // Own save echo — skip reconcile and WS broadcast (Phase 1 auto-save loop).
        return;
      }

      await reconcileDocumentFromDisk(id, doc.content);

      const event: DocChangedEvent = {
        type: "doc-changed",
        id,
        version: doc.etag,
        origin: "server-watcher",
      };
      broadcast(event);
    } catch {
      // Document may have been deleted; skip.
    }
  });

  watcher.on("add", async (filePath: string) => {
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    const id = basename.slice(0, -3);
    invalidateDocumentListCache();
    const { readDocument } = await import("./src/lib/documents");
    try {
      const doc = await readDocument(id);
      broadcast({
        type: "doc-changed",
        id,
        version: doc.etag,
        origin: "server-watcher",
      });
    } catch {
      // Ignore.
    }
  });

  watcher.on("unlink", (filePath: string) => {
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    const id = basename.slice(0, -3);
    invalidateDocumentListCache();
    broadcast({
      type: "doc-changed",
      id,
      version: "",
      origin: "server-watcher",
    });
  });
}

// ---------------------------------------------------------------------------
// Next.js dev HMR (Turbopack/Webpack)
// ---------------------------------------------------------------------------

/**
 * Forward `/_next/webpack-hmr` upgrades to Next.js.
 * Required when using a custom HTTP server alongside our own WebSocket paths.
 */
function setupNextDevUpgradeHandler(
  httpServer: http.Server,
  upgradeHandler: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => Promise<void>,
): void {
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url ?? "/",
      `http://${request.headers.host}`,
    ).pathname;
    if (!pathname.startsWith("/_next/webpack-hmr")) return;
    void upgradeHandler(request, socket, head);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const next = await import("next");

  const dev = process.argv.includes("--dev") || process.env.NODE_ENV !== "production";
  const app = next.default({ dev });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  // Attach WebSocket servers to the same HTTP server.
  setupWebSocketServer(server);
  setupHocuspocusCollab(server);
  if (dev) {
    setupNextDevUpgradeHandler(server, app.getUpgradeHandler());
  }

  // Start file watcher.
  await setupFileWatcher();

  server.listen(PORT, HOST, () => {
    console.log(
      `✓ Server ready at http://${HOST}:${PORT} (ws://${HOST}:${PORT}/ws, collab ws://${HOST}:${PORT}/ws/collab)`,
    );
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
