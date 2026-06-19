"use client";

import type { Editor } from "@tiptap/react";
import { MERMAID_TEMPLATE } from "./mermaid-node";

interface ToolbarProps {
  editor: Editor | null;
  onExportPdf?: () => void;
  exportPdfLoading?: boolean;
}

function Toggle({
  active,
  command,
  title,
  children,
}: {
  active?: boolean;
  command: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        command();
      }}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-brand-500/35 ${
        active ? "bg-brand-50 text-brand-500" : ""
      }`}
      aria-pressed={active ?? false}
      aria-label={title}
      title={title}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}

export function Toolbar({ editor, onExportPdf, exportPdfLoading }: ToolbarProps) {
  if (!editor) return null;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-4 py-1.5 shadow-[0_4px_12px_rgba(15,23,42,.10)]">
      {/* Headings */}
      <Toggle
        active={editor.isActive("heading", { level: 1 })}
        command={() => editor.chain().focus().setHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <span className="font-bold text-sm leading-none">H1</span>
      </Toggle>
      <Toggle
        active={editor.isActive("heading", { level: 2 })}
        command={() => editor.chain().focus().setHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <span className="font-bold text-sm leading-none">H2</span>
      </Toggle>
      <Toggle
        active={editor.isActive("heading", { level: 3 })}
        command={() => editor.chain().focus().setHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <span className="font-bold text-sm leading-none">H3</span>
      </Toggle>

      <Separator />

      {/* Text formatting */}
      <Toggle
        active={editor.isActive("bold")}
        command={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("italic")}
        command={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" />
          <line x1="14" y1="20" x2="5" y2="20" />
          <line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("underline")}
        command={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
          <line x1="4" y1="21" x2="20" y2="21" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("strike")}
        command={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="20" y2="12" />
          <path d="M17.5 7.5c0-2-1.5-3.5-5.5-3.5s-5.5 1.5-5.5 3.5 4 3 5.5 3" />
          <path d="M6.5 16.5c0 2 1.5 3.5 5.5 3.5s5.5-1.5 5.5-3.5-4-3-5.5-3" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("code")}
        command={() => editor.chain().focus().toggleCode().run()}
        title="Inline code"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </Toggle>

      <Separator />

      {/* Lists */}
      <Toggle
        active={editor.isActive("bulletList")}
        command={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("orderedList")}
        command={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontWeight="600">1</text>
          <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="600">2</text>
          <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontWeight="600">3</text>
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("taskList")}
        command={() => editor.chain().focus().toggleTaskList().run()}
        title="Task list"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1" />
          <path d="m5 7.5 1.5 1.5 3-3" />
          <line x1="12" y1="8" x2="21" y2="8" />
          <rect x="3" y="13" width="6" height="6" rx="1" />
          <line x1="12" y1="16" x2="21" y2="16" />
        </svg>
      </Toggle>

      <Separator />

      {/* Blocks */}
      <Toggle
        active={editor.isActive("blockquote")}
        command={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("codeBlock")}
        command={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <polyline points="9 10 7.5 12.5 9 15" />
          <polyline points="15 10 16.5 12.5 15 15" />
        </svg>
      </Toggle>
      <Toggle
        command={() => {
          // Dispatch event to open the mermaid editor dialog with a template.
          const template = MERMAID_TEMPLATE.replace(/```mermaid\n/, "").replace(/```$/, "");
          window.dispatchEvent(
            new CustomEvent("mermaid:new", { detail: { source: template } }),
          );
        }}
        title="Mermaid diagram"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" />
        </svg>
      </Toggle>
      <Toggle
        command={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert table"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
      </Toggle>
      <Toggle
        command={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </Toggle>

      <Separator />

      {/* Insert */}
      <Toggle
        active={editor.isActive("link")}
        command={() => {
          const url = prompt("Enter URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        title="Insert link"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </Toggle>
      <Toggle
        active={editor.isActive("highlight")}
        command={() => editor.chain().focus().toggleHighlight().run()}
        title="Highlight"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
      </Toggle>

      <div className="ml-auto" />

      {/* Export PDF */}
      {onExportPdf && (
        <button
          onClick={onExportPdf}
          disabled={exportPdfLoading}
          className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
          title="Export PDF"
          aria-label="Export PDF"
        >
          {exportPdfLoading ? (
            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
          {exportPdfLoading ? "Rendering…" : "Export PDF"}
        </button>
      )}
    </div>
  );
}
