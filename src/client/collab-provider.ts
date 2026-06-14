/**
 * Client-side Hocuspocus provider for collaborative editing.
 *
 * Creates a `HocuspocusProvider` that connects to the collab server
 * at same-origin `/ws/collab` and manages the shared `Y.Doc`.
 * Integrates with `y-indexeddb` for offline buffering and reconnect.
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";

import { COLLAB_WS_PATH } from "@/lib/collab/constants";
import { isCollabEditorEnabled } from "@/lib/config";

/** Options for creating a collab provider. */
export interface CollabProviderOptions {
  documentId: string;
  token: string;
}

/** A connected collab provider with its Y.Doc and offline support. */
export interface CollabProvider {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  destroy(): void;
}

/** Presence colors per ui-design.md §2.5. */
export const PRESENCE_COLORS = {
  human: "#4f46e5",
  agent: "#14b8a6",
} as const;

function collabWebSocketUrl(): string {
  if (typeof window === "undefined") {
    return `ws://127.0.0.1:3000${COLLAB_WS_PATH}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${COLLAB_WS_PATH}`;
}

export function createCollabProvider(opts: CollabProviderOptions): CollabProvider {
  const { documentId, token } = opts;
  const doc = new Y.Doc({ gc: true });

  // Token in URL satisfies the server's pre-upgrade auth check (§7.6).
  // Hocuspocus also sends it in the auth message for onAuthenticate.
  const url = token
    ? `${collabWebSocketUrl()}?token=${encodeURIComponent(token)}`
    : collabWebSocketUrl();

  const provider = new HocuspocusProvider({
    name: documentId,
    document: doc,
    token,
    url,
  });

  const persistence = new IndexeddbPersistence(`doc-collab:${documentId}`, doc);

  return {
    provider,
    doc,
    persistence,
    destroy() {
      persistence.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}

export function setCursorInfo(
  provider: HocuspocusProvider,
  name: string,
  color: string,
  sectionId?: string,
): void {
  const awareness = provider.awareness;
  if (!awareness) return;

  const current = awareness.getLocalState() as
    | { user?: { name?: string; color?: string }; sectionId?: string }
    | null;
  const nextSectionId = sectionId ?? undefined;
  if (
    current?.user?.name === name &&
    current?.user?.color === color &&
    (current.sectionId ?? undefined) === nextSectionId
  ) {
    return;
  }

  awareness.setLocalState({
    user: { name, color },
    ...(nextSectionId ? { sectionId: nextSectionId } : {}),
  });
}

export function getCollaborators(
  provider: HocuspocusProvider,
): Map<number, Record<string, unknown>> {
  const awareness = provider.awareness;
  return awareness?.getStates() ?? new Map();
}

export function isCollabEnabled(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.has("collab")) return params.get("collab") === "1";

    const config = (window as unknown as Record<string, unknown>).__DOC_COLLAB_CONFIG as
      | { collab?: boolean }
      | undefined;
    if (typeof config?.collab === "boolean") return config.collab;
  }
  return isCollabEditorEnabled();
}
