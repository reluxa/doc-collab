/**
 * Custom Next.js server that hosts Next.js, WebSocket, and a chokidar
 * file watcher on a single HTTP port.
 *
 * Usage:
 *   - Dev:  `npm run dev`  (uses `next dev` programmatically)
 *   - Prod: `npm start`    (uses `next` start programmatically)
 */

import http from "node:http";
import path from "node:path";

import { DOCS_ROOT, HOST, PORT } from "./src/lib/config";
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
    // Only watch .md files.
    ignored: /(^|\/)[^.]/,
  });

  watcher.on("change", async (filePath: string) => {
    // Extract document id from filename (strip .md extension).
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    const id = basename.slice(0, -3);

    // Compute current ETag for the changed file.
    const { readDocument } = await import("./src/lib/documents");
    try {
      const doc = await readDocument(id);
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
    broadcast({
      type: "doc-changed",
      id,
      version: "",
      origin: "server-watcher",
    });
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

  // Attach WebSocket server to the same HTTP server.
  setupWebSocketServer(server);

  // Start file watcher.
  await setupFileWatcher();

  server.listen(PORT, HOST, () => {
    console.log(
      `✓ Server ready at http://${HOST}:${PORT} (ws://${HOST}:${PORT}/ws)`,
    );
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
