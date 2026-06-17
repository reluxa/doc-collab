# Story 17 — Mermaid diagram support in documents

**Phase:** 4 (Enhancements) · **Estimate:** 4–5 days (server-side render + rasterization risk; PDF support may be split to a follow-up) · **Depends on:** Story 12 (markdown round-trip)
**Architecture refs:** §13 (Future Considerations — extensibility), [`Architecture-final.md`](./Architecture-final.md)
**UI refs:** [`ui-design.md`](./ui-design.md) — §4 (elevation, motion), §6 (typography), §8 (a11y)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Enable users to embed interactive diagrams directly in their documents using Mermaid.js syntax inside fenced code blocks (` ```mermaid `). Diagrams render as SVG in the browser editor and are included as rendered images in PDF exports.

Users will be able to:
- Write Mermaid syntax in fenced code blocks with the `mermaid` language tag
- See diagrams rendered inline (replacing the code block) in the editor
- Toggle between rendered diagram and source code view
- Export documents with diagrams to PDF with diagrams included
- Support all common diagram types: flowcharts, sequence diagrams, class diagrams, state diagrams, Gantt charts, pie charts, entity-relationship diagrams, and user journey maps

## Scope / Tasks

- [ ] Add `mermaid` package to dependencies (`mermaid@^11`)
- [ ] `src/lib/mermaid.ts`: shared diagram rendering utilities
  - `renderMermaidToSvg(source: string): Promise<string>` — render Mermaid source to SVG string
  - `validateMermaid(source: string): Promise<boolean>` — validate Mermaid syntax without rendering (use `mermaid.parse()`)
  - Configure mermaid via a one-time lazy initializer (theme, `securityLevel: 'strict'`, `startOnLoad: false`); do **not** static-import mermaid at module top level — lazy `import("mermaid")` to keep it out of the initial editor bundle (mermaid@11 is large)
  - Handle mermaid errors gracefully (syntax errors show source with error message)
- [ ] `src/components/editor/mermaid-renderer.tsx`: client-side diagram component
  - Accepts mermaid source string as prop
  - Renders as inline SVG when valid
  - Falls back to syntax-highlighted code block when invalid
  - Shows error tooltip/banner on parse errors ("Syntax error at line 5")
  - Auto-resizes SVG to fit editor width (responsive)
  - Keyboard accessible: Tab to focus, Enter to toggle code/raw view
- [ ] **Editor integration (Tiptap):**
  - `src/components/editor/mermaid-node.tsx`: extend the existing `CodeBlockLowlight` node with a custom NodeView (do **not** introduce a new node type — a new type forces a shared ProseMirror/Yjs schema change across all collaborators and complicates markdown round-trip). Note: `StarterKit` is configured with `codeBlock: false` and `CodeBlockLowlight` is registered separately in `editor.tsx`; build on that node.
  - NodeView detects `language === "mermaid"` on the code block and renders the diagram preview with a toggle button
  - Toggle button (</> icon) switches between rendered diagram and source code view
  - Maintains round-trip with markdown: because it remains a code block, round-trip is handled by the **`tiptap-markdown` serializer** (`editor.tsx` `getMarkdown()`), not `src/lib/markdown.ts`. Verify the fenced ` ```mermaid ` block serializes unchanged.
  - Collaborative editing: works automatically since the node stays a code block participating in the existing CRDT schema
- [ ] **PDF export integration (`src/lib/pdf.tsx`):**
  - Detect `code` nodes with `lang === "mermaid"` in the mdast tree (already parsed as `code` nodes via `remark-gfm` — no markdown pipeline change needed in `src/lib/markdown.ts`)
  - Render mermaid source to SVG server-side (see server-side rendering risk in Technical notes), then **rasterize SVG → PNG** (e.g. `@resvg/resvg-js` or `sharp`) and embed as a PNG data URI via react-pdf's `<Image>`. react-pdf's `<Image>` is raster-only and does **not** reliably render SVG data URIs.
  - Fall back to raw source code block (existing `code` style) if rendering fails
  - Scale diagram to fit page width (max 80% of page width, maintain aspect ratio)
- [ ] **Editor toolbar enhancement:**
  - "Code block" button in toolbar gains a submenu with language options
  - "Mermaid Diagram" option inserts a pre-populated code block template
  - Template: ` ```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]\n``` `
- [ ] **Dashboard & document list:**
  - Document cards on the home page show a subtle "diagram" indicator when the document contains mermaid blocks (optional badge or icon)
- [ ] **MCP integration:**
  - Update tool descriptions in `mcp-server/tools.ts` (single file, not a `tools/` directory) to mention mermaid diagram support in markdown content
  - Ensure the `create_document`, `update_document`, and `update_section` tool descriptions document the ` ```mermaid ` syntax (these are the actual tool names)
  - Optionally add `insert_mermaid_diagram` tool for agent-focused diagram insertion (simpler prompt than raw markdown)
  - Add mermaid examples to agent system prompt / tool hints so LLMs know diagrams are available
- [ ] **Constitution compliance:**
  - API route handlers delegate to `src/lib/mermaid.ts`; no direct rendering in route files (§4)
  - All new external inputs validated with zod at the boundary (§2)
  - Component files use kebab-case (`mermaid-renderer.tsx`, `mermaid-node.tsx`); exported components use PascalCase (`MermaidRenderer`, `MermaidNode`) (§3)
  - No magic values (diagram max-width, render timeout, error thresholds) — use named constants or design tokens
- [ ] Tests:
  - Unit tests for `renderMermaidToSvg` (valid diagrams, error handling, timeout)
  - Unit tests for `validateMermaid` (valid syntax, syntax errors, empty input)
  - Unit tests for PDF mermaid rendering (diagram appears in PDF, fallback on error)
  - E2E tests: insert mermaid block, render diagram, toggle view, export PDF with diagram
  - MCP tests: agent can create/update mermaid diagrams via tools

## Out of scope

- Real-time collaborative diagram editing (multi-cursor on diagrams).
- Custom mermaid themes or per-document theme configuration.
- Diagram-to-diagram linking or cross-references.
- Client-side mermaid rendering in PDF (server-side only).
- Mermaid live editor / drag-and-drop diagram builder (text-based only).

## Technical notes

- **Mermaid rendering in Node (MAJOR RISK — spike before committing):** Mermaid needs a real DOM with layout, specifically `getBBox()` for sizing nodes/text. **jsdom does not implement `getBBox`**, so plain jsdom produces broken or zero-sized diagrams. Realistic server-side options are `@mermaid-js/mermaid-cli` or Playwright, both of which spawn a **headless Chromium**. That is a heavy dependency for the PDF route and is in tension with the "works offline, no CDN" acceptance criterion. Decide explicitly: (a) accept a bundled headless browser, (b) accept browser-rendered-and-uploaded SVG from the client, or (c) split PDF diagram support into a follow-up story. Do a short spike first.
- **Security:** Mermaid diagrams are user-/agent-generated content. Configure mermaid with `securityLevel: 'strict'` by default to prevent injection (never `'loose'` for untrusted input). Sanitize SVG output before embedding. Enforce a max source length at the boundary (zod).
- **Performance:** `mermaid.render()` is async (Promise-based) in v11 in **both** Node and the browser. Cache rendered output in-memory keyed by a hash of the source with a TTL (e.g., 60s) to avoid re-rendering on every scroll/selection change. Debounce re-rendering during live editing (300ms).
- **PDF rendering path:** react-pdf's `<Image>` is raster-only. Primary plan: render mermaid → SVG → **rasterize to PNG** (`@resvg/resvg-js` preferred — pure WASM, no system deps; `sharp` is an alternative but pulls native deps) → embed as PNG data URI. Do **not** rely on react-pdf rendering an SVG data URI directly. (Converting the SVG into react-pdf native `<Svg>` primitives is an alternative but a much larger effort.)
- **Browser rendering path:** Lazy `import("mermaid")` on first diagram render. Use `mermaid.render()` per-diagram and inject the returned SVG. Initialize config once. Use the existing lowlight highlighter for the source view.
- **Error handling:** When mermaid fails to parse, show the source code with a subtle error indicator (red underline or tooltip). Never crash the editor. Log mermaid errors once per session (not per-render).
- **Font consistency:** Ensure mermaid diagrams use the same font family as the document (system font stack from `ui-design.md`) by configuring mermaid theme variables.

## UI Wireframe

```
Editor — rendered diagram view:
┌─────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │         ┌─────┐                         │ │
│ │         │ Start│                         │ │
│ │         └──┬──┘                         │ │
│ │            │                            │ │
│ │         ┌──┴──┐                         │ │
│ │         │Decision│                      │ │
│ │         └──┬──┘                         │ │
│ │          ╱   ╲                          │ │
│ │   Yes   ╱     ╲   No                   │ │
│ │        ▼       ▼                       │ │
│ │    ┌─────┐  ┌─────┐                    │ │
│ │    │Action│  │End  │                    │ │
│ │    └─────┘  └─────┘                    │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                            [</> toggle]    │
└─────────────────────────────────────────────┘

Editor — source code view:
┌─────────────────────────────────────────────┐
│ ```mermaid                                   │
│ graph TD                                     │
│   A[Start] --> B{Decision}                  │
│   B -->|Yes| C[Action]                      │
│   B -->|No| D[End]                          │
│ ```                                          │
│                            [👁 toggle]       │
└─────────────────────────────────────────────┘

Toolbar — code block submenu:
┌──────────────────┐
│ Code Block ▼     │
├──────────────────┤
│ Plain            │
│ JavaScript       │
│ TypeScript       │
│ Python           │
│ ──────────────── │
│ 📊 Mermaid       │ ← inserts template
│ Diagram          │
└──────────────────┘
```

## Acceptance criteria

- [ ] **Given** a document contains a ` ```mermaid ` code block, **when** the user opens the editor, **then** the diagram renders as an inline SVG with correct layout.
- [ ] **Given** a mermaid code block has syntax errors, **when** the user views it, **then** an error message appears and the source code is shown with the error highlighted.
- [ ] **Given** a rendered diagram is visible, **when** the user clicks the toggle button, **then** the view switches to source code with syntax highlighting.
- [ ] **Given** a document contains mermaid diagrams, **when** the user exports to PDF, **then** the diagrams appear as rendered images in the exported PDF.
- [ ] **Given** the user clicks "Mermaid Diagram" in the toolbar submenu, **then** a pre-populated mermaid template is inserted at the cursor position.
- [ ] **Given** the user edits a mermaid code block, **when** editing stops (after 300ms debounce), **then** the diagram re-renders if the source changed.
- [ ] All supported diagram types render correctly: flowchart, sequence, class, state, Gantt, pie, ER, user journey.
- [ ] Diagrams scale responsively to fit the editor width and maintain aspect ratio.
- [ ] Mermaid rendering does not block editor interaction (diagrams render in background).
- [ ] PDF export with diagrams works offline (no CDN dependency for mermaid itself — the library is bundled).
- [ ] **Constitution checklist:**
  - [ ] `tsc --noEmit` passes strict; zero new `any`.
  - [ ] All new external inputs validated (mermaid source string length limits, SVG output sanitization).
  - [ ] Route handlers contain no business logic — delegate to `lib/mermaid.ts`.
  - [ ] Components use design tokens (no ad-hoc hex/px for themed values).
  - [ ] No layout-shift surprises: skeleton placeholder while diagram renders.
  - [ ] SVG output is sanitized before embedding (no script/event handlers).
  - [ ] No secrets committed or logged; `.env.example` updated **only if** config is added (e.g. render timeout, max source length) — otherwise N/A.
- [ ] Tests pass: unit tests for rendering, validation, PDF export; E2E tests for editor integration and PDF export.
