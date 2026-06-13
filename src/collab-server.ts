/**
 * Standalone Hocuspocus collaboration server.
 *
 * Listens on its own port (default 1235) for Yjs WebSocket connections.
 * Each document gets its own Y.Doc with persistence to .md + .ydoc.
 *
 * Usage:
 *   - Dev:  `npm run dev:collab`
 *   - Prod: `npm run start:collab`
 *
 * Auth: connections require the same `WS_TOKEN` as the main server.
 */

import { Server } from "@hocuspocus/server";
import type {
  onConnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
  onDisconnectPayload,
} from "@hocuspocus/server";

import { WS_TOKEN, COLLAB_PORT } from "./lib/config";
import { loadYDocSnapshot, storeYDocSnapshot } from "./lib/collab/persistence";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const server = new Server({
  port: COLLAB_PORT,
  // Debounce: 400ms after last change, max 30s between saves.
  debounce: 400,
  maxDebounce: 30_000,

  // Authenticate with WS_TOKEN.
  async onConnect(data: onConnectPayload) {
    const url = new URL(data.request.url);
    const token = url.searchParams.get("token");
    if (!token || token !== WS_TOKEN) {
      throw new Error("Unauthorized");
    }
    return data;
  },

  // Load existing Y.Doc from .ydoc snapshot.
  async onLoadDocument(data: onLoadDocumentPayload) {
    const snapshot = await loadYDocSnapshot(data.documentName);
    if (snapshot) {
      const { applyUpdate } = await import("yjs");
      applyUpdate(data.document, snapshot);
    }
    return data;
  },

  // Persist Y.Doc to .md + .ydoc.
  async onStoreDocument(data: onStoreDocumentPayload) {
    await storeYDocSnapshot(data.documentName, data.document);
    return data;
  },

  // Flush on disconnect to avoid data loss.
  async onDisconnect(data: onDisconnectPayload) {
    await storeYDocSnapshot(data.documentName, data.document);
    return data;
  },
});

server.listen();
