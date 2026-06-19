# Source Code Dependency Graph

Generated from 50 source files.

## Complete Dependency Graph

### app/api/documents/[id]/pdf/route.ts

- **->** @/lib/documents (-> lib/documents.ts)
- **->** @/lib/collab/sections (-> lib/collab/sections.ts)
- **->** @/lib/markdown (-> lib/markdown.ts)
- **->** @/lib/pdf (-> lib/pdf.tsx)

### app/api/documents/[id]/route.ts

- **->** ../../../../lib/documents (-> lib/documents.ts)

### app/api/documents/[id]/versions/[version]/restore/route.ts

- **->** @/lib/collab/versioning-read (-> lib/collab/versioning-read.ts)
- **->** @/lib/documents (-> lib/documents.ts)
- **->** @/lib/errors (-> lib/errors.ts)
- **->** (dynamic) @/lib/collab/versioning (-> lib/collab/versioning.ts)

### app/api/documents/[id]/versions/[version]/route.ts

- **->** @/lib/collab/versioning-read (-> lib/collab/versioning-read.ts)
- **->** @/lib/errors (-> lib/errors.ts)

### app/api/documents/[id]/versions/route.ts

- **->** @/lib/documents (-> lib/documents.ts)
- **->** @/lib/collab/versioning-read (-> lib/collab/versioning-read.ts)
- **->** @/lib/errors (-> lib/errors.ts)
- **->** (dynamic) @/lib/collab/versioning (-> lib/collab/versioning.ts)

### app/api/documents/route.ts

- **->** @/lib/collab/versioning-read (-> lib/collab/versioning-read.ts)
- **->** @/lib/documents (-> lib/documents.ts)
- **->** @/lib/document-list-cache (-> lib/document-list-cache.ts)
- **->** @/lib/security (-> lib/security.ts)

### app/editor/[id]/page.tsx

- **->** @/components/editor/editor (-> components/editor/editor.tsx)
- **->** @/lib/documents (-> lib/documents.ts)
- **->** (type) @/types/document (-> types/document.ts)

### app/layout.tsx

- **->** @/lib/config (-> lib/config.ts)
- **->** ./globals.css (-> app/globals.css)
- **->** @/components/ui/toast (-> components/ui/toast.tsx)
- **->** @/components/ui/theme-provider (-> components/ui/theme-provider.tsx)

### app/page.tsx

- **->** @/components/documents/document-list (-> components/documents/document-list.tsx)
- **->** @/components/ui/theme-toggle (-> components/ui/theme-toggle.tsx)
- **->** @/components/ui/theme-provider (-> components/ui/theme-provider.tsx)
- **->** @/components/ui/toast (-> components/ui/toast.tsx)

### client/collab-provider.ts

- **->** @/lib/collab/constants (-> lib/collab/constants.ts)
- **->** @/lib/config (-> lib/config.ts)

### collab-server.ts

- **->** ./lib/config (-> lib/config.ts)
- **->** ./lib/collab/persistence (-> lib/collab/persistence.ts)

### components/documents/document-list.tsx

- **->** (type) @/types/document (-> types/document.ts)

### components/editor/editor.tsx

- **->** ./mermaid-node (-> components/editor/mermaid-node.tsx)
- **->** ./toolbar (-> components/editor/toolbar.tsx)
- **->** ./conflict-banner (-> components/editor/conflict-banner.tsx)
- **->** ./version-history (-> components/editor/version-history.tsx)
- **->** ./ws-client (-> components/editor/ws-client.ts)
- **->** @/components/ui/theme-toggle (-> components/ui/theme-toggle.tsx)
- **->** @/components/ui/theme-provider (-> components/ui/theme-provider.tsx)
- **->** @/components/ui/toast (-> components/ui/toast.tsx)
- **->** ./use-collab (-> components/editor/use-collab.ts)
- **->** ./presence-stack (-> components/editor/presence-stack.tsx)
- **->** @/client/collab-provider (-> client/collab-provider.ts)
- **->** @/lib/collab/constants (-> lib/collab/constants.ts)
- **->** @/lib/collab/sections (-> lib/collab/sections.ts)
- **->** ./virtualized-section-view (-> components/editor/virtualized-section-view.tsx)
- **->** ./sheet-skeleton (-> components/editor/sheet-skeleton.tsx)
- **->** @/client/collab-provider (-> client/collab-provider.ts)

### components/editor/mermaid-node.tsx

- **->** ./mermaid-renderer (-> components/editor/mermaid-renderer.tsx)

### components/editor/mermaid-renderer.tsx

- **->** @/lib/mermaid (-> lib/mermaid.ts)

### components/editor/presence-stack.tsx

- **->** @/client/collab-provider (-> client/collab-provider.ts)

### components/editor/toolbar.tsx

- **->** ./mermaid-node (-> components/editor/mermaid-node.tsx)

### components/editor/use-collab.ts

- **->** @/client/collab-provider (-> client/collab-provider.ts)
- **->** @/lib/collab/constants (-> lib/collab/constants.ts)

### components/editor/virtualized-section-view.tsx

- **->** ./sheet-skeleton (-> components/editor/sheet-skeleton.tsx)
- **->** (type) @/lib/collab/sections (-> lib/collab/sections.ts)

### lib/collab/agent-document.ts

- **->** ../errors (-> lib/errors.ts)
- **->** ./md-bridge (-> lib/collab/md-bridge.ts)
- **->** ./sections (-> lib/collab/sections.ts)
- **->** ./constants (-> lib/collab/constants.ts)
- **->** ./persistence (-> lib/collab/persistence.ts)
- **->** ./persist-echo (-> lib/collab/persist-echo.ts)

### lib/collab/hocuspocus.ts

- **->** ../config (-> lib/config.ts)
- **->** ./persistence (-> lib/collab/persistence.ts)
- **->** ./versioning (-> lib/collab/versioning.ts)
- **->** ./constants (-> lib/collab/constants.ts)
- **->** (dynamic) ../documents (-> lib/documents.ts)
- **->** (dynamic) ./versioning (-> lib/collab/versioning.ts)

### lib/collab/md-bridge.ts

- **->** ./sections (-> lib/collab/sections.ts)
- **->** ./section-dirty (-> lib/collab/section-dirty.ts)
- **->** ./doc-model (-> lib/collab/doc-model.ts)

### lib/collab/persistence.ts

- **->** ../security (-> lib/security.ts)
- **->** ./md-bridge (-> lib/collab/md-bridge.ts)
- **->** ./constants (-> lib/collab/constants.ts)
- **->** ./persist-echo (-> lib/collab/persist-echo.ts)
- **->** ./versioning (-> lib/collab/versioning.ts)
- **->** ./section-dirty (-> lib/collab/section-dirty.ts)
- **->** ./sections (-> lib/collab/sections.ts)

### lib/collab/reconcile-external.ts

- **->** ../security (-> lib/security.ts)
- **->** ./hocuspocus (-> lib/collab/hocuspocus.ts) :warning: **HEAVY**
- **->** ./persist-echo (-> lib/collab/persist-echo.ts)
- **->** ./agent-document (-> lib/collab/agent-document.ts)

### lib/collab/section-dirty.ts

- **->** ./doc-model (-> lib/collab/doc-model.ts)

### lib/collab/versioning-read.ts

- **->** @/lib/config (-> lib/config.ts)
- **->** @/lib/security (-> lib/security.ts)
- **->** @/lib/errors (-> lib/errors.ts)

### lib/collab/versioning.ts

- **->** ../config (-> lib/config.ts)
- **->** ../security (-> lib/security.ts)
- **->** ../errors (-> lib/errors.ts)
- **->** ./sections (-> lib/collab/sections.ts)

### lib/document-list-cache.ts

- **->** ./documents (-> lib/documents.ts)

### lib/documents.ts

- **->** ./config (-> lib/config.ts)
- **->** ./errors (-> lib/errors.ts)
- **->** ./api-write-echo (-> lib/api-write-echo.ts)
- **->** ./security (-> lib/security.ts)
- **->** (type) ../types/document (-> types/document.ts)
- **->** (dynamic) ./collab/versioning (-> lib/collab/versioning.ts)
- **->** (dynamic) ./collab/versioning (-> lib/collab/versioning.ts)

### lib/realtime.ts

- **->** ./config (-> lib/config.ts)

### lib/security.ts

- **->** ./config (-> lib/config.ts)
- **->** ./errors (-> lib/errors.ts)

## Cycle Detection

### :white_check_mark: Static Import Cycles: **None**

### :white_check_mark: No cycles from dynamic imports either

## Heavy Dependency Analysis

### Direct heavy imports

- lib/collab/reconcile-external.ts -> ./hocuspocus

### Transitive heavy deps from API routes

- **app/api/documents/[id]/pdf/route.ts** - clean
- **app/api/documents/[id]/route.ts** - clean
- **app/api/documents/[id]/versions/[version]/restore/route.ts** - clean
- **app/api/documents/[id]/versions/[version]/route.ts** - clean
- **app/api/documents/[id]/versions/route.ts** - clean
- **app/api/documents/route.ts** - clean

## Import Heatmap

| Module | Imported By Count |
|--------|-------------------|
| lib/config.ts | 9 |
| lib/errors.ts | 8 |
| lib/documents.ts | 8 |
| lib/collab/versioning.ts | 7 |
| lib/collab/constants.ts | 6 |
| lib/security.ts | 6 |
| lib/collab/sections.ts | 6 |
| lib/collab/versioning-read.ts | 4 |
| client/collab-provider.ts | 4 |
| components/ui/toast.tsx | 3 |
| components/ui/theme-provider.tsx | 3 |
| lib/collab/persist-echo.ts | 3 |
| lib/collab/persistence.ts | 3 |
| components/ui/theme-toggle.tsx | 2 |
| components/editor/mermaid-node.tsx | 2 |
| components/editor/sheet-skeleton.tsx | 2 |
| lib/collab/md-bridge.ts | 2 |
| lib/collab/section-dirty.ts | 2 |
| lib/collab/doc-model.ts | 2 |
| app/globals.css | 1 |
| components/documents/document-list.tsx | 1 |
| lib/collab/hocuspocus.ts | 1 |
| lib/collab/agent-document.ts | 1 |
| components/editor/toolbar.tsx | 1 |
| components/editor/conflict-banner.tsx | 1 |
| components/editor/version-history.tsx | 1 |
| components/editor/ws-client.ts | 1 |
| components/editor/use-collab.ts | 1 |
| components/editor/presence-stack.tsx | 1 |
| components/editor/virtualized-section-view.tsx | 1 |
| components/editor/mermaid-renderer.tsx | 1 |
| lib/mermaid.ts | 1 |
| components/editor/editor.tsx | 1 |
| lib/document-list-cache.ts | 1 |
| lib/markdown.ts | 1 |
| lib/pdf.tsx | 1 |
| lib/api-write-echo.ts | 1 |

## API Route Detail

### app/api/documents/[id]/pdf/route.ts

- Static: 4, Dynamic: 0
- Static: lib/documents.ts, lib/collab/sections.ts, lib/markdown.ts, lib/pdf.tsx

### app/api/documents/[id]/route.ts

- Static: 1, Dynamic: 0
- Static: lib/documents.ts

### app/api/documents/[id]/versions/[version]/restore/route.ts

- Static: 3, Dynamic: 1
- Static: lib/collab/versioning-read.ts, lib/documents.ts, lib/errors.ts
- Dynamic: lib/collab/versioning.ts

### app/api/documents/[id]/versions/[version]/route.ts

- Static: 2, Dynamic: 0
- Static: lib/collab/versioning-read.ts, lib/errors.ts

### app/api/documents/[id]/versions/route.ts

- Static: 3, Dynamic: 1
- Static: lib/documents.ts, lib/collab/versioning-read.ts, lib/errors.ts
- Dynamic: lib/collab/versioning.ts

### app/api/documents/route.ts

- Static: 4, Dynamic: 0
- Static: lib/collab/versioning-read.ts, lib/documents.ts, lib/document-list-cache.ts, lib/security.ts

## Collab Module Subgraph

```
lib/collab/agent-document.ts:
  -> ../errors (lib/errors.ts)
  -> ./md-bridge (lib/collab/md-bridge.ts)
  -> ./sections (lib/collab/sections.ts)
  -> ./constants (lib/collab/constants.ts)
  -> ./persistence (lib/collab/persistence.ts)
  -> ./persist-echo (lib/collab/persist-echo.ts)
lib/collab/hocuspocus.ts:
  -> ../config (lib/config.ts)
  -> ./persistence (lib/collab/persistence.ts)
  -> ./versioning (lib/collab/versioning.ts)
  -> ./constants (lib/collab/constants.ts)
  -> (dynamic) ../documents (lib/documents.ts)
  -> (dynamic) ./versioning (lib/collab/versioning.ts)
lib/collab/md-bridge.ts:
  -> ./sections (lib/collab/sections.ts)
  -> ./section-dirty (lib/collab/section-dirty.ts)
  -> ./doc-model (lib/collab/doc-model.ts)
lib/collab/persistence.ts:
  -> ../security (lib/security.ts)
  -> ./md-bridge (lib/collab/md-bridge.ts)
  -> ./constants (lib/collab/constants.ts)
  -> ./persist-echo (lib/collab/persist-echo.ts)
  -> ./versioning (lib/collab/versioning.ts)
  -> ./section-dirty (lib/collab/section-dirty.ts)
  -> ./sections (lib/collab/sections.ts)
lib/collab/reconcile-external.ts:
  -> ../security (lib/security.ts)
  -> ./hocuspocus (lib/collab/hocuspocus.ts)
  -> ./persist-echo (lib/collab/persist-echo.ts)
  -> ./agent-document (lib/collab/agent-document.ts)
lib/collab/section-dirty.ts:
  -> ./doc-model (lib/collab/doc-model.ts)
lib/collab/versioning-read.ts:
  -> @/lib/config (lib/config.ts)
  -> @/lib/security (lib/security.ts)
  -> @/lib/errors (lib/errors.ts)
lib/collab/versioning.ts:
  -> ../config (lib/config.ts)
  -> ../security (lib/security.ts)
  -> ../errors (lib/errors.ts)
  -> ./sections (lib/collab/sections.ts)
```

## Summary

- Total files: 50
- Static import cycles: 0
- Dynamic import cycles: 0
- API routes: 6
- Direct heavy imports: 1
## Turbopack Hang Root Cause Analysis

### Problem
Dev server (`npm run dev` → `tsx watch server.ts --dev`) started and responded correctly for ~30 seconds, then all routes (GET and POST) began timing out indefinitely.

### Root Cause
**`tsx watch` was monitoring the entire working directory, including `.next/`.** When Turbopack wrote to `.next/dev/` during background persistence, HMR updates, or cache writes, `tsx watch` picked up the file change and tried to restart the server. This caused:
1. The old process still holding the port
2. Turbopack mid-recompilation state corruption
3. Request deadlock

### Fix
Added `--exclude '.next/**'` to the dev script:
```json
"dev": "tsx watch --exclude '.next/**' server.ts --dev"
```

### Additional Fix
Eliminated the last remaining dynamic import cycle:
- `documents.ts` → `document-list-cache.ts` → `documents.ts`
- Moved cache store + `invalidateDocumentListCache()` into `documents.ts` directly
- `document-list-cache.ts` now re-exports from `documents.ts` (backward compat shim)
- Updated `server.ts` to import directly from `documents.ts`

### Verification
- Static import cycles: 0 ✅
- Dynamic import cycles: 0 ✅
- Server stable for 60+ seconds after `tsx watch --exclude '.next/**'` fix ✅

## Investigation Notes

### Root Cause Analysis

**Problem:** Dev server (`tsx watch server.ts --dev`) started and responded correctly for ~30 seconds, then ALL routes (GET and POST) began timing out indefinitely.

**Initial hypothesis:** Turbopack internal background task (persistence/HMR) causing event loop deadlock.

**Actual root cause:** `tsx watch` was monitoring the entire working directory including:
1. `.next/` — Turbopack writes cache files during background operations, `tsx watch` picked these up and tried to restart the server
2. `documents/` — Cypress tests create/delete `.md` files during tests, `tsx watch` picked these up and restarted mid-test

**Fix:** Added two `--exclude` flags to the dev script:
```json
"dev": "tsx watch --exclude '.next/**' --exclude 'documents/**' server.ts --dev"
```

**Verification:** Server stable for 70+ seconds after fix. All 5 Cypress tests pass.

### Dynamic Import Cycle (Secondary Issue)

Also eliminated a dynamic import cycle:
- `documents.ts` → `document-list-cache.ts` → `documents.ts`
- Fixed by moving cache store into `documents.ts` directly
- `document-list-cache.ts` now re-exports from `documents.ts` (backward compat shim)
- Updated `server.ts` to import directly from `documents.ts`

### GitHub Issues Researched

- Next.js #81161: Turbopack dev server uses too much RAM/CPU (related but different)
- Next.js #94739: Dev hot-reloader deadlocks deferred-entry compilation (16.2.6)
- Next.js docs: Custom server configuration, `serverExternalPackages`, `turbopack` option

### Process Analysis

Used `/proc/PID/status`, `/proc/PID/wchan`, `/proc/PID/stack` to diagnose process state during hangs. Confirmed server was in kernel wait state (`do_wait`) during Turbopack background operations.
