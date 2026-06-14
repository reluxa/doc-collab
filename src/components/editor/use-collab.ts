"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import { WebSocketStatus } from "@hocuspocus/provider";

import {
  createCollabProvider,
  setCursorInfo,
  PRESENCE_COLORS,
  type CollabProvider,
} from "@/client/collab-provider";
import { COLLAB_FIELD } from "@/lib/collab/constants";

export type CollabStatus = "offline" | "connecting" | "connected" | "reconnecting";

interface UseCollabOptions {
  documentId: string;
  token: string;
  fallbackContent: string;
  enabled: boolean;
}

interface UseCollabResult {
  collab: CollabProvider | null;
  status: CollabStatus;
  synced: boolean;
  awarenessRevision: number;
  activeSectionId: string | null;
  getCollabExtensions: (doc: Y.Doc, provider: CollabProvider["provider"]) => unknown[];
  bootstrapIfEmpty: (editor: Editor) => void;
  updateSectionAwareness: (editor: Editor) => void;
}

/** Extract section id from nearest preceding `sec:` anchor comment in the doc. */
export function detectActiveSectionId(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  const doc = editor.state.doc;

  for (let pos = $from.before(1); pos >= 0; pos -= 1) {
    const node = doc.nodeAt(pos);
    if (!node) continue;
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      const text = node.textContent;
      const match = text.match(/<!--\s*sec:([a-zA-Z0-9_-]+)\s*-->/);
      if (match) return match[1];
    }
  }

  // Fallback: scan top-level nodes before cursor for anchor comments in markdown.
  let offset = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i);
    const text = node.textContent;
    const anchorMatch = text.match(/sec:([a-zA-Z0-9_-]+)/);
    const nodeEnd = offset + node.nodeSize;
    if (anchorMatch && $from.pos >= offset && $from.pos <= nodeEnd) {
      return anchorMatch[1];
    }
    offset = nodeEnd;
  }

  return null;
}

export function useCollab({
  documentId,
  token,
  fallbackContent,
  enabled,
}: UseCollabOptions): UseCollabResult {
  const [collab, setCollab] = useState<CollabProvider | null>(null);
  const [status, setStatus] = useState<CollabStatus>("offline");
  const [synced, setSynced] = useState(false);
  const [awarenessRevision, setAwarenessRevision] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);
  const collabRef = useRef<CollabProvider | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setCollab(null);
      setSynced(false);
      setStatus("offline");
      bootstrappedRef.current = false;
      return;
    }

    bootstrappedRef.current = false;
    setSynced(false);
    setStatus("connecting");

    const instance = createCollabProvider({ documentId, token });
    collabRef.current = instance;
    setCollab(instance);

    setCursorInfo(instance.provider, "You", PRESENCE_COLORS.human);

    const onStatus = ({ status: providerStatus }: { status: WebSocketStatus }) => {
      if (providerStatus === WebSocketStatus.Connected) setStatus("connected");
      else if (providerStatus === WebSocketStatus.Connecting) setStatus("connecting");
      else setStatus("reconnecting");
    };

    const onSynced = () => setSynced(true);
    const onAwareness = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const localId = instance.provider.awareness?.clientID;
      const remoteChanged = [...added, ...updated, ...removed].some((id) => id !== localId);
      if (remoteChanged) setAwarenessRevision((n) => n + 1);
    };

    instance.provider.on("status", onStatus);
    instance.provider.on("synced", onSynced);
    instance.provider.awareness?.on("change", onAwareness);

    if (instance.provider.synced) setSynced(true);

    void instance.persistence.whenSynced.then(() => {
      setSynced(true);
    });

    return () => {
      instance.provider.off("status", onStatus);
      instance.provider.off("synced", onSynced);
      instance.provider.awareness?.off("change", onAwareness);
      instance.destroy();
      collabRef.current = null;
      setCollab(null);
      setSynced(false);
      setStatus("offline");
    };
  }, [documentId, token, enabled]);

  const getCollabExtensions = useCallback(
    (doc: Y.Doc, provider: CollabProvider["provider"]) => [
      Collaboration.configure({
        document: doc,
        field: COLLAB_FIELD,
      }),
      CollaborationCaret.configure({
        provider,
        user: {
          name: "You",
          color: PRESENCE_COLORS.human,
        },
      }),
    ],
    [],
  );

  const bootstrapIfEmpty = useCallback(
    (editor: Editor) => {
      if (bootstrappedRef.current || !fallbackContent.trim()) return;
      if (!editor.isEmpty) {
        bootstrappedRef.current = true;
        return;
      }
      editor.commands.setContent(fallbackContent);
      bootstrappedRef.current = true;
    },
    [fallbackContent],
  );

  const updateSectionAwareness = useCallback((editor: Editor) => {
    const sectionId = detectActiveSectionId(editor);
    setActiveSectionId((prev) => (prev === sectionId ? prev : sectionId));
    const current = collabRef.current;
    if (current) {
      setCursorInfo(current.provider, "You", PRESENCE_COLORS.human, sectionId ?? undefined);
    }
  }, []);

  return {
    collab,
    status,
    synced,
    awarenessRevision,
    activeSectionId,
    getCollabExtensions,
    bootstrapIfEmpty,
    updateSectionAwareness,
  };
}
