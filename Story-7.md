# Story 7 — Custom server: WebSocket + file watcher

**Phase:** 1 (MVP) · **Estimate:** 2–3 days · **Depends on:** Story 3
**Architecture refs:** §7.1 (WS in custom server), §7.2/7.3 (sync flows), §7.6 (WS auth), §10

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Replace the default Next dev/start entry with a custom server that hosts Next.js **and** a WebSocket server on the same HTTP port, plus a chokidar watcher that broadcasts document changes to browsers. This removes the dependency on the MCP process for browser real-time.

## Scope / Tasks

- [x] `server.ts`: boot Next.js (dev + prod modes) and attach a `ws` server to the same HTTP server via the `upgrade` event at path `/ws`.
- [x] WS auth (§7.6): bind to `HOST` (default `127.0.0.1`); validate `WS_TOKEN` on upgrade (`?token=` or `Sec-WebSocket-Protocol`); reject invalid with `401`.
- [x] `src/lib/realtime.ts`: connection registry + `broadcast(event)` helper; event shape `{ type: "doc-changed", id, version, origin }`.
- [x] chokidar watcher over `DOCS_ROOT` with `awaitWriteFinish`; on change, compute version (ETag) and broadcast to clients subscribed to that doc id.
- [x] Origin tagging: writes carry an `origin` (client id) so the originating browser can be skipped.
- [x] Inject `WS_TOKEN` (and WS URL) into the page for the browser client (Story 8) to consume.

## Out of scope

- Browser-side consumption/dirty-prompt (Story 8); MCP agent notifications (Story 9); Hocuspocus/CRDT (Story 12).

## Technical notes

- Same-origin WS URL: `ws(s)://<host>:<port>/ws` — no separate port.
- The watcher is the single broadcast source (watcher-driven), decoupled from which process wrote the file.

## Acceptance criteria

- [x] `npm run dev` starts Next.js + WS on one port; the app still renders normally.
- [x] **Given** a connected WS client with a valid token, **when** a `.md` file changes on disk (e.g., edited via API or manually), **then** the client receives a `doc-changed` event with correct `id` and `version` within ~1s.
- [x] **Given** an upgrade request with a missing/invalid token, **then** it is rejected with `401` and no events are delivered.
- [x] The server binds to `127.0.0.1` by default and is not reachable on the LAN unless `HOST` is changed.
- [x] Rapid successive writes are coalesced (no event storm) via `awaitWriteFinish`.
