/**
 * Chokidar watcher that notifies the connected MCP agent of document changes
 * made by the web app or other processes.
 *
 * - Content changes → `notifications/resources/updated` (for subscribed resources)
 * - Document create/delete → `notifications/resources/list_changed`
 *
 * Uses the same `DOCS_ROOT` as the web server so changes from either side
 * are detected immediately.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import path from "node:path";

import { DOCS_ROOT } from "../src/lib/config";

// ---------------------------------------------------------------------------
// Watcher setup
// ---------------------------------------------------------------------------

/**
 * Start a chokidar watcher over DOCS_ROOT and send MCP resource
 * notifications to the connected agent on changes.
 */
export function setupAgentNotifier(server: McpServer): void {
  // chokidar is imported lazily so the MCP server boot stays fast.
  void (async () => {
    const chokidar = (await import("chokidar")).default;

    const watcher = chokidar.watch(DOCS_ROOT, {
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50,
      },
      // Ignore hidden files/directories; .md filter is in callbacks.
      ignored: [/^\./, /\/\./],
    });

    watcher.on("change", (filePath: string) => {
      const id = extractDocId(filePath);
      if (!id) return;

      // Content changed — notify subscriber that the resource was updated.
      void server.server.sendResourceUpdated({ uri: `doc://${id}` });
    });

    watcher.on("add", (filePath: string) => {
      const id = extractDocId(filePath);
      if (!id) return;

      // New document — the resource list changed.
      void server.server.sendResourceListChanged();
    });

    watcher.on("unlink", (filePath: string) => {
      const id = extractDocId(filePath);
      if (!id) return;

      // Document deleted — the resource list changed.
      void server.server.sendResourceListChanged();
    });
  })();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a document id from a full file path (strip dir and .md extension).
 * Returns null if the file is not a .md file.
 */
function extractDocId(filePath: string): string | null {
  const basename = path.basename(filePath);
  if (!basename.endsWith(".md")) return null;
  return basename.slice(0, -3);
}
