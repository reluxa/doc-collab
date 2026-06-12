/**
 * MCP tool and resource definitions for document CRUD operations.
 *
 * Every tool delegates to `lib/documents.ts` so that ID validation,
 * path-traversal protection, and ETag logic are shared with the web API.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listDocuments,
  readDocument,
  createDocument,
  writeDocument,
  deleteDocument,
  NotFoundError,
} from "../src/lib/documents";

// ---------------------------------------------------------------------------
// Resource URI scheme: doc:///<id>
// ---------------------------------------------------------------------------

/** Build a doc:// URI from a document id. */
function docUri(id: string): string {
  return `doc://${id}`;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register all MCP tools and resources on the given server.
 *
 * Resources are declared with a template so the agent can read individual
 * documents.  Each tool validates its input via the shared `resolveDocPath`
 * (called inside the lib functions).
 */
export function registerTools(server: McpServer): void {
  // ---- Resources (per-document, dynamic template) ----
  // The list callback enumerates all documents so resources/list returns them
  // and resources/read resolves the template variables correctly.

  server.registerResource(
    "document",
    new ResourceTemplate("doc://{id}", {
      list: async () => {
        const docs = await listDocuments();
        return {
          resources: docs.map((d) => ({
            uri: docUri(d.id),
            name: d.id,
            description: d.title,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    {
      description: "A Markdown document stored in DOCS_ROOT",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      // URI template variables can be string | string[]; we expect a single id.
      const id = Array.isArray(variables.id) ? variables.id[0] : variables.id;
      try {
        const doc = await readDocument(id);
        return {
          contents: [
            {
              uri: docUri(id),
              mimeType: "text/markdown",
              text: doc.content,
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return { contents: [] };
        }
        throw err;
      }
    },
  );

  // ---- Tools ----

  server.registerTool(
    "list_documents",
    {
      description:
        "List all documents with metadata (id, title, last modified).",
      inputSchema: {} as const,
    },
    async () => {
      const docs = await listDocuments();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              docs.map((d) => ({
                id: d.id,
                title: d.title,
                modifiedAt: d.modifiedAt.toISOString(),
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_document",
    {
      description:
        "Read a document's Markdown content and return it with its current version (etag).",
      inputSchema: {
        name: z
          .string()
          .describe("Document id (filename without .md extension)"),
      },
    },
    async ({ name }) => {
      const doc = await readDocument(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: doc.id, content: doc.content, version: doc.etag },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_document",
    {
      description: "Create a new document with the given name and content.",
      inputSchema: {
        name: z
          .string()
          .describe("Document id (filename without .md extension)"),
        content: z.string().describe("Markdown content for the new document"),
      },
    },
    async ({ name, content }) => {
      const doc = await createDocument(name, content);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: doc.id,
                version: doc.etag,
                message: `Created document "${name}"`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "update_document",
    {
      description:
        "Update an existing document. Supply expected_version for optimistic concurrency; omit for last-write-wins (logged).",
      inputSchema: {
        name: z
          .string()
          .describe("Document id (filename without .md extension)"),
        content: z.string().describe("New Markdown content"),
        expected_version: z
          .string()
          .optional()
          .describe(
            "Optional ETag from the last read. If supplied and stale, a conflict error is returned.",
          ),
      },
    },
    async ({ name, content, expected_version }) => {
      if (expected_version) {
        // Optimistic concurrency path.
        const doc = await writeDocument(name, content, {
          ifMatch: expected_version,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: doc.id,
                  version: doc.etag,
                  message: `Updated document "${name}"`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Last-write-wins path: read current etag first, then write.
      try {
        const current = await readDocument(name);
        const doc = await writeDocument(name, content, {
          ifMatch: current.etag,
        });
        console.warn(
          `[last-write-wins] update_document("${name}") — expected_version not supplied`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: doc.id,
                  version: doc.etag,
                  message: `Updated document "${name}" (last-write-wins)`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          throw err;
        }
        throw new Error(
          `Conflict: document "${name}" was modified concurrently. Supply expected_version for optimistic concurrency.`,
        );
      }
    },
  );

  server.registerTool(
    "delete_document",
    {
      description: "Delete a document permanently.",
      inputSchema: {
        name: z
          .string()
          .describe("Document id (filename without .md extension)"),
      },
    },
    async ({ name }) => {
      await deleteDocument(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { message: `Deleted document "${name}"` },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
