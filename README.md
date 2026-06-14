# doc-collab

A collaborative online document editor where a human user and an AI agent (openclaw) can edit the same Markdown documents simultaneously. The human uses a WYSIWYG web editor; the agent interacts through an MCP server. Both sides read and write the same `.md` files on disk, with real-time sync between them.

## Prerequisites

- **Node.js** 24 LTS
- **npm** 10+

## Quick Start

```bash
npm install
npm run dev:all   # starts web + WS server and MCP server together
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The editor uses **collab mode (Yjs CRDT)** by default. For Phase 1 REST editing, open a doc with `?collab=0` or set `NEXT_PUBLIC_COLLAB=0`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Custom server: Next.js (dev) + WebSocket + file watcher |
| `npm run dev:mcp` | Start MCP server in dev mode (watch mode) |
| `npm run dev:all` | Run both web and MCP servers with one command (via `concurrently`) |
| `npm run build` | Build everything (Next.js + custom server + MCP server) |
| `npm run build:server` | Compile custom server to `dist/` |
| `npm run build:mcp` | Compile MCP server to `dist/` |
| `npm run start` | Start production web + WS server |
| `npm run start:mcp` | Start compiled MCP server |
| `npm test` | Run unit + integration tests |
| `npm run cypress` | Run E2E tests |
| `npm run cypress:collab` | Run collaborative editing E2E tests (requires `npm run dev`) |

## Production

```bash
npm run build       # build everything
npm run start       # web + WS server (browsers connect here)
npm run start:mcp   # MCP server (agent connects here via stdio)
```

The web app and MCP server are independent processes. Browser real-time sync works with `start` alone (the WebSocket server lives in the web process).

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCUMENTS_DIR` | `./documents` | Root directory for `.md` files |
| `HOST` | `127.0.0.1` | Bind address (local-only by default) |
| `PORT` | `3000` | HTTP + WebSocket port (single port) |
| `WS_TOKEN` | generated at startup | Shared token guarding `/ws` upgrades |

Copy `.env.example` to `.env` to override defaults:

```bash
cp .env.example .env
```

## Architecture

See [`Architecture-final.md`](./Architecture-final.md) for the full system design, including:

- Document storage & path-traversal protection (§2)
- Web API route handlers (§4)
- MCP server & agent tools (§6)
- Real-time sync (WebSocket + file watcher) (§7)
- Scripts & environment (§9–§10)

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) + TypeScript 5+
- **Editor:** [Tiptap](https://tiptap.dev/) (ProseMirror-based) with markdown import/export
- **Styling:** Tailwind CSS v4
- **MCP Server:** [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) (stdio transport)
- **Real-time Sync:** WebSocket (`ws`) hosted inside the custom server + filesystem watching (`chokidar`)
- **Custom Server:** `tsx` in dev, compiled JS in production
