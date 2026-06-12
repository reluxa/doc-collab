import http from "node:http";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  setupWebSocketServer,
  broadcast,
  getConnectionCount,
  resetState,
  type DocChangedEvent,
} from "../src/lib/realtime";
import { WS_TOKEN } from "../src/lib/config";

const WS_PORT = 3457;

let server: http.Server;

function startServer(): () => Promise<void> {
  resetState();
  server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end();
  });

  setupWebSocketServer(server);
  server.listen(WS_PORT, "127.0.0.1");

  return () =>
    new Promise((resolve, reject) => {
      server.close(() => resolve());
      setTimeout(() => reject(new Error("Server close timeout")), 5000);
    });
}

function connectClient(token?: string): Promise<WebSocket> {
  const url = `ws://127.0.0.1:${WS_PORT}/ws${token ? `?token=${token}` : ""}`;
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(data.toString()));
  });
}

let closeServer: () => Promise<void>;

beforeEach(() => {
  closeServer = startServer();
});

afterEach(async () => {
  await closeServer();
  resetState();
});

describe("WebSocket auth", () => {
  it("rejects connection without token", async () => {
    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}/ws`);
      ws.on("error", () => resolve(undefined));
      setTimeout(resolve, 500);
    });
  });

  it("rejects connection with wrong token", async () => {
    await new Promise((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${WS_PORT}/ws?token=wrong-token`,
      );
      ws.on("error", () => resolve(undefined));
      setTimeout(resolve, 500);
    });
  });

  it("accepts connection with valid token", async () => {
    const ws = await connectClient(WS_TOKEN);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe("broadcast", () => {
  it("delivers doc-changed event to connected client", async () => {
    const ws = await connectClient(WS_TOKEN);
    const msgPromise = waitForMessage(ws);

    broadcast({
      type: "doc-changed",
      id: "test-doc",
      version: "abc123",
      origin: "server-watcher",
    });

    const received = JSON.parse(await msgPromise);
    expect(received.type).toBe("doc-changed");
    expect(received.id).toBe("test-doc");
    expect(received.version).toBe("abc123");
    ws.close();
  });

  it("skips the originator", async () => {
    const ws = await connectClient(WS_TOKEN);

    // Connection id is client-1 (first connection after reset).
    const event: DocChangedEvent = {
      type: "doc-changed",
      id: "test-doc",
      version: "v1",
      origin: "client-1",
    };

    const noMessage = new Promise<boolean>((resolve) => {
      ws.once("message", () => resolve(false));
      setTimeout(() => resolve(true), 200);
    });

    broadcast(event);
    expect(await noMessage).toBe(true);
    ws.close();
  });

  it("tracks connection count", async () => {
    const ws1 = await connectClient(WS_TOKEN);
    expect(getConnectionCount()).toBe(1);

    const ws2 = await connectClient(WS_TOKEN);
    expect(getConnectionCount()).toBe(2);

    ws1.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getConnectionCount()).toBe(1);

    ws2.close();
  });

  it("does not crash on closed connections", async () => {
    const ws = await connectClient(WS_TOKEN);
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(() =>
      broadcast({
        type: "doc-changed",
        id: "test",
        version: "v1",
        origin: "other",
      }),
    ).not.toThrow();
  });
});
