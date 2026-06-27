"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

/** Compare markdown ignoring whitespace drift from serialization. */
function isOwnSaveLag(disk: string, live: string): boolean {
  if (disk === live) return true;
  const compact = (s: string) => s.replace(/\s+/g, "");
  return compact(live).startsWith(compact(disk));
}

const SAVE_DEBOUNCE_MS = 400;

interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
}

interface UseDocumentSaveOptions {
  documentId: string;
  initialContent: string;
  initialEtag: string;
  /** When true, disable all save logic (collab mode handles persistence). */
  collabMode: boolean;
}

interface UseDocumentSaveResult {
  saveStatus: SaveStatus;
  dirty: boolean;
  conflict: string | null;
  etagRef: React.MutableRefObject<string>;
  etag: string;
  /** Force an immediate save. */
  handleSave: () => void;
  /** Perform a save (used internally). */
  performSave: () => Promise<void>;
  /** Current content for comparison. */
  currentContentRef: React.MutableRefObject<string>;
  /** Was a save just completed? (ms since last save). */
  lastSaveCompletedAtRef: React.MutableRefObject<number>;
  /** Was user typing recently? (ms since last local edit). */
  lastLocalEditRef: React.MutableRefObject<number>;
  /** Is a save currently in flight? */
  saveInFlightRef: React.MutableRefObject<boolean>;
  /** Reset conflict state. */
  clearConflict: () => void;
  /** Mark "keep my edits" for next save retry. */
  setKeepMine: () => void;
  /** Reload from server (used by conflict banner). */
  reloadFromServer: (editor: Editor) => Promise<void>;
  /** Set dirty state externally. */
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  /** Set save status externally. */
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
  /** Called from editor onUpdate — debounces save. Pass the editor instance. */
  handleUpdate: (editor: Editor) => void;
  /** Mutable ref to current editor instance. */
  editorRef: React.MutableRefObject<Editor | null>;
}

export function useDocumentSave({
  documentId,
  initialContent,
  initialEtag,
  collabMode,
}: UseDocumentSaveOptions): UseDocumentSaveResult {
  const [etag, setEtag] = useState(initialEtag);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "saved" });
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const keepMineRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentContentRef = useRef(initialContent);
  const etagRef = useRef(initialEtag);
  etagRef.current = etag;
  const lastLocalEditRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const lastSaveCompletedAtRef = useRef(0);
  const performSaveRef = useRef<() => Promise<void>>(async () => {});
  /** Mutable ref to current editor — set by the parent after useEditor(). */
  const editorRef = useRef<Editor | null>(null);

  const performSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const storage = editor.storage as unknown as Record<string, unknown>;
    const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();

    if (markdown === currentContentRef.current && saveStatus.state === "saved") {
      return;
    }

    const savedMarkdown = markdown;
    saveInFlightRef.current = true;
    setSaveStatus({ state: "saving" });

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etagRef.current,
        },
        body: JSON.stringify({ content: savedMarkdown }),
      });

      const latestMarkdown = (
        editor.storage as unknown as Record<string, unknown>
      ).markdown as { getMarkdown: () => string };
      const stillEditing = latestMarkdown.getMarkdown() !== savedMarkdown;

      if (res.status === 409) {
        const data = await res.json();
        if (data.etag) {
          setEtag(data.etag);
          etagRef.current = data.etag;
        }

        if (keepMineRef.current) {
          const retryRes = await fetch(`/api/documents/${documentId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "If-Match": data.etag,
            },
            body: JSON.stringify({ content: latestMarkdown.getMarkdown() }),
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            setEtag(retryData.etag);
            etagRef.current = retryData.etag;
            const afterRetry = latestMarkdown.getMarkdown();
            const retryStillEditing = afterRetry !== savedMarkdown;
            setDirty(retryStillEditing);
            setSaveStatus({ state: retryStillEditing ? "idle" : "saved" });
            if (!retryStillEditing) {
              currentContentRef.current = savedMarkdown;
            }
            keepMineRef.current = false;
            lastSaveCompletedAtRef.current = Date.now();
            setConflict(null);
            return;
          }
        }

        const serverContent = typeof data.content === "string" ? data.content : "";
        const latest = latestMarkdown.getMarkdown();
        const canAutoRetry =
          !keepMineRef.current &&
          (serverContent === savedMarkdown ||
            isOwnSaveLag(serverContent, latest));

        if (canAutoRetry) {
          const autoRetry = await fetch(`/api/documents/${documentId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "If-Match": data.etag,
            },
            body: JSON.stringify({ content: latest }),
          });
          if (autoRetry.ok) {
            const retryData = await autoRetry.json();
            setEtag(retryData.etag);
            etagRef.current = retryData.etag;
            const afterRetry = latestMarkdown.getMarkdown();
            const retryStillEditing = afterRetry !== savedMarkdown;
            setDirty(retryStillEditing);
            setSaveStatus({ state: retryStillEditing ? "idle" : "saved" });
            if (!retryStillEditing) {
              currentContentRef.current = savedMarkdown;
            }
            lastSaveCompletedAtRef.current = Date.now();
            setConflict(null);
            return;
          }
        }

        setConflict(data.error || "Document was modified by another writer");
        setSaveStatus({ state: "error" });
        return;
      }

      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      setEtag(data.etag);
      etagRef.current = data.etag;
      setDirty(stillEditing);
      setSaveStatus({ state: stillEditing ? "idle" : "saved" });
      setConflict(null);
      if (!stillEditing) {
        currentContentRef.current = savedMarkdown;
      }
      lastSaveCompletedAtRef.current = Date.now();
    } catch {
      setSaveStatus({ state: "error" });
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void performSaveRef.current();
      }
    }
  }, [documentId, saveStatus.state]);

  performSaveRef.current = performSave;

  const handleSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    performSave();
  }, [performSave]);

  const clearConflict = useCallback(() => {
    setConflict(null);
  }, []);

  const setKeepMine = useCallback(() => {
    keepMineRef.current = true;
  }, []);

  const reloadFromServer = useCallback(async (ed: Editor) => {
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (res.ok) {
        const data = await res.json();
        setEtag(data.etag);
        etagRef.current = data.etag;
        ed.commands.setContent(data.content);
        currentContentRef.current = data.content;
        setSaveStatus({ state: "saved" });
        setDirty(false);
      }
    } catch {
      // Ignore.
    } finally {
      clearConflict();
      keepMineRef.current = false;
    }
  }, [documentId, clearConflict]);

  // onUpdate handler: track edits and debounce save.
  const handleUpdate = useCallback((ed: Editor) => {
    if (collabMode) return;
    editorRef.current = ed;
    lastLocalEditRef.current = Date.now();

    const storage = ed.storage as unknown as Record<string, unknown>;
    const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();

    const prevContent = currentContentRef.current;
    if (markdown !== prevContent) {
      setDirty(true);
      currentContentRef.current = markdown;
    }

    if (saveStatus.state !== "saving") {
      setSaveStatus({ state: "idle" });
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSaveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, [collabMode, saveStatus.state]);

  // Force-flush on editor blur.
  useEffect(() => {
    if (collabMode) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.on("blur", () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      performSaveRef.current();
    });
    return () => {
      editor.off("blur");
    };
  }, [collabMode]);

  // Force-flush on beforeunload.
  useEffect(() => {
    if (collabMode) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const editor = editorRef.current;
      const storage = editor?.storage as unknown as Record<string, unknown>;
      if (storage && dirty) {
        const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();
        const data = JSON.stringify({ content: markdown, ifMatch: etagRef.current });
        navigator.sendBeacon(`/api/documents/${documentId}`, data);
      }
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [documentId, dirty, collabMode]);

  return {
    saveStatus,
    dirty,
    conflict,
    etagRef,
    etag,
    handleSave,
    performSave,
    currentContentRef,
    lastSaveCompletedAtRef,
    lastLocalEditRef,
    saveInFlightRef,
    clearConflict,
    setKeepMine,
    reloadFromServer,
    setDirty,
    setSaveStatus,
    handleUpdate,
    editorRef,
  };
}
