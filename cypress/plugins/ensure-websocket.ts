/**
 * Cypress `cy.task` handlers run in Node, not the browser.
 * WebSocket polyfill for older Node; no-op on Node 22+ where it is built-in.
 */
import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
