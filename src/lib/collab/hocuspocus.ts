/**
 * Hocuspocus collaboration server attached to the main HTTP server.
 *
 * Handles Yjs WebSocket connections at `/ws/collab` on the same origin/port
 * as Phase 1 notifications (`/ws`). Reuses `WS_TOKEN` auth from §7.6.
 */

import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import crossws from "crossws/adapters/node";
import {
  Hocuspocus,
  type onAuthenticatePayload,
  type onConnectPayload,
  type onDisconnectPayload,
  type onLoadDocumentPayload,
  type onStoreDocumentPayload,
  type WebSocketLike,
} from "@hocuspocus/server";
import * as Y from "yjs";

import { WS_TOKEN } from "../config";
import {
  loadYDocSnapshot,
  storeYDocSnapshot,
} from "./persistence";
import {
  startPeriodicVersionTimer,
  stopPeriodicVersionTimer,
} from "./versioning";

/** HTTP upgrade listener target (Node `http.Server`). */
type HttpServer = {
  on: (
    event: "upgrade",
    cb: (req: IncomingMessage, socket: Socket, head: Buffer) => void,
  ) => void;
};

import { COLLAB_WS_PATH } from "./constants";

/** Track per-document connection counts for periodic timer lifecycle. */
const connectionCounts = new Map<string, number>();

let hocuspocusInstance: Hocuspocus | null = null;

/**
 * Create the shared Hocuspocus instance (idempotent).
 */
export function createHocuspocus(): Hocuspocus {
  if (hocuspocusInstance) return hocuspocusInstance;

  hocuspocusInstance = new Hocuspocus({
    quiet: true,
    debounce: 400,
    maxDebounce: 30_000,

    async onAuthenticate(data: onAuthenticatePayload) {
      if (!data.token || data.token !== WS_TOKEN) {
        throw new Error("Unauthorized");
      }
    },

    async onConnect(data: onConnectPayload) {
      const doc = data.documentName;
      const count = (connectionCounts.get(doc) ?? 0) + 1;
      connectionCounts.set(doc, count);

      // Start periodic version timer on first connection for this document.
      // The timer reads the persisted .md on disk (last known good state).
      // A newer persist may have happened between the timer check and now —
      // the dedup guard in createVersion prevents duplicates.
      if (count === 1) {
        startPeriodicVersionTimer(doc, async () => {
          try {
            const { readDocument } = await import("../documents");
            const { checkPeriodicSnapshot } = await import("./versioning");
            const current = await readDocument(doc);
            await checkPeriodicSnapshot(doc, current.content);
          } catch {
            // Best-effort periodic snapshot — never fail the server.
          }
        });
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

      // Decrement connection count; stop timer when last client disconnects.
      const count = (connectionCounts.get(data.documentName) ?? 1) - 1;
      connectionCounts.set(data.documentName, count);
      if (count <= 0) {
        connectionCounts.delete(data.documentName);
        stopPeriodicVersionTimer(data.documentName);
      }
    },
  });

  return hocuspocusInstance;
}

/**
 * Attach Hocuspocus to an existing HTTP server's `upgrade` event.
 * Phase 1 JSON notifications continue to use `/ws`.
 */
export function setupHocuspocusCollab(httpServer: HttpServer): Hocuspocus {
  const hocuspocus = createHocuspocus();

  const crosswsServer = crossws({
    hooks: {
      open: (peer) => {
        const clientConnection = hocuspocus.handleConnection(
          peer.websocket as unknown as WebSocketLike,
          peer.request as Request,
        );
        (peer as { _hocuspocus?: unknown })._hocuspocus = clientConnection;
      },
      message: (peer, message) => {
        (peer as { _hocuspocus?: { handleMessage: (d: Uint8Array) => void } })
          ._hocuspocus?.handleMessage(message.uint8Array());
      },
      close: (peer, event) => {
        (peer as { _hocuspocus?: { handleClose: (e: { code: number; reason: string }) => void } })
          ._hocuspocus?.handleClose({
            code: event.code ?? 1000,
            reason: event.reason ?? "",
          });
      },
    },
  });

  httpServer.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname !== COLLAB_WS_PATH) return;

    // Auth is handled by Hocuspocus onAuthenticate (token in auth message).
    // Optional ?token= on URL is also accepted by clients for parity with /ws.
    try {
      await hocuspocus.hooks("onUpgrade", {
        request,
        socket,
        head,
        instance: hocuspocus,
      });
      crosswsServer.handleUpgrade(request, socket, head);
    } catch (error) {
      if (error) throw error;
    }
  });

  return hocuspocus;
}

/** Reset singleton and timer state (for tests). */
export function resetHocuspocus(): void {
  connectionCounts.clear();
  hocuspocusInstance = null;
}
