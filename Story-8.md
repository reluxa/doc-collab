# Story 8 — Browser real-time sync & Phase 1 conflict handling

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 5, Story 7
**Architecture refs:** §7.3 (browser→agent), §7.4 Phase 1 (concurrent-edit), §7.5 (debouncing)
**UI refs:** [`ui-design.md`](./ui-design.md) §6.8 (save & connection status pills), §6.11 (non-modal conflict banner), §9 (feedback/motion)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Make the editor live: receive remote change events, debounce local saves, and handle concurrent edits safely with optimistic concurrency + a non-destructive dirty-prompt.

## Scope / Tasks

- [x] `src/client/ws-client.ts`: connect to same-origin `/ws` with the injected `WS_TOKEN`; subscribe to the open document id; auto-reconnect with backoff.
- [x] Debounced save (§7.5): debounce `onUpdate` at 400 ms (trailing); force-flush on blur, route change, and `beforeunload`.
- [x] On incoming `doc-changed` for the open doc:
  - if editor is **not dirty** → apply latest content seamlessly (re-fetch + set);
  - if editor **is dirty** → show the non-modal conflict banner (`ui-design.md` §6.11, warning tone, under the toolbar): *Reload (discard mine)* / *Keep mine (overwrite on next save)*.
- [x] Skip events whose `origin` is this client (no self-clobber/echo).
- [x] Handle `PUT` `409 Conflict`: surface the conflict and offer reload/overwrite, reusing the prompt UI.
- [x] Connection status indicator (connected/reconnecting/offline) and save status pill per `ui-design.md` §6.8, with `aria-live` announcements (§8).

## Out of scope

- CRDT/merge (Phase 2). Multi-user presence cursors (Story 12).

## Technical notes

- Track a `dirty` flag and the last-known `ETag`; send `If-Match` on every `PUT`.
- Force-flush must complete (or be sent via `sendBeacon`/keepalive) before unload where possible.

## Acceptance criteria

- [x] **Given** two browser tabs on the same doc, **when** tab A edits and saves, **then** tab B (not dirty) updates within ~1s without manual refresh and without echoing back to A.
- [x] **Given** tab B has unsaved edits, **when** a remote change arrives, **then** tab B shows the prompt and does **not** silently overwrite the user's work.
- [x] **Given** a stale `If-Match`, **when** the user saves, **then** the `409` is surfaced with reload/overwrite options (no silent data loss).
- [x] Typing does not cause a write per keystroke; saves are debounced (~400 ms) and flushed on blur/unload.
- [x] Connection indicator reflects WS state and recovers after a dropped connection.
- [x] Save/connection status and the conflict banner match `ui-design.md` §6.8 / §6.11 (correct semantic colors, non-modal banner, `aria-live`/`role="alert"`).
