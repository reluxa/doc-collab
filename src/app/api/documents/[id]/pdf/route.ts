import type { NextRequest } from "next/server";

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  readDocument,
} from "@/lib/documents";
import { extractSectionMarkdown } from "@/lib/collab/sections";
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
 * Generate a PDF from the document's Markdown content.
 * Optional `?section=<section_id>` exports a single section (Story 14).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = decodeURIComponent((await params).id);
    const sectionId = request.nextUrl.searchParams.get("section") ?? undefined;

    const doc = await readDocument(id);

    let markdown = doc.content;
    if (sectionId) {
      const sectionMd = extractSectionMarkdown(doc.content, sectionId);
      if (!sectionMd) {
        throw new NotFoundError(`Section not found: "${sectionId}"`);
      }
      markdown = sectionMd;
    }

    const tree = parseMarkdown(markdown);
    const pdfBytes = await renderMarkdownToPdf(tree);

    const filename = sectionId ? `${id}-${sectionId}.pdf` : `${id}.pdf`;

    return new Response(
      pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": String(pdfBytes.byteLength),
        },
      },
    );
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
