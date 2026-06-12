/**
 * MCP server over stdio that exposes document tools to the openclaw agent.
 *
 * Delegates all filesystem operations to shared `lib/documents.ts` so ID
 * validation and path-traversal protection are identical to the web API.
 *
 * Usage: `node --import tsx mcp-server/server.ts` (dev)
 *        or: `node mcp-server/server.js` (prod)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { registerTools } from "./tools";
import { setupAgentNotifier } from "./agent-notify";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = new McpServer({
    name: "doc-collab",
    version: "0.1.0",
  });

  // Register document CRUD tools and resource subscriptions.
  registerTools(server);

  // Set up chokidar watcher → agent notifications.
  setupAgentNotifier(server);

  const transport = new StdioServerTransport();

  // Log JSON parse / protocol errors so malformed client requests
  // don't disappear silently. Suppress noisy Zod validation errors
  // that are already covered by the underlying JSON parse failure.
  transport.onerror = (err: unknown) => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    if (!msg.includes("invalid_union")) {
      console.error(`[mcp-transport] Error: ${msg}`);
    }
  };

  await server.connect(transport);

  // Keep the process alive.
  process.stdin.resume();
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
