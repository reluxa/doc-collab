import path from "node:path";

import { DOCS_ROOT } from "./config";
import { BadRequestError, ForbiddenError } from "./errors";

/**
 * Allowed document ID pattern.
 * Segments of [A-Za-z0-9_-] separated by ':'. No empty segments, max 256 chars.
 * e.g. "note", "meetings:note", "meetings:2024:q1:note"
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/;

/**
 * Extract the folder path (":"-separated prefix) from a document id.
 * "meetings:2024:note" → "meetings:2024"
 * "plain-doc" → null
 */
export function documentFolderPath(id: string): string | null {
  const lastColon = id.lastIndexOf(':');
  if (lastColon === -1) return null;
  return id.slice(0, lastColon);
}

/**
 * Extract folder segments from a document id.
 * "meetings:2024:note" → ["meetings", "2024"]
 * "plain-doc" → []
 */
export function documentFolderParts(id: string): string[] {
  const lastColon = id.lastIndexOf(':');
  if (lastColon === -1) return [];
  return id.slice(0, lastColon).split(':');
}

/** Subdirectory for preview thumbnails inside DOCS_ROOT. */
export const PREVIEW_DIR_NAME = "__previews__";

/**
 * Validates a document ID and resolves it to an absolute filesystem path.
 *
 * Two-layer defense:
 * 1. Pattern rejection — `..`, `/`, `\`, etc. fail immediately.
 * 2. Containment check — the resolved path must stay inside DOCS_ROOT.
 *
 * @throws BadRequestError  if the id does not match ID_PATTERN
 * @throws ForbiddenError   if the resolved path escapes DOCS_ROOT
 */
export function resolveDocPath(id: string): string {
  // URL-decode the id in case the router preserved encoding (e.g. %3A → :).
  // This is a no-op for already-decoded ids.
  const decoded = decodeURIComponent(id);
  if (!ID_PATTERN.test(decoded)) {
    throw new BadRequestError(`Invalid document id: "${decoded}"`);
  }
  if (decoded.length > 128) {
    throw new BadRequestError(`Invalid document id: "${decoded}"`);
  }

  // XXX: file path uses decoded version to match on-disk naming.
  const target = path.resolve(DOCS_ROOT, `${decoded}.md`);

  // Defense in depth: verify the resolved path is still under DOCS_ROOT.
  const rel = path.relative(DOCS_ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ForbiddenError("Resolved path escapes documents directory");
  }

  return target;
}

/**
 * Validates a document ID and resolves it to the preview PNG path.
 *
 * Same two-layer defense as resolveDocPath:
 * 1. Pattern rejection.
 * 2. Containment check.
 *
 * @throws BadRequestError  if the id does not match ID_PATTERN
 * @throws ForbiddenError   if the resolved path escapes DOCS_ROOT
 */
export function resolvePreviewPath(id: string): string {
  const decoded = decodeURIComponent(id);
  if (!ID_PATTERN.test(decoded)) {
    throw new BadRequestError(`Invalid document id: "${decoded}"`);
  }
  if (decoded.length > 128) {
    throw new BadRequestError(`Invalid document id: "${decoded}"`);
  }

  const target = path.resolve(DOCS_ROOT, PREVIEW_DIR_NAME, `${decoded}.png`);

  // Defense in depth: verify the resolved path is still under DOCS_ROOT.
  const rel = path.relative(DOCS_ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ForbiddenError("Resolved path escapes documents directory");
  }

  return target;
}
