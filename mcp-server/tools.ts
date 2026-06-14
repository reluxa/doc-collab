/**
 * MCP tool and resource definitions for document CRUD operations.
 *
 * Phase 2 (Story 13): reads and writes route through the Hocuspocus CRDT
 * peer when available; filesystem + ETag remain the fallback and version source.
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
  ConflictError,
} from "../src/lib/documents";
import {
  isMcpCollabEnabled,
  peerReadDocument,
  peerReadSection,
  peerUpdateDocument,
  peerUpdateSection,
} from "./collab-peer";

// ---------------------------------------------------------------------------
// Resource URI scheme: doc:///<id>
// ---------------------------------------------------------------------------

/** Build a doc:// URI from a document id. */
function docUri(id: string): string {
  return `doc://${id}`;
}

async function readDocumentContent(name: string): Promise<{ content: string; etag: string }> {
  if (isMcpCollabEnabled()) {
    try {
      const [content, disk] = await Promise.all([
        peerReadDocument(name),
        readDocument(name),
      ]);
      return { content, etag: disk.etag };
    } catch {
      // Collab server unavailable — fall back to disk.
    }
  }

  const doc = await readDocument(name);
  return { content: doc.content, etag: doc.etag };
}

async function updateDocumentContent(
  name: string,
  content: string,
  expectedVersion?: string,
): Promise<{ etag: string }> {
  if (expectedVersion) {
    const current = await readDocument(name);
    if (current.etag !== expectedVersion) {
      throw new ConflictError(
        "Document was modified by another writer (etag mismatch)",
      );
    }
  }

  if (isMcpCollabEnabled()) {
    try {
      await peerUpdateDocument(name, content);
      const disk = await readDocument(name);
      return { etag: disk.etag };
    } catch {
      // Collab server unavailable — fall back to disk write.
    }
  }

  const current = await readDocument(name);
  const written = await writeDocument(name, content, {
    ifMatch: expectedVersion ?? current.etag,
  });
  return { etag: written.etag };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register all MCP tools and resources on the given server.
 */
export function registerTools(server: McpServer): void {
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
      const id = Array.isArray(variables.id) ? variables.id[0] : variables.id;
      try {
        const doc = await readDocumentContent(id);
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
      const doc = await readDocumentContent(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: name, content: doc.content, version: doc.etag },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_section",
    {
      description:
        "Read a single section from a document by stable section id (from <!-- sec:... --> anchors).",
      inputSchema: {
        name: z.string().describe("Document id"),
        section_id: z.string().describe("Stable section id"),
      },
    },
    async ({ name, section_id }) => {
      if (isMcpCollabEnabled()) {
        try {
          const section = await peerReadSection(name, section_id);
          const disk = await readDocument(name);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    id: name,
                    section_id: section.id,
                    heading: section.heading,
                    body: section.body,
                    markdown: section.markdown,
                    version: disk.etag,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err: unknown) {
          if (!(err instanceof NotFoundError)) throw err;
        }
      }

      throw new Error(
        `Section "${section_id}" not found or collab server unavailable for "${name}".`,
      );
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
      if (isMcpCollabEnabled()) {
        try {
          await peerUpdateDocument(name, content);
        } catch {
          // Disk copy exists; collab will bootstrap on first connect.
        }
      }
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
        const result = await updateDocumentContent(name, content, expected_version);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: name,
                  version: result.etag,
                  message: `Updated document "${name}"`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      try {
        const result = await updateDocumentContent(name, content);
        console.warn(
          `[last-write-wins] update_document("${name}") — expected_version not supplied`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: name,
                  version: result.etag,
                  message: `Updated document "${name}" (last-write-wins)`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof NotFoundError) throw err;
        throw new Error(
          `Conflict: document "${name}" was modified concurrently. Supply expected_version for optimistic concurrency.`,
        );
      }
    },
  );

  server.registerTool(
    "update_section",
    {
      description:
        "Update a single section's body in a document. Other sections are preserved.",
      inputSchema: {
        name: z.string().describe("Document id"),
        section_id: z.string().describe("Stable section id"),
        content: z.string().describe("New section body (Markdown)"),
      },
    },
    async ({ name, section_id, content }) => {
      if (!isMcpCollabEnabled()) {
        throw new Error("update_section requires MCP_COLLAB (collab server running).");
      }

      await peerUpdateSection(name, section_id, content);
      const disk = await readDocument(name);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: name,
                section_id,
                version: disk.etag,
                message: `Updated section "${section_id}" in "${name}"`,
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
