"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { setMermaidEditHandler } from "./mermaid-node";

interface UseMermaidEditorOptions {
  editor: Editor | null;
}

interface UseMermaidEditorResult {
  showMermaidDialog: boolean;
  mermaidSource: string;
  mermaidIsNew: boolean;
  mermaidEditPos: number | null;
  onClose: () => void;
  onSave: (newSource: string) => void;
}

export function useMermaidEditor({ editor }: UseMermaidEditorOptions): UseMermaidEditorResult {
  const [showMermaidDialog, setShowMermaidDialog] = useState(false);
  const [mermaidSource, setMermaidSource] = useState("");
  const [mermaidIsNew, setMermaidIsNew] = useState(false);
  const [mermaidEditPos, setMermaidEditPos] = useState<number | null>(null);

  const onClose = useCallback(() => {
    setShowMermaidDialog(false);
  }, []);

  // Wire up the mermaid edit handler used by decoration widgets.
  useEffect(() => {
    setMermaidEditHandler((source: string, pos: number) => {
      setMermaidSource(source);
      setMermaidEditPos(pos);
      setMermaidIsNew(false);
      setShowMermaidDialog(true);
    });
  }, []);

  // Listen for toolbar-initiated new diagram creation.
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setMermaidSource(e.detail.source);
      setMermaidIsNew(true);
      setShowMermaidDialog(true);
    };
    window.addEventListener("mermaid:new", handler as EventListener);
    return () => window.removeEventListener("mermaid:new", handler as EventListener);
  }, []);

  const onSave = useCallback((newSource: string) => {
    setShowMermaidDialog(false);
    if (!editor) return;

    if (mermaidIsNew || mermaidEditPos === null) {
      const fullContent = "```mermaid\n" + newSource + "```";
      editor.chain().focus().insertContent(fullContent).run();
      return;
    }

    const { view } = editor;
    const { state } = view;
    const { tr } = state;
    const targetPos = mermaidEditPos;

    state.doc.descendants((node: any, pos: number) => {
      if (
        pos === targetPos &&
        node.type.name === "codeBlock" &&
        node.attrs?.language === "mermaid"
      ) {
        const newText = state.schema.text(newSource);
        tr.replaceWith(pos + 1, pos + node.nodeSize - 1, newText);
        return false;
      }
      return true;
    });

    view.dispatch(tr);
    setMermaidEditPos(null);
  }, [editor, mermaidIsNew, mermaidEditPos]);

  return {
    showMermaidDialog,
    mermaidSource,
    mermaidIsNew,
    mermaidEditPos,
    onClose,
    onSave,
  };
}
