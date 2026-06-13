/**
 * Collaboration-aware editor wrapper.
 *
 * Connects the Tiptap editor to a shared Y.Doc via Hocuspocus.
 * When the collab feature flag is enabled, replaces the Phase 1
 * load/save path with CRDT-based real-time sync.
 *
 * Usage:
 *   ```tsx
 *   <CollabEditor
 *     documentId={id}
 *     token={WS_TOKEN}
 *     fallbackContent={initialContent}
 *     fallbackEtag={initialEtag}
 *   />
 *   ```
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
import Collaboration from "@tiptap/extension-collaboration";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import type * as Y from "yjs";

import { createCollabProvider, type CollabProvider } from "@/lib/collab/provider";
import { Toolbar } from "./toolbar";
import { WsClient, type ConnectionStatus } from "./ws-client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/ui/theme-provider";

const lowlight = createLowlight(common);

// Presence colors per ui-design.md §2.5.
const COLORS = {
  human: "#4f46e5", // indigo
  agent: "#14b8a6", // teal
};

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Check if Phase 2 collaboration is enabled.
 * Controlled by environment variable or URL param for testing.
 */
function isCollabEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_COLLAB) {
    return process.env.NEXT_PUBLIC_COLLAB === "1";
  }
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.has("collab")) return params.get("collab") === "1";
  }
  return false;
}

// ---------------------------------------------------------------------------
// Editor extensions
// ---------------------------------------------------------------------------

function getExtensions(doc: Y.Doc | null): any[] {
  const extensions: any[] = [
    StarterKit,
    Placeholder.configure({
      placeholder: "Start writing...",
    }),
    Underline,
    TaskList,
    TaskItem,
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: "plaintext",
    }),
    TiptapLink.configure({
      HTMLAttributes: {
        class: "text-indigo-600 dark:text-indigo-400 underline",
      },
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Markdown,
  ];

  if (doc) {
    extensions.push(Collaboration.configure({ document: doc }));
  }

  return extensions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CollabEditorProps {
  /** Document id (filename without .md extension). */
  documentId: string;
  /** WS_TOKEN for authentication. */
  token: string;
  /** Fallback content if collab is disabled or fails. */
  fallbackContent: string;
  /** Fallback ETag for Phase 1 save path. */
  fallbackEtag: string;
}

export function CollabEditor({
  documentId,
  token,
  fallbackContent,
}: CollabEditorProps) {
  const [collabProvider, setCollabProvider] = useState<CollabProvider | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const [isEnabled, setIsEnabled] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const providerRef = useRef<CollabProvider | null>(null);

  // Initialize collab provider.
  useEffect(() => {
    if (!isCollabEnabled()) return;

    setIsEnabled(true);
    const provider = createCollabProvider({
      documentId,
      token,
    });
    providerRef.current = provider;
    setCollabProvider(provider);

    // Track connection status.
    const statusHandler = (event: { status: string }) => {
      setConnectionStatus(event.status as ConnectionStatus);
    };
    provider.provider.on("status", statusHandler);

    return () => {
      provider.provider.off("status", statusHandler);
      provider.destroy();
      providerRef.current = null;
      setCollabProvider(null);
    };
  }, [documentId, token]);

  // Create Tiptap editor with or without collaboration.
  const editor = useEditor({
    extensions: getExtensions(collabProvider?.doc ?? null),
    content: collabProvider ? undefined : fallbackContent,
    autofocus: "end",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none p-4 min-h-[300px] dark:prose-invert max-w-none",
      },
    },
  });

  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-emerald-500"
                : connectionStatus === "reconnecting"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {isEnabled ? (
              connectionStatus === "connected"
                ? "Collaborative"
                : connectionStatus === "reconnecting"
                  ? "Reconnecting..."
                  : "Disconnected"
            ) : (
              "Offline"
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle current={theme} onToggle={toggleTheme} />
        </div>
      </div>

      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
