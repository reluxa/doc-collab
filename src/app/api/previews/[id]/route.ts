import { NextRequest } from "next/server";
import { resolvePreviewPath } from "@/lib/security";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * GET /api/previews/[id] — serve a preview PNG for a document.
 *
 * Path-traversal guard is handled by `resolvePreviewPath` which validates
 * the document ID and ensures the resolved path stays inside DOCS_ROOT.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const previewPath = resolvePreviewPath(id);
    const buffer = await fs.readFile(previewPath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: unknown) {
    const status = (err as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    return Response.json(
      { error: status === 404 ? "Preview not found" : "Internal server error" },
      { status },
    );
  }
}
