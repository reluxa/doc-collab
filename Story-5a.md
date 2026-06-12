# Story 5a — Table editor (Confluence-style row/column actions)

**Phase:** 1 (MVP) · **Estimate:** 2 days · **Depends on:** Story 5
**Architecture refs:** §3 (editor extensions), §8 (components)
**UI refs:** [`ui-design.md`](./ui-design.md) — §6 (components), §7.3 (editor layout), §8 (a11y)
**Design inspiration:** Confluence / Notion table cell hover menu

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Add granular table editing so the user can insert, delete, and manage rows and columns anywhere in a table — not just append at the end. Actions are exposed through a Confluence-style floating menu that appears when hovering near table edges.

## Scope / Tasks

- [ ] `src/components/editor/table-menu.tsx`: floating menu component that appears on table hover. Renders action buttons for row/column/table operations. Position logic based on hovered cell edge (top/bottom/left/right).
- [ ] Wire table menu into `src/components/editor/editor.tsx`: detect hover over table cells, compute menu position, show/hide menu with proper z-index and dismissal (click outside, focus out, escape key).
- [ ] Row actions (contextual to hovered cell):
  - `Add row above` — inserts a new row before the hovered cell's row
  - `Add row below` — inserts a new row after the hovered cell's row
  - `Delete row` — removes the hovered cell's row (disabled for single-row tables; disabled for header row if it's the only header)
- [ ] Column actions (contextual to hovered cell):
  - `Add column before` — inserts a new column before the hovered cell's column
  - `Add column after` — inserts a new column after the hovered cell's column
  - `Delete column` — removes the hovered cell's column (disabled for single-column tables)
- [ ] Table-level actions (always visible in menu):
  - `Delete table` — removes the entire table from the document
- [ ] `src/app/globals.css`: styles for the floating menu (surface background, shadow, rounded corners, hover states, transition animation).
- [ ] Update `src/components/editor/editor.tsx` to include any new Tiptap extensions needed (e.g., `BubbleMenu` or `FloatingMenu` if used for positioning, or custom hover detection).
- [ ] Update `src/components/editor/toolbar.tsx`: the existing "Insert table" button stays; no new toolbar buttons needed (all actions live in the floating menu).

## Out of scope

- Merging/splitting cells. Column resizing via drag. Cell background colors. Table alignment options. These can land in a future story.

## Technical notes

- Tiptap's table extension already provides `addColumnBefore()`, `addColumnAfter()`, `deleteColumn()`, `addRowBefore()`, `addRowAfter()`, `deleteRow()`, `deleteTable()` commands. Use these directly — do not manipulate the ProseMirror document manually.
- Hover detection: attach `mouseenter`/`mouseleave` handlers to `<td>`/`<th>` elements inside `.ProseMirror table`. Compute the hovered cell's `rowIndex` and `columnIndex` by walking the DOM or reading Tiptap's cell view data.
- Menu positioning: calculate the bounding rect of the hovered cell. Show the menu centered on the edge the cursor is nearest (top edge → menu above, bottom edge → menu below, etc.). Use a portal or fixed positioning to avoid overflow issues inside the editor sheet.
- Disabled state: grey out action buttons when the action is invalid (e.g., "Delete row" on a 1-row table). This prevents accidental document corruption and matches Confluence's behavior.
- The menu must dismiss on: clicking outside, pressing Escape, or clicking an action button. After an action, re-query the DOM for the cell since the table structure may have changed.
- Keep the menu lightweight: no heavy state management, no global stores. A local `useState` in the editor component or the menu component is sufficient.

## Acceptance criteria

- [ ] **Given** a table exists in the document, **when** the user hovers over a cell, **then** a floating menu appears near the hovered cell with row/column/table actions.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Add row above", **then** a new empty row is inserted before the hovered cell's row, and the menu dismisses.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Add row below", **then** a new empty row is inserted after the hovered cell's row, and the menu dismisses.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Delete row" on a multi-row table, **then** the hovered cell's row is removed, and the menu dismisses.
- [ ] **Given** the table has only one row, **when** the user hovers over a cell, **then** "Delete row" is disabled.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Add column before", **then** a new empty column is inserted before the hovered cell's column, and the menu dismisses.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Add column after", **then** a new empty column is inserted after the hovered cell's column, and the menu dismisses.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Delete column" on a multi-column table, **then** the hovered cell's column is removed, and the menu dismisses.
- [ ] **Given** the table has only one column, **when** the user hovers over a cell, **then** "Delete column" is disabled.
- [ ] **Given** the floating menu is visible, **when** the user clicks "Delete table", **then** the entire table is removed from the document, and the menu dismisses.
- [ ] **Given** the floating menu is visible, **when** the user clicks outside the menu or presses Escape, **then** the menu dismisses without modifying the document.
- [ ] **Given** the user adds/removes rows and columns, **when** the document is saved, **then** the Markdown output reflects the table structure changes (verified via the API/disk).
- [ ] UI matches `ui-design.md`: menu uses surface tokens, shadow, rounded corners, and transitions per §4/§9. Action buttons have hover/focus states and AA contrast in both themes.
- [ ] Meets accessibility criteria in `ui-design.md` §8: menu is keyboard-navigable (arrow keys between actions, Enter/Space to activate, Escape to dismiss), actions have aria-labels, focus is trapped or managed appropriately.
- [ ] All existing Cypress editor tests still pass (20/20). New tests added for table row/column operations and menu behavior (at least 5 new test cases).
