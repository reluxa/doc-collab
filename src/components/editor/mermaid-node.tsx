"use client";

/**
 * Mermaid decoration plugin — renders mermaid code blocks as inline diagrams.
 *
 * Uses ProseMirror widget decorations to replace mermaid code blocks with
 * the MermaidRenderer component. Non-mermaid blocks render normally via
 * CodeBlockLowlight.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ReactNode } from "react";
import { useState, useCallback, useEffect, useRef, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MermaidRenderer } from "./mermaid-renderer";

// ---------------------------------------------------------------------------
// Root component for the widget (mounted into DOM by the decoration)
// ---------------------------------------------------------------------------

interface MermaidWidgetRootProps {
  source: string;
}

function MermaidWidgetRoot({ source }: MermaidWidgetRootProps) {
  const [showCode, setShowCode] = useState(false);

  const handleToggleView = useCallback((codeView: boolean) => {
    setShowCode(codeView);
  }, []);

  if (showCode) {
    return createElement(
      "div",
      { className: "relative group" },
      createElement(
        "pre",
        { className: "overflow-x-auto rounded-md bg-surface-2 p-4 text-sm" },
        createElement("code", null, source),
      ),
      createElement(
        "button",
        {
          onClick: () => setShowCode(false),
          className:
            "absolute right-2 top-2 rounded p-1 text-text-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-text group-hover:opacity-100 focus:opacity-100",
          "aria-label": "Show diagram preview",
          title: "Show diagram",
        },
        createElement("svg", {
          xmlns: "http://www.w3.org/2000/svg",
          width: 16,
          height: 16,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      ),
    );
  }

  return createElement(MermaidRenderer, {
    source,
    onToggleView: handleToggleView,
    showCode,
  });
}

// ---------------------------------------------------------------------------
// Widget factory — creates DOM element + mounts React
// ---------------------------------------------------------------------------

function createMermaidWidget(source: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "mermaid-widget";
  element.contentEditable = "false";

  const root = createRoot(element);
  root.render(createElement(MermaidWidgetRoot, { source }));

  return element;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/**
 * Tiptap Extension that adds a decoration plugin to render mermaid diagrams
 * inline. Register this after CodeBlockLowlight.
 */
export const MermaidDecoration = Extension.create({
  name: "mermaidDecoration",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addProseMirrorPlugins(): any[] {
    return [
      new Plugin({
        key: new PluginKey("mermaidDecoration"),
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
                // Extract source text from the code block's text child.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const child = (node as any).content?.firstChild as any;
                const source = child?.text?.trim() ?? "";

                // Create the widget DOM element.
                const widgetElement = createMermaidWidget(source);

                decorations.push(
                  Decoration.widget(pos, widgetElement, {
                    // Don't mark as side decoration — we want it inline.
                    side: 1,
                  }),
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

/**
 * Mermaid diagram template for toolbar insertion.
 */
export const MERMAID_TEMPLATE =
  "```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]\n```";

/**
 * Insert a mermaid diagram template at the current cursor position.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function insertMermaidDiagram(editor: any): void {
  editor.chain().focus().insertContent(MERMAID_TEMPLATE).run();
}
