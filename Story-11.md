# Story 11 — Section model & Y.Doc structure

**Phase:** 2 (conflict-free) · **Estimate:** 3 days · **Depends on:** Story 4
**Architecture refs:** §11.2 (why sections), §11.3 (section model), §11.4 (md-bridge)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Introduce the section abstraction and the Yjs document model: split Markdown into stable-ID sections, define the `Y.Doc` schema, and build the bidirectional Markdown↔Y.Doc bridge with per-section diffing. This is the data-model foundation for conflict-free editing.

## Scope / Tasks

- [x] `src/lib/collab/sections.ts`: split Markdown at heading boundaries (configurable level, default H1/H2). Assign/parse stable `nanoid` section IDs persisted as anchor comments (`<!-- sec:... -->`). Round-trip safe.
- [x] **Section ID recovery** (§11.3): handle missing/duplicate anchors deterministically — (1) valid unique anchor → use it; (2) match by heading text + position; (3) match by body content-similarity; (4) otherwise mint a new `nanoid`. Matching is one-to-one and order-aware. On the next persist, **re-stamp** anchors so identity self-heals.
- [x] `src/lib/collab/doc-model.ts`: define the `Y.Doc` schema — `order: Y.Array<string>` (section IDs) + `sections: Y.Map<string, Y.XmlFragment>`.
- [x] `src/lib/collab/md-bridge.ts`:
  - `markdownToYDoc(md)` → populate a `Y.Doc`.
  - `yDocToMarkdown(doc)` → serialize back to Markdown (with anchors).
  - `applyMarkdownDiff(doc, newMd)` → diff per section vs current `Y.Doc` and apply **only changed sections** as Yjs updates (merge, not replace).
- [x] Unit tests: section splitting, ID stability across edits/reorders, round-trip Markdown↔Y.Doc, and per-section diff applying only changed sections.

## Out of scope

- Live sync server (Story 12); agent peer (Story 13); editor binding (Story 12).

## Technical notes

- Section IDs must survive reordering and body edits; anchors must survive Markdown round-trips and git.
- Edits to a section fragment and moves in `order` must commute (verify in tests).
- Anchors are a best-effort hint, not a hard requirement — recovery must keep identity stable even when anchors are stripped by plain-text edits, an agent rewrite, or comment-dropping tooling.

## Acceptance criteria

- [x] **Given** a Markdown doc, **when** split into sections and re-serialized, **then** content + section IDs round-trip exactly.
- [x] **Given** a section is reordered and another is edited, **when** both operations apply, **then** the result is deterministic regardless of order.
- [x] **Given** an external Markdown with one changed section, **when** `applyMarkdownDiff` runs, **then** only that section's fragment is updated (verified by inspecting Yjs updates), preserving other sections.
- [x] **Given** a `.md` whose anchors were stripped (no `<!-- sec:… -->`), **when** it is reconciled, **then** sections are re-matched to their existing IDs by heading/position/content (not duplicated or merged), and anchors are re-stamped on the next persist.
- [x] **Given** an anchorless section that matches nothing, **then** a new `nanoid` is minted and stamped; no existing section loses its identity.
- [x] All unit tests pass.
