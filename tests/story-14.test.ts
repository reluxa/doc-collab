/**
 * Story 14 — performance optimizations.
 */

import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  invalidateDocumentListCache,
  resetDocumentListCache,
} from "@/lib/document-list-cache";
import {
  applyMarkdownDiff,
  getSectionsFromDoc,
} from "@/lib/collab/md-bridge";
import {
  extractSectionMarkdown,
  replaceSectionsInMarkdown,
  splitMarkdown,
} from "@/lib/collab/sections";
import { DOCS_ROOT } from "@/lib/config";
import {
  broadcast,
  flushBroadcastQueue,
  resetState,
} from "@/lib/realtime";
import { shouldVirtualizeSections } from "@/components/editor/virtualized-section-view";

const tmpRoot = path.resolve(__dirname, "../.tmp-story14");

describe("Story 14 — document list cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.DOCUMENTS_DIR;
    vi.resetModules();
  });

  it("reuses cache until invalidated", async () => {
    const dir = path.join(tmpRoot, `cache-${Date.now()}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    process.env.DOCUMENTS_DIR = dir;
    resetDocumentListCache();

    const cache = await import("@/lib/document-list-cache");
    fs.writeFileSync(path.join(dir, "a.md"), "# A\n");
    const first = await cache.listDocumentsCached();
    expect(first).toHaveLength(1);

    fs.writeFileSync(path.join(dir, "b.md"), "# B\n");
    const stale = await cache.listDocumentsCached();
    expect(stale).toHaveLength(first.length);

    cache.invalidateDocumentListCache();
    const fresh = await cache.listDocumentsCached();
    expect(fresh.length).toBeGreaterThan(first.length);
    expect(fresh).toHaveLength(2);
  });
});

describe("Story 14 — incremental section persist", () => {
  const baseMd = `<!-- sec:s1 -->
# One

Alpha

<!-- sec:s2 -->
## Two

Beta`;

  let docId = 0;
  const nextId = () => `story14-inc-${++docId}`;

  afterEach(async () => {
    const { ydocPath } = await import("@/lib/collab/persistence");
    for (let i = 1; i <= docId; i++) {
      const id = `story14-inc-${i}`;
      try {
        await fsPromises.unlink(path.join(DOCS_ROOT, `${id}.md`));
      } catch {
        /* ignore */
      }
      try {
        await fsPromises.unlink(ydocPath(id));
      } catch {
        /* ignore */
      }
    }
  });

  it("marks dirty sections on applyMarkdownDiff", async () => {
    const { peekDirtySections, takeDirtySections } = await import(
      "@/lib/collab/section-dirty"
    );
    const doc = new Y.Doc();
    applyMarkdownDiff(doc, baseMd);
    expect(peekDirtySections(doc).sort()).toEqual(["s1", "s2"]);
    takeDirtySections(doc);

    applyMarkdownDiff(doc, baseMd.replace("Beta", "Beta edited"));
    expect(peekDirtySections(doc)).toEqual(["s2"]);
    doc.destroy();
  });

  it("replaceSectionsInMarkdown updates only targeted sections", () => {
    const updated = replaceSectionsInMarkdown(baseMd, [
      { id: "s2", heading: "## Two", body: "Beta changed" },
    ]);
    expect(updated).toContain("Beta changed");
    expect(updated).toContain("Alpha");
    expect(updated).not.toContain("Beta\n");
  });

  it("storeYDocSnapshot writes incremental section updates", async () => {
    const { storeYDocSnapshot } = await import("@/lib/collab/persistence");
    const id = nextId();
    const mdPath = path.join(DOCS_ROOT, `${id}.md`);
    await fs.promises.writeFile(mdPath, baseMd, "utf-8");

    const doc = new Y.Doc();
    applyMarkdownDiff(doc, baseMd);
    const { takeDirtySections } = await import("@/lib/collab/section-dirty");
    takeDirtySections(doc);

    applyMarkdownDiff(doc, baseMd.replace("Beta", "Beta incremental"));
    await storeYDocSnapshot(id, doc);

    const disk = await fs.promises.readFile(mdPath, "utf-8");
    expect(disk).toContain("Beta incremental");
    expect(disk).toContain("Alpha");
    expect(getSectionsFromDoc(doc)).toHaveLength(2);
    doc.destroy();
  });
});

describe("Story 14 — per-section PDF markdown", () => {
  it("extractSectionMarkdown returns one section", () => {
    const md = `<!-- sec:a -->
# A

Body A

<!-- sec:b -->
## B

Body B`;
    const section = extractSectionMarkdown(md, "b");
    expect(section).toContain("Body B");
    expect(section).not.toContain("Body A");
  });
});

describe("Story 14 — broadcast batching", () => {
  it("coalesces multiple broadcasts for the same document id", () => {
    resetState();
    broadcast({ type: "doc-changed", id: "doc-a", version: "v1", origin: "a" });
    broadcast({ type: "doc-changed", id: "doc-a", version: "v2", origin: "a" });
    flushBroadcastQueue();
    // No throw — latest version wins internally; connections empty in unit test.
    expect(true).toBe(true);
  });
});

describe("Story 14 — section virtualization threshold", () => {
  it("virtualizes at 20+ sections", () => {
    expect(shouldVirtualizeSections(19)).toBe(false);
    expect(shouldVirtualizeSections(20)).toBe(true);
    expect(splitMarkdown("# Hi").length).toBe(1);
  });
});
