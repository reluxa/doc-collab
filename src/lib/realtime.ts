import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { WS_TOKEN } from "./config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Event sent to connected browser clients. */
export interface DocChangedEvent {
  type: "doc-changed";
  id: string;
  version: string;
  /** Unique connection id of the originator (so the originator can skip). */
  origin: string;
}

/** A registered WebSocket connection. */
interface Connection {
  /** Unique id for this connection (used as `origin` in events). */
  id: string;
  ws: WebSocket;
  /** Document ids this client is subscribed to (empty = all). */
  subs: Set<string>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let connections: Connection[] = [];
let idCounter = 0;
let wss: WebSocketServer | null = null;

/** Reset state (for testing). */
export function resetState(): void {
  connections = [];
  idCounter = 0;
  if (wss) {
    wss.close();
    wss = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create and configure the WebSocket server, attaching it to an existing
 * HTTP server via the `upgrade` event.
 *
 * @param httpServer - Node.js `http.Server` (or compatible)
 * @param onUpgrade - Called on every valid upgrade (for request logging, etc.)
 */
export function setupWebSocketServer(
  httpServer: { on: (event: string, cb: (req: IncomingMessage, socket: unknown, head: Buffer) => void) => void },
): void {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    // Only handle /ws; let Next.js HMR and other upgrades pass through.
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname !== "/ws") return;
    handleUpgrade(request, socket as unknown as Socket, head);
  });

  wss.on("connection", (ws, request) => {
    const id = `client-${++idCounter}`;
    const conn: Connection = { id, ws, subs: new Set() };
    connections.push(conn);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === "subscribe" && typeof msg.ids === "string") {
          conn.subs.add(msg.ids);
        } else if (msg.type === "unsubscribe" && typeof msg.ids === "string") {
          conn.subs.delete(msg.ids);
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.on("close", () => {
      connections = connections.filter((c) => c.id !== id);
    });
  });
}

/**
 * Broadcast a `doc-changed` event to all connected clients that are
 * subscribed to (or listening to all) the given document id.
 *
 * @param event - The event to broadcast
 */
export function broadcast(event: DocChangedEvent): void {
  const payload = JSON.stringify(event);
  for (const conn of connections) {
    // Empty subs = subscribe to all; otherwise check specific doc.
    const interested =
      conn.subs.size === 0 || conn.subs.has(event.id);
    if (!interested) continue;
    // Skip the originator.
    if (conn.id === event.origin) continue;
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }
}

/** Get current connection count (for diagnostics). */
export function getConnectionCount(): number {
  return connections.length;
}

// ---------------------------------------------------------------------------
// Upgrade handler
// ---------------------------------------------------------------------------

/**
 * Handle HTTP upgrade requests for WebSocket connections.
 * Called only for /ws path (other upgrades are passed through to Next.js).
 *
 * Validates the auth token (`?token=` or `Sec-WebSocket-Protocol`).
 * Rejects invalid upgrades with a 401 response.
 */
function handleUpgrade(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const token =
    url.searchParams.get("token") ??
    (request.headers["sec-websocket-protocol"] as string | undefined);

  if (!token || token !== WS_TOKEN) {
    // Reject with 401.
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss?.handleUpgrade(request, socket, head, (ws) => {
    wss?.emit("connection", ws, request);
  });
}
