"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
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

import { Toolbar } from "./toolbar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/ui/theme-provider";
import { useToast } from "@/components/ui/toast";

const lowlight = createLowlight(common);

interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
}

interface EditorProps {
  id: string;
  initialContent: string;
  initialEtag: string;
}

export function Editor({ id, initialContent, initialEtag }: EditorProps) {
  const [etag, setEtag] = useState(initialEtag);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "saved" });
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        codeBlock: false,
      }),
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
    content: initialContent || undefined,
    onUpdate: () => {
      if (saveStatus.state !== "saving") {
        setSaveStatus({ state: "idle" });
      }
    },
  });

  // Track mouse position via ref for CSS-based visibility
  const mouseOverTableOrMenu = useRef(false);

  useEffect(() => {
    function handleGlobalMouseMove(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const inTable = !!target.closest(".ProseMirror table");
      const menu = document.querySelector('[data-table-bubble-menu]');
      const inMenu = menu ? menu.contains(target) || target === menu : false;
      mouseOverTableOrMenu.current = inTable || inMenu;
      
      // Use class on body to survive React re-renders
      document.body.classList.toggle('table-menu-visible', inTable || inMenu);
    }

    document.addEventListener("mousemove", handleGlobalMouseMove);
    return () => document.removeEventListener("mousemove", handleGlobalMouseMove);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor) return;

    setSaveStatus({ state: "saving" });
    setError(null);

    try {
      const storage = editor.storage as unknown as Record<string, unknown>;
      const markdown = (storage.markdown as { getMarkdown: () => string }).getMarkdown();
      const res = await fetch(`/api/documents/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag,
        },
        body: JSON.stringify({ content: markdown }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError(data.error || "Document was modified by another writer");
        setSaveStatus({ state: "error" });
        return;
      }

      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      setEtag(data.etag);
      setSaveStatus({ state: "saved" });
    } catch {
      setError("Failed to save document");
      setSaveStatus({ state: "error" });
    }
  }, [editor, id, etag]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/documents/${id}/pdf`);
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
  }, [id, showToast]);

  // Table action handlers
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Editor topbar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
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
          {saveIndicator}
          <ThemeToggle current={theme} onToggle={toggleTheme} />
          <button
            onClick={handleSave}
            disabled={saveStatus.state === "saving"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-500 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 border-b border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning"
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-warning/70 hover:text-warning focus-visible:rounded focus-visible:ring-2 focus-visible:ring-warning/35"
          >
            Dismiss
          </button>
        </div>
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
        <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-8">
          <div className="rounded-md bg-surface px-6 py-12 shadow-[0_1px_2px_rgba(15,23,42,.06),0_1px_3px_rgba(15,23,42,.10)] sm:px-12">
            <style>{`
              .ProseMirror {
                border: none !important;
                outline: none !important;
                border-radius: 0 !important;
                padding: 0 !important;
              }
            `}</style>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
