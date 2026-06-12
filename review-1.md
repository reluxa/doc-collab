# Architecture Review — doc-collab

**Reviewed:** ARCHITECTURE.md  
**Date:** 2026-06-12

---

## Overall Impression

The document is well-structured, clearly written, and covers the core concerns for an MVP. The real-time sync section in particular is thorough and honest about its limitations. That said, there are several technical inaccuracies, security gaps, and production-readiness issues worth addressing before implementation begins.

---

## Issues

### 1. Next.js Version Is Incorrect

> *Section 1 — Tech Stack*

The document lists **Next.js 16**, which does not exist as a stable release. The current stable version is Next.js 15. This should be corrected to avoid confusion when setting up dependencies.

---

### 2. Incorrect Claim About Tiptap Markdown Conversion

> *Section 3 — WYSIWYG Editor*

> "Tiptap's `generateText()` and `generateHTML()` provide round-trip Markdown ↔ HTML conversion."

This is technically inaccurate. `generateText()` strips all markup to plain text; `generateHTML()` converts Tiptap's internal JSON document state to HTML — neither performs Markdown parsing or serialisation. True Markdown ↔ HTML round-tripping requires either the `@tiptap/extension-markdown` extension (which uses `markdown-it` under the hood) or a separate library such as `remark`. This needs to be resolved at the design stage because the choice affects the entire content pipeline between the editor and the `.md` files on disk.

---

### 3. Security — Path Traversal Risk

> *Sections 4 & 6 — API routes and MCP tools*

Document IDs and names are derived directly from user input (URL segments, tool arguments) and mapped to filesystem paths without any explicit mention of sanitisation. A value such as `../../etc/passwd` or `../../../some-other-path` passed as a document `id` or `name` could read or overwrite files outside `./documents/`. All filesystem operations in `documents.ts` must validate that the resolved path remains inside the documents directory before any read or write.

---

### 4. WebSocket Server Lives in the Wrong Process

> *Section 7 — Real-Time Sync Architecture*

The WebSocket server is defined inside `mcp-server/sync.ts`. This creates a structural problem:

- The browser's real-time feature depends on the MCP server process being running. If only `next dev` is started (a natural assumption for a web developer), there is no WebSocket server and no live updates.
- In production, the `start` script is only `next start` — there is no corresponding command to start the MCP server (and therefore the WebSocket server). The production real-time sync path is entirely unspecified.
- The WebSocket port is not mentioned anywhere. The browser client has no documented way to discover it.

**Recommendation:** Move the WebSocket server into the Next.js app (e.g., a custom server or a Next.js route using `upgrade` handling), or at minimum document the port, how the browser connects, and how the full system starts in production.

---

### 5. No `concurrently` Script for Development

> *Section 9 — Scripts*

Running the full dev setup requires two separate terminal sessions (`next dev` and `tsx mcp-server/server.ts`). There is no `dev:all` script. This is a minor friction point but worth adding for developer experience, e.g. using `concurrently`:

```json
"dev:all": "concurrently \"next dev\" \"tsx mcp-server/server.ts\""
```

---

### 6. `PATCH` Semantics Are Wrong for Full Content Replacement

> *Section 4 — REST API*

`PATCH /api/documents/[id]` is described as updating the full document content. HTTP `PATCH` is semantically for partial updates; replacing an entire resource's content is the role of `PUT`. This is a minor standards-compliance issue but can cause confusion if the API is consumed by other clients or agents.

---

### 7. No Write Debouncing Mentioned

> *Section 7 — Real-Time Sync Architecture*

Tiptap's `onUpdate` callback fires on every keystroke. Without debouncing, every character typed triggers a disk write, a WebSocket broadcast, and a chokidar event that may in turn send an MCP notification. This will be noisy and potentially cause race conditions at normal typing speeds. The architecture should specify a debounce strategy (e.g., 300–500 ms) for the browser → API write path.

---

### 8. Last-Write-Wins Has No Intermediate Safety Net

> *Section 7, Sync Guarantees table*

Concurrent edits result in a silent overwrite. For an MVP this is acceptable, but there is no intermediate mitigation mentioned (e.g., ETag-based optimistic concurrency, a document lock, or even a warning to the user when a remote change arrives while they are actively editing). At minimum, the browser client should detect the case where a remote WebSocket update arrives while the editor is dirty and prompt the user rather than silently clobbering their in-progress work.

---

### 9. No WebSocket Authentication

> *Section 7 — Real-Time Sync Architecture*

The WebSocket server has no authentication layer. Any process that can reach the port can receive all document change events. For a local-only tool this may be acceptable, but it should be an explicit decision documented in the architecture rather than an oversight.

---

### 10. MCP Server Has No Build/Start Script for Production

> *Section 9 — Scripts*

`dev:mcp` uses `tsx` for on-the-fly TypeScript execution, which is fine for development. There is no `build:mcp` or `start:mcp` script for running the compiled MCP server in production. If this is intentionally out of scope for the MVP, it should be noted; otherwise, production deployment is underspecified.

---

### 11. Minor — ASCII Diagram Alignment

> *Section 7, ASCII diagram*

The closing bracket of the outer box is misaligned and partially detached from the top-left corner. This does not affect understanding but worth tidying.

---

## Suggestions (Non-Blocking)

- **Document the `./documents/` path configuration.** It is hardcoded and relative. A `DOCUMENTS_DIR` environment variable would make deployment more flexible.
- **Clarify what "Document ID" characters are valid.** Since IDs map to filenames, characters like `/`, `\`, `*`, `?`, `:`, etc. must be rejected. Document the allowed character set.
- **Consider streaming for large PDF exports.** The current architecture returns a streamed PDF from the API, which is correct — just worth verifying `@react-pdf/renderer` supports true streaming vs. buffering the full PDF before sending.
- **Add the `dev:all` / `concurrently` dependency to `package.json`** once the script is defined.

---

## Summary

| Severity | Issue |
|----------|-------|
| **High** | Path traversal vulnerability in document ID/name handling |
| **High** | WebSocket server placement makes production deployment undefined |
| **High** | Incorrect Tiptap Markdown conversion claim affects core pipeline design |
| **Medium** | Wrong Next.js version in tech stack |
| **Medium** | `PATCH` vs `PUT` semantic mismatch |
| **Medium** | No write debouncing — performance and correctness risk |
| **Medium** | No intermediate concurrent-edit protection |
| **Low** | No WebSocket authentication |
| **Low** | No MCP server build/start scripts for production |
| **Low** | Missing `dev:all` convenience script |
| **Info** | ASCII diagram alignment |
