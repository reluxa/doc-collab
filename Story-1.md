# Story 1 — Project scaffolding & configuration

**Phase:** 1 (MVP) · **Estimate:** 1–2 days · **Depends on:** none
**Architecture refs:** §1 (Tech Stack), §2.1 (Configurable location), §8 (Directory Structure), §10 (Environment)
**UI refs:** [`ui-design.md`](./ui-design.md) §2 (color tokens), §3 (typography), §10 (Tailwind v4 `@theme` mapping)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Stand up the Next.js 16 + TypeScript + Tailwind v4 project skeleton with the agreed directory structure, central configuration module, and a runnable dev server. This is the foundation every other story builds on.

## Scope / Tasks

- [ ] Initialize a Next.js 16 App Router project with TypeScript 5+ (Turbopack default).
- [ ] Add and configure Tailwind CSS v4, defining the design tokens in `app/globals.css` via `@theme` exactly as in `ui-design.md` §10 (brand/agent/neutral/semantic colors, radii, fonts) plus the `[data-theme="dark"]` overrides.
- [ ] Load the Inter (UI) and JetBrains Mono (code) fonts per `ui-design.md` §3; add a theme toggle that sets `data-theme` and persists to `localStorage`.
- [ ] Create the base folder structure from §8: `src/app`, `src/components`, `src/lib`, `src/client`, `src/types`, `documents/`, `mcp-server/`, `tests/`.
- [ ] Create `src/lib/config.ts` exposing resolved config from env:
  - `DOCS_ROOT` = `path.resolve(process.env.DOCUMENTS_DIR ?? "./documents")`
  - `HOST` (default `127.0.0.1`), `PORT` (default `3000`), `WS_TOKEN` (read env or generate at startup).
- [ ] Add `src/types/document.ts` with shared types (`DocumentMeta`, `DocumentContent`, `DocumentId`).
- [ ] Add a root layout and a placeholder home page that renders without errors.
- [ ] Add `.env.example` documenting `DOCUMENTS_DIR`, `HOST`, `PORT`, `WS_TOKEN`.
- [ ] Configure ESLint (flat config) and `tsconfig.json` (strict mode on).
- [ ] Add `tsx` to `devDependencies` (used by the `dev` / `dev:mcp` scripts and `server.ts`; Stories 7, 9, 10 depend on it).
- [ ] Create the `documents/` directory with a `.gitkeep` and one sample `.md` for manual testing.

## Out of scope

- Any API routes, editor, MCP server, or WebSocket (later stories).

## Technical notes

- Node.js 20.9+ required. Pin via `engines` in `package.json`.
- `config.ts` must be importable from both the web app and (later) the MCP server, so keep it free of Next-only imports.
- Generate `WS_TOKEN` once at process start if not provided; export it for both the server and page injection.

## Acceptance criteria

- [ ] `npm install && npm run dev` starts the app and the home page renders at `http://127.0.0.1:3000` with no console/server errors.
- [ ] `tsc --noEmit` and lint pass with zero errors.
- [ ] Setting `DOCUMENTS_DIR=/tmp/docs` changes `DOCS_ROOT` accordingly (verifiable via a temporary log or unit test).
- [ ] The directory structure matches §8; `src/lib/config.ts` and `src/types/document.ts` exist and export the documented symbols.
- [ ] `.env.example` lists all four environment variables with descriptions.
- [ ] `tsx` is present in `devDependencies` so `tsx`-based scripts run without a global install.
- [ ] The `ui-design.md` §10 tokens are available as Tailwind utilities (e.g., `bg-surface`, `text-muted`, `ring-brand-500`) and switching `data-theme` toggles light/dark correctly.
