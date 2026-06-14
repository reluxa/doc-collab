# Story 13 — MCP collaboration peer & external-edit reconciliation

**Phase:** 2 (conflict-free) · **Estimate:** 3 days · **Depends on:** Story 9, Story 12
**Architecture refs:** §11.4 (agent integration, external edits), §11.5 (scenarios)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Bring the agent into the conflict-free model: agent edits apply as Yjs transactions on the shared `Y.Doc` (merge, not clobber), and external `.md` changes (git/manual) reconcile into the CRDT per section.

## Scope / Tasks

- [x] `mcp-server/collab-peer.ts`: connect the MCP server to the shared `Y.Doc` as a Yjs peer (via Hocuspocus provider).
- [x] Route `update_document`/`update_section` writes through the peer so agent edits apply as Yjs updates that merge with concurrent human edits.
- [x] Add `read_section(name, section_id)` / `update_section(name, section_id, content)` MCP tools operating at section granularity.
- [x] External-edit reconciliation: when a `.md` file changes on disk outside the editor, run Story 11 `applyMarkdownDiff` to merge changed sections into the live `Y.Doc` instead of clobbering.
- [x] Keep `read_document`/`update_document` semantics stable (full-doc), now CRDT-backed.
- [x] Tests: agent + human concurrent same-section edit converge; external `.md` edit during live session merges.

## Out of scope

- Optimizations (Story 14).

## Technical notes

- Agent edits must enter the CRDT (not a raw file overwrite) so they merge; raw disk writes only occur via persistence (Story 12).
- Guard against feedback loops between persistence-driven `.md` writes and the reconciliation watcher (origin/echo suppression).

## Acceptance criteria

- [x] **Given** a human and the agent edit the **same section** at the same time, **when** both submit, **then** the `Y.Doc` converges with both contributions and no data loss.
- [x] **Given** the agent calls `update_section`, **then** only that section changes and concurrent edits elsewhere are preserved.
- [x] **Given** a `.md` file is edited via git/manually during a live session, **then** the changed sections merge into the `Y.Doc` (no clobber of in-editor work) and browsers reflect it.
- [x] No persistence↔reconciliation feedback loop occurs (verified by no oscillating writes).
- [x] Concurrency tests pass.
