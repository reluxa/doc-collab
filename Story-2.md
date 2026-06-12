# Story 2 — Document storage library & path security

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 1
**Architecture refs:** §2.2 (ID charset), §2.3 (path-traversal), §4.2 (ETag/locks), §6 (shared by MCP)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Implement the single, hardened filesystem module (`src/lib/documents.ts`) that **all** reads/writes go through — used by both the REST API and the MCP server. This is the only place that touches the filesystem and the only place `resolveDocPath` is called.

## Scope / Tasks

- [ ] Create `src/lib/security.ts`:
  - `ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/`.
  - `resolveDocPath(id)` → validates against `ID_PATTERN`, resolves against `DOCS_ROOT`, and verifies the resolved path stays inside `DOCS_ROOT` (reject `..`/absolute escape). Throws typed `BadRequestError` / `ForbiddenError`.
- [ ] Create `src/lib/documents.ts` with:
  - `listDocuments()` → `[{ id, title, modifiedAt }]` (title = first H1 or filename fallback).
  - `readDocument(id)` → `{ content, etag }` where `etag = sha256(bytes)`.
  - `createDocument(id, content)` → fails if exists.
  - `writeDocument(id, content, { ifMatch })` → optimistic concurrency: re-hash current file under a per-id async mutex; throw `ConflictError` if `ifMatch` mismatches.
  - `deleteDocument(id)`.
- [ ] Implement a lightweight per-document async mutex to serialize read-hash-write.
- [ ] Define typed errors (`BadRequestError`, `ForbiddenError`, `NotFoundError`, `ConflictError`).
- [ ] Unit tests covering: valid/invalid IDs, traversal attempts, ETag generation, If-Match success + conflict, create-exists, delete-missing.

## Out of scope

- HTTP wiring (Story 3) and Markdown conversion (Story 4).

## Technical notes

- ETag is a strong hash of file bytes (clock-skew-free), formatted as a quoted string for HTTP reuse later.
- Keep the module Next-agnostic so the MCP server can import it directly.

## Acceptance criteria

- [ ] **Given** an id `../../etc/passwd`, **when** any function is called, **then** it throws `BadRequestError`/`ForbiddenError` and never touches a path outside `DOCS_ROOT`.
- [ ] **Given** two concurrent `writeDocument` calls with the same stale `ifMatch`, **then** exactly one succeeds and the other throws `ConflictError`.
- [ ] `readDocument` returns a stable `etag` that changes only when content changes.
- [ ] `listDocuments` returns correct titles (H1 or filename) and `modifiedAt`.
- [ ] All unit tests pass; coverage includes every error path above.
