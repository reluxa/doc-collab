import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Create a unique temp directory per test run.
const tmpRoot = path.resolve(__dirname, "../.tmp-docs");

function setupTempDocs(dirName: string) {
  const dir = path.join(tmpRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function teardownTempDocs() {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.DOCUMENTS_DIR;
});

afterEach(() => {
  teardownTempDocs();
});

describe("security.resolveDocPath", () => {
  it("rejects path traversal IDs", async () => {
    const dir = setupTempDocs("security-traversal");
    process.env.DOCUMENTS_DIR = dir;
    vi.resetModules();
    const { resolveDocPath } = await import("../src/lib/security");

    expect(() => resolveDocPath("../../etc/passwd")).toThrow(
      "Invalid document id",
    );
    expect(() => resolveDocPath("../secret")).toThrow("Invalid document id");
    expect(() => resolveDocPath("foo/bar")).toThrow("Invalid document id");
    expect(() => resolveDocPath("foo\\bar")).toThrow("Invalid document id");
    expect(() => resolveDocPath("a*b")).toThrow("Invalid document id");
  });

  it("rejects empty and overly long IDs", async () => {
    const dir = setupTempDocs("security-length");
    process.env.DOCUMENTS_DIR = dir;
    vi.resetModules();
    const { resolveDocPath } = await import("../src/lib/security");

    expect(() => resolveDocPath("")).toThrow("Invalid document id");
    expect(() => resolveDocPath("a".repeat(129))).toThrow("Invalid document id");
  });

  it("accepts valid IDs", async () => {
    const dir = setupTempDocs("security-valid");
    process.env.DOCUMENTS_DIR = dir;
    vi.resetModules();
    const { resolveDocPath } = await import("../src/lib/security");

    const p1 = resolveDocPath("my-doc");
    expect(p1).toContain("my-doc.md");

    const p2 = resolveDocPath("My_Doc_123");
    expect(p2).toContain("My_Doc_123.md");

    const p3 = resolveDocPath("a");
    expect(p3).toContain("a.md");

    const p4 = resolveDocPath("a".repeat(128));
    expect(p4).toContain(`${"a".repeat(128)}.md`);
  });

  it("resolves paths inside DOCS_ROOT only", async () => {
    const dir = setupTempDocs("security-containment");
    process.env.DOCUMENTS_DIR = dir;
    vi.resetModules();
    const { resolveDocPath } = await import("../src/lib/security");

    const filePath = resolveDocPath("test");
    expect(filePath.startsWith(dir)).toBe(true);
  });
});

describe("documents CRUD", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTempDocs("crud");
  });

  async function getModules() {
    vi.resetModules();
    process.env.DOCUMENTS_DIR = dir;
    return import("../src/lib/documents");
  }

  it("createDocument creates a file and returns content + etag", async () => {
    const { createDocument, readDocument } = await getModules();

    const result = await createDocument("hello", "# Hello\n\nWorld");
    expect(result.id).toBe("hello");
    expect(result.content).toBe("# Hello\n\nWorld");
    expect(result.etag).toMatch(/^"[a-f0-9]{64}"$/);

    // Verify on disk.
    const disk = fs.readFileSync(path.join(dir, "hello.md"), "utf-8");
    expect(disk).toBe("# Hello\n\nWorld");

    // Read returns the same content.
    const read = await readDocument("hello");
    expect(read.content).toBe("# Hello\n\nWorld");
    expect(read.etag).toBe(result.etag);
  });

  it("createDocument throws ConflictError on duplicate", async () => {
    const m = await getModules();
    await m.createDocument("dup", "content");
    await expect(m.createDocument("dup", "other")).rejects.toThrow(m.ConflictError);
  });

  it("readDocument throws NotFoundError for missing file", async () => {
    const m = await getModules();
    await expect(m.readDocument("nonexistent")).rejects.toThrow(m.NotFoundError);
  });

  it("readDocument returns stable etag for unchanged content", async () => {
    const m = await getModules();
    await m.createDocument("stable", "unchanged");
    const r1 = await m.readDocument("stable");
    const r2 = await m.readDocument("stable");
    expect(r1.etag).toBe(r2.etag);
  });

  it("etag changes when content changes", async () => {
    const m = await getModules();
    const created = await m.createDocument("etag-test", "v1");
    const before = await m.readDocument("etag-test");
    expect(before.etag).toBe(created.etag);

    await m.writeDocument("etag-test", "v2", { ifMatch: before.etag });
    const after = await m.readDocument("etag-test");
    expect(after.etag).not.toBe(before.etag);
  });

  it("writeDocument succeeds with matching ifMatch", async () => {
    const m = await getModules();
    await m.createDocument("writable", "original");
    const current = await m.readDocument("writable");
    const result = await m.writeDocument("writable", "updated", {
      ifMatch: current.etag,
    });

    expect(result.content).toBe("updated");
    expect(result.etag).not.toBe(current.etag);
  });

  it("writeDocument throws ConflictError with stale ifMatch", async () => {
    const m = await getModules();
    await m.createDocument("conflict-doc", "v1");
    const { etag: etag1 } = await m.readDocument("conflict-doc");

    // Simulate another writer updating the file directly.
    fs.writeFileSync(
      path.join(dir, "conflict-doc.md"),
      "v2-from-other-writer",
      "utf-8",
    );

    await expect(
      m.writeDocument("conflict-doc", "my-update", { ifMatch: etag1 }),
    ).rejects.toThrow(m.ConflictError);
  });

  it("concurrent writes serialize — one succeeds, the other conflicts", async () => {
    const m = await getModules();
    await m.createDocument("concurrent", "initial");
    const { etag } = await m.readDocument("concurrent");

    // Two concurrent writes with the same etag.
    const w1 = m.writeDocument("concurrent", "write-1", { ifMatch: etag });
    const w2 = m.writeDocument("concurrent", "write-2", { ifMatch: etag });

    const results = await Promise.allSettled([w1, w2]);

    const fulfilled = results.filter(
      (r) => r.status === "fulfilled",
    );
    const rejected = results.filter(
      (r) => r.status === "rejected",
    );

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(m.ConflictError);
  });

  it("deleteDocument removes the file", async () => {
    const m = await getModules();
    await m.createDocument("deleteme", "gone");
    await m.deleteDocument("deleteme");
    expect(fs.existsSync(path.join(dir, "deleteme.md"))).toBe(false);
    await expect(m.readDocument("deleteme")).rejects.toThrow(m.NotFoundError);
  });

  it("deleteDocument throws NotFoundError for missing file", async () => {
    const m = await getModules();
    await expect(m.deleteDocument("nonexistent")).rejects.toThrow(m.NotFoundError);
  });

  it("listDocuments returns empty array when no .md files", async () => {
    const m = await getModules();
    const docs = await m.listDocuments();
    expect(docs).toEqual([]);
  });

  it("listDocuments returns metadata sorted by modifiedAt desc", async () => {
    const m = await getModules();
    await m.createDocument("first", "# First");
    // Small delay to ensure different mtime.
    await new Promise((r) => setTimeout(r, 10));
    await m.createDocument("second", "# Second");

    const docs = await m.listDocuments();
    expect(docs.length).toBe(2);
    expect(docs[0].id).toBe("second");
    expect(docs[0].title).toBe("Second");
    expect(docs[1].id).toBe("first");
    expect(docs[1].title).toBe("First");
  });

  it("listDocuments extracts title from first H1", async () => {
    const m = await getModules();
    await m.createDocument("with-h1", "# My Great Title\n\nBody text");
    const docs = await m.listDocuments();
    expect(docs[0].title).toBe("My Great Title");
  });

  it("listDocuments falls back to filename when no H1", async () => {
    const m = await getModules();
    await m.createDocument("no-heading", "Just body text, no heading");
    const docs = await m.listDocuments();
    expect(docs[0].title).toBe("no-heading");
  });

  it("rejects traversal ID on all operations", async () => {
    const m = await getModules();
    const traversalId = "../../etc/passwd";

    await expect(m.createDocument(traversalId, "x")).rejects.toThrow(m.BadRequestError);
    await expect(m.readDocument(traversalId)).rejects.toThrow(m.BadRequestError);
    await expect(
      m.writeDocument(traversalId, "x", { ifMatch: '"any"' }),
    ).rejects.toThrow(m.BadRequestError);
    await expect(m.deleteDocument(traversalId)).rejects.toThrow(m.BadRequestError);
  });
});
