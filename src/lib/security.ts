import path from "node:path";

import { DOCS_ROOT } from "./config";
import { BadRequestError, ForbiddenError } from "./errors";

/**
 * Allowed document ID pattern.
 * Letters, digits, hyphens, underscores. 1–128 characters.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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
  if (!ID_PATTERN.test(id)) {
    throw new BadRequestError(`Invalid document id: "${id}"`);
  }

  const target = path.resolve(DOCS_ROOT, `${id}.md`);

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
  if (!ID_PATTERN.test(id)) {
    throw new BadRequestError(`Invalid document id: "${id}"`);
  }

  const target = path.resolve(DOCS_ROOT, PREVIEW_DIR_NAME, `${id}.png`);

  // Defense in depth: verify the resolved path is still under DOCS_ROOT.
  const rel = path.relative(DOCS_ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ForbiddenError("Resolved path escapes documents directory");
  }

  return target;
}
