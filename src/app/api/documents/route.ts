import { z } from "zod";

import { getVersionCount } from "@/lib/collab/versioning-read";
import {
  BadRequestError,
  ConflictError,
  createDocument,
  ForbiddenError,
  NotFoundError,
} from "@/lib/documents";
import { listDocumentsCached } from "@/lib/document-list-cache";
import { ID_PATTERN } from "@/lib/security";

const createSchema = z.object({
  id: z.string().regex(ID_PATTERN, "Invalid document id"),
  content: z.string(),
});

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

/** GET /api/documents — list all documents. */
export async function GET(): Promise<Response> {
  try {
    const docs = await listDocumentsCached();
    // Add version count to each document.
    const docsWithCounts = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        versionCount: await getVersionCount(doc.id),
      })),
    );
    return Response.json(docsWithCounts);
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}

/** POST /api/documents — create a new document. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const result = await createDocument(parsed.id, parsed.content);
    return Response.json(result, {
      status: 201,
      headers: { ETag: result.etag },
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    return errorToResponse(err);
  }
}
