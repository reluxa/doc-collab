/**
 * Vitest global setup (CI + local).
 *
 * - Ensures `./documents` exists (gitignored; persistence tests write there).
 * - WebSocket polyfill for older Node; no-op on Node 22+ where it is built-in.
 */

import fs from "node:fs";
import path from "node:path";

import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

const docsDir = path.resolve(process.env.DOCUMENTS_DIR ?? "./documents");
fs.mkdirSync(docsDir, { recursive: true });
