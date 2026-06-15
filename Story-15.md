# Story 15 — Version snapshot engine

**Phase:** 3 (Versioning) · **Estimate:** 2–3 days · **Depends on:** Story 12, Story 13
**Architecture refs:** §13 (Future Considerations — Document versioning)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Build a durable, event-driven versioning system that captures point-in-time snapshots of each document. Snapshots are triggered by edits (user save, agent edit), manual saves, and a periodic timer for long sessions. The engine stores rendered Markdown + Yjs state vectors so versions can later be previewed, compared, and restored — without preserving every keystroke.

## Scope / Tasks

- [ ] `src/lib/collab/versioning.ts`: core versioning API
  - `createVersion(documentId, metadata)` — snapshot current `.md` + Yjs state vector, write to `__versions__/`, return version number.
  - `listVersions(documentId)` — read and return all version metadata entries, sorted newest-first.
  - `readVersion(documentId, version)` — read a single version's full content (metadata + `md` snapshot).
  - `deleteVersions(documentId)` — remove all versions for a document (called on document delete).
- [ ] Storage layout: `documents/<id>/__versions__/NNNNNN.json` (zero-padded, sequential). Schema:

```json
{
  "version": 1,
  "timestamp": "2026-06-15T12:00:00.000Z",
  "trigger": "user-save",
  "author": "human",
  "summary": "Auto-saved",
  "md": "# My Doc\n\nContent at v1...",
  "ydocStateVector": "<base64 Yjs state vector>"
}
```

- [ ] **Dedup guard:** skip snapshot if the document content hasn't changed since the last version (compare current etag/sha against last version's etag). No duplicate versions.
- [ ] **Snapshot triggers** wired into existing persistence/edit paths:
  - **User save** (`trigger: "user-save"`, `author: "human"`): hook into the debounced save flush in `persistence.ts` / Phase 1 `writeDocument` path. After a successful persist completes, call `createVersion`.
  - **Agent edit** (`trigger: "agent-edit"`, `author: "agent"`): hook into the MCP collab peer after a CRDT transaction from `update_document` / `update_section` settles. Call `createVersion` after persistence flushes.
  - **Manual snapshot** (`trigger: "manual"`, `author: "human"`): expose `createVersion` publicly so Story 16's UI can invoke it via a new API route.
  - **Periodic** (`trigger: "periodic"`, `author: "system"`): a `setInterval` per active document (5-minute interval). On tick, check if the `Y.Doc` has any changes since the last version; if yes, snapshot; if no, no-op.
- [ ] Periodic timer management: start on Hocuspocus `onConnect` / document load, stop on `onDisconnect` / last client disconnect. Use a single shared interval per document (not per connection) to avoid redundant timers.
- [ ] Path-traversal safety: version directory resolution goes through the same guarded pattern as `resolveDocPath`. The `__versions__/` subdirectory is created inside `documents/<id>/` and validated to stay within `DOCS_ROOT`.
- [ ] Version directory created lazily on first snapshot (no empty dirs for documents with no edits yet).
- [ ] Integration with document delete: `deleteDocument(id)` also removes the version directory (or call `deleteVersions` from the delete path).
- [ ] Unit tests covering: snapshot creation, dedup (no-op on unchanged), sequential numbering, storage format validation, version listing ordering, read-back fidelity, path-traversal rejection on version paths, periodic timer start/stop, cleanup on document delete, zod validation of version JSON schema on read.
- [ ] **Constitution compliance:**
  - All magic values are named constants (`VERSION_INTERVAL_MS = 5 * 60 * 1000`, `VERSION_PADDING_DIGITS = 6`, `VERSIONS_DIR_NAME = "__versions__"`, etc.).
  - `versioning.ts` lives in `src/lib/collab/` (collab-aware, not framework-agnostic root). No Next/React imports.
  - Public API functions have doc comments (contract, params, throws, side effects).
  - No `any` types; version JSON is validated with a zod schema on read.
  - Timer cleanup documented (GC path for long-lived state per §10).

## Out of scope

- Version history UI (Story 16).
- Side-by-side diff view (future).
- Retention policies / version limits (future — keep all for now).
- Public REST API for versions (future — Story 16 adds the minimal UI routes).
- Export version history (future).

## Technical notes

- The `md` field stores the full Markdown snapshot — this is what users preview and restore from. No need to re-serialize from Yjs state vectors.
- The `ydocStateVector` stores `Y.encodeStateVector(doc)` as base64. Used for tombstone GC during persistence: when snapshotting, we can call `Y.encodeStateAsUpdate(doc, prevStateVector)` to get only new updates since the last snapshot, then GC.
- The periodic timer should respect `prefers-reduced-motion` / idle detection: if the document hasn't changed in the interval, the tick is a cheap etag comparison (no file I/O).
- Version numbers are zero-padded 6-digit integers (`000001` through `999999`) for lexicographic ordering. If a document exceeds 999999 versions, increment padding (extremely unlikely).
- The version directory is `documents/<id>/__versions__/` — this keeps versions co-located with their document and git-tracked (or `.gitignore`'d if preferred). Consider adding `__versions__/` to `.gitignore` so version history doesn't bloat the repo during development.
- Keep `versioning.ts` in `src/lib/collab/` — it imports Yjs and the persistence layer, so it belongs in the collab module (not the framework-agnostic `lib/` root).

## Acceptance criteria

- [ ] **Given** a user edits and saves a document, **when** the debounced save flushes successfully, **then** a new version snapshot is created with `trigger: "user-save"` and `author: "human"`.
- [ ] **Given** the agent edits a document via `update_section`, **when** the CRDT transaction settles and persistence flushes, **then** a new version is created with `trigger: "agent-edit"` and `author: "agent"`.
- [ ] **Given** a user clicks "Save version" manually, **then** a new version is created immediately with `trigger: "manual"`.
- [ ] **Given** a document is edited continuously for 10 minutes, **then** at least one periodic version exists with `trigger: "periodic"` created approximately every 5 minutes.
- [ ] **Given** a document hasn't changed since the last version, **when** any trigger fires, **then** no duplicate version is created (dedup guard).
- [ ] **Given** `listVersions` is called, **then** versions are returned newest-first with correct metadata (version number, timestamp, trigger, author).
- [ ] **Given** `readVersion` is called for an existing version, **then** the full `md` snapshot and metadata are returned matching what was stored.
- [ ] **Given** a document is deleted, **then** its version directory and all version files are also removed.
- [ ] **Given** a path-traversal id targets a version path, **then** it is rejected before touching the filesystem.
- [ ] Periodic timers are started on document connect and stopped on disconnect (no timer leaks).
- [ ] All unit tests pass; `lib/**` line coverage ≥ 80%.
- [ ] **Constitution checklist:**
  - [ ] `tsc --noEmit` passes strict; zero `any` (or each justified inline with eslint-disable).
  - [ ] All external inputs (version number from API, document id) validated with zod at boundary.
  - [ ] No magic values; all intervals, padding, dir names are named constants.
  - [ ] No path constructed without `resolveDocPath`; traversal inputs rejected (test-proven).
  - [ ] No timer leaks; periodic timer has documented cleanup/GC path.
  - [ ] Public `versioning.ts` functions have doc comments (contract + errors + side effects).
  - [ ] No Next/React imports in `lib/collab/versioning.ts`.
  - [ ] Tests deterministic (fake time, temp dirs, no shared state).
