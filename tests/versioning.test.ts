import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createVersion,
  deleteVersions,
  getVersionCount,
  listVersions,
  readVersion,
  resolveVersionsDir,
  startPeriodicVersionTimer,
  stopAllPeriodicTimers,
  stopPeriodicVersionTimer,
  resetVersionTimers,
} from "@/lib/collab/versioning";
import { DOCS_ROOT } from "@/lib/config";

// ---------------------------------------------------------------------------
// Test isolation: unique IDs per run, thorough cleanup
// ---------------------------------------------------------------------------

/** Unique prefix for this test run to avoid cross-run collisions. */
const runId = Date.now();

function testId(name: string): string {
  return `v${runId}-${name}`;
}

/** Remove a test document AND its version directory completely. */
async function cleanupDoc(id: string): Promise<void> {
  // Remove versions dir (may not exist).
  const vDir = path.join(DOCS_ROOT, id, "__versions__");
  try {
    await fs.rm(vDir, { recursive: true, force: true });
  } catch {
    // Ignore.
  }
  // Remove the doc dir itself (may have been created lazily).
  const docDir = path.join(DOCS_ROOT, id);
  try {
    await fs.rm(docDir, { recursive: true, force: true });
  } catch {
    // Ignore.
  }
  // Remove the .md file.
  try {
    await fs.unlink(path.join(DOCS_ROOT, `${id}.md`));
  } catch {
    // Ignore.
  }
}

afterEach(async () => {
  stopAllPeriodicTimers();
  resetVersionTimers();
});

// ---------------------------------------------------------------------------
// resolveVersionsDir: path safety
// ---------------------------------------------------------------------------

describe("resolveVersionsDir", () => {
  test("rejects path traversal ids", () => {
    expect(() => resolveVersionsDir("../../etc/passwd")).toThrow();
  });

  test("rejects ids with slashes", () => {
    expect(() => resolveVersionsDir("foo/bar")).toThrow();
  });

  test("accepts valid document ids", () => {
    expect(() => resolveVersionsDir("my-doc")).not.toThrow();
  });

  test("accepts ids with hyphens and underscores", () => {
    expect(() => resolveVersionsDir("my_doc-123")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createVersion
// ---------------------------------------------------------------------------

describe("createVersion", () => {
  test("creates a version file with correct schema", async () => {
    const id = testId("schema");
    const md = "# Test\n\nBody.";
    const etag = `"abc123"`;

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), md, "utf-8");

    const version = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: md,
      etag,
    });

    expect(version).toBe(1);

    const fileContent = await fs.readFile(
      path.join(DOCS_ROOT, id, "__versions__", "000001.json"),
      "utf-8",
    );
    const record = JSON.parse(fileContent);
    expect(record.version).toBe(1);
    expect(record.trigger).toBe("manual");
    expect(record.author).toBe("human");
    expect(record.summary).toBe("Manual save");
    expect(record.md).toBe(md);
    expect(record.etag).toBe(etag);
    expect(typeof record.timestamp).toBe("string");
    expect(record.ydocStateVector).toBe("");

    await cleanupDoc(id);
  });

  test("returns null when content is unchanged (dedup guard)", async () => {
    const id = testId("dedup");
    const md = "# Dedup\n\nSame.";
    const etag = `"dedup-etag"`;

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), md, "utf-8");

    const v1 = await createVersion(id, {
      trigger: "user-save",
      author: "human",
      markdown: md,
      etag,
    });
    expect(v1).toBe(1);

    // Same etag → dedup.
    const v2 = await createVersion(id, {
      trigger: "user-save",
      author: "human",
      markdown: md,
      etag,
    });
    expect(v2).toBeNull();

    // Different content → new version.
    const v3 = await createVersion(id, {
      trigger: "periodic",
      author: "system",
      markdown: "# Dedup\n\nNew.",
      etag: `"new-etag"`,
    });
    expect(v3).toBe(2);

    await cleanupDoc(id);
  });

  test("dedups when only section anchors differ", async () => {
    const id = testId("anchor-dedup");
    const md1 = `# Hi\n\n<!-- sec:a -->\n\nBody`;
    const md2 = `# Hi\n\nBody`;

    const v1 = await createVersion(id, {
      trigger: "user-save",
      author: "human",
      markdown: md1,
    });
    expect(v1).toBe(1);

    const v2 = await createVersion(id, {
      trigger: "user-save",
      author: "human",
      markdown: md2,
    });
    expect(v2).toBeNull();

    await cleanupDoc(id);
  });

  test("creates version directory lazily", async () => {
    const id = testId("lazy");
    const md = "# Lazy\n\nDir.";

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), md, "utf-8");

    const vDir = path.join(DOCS_ROOT, id, "__versions__");
    // Dir shouldn't exist before first version.
    await expect(fs.access(vDir)).rejects.toThrow();

    await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: md,
    });

    // Dir should exist now.
    const stats = await fs.stat(vDir);
    expect(stats.isDirectory()).toBe(true);

    await cleanupDoc(id);
  });

  test("generates sequential version numbers", async () => {
    const id = testId("seq");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Seq", "utf-8");

    const v1 = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: "v1",
      etag: `"1"`,
    });
    expect(v1).toBe(1);

    const v2 = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: "v2",
      etag: `"2"`,
    });
    expect(v2).toBe(2);

    const v3 = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: "v3",
      etag: `"3"`,
    });
    expect(v3).toBe(3);

    // Verify filenames are zero-padded.
    const vDir = path.join(DOCS_ROOT, id, "__versions__");
    const entries = await fs.readdir(vDir);
    expect(entries).toContain("000001.json");
    expect(entries).toContain("000002.json");
    expect(entries).toContain("000003.json");

    await cleanupDoc(id);
  });

  test("stores Yjs state vector when doc is provided", async () => {
    const id = testId("ydoc");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# YDoc", "utf-8");

    const Y = await import("yjs");
    const doc = new Y.Doc();
    const text = doc.getText("test");
    text.insert(0, "hello");

    const version = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: "# YDoc\n\nhello",
      doc,
    });
    expect(version).toBe(1);

    const fileContent = await fs.readFile(
      path.join(DOCS_ROOT, id, "__versions__", "000001.json"),
      "utf-8",
    );
    const record = JSON.parse(fileContent);
    expect(record.ydocStateVector.length).toBeGreaterThan(0);

    doc.destroy();
    await cleanupDoc(id);
  });
});

// ---------------------------------------------------------------------------
// listVersions
// ---------------------------------------------------------------------------

describe("listVersions", () => {
  test("returns versions sorted newest-first", async () => {
    const id = testId("list");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# List", "utf-8");

    await createVersion(id, { trigger: "manual", author: "human", markdown: "v1", etag: `"1"` });
    await createVersion(id, { trigger: "manual", author: "human", markdown: "v2", etag: `"2"` });
    await createVersion(id, { trigger: "agent-edit", author: "agent", markdown: "v3", etag: `"3"` });

    const versions = await listVersions(id);
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(1);
    expect(versions[0].trigger).toBe("agent-edit");
    expect(versions[0].author).toBe("agent");

    await cleanupDoc(id);
  });

  test("returns empty array when no versions exist", async () => {
    const id = testId("empty");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Empty", "utf-8");

    const versions = await listVersions(id);
    expect(versions).toEqual([]);

    await cleanupDoc(id);
  });
});

// ---------------------------------------------------------------------------
// readVersion
// ---------------------------------------------------------------------------

describe("readVersion", () => {
  test("returns full version record including md", async () => {
    const id = testId("read");
    const md = "# Read Test\n\nFull content here.";

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), md, "utf-8");

    const v = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: md,
      etag: `"read-etag"`,
    });
    expect(v).toBe(1);

    const record = await readVersion(id, 1);
    expect(record.version).toBe(1);
    expect(record.md).toBe(md);
    expect(record.etag).toBe(`"read-etag"`);
    expect(record.summary).toBe("Manual save");

    await cleanupDoc(id);
  });

  test("throws NotFoundError for non-existent version", async () => {
    const id = testId("notfound");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# NF", "utf-8");

    await expect(readVersion(id, 99)).rejects.toThrow(/not found/i);

    await cleanupDoc(id);
  });

  test("throws BadRequestError for invalid version number", async () => {
    const id = testId("invalid");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Inv", "utf-8");

    await expect(readVersion(id, -1)).rejects.toThrow(/Invalid version number/i);
    await expect(readVersion(id, 0)).rejects.toThrow(/Invalid version number/i);

    await cleanupDoc(id);
  });
});

// ---------------------------------------------------------------------------
// deleteVersions
// ---------------------------------------------------------------------------

describe("deleteVersions", () => {
  test("removes all version files and the versions directory", async () => {
    const id = testId("del");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Del", "utf-8");
    await createVersion(id, { trigger: "manual", author: "human", markdown: "a", etag: `"a"` });
    await createVersion(id, { trigger: "manual", author: "human", markdown: "b", etag: `"b"` });

    const vDir = path.join(DOCS_ROOT, id, "__versions__");
    expect((await fs.readdir(vDir)).length).toBe(2);

    const deleted = await deleteVersions(id);
    expect(deleted).toBe(2);

    // Dir should be gone.
    await expect(fs.access(vDir)).rejects.toThrow();

    // Document itself still exists.
    const docStats = await fs.access(path.join(DOCS_ROOT, `${id}.md`)).then(
      () => true,
      () => false,
    );
    expect(docStats).toBe(true);

    await cleanupDoc(id);
  });

  test("returns 0 when no versions exist", async () => {
    const id = testId("del-empty");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Empty Del", "utf-8");

    const deleted = await deleteVersions(id);
    expect(deleted).toBe(0);

    await cleanupDoc(id);
  });
});

// ---------------------------------------------------------------------------
// getVersionCount
// ---------------------------------------------------------------------------

describe("getVersionCount", () => {
  test("returns correct count", async () => {
    const id = testId("count");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Count", "utf-8");

    expect(await getVersionCount(id)).toBe(0);

    await createVersion(id, { trigger: "manual", author: "human", markdown: "a", etag: `"a"` });
    expect(await getVersionCount(id)).toBe(1);

    await createVersion(id, { trigger: "manual", author: "human", markdown: "b", etag: `"b"` });
    expect(await getVersionCount(id)).toBe(2);

    await cleanupDoc(id);
  });
});

// ---------------------------------------------------------------------------
// Periodic timer
// ---------------------------------------------------------------------------

describe("periodic timer", () => {
  test("starts and stops correctly", () => {
    const checkFn = vi.fn();
    startPeriodicVersionTimer("timer-test", checkFn);
    stopPeriodicVersionTimer("timer-test");
  });

  test("does not create duplicate timers for same document", () => {
    const checkFn = vi.fn();
    startPeriodicVersionTimer("dedup-timer", checkFn);
    startPeriodicVersionTimer("dedup-timer", checkFn);
    stopPeriodicVersionTimer("dedup-timer");
  });
});

// ---------------------------------------------------------------------------
// Zod validation
// ---------------------------------------------------------------------------

describe("version record validation", () => {
  test("rejects corrupt version files during list", async () => {
    const id = testId("corrupt");

    await fs.writeFile(path.join(DOCS_ROOT, `${id}.md`), "# Corrupt", "utf-8");

    const vDir = path.join(DOCS_ROOT, id, "__versions__");
    await fs.mkdir(vDir, { recursive: true });

    // Write a valid version.
    await createVersion(id, { trigger: "manual", author: "human", markdown: "ok", etag: `"ok"` });

    // Write a corrupt file (version 2).
    await fs.writeFile(path.join(vDir, "000002.json"), "not valid json", "utf-8");

    // listVersions should skip corrupt files and return valid ones.
    const versions = await listVersions(id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);

    await cleanupDoc(id);
  });
});
