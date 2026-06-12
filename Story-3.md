# Story 3 — REST API route handlers

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 2
**Architecture refs:** §4 (REST API), §4.1 (PUT), §4.2 (ETag/If-Match), §1 note (async params)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Expose the document store over HTTP via Next.js App Router route handlers, with correct verbs, ETag headers, and optimistic concurrency.

## Scope / Tasks

- [ ] `GET /api/documents` → list (id, title, modifiedAt).
- [ ] `POST /api/documents` → create `{ id, content }`; `409` if exists; `400` on invalid id.
- [ ] `GET /api/documents/[id]` → returns Markdown body + `ETag` response header.
- [ ] `PUT /api/documents/[id]` → full-content replace; **requires** `If-Match`; returns new `ETag`; `409 Conflict` (with current content + ETag) on mismatch.
- [ ] `DELETE /api/documents/[id]` → delete; `404` if missing.
- [ ] Centralized error-to-HTTP mapping (`BadRequestError`→400, `ForbiddenError`→403, `NotFoundError`→404, `ConflictError`→409).
- [ ] Use async params: `const { id } = await params;`.
- [ ] Integration tests hitting each route (happy path + error codes).

## Out of scope

- PDF route (Story 6), WebSocket broadcast hook (Story 7/8).

## Technical notes

- All handlers delegate to `src/lib/documents.ts`; no direct fs access in route files.
- `PUT` without `If-Match` should return `428 Precondition Required` (or `400` with a clear message) — pick one and document it.

## Acceptance criteria

- [ ] Each endpoint returns the documented status codes for happy and error paths.
- [ ] **Given** a `GET` returns `ETag: "abc"`, **when** a `PUT` is sent with `If-Match: "abc"` and the file is unchanged, **then** the write succeeds and a new `ETag` is returned.
- [ ] **Given** the file changed since the `ETag` was issued, **when** `PUT` is sent with the stale `If-Match`, **then** the response is `409` including the current content and current `ETag`.
- [ ] A traversal id in the URL yields `400`/`403`, never a file outside `DOCS_ROOT`.
- [ ] Integration tests pass for all routes.
