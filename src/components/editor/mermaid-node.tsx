"use client";

/**
 * Mermaid decoration plugin — renders mermaid code blocks as inline diagrams.
 *
 * Uses ProseMirror widget decorations to replace mermaid code blocks with
 * the rendered SVG. Clicking the diagram opens an edit dialog.
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
// Inline diagram renderer (no toggle — just the SVG + subtle edit indicator)
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

  // Skeleton
  if (rendering) {
    return createElement(
      "div",
      {
        className:
          "flex h-32 w-full cursor-pointer items-center justify-center rounded-md bg-surface-2/60",
      },
      createElement(
        "div",
        { className: "h-4 w-24 animate-pulse rounded bg-surface-3/60" },
      ),
    );
  }

  // Error
  if (error && !svg) {
    return createElement(
      "div",
      {
        className: "cursor-pointer rounded-md border border-danger/20 bg-danger/5 p-3",
      },
      createElement(
        "div",
        {
          className: "text-xs text-danger",
        },
        "⚠ ",
        error,
      ),
    );
  }

  // Rendered diagram with subtle edit indicator on hover
  return createElement(
    "div",
    {
      className: "relative group cursor-pointer",
    },
    createElement(
      "div",
      {
        className: "overflow-auto rounded-md p-4",
        dangerouslySetInnerHTML: { __html: svg! },
      },
    ),
    // Subtle edit indicator (pencil icon) on hover
    createElement(
      "div",
      {
        className:
          "pointer-events-none absolute right-2 top-2 rounded bg-surface/80 p-1.5 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100",
      },
      createElement(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: 14,
          height: 14,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
        createElement("path", {
          d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Edit callback registry (global, shared across widget instances)
// ---------------------------------------------------------------------------

let currentEditHandler: ((source: string, pos: number) => void) | null = null;

export function setMermaidEditHandler(
  handler: (source: string, pos: number) => void,
): void {
  currentEditHandler = handler;
}

// ---------------------------------------------------------------------------
// Widget factory with cache (prevents flicker — avoids recreating React roots)
// ---------------------------------------------------------------------------

interface CachedWidget {
  element: HTMLElement;
  root: ReturnType<typeof createRoot>;
  source: string;
  pos: number; // track position for cleanup
}

const widgetCache = new Map<string, CachedWidget>();

function getOrCreateWidget(pos: number, source: string, existingEl?: HTMLElement): HTMLElement {
  // If we have an existing element from a previous decoration, try to reuse it
  if (existingEl) {
    const key = existingEl.getAttribute('data-widget-key');
    if (key) {
      const cached = widgetCache.get(key);
      if (cached) {
        if (cached.source !== source) {
          cached.source = source;
          cached.pos = pos;
          cached.root.render(createElement(MermaidWidgetRoot, { source }));
        } else {
          cached.pos = pos;
        }
        existingEl.dataset.pos = String(pos);
        return existingEl;
      }
    }
  }

  const element = document.createElement("div");
  element.className = "mermaid-widget";
  element.contentEditable = "false";
  element.dataset.pos = String(pos);
  const key = `mermaid-widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  element.dataset.widgetKey = key;

  const root = createRoot(element);
  root.render(createElement(MermaidWidgetRoot, { source }));

  widgetCache.set(key, { element, root, source, pos });
  return element;
}

// ---------------------------------------------------------------------------
// Cleanup: remove cache entries when widgets are removed from DOM
// ---------------------------------------------------------------------------

function initCacheCleanup(view: EditorView) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removed of mutation.removedNodes) {
        const widget = removed as Node;
        if (
          widget.nodeType === Node.ELEMENT_NODE &&
          (widget as HTMLElement).classList.contains("mermaid-widget")
        ) {
          const key = (widget as HTMLElement).dataset.widgetKey;
          if (key) {
            const cached = widgetCache.get(key);
            if (cached) {
              cached.root.unmount();
              widgetCache.delete(key);
            }
          }
        }
      }
    }
  });
  observer.observe(view.dom, { childList: true, subtree: true });
  // Return a PluginView to satisfy the type requirement
  return { destroy: () => observer.disconnect() };
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        view: initCacheCleanup,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: {
          decorations(state: any): DecorationSet {
            const { doc } = state;
            const decorations: any[] = [];

            doc.descendants((node: ProseMirrorNode, pos: number) => {
              if (
                node.type.name === "codeBlock" &&
                (node.attrs as Record<string, unknown>)?.language === "mermaid"
              ) {
                const child = (node as any).content?.firstChild as any;
                const source = child?.text?.trim() ?? "";
                const widgetElement = getOrCreateWidget(pos, source);

                decorations.push(
                  Decoration.widget(pos, widgetElement, { side: 1 }),
                );
              }
            });

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
                // Read the source from the current document state
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
