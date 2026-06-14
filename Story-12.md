# Story 12 — Hocuspocus collaboration server & editor binding

**Phase:** 2 (conflict-free) · **Estimate:** 3 days · **Depends on:** Story 7, Story 11
**Architecture refs:** §11.1 (CRDT decision), §11.4 (data flow), §11.6 (soft-locks), §7.6 (auth)
**UI refs:** [`ui-design.md`](./ui-design.md) §2.5 (presence palette; human=indigo, agent=teal), §6.9 (avatars + remote cursors/selection), §6.10 (soft-lock indicator), §9 (remote-edit highlight fade)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Make live editing conflict-free for humans: host a Hocuspocus (Yjs) backend in the custom server, bind the Tiptap editor to the shared `Y.Doc` with presence cursors and offline support, and persist to `.md` + `.ydoc`.

## Scope / Tasks

- [x] `src/lib/collab/hocuspocus.ts`: attach a Hocuspocus server to the HTTP upgrade at `/ws/collab` (reuse `WS_TOKEN` auth from §7.6).
- [x] `src/lib/collab/persistence.ts`: `onStoreDocument` (debounced 400 ms + ~30 s snapshot interval) serializes the `Y.Doc` to canonical `.md` (via Story 11 `yDocToMarkdown` or live Tiptap fragment) and a `.ydoc` snapshot (`Y.encodeStateAsUpdate`); trigger tombstone GC on snapshot.
- [x] `src/client/collab-provider.ts`: `HocuspocusProvider` + `y-indexeddb` for offline buffering and reconnect.
- [x] Editor (Story 5) gains `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-caret`; remove the History extension (Collaboration provides undo/redo). Replace Phase 1 load/save path with the Y.Doc binding behind a feature flag.
- [x] Presence UI per `ui-design.md`: avatar stack (§6.9), remote carets + tinted selections in each user's presence color (§2.5, human=indigo / agent=teal), the soft-lock section indicator (§6.10), and the 600ms remote-edit highlight fade (§9). Section awareness flag is UI-only, never hard-block (§11.6).

## Out of scope

- Agent-as-peer and external `.md` reconciliation (Story 13). Performance tuning (Story 14).

## Technical notes

- The `.md` file remains the git-friendly artifact + agent interface; the live truth is the `Y.Doc`.
- Gate Phase 2 behind a flag so Phase 1 remains the fallback until parity is proven.

## Acceptance criteria

- [x] **Given** two browsers editing the **same section** concurrently, **when** both type, **then** edits merge with no data loss and both converge to identical content (no conflict prompt). _(Covered by `tests/collab-convergence.test.ts` and `cypress/e2e/collaboration.cy.ts`.)_
- [ ] **Given** edits in different sections, **then** they apply independently with no interference.
- [ ] **Given** a browser goes offline and edits, **when** it reconnects, **then** its edits merge in (via `y-indexeddb`).
- [x] Collaborator cursors/presence are visible and match `ui-design.md` §6.9/§2.5 (human indigo, agent teal); an active section shows the soft-lock hint (§6.10) but the human can still edit.
- [x] On idle, the `.md` on disk and a `.ydoc` snapshot reflect the current `Y.Doc`. _(Covered by `cypress/e2e/collaboration.cy.ts`.)_
