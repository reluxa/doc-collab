# Story 17 — Mermaid diagram support in documents

**Phase:** 4 (Enhancements) · **Estimate:** 2–3 days · **Depends on:** Story 12 (markdown round-trip)
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
  - `validateMermaid(source: string): Promise<boolean>` — validate Mermaid syntax without rendering
  - Configure mermaid once at import time (theme, security level, startOnLoad false)
  - Handle mermaid errors gracefully (syntax errors show source with error message)
- [ ] `src/components/editor/mermaid-renderer.tsx`: client-side diagram component
  - Accepts mermaid source string as prop
  - Renders as inline SVG when valid
  - Falls back to syntax-highlighted code block when invalid
  - Shows error tooltip/banner on parse errors ("Syntax error at line 5")
  - Auto-resizes SVG to fit editor width (responsive)
  - Keyboard accessible: Tab to focus, Enter to toggle code/raw view
- [ ] **Editor integration (Tiptap):**
  - `src/components/editor/mermaid-node.tsx`: custom Tiptap node extension for mermaid code blocks
  - Detects ` ```mermaid ` language tag in code blocks
  - Renders the mermaid node as the diagram preview with toggle button
  - Toggle button (</> icon) switches between rendered diagram and source code view
  - Maintains round-trip with markdown (code block ↔ diagram)
  - Collaborative editing: mermaid nodes participate in CRDT (same as code blocks)
- [ ] **Markdown pipeline integration:**
  - `src/lib/markdown.ts`: update parse/serialize pipeline
  - Fenced code blocks with `language === "mermaid"` are preserved as code nodes (no special parsing needed — mdast already handles this via `remark-gfm`)
  - Add `remark-mermaid` processing in the HTML rendering pipeline (for preview/metadata use)
- [ ] **PDF export integration (`src/lib/pdf.tsx`):**
  - Detect `code` nodes with `lang === "mermaid"` in the mdast tree
  - Render mermaid source to SVG string server-side
  - Embed SVG as inline image in PDF (using react-pdf's `<Image>` component with data URI)
  - Fall back to raw source code block if rendering fails
  - Scale diagram to fit page width (max 80% of page width, maintain aspect ratio)
- [ ] **Editor toolbar enhancement:**
  - "Code block" button in toolbar gains a submenu with language options
  - "Mermaid Diagram" option inserts a pre-populated code block template
  - Template: ` ```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]\n``` `
- [ ] **Dashboard & document list:**
  - Document cards on the home page show a subtle "diagram" indicator when the document contains mermaid blocks (optional badge or icon)
- [ ] **MCP integration:**
  - Update tool descriptions in `mcp-server/tools/` to mention mermaid diagram support in markdown content
  - Ensure `write_document` and `replace_section_content` tool descriptions document the ` ```mermaid ` syntax
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

- **Mermaid rendering in Node:** Mermaid v11+ supports server-side rendering via `mermaid.render()`. This requires a jsdom-like environment for the SVG generation. May need `@mermaid-js/mermaid-cli` or direct `mermaid.initialize()` + `mermaid.render()` calls.
- **Security:** Mermaid diagrams are user-generated content. Configure mermaid with `securityLevel: 'loose'` only for trusted contexts; default to `'strict'` to prevent injection attacks. Sanitize SVG output before embedding.
- **Performance:** Mermaid rendering is synchronous in Node but async in browser. Cache rendered SVGs in-memory with a TTL (e.g., 60s) to avoid re-rendering on every scroll/selection change. Debounce re-rendering during live editing (300ms).
- **PDF rendering path:** Since react-pdf runs in Node, use `mermaid.render()` to produce SVG, then pass as data URI (`data:image/svg+xml;base64,...`) to the `<Image>` component. Test that react-pdf handles SVG data URIs correctly (may need to convert to PNG via `sharp` if SVG embedding fails).
- **Browser rendering path:** Use `mermaid.run()` (v11 API) or `mermaid.render()` + innerHTML injection. Handle the `mermaid.conf` globally but call `render()` per-diagram. Use the existing lowlight syntax highlighter for source view.
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
  - [ ] No secrets committed or logged; `.env.example` updated when adding config.
- [ ] Tests pass: unit tests for rendering, validation, PDF export; E2E tests for editor integration and PDF export.
