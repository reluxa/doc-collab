/**
 * Standalone Hocuspocus collaboration server (dev convenience).
 *
 * Prefer `npm run dev` which attaches Hocuspocus to the main server at
 * `/ws/collab`. This entrypoint remains for isolated collab debugging.
 */

import { Server } from "@hocuspocus/server";
import type {
  onAuthenticatePayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from "@hocuspocus/server";
import * as Y from "yjs";

import { WS_TOKEN, COLLAB_PORT } from "./lib/config";
import { loadYDocSnapshot, storeYDocSnapshot } from "./lib/collab/persistence";

const server = new Server({
  port: COLLAB_PORT,
  debounce: 400,
  maxDebounce: 30_000,

  async onAuthenticate(data: onAuthenticatePayload) {
    if (!data.token || data.token !== WS_TOKEN) {
      throw new Error("Unauthorized");
    }
  },

  async onLoadDocument(data: onLoadDocumentPayload) {
    const snapshot = await loadYDocSnapshot(data.documentName);
    if (snapshot) {
      Y.applyUpdate(data.document, snapshot);
    }
  },

  async onStoreDocument(data: onStoreDocumentPayload) {
    await storeYDocSnapshot(data.documentName, data.document);
  },

  async onDisconnect(data: onDisconnectPayload) {
    await storeYDocSnapshot(data.documentName, data.document);
  },
});

server.listen();
