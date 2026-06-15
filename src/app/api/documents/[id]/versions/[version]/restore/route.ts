import type { NextRequest } from "next/server";
import { z } from "zod";

import { readVersion } from "@/lib/collab/versioning-read";
import { readDocument, writeDocument } from "@/lib/documents";
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
 * POST /api/documents/[id]/versions/[version]/restore
 * Restore a version to current (creates new version after restore).
 *
 * Collab modules are dynamically imported so Turbopack does not pull Yjs
 * into the module graph for read-only version routes.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
): Promise<Response> {
  try {
    const { id, version } = await params;
    const versionNum = VersionParamSchema.parse(version);

    const record = await readVersion(id, versionNum);
    const restoredMd = record.md;

    const currentDoc = await readDocument(id);
    const result = await writeDocument(id, restoredMd, { ifMatch: currentDoc.etag });

    try {
      const { reconcileDocumentFromDisk } = await import(
        "@/lib/collab/reconcile-external"
      );
      await reconcileDocumentFromDisk(id, restoredMd);
    } catch {
      // Best-effort — disk write already succeeded.
    }

    try {
      const { createVersion } = await import("@/lib/collab/versioning");
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
