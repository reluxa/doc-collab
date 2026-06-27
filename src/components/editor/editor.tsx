"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { isChangeOrigin } from "@tiptap/extension-collaboration";

import { EditorTopbar } from "./editor-topbar";
import { Toolbar } from "./toolbar";
import { TableBubbleMenu } from "./table-bubble-menu";
import { ConflictBanner } from "./conflict-banner";
import { VersionHistory } from "./version-history";
import { MermaidEditorDialog } from "./mermaid-editor-dialog";
import { buildExtensions } from "./editor-extensions";
import { useDocumentSave } from "./use-document-save";
import { useRealtimeSync } from "./use-realtime-sync";
import { useMermaidEditor } from "./use-mermaid-editor";
import { useVersionHistory } from "./use-version-history";
import { useCollab } from "./use-collab";
import { SoftLockHint } from "./presence-stack";
import { isCollabEnabled } from "@/client/collab-provider";
import { splitMarkdown } from "@/lib/collab/sections";
import {
  VirtualizedSectionView,
  shouldVirtualizeSections,
} from "./virtualized-section-view";
import { SheetSkeleton } from "./sheet-skeleton";
import { useTheme } from "@/components/ui/theme-provider";
import { useToast } from "@/components/ui/toast";

interface EditorProps {
  id: string;
  initialContent: string;
  initialEtag: string;
}

export function Editor({ id, initialContent, initialEtag }: EditorProps) {
  // -- Collab mode detection --
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

  // -- Virtualization layout --
  const parsedSections = useMemo(
    () => splitMarkdown(initialContent),
    [initialContent],
  );
  const useVirtualizedLayout = shouldVirtualizeSections(parsedSections.length);
  const [showFullEditor, setShowFullEditor] = useState(!useVirtualizedLayout);

  // -- Save / persistence hook --
  const save = useDocumentSave({
    documentId: id,
    initialContent,
    initialEtag,
    collabMode,
  });

  // -- Realtime sync hook (WebSocket, non-collab) --
  const { connectionStatus } = useRealtimeSync({
    documentId: id,
    collabMode,
    dirty: save.dirty,
    editorRef: save.editorRef,
    currentContentRef: save.currentContentRef,
    etagRef: save.etagRef,
    saveInFlightRef: save.saveInFlightRef,
    lastLocalEditRef: save.lastLocalEditRef,
    lastSaveCompletedAtRef: save.lastSaveCompletedAtRef,
    onUpdateState: {
      setEtag: (etag: string) => {
        save.etagRef.current = etag;
      },
      setSaveStatus: (state) => save.setSaveStatus({ state }),
      setConflict: (msg) => {
        if (msg) save.setDirty(true);
        // setConflict is internal to the save hook; update via reload
      },
    },
  });

  // -- Mermaid editor hook --
  const mermaid = useMermaidEditor({ editor: save.editorRef.current });

  // -- Version history hook --
  const { showVersionHistory, toggleVersionHistory } = useVersionHistory();

  // -- PDF export --
  const [exporting, setExporting] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  // -- TipTap editor --
  const collabExtensionsReady = collabMode && !!collab.collab;

  const editor = useEditor(
    {
      extensions: buildExtensions({ collabReady: collabExtensionsReady, collab: collab.collab }),
      immediatelyRender: false,
      content: collabExtensionsReady ? undefined : (initialContent || undefined),
      onUpdate: ({ editor: ed }) => {
        save.handleUpdate(ed);
        if (collabMode) {
          collab.updateSectionAwareness(ed);
        }
      },
    },
    [collabExtensionsReady],
  );

  // -- Collab bootstrap --
  useEffect(() => {
    if (!collabMode || !collab.synced || !editor) return;
    bootstrapIfEmptyRef.current(editor);
    updateSectionAwarenessRef.current(editor);
  }, [collabMode, collab.synced, editor]);

  // -- Remote edit flash (collab only) --
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

  // -- PDF export handler --
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

  // -- Status indicator labels --
  const saveVariant = collabMode
    ? (collab.synced ? "synced" : "syncing")
    : save.saveStatus.state;
  const saveLabel = collabMode
    ? (collab.synced ? "Synced" : "Syncing…")
    : save.saveStatus.state === "saved" ? "Saved"
      : save.saveStatus.state === "saving" ? "Saving…"
        : save.saveStatus.state === "error" ? "Error"
          : "Unsaved";

  const connectionVariant = collabMode
    ? (collab.status === "connected" ? "connected"
        : collab.status === "connecting" ? "reconnecting"
          : collab.status === "reconnecting" ? "reconnecting"
            : "offline")
    : connectionStatus;
  const connectionLabel = collabMode
    ? (collab.status === "connected" ? "Collaborative"
        : collab.status === "connecting" ? "Connecting…"
          : collab.status === "reconnecting" ? "Reconnecting…"
            : "Offline")
    : (connectionStatus === "connected" ? "Live"
        : connectionStatus === "reconnecting" ? "Reconnecting…"
          : "Offline");

  // -- Version history restore handler --
  const handleVersionRestored = useCallback(async () => {
    try {
      const r = await fetch(`/api/documents/${id}`);
      const data = await r.json();
      editor?.commands.setContent(data.content, { emitUpdate: false });
      save.etagRef.current = data.etag;
      save.currentContentRef.current = data.content;
      save.setSaveStatus({ state: "saved" });
      save.setDirty(false);
    } catch { /* ignore */ }
    showToast("success", "Version restored");
  }, [id, editor, save, showToast]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Editor topbar */}
      <EditorTopbar
        documentId={id}
        saveVariant={saveVariant}
        saveLabel={saveLabel}
        connectionVariant={connectionVariant}
        connectionLabel={connectionLabel}
        collabMode={collabMode}
        collabProvider={collab.collab?.provider ?? null}
        awarenessRevision={collab.awarenessRevision}
        onToggleVersionHistory={toggleVersionHistory}
        onSave={!collabMode ? save.handleSave : undefined}
        saving={save.saveStatus.state === "saving"}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Conflict banner */}
      {!collabMode && save.conflict && (
        <ConflictBanner
          onReload={async () => {
            if (editor) await save.reloadFromServer(editor);
          }}
          onKeepMine={() => {
            save.setKeepMine();
            save.clearConflict();
          }}
          onDismiss={() => {
            save.clearConflict();
          }}
        />
      )}

      {/* Toolbar */}
      <Toolbar editor={editor} onExportPdf={handleExportPdf} exportPdfLoading={exporting} />

      {/* Table bubble menu */}
      {editor && <TableBubbleMenu editor={editor} />}

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

      {/* Version history modal */}
      <VersionHistory
        documentId={id}
        open={showVersionHistory}
        onClose={toggleVersionHistory}
        onRestored={handleVersionRestored}
      />

      {/* Mermaid editor dialog */}
      <MermaidEditorDialog
        open={mermaid.showMermaidDialog}
        initialSource={mermaid.mermaidSource}
        onClose={mermaid.onClose}
        onSave={mermaid.onSave}
      />
    </div>
  );
}
