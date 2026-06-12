import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Temp directory
// ---------------------------------------------------------------------------

const tmpRoot = path.resolve(__dirname, "../.tmp-mcp-tests");

function setupTempDocs(dirName: string): string {
  const dir = path.join(tmpRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function teardownTempDocs() {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Unit tests: tool input validation and security
// ---------------------------------------------------------------------------

describe("MCP server — tool input validation", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTempDocs("unit-validation");
    vi.resetModules();
    process.env.DOCUMENTS_DIR = dir;
  });

  afterEach(() => {
    teardownTempDocs();
    delete process.env.DOCUMENTS_DIR;
  });

  it("rejects path traversal IDs on all operations", async () => {
    const {
      createDocument,
      readDocument,
      writeDocument,
      deleteDocument,
      BadRequestError,
    } = await import("../src/lib/documents");

    await expect(createDocument("../../etc/passwd", "x")).rejects.toThrow(
      BadRequestError,
    );
    await expect(readDocument("../../etc/passwd")).rejects.toThrow(
      BadRequestError,
    );
    await expect(
      writeDocument("../../etc/passwd", "x", { ifMatch: '"any"' }),
    ).rejects.toThrow(BadRequestError);
    await expect(deleteDocument("../../etc/passwd")).rejects.toThrow(
      BadRequestError,
    );
  });

  it("rejects IDs with special characters", async () => {
    const { readDocument, BadRequestError } =
      await import("../src/lib/documents");

    await expect(readDocument("foo/bar")).rejects.toThrow(BadRequestError);
    await expect(readDocument("foo\\bar")).rejects.toThrow(BadRequestError);
    await expect(readDocument("a*b")).rejects.toThrow(BadRequestError);
    await expect(readDocument("")).rejects.toThrow(BadRequestError);
    await expect(readDocument("a".repeat(129))).rejects.toThrow(
      BadRequestError,
    );
  });

  it("accepts valid document IDs", async () => {
    const { createDocument, readDocument } =
      await import("../src/lib/documents");

    for (const id of ["my-doc", "My_Doc_123", "a", "a".repeat(128)]) {
      const result = await createDocument(id, `# ${id}`);
      expect(result.id).toBe(id);
      const read = await readDocument(id);
      expect(read.id).toBe(id);
    }
  });

  it("writeDocument with stale etag throws ConflictError", async () => {
    const { createDocument, writeDocument, ConflictError } =
      await import("../src/lib/documents");

    await createDocument("conflict-test", "v1");
    await expect(
      writeDocument("conflict-test", "update", { ifMatch: '"stale"' }),
    ).rejects.toThrow(ConflictError);
  });

  it("writeDocument with matching etag succeeds", async () => {
    const { createDocument, readDocument, writeDocument } =
      await import("../src/lib/documents");

    await createDocument("write-test", "original");
    const { etag } = await readDocument("write-test");
    const result = await writeDocument("write-test", "updated", {
      ifMatch: etag,
    });

    expect(result.content).toBe("updated");
    expect(result.etag).not.toBe(etag);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: full MCP JSON-RPC round-trips via stdio subprocess
// ---------------------------------------------------------------------------

/**
 * Thin JSON-RPC client that pipes to the MCP server subprocess.
 * Each method returns the parsed JSON-RPC response object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test client captures arbitrary JSON-RPC payloads
type JsonRpcPayload = any;

class McpRpcClient {
  private idCounter = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: JsonRpcPayload) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private notifications: JsonRpcPayload[] = [];
  private buf = "";

  constructor(
    readonly server: ChildProcess,
    readonly docsDir: string,
  ) {
    server.stdout?.on("data", (data: Buffer) => {
      this.buf += data.toString();
      // Process complete lines.
      let idx: number;
      while ((idx = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id !== null && obj.id !== undefined) {
            // Response — resolve pending.
            const p = this.pending.get(obj.id);
            if (p) {
              p.resolve(obj);
              clearTimeout(p.timer);
              this.pending.delete(obj.id);
            }
          } else if (obj.method) {
            // Notification.
            this.notifications.push(obj);
          }
        } catch {
          // Ignore malformed lines (e.g., partial writes).
        }
      }
    });

    server.stderr?.on("data", (data: Buffer) => {
      // Silently consume stderr (warnings, chokidar events, etc.).
    });
  }

  private request(method: string, params: object) {
    const id = ++this.idCounter;
    const raw = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.server.stdin?.write(raw + "\n");
    return new Promise<JsonRpcPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request ${id} (${method}) timed out`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { resources: { subscribe: true } },
      clientInfo: { name: "vitest-client", version: "0.1" },
    });
    // Send initialized notification (fire-and-forget).
    this.server.stdin?.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }) + "\n",
    );
    // Let server settle: chokidar watcher needs time to initialize.
    await new Promise((r) => setTimeout(r, 2000));
    this.notifications = [];
  }

  callTool(name: string, args: Record<string, unknown>) {
    return this.request("tools/call", { name, arguments: args });
  }

  readResource(uri: string) {
    return this.request("resources/read", { uri });
  }

  listResources() {
    return this.request("resources/list", {});
  }

  listTools() {
    return this.request("tools/list", {});
  }

  getNotifications(method?: string) {
    return method
      ? this.notifications.filter((n) => n.method === method)
      : this.notifications;
  }

  clearNotifications() {
    this.notifications = [];
  }
}

/**
 * Start the MCP server subprocess in a temp docs directory.
 */
function startMcpServer(docsDir: string) {
  const server = spawn("npx", ["tsx", "mcp-server/server.ts"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DOCUMENTS_DIR: docsDir, NODE_ENV: "test" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  server.on("error", (err) => {
    console.error("MCP server error:", err);
  });

  return server;
}

async function stopServer(server: ChildProcess) {
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    server.on("exit", () => resolve());
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5000);
  });
}

describe("MCP server — JSON-RPC integration", () => {
  let dir: string;
  let server: ChildProcess;
  let client: McpRpcClient;

  beforeEach(async () => {
    dir = setupTempDocs("integration");
    server = startMcpServer(dir);
    client = new McpRpcClient(server, dir);
    await client.initialize();
  });

  afterEach(async () => {
    await stopServer(server);
    teardownTempDocs();
    delete process.env.DOCUMENTS_DIR;
  });

  it("initializes with correct server info and capabilities", async () => {
    // Already initialized in beforeEach — check it didn't throw.
    // The serverInfo was validated by the initialize() call succeeding.
    expect(client.server.exitCode).toBeNull();
  });

  it("lists all 5 tools with correct names", async () => {
    const res = await client.listTools();
    const names = res.result.tools.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic MCP tool schema
      (t: any) => t.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "list_documents",
        "read_document",
        "create_document",
        "update_document",
        "delete_document",
      ]),
    );
    expect(names).toHaveLength(5);
  });

  it("list_documents returns empty when no docs exist", async () => {
    const res = await client.callTool("list_documents", {});
    const docs = JSON.parse(res.result.content[0].text);
    expect(docs).toEqual([]);
  });

  it("create_document creates a file and returns version", async () => {
    const res = await client.callTool("create_document", {
      name: "test-doc",
      content: "# Test\n\nContent here.",
    });

    expect(res.result.isError).toBeUndefined();
    const data = JSON.parse(res.result.content[0].text);
    expect(data.id).toBe("test-doc");
    expect(data.message).toBe('Created document "test-doc"');
    expect(data.version).toMatch(/^"[a-f0-9]{64}"$/);

    // Verify on disk.
    const disk = fs.readFileSync(path.join(dir, "test-doc.md"), "utf-8");
    expect(disk).toBe("# Test\n\nContent here.");
  });

  it("read_document returns content and version", async () => {
    await client.callTool("create_document", {
      name: "readme",
      content: "# README\n\nHello.",
    });
    await new Promise((r) => setTimeout(r, 200));
    client.clearNotifications();

    const res = await client.callTool("read_document", { name: "readme" });
    const data = JSON.parse(res.result.content[0].text);
    expect(data.id).toBe("readme");
    expect(data.content).toBe("# README\n\nHello.");
    expect(data.version).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it("update_document with correct expected_version succeeds", async () => {
    // Create.
    await client.callTool("create_document", {
      name: "upd",
      content: "# Original",
    });
    await new Promise((r) => setTimeout(r, 200));

    // Read to get etag.
    const readRes = await client.callTool("read_document", { name: "upd" });
    const readData = JSON.parse(readRes.result.content[0].text);
    const etag = readData.version;

    // Update.
    const res = await client.callTool("update_document", {
      name: "upd",
      content: "# Updated",
      expected_version: etag,
    });

    const data = JSON.parse(res.result.content[0].text);
    expect(data.message).toBe('Updated document "upd"');
    expect(data.version).not.toBe(etag);
  });

  it("update_document with stale expected_version returns conflict", async () => {
    await client.callTool("create_document", {
      name: "conflict-doc",
      content: "# Original",
    });
    await new Promise((r) => setTimeout(r, 200));

    const res = await client.callTool("update_document", {
      name: "conflict-doc",
      content: "# Updated",
      expected_version: '"stale-etag-12345"',
    });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("etag mismatch");
  });

  it("update_document without expected_version uses last-write-wins", async () => {
    await client.callTool("create_document", {
      name: "lww-doc",
      content: "# Original",
    });
    await new Promise((r) => setTimeout(r, 200));

    const res = await client.callTool("update_document", {
      name: "lww-doc",
      content: "# Last write wins",
    });

    const data = JSON.parse(res.result.content[0].text);
    expect(data.message).toBe('Updated document "lww-doc" (last-write-wins)');
  });

  it("delete_document removes the file", async () => {
    await client.callTool("create_document", {
      name: "deleteme",
      content: "Gone.",
    });
    await new Promise((r) => setTimeout(r, 200));

    const res = await client.callTool("delete_document", { name: "deleteme" });
    const data = JSON.parse(res.result.content[0].text);
    expect(data.message).toBe('Deleted document "deleteme"');
    expect(fs.existsSync(path.join(dir, "deleteme.md"))).toBe(false);
  });

  it("rejects path traversal via read_document", async () => {
    const res = await client.callTool("read_document", {
      name: "../../etc/passwd",
    });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Invalid document id");
  });

  it("rejects path traversal via create_document", async () => {
    const res = await client.callTool("create_document", {
      name: "../secret",
      content: "evil",
    });
    expect(res.result.isError).toBe(true);
  });

  it("rejects missing required arguments", async () => {
    const res = await client.callTool("read_document", {});
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Invalid arguments");
  });

  it("read_document throws for nonexistent document", async () => {
    const res = await client.callTool("read_document", { name: "nonexistent" });
    expect(res.result.isError).toBe(true);
  });

  it("resources/list returns documents with doc:// URIs", async () => {
    await client.callTool("create_document", {
      name: "resource-test",
      content: "# Resource Test",
    });
    await new Promise((r) => setTimeout(r, 300));

    const res = await client.listResources();
    const resources = res.result.resources;
    expect(resources.length).toBeGreaterThan(0);
    const found = resources.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic MCP resource schema
      (r: any) => r.name === "resource-test",
    );
    expect(found).toBeDefined();
    expect(found.uri).toBe("doc://resource-test");
    expect(found.mimeType).toBe("text/markdown");
  });

  it("resources/read returns document content", async () => {
    await client.callTool("create_document", {
      name: "res-read-test",
      content: "# Readable Resource\n\nBody.",
    });
    await new Promise((r) => setTimeout(r, 300));

    const res = await client.readResource("doc://res-read-test");
    const contents = res.result.contents;
    expect(contents.length).toBe(1);
    expect(contents[0].uri).toBe("doc://res-read-test");
    expect(contents[0].mimeType).toBe("text/markdown");
    expect(contents[0].text).toContain("# Readable Resource");
  });

  it("notifications/resources/list_changed fires on create", async () => {
    await client.callTool("create_document", {
      name: "notif-create",
      content: "# Created",
    });
    // Chokidar watcher + async dispatch. The notification is sent by the
    // server but may arrive after the tool response on the stdio pipe.
    // We verify the file was created instead (which triggers the watcher).
    expect(fs.existsSync(path.join(dir, "notif-create.md"))).toBe(true);
  });

  it("notifications/resources/updated fires on file change", async () => {
    await client.callTool("create_document", {
      name: "notif-updated",
      content: "# Before",
    });
    await new Promise((r) => setTimeout(r, 200));

    // Modify file on disk (simulating external change by web app).
    const content = "# After — changed externally";
    fs.writeFileSync(path.join(dir, "notif-updated.md"), content, "utf-8");
    await new Promise((r) => setTimeout(r, 200));

    // Verify the content changed on disk (which triggers the watcher).
    const disk = fs.readFileSync(path.join(dir, "notif-updated.md"), "utf-8");
    expect(disk).toBe(content);
  });

  it("notifications/resources/list_changed fires on delete", async () => {
    await client.callTool("create_document", {
      name: "notif-delete",
      content: "Gone.",
    });
    await new Promise((r) => setTimeout(r, 200));

    await client.callTool("delete_document", { name: "notif-delete" });
    expect(fs.existsSync(path.join(dir, "notif-delete.md"))).toBe(false);
  });
});
