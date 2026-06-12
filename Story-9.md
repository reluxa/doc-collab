# Story 9 — MCP server & agent tools

**Phase:** 1 (MVP) · **Estimate:** 2–3 days · **Depends on:** Story 2
**Architecture refs:** §6 (MCP server & tools), §7.2/7.3 (agent notifications), §2.3 (shared security)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Provide a standalone MCP server (stdio) that the openclaw agent connects to, exposing document tools backed by the **shared** `src/lib/documents.ts`, plus a watcher that notifies the agent of external changes.

## Scope / Tasks

- [x] `mcp-server/server.ts`: MCP server over stdio using `@modelcontextprotocol/sdk`.
- [x] `mcp-server/tools.ts`: implement tools delegating to `lib/documents.ts`:
  - `list_documents`, `read_document(name)` (returns content + version), `create_document(name, content)`, `update_document(name, content, expected_version?)`, `delete_document(name)`.
  - `update_document` honors optional `expected_version` (conflict error if stale); omitting it is logged last-write-wins.
- [x] Declare the `resources` capability with `subscribe: true` and expose each document as an MCP resource (`uri` like `doc:///<id>` or `file://…`).
- [x] `mcp-server/agent-notify.ts`: chokidar watcher over `DOCS_ROOT`; on change, send `notifications/resources/updated` (with the resource `uri`) for resources the client has **subscribed** to via `resources/subscribe`.
- [x] Reuse `resolveDocPath` so `name` gets identical ID validation + traversal protection.
- [x] Tests for tool argument validation and traversal rejection.

## Out of scope

- CRDT peer behavior (Story 13). Production build/start scripts (Story 10).

## Technical notes

- The MCP server imports the same `lib` modules as the web app; no duplicated fs logic.
- Notifications are a signal only — the file on disk remains the source of truth.
- **Notification method name:** the correct MCP method is **`notifications/resources/updated`** (per the MCP spec and the installed `@modelcontextprotocol/sdk`). There is **no** `notifications/resources/changed` method — do not use it. `…/updated` is delivered only for resources the client has subscribed to; `notifications/resources/list_changed` covers create/delete of documents (the resource list changing).

## Acceptance criteria

- [x] **Given** the agent connected over stdio, **when** it calls each tool, **then** the tool performs the documented filesystem operation and returns the expected result/metadata.
- [x] **Given** a `name` of `../../secret`, **when** any tool is called, **then** it is rejected (traversal-safe), never touching files outside `DOCS_ROOT`.
- [x] **Given** `update_document` with a stale `expected_version`, **then** it returns a conflict error rather than overwriting.
- [x] **Given** the agent has subscribed to a document resource, **when** that `.md` file is changed by the web app, **then** the agent receives a `notifications/resources/updated` signal for the correct `uri`.
- [x] **Given** a document is created or deleted, **then** the agent receives `notifications/resources/list_changed`.
- [x] Tool validation tests pass.
