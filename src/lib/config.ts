import path from "node:path";

/**
 * Central configuration resolved from environment variables.
 * Shared by the web app and MCP server — no Next/React imports.
 */

/** Root directory for `.md` files (absolute path). */
export const DOCS_ROOT = path.resolve(
  process.env.DOCUMENTS_DIR ?? "./documents",
);

/** Server bind address. */
export const HOST = process.env.HOST ?? "127.0.0.1";

/** Server port. */
export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

/** Shared token guarding WebSocket upgrades. Generated once at startup. */
export const WS_TOKEN =
  process.env.WS_TOKEN ??
  (process.env.NODE_ENV === "production"
    ? (function generateProdToken(): string {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      })()
    : "dev-token-7f3a9b2c1d4e5f6a8b9c0d1e2f3a4b5c");
