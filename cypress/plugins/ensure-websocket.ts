/**
 * Cypress `cy.task` handlers run in Node, not the browser. Node 20 has no
 * global WebSocket; @hocuspocus/provider requires one for collab/MCP tasks.
 */
import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
