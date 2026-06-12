import type { NextRequest } from "next/server";

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  readDocument,
} from "@/lib/documents";
import { parseMarkdown } from "@/lib/markdown";
import { renderMarkdownToPdf } from "@/lib/pdf";

/** Centralized error → HTTP response mapping. */
function errorToResponse(err: unknown): Response {
  if (err instanceof BadRequestError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ForbiddenError) {
    return Response.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
}

/**
 * GET /api/documents/[id]/pdf
 *
 * Generate a PDF from the document's Markdown content and stream it back.
 *
 * Uses the server-side remark pipeline (shared with `lib/markdown.ts`) to
 * parse Markdown into an mdast tree, then maps nodes to @react-pdf/renderer
 * components. The PDF model is built in memory before bytes are emitted;
 * true chunked-from-source streaming is not supported by the library.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    // Read the document via the shared lib (validates id, resolves path).
    const doc = await readDocument(id);

    // Parse Markdown → mdast (server-side, independent of browser editor).
    const tree = parseMarkdown(doc.content);

    // Render mdast → PDF bytes.
    // NOTE: renderToStream builds the document model in memory before
    // emitting bytes. For MVP document sizes this is acceptable.
    const pdfBytes = await renderMarkdownToPdf(tree);

    return new Response(
      pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${id}.pdf"`,
          "Content-Length": String(pdfBytes.byteLength),
        },
      },
    );
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
