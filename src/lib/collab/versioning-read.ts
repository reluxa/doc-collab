/**
 * Read-only version operations (no Yjs dependency).
 * Used by API routes that only list/read versions.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";

import { DOCS_ROOT } from "@/lib/config";
import { resolveDocPath } from "@/lib/security";
import { NotFoundError, BadRequestError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of zero-padding digits for version filenames. */
const VERSION_PADDING_DIGITS = 6;

/** Name of the per-document versions subdirectory. */
const VERSIONS_DIR_NAME = "__versions__";

/**
 * Validated version record (read from disk).
 * Zod schema validates structure but md is large so we only validate
 * the metadata subset on list, and full record on read.
 */
const VersionMetaSchema = z.object({
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  trigger: z.enum(["user-save", "agent-edit", "manual", "periodic"]),
  author: z.enum(["human", "agent", "system"]),
  summary: z.string(),
});

const VersionRecordSchema = VersionMetaSchema.extend({
  md: z.string(),
  etag: z.string(),
  ydocStateVector: z.string(),
});

export type VersionMeta = z.infer<typeof VersionMetaSchema>;
type VersionRecord = z.infer<typeof VersionRecordSchema>;

function validateVersionRecord(raw: unknown): VersionRecord {
  return VersionRecordSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the __versions__ directory for a document, with path-traversal
 * safety. Validates the document id first via resolveDocPath.
 */
export function resolveVersionsDir(documentId: string): string {
  resolveDocPath(documentId);
  const versionsDir = path.join(DOCS_ROOT, documentId, VERSIONS_DIR_NAME);
  const rel = path.relative(DOCS_ROOT, versionsDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Resolved path escapes documents directory");
  }
  return versionsDir;
}

function versionFilePath(versionsDir: string, version: number): string {
  const filename = `${String(version).padStart(VERSION_PADDING_DIGITS, "0")}.json`;
  return path.join(versionsDir, filename);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List version metadata for a document, newest-first.
 */
export async function listVersions(documentId: string): Promise<VersionMeta[]> {
  const versionsDir = resolveVersionsDir(documentId);

  let entries: string[];
  try {
    entries = await fs.readdir(versionsDir);
  } catch {
    return [];
  }

  const results: VersionMeta[] = [];

  for (const entry of entries) {
    const match = entry.match(/^(\d+)\.json$/);
    if (!match) continue;

    const filePath = versionFilePath(versionsDir, parseInt(match[1], 10));
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const record = validateVersionRecord(JSON.parse(raw));
      results.push({
        version: record.version,
        timestamp: record.timestamp,
        trigger: record.trigger,
        author: record.author,
        summary: record.summary,
      });
    } catch {
      // Skip corrupt files.
    }
  }

  results.sort((a, b) => b.version - a.version);
  return results;
}

/**
 * Read a single version's full record (metadata + Markdown snapshot).
 */
export async function readVersion(
  documentId: string,
  version: number,
): Promise<VersionRecord> {
  const versionsDir = resolveVersionsDir(documentId);
  const filePath = versionFilePath(versionsDir, version);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    throw new NotFoundError(`Version ${version} not found for document ${documentId}`);
  }

  const record = validateVersionRecord(JSON.parse(raw));
  return record;
}

/**
 * Get the version count (highest version number, 0 if none).
 */
export async function getVersionCount(documentId: string): Promise<number> {
  try {
    const versionsDir = resolveVersionsDir(documentId);
    const entries = await fs.readdir(versionsDir);
    let max = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)\.json$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max;
  } catch {
    return 0;
  }
}
