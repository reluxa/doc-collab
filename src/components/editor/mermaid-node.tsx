"use client";

/**
 * Mermaid code block extension — renders mermaid diagrams inline in the editor.
 *
 * This extension registers a custom nodeView for the `code_block` node type.
 * When a code block has `language === "mermaid"`, it renders the diagram.
 * For all other languages, it returns null to let the default view handle it.
 *
 * Register this extension AFTER CodeBlockLowlight so its nodeView takes
 * precedence for mermaid blocks.
 */

import { Extension } from "@tiptap/core";
import { useState, useCallback, createElement } from "react";
import { MermaidRenderer } from "./mermaid-renderer";

// ---------------------------------------------------------------------------
// React component for the mermaid nodeView
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MermaidNodeViewComponent(props: Record<string, any>) {
  const { node } = props;

  const language = node.attrs?.language ?? null;
  const isMermaid = language === "mermaid";

  if (!isMermaid) {
    return null; // Let the default code block view handle this.
  }

  // Extract source text from the code block's text child.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child = (node as any).content?.firstChild as any;
  const source = child?.text?.trim() ?? "";

  const [showCode, setShowCode] = useState(false);

  const handleToggleView = useCallback((codeView: boolean) => {
    setShowCode(codeView);
  }, []);

  // Source code view.
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
// Extension — wraps code_block with mermaid-aware nodeView
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getReactNodeViewRenderer = (): any => {
  // Dynamic import to ensure @tiptap/react is loaded in the correct context.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ReactNodeViewRenderer } = require("@tiptap/react") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ReactNodeViewRenderer(MermaidNodeViewComponent as any) as any;
};

/**
 * Tiptap Extension that registers a mermaid-aware nodeView for code_block.
 *
 * Register this after CodeBlockLowlight. For non-mermaid code blocks,
 * the component returns null, which falls through to the default view.
 */
export const MermaidCodeBlock = Extension.create({
  name: "mermaidCodeBlock",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addProseMirrorPlugins(): any[] {
    const nodeView = getReactNodeViewRenderer();

    return [
      {
        name: this.name,
        props: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeViews: { code_block: nodeView as any },
        },
      },
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
