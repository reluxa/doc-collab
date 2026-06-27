# Story 19 — Document folders

**Phase:** 5 (Organization) · **Estimate:** 1 day · **Depends on:** Story 2 (document storage), Story 5 (dashboard UI)
**Architecture refs:** §2 (Document Storage), §8 (Directory Structure)
**UI refs:** [`ui-design.md`](./ui-design.md) — §2 (color tokens), §6.3 (cards), §7 (responsive)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Organize documents into folders so users can group related content. Folders are represented by a `:`-separated prefix in the document ID (e.g., `meetings:2024:q1:note`), stored flat on disk as `meetings:2024:q1:note.md`. The dashboard groups documents by their folder prefix, rendering nested collapsible folder sections. Existing documents without a folder prefix appear in the root section.

Users will be able to:
- Create documents inside existing or new folders (via the "New" dialog)
- See documents grouped by folder on the dashboard
- Navigate nested folders with expand/collapse
- Open documents from any folder level (editor URL unchanged)
- Rename/reorganize documents later (future story — folder prefix is part of the id)

## Approach: prefix-based IDs, no filesystem changes

Folders are purely a client-side organizational layer. The document ID pattern is relaxed to allow `:` as a separator:

- `my-note` → root folder (no prefix)
- `meetings:note` → folder "meetings", document "note"
- `meetings:2024:q1:note` → nested path "meetings > 2024 > q1 > note"

On disk, files remain flat: `meetings:note.md`, `meetings:2024:q1:note.md`. No directory restructuring, no migration needed.

This approach:
- **Zero migration** — all existing docs stay as-is, show in root folder
- **No version collision** — version subdirectories remain `{id}/` with no conflict
- **No catch-all routes** — `meetings:note` is a single URL segment, captured by `[id]`
- **No path traversal risk** — `:` is a safe separator, no `..` or `/` allowed
- **Supports arbitrary nesting** — chain more `:` for deeper folders
- **~85 lines total** — security.ts + types + documents.ts + dashboard UI

## Scope / Tasks

### 1. ID validation (`src/lib/security.ts`)

- [ ] **Relax `ID_PATTERN`** to allow `:` as a folder separator:
  ```ts
  // segments separated by ':', no empty segments, max 256 chars
  export const ID_PATTERN = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/;
  ```
  - Allows: `note`, `meetings:note`, `meetings:2024:note`
  - Rejects: `foo/bar`, `..`, `:`, `foo::bar`, `:note`, `note:`
- [ ] **Add `documentFolderParts(id: string): string[]` helper** — extracts folder segments from a prefixed ID:
  - `"meetings:2024:note"` → `["meetings", "2024"]`
  - `"plain-doc"` → `[]`
- [ ] **Add `documentFolderPath(id: string): string | null` helper** — returns the folder path string (":"-separated) or null:
  - `"meetings:note"` → `"meetings"`
  - `"meetings:2024:note"` → `"meetings:2024"`
  - `"plain-doc"` → `null`
- [ ] Export the new helpers from the module for use by `documents.ts` and the API.

### 2. Types (`src/types/document.ts`)

- [ ] Add `folder: string | null` to `DocumentMeta`:
  ```ts
  /** Folder path (":"-separated prefix), or null for root. */
  folder: string | null;
  ```
- [ ] Keep `DocumentId` type as `string` (no change — it's already unvalidated).

### 3. Document listing (`src/lib/documents.ts`)

- [ ] Import `documentFolderPath` from `lib/security.ts`.
- [ ] In `listDocuments()`, compute `folder` from each document's id:
  ```ts
  docs.push({
    id,
    title,
    modifiedAt: stats.mtime,
    previewUrl: null,
    folder: documentFolderPath(id),
  });
  ```
- [ ] Ensure `folder` propagates through `listDocumentsCached()` (automatic — same return type).

### 4. API (`src/app/api/documents/route.ts`)

- [ ] No schema change needed — the Zod schema uses `ID_PATTERN` which now accepts `:`.
- [ ] `GET /api/documents` automatically includes the `folder` field (returned by `listDocumentsCached`).
- [ ] `POST /api/documents` accepts `id: "meetings:note"` (validated by `ID_PATTERN`).
- [ ] `GET /api/documents/[id]`, `PUT`, `DELETE` — no changes (work with any valid id).

### 5. Editor route (`src/app/editor/[id]/page.tsx`)

- [ ] No changes — `meetings:note` is a single URL segment captured by `[id]` (no `/` in the path).
- [ ] Verify the editor loads correctly for a prefixed-id document (smoke test).

### 6. Dashboard UI (`src/components/documents/document-list.tsx`)

> **Design intent.** Folders provide visual organization without changing the card design. Root documents appear in an implicit "root" section. Each folder becomes a collapsible group header with the folder name, document count, and an expand/collapse chevron. Nested folders render as indented sub-groups or a flat path display (e.g., "meetings > 2024 > q1").

#### Folder grouping logic

- [ ] Group documents by `folder` field:
  ```ts
  const rootDocs = docs.filter(d => !d.folder);
  const folders = [...new Set(docs.map(d => d.folder).filter(Boolean) as string[])];
  ```
- [ ] Sort folders alphabetically for consistent rendering.

#### Folder rendering

- [ ] **Root documents first.** Render root docs (no folder) in the existing card grid, no visual change.
- [ ] **Folder sections.** After root docs, render a section for each folder:
  - Section header: folder name (from `:`-separated path, show the last segment as the label, or the full path as breadcrumb), document count, expand/collapse chevron
  - Collapsed by default on first load (expand on click)
  - Expanded state persisted in `useState` per folder (not localStorage — lightweight)
- [ ] **Nested folders display.** For `meetings:2024:q1:note`, the folder label shows "meetings > 2024 > q1" (split by `:` and join with `>`). Each unique folder path gets its own section — no recursive tree structure needed (flat list of folder sections).
- [ ] **Folder icons.** Use a Lucide `folder` icon before the folder name. Color: `text-text-muted` (consistent with meta row icons).
- [ ] **Responsive.** Folder sections span full width above their card grid. On mobile, the card grid becomes single-column (existing behavior).

#### "New document" dialog

- [ ] **Add folder picker.** The "New document" input gets a folder selector above/below it:
  - Show existing folders as selectable chips or a dropdown
  - Auto-construct the id with the folder prefix: if user selects "meetings" and types "quarterly-review", the id becomes `meetings:quarterly-review`
  - Allow creating a new folder on the fly (typing a name that doesn't exist yet creates it implicitly)
  - Default to root folder (no prefix) if none selected
- [ ] **Id validation feedback.** If the user types a folder prefix manually (e.g., `notes:todo`), validate in real-time and show an error for invalid characters.
- [ ] **Placeholder text.** When a folder is selected, show `"Enter document name"` as the input placeholder. When root, show `"Enter document id"`.

#### Folder section styling

- [ ] **Section header:**
  - `flex items-center gap-2` layout
  - Folder icon (Lucide, 16px), folder name (text-sm font-semibold text-text), count badge (rounded-full bg-surface-2 text-xs px-1.5 text-text-muted)
  - Chevron button (rotate 0/90 on collapse/expand, same easing as rest of app)
  - Click anywhere on the header to toggle
  - Separator line below (`h-px bg-border mt-3`)
- [ ] **Motion:** expand/collapse uses `max-height` transition with the spec easing `cubic-bezier(.2,.8,.2,1)`, duration 200ms. Honors `prefers-reduced-motion` (instant toggle when reduced).

### 7. Preview system (`src/lib/preview.ts`, `src/app/api/previews/[id]/route.ts`)

- [ ] No changes — preview path uses `resolvePreviewPath(id)` which already handles any valid id pattern.

### 8. Collab system (`src/lib/collab/persistence.ts`, `src/client/collab-provider.ts`)

- [ ] No changes — collab uses document id as an opaque string. `meetings:note` works as a Hocuspocus room name.

### Constitution compliance

- [ ] `ID_PATTERN` change is a boundary validation — all ids validated at the entry point.
- [ ] No filesystem path traversal possible (`:` is not a path separator in `path.resolve`).
- [ ] `documentFolderPath` and `documentFolderParts` are pure functions, no side effects.
- [ ] `folder` field on `DocumentMeta` is nullable — no breaking change for existing consumers.
- [ ] No new external dependencies.
- [ ] All new types are explicit (no `any`).
- [ ] API routes delegate to `lib/documents.ts` (no direct fs access).
- [ ] Magic values: none introduced (folder separator `:` is defined in the regex).

### Tests

- [ ] **Unit tests for `ID_PATTERN`:**
  - Accepts: `note`, `meetings:note`, `meetings:2024:q1:note`, `foo_bar-1`
  - Rejects: `foo/bar`, `..`, `:`, `foo::bar`, `:note`, `note:`, empty string
- [ ] **Unit tests for `documentFolderPath`:**
  - Returns folder prefix for prefixed ids
  - Returns null for root ids
  - Handles nested folders correctly
- [ ] **Unit tests for `documentFolderParts`:**
  - Returns array of folder segments
  - Returns empty array for root ids
- [ ] **API tests:**
  - `POST /api/documents` accepts prefixed id `meetings:note`
  - `GET /api/documents/[id]` works for prefixed id
  - `GET /api/documents` returns `folder` field for each document
  - `POST /api/documents` rejects invalid ids (containing `/`, `..`)
- [ ] **Dashboard tests (component or E2E):**
  - Documents group correctly by folder
  - Folder sections expand/collapse
  - Root documents render in the root section
  - "New" dialog constructs prefixed ids correctly
  - Nested folder paths display correctly (e.g., "meetings > 2024 > q1")

## Out of scope

- Renaming or moving documents between folders (future story — requires id change, version migration, history update).
- Folder CRUD operations (create/delete/rename folders as standalone entities).
- Folder permissions or sharing.
- Real filesystem directories (folders are UI-only).
- Searching/filtering by folder.
- Bulk operations across folders.

## Technical notes

- **Why `:` as separator:** Safe (no filesystem meaning), not commonly used in document names, visually distinct in URLs. Alternatives considered: `/` (requires catch-all routes, path traversal risk), `>` (looks like a literal character in IDs), `-` (already used in ids, ambiguous).
- **Version subdirectory collision avoided:** Since files are flat (`meetings:note.md`), the version subdirectory is `meetings:note/` — no collision with folder paths.
- **Collab room names:** Hocuspocus room names can contain `:` (it's a valid WebSocket subprotocol identifier). No config change needed.
- **Editor URL:** `/editor/meetings:note` — single segment, no Next.js route changes. If the user copies the URL, it's unambiguous (the `:` is visible and preserved).
- **Migration from flat to folders:** Zero migration. Existing documents have no `:` in their id and appear in the root folder. Users can opt into folders by creating new documents with prefixed ids.
- **Performance:** Grouping is a simple `reduce`/`filter` — O(n) where n is document count. No server-side grouping needed (folder is a field on the metadata).
- **Future rename/move story:** To rename a document with a folder prefix, the system would need to: (1) read the document, (2) write to the new id, (3) migrate versions (rename `{old-id}/` → `{new-id}/`), (4) migrate ydoc (`{old-id}.ydoc` → `{new-id}.ydoc`), (5) migrate preview (`__previews__/{old-id}.png` → `{new-id}.png`), (6) delete old files. This is a non-trivial operation best handled in a future story with explicit user confirmation.

## UI Wireframe

```
Dashboard — with folders:

  ┌─────────────────────────────────────────────┐
  │ 📄 Root documents                           │  ← implicit section (no header)
  │ ┌────────────┐  ┌────────────┐              │
  │ │  preview 1 │  │  preview 2 │              │  ← existing card grid
  │ │  Title 1   │  │  Title 2   │              │
  │ └────────────┘  └────────────┘              │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ 📁 meetings (5)          [▼]                │  ← collapsible folder header
  │ ───────────────────────────────────────────  │
  │ ┌────────────┐  ┌────────────┐              │
  │ │  preview 3 │  │  preview 4 │              │  ← card grid for this folder
  │ │  Q1 review │  │  Q2 review │              │
  │ └────────────┘  └────────────┘              │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ 📁 projects > acme (3)      [▼]             │  ← nested folder (breadcrumb)
  │ ───────────────────────────────────────────  │
  │ ┌────────────┐  ┌────────────┐              │
  │ │  proposal  │  │  timeline  │              │
  │ └────────────┘  └────────────┘              │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ 📁 notes (1)              [▶]               │  ← collapsed folder
  └─────────────────────────────────────────────┘

New document dialog — with folder picker:

  ┌──────────────────────────────┐
  │  Create new document         │
  │                              │
  │  Folder:  [ Root ▼ ]         │  ← dropdown with existing folders
  │    ┌────────────────────────┐│
  │    │ Root                   ││  ← expandable list
  │    │ meetings               ││
  │    │  └─ 2024               ││  ← nested indent
  │    │  └─ 2025               ││
  │    │ projects               ││
  │    │  └─ acme               ││
  │    │ notes                  ││
  │    └────────────────────────┘│
  │                              │
  │  Name:   [ quarterly-... ]   │  ← input (id auto-constructed)
  │                              │
  │  [ Cancel ]       [ Create ] │
  └──────────────────────────────┘
```

## Acceptance criteria

- [ ] **Given** a user creates a document with id `meetings:note`, **when** the document is created, **then** it is stored as `meetings:note.md` in the flat documents directory.
- [ ] **Given** a document exists with a folder prefix, **when** the dashboard loads, **then** the document appears in the correct folder section.
- [ ] **Given** a document has no folder prefix, **when** the dashboard loads, **then** the document appears in the root section (no folder header).
- [ ] **Given** multiple documents share the same folder, **when** the dashboard loads, **then** they all appear in the same folder section.
- [ ] **Given** a folder section is visible, **when** the user clicks the header, **then** the section collapses (cards hidden, chevron rotates).
- [ ] **Given** a folder section is collapsed, **when** the user clicks the header, **then** the section expands (cards visible, chevron rotates back).
- [ ] **Given** a nested folder like `meetings:2024:q1:note`, **when** the dashboard renders, **then** the folder header shows "meetings > 2024 > q1" (breadcrumb).
- [ ] **Given** the user opens the "New document" dialog, **when** they select a folder and type a name, **then** the constructed id includes the folder prefix (e.g., selecting "meetings" + typing "review" → `meetings:review`).
- [ ] **Given** the user creates a document with an invalid id (containing `/`, `..`, empty segments), **when** they try to submit, **then** the API returns a 400 error.
- [ ] **Given** a document exists without a folder, **when** it appears on the dashboard, **then** it renders normally in the root section (backwards compatible with all existing documents).
- [ ] **Given** the user navigates to `/editor/meetings:note`, **when** the page loads, **then** the editor opens the document normally (no route changes needed).
- [ ] Folder sections render with the correct icons (folder icon), document count, and chevron.
- [ ] **Constitution checklist:**
  - [ ] `tsc --noEmit` passes with `strict` on; zero `any` introduced.
  - [ ] All new external inputs validated (ID pattern, new document dialog input).
  - [ ] Route handlers contain no business logic — folder extraction in `lib/documents.ts`.
  - [ ] Components use design tokens (no ad-hoc colors).
  - [ ] No layout-shift: folder section headers have consistent dimensions.
  - [ ] No secrets committed or logged.
  - [ ] No filesystem restructuring (all files remain flat).
  - [ ] No version directory collision.
- [ ] Tests pass: unit tests for ID validation and folder extraction, API tests for prefixed ids, dashboard rendering tests.
