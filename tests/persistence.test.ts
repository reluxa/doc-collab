/**
 * Unit tests for Y.Doc persistence (Story 12).
 *
 * Covers:
 * - storeYDocSnapshot: writes .md + .ydoc
 * - loadYDocSnapshot: reads .ydoc and applies to new doc
 * - Round-trip: Y.Doc → store → load → Y.Doc content matches
 * - Multiple documents don't interfere
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Y from "yjs";

import { markdownToYDoc, yDocToMarkdown, getSectionsFromDoc } from "@/lib/collab/md-bridge";
import {
  storeYDocSnapshot,
  loadYDocSnapshot,
  ydocPath,
} from "@/lib/collab/persistence";
import { DOCS_ROOT } from "@/lib/config";

// Use unique test document IDs to avoid conflicts.
let testId = 0;
const nextTestId = () => `persistence-test-${++testId}`;

/** Clean up test files after each test. */
async function cleanup(id: string): Promise<void> {
  const mdPath = path.join(DOCS_ROOT, `${id}.md`);
  const ydocFilePath = ydocPath(id);
  try { await fs.unlink(mdPath); } catch { /* ignore */ }
  try { await fs.unlink(ydocFilePath); } catch { /* ignore */ }
}

describe("persistence", () => {
  afterEach(async () => {
    // Clean up any leftover test files.
    for (let i = 1; i <= testId; i++) {
      await cleanup(`persistence-test-${i}`);
    }
  });

  it("stores .md with anchors and content", async () => {
    const id = nextTestId();
    const md = `<!-- sec:s1 -->
# Section 1

Body one

<!-- sec:s2 -->
# Section 2

Body two`;

    const doc = markdownToYDoc(md);
    await storeYDocSnapshot(id, doc);
    doc.destroy();

    const stored = await fs.readFile(path.join(DOCS_ROOT, `${id}.md`), "utf-8");
    expect(stored).toContain("<!-- sec:s1 -->");
    expect(stored).toContain("<!-- sec:s2 -->");
    expect(stored).toContain("Body one");
    expect(stored).toContain("Body two");
  });

  it("stores .ydoc binary snapshot", async () => {
    const id = nextTestId();
    const doc = markdownToYDoc("# Test\n\nContent");
    await storeYDocSnapshot(id, doc);
    doc.destroy();

    const ydocPathFile = ydocPath(id);
    const stats = await fs.stat(ydocPathFile);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("loads snapshot and restores content", async () => {
    const id = nextTestId();
    const md = `<!-- sec:abc -->
# Original

Original body

<!-- sec:def -->
# Second

Second body`;

    const doc = markdownToYDoc(md);
    await storeYDocSnapshot(id, doc);
    doc.destroy();

    // Load snapshot into a new doc.
    const snapshot = await loadYDocSnapshot(id);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.length).toBeGreaterThan(0);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, snapshot!);
    const sections = getSectionsFromDoc(doc2);
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("abc");
    expect(sections[1].id).toBe("def");

    const restored = yDocToMarkdown(doc2);
    expect(restored).toContain("Original body");
    expect(restored).toContain("Second body");

    doc2.destroy();
  });

  it("returns null for nonexistent snapshot", async () => {
    const snapshot = await loadYDocSnapshot("nonexistent-doc-12345");
    expect(snapshot).toBeNull();
  });

  it("multiple documents don't interfere", async () => {
    const id1 = nextTestId();
    const id2 = nextTestId();

    const doc1 = markdownToYDoc("# Doc One\n\nContent one");
    const doc2 = markdownToYDoc("# Doc Two\n\nContent two");

    await storeYDocSnapshot(id1, doc1);
    await storeYDocSnapshot(id2, doc2);
    doc1.destroy();
    doc2.destroy();

    // Load doc1 — should not contain doc2's content.
    const snap1 = await loadYDocSnapshot(id1);
    const restored1 = new Y.Doc();
    Y.applyUpdate(restored1, snap1!);
    const md1 = yDocToMarkdown(restored1);
    expect(md1).toContain("Content one");
    expect(md1).not.toContain("Content two");

    // Load doc2 — should not contain doc1's content.
    const snap2 = await loadYDocSnapshot(id2);
    const restored2 = new Y.Doc();
    Y.applyUpdate(restored2, snap2!);
    const md2 = yDocToMarkdown(restored2);
    expect(md2).toContain("Content two");
    expect(md2).not.toContain("Content one");

    restored1.destroy();
    restored2.destroy();
  });
});
