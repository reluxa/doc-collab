# Integrating doc-collab with openclaw

This guide explains how to connect the **openclaw** AI agent to `doc-collab` so it
can read and write the same Markdown documents a human edits in the browser — in
real time and without clobbering concurrent edits.

`doc-collab` is built for exactly this pairing: the human uses the WYSIWYG web
editor, and openclaw talks to a dedicated **MCP server** over **stdio**. Both
sides operate on the same `.md` files on disk, and edits merge through a Yjs CRDT.

---

## 1. How the integration works

There are two long-lived processes, plus openclaw as an MCP client:

```
 ┌────────────┐        ┌──────────────────────────────┐        ┌─────────────┐
 │  Browser   │        │  Web + WebSocket server        │        │ MCP server  │
 │  (Tiptap)  │ ◄─/ws─►│  (server.ts)                   │◄─ws───►│ collab-peer │
 └────────────┘        │  • Next.js UI                  │        │  (Yjs peer) │
                       │  • Hocuspocus CRDT @ /ws/collab │        └──────┬──────┘
                       │  • chokidar file watcher        │               │ stdio
                       └───────────────┬─────────────────┘               ▼
                                       │ reads/writes            ┌─────────────┐
                                       ▼                         │  openclaw   │
                              documents/*.md  ◄──────────────────│ (MCP client)│
                                                                 └─────────────┘
```

Key properties:

- **openclaw never touches files directly.** It calls MCP tools; the MCP server
  applies edits as **Yjs transactions** on the shared `Y.Doc` (via the Hocuspocus
  provider in `mcp-server/collab-peer.ts`), so they merge with concurrent human
  edits instead of overwriting them.
- **Both processes share `DOCS_ROOT`.** Persistence writes `.md` to disk; a
  watcher reconciles external `.md` edits (git/manual) back into the live CRDT.
- **openclaw is announced as a presence peer** (name `openclaw`, color `#14b8a6`),
  so the UI can show *"openclaw is editing this section"*.

---

## 2. Prerequisites

- Node.js 20.9+ LTS and npm 10+
- This repo installed: `npm install`
- An openclaw client capable of launching an MCP server over **stdio** (the
  standard `command` + `args` + `env` MCP server convention).

---

## 3. Start the doc-collab processes

The web/WS server and the MCP server are independent. For the agent to merge
(rather than last-write-wins), the **web server must be running** so the MCP
collab peer has a Hocuspocus endpoint to connect to.

```bash
# Dev: run both with one command
npm run dev:all        # web+WS (port 3000) and MCP server (stdio, watch mode)
```

Or production:

```bash
npm run build          # builds Next.js + custom server + MCP server
npm run start          # web + WS server (browsers + CRDT live here)
npm run start:mcp      # compiled MCP server over stdio (the agent connects here)
```

> Note: in most real deployments **openclaw launches the MCP server itself**
> (see §5). In that case you only run the web server (`npm start`) yourself, and
> openclaw spawns `start:mcp` on demand. Run `start:mcp` manually only for
> testing the server in isolation.

---

## 4. Environment variables that matter for the integration

Copy `.env.example` to `.env` and set the ones relevant to openclaw:

| Variable | Default | Why it matters for openclaw |
|----------|---------|------------------------------|
| `DOCUMENTS_DIR` | `./documents` | **Must be identical** for the web and MCP processes so both see the same files. |
| `HOST` | `127.0.0.1` | Bind address. The MCP peer dials `ws://HOST:PORT/ws/collab`. |
| `PORT` | `3000` | Web/WS port the MCP peer connects to. |
| `WS_TOKEN` | dev: fixed; prod: random | Guards the collab WebSocket. **Must match** between web and MCP processes, or the agent's CRDT peer can't connect (it silently falls back to disk-only writes). In production, set an explicit `WS_TOKEN` in the shared environment. |
| `MCP_COLLAB` | `1` | `1` = agent edits route through the CRDT peer (merge). `0` = filesystem-only tools (offline/tests); `update_section` is then unavailable. |

> **Critical for production:** when `WS_TOKEN` is left unset it is randomly
> generated per process, so the web and MCP servers would generate *different*
> tokens and never connect. Always export one shared `WS_TOKEN` for both.

---

## 5. Register the MCP server with openclaw

openclaw connects to the doc-collab MCP server over stdio. Configure it with the
launch command, working directory, and the shared environment. The exact config
file location depends on your openclaw setup, but it follows the standard MCP
server descriptor shape:

```json
{
  "mcpServers": {
    "doc-collab": {
      "command": "node",
      "args": ["dist/mcp-server/mcp-server/server.js"],
      "cwd": "/home/reluxa/store/doc-collab",
      "env": {
        "DOCUMENTS_DIR": "/home/reluxa/store/doc-collab/documents",
        "HOST": "127.0.0.1",
        "PORT": "3000",
        "WS_TOKEN": "<same-token-as-the-web-server>",
        "MCP_COLLAB": "1"
      }
    }
  }
}
```

For development (no build step) you can run the TypeScript entry point directly:

```json
{
  "mcpServers": {
    "doc-collab": {
      "command": "npx",
      "args": ["tsx", "mcp-server/server.ts"],
      "cwd": "/home/reluxa/store/doc-collab",
      "env": {
        "DOCUMENTS_DIR": "/home/reluxa/store/doc-collab/documents",
        "WS_TOKEN": "dev-token-7f3a9b2c1d4e5f6a8b9c0d1e2f3a4b5c",
        "MCP_COLLAB": "1"
      }
    }
  }
}
```

After adding the config, restart/reload openclaw so it spawns the server and
performs the MCP handshake.

---

## 6. What openclaw can do (tools & resources)

Once connected, openclaw sees these MCP **tools**:

| Tool | Arguments | Description |
|------|-----------|-------------|
| `list_documents` | — | List all docs with `id`, `title`, `modifiedAt`. |
| `read_document` | `name` | Read full Markdown + current `version` (etag). |
| `read_section` | `name`, `section_id` | Read one section by its stable `<!-- sec:... -->` id. |
| `create_document` | `name`, `content` | Create a new document. |
| `update_document` | `name`, `content`, `expected_version?` | Replace the whole doc. Pass `expected_version` for optimistic concurrency; omit for logged last-write-wins. |
| `update_section` | `name`, `section_id`, `content` | Replace one section's body; other sections are preserved. Requires `MCP_COLLAB=1`. |
| `delete_document` | `name` | Delete a document. |

And a **resource** family:

- `doc://{id}` — each document as a `text/markdown` resource. openclaw can
  `resources/list` and `resources/read` these.

`name` / `id` is the filename without the `.md` extension. All paths are validated
through the same guarded resolver the web API uses (path-traversal safe).

---

## 7. Real-time notifications (so openclaw stays in sync)

The MCP server runs a file watcher over `DOCS_ROOT` and emits standard MCP
notifications:

- **Content changed** → `notifications/resources/updated` for any document the
  agent has subscribed to. openclaw should call `resources/subscribe` on
  `doc://{id}` for documents it's actively working on.
- **Document created/deleted** → `notifications/resources/list_changed`.

Recommended openclaw loop:

1. `list_documents` to discover work.
2. `resources/subscribe` to the docs it edits.
3. On `resources/updated`, re-`read_document` / `read_section` before its next edit.

---

## 8. Concurrency model openclaw should follow

- **Prefer `update_section`** over `update_document` for surgical edits. It keeps
  payloads small and only touches one section; concurrent human edits elsewhere
  are preserved by the CRDT.
- **For full-document writes, pass `expected_version`** (the etag from the last
  read). If stale, the tool returns a conflict so the agent can re-read and retry.
  Omitting it falls back to last-write-wins (logged with a warning).
- **No hard locks.** When the agent starts a multi-step section rewrite it sets a
  Yjs awareness flag; the UI de-emphasizes that section but the human can still
  edit, and the CRDT guarantees no data loss. A stuck agent never blocks the human.

---

## 9. Verify the integration

1. Start the web server (`npm run dev` or `npm start`) and open
   <http://localhost:3000>. Create or open a document.
2. With openclaw connected, ask it to `list_documents` — it should see your doc.
3. Ask openclaw to `read_document` then `update_section` a heading's body. Watch
   the browser: the change should appear live (no refresh), merged into your text.
4. Edit the same document in the browser while openclaw edits a different section —
   both contributions should survive.
5. Edit the `.md` file on disk (git/editor) during a live session — the changed
   section should reconcile into the editor without clobbering in-flight work.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Agent edits overwrite human edits | MCP peer can't reach Hocuspocus, fell back to disk write | Ensure the web server is running and `WS_TOKEN` matches between processes. |
| `update_section` errors with "requires MCP_COLLAB" | `MCP_COLLAB=0` | Set `MCP_COLLAB=1` and ensure the web server is up. |
| Agent sees no documents / wrong documents | `DOCUMENTS_DIR` differs between web and MCP processes | Point both at the same absolute path. |
| Agent connects but never gets updates | No `resources/subscribe` | Subscribe to `doc://{id}` for active documents. |
| "Timed out connecting to collab document" in MCP logs | Web server down, wrong `HOST`/`PORT`, or token mismatch | Verify web server, `HOST`, `PORT`, and `WS_TOKEN`. |

---

## References

- `mcp-server/server.ts` — MCP server entry point (stdio).
- `mcp-server/tools.ts` — tool & resource definitions.
- `mcp-server/collab-peer.ts` — Yjs/Hocuspocus peer (agent name `openclaw`).
- `mcp-server/agent-notify.ts` — file-watch → MCP notifications.
- `Architecture-final.md` §6, §11.4–11.5 — agent integration and conflict scenarios.
