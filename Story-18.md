# Story 18 — Document preview images on the dashboard

**Phase:** 4 (Enhancements) · **Estimate:** 2–3 days · **Depends on:** Story 5 (dashboard UI), Story 2 (document storage), Story 6 (PDF export)
**Architecture refs:** §2 (Document Storage), §8 (Directory Structure)
**UI refs:** [`ui-design.md`](./ui-design.md) — §2 (color tokens), §6.3 (cards), §7.4 (responsive grid)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Enhance the dashboard document cards with a preview image of each document's content. Previews are automatically generated on the server side when a document is saved — they render the first portion of Markdown content through the existing PDF pipeline and convert the first page to a PNG thumbnail. For documents without a preview yet, a placeholder gradient is shown.

Users will be able to:
- See a visual preview of each document's opening content on the dashboard
- Distinguish documents at a glance by their content preview rather than just title
- Open documents from the preview as before (clicking the card navigates to the editor)

## Approach: PDF-first thumbnail generation

Previews are generated entirely server-side using the **existing PDF rendering pipeline** + [`pdftoimg-js`](https://www.npmjs.com/package/pdftoimg-js):

1. Extract the first ~40 lines of Markdown from the document file
2. Parse to mdast with the existing `remark-parse` + `remark-gfm` pipeline
3. Render to a **compact PDF preview page** using the existing `renderMarkdownToPdf()` from `src/lib/pdf.tsx` — the same function used for full document exports
4. Convert the first page of the resulting PDF buffer to a PNG image via `pdftoimg-js` (which uses `pdfjs-dist` under the hood — Mozilla's PDF.js for Node — and rasterizes via a native `node-canvas`/Cairo backend; see the dependency caveat below)
5. Write the PNG to `documents/__previews__/<id>.png`

This approach:
- **Reuses the existing styled PDF pipeline** — previews look pixel-identical to what users see when exporting to PDF (same fonts, heading sizes, code blocks, colors, table rendering)
- **Auto-syncs with new node types** — if a future story adds a new markdown node to the PDF renderer, previews handle it automatically
- Works fully server-side (agent saves also get previews)
- No headless browser required
- Adds one runtime dependency (`pdftoimg-js` → `pdfjs-dist` + a native `node-canvas` for rasterization — see "Add dependency" for the native-dep caveat)
- Is fast enough (~200-500ms per preview)

> **Network note:** the reused PDF pipeline is not strictly offline. `renderMarkdownToPdf()` registers a Twemoji emoji source from a CDN (`registerEmojiSource` in `pdf.tsx`) and may download DejaVu Sans fonts on first run if they are not already present locally or on the system. Documents containing emoji will trigger a CDN fetch during preview generation. Since preview generation is best-effort, a failed fetch degrades the preview but never blocks the save.

## Scope / Tasks

### Storage & types

- [ ] **Preview directory:** `documents/__previews__/` — co-located with documents. Already git-ignored: `.gitignore` ignores the entire `/documents/` tree, so `__previews__/` is covered with no `.gitignore` change needed (verify only). Path is derived from `DOCS_ROOT` via a guarded resolver following the same pattern as `resolveDocPath`.
- [ ] **Extend `DocumentMeta`** (`src/types/document.ts`):
  - Add optional `previewUrl: string` field (relative URL path, e.g., `/api/previews/<id>.png`).
- [ ] **Update `GET /api/documents`** (`src/app/api/documents/route.ts`) to include `previewUrl` field in the response. Return `null` when no preview file exists yet (dashboard shows a placeholder).

### Add dependency

- [ ] `npm install pdftoimg-js` (already present at `^0.2.5`)
  - JavaScript wrapper around `pdfjs-dist` (currently pins `pdfjs-dist@4.8.69`, Mozilla's PDF.js for Node). MIT license.
  - **Native dependency caveat:** rendering a PDF page to a raster image with `pdfjs-dist` in Node requires a native canvas implementation. In this project that is `node-canvas` (`canvas`, Cairo-backed, with a `node-gyp`/`prebuild-install` step). This is **not** pure-JS and **does** introduce a native/system dependency (Cairo, Pango, libjpeg, etc., or platform prebuilt binaries). Deployment/CI images must provide the build toolchain or compatible prebuilt binaries.
  - **Version sensitivity:** `pdfjs-dist` 4.8.x has documented Node canvas-loading regressions. Pin the working `pdfjs-dist`/`pdftoimg-js` versions deliberately and cover them with the integration tests below.
  - Transitive deps: `pdfjs-dist` (~5MB unpacked) + native `canvas`.

### Preview generation engine (`src/lib/preview.ts`)

- [ ] **Content extraction:** `extractPreviewContent(markdown: string, maxLines?: number): string`
  - Takes raw Markdown, extracts the first `MAX_PREVIEW_LINES` (default: 40) lines.
  - Strips trailing empty lines.
  - Returns a string suitable for rendering (guaranteed non-empty; if the doc is empty or whitespace-only, return a placeholder text like "Empty document").

- [ ] **Preview PDF generation:** `buildPreviewPdf(markdown: string): Promise<Uint8Array>`
  - Takes the extracted markdown preview content.
  - Parses it to mdast via `parseMarkdown()` from `src/lib/markdown.ts` (existing shared pipeline).
  - Calls `renderMarkdownToPdf()` from `src/lib/pdf.tsx` (existing function — uses `@react-pdf/renderer` with DejaVu Sans fonts, `ui-design.md` token colors, full GFM styling).
  - The result is a PDF buffer containing the first page of the document's opening content, styled identically to the full PDF export.
  - Returns the PDF as a `Uint8Array` / `Buffer`.

- [ ] **PDF first-page → PNG thumbnail:** `renderPreviewFromPdf(pdfBuffer: Buffer): Promise<Buffer>`
  - Uses `pdftoimg-js`'s `pdfToImg()` with `{ pages: "firstPage", imgType: "png", scale: PREVIEW_SCALE }`.
  - Extracts the base64 data URL result and converts it to a raw PNG `Buffer`.
  - Output dimensions at 2× scale are approximately 1588×2246 (A4 portrait at 96 CSS px/in × 2), then CSS-downscaled on the dashboard.
  - If `pdftoimg-js` fails, logs a warning and throws so the caller can handle gracefully.

- [ ] **Public API:** `generatePreview(documentId: string, markdown: string): Promise<void>`
  - Orchestrates: `extractPreviewContent` → `buildPreviewPdf` → `renderPreviewFromPdf` → write PNG file.
  - Hooked into the **persistence layer** so it covers the app's real save paths (see "Server-side integration" for exact call sites). Must be independently importable.
  - Best-effort: if preview generation fails at any step (PDF render error, pdfjs worker timeout, disk full, CDN emoji fetch failure), it catches and logs a warning — the document save itself must never fail.
  - The preview file is written to `documents/__previews__/<id>.png`.

### Server-side integration

- [ ] **Path guard in `lib/security.ts`:**
  - Add `resolvePreviewPath(id: string): string` — same two-layer defense as `resolveDocPath`: `ID_PATTERN` test + containment check.
  - Resolves to `DOCS_ROOT / PREVIEW_DIR_NAME / <id>.png`.
  - Export the constant `PREVIEW_DIR_NAME = "__previews__"`.

> **Critical — hook the right save path.** In the default collab configuration (`isCollabEditorEnabled()` is on unless `NEXT_PUBLIC_COLLAB=0`), document saves do **not** go through `writeDocument`. Both human edits and agent/MCP edits (via `peerUpdateDocument`) are persisted by Hocuspocus' `onStoreDocument` → `storeYDocSnapshot()` in `src/lib/collab/persistence.ts`, which does its own `fs.writeFile(mdPath, md)`. `writeDocument` is only reached in the REST-fallback path (collab disabled or collab server unavailable). The preview hook must therefore live primarily in `storeYDocSnapshot`, with `writeDocument` as a secondary hook for the fallback path.

- [ ] **Primary hook — `storeYDocSnapshot` (`src/lib/collab/persistence.ts`):**
  - Call `generatePreview(id, md)` **inside the `if (!contentUnchanged)` branch, after `fs.writeFile(mdPath, md)`** (around line 240), so previews only regenerate when the `.md` actually changed. Handle both the incremental-section write and the full-serialize write (use the final `md` string that was written).
  - This single hook covers human collab edits, agent/MCP edits, and `onDisconnect` flushes.
  - Wrap in `try/catch` with `console.warn` exactly like the adjacent best-effort `createVersion` call — preview must never block or fail a persist.

- [ ] **Secondary hook — `documents.ts` (REST-fallback path):**
  - After `writeDocument` succeeds (inside `withLock`, after `fs.writeFile`), call `generatePreview(id, content)`.
  - After `createDocument` succeeds, call `generatePreview(id, content)` (this is the create path for both the API `POST /api/documents` route and MCP create).
  - After `deleteDocument` succeeds, clean up the preview file via `resolvePreviewPath(id)` + `fs.unlink` (single delete path; safe to call once here).
  - All are `try/catch` with `console.warn` on failure — preview is always best-effort.

- [ ] **Lazy import** at every call site: `await import("./preview")` (or the relative path) so `pdfjs-dist` / `node-canvas` / `@react-pdf/renderer` are not loaded at server startup.

- [ ] **Preview API route:** `src/app/api/previews/[id]/route.ts`
  - `GET /api/previews/[id]` — serves the preview PNG file.
  - Reads `documents/__previews__/<id>.png` and returns it with `Content-Type: image/png`.
  - Returns 404 if no preview exists (the dashboard fallback is client-side).
  - Path goes through `resolvePreviewPath(id)` guard — returns 400/403 for invalid/traversal ids.

### Dashboard UI changes

> **Design intent.** The preview turns each card into a miniature of the real document — the card *is* the page. Per `ui-design.md` §1 ("Content first"), the preview becomes the hero of the card and the chrome quiets down around it. The whole card should feel like one calm, tactile object: a framed page sitting on a soft surface, lifting gently on hover. All colors come from design tokens (`brand-*`, `surface*`, `border`); all motion uses the spec's easing `cubic-bezier(.2,.8,.2,1)` and respects `prefers-reduced-motion`.

#### Card structure (redesigned)

The card becomes two clean zones with no competing visuals:

```
┌─────────────────────────────┐
│        PREVIEW (4:3)        │   ← full-bleed thumbnail, hero
│  ·························  │      brand "seam" line at its base
├─────────────────────────────┤
│  Document Title             │   ← body (p-5)
│  ───────────────────────    │
│  🕐 5m ago            v3    │
└─────────────────────────────┘
```

- [ ] **Aspect ratio = 4:3** (`aspect-[4/3]`). Chosen over a wider ratio so the cropped A4 page shows a meaningful chunk of the opening content rather than a thin sliver. Set once on the preview container so the grid never shifts (no CLS).

- [ ] **Full-bleed preview, top of card.** The image area spans the card edge-to-edge at the top (no horizontal padding). The card already has `overflow-hidden rounded-lg`, so the top corners are clipped to the card radius automatically — no per-image `rounded-t-*` needed. The bottom edge of the preview meets the body.

- [ ] **Remove the 48px brand icon tile from the body when a preview/placeholder is shown.** With the thumbnail (or the icon-in-gradient placeholder) carrying the "this is a document" signal, a second large icon is redundant and noisy. The body leads with the **title** at full width — cleaner and more content-first. (Both preview and placeholder cards share this identical body layout for consistency.)

- [ ] **The image itself:**
  - `<img src={doc.previewUrl} alt={doc.title} loading="lazy" decoding="async" />`
  - `object-fit: cover` **with `object-position: top`** so it crops from the bottom and always shows the document's opening lines. (Source PNG is A4 portrait ~0.71 w/h; the 4:3 area is ~1.33 w/h, so `cover` crops the lower portion — `object-position: top` keeps the title/intro visible. Default `center` would hide the opening, so this is required, not optional.)
  - Wrap in a `relative overflow-hidden` container so the hover zoom is clipped.

- [ ] **Hover choreography (the "premium" feel):**
  - Card lifts and deepens its shadow (keep existing `hover:-translate-y-1` + elevation bump to ~`e2`).
  - Image performs a slow, subtle zoom: `transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.03]`.
  - A 2px **brand seam** sits at the base of the preview (`bg-gradient-to-r from-brand-500 to-brand-300`), resting at `opacity-60` and rising to `opacity-100` on hover — this is where the old top accent bar moves to, now visually tying the page to its frame.
  - Title shifts to `text-brand-600` (keep existing).
  - The delete affordance stays hover-revealed in the meta row.

- [ ] **Soft separation so the white page never looks pasted-on.**
  - Light mode: add an inset hairline on the image, `ring-1 ring-inset ring-black/[.06]`, so the white render has a defined edge against the white card.
  - Dark mode: the light render meets the dark `--surface` (#111827). Add a subtle bottom blend — a thin gradient overlay over the lowest ~16px of the preview fading from `transparent` to the card surface color — plus the brand seam beneath it. This makes the light thumbnail read as an intentional framed page, not a glaring white block. (See "Dark mode" below.)

- [ ] **Placeholder state (no preview yet) — make it beautiful, not a flat bar:**
  - Same 4:3 area. Use a layered indigo gradient instead of a single flat fill:
    - base `bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600`
    - a soft top-left light bloom overlaid: `radial-gradient(120% 120% at 25% 15%, rgba(255,255,255,.28), transparent 55%)`
  - Center the `file-text` document glyph (Lucide, ~36px, `text-white/90`) with a gentle `drop-shadow` so it floats.
  - Optional tasteful depth: a very faint oversized document glyph bleeding off one corner at ~6% white opacity (adds texture without noise). Keep it subtle.
  - No title/meta inside the placeholder — the body below carries those.

- [ ] **Error fallback:** if `<img>` fires `onError`, swap to the exact same gradient placeholder via a `useState` flag — graceful, no broken-image icon, visually identical to the not-yet-generated state.

- [ ] **Skeleton loading:** replace the current `h-[3px]` top accent bar with a full 4:3 preview-shaped shimmer block (`animate-pulse`, `bg-surface-2`) topped by a faint sheen, then the existing body skeleton rows — but drop the 48px icon-tile skeleton to match the new iconless body. Dimensions must match the real card exactly so there's zero layout shift when content arrives.

- [ ] **Responsive:**
  - Preview scales with the grid (`w-full aspect-[4/3]`); the existing `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` grid is unchanged.
  - Keep the preview on mobile too (it's the best part) — at single column it becomes a nice wide banner. Only consider hiding it if a future perf/density need arises; default is **show on all breakpoints**.

- [ ] **Dark mode:**
  - Light-theme thumbnail on dark cards is acceptable and common (code/editor previews). To keep it elegant: the bottom-fade blend + brand seam (above) soften the transition, and `ring-inset` is dropped in dark mode in favor of the existing `border-border`. Result: the page reads as a framed, lit document on a dark desk rather than a raw white rectangle.
  - Verify AA contrast for body text/meta in both themes (unchanged tokens already satisfy this).

## Preview template

The preview is generated using the **exact same PDF rendering pipeline** as `src/lib/pdf.tsx` — no custom SVG template is needed. The preview automatically inherits:

- **Font:** DejaVu Sans (registered by `renderMarkdownToPdf` for Unicode support including accented characters)
- **Styling:** headings, paragraphs, inline code, code blocks, blockquotes, lists, tables, horizontal rules, and links all rendered using the same styles defined in `pdf.tsx` (colors from `ui-design.md` tokens)
- **Page size:** A4 (standard) — the first page of the rendered preview captures approximately the first screen of content
- **Scale:** 2× for retina/HiDPI clarity (controlled by the `scale` option in `pdftoimg-js`)

Because the preview is rendered through the full PDF pipeline, it automatically supports:
- All heading levels (H1-H3 styled per PDF styles)
- Tables (rendered with header rows, cell borders)
- Lists and task lists
- Code blocks and inline code
- Blockquotes and thematic breaks
- Links (shown as styled text)
- Mermaid diagrams (when Story 17's PDF integration lands, they'll appear in previews automatically)

### Constitution compliance

- [ ] Preview directory resolution goes through a guarded `resolvePreviewPath` in `lib/security.ts` — same two-layer defense as `resolveDocPath`.
- [ ] `preview.ts` lives in `lib/` (framework-agnostic). No Next/React imports.
- [ ] Route handler (`/api/previews/[id]`) delegates to `lib/preview.ts`; contains no business logic or direct fs access.
- [ ] All magic values are named constants (`MAX_PREVIEW_LINES = 40`, `PREVIEW_SCALE = 2`, `PREVIEW_DIR_NAME = "__previews__"`).
- [ ] All new external inputs (document ids, preview path params) validated at the boundary.
- [ ] No `any` types.
- [ ] Preview generation is best-effort and never blocks a document save (collab persist or REST write).
- [ ] `__previews__/` is git-ignored (already covered by the `/documents/` rule — verify, no change expected).
- [ ] New dependency `pdftoimg-js` vetted: MIT license, wraps Mozilla `pdfjs-dist`. **Note the native dependency:** it requires `node-canvas` (Cairo-backed) for rasterization, which is a native/system dependency — documented and accepted, with deployment/CI requirements called out.

### Tests

- [ ] **Unit tests for `extractPreviewContent`:**
  - First 40 lines extracted correctly
  - Document with fewer than 40 lines returns all content
  - Empty document returns "Empty document"
  - Leading/trailing blank lines stripped
- [ ] **Integration tests for `buildPreviewPdf`:**
  - Given markdown content, produces a valid PDF buffer (check PDF magic bytes `%PDF`)
  - PDF contains the rendered content (spot-check via text in raw byte stream)
  - Style consistency: generated PDF uses DejaVu Sans font (font name appears in the PDF stream)
- [ ] **Integration tests for `generatePreview`:**
  - Given a document with simple Markdown, generates a valid PNG file (check PNG magic bytes `\x89PNG`)
  - Generated PNG has reasonable dimensions (≥ 400px width)
  - Regenerating preview overwrites the previous file
  - Preview for an empty document produces a valid PNG (shows "Empty document" placeholder)
- [ ] **Persistence-hook tests (primary save path):**
  - `storeYDocSnapshot` regenerates the preview when the `.md` content changes (the main human + agent/MCP path).
  - No preview regeneration when content is unchanged (`contentUnchanged` guard short-circuits).
  - A failing `generatePreview` does not throw out of `storeYDocSnapshot` (best-effort; persist still succeeds).
  - REST-fallback `writeDocument` also regenerates the preview.
- [ ] **Path traversal tests:**
  - `resolvePreviewPath` rejects `../../etc/passwd` style ids
  - `GET /api/previews/[id]` returns 400/403 for invalid ids
- [ ] **Dashboard rendering test (component test or manual E2E):**
  - Document card renders with preview image when `previewUrl` is set
  - Document card renders placeholder when `previewUrl` is null
  - Document card shows skeleton during loading
  - Lazy `<img>` error fallback works (simulate `onError`)
- [ ] **Cleanup tests:**
  - Deleting a document also removes its preview file
  - Deleting a document with no preview doesn't throw

## Out of scope

- Regenerating previews on a schedule or via a batch job (only on save).
- Animated previews or GIFs.
- User-selectable preview regions (auto-extracts from the top).
- Preview of images embedded in the document.
- SVG/resvg-based preview generation (PDF pipeline is strictly preferred for style consistency).
- Client-side preview generation (server-side only ensures consistency for both human and agent saves).

## Technical notes

- **`pdfjs-dist` initialization:** `pdftoimg-js` dynamically imports `pdfjs-dist/legacy/build/pdf.mjs` on first call. The PDF.js worker is configured internally and doesn't need manual setup. The first preview call will be slightly slower (~300ms for worker init + rendering); subsequent calls reuse the cached worker.
- **PDF rendering cost:** The existing `renderMarkdownToPdf` function calls `@react-pdf/renderer`'s `renderToBuffer`, which builds the full document model and renders to PDF. For the short preview excerpt (~40 lines), this is fast (~50ms). The PDF→PNG step via `pdftoimg-js` adds another ~100-200ms. Total per-preview generation: ~200-500ms — acceptable for a background task on save.
- **Preview content freshness:** Previews are regenerated whenever the `.md` is actually written. The primary path (`storeYDocSnapshot`) is already debounced by Hocuspocus (`onStoreDocument` ~400ms, max 30s) and skips writes when content is unchanged (`contentUnchanged` guard), so previews naturally batch and only fire on real changes — hook `generatePreview` inside that same changed-content branch. The REST-fallback `writeDocument` path regenerates per save. If perf still becomes an issue, add a debounce/in-flight guard inside `generatePreview` (skip if a generation is already running for the same id, queue the latest content, run once after a quiet period).
- **Why PDF over SVG/resvg:** The PDF pipeline already exists, is tested, and fully styled. Using it for previews means:
  1. Zero custom styling code for the preview — it inherits everything from the PDF renderer
  2. Automatic support for all markdown features the PDF renderer handles (tables, lists, code blocks, headings, blockquotes, etc.)
  3. Future-proofing: when Story 17 adds mermaid diagram support to PDF, those diagrams automatically appear in previews too
  4. Consistent visual experience: the dashboard preview looks exactly like the first page of a PDF export
- **`@resvg/resvg-js` is not needed for this story.** The SVG→resvg approach was the initial plan, but the PDF→PNG path is simpler (reuses existing code) and produces more consistent results. `@resvg/resvg-js` remains a dependency for Story 17 (mermaid PDF integration).
- **Content extraction for preview:** Use the first `MAX_PREVIEW_LINES` (40) lines of raw Markdown. This captures approximately one screen of content — enough to show a meaningful excerpt. The preview PDF page renders this at standard A4 layout, so the card will display it CSS-scaled down.
- **Preview directory cleanup:** Consider adding a `POST /api/admin/regenerate-previews` or an MCP tool for batch regeneration if the preview design changes later. Not in scope now, but the `generatePreview` function should be independently importable.

## UI Wireframe (dashboard card with preview)

```
With preview (the hero):
┌──────────────────────┐
│██████████████████████│  ← Full-bleed preview, 4:3
│███ PDF-rendered █████│     object-fit: cover; object-position: top
│███ opening lines ████│     (DejaVu Sans, headings, code, tables —
│███ of the document ██│      pixel-identical to PDF export)
│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  ← 2px brand seam (60% → 100% on hover)
│                      │
│  Document Title      │  ← body (p-5), title leads (no icon tile)
│  ──────────────────  │  ← divider
│  🕐 5m ago      v3   │  ← meta row (delete reveals on hover)
└──────────────────────┘
   hover: card lifts (-translate-y-1, e2 shadow),
          image slow-zooms scale-[1.03], seam brightens

Placeholder (no preview yet):
┌──────────────────────┐
│╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲│  ← layered indigo gradient, 4:3
│╲╲ from-brand-400 ╲╲╲╲│     + top-left white bloom (radial)
│╲╲╲╲╲╲ 📄 ╲╲╲╲╲╲╲╲╲╲╲╲│     centered file-text glyph, white/90
│╲╲ to-brand-600 ╲╲╲╲╲╲│     soft drop-shadow
│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  ← same brand seam
│  Document Title      │  ← identical body layout
│  🕐 just now         │
└──────────────────────┘

Skeleton loading:
┌──────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░ │  ← animate-pulse shimmer
│ ░░░░░░░░░░░░░░░░░░░░ │     4:3, bg-surface-2 fill
│ ░░░░░░░░░░░░░░░░░░░░ │     (matches real card dims → no CLS)
│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│
│  ░░░░░░░░░░░░░░       │  ← title row (no icon tile)
│  ░░░░░░░░░░           │  ← meta row
└──────────────────────┘
```

## Acceptance criteria

- [ ] **Given** documents exist with content, **when** the dashboard loads, **then** each document card shows a preview image of the document's opening content.
- [ ] **Given** a document is newly created, **when** it first appears on the dashboard, **then** it shows a gradient placeholder (no preview yet — preview is generated on first save).
- [ ] **Given** a document already has a preview, **when** a user edits and saves it, **then** the preview is regenerated to reflect the new content.
- [ ] **Given** an agent edits a document via MCP, **when** persistence completes, **then** the preview is regenerated (same hook as user save).
- [ ] **Given** a document is deleted, **when** it disappears from the dashboard, **then** its preview file is also removed from `__previews__/`.
- [ ] **Given** the preview image fails to load on the client, **then** a gradient placeholder is shown instead (graceful fallback, no broken image icon).
- [ ] **Given** the document has no content (empty), **then** the preview shows "Empty document" styled through the PDF pipeline.
- [ ] **Given** the dashboard is loading, **then** skeleton cards show a preview-shaped shimmer placeholder.
- [ ] **Given** a document has more than ~40 lines, **then** the preview shows the first ~40 lines (styled identically to the first page of the PDF export).
- [ ] **Given** `GET /api/previews/[id]` is called for a non-existent preview, **then** a 404 response is returned (dashboard shows fallback).
- [ ] **Given** `GET /api/previews/[id]` is called with a path-traversal id, **then** it is rejected with 400/403 before hitting the filesystem.
- [ ] Preview images render correctly on retina/HiDPI displays (2× scale from `pdftoimg-js`, sharp text and layout).
- [ ] Preview images respect the card's rounded top corners (clipped by the card's `overflow-hidden rounded-lg`; no sharp corners breaking the border-radius).
- [ ] Preview styling matches the PDF export output exactly (same fonts, colors, spacing, table rendering, etc.).
- [ ] **Visual polish (the card looks beautiful):**
  - [ ] Preview is full-bleed at the top, 4:3, with `object-position: top` showing the document's opening lines.
  - [ ] On hover the card lifts, the image slow-zooms (`scale-[1.03]`), and the brand seam brightens — smooth, using the spec easing and honoring `prefers-reduced-motion`.
  - [ ] The white render is softly framed (light: inset hairline; dark: bottom blend into `--surface` + brand seam) so it never looks like a raw pasted rectangle, in both themes.
  - [ ] Body leads with the title (no redundant 48px icon tile); preview and placeholder cards share the identical body layout.
  - [ ] Placeholder is a layered indigo gradient with a centered glyph and light bloom — not a flat bar.
  - [ ] No layout shift between skeleton → placeholder → loaded preview (identical dimensions).
- [ ] **Constitution checklist:**
  - [ ] `tsc --noEmit` passes strict; zero new `any`.
  - [ ] All new external inputs validated (preview path param, document id in hooks).
  - [ ] Route handlers contain no business logic — delegate to `lib/preview.ts`.
  - [ ] Components use design tokens (no ad-hoc hex/px for themed values).
  - [ ] No layout-shift surprises: preview image has explicit aspect ratio, skeleton placeholder matches dimensions.
  - [ ] No secrets committed or logged; `.env.example` updated only if config is added.
  - [ ] Preview generation is best-effort and never blocks a document save (collab persist or REST write).
  - [ ] `__previews__/` is git-ignored (covered by the existing `/documents/` rule — verified).
  - [ ] New dependency `pdftoimg-js` vetted: MIT license, Mozilla PDF.js. Native `node-canvas` (Cairo) dependency documented and accepted; deployment/CI provides the toolchain or prebuilt binaries.
- [ ] Tests pass: unit tests for content extraction, path traversal; integration test for PDF buffer generation and PNG output.
