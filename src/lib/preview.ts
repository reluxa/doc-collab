/**
 * Server-side document preview generation.
 *
 * Pipeline: extract first ~40 lines of Markdown → parse to mdast →
 * render to PDF via existing `renderMarkdownToPdf()` → convert first
 * PDF page to PNG via `pdfjs-dist` + `node-canvas`.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdown } from "./markdown";
import { resolvePreviewPath, PREVIEW_DIR_NAME } from "./security";
import { DOCS_ROOT } from "./config";

// ---------------------------------------------------------------------------
// Preview content extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first ~40 lines of Markdown for preview rendering.
 */
export function extractPreviewContent(
  markdown: string,
  maxLines = 40,
): string {
  return markdown.split("\n").slice(0, maxLines).join("\n");
}

// ---------------------------------------------------------------------------
// Preview PDF building
// ---------------------------------------------------------------------------

/**
 * Build a PDF for preview from Markdown content.
 * Reuses the existing styled PDF pipeline for visual consistency.
 */
export async function buildPreviewPdf(markdown: string): Promise<Uint8Array> {
  const { renderMarkdownToPdf } = await import("./pdf");
  const parsed = await parseMarkdown(markdown);
  return renderMarkdownToPdf(parsed);
}

// ---------------------------------------------------------------------------
// PDF → PNG rendering (pdfjs-dist 4.x + node-canvas)
// ---------------------------------------------------------------------------

let pdfjsInitialized = false;

async function initPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsInitialized) {
    return import("pdfjs-dist");
  }
  pdfjsInitialized = true;
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerPort = null;
  pdfjs.GlobalWorkerOptions.workerSrc = `${path.resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  )}`;

  return pdfjs;
}

/**
 * Render a PDF buffer to a PNG using pdfjs-dist + node-canvas.
 */
export async function renderPreviewFromPdf(
  pdfBuffer: Uint8Array,
  _scale = 2,
): Promise<Buffer> {
  const pdfjs = await initPdfjs();
  const { getDocument } = pdfjs;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require("canvas");

  // Create a custom canvas factory for pdfjs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeCanvasFactory = class {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      return { canvas, context };
    }
    destroy() {
      // node-canvas doesn't require explicit cleanup
    }
  };

  // Load PDF with custom canvas factory (CanvasFactory in pdfjs 4.x)
  // pdfjs-dist 4.x requires Uint8Array, not Buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CanvasFactory: new NodeCanvasFactory() as any,
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = createCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height),
  );
  const ctx = canvas.getContext("2d");

  // Render the page
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (page as any).render({
    canvasContext: ctx,
    viewport,
    background: "white",
  }).promise;

  return canvas.toBuffer("image/png") as Buffer;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a preview thumbnail for a document (best-effort).
 */
export async function generatePreview(
  documentId: string,
  content: string,
): Promise<void> {
  try {
    const excerpt = extractPreviewContent(content);
    const pdfBuffer = await buildPreviewPdf(excerpt);
    const pngBuffer = await renderPreviewFromPdf(pdfBuffer);

    const previewDir = path.resolve(DOCS_ROOT, PREVIEW_DIR_NAME);
    await fs.mkdir(previewDir, { recursive: true });

    const previewPath = resolvePreviewPath(documentId);
    await fs.writeFile(previewPath, pngBuffer);
  } catch (err) {
    console.warn(
      `[preview] Failed to generate preview for "${documentId}":`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Delete a preview thumbnail for a document.
 */
export async function deletePreview(documentId: string): Promise<void> {
  try {
    const previewPath = resolvePreviewPath(documentId);
    await fs.unlink(previewPath);
  } catch {
    // Preview may not exist — ignore
  }
}
