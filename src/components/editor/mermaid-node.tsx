"use client";

/**
 * Mermaid decoration plugin — renders mermaid code blocks as inline diagrams.
 *
 * Uses ProseMirror widget decorations with stable sequential keys so
 * ProseMirror can reuse widget DOM elements across decoration recalculations.
 * Clicking the diagram opens an edit dialog.
 * Non-mermaid blocks render normally via CodeBlockLowlight.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  renderMermaidToSvg,
  MERMAID_MAX_SOURCE_BYTES,
} from "@/lib/mermaid";

// ---------------------------------------------------------------------------
// Inline diagram renderer
// ---------------------------------------------------------------------------

interface MermaidWidgetRootProps {
  source: string;
}

function MermaidWidgetRoot({ source }: MermaidWidgetRootProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const sourceRef = useRef(source);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  const render = useCallback(async (src: string) => {
    if (src !== sourceRef.current) return;
    const byteLength = new TextEncoder().encode(src).byteLength;
    if (byteLength > MERMAID_MAX_SOURCE_BYTES) {
      setError(`Diagram too large (${byteLength} bytes)`);
      setSvg(null);
      setRendering(false);
      return;
    }
    abortRef.current = false;
    setRendering(true);
    setError(null);
    try {
      const rendered = await renderMermaidToSvg(src);
      if (!abortRef.current) setSvg(rendered);
    } catch (err: unknown) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        setSvg(null);
      }
    } finally {
      if (!abortRef.current) setRendering(false);
    }
  }, []);

  useEffect(() => {
    sourceRef.current = source;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => render(source), 300);
    return () => {
      abortRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [source, render]);

  if (rendering) {
    return createElement("div", {
      className: "flex h-32 w-full cursor-pointer items-center justify-center rounded-md bg-surface-2/60",
    }, createElement("div", { className: "h-4 w-24 animate-pulse rounded bg-surface-3/60" }));
  }

  if (error && !svg) {
    return createElement("div", {
      className: "cursor-pointer rounded-md border border-danger/20 bg-danger/5 p-3",
    }, createElement("div", { className: "text-xs text-danger" }, "⚠ ", error));
  }

  return createElement(
    "div",
    { className: "relative group cursor-pointer" },
    createElement("div", {
      className: "overflow-auto rounded-md p-4",
      dangerouslySetInnerHTML: { __html: svg! },
    }),
    // Pencil icon on hover
    createElement(
      "div",
      {
        className: "pointer-events-none absolute right-2 top-2 rounded bg-surface/80 p-1.5 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100",
      },
      createElement(
        "svg",
        { xmlns: "http://www.w3.org/2000/svg", width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        createElement("path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Edit callback registry
// ---------------------------------------------------------------------------

let currentEditHandler: ((source: string, pos: number) => void) | null = null;

export function setMermaidEditHandler(
  handler: (source: string, pos: number) => void,
): void {
  currentEditHandler = handler;
}

// ---------------------------------------------------------------------------
// Stable widget pool — indexed by sequential appearance order, NOT position.
// This allows ProseMirror to reuse widget DOM elements when positions shift.
// ---------------------------------------------------------------------------

interface PooledWidget {
  element: HTMLElement;
  root: ReturnType<typeof createRoot>;
  currentSource: string;
}

const widgetPool: PooledWidget[] = [];

function getOrCreatePooledWidget(idx: number, source: string): HTMLElement {
  let pooled = widgetPool[idx];
  if (!pooled) {
    const element = document.createElement("div");
    element.className = "mermaid-widget";
    element.contentEditable = "false";

    const root = createRoot(element);
    root.render(createElement(MermaidWidgetRoot, { source }));

    pooled = { element, root, currentSource: source };
    widgetPool[idx] = pooled;
  } else if (pooled.currentSource !== source) {
    pooled.currentSource = source;
    pooled.root.render(createElement(MermaidWidgetRoot, { source }));
  }

  return pooled.element;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const MermaidDecoration = Extension.create({
  name: "mermaidDecoration",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addProseMirrorPlugins(): any[] {
    return [
      new Plugin({
        key: new PluginKey("mermaidDecoration"),
        props: {
          decorations(state: any): DecorationSet {
            const { doc } = state;
            const decorations: any[] = [];
            let mermaidIdx = 0;

            doc.descendants((node: ProseMirrorNode, pos: number) => {
              if (
                node.type.name === "codeBlock" &&
                (node.attrs as Record<string, unknown>)?.language === "mermaid"
              ) {
                const child = (node as any).content?.firstChild as any;
                const source = child?.text?.trim() ?? "";
                const element = getOrCreatePooledWidget(mermaidIdx, source);

                // Set position on the element so click handler can find it
                element.dataset.pos = String(pos);

                // Stable key = sequential index, so ProseMirror reuses the DOM
                // even when the codeBlock's document position shifts.
                decorations.push(
                  Decoration.widget(pos, element, {
                    side: 1,
                    key: `mermaid-pool-${mermaidIdx}`,
                  }),
                );

                mermaidIdx++;
              }
            });

            // Trim excess pooled widgets (blocks were deleted)
            while (widgetPool.length > mermaidIdx) {
              const old = widgetPool.pop();
              if (old) old.root.unmount();
            }

            return DecorationSet.create(doc, decorations);
          },
          handleDOMEvents: {
            mousedown: (_view: EditorView, event: MouseEvent) => {
              const target = event.target as HTMLElement;
              const widgetEl = target.closest(".mermaid-widget") as HTMLElement | null;
              if (widgetEl) {
                event.preventDefault();
                event.stopPropagation();
                const pos = Number(widgetEl.dataset.pos);
                const { state } = _view;
                let source = "";
                state.doc.descendants((node: ProseMirrorNode, nodePos: number) => {
                  if (
                    nodePos === pos &&
                    node.type.name === "codeBlock" &&
                    (node.attrs as Record<string, unknown>)?.language === "mermaid"
                  ) {
                    const child = (node as any).content?.firstChild as any;
                    source = child?.text?.trim() ?? "";
                    return false;
                  }
                  return true;
                });
                currentEditHandler?.(source, pos);
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

export const MERMAID_TEMPLATE =
  "```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]\n```";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function insertMermaidDiagram(editor: any): void {
  editor.chain().focus().insertContent(MERMAID_TEMPLATE).run();
}
