"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import TiptapLink from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { isChangeOrigin } from "@tiptap/extension-collaboration";

import { Toolbar } from "./toolbar";
import { ConflictBanner } from "./conflict-banner";
import { WsClient, type ConnectionStatus } from "./ws-client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/ui/theme-provider";
import { useToast } from "@/components/ui/toast";
import { useCollab } from "./use-collab";
import { PresenceStack, SoftLockHint } from "./presence-stack";
import { isCollabEnabled } from "@/client/collab-provider";
import { COLLAB_FIELD } from "@/lib/collab/constants";
import { splitMarkdown } from "@/lib/collab/sections";
import {
  VirtualizedSectionView,
  shouldVirtualizeSections,
} from "./virtualized-section-view";
import { SheetSkeleton } from "./sheet-skeleton";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { PRESENCE_COLORS } from "@/client/collab-provider";

const lowlight = createLowlight(common);

/** Compare markdown ignoring whitespace drift from serialization. */
function isOwnSaveLag(disk: string, live: string): boolean {
  if (disk === live) return true;
  const compact = (s: string) => s.replace(/\s+/g, "");
  return compact(live).startsWith(compact(disk));
}

// Debounce interval for auto-saves (ms).
const SAVE_DEBOUNCE_MS = 400;

interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
}

interface EditorProps {
  id: string;
  initialContent: string;
  initialEtag: string;
}

export function Editor({ id, initialContent, initialEtag }: EditorProps) {
  const [collabMode, setCollabMode] = useState(false);
  const [wsToken, setWsToken] = useState("");

  useEffect(() => {
    setCollabMode(isCollabEnabled());
    const config = (window as unknown as Record<string, unknown>).__DOC_COLLAB_CONFIG as
      | { wsToken?: string }
      | undefined;
    setWsToken(config?.wsToken ?? "");
  }, []);

  const collab = useCollab({
    documentId: id,
    token: wsToken,
    fallbackContent: initialContent,
    enabled: collabMode && !!wsToken,
  });

  const bootstrapIfEmptyRef = useRef(collab.bootstrapIfEmpty);
  bootstrapIfEmptyRef.current = collab.bootstrapIfEmpty;
  const updateSectionAwarenessRef = useRef(collab.updateSectionAwareness);
  updateSectionAwarenessRef.current = collab.updateSectionAwareness;

  const parsedSections = useMemo(
    () => splitMarkdown(initialContent),
    [initialContent],
  );
  const useVirtualizedLayout = shouldVirtualizeSections(parsedSections.length);
  const [showFullEditor, setShowFullEditor] = useState(!useVirtualizedLayout);

  const [etag, setEtag] = useState(initialEtag);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "saved" });
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  // Track if we should keep our edits after a conflict.
  const keepMineRef = useRef(false);
  // Debounce timer ref.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Current content for comparison.
  const currentContentRef = useRef(initialContent);
  const etagRef = useRef(initialEtag);
  etagRef.current = etag;
  /** Timestamp of last local keystroke — guards against watcher/setContent races. */
  const lastLocalEditRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const lastSaveCompletedAtRef = useRef(0);
  const performSaveRef = useRef<() => Promise<void>>(async () => {});

  const collabExtensionsReady = collabMode && !!collab.collab;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: collabExtensionsReady ? false : undefined,
          codeBlock: false,
          link: false,
          underline: false,
        }),
        ...(collabExtensionsReady && collab.collab
          ? ([
              Collaboration.configure({
                document: collab.collab.doc,
                field: COLLAB_FIELD,
              }),
              CollaborationCaret.configure({
                provider: collab.collab.provider,
                user: { name: "You", color: PRESENCE_COLORS.human },
              }),
            ] as AnyExtension[])
          : []),
        Markdown.configure({
          tightLists: true,
          tightListClass: "tight",
          bulletListMarker: "-",
        }),
        Placeholder.configure({
          placeholder: "Start writing, or let openclaw help…",
        }),
        Underline,
        TaskList,
        TaskItem.configure({ nested: true }),
        CodeBlockLowlight.configure({
          lowlight,
          defaultLanguage: null,
        }),
        TiptapLink.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-brand-500 underline-offset-2 hover:underline",
          },
        }),
        Highlight.configure({
          multicolor: true,
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      immediatelyRender: false,
      content: collabExtensionsReady ? undefined : (initialContent || undefined),
      onUpdate: ({ editor: ed }) => {
        lastLocalEditRef.current = Date.now();
        if (collabMode) {
          collab.updateSectionAwareness(ed);
          return;
        }
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
      },
    },
    [collabExtensionsReady],
  );

  // Bootstrap collab doc from markdown when the Y.Doc is empty after sync.
  useEffect(() => {
    if (!collabMode || !collab.synced || !editor) return;
    bootstrapIfEmptyRef.current(editor);
    updateSectionAwarenessRef.current(editor);
  }, [collabMode, collab.synced, editor]);

  // Remote edit highlight (600ms fade per ui-design.md §9).
  useEffect(() => {
    if (!collabMode || !editor) return;

    const handleTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      if (!isChangeOrigin(transaction as Parameters<typeof isChangeOrigin>[0])) return;
      const root = editor.view.dom.closest(".doc-sheet");
      if (!root) return;
      root.classList.add("remote-edit-flash");
      window.setTimeout(() => root.classList.remove("remote-edit-flash"), 600);
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [collabMode, editor]);

  // Track mouse position via ref for CSS-based visibility.
  const mouseOverTableOrMenu = useRef(false);

  useEffect(() => {
    function handleGlobalMouseMove(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const inTable = !!target.closest(".ProseMirror table");
      const menu = document.querySelector('[data-table-bubble-menu]');
      const inMenu = menu ? menu.contains(target) || target === menu : false;
      mouseOverTableOrMenu.current = inTable || inMenu;
      document.body.classList.toggle("table-menu-visible", inTable || inMenu);
    }

    document.addEventListener("mousemove", handleGlobalMouseMove);
    return () => document.removeEventListener("mousemove", handleGlobalMouseMove);
  }, []);

  // Force-flush on editor blur (Phase 1 only).
  useEffect(() => {
    editor?.on("blur", () => {
      if (collabMode) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      performSave();
    });
  }, [editor, collabMode]);

  // Force-flush on beforeunload.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        // Try to save via sendBeacon if dirty.
        const storage = editor?.storage as unknown as Record<string, unknown>;
        if (storage) {
          const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();
          const data = JSON.stringify({ content: markdown, ifMatch: etag });
          navigator.sendBeacon(`/api/documents/${id}`, data);
        }
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor, id, etag, dirty]);

  const performSave = useCallback(async () => {
    if (!editor) return;
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const storage = editor.storage as unknown as Record<string, unknown>;
    const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();

    // Skip save if content hasn't changed.
    if (markdown === currentContentRef.current && saveStatus.state === "saved") {
      return;
    }

    const savedMarkdown = markdown;
    saveInFlightRef.current = true;
    setSaveStatus({ state: "saving" });

    try {
      const res = await fetch(`/api/documents/${id}`, {
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
          // Overwrite remote changes with local edits.
          const retryRes = await fetch(`/api/documents/${id}`, {
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

        // Stale If-Match from overlapping auto-saves — retry once when disk matches our attempt.
        const serverContent = typeof data.content === "string" ? data.content : "";
        const latest = latestMarkdown.getMarkdown();
        const canAutoRetry =
          !keepMineRef.current &&
          (serverContent === savedMarkdown ||
            isOwnSaveLag(serverContent, latest));

        if (canAutoRetry) {
          const autoRetry = await fetch(`/api/documents/${id}`, {
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
  }, [editor, id, saveStatus.state]);

  performSaveRef.current = performSave;

  const handleSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    performSave();
  }, [performSave]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const sectionParam = collab.activeSectionId
        ? `?section=${encodeURIComponent(collab.activeSectionId)}`
        : "";
      const res = await fetch(`/api/documents/${id}/pdf${sectionParam}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("success", "Export ready");
    } catch {
      showToast("error", "Export failed");
    } finally {
      setExporting(false);
    }
  }, [id, showToast, collab.activeSectionId]);

  // Track mutable values via refs so callbacks don't capture stale state.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const editorRef = useRef(editor);
  editorRef.current = editor;

  // WebSocket client for real-time sync (Phase 1 only).
  useEffect(() => {
    if (collabMode) return;
    const client = new WsClient({
      docId: id,
      callbacks: {
        onDocChanged: async (event) => {
          const isDirty = dirtyRef.current;
          const currentEditor = editorRef.current;

          // Ignore echoes while a save is in flight (watcher can beat the HTTP response).
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

          // Show conflict banner only when disk has a genuine external edit.
          if (event.origin === "server-watcher" && isDirty) {
            try {
              const res = await fetch(`/api/documents/${id}`);
              if (res.ok) {
                const data = await res.json();
                const live = editorMarkdown?.getMarkdown() ?? currentContentRef.current;
                const disk = data.content as string;

                // Own auto-save lag: disk is a prefix of unsaved local edits.
                if (isOwnSaveLag(disk, live)) {
                  setEtag(data.etag);
                  etagRef.current = data.etag;
                  setConflict(null);
                  return;
                }
              }
            } catch {
              // Fall through to conflict banner.
            }
            setConflict("This document was changed elsewhere.");
            return;
          }

          // If not dirty, apply the changes seamlessly.
          if (!isDirty) {
            try {
              const res = await fetch(`/api/documents/${id}`);
              if (res.ok) {
                const data = await res.json();
                // Skip setContent when content hasn't actually changed.
                // setContent rebuilds the ProseMirror doc tree which resets
                // the cursor selection — avoid it when the content is the same.
                const liveMarkdown = editorMarkdown?.getMarkdown();
                if (
                  data.content === currentContentRef.current ||
                  data.content === liveMarkdown
                ) {
                  setEtag(data.etag);
                  etagRef.current = data.etag;
                  return;
                }
                currentContentRef.current = data.content;
                setEtag(data.etag);
                etagRef.current = data.etag;
                currentEditor?.commands.setContent(data.content, { emitUpdate: false });
                setSaveStatus({ state: "saved" });
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
  }, [id, collabMode]); // Only reconnect when doc id changes.

  // Table action handlers.
  const handleAddRowAbove = useCallback(() => {
    editor?.commands.addRowBefore();
  }, [editor]);

  const handleAddRowBelow = useCallback(() => {
    editor?.commands.addRowAfter();
  }, [editor]);

  const handleDeleteRow = useCallback(() => {
    editor?.commands.deleteRow();
  }, [editor]);

  const handleAddColumnBefore = useCallback(() => {
    editor?.commands.addColumnBefore();
  }, [editor]);

  const handleAddColumnAfter = useCallback(() => {
    editor?.commands.addColumnAfter();
  }, [editor]);

  const handleDeleteColumn = useCallback(() => {
    editor?.commands.deleteColumn();
  }, [editor]);

  const handleDeleteTable = useCallback(() => {
    editor?.commands.deleteTable();
  }, [editor]);

  // Status indicators per ui-design.md §6.8.
  const saveIndicator = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        saveStatus.state === "saved"
          ? "text-success"
          : saveStatus.state === "saving"
            ? "text-warning"
            : saveStatus.state === "error"
              ? "text-danger"
              : "text-text-muted"
      }`}
      aria-live="polite"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          saveStatus.state === "saved"
            ? "bg-success"
            : saveStatus.state === "saving"
              ? "animate-pulse bg-warning"
              : saveStatus.state === "error"
                ? "bg-danger"
                : "bg-text-subtle"
        }`}
      />
      {saveStatus.state === "saved"
        ? "Saved"
        : saveStatus.state === "saving"
          ? "Saving…"
          : saveStatus.state === "error"
            ? "Error"
            : "Unsaved"}
    </span>
  );

  const connectionIndicator = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        (collabMode ? collab.status === "connected" : connectionStatus === "connected")
          ? "text-success"
          : (collabMode ? collab.status === "connecting" || collab.status === "reconnecting" : connectionStatus === "reconnecting")
            ? "text-warning"
            : "text-text-subtle"
      }`}
      aria-live="polite"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          (collabMode ? collab.status === "connected" : connectionStatus === "connected")
            ? "bg-success"
            : (collabMode ? collab.status === "connecting" || collab.status === "reconnecting" : connectionStatus === "reconnecting")
              ? "animate-pulse bg-warning"
              : "bg-text-subtle"
        }`}
      />
      {collabMode
        ? collab.status === "connected"
          ? "Collaborative"
          : collab.status === "connecting"
            ? "Connecting…"
            : collab.status === "reconnecting"
              ? "Reconnecting…"
              : "Offline"
        : connectionStatus === "connected"
          ? "Live"
          : connectionStatus === "reconnecting"
            ? "Reconnecting…"
            : "Offline"}
    </span>
  );

  const collabSaveIndicator = (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-success" aria-live="polite">
      <span className="inline-block h-2 w-2 rounded-full bg-success" />
      {collab.synced ? "Synced" : "Syncing…"}
    </span>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Editor topbar */}
      <div className="glass-bar flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Docs
          </Link>
          <span className="text-sm font-medium text-text">{id.replace(/-/g, " ")}</span>
        </div>
        <div className="flex items-center gap-3">
          {collabMode ? collabSaveIndicator : saveIndicator}
          {connectionIndicator}
          {collabMode && (
            <PresenceStack
              provider={collab.collab?.provider ?? null}
              revision={collab.awarenessRevision}
            />
          )}
          <ThemeToggle current={theme} onToggle={toggleTheme} />
          {!collabMode && (
          <button
            onClick={handleSave}
            disabled={saveStatus.state === "saving"}
            className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
          )}
        </div>
      </div>

      {/* Conflict banner */}
      {!collabMode && conflict && (
        <ConflictBanner
          onReload={async () => {
            try {
              const res = await fetch(`/api/documents/${id}`);
              if (res.ok) {
                const data = await res.json();
                setEtag(data.etag);
                etagRef.current = data.etag;
                editorRef.current?.commands.setContent(data.content);
                currentContentRef.current = data.content;
                setSaveStatus({ state: "saved" });
                setDirty(false);
              }
            } catch {
              // Ignore.
            } finally {
              setConflict(null);
              keepMineRef.current = false;
            }
          }}
          onKeepMine={() => {
            keepMineRef.current = true;
            setConflict(null);
          }}
          onDismiss={() => {
            setConflict(null);
          }}
        />
      )}

      {/* Toolbar */}
      <Toolbar editor={editor} onExportPdf={handleExportPdf} exportPdfLoading={exporting} />

      {/* Table bubble menu */}
      {editor && (
        <BubbleMenu className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1 shadow-lg"
          editor={editor}
          shouldShow={() => editor?.isActive("table") ?? false}
          data-table-bubble-menu=""
        >
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleAddRowAbove} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add row above">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="9 8 12 5 15 8" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Row above
            </button>
            <button type="button" onClick={handleAddRowBelow} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add row below">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="15 16 12 19 9 16" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Row below
            </button>
            <button type="button" onClick={handleDeleteRow} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete row" disabled={!editor.can().deleteRow()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Delete row
            </button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={handleAddColumnBefore} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add column before">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="8 9 5 12 8 15" /><line x1="12" y1="5" x2="12" y2="19" /></svg>
              Col before
            </button>
            <button type="button" onClick={handleAddColumnAfter} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add column after">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="16 15 19 12 16 9" /><line x1="12" y1="5" x2="12" y2="19" /></svg>
              Col after
            </button>
            <button type="button" onClick={handleDeleteColumn} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete column" disabled={!editor.can().deleteColumn()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /></svg>
              Delete col
            </button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={handleDeleteTable} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete table">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Delete table
            </button>
          </div>
        </BubbleMenu>
      )}

      {/* Editor surface */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[768px] px-4 py-10 sm:px-8">
          <div className="doc-sheet animate-fade-up rounded-xl px-6 py-12 sm:px-14 sm:py-16">
            {collabMode && (
              <SoftLockHint
                provider={collab.collab?.provider ?? null}
                revision={collab.awarenessRevision}
                activeSectionId={collab.activeSectionId}
              />
            )}
            <style>{`
              .ProseMirror {
                border: none !important;
                outline: none !important;
                border-radius: 0 !important;
                padding: 0 !important;
              }
            `}</style>
            {useVirtualizedLayout && !showFullEditor ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Large document — showing on-screen sections only for performance.
                </p>
                <button
                  type="button"
                  onClick={() => setShowFullEditor(true)}
                  className="text-sm font-medium text-brand-500 hover:text-brand-600"
                >
                  Open full editor
                </button>
                <VirtualizedSectionView sections={parsedSections} />
              </div>
            ) : editor && (!collabMode || collab.synced || !editor.isEmpty) ? (
              <EditorContent editor={editor} />
            ) : (
              <SheetSkeleton />
            )}
            {useVirtualizedLayout && showFullEditor && (
              <button
                type="button"
                onClick={() => setShowFullEditor(false)}
                className="mt-4 text-sm font-medium text-text-muted hover:text-text"
              >
                Back to section view
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
