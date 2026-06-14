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
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Batched broadcasts — coalesce per tick (Story 14). */
const pendingBroadcasts = new Map<string, DocChangedEvent>();
let flushScheduled = false;

const HEARTBEAT_MS = 30_000;

/** Reset state (for testing). */
export function resetState(): void {
  connections = [];
  idCounter = 0;
  pendingBroadcasts.clear();
  flushScheduled = false;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
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
 */
export function setupWebSocketServer(
  httpServer: { on: (event: string, cb: (req: IncomingMessage, socket: unknown, head: Buffer) => void) => void },
): void {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname !== "/ws") return;
    handleUpgrade(request, socket as unknown as Socket, head);
  });

  wss.on("connection", (ws) => {
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
        } else if (msg.type === "pong") {
          // Client heartbeat response (optional).
        }
      } catch {
        // Ignore malformed messages.
      }
    });

    ws.on("close", () => {
      connections = connections.filter((c) => c.id !== id);
    });
  });

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      for (const conn of connections) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.ping();
        }
      }
    }, HEARTBEAT_MS);
  }
}

/**
 * Queue a `doc-changed` event for batched delivery (latest version wins per id).
 */
export function broadcast(event: DocChangedEvent): void {
  pendingBroadcasts.set(event.id, event);
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(flushBroadcastQueue);
}

/** Flush pending broadcasts immediately (tests). */
export function flushBroadcastQueue(): void {
  flushScheduled = false;
  const events = [...pendingBroadcasts.values()];
  pendingBroadcasts.clear();

  for (const event of events) {
    const payload = JSON.stringify(event);
    for (const conn of connections) {
      const interested = conn.subs.size === 0 || conn.subs.has(event.id);
      if (!interested) continue;
      if (conn.id === event.origin) continue;
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
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
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss?.handleUpgrade(request, socket, head, (ws) => {
    wss?.emit("connection", ws, request);
  });
}
