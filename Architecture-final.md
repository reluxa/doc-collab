# doc-collab — Architecture Design (Final)

## Overview

A collaborative online document editor where a human user and an AI agent (openclaw) can edit the same Markdown documents simultaneously. The human uses a WYSIWYG web editor; the agent interacts through an MCP server. Both sides read and write the same `.md` files on disk, with real-time sync between them.

This revision resolves every issue raised in `review-1.md`. A traceability table mapping each review item to its resolution is in [Section 14](#14-review-resolution-traceability).

---

## 1. Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | **Next.js 16** (App Router, Turbopack default) + TypeScript 5+ |
| Runtime / custom server | Node.js **20.9+** LTS (`tsx` in dev, compiled JS in prod) |
| Styling | Tailwind CSS v4 |
| WYSIWYG Editor | [Tiptap](https://tiptap.dev/) (ProseMirror-based) |
| Markdown ↔ Editor | [`tiptap-markdown`](https://github.com/aguingand/tiptap-markdown) (markdown-it based) |
| Server-side Markdown | [`unified`](https://unifiedjs.com/) + `remark-parse` + `remark-gfm` (PDF + validation) |
| PDF Export | [@react-pdf/renderer](https://react-pdf.org/) |
| MCP Server | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) (stdio transport) |
| Real-time Sync | WebSocket (`ws`) hosted **inside the Next.js custom server** + filesystem watching (`chokidar`) |
| Conflict resolution | **CRDT via [Yjs](https://docs.yjs.dev/)** (section-structured `Y.Doc`) — see [Section 11](#11-section-based-collaborative-editing--conflict-resolution) |
| Collaboration server | [Hocuspocus](https://tiptap.dev/docs/hocuspocus) (Yjs sync backend, hosted in the custom server) |
| Editor collab binding | `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor` (presence) |
| Offline buffer | `y-indexeddb` (local-first persistence + offline merge) |
| Process orchestration (dev) | [`concurrently`](https://www.npmjs.com/package/concurrently) |
| Document Storage | Plain `.md` files on disk (`$DOCUMENTS_DIR`, default `./documents/`) + optional `.ydoc` CRDT snapshots |

> **Note (Review #1 — rejected):** The review claimed Next.js 16 did not exist. This is incorrect: **Next.js 16 was released on October 21, 2025** and is the current stable line ([release notes](https://nextjs.org/blog/next-16)). The original architecture's choice of Next.js 16 stands. Relevant Next 16 implications adopted below:
>
> - **Async dynamic APIs:** `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` are now async and **must be awaited**. Route handlers in Section 4 use `const { id } = await params;`.
> - **Turbopack is the default bundler** (2–5× faster builds, up to 10× faster Fast Refresh). Opt out per-command with `--webpack` only if needed.
> - **Node.js 20.9+** is the minimum runtime; **TypeScript 5.1+** minimum.
> - **`middleware.ts` → `proxy.ts`** rename (not used by this MVP, noted for completeness).

---

## 2. Document Storage

Each document is a single `.md` file under the documents directory. This keeps things simple, git-friendly, and easy to back up.

```
$DOCUMENTS_DIR/        # default ./documents/
  project-notes.md
  meeting-minutes.md
  design-doc.md
```

### 2.1 Configurable location

The documents directory is resolved from the `DOCUMENTS_DIR` environment variable, falling back to `./documents/`. The resolved absolute path (`DOCS_ROOT`) is computed once at startup and shared by both the web app and the MCP server.

```ts
// lib/config.ts
export const DOCS_ROOT = path.resolve(process.env.DOCUMENTS_DIR ?? "./documents");
```

### 2.2 Document IDs and the allowed character set

A document ID is the filename without the `.md` extension. IDs are **strictly validated** before they ever touch the filesystem:

```ts
// Allowed: lowercase/uppercase letters, digits, hyphen, underscore. 1–128 chars.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
```

Characters such as `/`, `\`, `.`, `*`, `?`, `:`, and any path separators are rejected. This rejection happens before path resolution, which (combined with Section 2.3) eliminates path-traversal entirely.

### 2.3 Path-traversal protection (Review #3)

Every filesystem operation goes through a single guarded resolver in `lib/documents.ts`. No route handler or MCP tool ever builds a path by hand.

```ts
// lib/security.ts
export function resolveDocPath(id: string): string {
  if (!ID_PATTERN.test(id)) throw new BadRequestError("Invalid document id");
  const target = path.resolve(DOCS_ROOT, `${id}.md`);
  // Defense in depth: ensure the resolved path is still inside DOCS_ROOT.
  const rel = path.relative(DOCS_ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ForbiddenError("Path escapes documents directory");
  }
  return target;
}
```

Two independent layers protect us: (1) the strict ID pattern rejects traversal sequences up front, and (2) the resolved path is verified to remain inside `DOCS_ROOT`. A value like `../../etc/passwd` fails the pattern check immediately, and even a hypothetical bypass would be caught by the containment check.

---

## 3. WYSIWYG Editor

Built on **Tiptap** with the following extensions:

- Headings (h1–h6)
- Bold, italic, underline, strikethrough, code
- Ordered and unordered lists
- Task lists
- Blockquotes
- Code blocks with syntax highlighting (`lowlight`)
- Links
- Tables
- Horizontal rules
- Text highlight / color
- Placeholder text for empty documents
- **`tiptap-markdown`** — provides the Markdown ↔ editor conversion (see Section 3.1)

### 3.1 The content pipeline (Review #2)

> The original claim that Tiptap's `generateText()` / `generateHTML()` round-trip Markdown was **incorrect**. `generateText()` strips markup to plain text and `generateHTML()` serializes Tiptap's internal JSON to HTML — neither parses or emits Markdown.

The single source of truth on disk is **Markdown**. Conversion is handled explicitly:

```
                    load (read .md)                    save (write .md)
 ┌──────────┐  raw markdown   ┌──────────────────┐  raw markdown   ┌──────────┐
 │  .md file │ ───────────────►│  tiptap-markdown │ ───────────────►│  .md file │
 │  (disk)   │                 │  parse → PM JSON │                 │  (disk)   │
 └──────────┘                 │  PM JSON → serialize                └──────────┘
                              └──────────────────┘
```

- **Load:** the API returns raw Markdown. The editor initializes content via `tiptap-markdown`, which uses `markdown-it` (GFM-configured) to parse Markdown into the ProseMirror document.
- **Save:** the editor serializes the ProseMirror document back to Markdown via `editor.storage.markdown.getMarkdown()`. The API writes that raw Markdown to disk.
- **Server-side Markdown** (for PDF and validation) uses a separate, deterministic `unified` + `remark-gfm` pipeline so PDF export does not depend on a running browser/editor.

**Round-trip stability** is a known risk with any Markdown WYSIWYG: the serializer must be configured (GFM tables, task lists, strikethrough, highlight) so that load→save of an untouched document is a no-op. This is covered by a round-trip snapshot test suite (`tests/markdown-roundtrip.test.ts`) that feeds representative Markdown through parse→serialize and asserts stability. Any extension whose Markdown serialization is lossy (e.g., text color) is documented as HTML-fenced or dropped, by explicit decision, rather than silently corrupting files.

---

## 4. REST API (Next.js Route Handlers)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/documents` | List all documents (id, title, modified date) |
| `GET` | `/api/documents/[id]` | Get document content as Markdown (+ `ETag`) |
| `POST` | `/api/documents` | Create a new document |
| **`PUT`** | `/api/documents/[id]` | **Replace** document content (full-content write) |
| `DELETE` | `/api/documents/[id]` | Delete a document |
| `GET` | `/api/documents/[id]/pdf` | Generate and stream a PDF of the document |

All API routes delegate to `lib/documents.ts`, which is the only module that touches the filesystem (and the only place `resolveDocPath` is called).

> **Next.js 16 note:** dynamic route `params` are async. Handlers destructure with `const { id } = await params;` before calling into `lib/documents.ts`.

### 4.1 `PUT` instead of `PATCH` (Review #6)

The write replaces the entire document body, so the semantically correct verb is **`PUT`** (idempotent full replacement), not `PATCH` (partial update). This matters because the API is also consumed programmatically by agents.

### 4.2 Optimistic concurrency / ETags (Review #8)

To avoid silent last-write-wins clobbering:

- `GET /api/documents/[id]` returns an `ETag` header. The version is a strong hash of the file bytes (`sha256`), which is stable and independent of clock skew.
- `PUT /api/documents/[id]` **requires** an `If-Match: "<etag>"` header. The server re-hashes the current file under a per-document write lock and:
  - if the hash matches → write succeeds, returns the new `ETag`;
  - if it differs → responds **`409 Conflict`** with the current content and current `ETag`.
- The browser handles `409` by surfacing a conflict prompt (Section 7.4) instead of overwriting.

A lightweight in-process async mutex per document id serializes concurrent writes within each process to make the read-hash-write sequence atomic.

---

## 5. PDF Export

- Server-side rendering using **@react-pdf/renderer**.
- Markdown is parsed by the shared `unified` + `remark-gfm` pipeline into an mdast tree, which is mapped to React-PDF components (`Text`, `View`, `StyleSheet`, …). This avoids the inaccurate assumption that the editor's HTML is available server-side.
- **Streaming:** `@react-pdf/renderer`'s `renderToStream()` returns a Node `Readable`, which is adapted to a Web `ReadableStream` and returned with `Content-Type: application/pdf`. Note that `renderToStream` still builds the document model in memory before emitting bytes; for the MVP's document sizes this is acceptable. True chunked-from-source streaming is not provided by the library and is out of scope (documented, per review suggestion).
- Triggered via a button in the editor UI or by calling the API directly.

---

## 6. MCP Server (Agent Integration)

A standalone MCP server (stdio transport) that the openclaw agent connects to. Exposes:

| Tool | Arguments | Description |
|------|-----------|-------------|
| `list_documents` | — | List all documents with metadata |
| `read_document` | `name: string` | Read and return Markdown content (+ current version) |
| `create_document` | `name: string, content: string` | Create a new document |
| `update_document` | `name: string, content: string, expected_version?: string` | Update an existing document; if `expected_version` is supplied and stale → returns a conflict error |
| `delete_document` | `name: string` | Delete a document |

- The MCP server imports the **same** `lib/documents.ts` module as the web app, so `name` is run through `resolveDocPath` and gets identical ID validation and path-traversal protection (Review #3 applies to MCP tools too).
- `update_document` accepts an optional `expected_version` so a careful agent can opt into optimistic concurrency; omitting it is an explicit last-write-wins (logged).
- The MCP server shares `DOCS_ROOT` with the web app, so changes from either side are immediately visible on disk.

---

## 7. Real-Time Sync Architecture

### Problem

Two independent actors (human in browser, AI agent via MCP) edit the same files. Each side needs to see the other's changes without manual refresh.

### Design principle: the filesystem is the source of truth, broadcasting is watcher-driven

Rather than each writer manually broadcasting, **each process watches the shared directory and reacts to the events it owns**:

- The **web server** watches the directory and broadcasts changes to **browsers** over WebSocket.
- The **MCP server** watches the same directory and notifies the **agent** over stdio.

This decouples writers from notifiers and makes both directions symmetric.

### 7.1 WebSocket lives inside the Next.js custom server (Review #4)

The original design placed the WebSocket server in `mcp-server/sync.ts`, which made browser real-time depend on the MCP process and left production startup and port discovery undefined. **Fixed:**

- A small **custom Next.js server** (`server.ts`) boots Next.js and attaches a `ws` server to the **same HTTP server** via the HTTP `upgrade` event at path **`/ws`**.
- The browser connects to the **same origin** (`new WebSocket(\`${location.origin.replace(/^http/, "ws")}/ws\`)`) — **no separate port to discover**, works identically in dev and prod.
- Browser real-time no longer depends on the MCP process running.

```
                        shared directory ($DOCS_ROOT)
                        ┌──────────────────────────────┐
   PUT /api (write)     │                              │   update_document (write)
 ┌───────────┐ ───────► │           *.md files          │ ◄─────── ┌────────────┐
 │  Browser   │         │                              │           │ MCP Server  │
 │ (Tiptap)   │ ◄─ /ws ─┤  watched by BOTH processes:   │           │  (stdio)    │
 └───────────┘  (WS)    │   • web server  → WS broadcast │ ──notif──►│   Agent     │
       ▲                │   • MCP server  → agent notif  │           │ (openclaw)  │
       │                └──────────────────────────────┘           └────────────┘
       └─ custom server.ts hosts Next.js + WS + chokidar on one HTTP port
```

### 7.2 Agent → Browser (agent edits, you see them live)

1. Agent calls `update_document`.
2. MCP server writes the `.md` file (via shared `lib/documents.ts`).
3. The **web server's** `chokidar` watcher detects the change.
4. The web server broadcasts a WebSocket event (`{ type: "doc-changed", id, version, origin }`) to connected browsers.
5. Browsers viewing that document refresh content in real-time (subject to the dirty-guard in Section 7.4).

### 7.3 Browser → Agent (you edit, agent sees it)

1. You edit in Tiptap; `onUpdate` is **debounced** (Section 7.5).
2. The browser sends `PUT /api/documents/[id]` with `If-Match`.
3. Next.js writes the `.md` file via `lib/documents.ts`.
4. Both watchers fire from the single disk write:
   - the **web server** watcher broadcasts to other browsers (the originating client is skipped via `origin`);
   - the **MCP server** watcher sends an MCP `notifications/resources/updated` notification to the agent (for documents the agent has subscribed to via `resources/subscribe`).
5. The agent receives the signal; its next `read_document` returns current content.

> **MCP notification names (correct per spec & SDK):** content changes use **`notifications/resources/updated`** (requires a prior `resources/subscribe`); document create/delete uses **`notifications/resources/list_changed`**. There is no `notifications/resources/changed` method.

### 7.4 Concurrent-edit handling (two phases)

There are two layers of conflict handling, introduced in phases so the product can ship early and harden later:

**Phase 1 — optimistic concurrency (Review #8).** Last-write-wins **on disk**, but with real mitigations:

- **Server-side:** optimistic concurrency via `If-Match` / `409 Conflict` (Section 4.2).
- **Client-side:** when a `doc-changed` WebSocket event arrives for the document the user is **actively editing with unsaved/dirty local changes**, the editor does **not** silently replace content. It shows a non-destructive prompt: *"This document was changed elsewhere — Reload (discard my changes) / Keep mine (overwrite on next save)."*
- If the editor is **not dirty**, the remote change is applied seamlessly.

**Phase 2 — true conflict-free editing.** A section-structured **CRDT (Yjs)** replaces last-write-wins entirely, so concurrent human + agent edits merge deterministically with no data loss and no prompts. This is the recommended target design and is specified in full in **[Section 11](#11-section-based-collaborative-editing--conflict-resolution)**. The `.md`-on-disk contract and the MCP tool surface stay stable across both phases — only the merge mechanism upgrades underneath.

### 7.5 Write debouncing (Review #7)

Tiptap's `onUpdate` fires per keystroke. Without debouncing, every character would trigger a disk write + WS broadcast + chokidar event + MCP notification. The browser → API write path is **debounced at 400 ms** (trailing), with a forced flush on blur / route change / tab close (`beforeunload`). chokidar is configured with `awaitWriteFinish` to coalesce rapid writes and avoid partial reads.

### 7.6 WebSocket authentication (Review #9)

**Explicit decision:** this is a **local, single-user tool**. The WebSocket server therefore:

- binds the HTTP/WS server to **`127.0.0.1`** by default (configurable via `HOST`), so it is not exposed on the network;
- requires a **shared session token** on the `/ws` upgrade request (`?token=` or `Sec-WebSocket-Protocol`), where the token is the same value injected into the page by the server and held in an httpOnly cookie / server-rendered config. Upgrades without a valid token are rejected with `401`.

This is documented as a deliberate trust model rather than an oversight. Multi-user auth (accounts, per-document ACLs) remains a future consideration (Section 13).

### 7.7 Sync guarantees

| Scenario | Guarantee |
|----------|-----------|
| Agent edits → you see it | **Real-time** (WebSocket, < 1s) |
| You edit → other browsers see it | **Real-time** (WebSocket, < 1s) |
| You edit → agent notified | **Near real-time** (file watch + stdio notification) |
| Agent reads after you edited | **Always current** (reads from disk) |
| Concurrent edits (Phase 1) | `If-Match`/`409` server guard + client dirty-prompt; on disk last-write-wins |
| Concurrent edits (Phase 2) | **Conflict-free** — section-structured Yjs CRDT, deterministic merge, no data loss (Section 11) |

---

## 8. Directory Structure

```
doc-collab/
├── server.ts                           # Custom Next.js server: Next + WS (/ws) + chokidar
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                    # Document list (home page)
│   │   ├── editor/[id]/page.tsx        # Editor page
│   │   └── api/
│   │       └── documents/
│   │           ├── route.ts            # GET list, POST create
│   │           ├── [id]/route.ts       # GET, PUT, DELETE
│   │           └── [id]/pdf/route.ts   # PDF export (streamed)
│   ├── components/
│   │   ├── editor/
│   │   │   ├── editor.tsx              # Tiptap editor wrapper (+ debounce, dirty-guard)
│   │   │   └── toolbar.tsx             # Formatting toolbar
│   │   └── documents/
│   │       └── document-list.tsx       # Document list UI
│   ├── lib/
│   │   ├── config.ts                   # DOCS_ROOT, HOST, PORT, token
│   │   ├── security.ts                 # ID_PATTERN + resolveDocPath (traversal guard)
│   │   ├── documents.ts                # Filesystem CRUD + ETag + locks (shared API + MCP)
│   │   ├── markdown.ts                 # Server-side unified/remark pipeline (PDF, validation)
│   │   ├── realtime.ts                 # WS server attach + broadcast helpers
│   │   ├── pdf.ts                      # PDF generation (react-pdf, streamed)
│   │   └── collab/                     # Phase 2 — conflict-free editing
│   │       ├── hocuspocus.ts           # Hocuspocus server attach (shares /ws upgrade)
│   │       ├── sections.ts             # Heading → section split, stable section IDs
│   │       ├── doc-model.ts            # Y.Doc schema (Y.Array order + Y.Map of sections)
│   │       ├── md-bridge.ts            # Y.Doc ↔ Markdown (per-section serialize/diff)
│   │       └── persistence.ts          # onStoreDocument → .md + .ydoc snapshot (debounced)
│   ├── client/
│   │   ├── ws-client.ts                # Browser WS connect (same-origin /ws + token)
│   │   └── collab-provider.ts          # HocuspocusProvider + y-indexeddb (offline)
│   └── types/
│       └── document.ts                 # Shared TypeScript types
├── mcp-server/
│   ├── server.ts                       # MCP server entry point (stdio)
│   ├── tools.ts                        # MCP tool definitions (uses lib/documents.ts)
│   ├── collab-peer.ts                  # Yjs peer: applies agent edits as CRDT transactions
│   └── agent-notify.ts                 # change watcher → agent notifications
├── tests/
│   └── markdown-roundtrip.test.ts      # Markdown parse↔serialize stability
├── documents/                          # Default storage (override via DOCUMENTS_DIR)
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 9. Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch server.ts` | Custom server: Next.js (dev) + WS + watcher |
| `dev:mcp` | `tsx watch mcp-server/server.ts` | Start MCP server in dev mode |
| `dev:all` | `concurrently -n web,mcp -c blue,magenta "npm:dev" "npm:dev:mcp"` | **Run both with one command** (Review #5) |
| `build` | `next build && npm run build:server && npm run build:mcp` | Build everything |
| `build:server` | `tsc -p tsconfig.server.json` | Compile custom server to `dist/` |
| `build:mcp` | `tsc -p tsconfig.mcp.json` | **Compile MCP server to `dist/`** (Review #10) |
| `start` | `NODE_ENV=production node dist/server.js` | Start production web + WS server |
| `start:mcp` | `NODE_ENV=production node dist/mcp-server/server.js` | **Start compiled MCP server** (Review #10) |
| `test` | `vitest run` | Run tests incl. Markdown round-trip |

`concurrently` is added to `devDependencies` (review suggestion). In production the web app and MCP server are started as two long-lived processes (`start` + `start:mcp`); since the WS server now lives in the web process, real-time browser sync works with `start` alone.

---

## 10. Environment & Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCUMENTS_DIR` | `./documents` | Root directory for `.md` files |
| `HOST` | `127.0.0.1` | Bind address (local-only by default) |
| `PORT` | `3000` | HTTP + WS port (single port) |
| `WS_TOKEN` | generated at startup | Shared token guarding `/ws` upgrades |

---

## 11. Section-Based Collaborative Editing & Conflict Resolution

This section specifies the **Phase 2** design that makes concurrent human + agent editing truly conflict-free, and the **section model** that localizes edits.

### 11.1 Research: how the industry resolves editing conflicts

There are two battle-tested families of algorithms, plus the "no-merge" baseline this document started with:

| Approach | How it resolves conflicts | Used by | Trade-offs |
|----------|---------------------------|---------|------------|
| **Last-write-wins** (Phase 1) | The latest disk write replaces prior content; ETag guard + user prompt reduce surprise | Simple file apps | Data loss on true concurrency; not a real merge |
| **Operational Transformation (OT)** | A central server sequences each edit and *transforms* operations against intervening ones so all clients converge | Google Docs, CKEditor 5, ShareDB | Mature, low-latency, but requires an always-online central authority and a transform function per operation pair (quadratic complexity to build and test) |
| **CRDT** (Conflict-free Replicated Data Types) | Each edit carries enough metadata (stable per-character IDs like `(clientId, clock)`) that operations are **commutative, associative, idempotent** — replicas merge in any order with a mathematically proven convergence | Figma, Yjs, Automerge, Linear | Higher per-character metadata/tombstone overhead, but no central transform logic; native offline & multi-actor support |

**Decision: CRDT via Yjs.** For doc-collab specifically:

- We have **two independent, asynchronous actors** (a human and an AI agent). The agent can produce large, bursty edits and may be "offline" between MCP calls — exactly the local-first / multi-actor scenario where CRDTs excel and OT struggles.
- **Tiptap has first-class Yjs integration** (`@tiptap/extension-collaboration`), so we avoid hand-writing and testing OT transform functions (the part of OT systems where most engineering time is spent).
- Yjs is the de-facto, most production-tested CRDT for the web (YATA algorithm, RGA family), with a mature provider ecosystem (Hocuspocus for self-hosted WebSocket sync, `y-indexeddb` for offline).
- Convergence is **guaranteed by construction**, so we can delete the dirty-prompt and last-write-wins paths once Phase 2 lands.

> Sources: Yjs/Tiptap collaboration docs; CRDT vs OT analyses (2026). The consensus for new, local-first, multi-actor editors is "start with a CRDT (Yjs) rather than building OT from scratch."

### 11.2 Why break the document into sections

Even though Yjs guarantees convergence for an *entire* document, modeling the document as an ordered set of **sections** (block-based, like Notion) is a deliberate optimization:

1. **Localized conflicts.** Human edits in §2 and the agent rewriting §5 touch **disjoint CRDT subtrees** — they never interact, so there are no tombstones to merge and no awareness churn between them.
2. **Granular agent operations.** The agent can read/replace a single section (`read_section` / `update_section`) without serializing or rewriting the whole document, which keeps MCP payloads small and edits surgical.
3. **Cheap reconciliation of external edits.** When a `.md` file is changed outside the editor (git pull, manual edit, agent write to disk), we diff **per section** and apply only the changed sections to the `Y.Doc` as CRDT updates — a merge, not a clobber.
4. **Performance.** Sections enable lazy loading, virtualized rendering of long documents, per-section re-serialization (only re-serialize dirty sections), and per-section PDF rendering.
5. **UX.** Section granularity powers presence ("openclaw is editing *Introduction*") and advisory soft-locks.

### 11.3 Section model

- **Splitting.** A document is split into sections at heading boundaries (configurable; default at `H1`/`H2`). A section is a heading plus its body up to the next heading of the same or higher level.
- **Stable section IDs.** Each section gets a stable `nanoid` that survives edits and reordering. On disk it is persisted as an unobtrusive anchor comment so it round-trips through Markdown and git:

```markdown
<!-- sec:Vq3kР -->
## Introduction

Body text…
```

- **`Y.Doc` schema** (`lib/collab/doc-model.ts`):
  - `order: Y.Array<string>` — the ordered list of section IDs (reordering = a move in this array).
  - `sections: Y.Map<string, Y.XmlFragment>` — each section ID maps to its own ProseMirror/Tiptap fragment.
  - Editing a section binds Tiptap to that fragment; **moving** a section mutates `order`. Edits and moves commute, so "reorder vs edit" never conflicts.

#### Section ID recovery (when anchors are lost)

Anchors are a best-effort hint, **not** a hard requirement. They can be stripped by plain-text editing, an agent rewriting a section without preserving the comment, copy/paste, or Markdown tools that drop HTML comments. The system must degrade gracefully rather than corrupt section identity. When `.md` is parsed and a section has **no** valid anchor (or a duplicate one), the reconciler (`md-bridge.ts`) recovers IDs deterministically, in order:

1. **Anchor match** — if a valid, unique `<!-- sec:… -->` is present, use it.
2. **Heading + position heuristic** — match an anchorless section to an existing `Y.Doc` section with the same heading text at a compatible position in `order`.
3. **Content-similarity heuristic** — if the heading changed too, match by body similarity (e.g., normalized token overlap above a threshold) against the nearest unmatched existing section.
4. **Mint a new ID** — if nothing matches confidently, treat it as a new section, assign a fresh `nanoid`, and (on the next persist) **re-stamp** the anchor into the `.md` so identity self-heals going forward.

The matching is one-to-one and order-aware so a re-stamp never merges two distinct sections. The agent prompt/tooling is also instructed to preserve anchors; recovery exists for the cases where it doesn't. Re-stamping is the self-healing mechanism: once the document is touched through the editor/persistence path again, anchors are restored.

### 11.4 Data flow and persistence

```
        live source of truth                       persisted artifacts (debounced)
   ┌───────────────────────────┐                  ┌──────────────────────────────┐
   │      Y.Doc (Yjs CRDT)      │ ── onStore ────► │  doc.md   (derived, git/agent) │
   │  hosted by Hocuspocus in   │   (400ms +       │  doc.ydoc (CRDT snapshot+hist) │
   │  the custom Next server    │    snapshot iv)  └──────────────────────────────┘
   └───────────┬───────────────┘
       ▲        │ Yjs updates over /ws (binary, delta-encoded)
       │        ├──────────────► Browser (Tiptap + HocuspocusProvider + y-indexeddb)
       │        └──────────────► MCP server (Yjs peer) ──► Agent (openclaw)
       │
   external .md change (git / manual / direct write)
       └─ chokidar → md-bridge diff (per section) → apply changed sections as Yjs updates
```

- **Live state** is the `Y.Doc`, hosted by **Hocuspocus** attached to the same `/ws` upgrade path as Phase 1 (same origin, same token auth from Section 7.6).
- **Persistence** (`lib/collab/persistence.ts`, via Hocuspocus `onStoreDocument`, debounced): serializes the `Y.Doc` to (a) the canonical **`.md`** file — the git-friendly artifact and the agent's read/write interface — and (b) an optional **`.ydoc`** binary snapshot (`Y.encodeStateAsUpdate`) for fast reload and history. Snapshotting also triggers Yjs tombstone GC.
- **Agent integration:** the MCP server is a **Yjs peer** (`mcp-server/collab-peer.ts`). `update_document` / `update_section` apply the agent's edit as a Yjs transaction on the shared `Y.Doc`, so agent edits **merge** with concurrent human edits instead of overwriting them. `read_document` / `read_section` return the serialized Markdown of the current `Y.Doc`. The MCP tool surface and the `.md` contract are unchanged from Section 6 — only the write path becomes CRDT-based.
- **External edits:** a direct `.md` write (git, manual) is caught by chokidar; `md-bridge.ts` parses it, diffs section-by-section against the current `Y.Doc`, and applies only the changed sections as Yjs updates — preserving concurrent in-editor work.

### 11.5 Conflict scenarios, resolved

| Scenario | Resolution |
|----------|-----------|
| Human edits §2 while agent rewrites §5 | Disjoint fragments — no interaction, both succeed |
| Human and agent edit the **same** section concurrently | Character-level Yjs merge; deterministic convergence; both edits preserved |
| Section reordered while its text is edited | `order` move and fragment edit commute |
| Human edits offline, reconnects later | `y-indexeddb` buffers locally; Yjs merges on reconnect, any order |
| External `.md` edit during live editing | Per-section diff applied as CRDT updates (merge, not clobber) |

### 11.6 Advisory soft-locks (UX, not correctness)

When the agent begins a multi-step rewrite of a section, it sets a Yjs **awareness** flag for that section ID. The UI shows *"openclaw is editing this section"* and de-emphasizes it to discourage collisions. This is purely UX — the CRDT still guarantees no data loss if a human edits anyway. No hard locks, so a stuck agent can never block the human.

---

## 12. Optimizations

Performance and resource optimizations layered onto the architecture above:

- **Section-scoped rendering & lazy loading.** Render only on-screen sections for long documents (virtualization); load section fragments on demand from the `Y.Doc`.
- **Incremental Markdown serialization.** Re-serialize only **dirty sections** on persist instead of the whole document (tracked via per-section change flags from `md-bridge.ts`).
- **Per-section / streamed PDF.** Render PDF section-by-section so large documents stream out progressively and a single section can be exported alone.
- **CRDT update efficiency.** Yjs sends **delta-encoded binary updates** over the wire (not full documents); periodic `encodeStateAsUpdate` snapshots compact state and **garbage-collect tombstones** to bound memory growth.
- **Debounced + coalesced persistence.** Reuse the 400 ms debounce (Section 7.5) plus a longer snapshot interval (e.g., 30 s) for `.ydoc`; chokidar `awaitWriteFinish` coalesces external writes.
- **Presence to prevent collisions.** Collaboration cursors + section awareness let users naturally avoid each other before a merge is ever needed.
- **Document-list caching.** Cache `/api/documents` metadata (title, mtime) and invalidate on watcher events instead of re-reading every file per request.
- **Connection resilience.** `HocuspocusProvider` auto-reconnect with backoff; offline edits queued in `y-indexeddb` and flushed on reconnect; WS heartbeats to detect dead sockets.
- **Backpressure & batching.** Batch outbound WS broadcasts within a tick; apply Yjs update batching to avoid a message per keystroke.

---

## 13. Future Considerations (Not in MVP)

- **Multi-user authentication & authorization** — accounts, per-document permissions, real WS auth beyond the local shared token.
- **Document versioning** — Git-based or snapshot-based history.
- **Search** — Full-text search across documents.
- **Document folders** — Nested directory structure (requires extending ID validation to safe sub-paths).
- **Image uploads** — Inline images in documents.
- **Export formats** — DOCX, HTML in addition to PDF.

---

## 14. Review Resolution Traceability

| # | Review issue | Severity | Resolution | Section |
|---|--------------|----------|------------|---------|
| 1 | "Wrong" Next.js version (16) | Medium | **Rejected** — Next.js 16 shipped 2025‑10‑21 and is stable; original choice kept. Adopted Next 16 specifics (async params, Turbopack default, Node 20.9+) | 1, 4 |
| 2 | Incorrect Tiptap Markdown round-trip claim | High | Explicit content pipeline via `tiptap-markdown` + server-side `remark`; round-trip tests | 3.1 |
| 3 | Path-traversal risk | High | `ID_PATTERN` + `resolveDocPath` containment check in shared `lib`, used by API **and** MCP | 2.2, 2.3, 6 |
| 4 | WebSocket server in wrong process | High | WS moved into Next.js custom server on same origin/port; prod path defined | 7.1, 8, 9 |
| 5 | No `dev:all` script | Low | Added `dev:all` via `concurrently` (+ dependency) | 9 |
| 6 | `PATCH` vs `PUT` semantics | Medium | Endpoint changed to `PUT` (idempotent full replace) | 4, 4.1 |
| 7 | No write debouncing | Medium | 400 ms trailing debounce + flush + `awaitWriteFinish` | 7.5 |
| 8 | Last-write-wins, no safety net | Medium | Phase 1: `ETag`/`If-Match`/`409` + dirty-prompt. **Phase 2: section-structured Yjs CRDT for conflict-free editing** | 4.2, 7.4, 11 |
| 9 | No WebSocket auth | Low | Localhost bind + shared `WS_TOKEN`, documented trust model | 7.6 |
| 10 | No MCP build/start for prod | Low | `build:mcp` / `start:mcp` scripts | 9 |
| 11 | ASCII diagram alignment | Info | Diagrams redrawn and aligned | 3.1, 7.1 |
| S1 | Hardcoded `./documents/` path | Suggestion | `DOCUMENTS_DIR` env var → `DOCS_ROOT` | 2.1, 10 |
| S2 | Unclear valid ID characters | Suggestion | Documented `ID_PATTERN` allowed set | 2.2 |
| S3 | Verify PDF streaming | Suggestion | Documented `renderToStream` behavior + limits | 5 |
| S4 | Add `concurrently` dependency | Suggestion | Added to `devDependencies` | 9 |
