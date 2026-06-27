import type { NextRequest } from "next/server";

import {
  BadRequestError,
  ConflictError,
  deleteDocument,
  ForbiddenError,
  NotFoundError,
  readDocument,
  writeDocument,
} from "../../../../lib/documents";

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
  if (err instanceof ConflictError) {
    return Response.json({ error: err.message }, { status: 409 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** GET /api/documents/[id] — read a document (returns Markdown + ETag). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = decodeURIComponent((await params).id);
    const doc = await readDocument(id);
    return Response.json(doc, {
      headers: { "ETag": doc.etag },
    });
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}

/** PUT /api/documents/[id] — full-content replace with optimistic concurrency. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Resolve id once (Next.js 16: params are async).
  const id = decodeURIComponent((await params).id);

  try {
    const ifMatch = request.headers.get("If-Match");

    if (!ifMatch) {
      return Response.json(
        { error: "If-Match header is required" },
        { status: 428 },
      );
    }

    const body = await request.json();
    const content = typeof body === "string" ? body : (body.content ?? "");

    const result = await writeDocument(id, content, { ifMatch });
    return Response.json(result, {
      headers: { "ETag": result.etag },
    });
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      // Return current content + ETag so the client can reconcile.
      try {
        const current = await readDocument(id);
        return Response.json(
          { error: err.message, ...current },
          {
            status: 409,
            headers: { "ETag": current.etag },
          },
        );
      } catch {
        return Response.json({ error: err.message }, { status: 409 });
      }
    }
    return errorToResponse(err);
  }
}

/** DELETE /api/documents/[id] — delete a document. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = decodeURIComponent((await params).id);
    await deleteDocument(id);
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
