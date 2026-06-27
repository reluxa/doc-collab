"use client";

import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

interface TableBubbleMenuProps {
  editor: Editor;
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  // Track mouse position via ref for CSS-based visibility.
  useEffect(() => {
    function handleGlobalMouseMove(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const inTable = !!target.closest(".ProseMirror table");
      const menu = document.querySelector('[data-table-bubble-menu]');
      const inMenu = menu ? menu.contains(target) || target === menu : false;
      document.body.classList.toggle("table-menu-visible", inTable || inMenu);
    }

    document.addEventListener("mousemove", handleGlobalMouseMove);
    return () => document.removeEventListener("mousemove", handleGlobalMouseMove);
  }, []);

  return (
    <BubbleMenu
      className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1 shadow-lg"
      editor={editor}
      shouldShow={() => editor?.isActive("table") ?? false}
      data-table-bubble-menu=""
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => editor.commands.addRowBefore()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add row above">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="9 8 12 5 15 8" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Row above
        </button>
        <button type="button" onClick={() => editor.commands.addRowAfter()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add row below">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="15 16 12 19 9 16" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Row below
        </button>
        <button type="button" onClick={() => editor.commands.deleteRow()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete row" disabled={!editor.can().deleteRow()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Delete row
        </button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <button type="button" onClick={() => editor.commands.addColumnBefore()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add column before">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="8 9 5 12 8 15" /><line x1="12" y1="5" x2="12" y2="19" /></svg>
          Col before
        </button>
        <button type="button" onClick={() => editor.commands.addColumnAfter()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text hover:bg-surface-2" aria-label="Add column after">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="16 15 19 12 16 9" /><line x1="12" y1="5" x2="12" y2="19" /></svg>
          Col after
        </button>
        <button type="button" onClick={() => editor.commands.deleteColumn()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete column" disabled={!editor.can().deleteColumn()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /></svg>
          Delete col
        </button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <button type="button" onClick={() => editor.commands.deleteTable()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete table">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          Delete table
        </button>
      </div>
    </BubbleMenu>
  );
}
