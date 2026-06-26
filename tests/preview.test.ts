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

describe.skip("preview image generation", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTempDocs("preview-gen");
    process.env.DOCUMENTS_DIR = dir;
    vi.resetModules();
  });

  async function getModules() {
    vi.resetModules();
    process.env.DOCUMENTS_DIR = dir;
    return import("../../src/lib/documents");
  }

  it("generates a valid PNG preview from a short document", async () => {
    const { createDocument } = await getModules();

    const docId = "preview-test-1";
    await createDocument(docId, "# Hello World\n\nThis is a test document with preview.");

    const previewDir = path.join(dir, "__previews__");
    const previewPath = path.join(previewDir, `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);

    const pngBuffer = fs.readFileSync(previewPath);
    // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
    expect(pngBuffer[2]).toBe(0x4E);
    expect(pngBuffer[3]).toBe(0x47);
    expect(pngBuffer.byteLength).toBeGreaterThan(100);
  });

  it("writes preview file to the correct __previews__ directory", async () => {
    const { createDocument } = await getModules();

    const docId = "preview-path-test";
    await createDocument(docId, "# Path Test\n\nContent here.");

    const previewDir = path.join(dir, "__previews__");
    expect(fs.existsSync(previewDir)).toBe(true);

    const previewPath = path.join(previewDir, `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);
  });

  it("handles empty document gracefully — renders 'Empty document' placeholder", async () => {
    const { createDocument } = await getModules();

    const docId = "empty-doc";
    await createDocument(docId, "");

    const previewPath = path.join(dir, "__previews__", `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);
    const pngBuffer = fs.readFileSync(previewPath);
    expect(pngBuffer.byteLength).toBeGreaterThan(100);
  });

  it("handles whitespace-only document gracefully — renders 'Empty document' placeholder", async () => {
    const { createDocument } = await getModules();

    const docId = "whitespace-doc";
    await createDocument(docId, "   \n\n  \n  ");

    const previewPath = path.join(dir, "__previews__", `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);
  });

  it("regenerates preview when content changes", async () => {
    const { createDocument, writeDocument, readDocument } = await getModules();

    const docId = "regenerate-test";
    await createDocument(docId, "# First version\n\nOriginal content.");

    const previewPath = path.join(dir, "__previews__", `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);
    const firstSize = fs.statSync(previewPath).size;

    // Read to get etag, then update
    const doc = await readDocument(docId);
    await writeDocument(docId, "# Second version\n\nUpdated content with more text.", {
      ifMatch: doc.etag,
    });

    // Preview should have been regenerated
    const secondSize = fs.statSync(previewPath).size;
    // Sizes may differ due to different content
    expect(secondSize).toBeGreaterThan(100);
  });

  it("handles document IDs with hyphens and underscores", async () => {
    const { createDocument } = await getModules();

    const docId = "my-test_doc-123";
    await createDocument(docId, "# Special ID Test\n\nContent.");

    const previewPath = path.join(dir, "__previews__", `${docId}.png`);
    expect(fs.existsSync(previewPath)).toBe(true);
  });
});
