# doc-collab — Implementation Plan

This plan breaks [`Architecture-final.md`](./Architecture-final.md) into small, independently pickable stories. Each story is sized for **1–3 days** for an average developer and has its own file with scope, technical notes, and acceptance criteria.

UI work follows [`ui-design.md`](./ui-design.md) (color system, typography, components, layouts, accessibility); the relevant stories link to the specific sections they implement.

## Phases

- **Phase 1 — Functional MVP (Stories 1–10):** a working editor + REST API + MCP server + real-time sync, with optimistic-concurrency (last-write-wins) conflict handling.
- **Phase 2 — Conflict-free editing (Stories 11–14):** section-structured Yjs CRDT, collaboration server, agent-as-peer, and optimizations.

## Story index

| # | Story | Est. | Depends on |
|---|-------|------|------------|
| 1 | [Project scaffolding & configuration](./Story-1.md) | 1–2 d | — |
| 2 | [Document storage library & path security](./Story-2.md) | 2 d | 1 |
| 3 | [REST API route handlers](./Story-3.md) | 2 d | 2 |
| 4 | [Markdown ↔ editor content pipeline](./Story-4.md) | 2 d | 1 |
| 5 | [WYSIWYG editor & document list UI](./Story-5.md) | 3 d | 3, 4 |
| 6 | [PDF export](./Story-6.md) | 2 d | 4 |
| 7 | [Custom server: WebSocket + file watcher](./Story-7.md) | 2–3 d | 3 |
| 8 | [Browser real-time sync & Phase 1 conflict handling](./Story-8.md) | 2 d | 5, 7 |
| 9 | [MCP server & agent tools](./Story-9.md) | 2–3 d | 2 |
| 10 | [Build & run tooling (dev/prod)](./Story-10.md) | 1 d | 7, 9 |
| 11 | [Section model & Y.Doc structure](./Story-11.md) | 3 d | 4 |
| 12 | [Hocuspocus collaboration server & editor binding](./Story-12.md) | 3 d | 7, 11 |
| 13 | [MCP collaboration peer & external-edit reconciliation](./Story-13.md) | 3 d | 9, 12 |
| 14 | [Optimizations](./Story-14.md) | 2–3 d | 12, 13 |

## Dependency graph (high level)

```
1 ─┬─ 2 ─┬─ 3 ─┬─ 5 ─ 8
   │     │     └─ 7 ─┘
   │     └─ 9 ─────────── 10
   └─ 4 ─┴─ 5
         └─ 6
4 ─ 11 ─ 12 ─ 13 ─ 14
7 ─────── 12
```

## Conventions used in every story

- **Definition of Done** for all stories is defined once in [`constitution.md`](./constitution.md) §11 (testing, code quality, naming, security, a11y, CI gates). Every story inherits it; the per-story acceptance criteria are *additional* to it, not a replacement.
- Acceptance criteria are written as checkable statements; where useful they use **Given / When / Then**.
- File paths reference the directory structure in `Architecture-final.md` §8.
- UI work follows [`ui-design.md`](./ui-design.md); engineering standards (testing/quality/naming) follow [`constitution.md`](./constitution.md).
