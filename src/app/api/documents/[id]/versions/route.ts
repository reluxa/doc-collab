import type { NextRequest } from "next/server";

import { readDocument } from "@/lib/documents";
import {
  listVersions,
} from "@/lib/collab/versioning-read";
import {
  BadRequestError,
  NotFoundError,
} from "@/lib/errors";

/** Centralized error → HTTP response mapping. */
function errorToResponse(err: unknown): Response {
  if (err instanceof BadRequestError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * GET /api/documents/[id]/versions
 * List version metadata (newest-first).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const versions = await listVersions(id);
    return Response.json(versions);
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}

/**
 * POST /api/documents/[id]/versions
 * Create a manual version snapshot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const doc = await readDocument(id);

    // Dynamic import: only loaded when POST is actually called.
    const { createVersion } = await import("@/lib/collab/versioning");
    const version = await createVersion(id, {
      trigger: "manual",
      author: "human",
      markdown: doc.content,
      etag: doc.etag,
    });

    if (version === null) {
      // Content unchanged — return the last version.
      const last = await listVersions(id);
      return Response.json(
        { message: "No changes since last version", version: last[0] ?? null },
        { status: 200 },
      );
    }

    const versions = await listVersions(id);
    return Response.json({ message: `Created version ${version}`, version: versions[0] });
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
