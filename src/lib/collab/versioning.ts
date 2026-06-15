/**
 * Version snapshot engine (Story 15).
 *
 * Captures point-in-time snapshots of each document. Triggers:
 *   - User save after debounced persist flush
 *   - Agent edit after CRDT transaction settles
 *   - Manual snapshot from the UI
 *   - Periodic timer (every 5 min during active sessions)
 *
 * Storage: `documents/<id>/__versions__/NNNNNN.json`
 *
 * This module lives in `lib/collab` because it imports Yjs. No Next/React
 * imports — it is usable from both the web server and MCP server.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type * as Y from "yjs";
import { z } from "zod";

import { DOCS_ROOT } from "../config";
import { resolveDocPath } from "../security";
import { NotFoundError, BadRequestError } from "../errors";

// ---------------------------------------------------------------------------
// Constants (§2 — no magic values)
// ---------------------------------------------------------------------------

/** How often the periodic timer fires (5 minutes). */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;

/** Number of zero-padding digits for version filenames. */
const VERSION_PADDING_DIGITS = 6;

/** Directory name for version snapshots inside a document's folder. */
export const VERSIONS_DIR_NAME = "__versions__";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a version snapshot was triggered. */
export type VersionTrigger =
  | "user-save"
  | "agent-edit"
  | "manual"
  | "periodic";

/** Who caused the snapshot. */
export type VersionAuthor = "human" | "agent" | "system";

/** Human-readable summary derived from the trigger. */
const TRIGGER_SUMMARY: Record<VersionTrigger, string> = {
  "user-save": "Auto-saved",
  "agent-edit": "Agent edited",
  manual: "Manual save",
  periodic: "Periodic save",
};

/** Full version record stored on disk. */
export interface VersionRecord {
  version: number;
  timestamp: string;
  trigger: VersionTrigger;
  author: VersionAuthor;
  summary: string;
  md: string;
  etag: string;
  ydocStateVector: string;
}

/** Metadata only (no full `md` body) — returned by list endpoints. */
export interface VersionMeta {
  version: number;
  timestamp: string;
  trigger: VersionTrigger;
  author: VersionAuthor;
  summary: string;
}

/** Arguments for creating a version. */
export interface CreateVersionOptions {
  trigger: VersionTrigger;
  author: VersionAuthor;
  /** Optional Y.Doc for state vector + md serialization. */
  doc?: Y.Doc;
  /** Optional pre-serialized Markdown (avoids re-serializing from Y.Doc). */
  markdown?: string;
  /** Optional pre-computed etag. */
  etag?: string;
}

// ---------------------------------------------------------------------------
// Validation schemas (§2 — boundaries validated)
// ---------------------------------------------------------------------------

const VersionRecordSchema = z.object({
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  trigger: z.enum(["user-save", "agent-edit", "manual", "periodic"]),
  author: z.enum(["human", "agent", "system"]),
  summary: z.string().min(1).max(256),
  md: z.string(),
  etag: z.string(),
  ydocStateVector: z.string(),
});

const VersionNumberSchema = z.coerce
  .number()
  .int()
  .positive()
  .describe("Version number");

/**
 * Validate a parsed version record against the schema.
 * Throws BadRequestError on invalid data.
 */
function validateVersionRecord(raw: unknown): VersionRecord {
  const parsed = VersionRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      `Invalid version record: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the `__versions__` directory for a document id.
 *
 * Validates the id through `resolveDocPath` first, then constructs the
 * version subdirectory path and verifies it stays inside DOCS_ROOT.
 *
 * @throws BadRequestError if the id is invalid
 * @throws ForbiddenError if the resolved path escapes DOCS_ROOT
 */
export function resolveVersionsDir(documentId: string): string {
  // Validate the document id itself (rejects path traversal chars).
  resolveDocPath(documentId);
  // The versions dir is: DOCS_ROOT/<id>/__versions__
  const versionsDir = path.join(DOCS_ROOT, documentId, VERSIONS_DIR_NAME);

  // Defense in depth: ensure the versions dir is still inside DOCS_ROOT.
  const rel = path.relative(DOCS_ROOT, versionsDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Resolved path escapes documents directory");
  }
  return versionsDir;
}

/**
 * Get the file path for a specific version number.
 */
function versionFilePath(versionsDir: string, version: number): string {
  const filename = `${String(version).padStart(VERSION_PADDING_DIGITS, "0")}.json`;
  return path.join(versionsDir, filename);
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

/**
 * Get the next sequential version number for a document.
 * Reads existing version files and returns the next unused number.
 */
async function nextVersionNumber(versionsDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(versionsDir);
  } catch {
    return 1;
  }

  let max = 0;
  for (const entry of entries) {
    const match = entry.match(/^(\d+)\.json$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max + 1;
}

/**
 * Get the highest existing version number (0 if no versions exist).
 */
async function highestVersionNumber(versionsDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(versionsDir);
  } catch {
    return 0;
  }

  let max = 0;
  for (const entry of entries) {
    const match = entry.match(/^(\d+)\.json$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max;
}

/**
 * Compute a SHA-256 etag for content.
 */
function computeContentEtag(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `"${hash}"`;
}

/**
 * Get the last version's etag for dedup comparison.
 */
async function lastVersionEtag(versionsDir: string): Promise<string | null> {
  const max = await highestVersionNumber(versionsDir);
  if (max === 0) return null;
  const filePath = versionFilePath(versionsDir, max);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const record = validateVersionRecord(JSON.parse(raw));
    return record.etag;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Periodic timer state
// ---------------------------------------------------------------------------

interface PeriodicTimerState {
  interval: ReturnType<typeof setInterval> | null;
  active: boolean;
}

/** Per-document periodic timers. Shared across module instances via globalThis. */
const globalForTimers = globalThis as unknown as {
  __docCollabVersionTimers?: Map<string, PeriodicTimerState>;
};

function getTimerStore(): Map<string, PeriodicTimerState> {
  if (!globalForTimers.__docCollabVersionTimers) {
    globalForTimers.__docCollabVersionTimers = new Map();
  }
  return globalForTimers.__docCollabVersionTimers;
}

/**
 * Start a periodic version timer for a document.
 * Creates a version snapshot every VERSION_INTERVAL_MS if the document
 * has changes since the last version.
 *
 * Only one timer exists per document (not per connection).
 */
export function startPeriodicVersionTimer(
  documentId: string,
  checkFn: () => Promise<void>,
): void {
  const store = getTimerStore();
  let state = store.get(documentId);

  if (state?.active) {
    // Timer already running for this document.
    return;
  }

  const interval = setInterval(async () => {
    try {
      await checkFn();
    } catch {
      // Silently ignore periodic timer errors (logged by caller).
    }
  }, VERSION_INTERVAL_MS);

  state = { interval, active: true };
  store.set(documentId, state);
}

/**
 * Stop the periodic version timer for a document.
 */
export function stopPeriodicVersionTimer(documentId: string): void {
  const store = getTimerStore();
  const state = store.get(documentId);

  if (state?.interval) {
    clearInterval(state.interval);
    state.interval = null;
    state.active = false;
  }
}

/** Stop all periodic timers (tests / shutdown). */
export function stopAllPeriodicTimers(): void {
  const store = getTimerStore();
  for (const [id] of store) {
    stopPeriodicVersionTimer(id);
  }
}

/** Reset timer state (tests). */
export function resetVersionTimers(): void {
  stopAllPeriodicTimers();
  getTimerStore().clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new version snapshot of a document.
 *
 * Writes a JSON file to `documents/<id>/__versions__/NNNNNN.json`
 * containing the full Markdown snapshot, metadata, and Yjs state vector.
 *
 * Dedup guard: if the content etag matches the last version's etag,
 * no new version is created and `null` is returned.
 *
 * @param documentId  Document id (validated through resolveDocPath).
 * @param opts        Trigger, author, and optional Y.Doc / markdown.
 * @returns The version number if created, or `null` if deduped.
 * @throws BadRequestError if the document id is invalid.
 */
export async function createVersion(
  documentId: string,
  opts: CreateVersionOptions,
): Promise<number | null> {
  const versionsDir = resolveVersionsDir(documentId);
  const md = opts.markdown ?? "";
  const etag = opts.etag ?? computeContentEtag(md);

  // Dedup: skip if content hasn't changed since last version.
  const lastEtag = await lastVersionEtag(versionsDir);
  if (lastEtag === etag) {
    return null;
  }

  // Compute Yjs state vector (for tombstone GC).
  let stateVector: string;
  if (opts.doc) {
    const Ymod = await import("yjs");
    const sv = Ymod.encodeStateVector(opts.doc);
    stateVector = Buffer.from(sv).toString("base64");
  } else {
    stateVector = "";
  }

  const version = await nextVersionNumber(versionsDir);

  const record: VersionRecord = {
    version,
    timestamp: new Date().toISOString(),
    trigger: opts.trigger,
    author: opts.author,
    summary: TRIGGER_SUMMARY[opts.trigger],
    md,
    etag,
    ydocStateVector: stateVector,
  };

  // Create directory lazily.
  await fs.mkdir(versionsDir, { recursive: true });

  const filePath = versionFilePath(versionsDir, version);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");

  return version;
}

/**
 * List all version metadata for a document, newest-first.
 *
 * @param documentId  Document id (validated through resolveDocPath).
 * @returns Array of version metadata, sorted by version descending.
 * @throws BadRequestError if the document id is invalid.
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

  // Sort newest-first.
  results.sort((a, b) => b.version - a.version);
  return results;
}

/**
 * Read a single version's full content (metadata + Markdown snapshot).
 *
 * @param documentId  Document id (validated through resolveDocPath).
 * @param version     The version number to read.
 * @returns The full version record.
 * @throws BadRequestError if the document id or version number is invalid.
 * @throws NotFoundError if the version does not exist.
 */
export async function readVersion(
  documentId: string,
  version: number,
): Promise<VersionRecord> {
  // Validate version number at boundary.
  const parsed = VersionNumberSchema.safeParse(version);
  if (!parsed.success) {
    throw new BadRequestError(`Invalid version number: ${version}`);
  }

  const versionsDir = resolveVersionsDir(documentId);
  const filePath = versionFilePath(versionsDir, parsed.data);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new NotFoundError(
        `Version ${parsed.data} not found for document "${documentId}"`,
      );
    }
    throw err;
  }

  return validateVersionRecord(JSON.parse(raw));
}

/**
 * Delete all version snapshots for a document.
 * Called when the document itself is deleted.
 *
 * @param documentId  Document id (validated through resolveDocPath).
 * @returns The number of versions deleted.
 * @throws BadRequestError if the document id is invalid.
 */
export async function deleteVersions(documentId: string): Promise<number> {
  const versionsDir = resolveVersionsDir(documentId);

  // Stop any periodic timer for this document.
  stopPeriodicVersionTimer(documentId);

  let entries: string[];
  try {
    entries = await fs.readdir(versionsDir);
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    try {
      await fs.unlink(path.join(versionsDir, entry));
      count++;
    } catch {
      // Skip files that can't be deleted.
    }
  }

  // Remove the directory itself.
  try {
    await fs.rmdir(versionsDir);
  } catch {
    // Directory may already be empty/gone.
  }

  return count;
}

/**
 * Get the highest version number for a document.
 *
 * @param documentId  Document id.
 * @returns The highest version number, or 0 if no versions exist.
 */
export async function getVersionCount(documentId: string): Promise<number> {
  try {
    const versionsDir = resolveVersionsDir(documentId);
    return highestVersionNumber(versionsDir);
  } catch {
    return 0;
  }
}

/**
 * Get the current version's metadata (highest version number).
 * Returns null if no versions exist.
 */
export async function getCurrentVersion(
  documentId: string,
): Promise<VersionMeta | null> {
  const versions = await listVersions(documentId);
  return versions.length > 0 ? versions[0] : null;
}

// ---------------------------------------------------------------------------
// Periodic check helper
// ---------------------------------------------------------------------------

/**
 * Check if a document should receive a periodic version snapshot.
 * Compares the current content etag against the last version's etag.
 *
 * @param documentId  Document id.
 * @param currentMd   Current Markdown content.
 * @returns Version number if created, null if deduped.
 */
export async function checkPeriodicSnapshot(
  documentId: string,
  currentMd: string,
): Promise<number | null> {
  return createVersion(documentId, {
    trigger: "periodic",
    author: "system",
    markdown: currentMd,
  });
}
