# Story 14 — Optimizations

**Phase:** 2 (conflict-free) · **Estimate:** 2–3 days · **Depends on:** Story 12, Story 13
**Architecture refs:** §12 (Optimizations)
**UI refs:** [`ui-design.md`](./ui-design.md) §6.13 (skeletons/shimmer for virtualized list & sheet), §9 (reduced-motion handling)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Apply the performance and resource optimizations enabled by the section model and CRDT, targeting large documents and long-lived sessions.

## Scope / Tasks

- [x] **Section-scoped rendering & lazy loading:** virtualize long documents; load section fragments on demand, showing the sheet skeleton/shimmer from `ui-design.md` §6.13 while a section loads (respect reduced-motion, §9).
- [x] **Incremental Markdown serialization:** re-serialize only dirty sections on persist (track per-section change flags in `md-bridge`).
- [x] **Per-section / streamed PDF:** render PDF section-by-section; allow exporting a single section.
- [x] **CRDT efficiency:** verify delta-encoded updates over the wire; schedule periodic `encodeStateAsUpdate` snapshots + tombstone GC to bound memory.
- [x] **Document-list caching:** cache `/api/documents` metadata, invalidated by watcher events instead of re-reading every file per request.
- [x] **Connection resilience & batching:** provider auto-reconnect with backoff; WS heartbeats; batch outbound broadcasts per tick.

## Out of scope

- New product features; auth/multi-user (future).

## Technical notes

- Each optimization should be measurable; capture a simple before/after metric where feasible.
- Optimizations must not change observable correctness (CRDT convergence, round-trip stability).

## Acceptance criteria

- [x] **Given** a large document (e.g., 200+ sections), **when** opened, **then** only on-screen sections render initially and scrolling stays smooth (measured frame/interaction budget documented).
- [x] **Given** a single-section edit, **when** persistence runs, **then** only that section is re-serialized (verified via instrumentation/logs).
- [x] PDF export can target a single section and large-doc export streams progressively.
- [x] Memory for a long editing session stays bounded across snapshot/GC cycles (before/after figure recorded).
- [x] `/api/documents` is served from cache and invalidates correctly on file changes.
- [x] Existing correctness tests (round-trip, concurrency) still pass.
