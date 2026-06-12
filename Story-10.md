# Story 10 — Build & run tooling (dev/prod)

**Phase:** 1 (MVP) · **Estimate:** 1 day · **Depends on:** Story 7, Story 9
**Architecture refs:** §9 (Scripts), §1 (concurrently)

**Standards:** Must satisfy the global Definition of Done and rules in [`constitution.md`](./constitution.md) (testing, code quality, naming, structure, security, a11y).

## Goal

Provide the developer and production run scripts and build configuration so the whole system (web + WS + MCP) starts with documented commands.

## Scope / Tasks

- [ ] Add npm scripts (§9): `dev` (`tsx watch server.ts`), `dev:mcp`, `dev:all` (`concurrently`), `build`, `build:server`, `build:mcp`, `start`, `start:mcp`, `test`.
- [ ] Add `tsconfig.server.json` and `tsconfig.mcp.json` to compile the custom server and MCP server to `dist/`.
- [ ] Add `concurrently` to `devDependencies`.
- [ ] Verify production path: `npm run build` then `npm run start` serves web + WS; `npm run start:mcp` runs the compiled MCP server.
- [ ] Update README with dev (`dev:all`) and production startup instructions and the env vars from §10.

## Out of scope

- Containerization/deployment infra (future).

## Technical notes

- Browser real-time must work with `start` alone (WS lives in the web process); MCP is a separate long-lived process for the agent.

## Acceptance criteria

- [ ] `npm run dev:all` starts both web and MCP servers in one command with labeled output.
- [ ] `npm run build` produces compiled `dist/server.js` and `dist/mcp-server/server.js` with no type errors.
- [ ] `npm run start` serves the app and live WS sync without the MCP process running.
- [ ] `npm run start:mcp` runs the compiled MCP server successfully.
- [ ] README documents all scripts and environment variables.
