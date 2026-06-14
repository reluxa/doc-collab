/**
 * Vitest global setup (CI + local Node 20).
 *
 * - Node 20 has no global WebSocket; Hocuspocus provider tests need one.
 * - `./documents` is gitignored; persistence tests write there.
 */

import fs from "node:fs";
import path from "node:path";

import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

const docsDir = path.resolve(process.env.DOCUMENTS_DIR ?? "./documents");
fs.mkdirSync(docsDir, { recursive: true });
