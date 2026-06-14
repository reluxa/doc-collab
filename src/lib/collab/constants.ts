/** Collab WebSocket path on the shared HTTP server. */
export const COLLAB_WS_PATH = "/ws/collab";

/** Field name used by Tiptap Collaboration for the live ProseMirror document. */
export const COLLAB_FIELD = "default";

/** Debounced persist interval (ms). */
export const PERSIST_DEBOUNCE_MS = 400;

/** Maximum interval between `.ydoc` snapshots (ms). */
export const PERSIST_MAX_DEBOUNCE_MS = 30_000;
