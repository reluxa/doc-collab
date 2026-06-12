# doc-collab — Engineering Constitution

The project-wide rules that keep the codebase **easy to maintain and evolve**. These are not aspirational guidelines — they are **acceptance criteria**. Every story's Definition of Done (see [Implementation-Plan.md](./Implementation-Plan.md)) includes "complies with the constitution". A change that violates a rule here is not done, even if its feature works.

How to read this: each section ends with a **checklist** of objectively verifiable criteria. PRs are reviewed and CI-gated against them.

---

## 0. Precedence & scope

- Applies to all code in the repo: web app, MCP server, custom server, shared `lib`, and tests.
- Order of precedence when guidance conflicts: **this constitution → `Architecture-final.md` → `ui-design.md` → story file**. If a story needs to break a rule, that must be explicit in the story and approved in review.
- "MUST" = required (CI/review blocks). "SHOULD" = strong default; deviations need a one-line justification in the PR.

---

## 1. Guiding principles

1. **Optimize for the reader.** Code is read far more than written. Favor clarity over cleverness.
2. **Small, composable units.** Prefer many small, single-purpose modules over large multi-purpose ones.
3. **Single source of truth.** No duplicated logic. Filesystem access goes through `lib/documents.ts`; config through `lib/config.ts`; conversion through the documented pipelines — never reimplemented ad hoc.
4. **Make illegal states unrepresentable.** Use the type system and validation at boundaries so invalid data cannot flow inward.
5. **Boring and consistent beats novel.** Follow existing patterns; introduce new ones deliberately and document them.

---

## 2. Code quality

### Rules
- **TypeScript strict everywhere.** `strict: true`; no implicit `any`. `any` is banned except with an inline `// eslint-disable` carrying a justification; prefer `unknown` + narrowing.
- **No `@ts-ignore`** without an adjacent comment explaining why and a follow-up issue link. Prefer `@ts-expect-error` (fails when no longer needed).
- **Boundaries are validated.** All external input (HTTP bodies/params, MCP tool args, file contents, env vars) is validated/parsed (e.g., `zod`) before use. Never trust input shape.
- **Errors are typed and handled.** Use the shared typed errors (`BadRequestError`, `ForbiddenError`, `NotFoundError`, `ConflictError`). No swallowed errors (`catch {}`), no `console.log` for control flow. Map errors to results/HTTP centrally.
- **Pure where possible.** Isolate side effects (fs, network, time, randomness) behind thin adapters so core logic is testable and deterministic.
- **Function/file size budgets (SHOULD).** Functions ≤ ~50 lines and one responsibility; files ≤ ~300 lines. Exceeding is a smell, not a hard fail — refactor or justify.
- **No dead code, no commented-out code, no TODOs without an issue link.** Delete it; git remembers.
- **No magic values.** Numbers/strings with meaning become named constants (debounce ms, ports, limits, regexes).
- **Immutability by default.** `const` over `let`; avoid mutating function arguments; prefer readonly types for shared data.
- **Dependency hygiene.** Add a dependency only when it clearly beats a small local implementation; pin versions; no unused deps. No secrets in code or VCS.
- **Formatting is automated.** Prettier + ESLint (flat config). Source formatting is never debated in review — the formatter decides.

### Acceptance criteria
- [ ] `tsc --noEmit` passes with `strict` on; zero `any` introduced (or each justified inline).
- [ ] Lint + format checks pass with zero warnings in changed files.
- [ ] All new external inputs are schema-validated at the boundary.
- [ ] No swallowed errors, no stray `console.*`, no commented-out code, no unlinked TODOs.
- [ ] No duplicated logic that an existing shared module already provides.

---

## 3. Naming conventions

### Rules
- **Files/dirs:** `kebab-case` (`document-list.tsx`, `md-bridge.ts`). React component files may match the component (`Editor.tsx`) — pick one convention per directory and keep it consistent (this repo: `kebab-case` files, `PascalCase` exported components).
- **Types/interfaces/classes/components:** `PascalCase` (`DocumentMeta`, `ConflictError`, `EditorToolbar`). No `I`-prefix on interfaces.
- **Variables/functions:** `camelCase`. Functions are **verbs** (`resolveDocPath`, `writeDocument`); values are **nouns** (`documentMeta`).
- **Booleans** read as predicates: `isDirty`, `hasAnchor`, `canEdit`, `shouldFlush`.
- **Constants** (module-level, fixed): `UPPER_SNAKE_CASE` (`DOCS_ROOT`, `ID_PATTERN`, `SAVE_DEBOUNCE_MS`).
- **Async functions** that perform IO are named for intent, not mechanism (`loadDocument`, not `getDocumentAsync`).
- **Event/handler props:** `onX` for props, `handleX` for implementations (`onSave` / `handleSave`).
- **No abbreviations** beyond well-known ones (`id`, `url`, `db`, `md`). Spell things out; clarity over brevity.
- **Tests:** `*.test.ts(x)`; describe the unit and behavior (`writeDocument › rejects path traversal`).

### Acceptance criteria
- [ ] New names follow the case rules above for their kind (file, type, value, constant, boolean).
- [ ] Functions are verbs; booleans are predicates; no meaningless names (`data`, `tmp`, `foo`) in shipped code.
- [ ] No new unexplained abbreviations.

---

## 4. Structure & architecture conformance

### Rules
- **Respect the layering** in `Architecture-final.md` §8. Route handlers and MCP tools delegate to `lib`; they contain no direct `fs`/business logic.
- **`lib` is framework-agnostic.** Shared modules (`config`, `security`, `documents`, `markdown`, `collab/*`) must not import Next-only or React-only APIs, so the MCP server can reuse them.
- **No circular dependencies.** Enforce with a lint rule.
- **Public module API is explicit.** Export only what's intended for reuse; keep internals unexported.
- **Feature flags for incomplete work.** Phase 2 (CRDT) stays behind a flag until at parity; `main` is always shippable.

### Acceptance criteria
- [ ] New filesystem/business logic lives in `lib`, not in route/tool/component files.
- [ ] `lib` modules have no Next/React imports.
- [ ] No new circular imports (lint clean).
- [ ] Incomplete/experimental paths are flag-gated and off by default.

---

## 5. Testing standards

### Rules
- **Test the behavior, not the implementation.** Tests target public APIs and observable behavior so refactors don't break them needlessly.
- **Every bug fix starts with a failing test** that reproduces it (regression guard).
- **New logic ships with tests.** Pure logic → unit tests; route handlers/MCP tools → integration tests; conversion/round-trips → property/snapshot tests (e.g., `markdown-roundtrip`).
- **Critical-path coverage is mandatory**, not a global percentage chase. The following MUST be covered: path-traversal rejection, ETag/`If-Match` concurrency, Markdown round-trip stability, section ID recovery, and CRDT convergence (Phase 2). Target **≥ 80% line coverage** on `lib/**` as a guardrail.
- **Tests are deterministic and isolated.** No reliance on wall-clock, real network, ordering, or shared mutable state. Fake time/randomness; use temp dirs for fs tests; each test sets up and tears down its own state.
- **Fast feedback.** Unit suite runs in seconds; slow/integration tests are separated so the inner loop stays quick.
- **No flaky tests tolerated.** A flaky test is fixed or quarantined with an issue immediately — never re-run-until-green.
- **Tests are first-class code.** Same naming, clarity, and review standards as production code; no logic duplicated between many tests (use helpers/factories).

### Acceptance criteria
- [ ] New/changed behavior has accompanying tests; bug fixes include a regression test.
- [ ] All listed critical paths are covered; `lib/**` line coverage ≥ 80%.
- [ ] Test suite is deterministic (passes repeatedly with no network/time dependence) and isolated (temp dirs, no shared state).
- [ ] CI is green with zero skipped/flaky tests (skips require an issue link).

---

## 6. Security & data safety

### Rules
- **Path-traversal protection is non-negotiable.** All document access goes through `resolveDocPath` (ID validation + containment), per `Architecture-final.md` §2.3 — in both API and MCP paths.
- **Validate IDs/names** against `ID_PATTERN` before any fs operation.
- **No secrets in the repo.** `.env` is git-ignored; only `.env.example` is committed. Don't log secrets/tokens or full document contents at info level.
- **Least exposure.** Bind to `127.0.0.1` by default; the WS upgrade requires the token (§7.6).
- **Never silently lose user data.** Concurrency is handled per the chosen phase (ETag/conflict prompt, or CRDT) — overwrites are never silent.

### Acceptance criteria
- [ ] No fs path is constructed without `resolveDocPath`; traversal inputs are rejected (test-proven).
- [ ] No secrets committed or logged; `.env.example` updated when adding config.
- [ ] No code path can silently overwrite concurrent user/agent edits.

---

## 7. Documentation & comments

### Rules
- **Comments explain *why*, not *what*.** No comments that restate the code. Document intent, trade-offs, invariants, and non-obvious constraints.
- **Public `lib` functions have a short doc comment** describing contract, params, thrown errors, and side effects.
- **Keep docs in sync.** When behavior changes, update `Architecture-final.md` / `ui-design.md` / the story in the same PR.
- **READMEs are runnable.** Setup/run instructions actually work from a clean checkout.

### Acceptance criteria
- [ ] No narrating/redundant comments; remaining comments add real context.
- [ ] Public `lib` APIs are documented (contract + errors + side effects).
- [ ] Affected design docs/stories updated in the same change.

---

## 8. UI & accessibility (front-end)

### Rules
- **Follow `ui-design.md`** for tokens, components, layouts, and states — no hard-coded colors/spacing outside the token system.
- **Accessibility is a requirement, not a nice-to-have** (`ui-design.md` §8): keyboard operability, visible focus, AA contrast in both themes, correct ARIA/roles, reduced-motion support.
- **No layout-shift surprises.** Use skeletons/placeholders for async content.

### Acceptance criteria
- [ ] Components use design tokens (no ad-hoc hex/px for themed values).
- [ ] Keyboard-only operation works; focus is always visible; AA contrast verified (light + dark).
- [ ] Interactive elements have correct roles/labels; respects `prefers-reduced-motion`.

---

## 9. Performance & resources

### Rules
- **No avoidable work on the hot path.** Debounce high-frequency events (typing/saves, §7.5); coalesce file/WS events.
- **Bounded growth.** Long-lived state (CRDT tombstones, caches, listeners) must have a compaction/cleanup strategy.
- **Measure before/after** for any change made "for performance"; include the number in the PR.

### Acceptance criteria
- [ ] High-frequency writes/broadcasts are debounced/coalesced.
- [ ] New long-lived state has a documented cleanup/GC path; no listener/handle leaks.
- [ ] Performance-motivated changes include a before/after measurement.

---

## 10. Version control & review

### Rules
- **Small, focused PRs**, one logical change each; ideally a story (or a slice of one).
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) with imperative subjects explaining *why*.
- **`main` is always green and shippable.** Merge only with passing CI and review.
- **No force-push to shared branches; no skipping hooks/CI.**
- **Self-review first**: read your own diff and run the verification before requesting review.

### Acceptance criteria
- [ ] PR is scoped to one logical change with a clear, conventional title/body.
- [ ] CI (type-check, lint, format, tests, coverage gate) is green before merge.
- [ ] No unrelated changes mixed in; commits are coherent.

---

## 11. Definition of Done (global — inherited by every story)

A unit of work is **Done** only when **all** of the following hold:

- [ ] Acceptance criteria in the story file are met and demonstrated.
- [ ] Code complies with this constitution (§§2–10 checklists).
- [ ] `tsc --noEmit`, lint, and format checks pass with zero errors/warnings on changed files.
- [ ] Tests added/updated; full suite passes; critical-path coverage met; `lib/**` ≥ 80%.
- [ ] Security rules (§6) upheld — traversal-safe, no secrets, no silent data loss.
- [ ] UI/a11y rules (§8) upheld for any front-end change.
- [ ] Relevant docs (`Architecture-final.md` / `ui-design.md` / story) updated in the same change.
- [ ] PR is small, conventional, self-reviewed, and CI-green.

---

## 12. CI gates (automation that enforces the above)

CI MUST run and block on: type-check (`tsc --noEmit`), lint (ESLint flat), format check (Prettier), unit + integration tests, coverage threshold (`lib/**` ≥ 80%), and a circular-dependency check. Green CI is a precondition for merge.
