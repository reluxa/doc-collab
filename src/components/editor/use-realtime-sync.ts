"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { WsClient, type ConnectionStatus } from "./ws-client";

interface UseRealtimeSyncOptions {
  documentId: string;
  /** When true, disable WebSocket (collab mode uses Hocuspocus instead). */
  collabMode: boolean;
  /** Is editor currently dirty? */
  dirty: boolean;
  /** Mutable ref to current editor instance. */
  editorRef: React.MutableRefObject<Editor | null>;
  /** Current content string for comparison. */
  currentContentRef: React.MutableRefObject<string>;
  /** Current etag. */
  etagRef: React.MutableRefObject<string>;
  /** Was a save in flight? */
  saveInFlightRef: React.MutableRefObject<boolean>;
  /** Was user typing recently? (timestamp) */
  lastLocalEditRef: React.MutableRefObject<number>;
  /** When was last save completed? (timestamp) */
  lastSaveCompletedAtRef: React.MutableRefObject<number>;
  /** Callbacks to update state. */
  onUpdateState: {
    setEtag: (etag: string) => void;
    setSaveStatus: (state: "saved" | "idle" | "error") => void;
    setConflict: (msg: string | null) => void;
  };
}

/**
 * Manages WebSocket-based real-time sync (Phase 1, non-collab mode).
 * Handles `doc-changed` events with echo-filtering.
 */
export function useRealtimeSync({
  documentId,
  collabMode,
  dirty,
  editorRef,
  currentContentRef,
  etagRef,
  saveInFlightRef,
  lastLocalEditRef,
  lastSaveCompletedAtRef,
  onUpdateState,
}: UseRealtimeSyncOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");

  useEffect(() => {
    if (collabMode) return;

    const client = new WsClient({
      docId: documentId,
      callbacks: {
        onDocChanged: async (event) => {
          const isDirty = dirty;
          const currentEditor = editorRef.current;

          // Ignore echoes while a save is in flight.
          if (saveInFlightRef.current) return;

          // Our own save already updated etag — ignore the watcher echo.
          if (event.version && event.version === etagRef.current) return;

          // User typed recently; a save/watcher round-trip must not reset selection.
          if (Date.now() - lastLocalEditRef.current < 1_500) return;

          // Recent auto-save — watcher echo is not an external edit.
          if (Date.now() - lastSaveCompletedAtRef.current < 2_000) return;

          const editorMarkdown = currentEditor
            ? (
                currentEditor.storage as unknown as Record<string, unknown>
              ).markdown as { getMarkdown: () => string } | undefined
            : undefined;

          if (event.origin === "server-watcher" && isDirty) {
            try {
              const res = await fetch(`/api/documents/${documentId}`);
              if (res.ok) {
                const data = await res.json();
                const live = editorMarkdown?.getMarkdown() ?? currentContentRef.current;
                const disk = data.content as string;

                // Own auto-save lag: disk is a prefix of unsaved local edits.
                const compact = (s: string) => s.replace(/\s+/g, "");
                const isOwnLag = disk === live || compact(live).startsWith(compact(disk));
                if (isOwnLag) {
                  onUpdateState.setEtag(data.etag);
                  etagRef.current = data.etag;
                  onUpdateState.setConflict(null);
                  return;
                }
              }
            } catch {
              // Fall through to conflict banner.
            }
            onUpdateState.setConflict("This document was changed elsewhere.");
            return;
          }

          // If not dirty, apply the changes seamlessly.
          if (!isDirty) {
            try {
              const res = await fetch(`/api/documents/${documentId}`);
              if (res.ok) {
                const data = await res.json();
                const liveMarkdown = editorMarkdown?.getMarkdown();
                if (
                  data.content === currentContentRef.current ||
                  data.content === liveMarkdown
                ) {
                  onUpdateState.setEtag(data.etag);
                  etagRef.current = data.etag;
                  return;
                }
                currentContentRef.current = data.content;
                onUpdateState.setEtag(data.etag);
                etagRef.current = data.etag;
                currentEditor?.commands.setContent(data.content, { emitUpdate: false });
                onUpdateState.setSaveStatus("saved");
              }
            } catch {
              // Ignore fetch errors.
            }
          }
        },
        onStatusChange: (status) => {
          setConnectionStatus(status);
        },
      },
    });

    client.connect();
    return () => {
      client.disconnect();
    };
  }, [documentId, collabMode, dirty]);

  return { connectionStatus };
}
