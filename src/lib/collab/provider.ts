/**
 * Client-side Hocuspocus provider for collaborative editing.
 *
 * Creates a `HocuspocusProvider` that connects to the collab server
 * and manages the shared `Y.Doc` for a document.  Integrates with
 * `y-indexeddb` for offline buffering and automatic reconnect.
 *
 * Usage:
 *   ```tsx
 *   const provider = createCollabProvider({
 *     documentId: 'my-doc',
 *     token: WS_TOKEN,
 *   });
 *   // Pass `provider.doc` to Tiptap's Collaboration extension.
 *   ```
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating a collab provider. */
export interface CollabProviderOptions {
  /** Document id (filename without .md extension). */
  documentId: string;
  /** WS_TOKEN for authentication. */
  token: string;
  /** URL of the collab server. Defaults to `ws://localhost:1235`. */
  serverUrl?: string;
}

/** A connected collab provider with its Y.Doc and offline support. */
export interface CollabProvider {
  /** The Hocuspocus provider (manages WS connection). */
  provider: HocuspocusProvider;
  /** The shared Y.Doc for this document. */
  doc: Y.Doc;
  /** The IndexedDB persistence for offline support. */
  persistence: IndexeddbPersistence;
  /** Dispose all resources and disconnect. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Provider creation
// ---------------------------------------------------------------------------

/**
 * Create a collab provider for the given document.
 *
 * Connects to the Hocuspocus server, sets up offline buffering via
 * `y-indexeddb`, and returns the shared `Y.Doc` ready to bind to
 * the Tiptap editor.
 *
 * @param opts  Provider options (documentId, token, serverUrl).
 * @returns     A `CollabProvider` with doc, provider, and destroy().
 */
export function createCollabProvider(opts: CollabProviderOptions): CollabProvider {
  const {
    documentId,
    token,
    serverUrl = typeof window !== "undefined"
      ? `ws://${window.location.hostname}:1235`
      : "ws://localhost:1235",
  } = opts;

  // Create the Y.Doc with GC enabled for tombstone management.
  const doc = new Y.Doc({ gc: true });

  // Connect to the Hocuspocus server.
  const provider = new HocuspocusProvider({
    name: documentId,
    document: doc,
    token,
    url: `${serverUrl}?token=${encodeURIComponent(token)}`,
  });

  // Set up offline buffering with IndexedDB.
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

// ---------------------------------------------------------------------------
// Awareness helpers
// ---------------------------------------------------------------------------

/**
 * Set the current user's presence cursor info.
 *
 * @param provider  The collab provider.
 * @param name      Display name (e.g., "You" or "openclaw").
 * @param color     Hex color for the cursor/selection (e.g., "#4f46e5").
 * @param sectionId Section ID being edited (for soft-lock hint).
 */
export function setCursorInfo(
  provider: HocuspocusProvider,
  name: string,
  color: string,
  sectionId?: string,
): void {
  const awareness = provider.awareness;
  if (!awareness) return;

  awareness.setLocalState({
    user: { name, color },
    ...(sectionId ? { sectionId } : {}),
  });
}

/**
 * Get the presence states of all connected collaborators.
 *
 * @param provider  The collab provider.
 * @returns         Map of clientID → presence state.
 */
export function getCollaborators(
  provider: HocuspocusProvider,
): Map<number, Record<string, unknown>> {
  const awareness = provider.awareness;
  return awareness?.getStates() ?? new Map();
}
