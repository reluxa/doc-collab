import type { NextRequest } from "next/server";
import { z } from "zod";

import { readVersion, createVersion } from "@/lib/collab/versioning";
import { readDocument } from "@/lib/documents";
import { reconcileDocumentFromDisk } from "@/lib/collab/reconcile-external";
import {
  BadRequestError,
  NotFoundError,
} from "@/lib/errors";

/** Validate version number at boundary. */
const VersionParamSchema = z.coerce
  .number()
  .int()
  .positive();

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
 * GET /api/documents/[id]/versions/[version]
 * Read a single version (metadata + md snapshot for preview).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
): Promise<Response> {
  try {
    const { id, version } = await params;
    const versionNum = VersionParamSchema.parse(version);
    const { readVersion: readV } = await import("@/lib/collab/versioning-read");
    const record = await readV(id, versionNum);
    return Response.json(record);
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}

/**
 * POST /api/documents/[id]/versions/[version]/restore
 * Restore a version to current (creates new version after restore).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
): Promise<Response> {
  try {
    const { id, version } = await params;
    const versionNum = VersionParamSchema.parse(version);

    // Read the version's Markdown.
    const { readVersion: readV } = await import("@/lib/collab/versioning-read");
    const record = await readV(id, versionNum);
    const restoredMd = record.md;

    // Write the restored content to disk.
    const currentDoc = await readDocument(id);
    const { writeDocument } = await import("@/lib/documents");
    const result = await writeDocument(id, restoredMd, { ifMatch: currentDoc.etag });

    // Reconcile into live Y.Doc so browsers see it live.
    try {
      await reconcileDocumentFromDisk(id, restoredMd);
    } catch {
      // Best-effort — disk write already succeeded.
    }

    // Create a new version capturing the restored state.
    try {
      await createVersion(id, {
        trigger: "manual",
        author: "human",
        markdown: restoredMd,
        etag: result.etag,
      });
    } catch {
      // Best-effort.
    }

    return Response.json({
      message: `Restored version ${versionNum}`,
      newEtag: result.etag,
    });
  } catch (err: unknown) {
    return errorToResponse(err);
  }
}
