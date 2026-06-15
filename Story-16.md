# Story 16 — Version history UI & restore

**Phase:** 3 (Versioning) · **Estimate:** 2–3 days · **Depends on:** Story 15
**Architecture refs:** §13 (Future Considerations — Document versioning)
**UI refs:** [`ui-design.md`](./ui-design.md) — §6.6 (dialog/modal), §6.8 (badges/pills), §4 (elevation, motion), §8 (a11y), §9 (motion & feedback)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Surface the version history to users through a Google Docs–style modal overlay, allowing them to browse past versions, preview a version's full content, and restore it. Also show a version counter badge on the document list so users can see at a glance how many versions a document has accumulated.

## Scope / Tasks

- [ ] `src/components/editor/version-history.tsx`: version history modal component
  - Opens via a clock icon button in the editor topbar (next to the connection status pill).
  - Keyboard shortcut `Ctrl/Cmd+Shift+H` to toggle.
  - Two-panel layout (left: timeline list, right: full preview).
- [ ] **Left panel — timeline:**
  - Vertical list of versions, newest first.
  - Each entry shows: version number (`v4`), trigger label ("Agent edited", "Auto-saved", "Periodic save", "Manual save"), relative time ("2 min ago", "16 min ago"), and `author` indicator (human = indigo dot, agent = teal dot, system = grey dot).
  - Currently active version marked with "current" label.
  - Click to select and preview in the right panel.
  - Scrollable; skeleton shimmer while loading.
- [ ] **Right panel — full preview:**
  - Renders the selected version's `md` as read-only HTML (using the server-side `unified` + `remark-gfm` pipeline, or a client-side `remark` render).
  - Styled like the editor sheet but non-interactive (no cursor, no editing).
  - Shows version metadata header: "v3 · Auto-saved · 8 min ago".
- [ ] **Restore action:**
  - A "Restore" button in the preview header (disabled for the current version).
  - On click: confirmation toast/banner ("Restoring v3 — this will create a new version").
  - Calls the restore API route (see below), which replaces the current `Y.Doc` content with the version's `md` via `applyMarkdownDiff` (CRDT merge, not raw clobber).
  - A new version (N+1) is immediately created after restore.
  - Modal auto-dismisses; editor reflects restored content.
- [ ] API routes:
  - `GET /api/documents/[id]/versions` — list versions (metadata only, no full `md` body).
  - `GET /api/documents/[id]/versions/[version]` — read a single version (metadata + `md` snapshot for preview).
  - `POST /api/documents/[id]/versions/[version]/restore` — restore a version to current (creates new version after restore).
  - `POST /api/documents/[id]/versions` — create a manual snapshot (for the "Save version" button).
- [ ] Manual "Save version" button: small icon button in the editor topbar (floppy disk or bookmark icon) next to the version history clock. Triggers an immediate snapshot via `POST /api/documents/[id]/versions`.
- [ ] Dashboard version counter:
  - On each document card in `document-list.tsx`, show a small `xs` badge (`full` radius, tinted) displaying the current version number (e.g., `v4`) next to the "modified X ago" metadata.
  - Documents with no versions yet show no badge (or `v0` in subtle text).
  - Populated from the `GET /api/documents` response (add `versionCount` field) or fetched separately.
- [ ] Add `__versions__/` to `.gitignore` so version files don't bloat the repo during development.
- [ ] **Constitution compliance:**
  - API route handlers delegate to `src/lib/collab/versioning.ts`; no direct fs access in route files (§4).
  - All new external inputs (version number param, restore POST body) validated with zod at the boundary (§2).
  - Component file `version-history.tsx` uses kebab-case; exported component `VersionHistory` uses PascalCase (§3).
  - No magic values (modal max-width, debounce intervals) — use named constants or design tokens.
- [ ] E2E tests: open version history, select version, preview renders correctly, restore creates new version, version counter appears on dashboard.

## Out of scope

- Side-by-side diff view (future enhancement).
- Inline annotations / comments on specific versions (future).
- Version retention policies or limits (future — keep all for now).
- Branching / forked version trees (future).
- Export version history as archive (future).

## Technical notes

- The preview panel can use `remark-react` or a simple `remark-html` pipeline to render Markdown as trusted HTML (the content is the user's own document, not external input).
- For the restore flow, prefer CRDT merge (`applyMarkdownDiff`) over raw replacement so concurrent edits since the restored version are preserved where possible.
- The modal follows `ui-design.md` §6.6: centered, `lg` radius, `e3` shadow, scrim with blur, focus-trapped, `Esc` to dismiss.
- Timeline entries use presence colors per `ui-design.md` §2.5: human = indigo (`--brand-500`), agent = teal (`--agent-500`), system = subtle (`--text-subtle`).
- Skeleton loading for the timeline list follows `ui-design.md` §6.13 (shimmer animation).
- The `GET /api/documents` endpoint should be extended to include a `versionCount` field (or the document list component can fetch `/api/documents/[id]/versions` in parallel for hover/detail states).

## UI Wireframe

```
┌──────────────────────────────────────────────────────────────────┐
│  Version History                                    [×]          │
├─────────────────────────────────┬────────────────────────────────┤
│  TIMELINE                       │  PREVIEW                       │
│                                 │                                │
│  ● v4  Agent edited             │  v3 · Auto-saved · 8 min ago  │
│     2 min ago         (current) │  ────────────────────────────  │
│                                 │                                │
│  ○ v3  Auto-saved               │  # My Document                 │
│     8 min ago       ← selected  │                                │
│                                 │  Content as it looked at v3…  │
│  ○ v2  Agent edited             │                                │
│     15 min ago                   │                                │
│                                 │                                │
│  ○ v1  Created                  │                                │
│     16 min ago                   │                   [Restore v3] │
│                                 │                                │
└─────────────────────────────────┴────────────────────────────────┘
```

## Acceptance criteria

- [ ] **Given** a document has versions, **when** the user clicks the clock icon or presses `Ctrl+Shift+H`, **then** the version history modal opens with a timeline and preview.
- [ ] **Given** the modal is open, **when** the user clicks a version in the timeline, **then** the right panel shows the full Markdown preview of that version.
- [ ] **Given** a previous version is selected, **when** the user clicks "Restore", **then** a confirmation appears, and confirming replaces the current content with the restored version and creates a new version.
- [ ] **Given** the current version is selected, **then** the "Restore" button is disabled.
- [ ] **Given** the user clicks "Save version", **then** a new manual snapshot is created and the timeline updates.
- [ ] **Given** a document has versions, **when** the home page loads, **then** each document card shows a version counter badge (e.g., `v4`).
- [ ] **Given** the modal is open, **when** the user presses `Esc` or clicks the scrim, **then** the modal dismisses without changes.
- [ ] UI matches `ui-design.md`: dialog uses `lg` radius, `e3` elevation, focus trap, semantic colors for author indicators, skeleton loading states, and transitions per §4/§9.
- [ ] Meets accessibility criteria: keyboard-navigable timeline (arrow keys to select, Enter to activate restore), `aria-live` for version count updates, AA contrast in both themes, `role="dialog"` + `aria-modal="true"`.
- [ ] `__versions__/` is added to `.gitignore`.
- [ ] E2E tests pass for: open modal, browse versions, preview renders, restore flow, manual save, dashboard counter.
- [ ] **Constitution checklist:**
  - [ ] `tsc --noEmit` passes strict; zero new `any`.
  - [ ] All new API inputs validated (zod schema for version params, body).
  - [ ] Route handlers contain no business logic or direct fs — delegate to `lib`.
  - [ ] Components use design tokens (no ad-hoc hex/px for themed values); colors from `ui-design.md`.
  - [ ] Keyboard-only operation works; focus visible; AA contrast verified (light + dark).
  - [ ] Interactive elements have correct roles/labels (`role="dialog"`, `aria-modal`, `aria-live`); respects `prefers-reduced-motion`.
  - [ ] No layout-shift surprises: skeleton shimmer for async timeline/preview content.
  - [ ] No secrets committed or logged; `.env.example` updated when adding config.
