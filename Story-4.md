# Story 4 — Markdown ↔ editor content pipeline

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 1
**Architecture refs:** §3.1 (content pipeline), §1 (tiptap-markdown, remark)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Establish the deterministic conversion between Markdown-on-disk and the editor/PDF representations, and lock it down with round-trip tests. This resolves the incorrect "generateText/generateHTML round-trips Markdown" assumption.

## Scope / Tasks

- [ ] Add `tiptap-markdown` and configure the editor extension set so Markdown parses into the ProseMirror document (load) and serializes back (`editor.storage.markdown.getMarkdown()`) for save. Configure GFM features (tables, task lists, strikethrough, highlight).
- [ ] Create `src/lib/markdown.ts`: a server-side `unified` + `remark-parse` + `remark-gfm` pipeline that produces an mdast tree (for PDF + validation), independent of the browser editor.
- [ ] Decide & document lossy cases (e.g., text color) — either HTML-fence or drop, explicitly.
- [ ] Create `tests/markdown-roundtrip.test.ts`: feed representative Markdown (headings, lists, task lists, tables, code blocks, blockquotes, links, hr) through parse→serialize and assert stability (load→save of untouched doc is a no-op).

## Out of scope

- Editor UI (Story 5); PDF rendering (Story 6).

## Technical notes

- The disk source of truth is **Markdown**; both editor-side and server-side conversions must agree on GFM configuration to keep round-trips stable.
- Keep the in-editor conversion (tiptap-markdown) and the server-side pipeline (remark) as separate, documented modules.

## Acceptance criteria

- [ ] **Given** a representative GFM Markdown sample, **when** it is parsed and re-serialized, **then** the output equals the normalized input (round-trip stable) for all listed node types.
- [ ] `src/lib/markdown.ts` parses Markdown into a usable mdast tree consumable by the PDF story.
- [ ] Any lossy/unsupported node is documented and handled deliberately (no silent corruption).
- [ ] `tests/markdown-roundtrip.test.ts` passes in CI.
