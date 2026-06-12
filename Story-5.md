# Story 5 — WYSIWYG editor & document list UI

**Phase:** 1 (MVP) · **Estimate:** 3 days · **Depends on:** Story 3, Story 4
**Architecture refs:** §3 (editor extensions), §8 (components), §4 (API consumption)
**UI refs:** [`ui-design.md`](./ui-design.md) — §6 (components: buttons, cards, toolbar, editor sheet, dialogs, empty/skeleton states), §7.1–7.3 (app shell, home list, editor layouts), §7.4 (responsive), §8 (a11y). Implement to match these specs.

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Deliver the user-facing app: a document list (home), an editor page with a Tiptap WYSIWYG editor and formatting toolbar, wired to the REST API for load/save.

## Scope / Tasks

- [ ] `src/components/documents/document-list.tsx` + home page: list documents (title, modified date), create new, open, delete. Calls `GET/POST/DELETE /api/documents`.
- [ ] `src/app/editor/[id]/page.tsx`: load Markdown via `GET /api/documents/[id]`, mount the editor.
- [ ] `src/components/editor/editor.tsx`: Tiptap editor with the §3 extension set + `tiptap-markdown` (from Story 4). Loads Markdown, saves via `PUT` with `If-Match` (ETag from the GET).
- [ ] `src/components/editor/toolbar.tsx`: formatting controls (headings, bold/italic/underline/strike/code, lists, task list, blockquote, code block, link, table, hr, highlight).
- [ ] Save UX: explicit save indicator (saved / saving / error). (Debounce/auto-save lands in Story 8.)
- [ ] Empty-state placeholder for new/empty documents.
- [ ] Beautiful, modern, responsive UI with Tailwind v4, built to `ui-design.md`: app shell/topbar (§7.1), document-list card grid + empty/skeleton states (§6.3, §6.13, §7.2), editor topbar + sticky toolbar + centered sheet (§6.4, §6.5, §7.3), dialogs/toasts (§6.6, §6.7), and the component states/motion (§4, §9).

## Out of scope

- Real-time updates, debounced autosave, conflict prompts (Story 8). PDF button wiring may stub until Story 6.

## Technical notes

- Keep the ETag returned by `GET` and send it back on `PUT`; surface `409` as a user-facing message (full handling in Story 8).
- Editor must be a client component; document list can be server-rendered.

## Acceptance criteria

- [ ] **Given** documents exist, **when** the home page loads, **then** they are listed with title + modified date, and can be opened, created, and deleted.
- [ ] **Given** a document is opened, **when** the user edits and saves, **then** the `.md` file on disk reflects the change (verified via the API/disk).
- [ ] All §3 formatting controls work and produce correct Markdown on save (spot-checked against round-trip behavior from Story 4).
- [ ] The save indicator reflects saving/saved/error states.
- [ ] UI matches `ui-design.md`: colors/typography/spacing from the tokens, layouts per §7, and responsive breakpoints per §7.4 (3–4 col grid ≥1024px down to single column <640px; toolbar collapses to `⋯`).
- [ ] Meets accessibility criteria in `ui-design.md` §8 (visible focus rings, keyboard-operable toolbar, AA contrast in both themes); no console errors.
