# Story 6 — PDF export

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 4
**Architecture refs:** §5 (PDF Export)
**UI refs:** [`ui-design.md`](./ui-design.md) §6.4 (toolbar Export button placement/style), §6.7 ("Export ready" toast)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Generate and stream a PDF of a document server-side, mapping Markdown → React-PDF components via the shared remark pipeline.

## Scope / Tasks

- [ ] `src/lib/pdf.ts`: consume the mdast tree from `src/lib/markdown.ts` and map nodes (headings, paragraphs, lists, code blocks, blockquotes, tables, links, hr) to `@react-pdf/renderer` components with a sensible `StyleSheet`.
- [ ] `GET /api/documents/[id]/pdf`: render via `renderToStream()`, adapt the Node `Readable` to a Web `ReadableStream`, respond with `Content-Type: application/pdf` and a sensible filename.
- [ ] Wire an "Export PDF" button in the editor toolbar (from Story 5), styled per `ui-design.md` §6.4; show a progress state while rendering and an "Export ready" toast (§6.7) on completion.
- [ ] Document the streaming behavior/limits (renderToStream builds model in memory before emitting bytes).

## Out of scope

- Per-section/incremental PDF (Story 14). DOCX/HTML exports (future).

## Technical notes

- Reuse the server-side remark pipeline; do **not** depend on the browser editor's HTML.
- Validate id via the same `resolveDocPath`/API path as other routes.

## Acceptance criteria

- [ ] **Given** a document with mixed content, **when** `GET /api/documents/[id]/pdf` is called, **then** a valid `application/pdf` is returned and opens correctly, preserving headings, lists, code blocks, tables, and links.
- [ ] The editor "Export PDF" button downloads the PDF for the open document.
- [ ] An invalid/nonexistent id returns the correct error status (400/404), not a 500.
- [ ] Streaming behavior is documented in the code/README.
