import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { MermaidDecoration } from "./mermaid-node";
import TiptapLink from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { CollabProvider } from "@/client/collab-provider";
import { COLLAB_FIELD } from "@/lib/collab/constants";
import { PRESENCE_COLORS } from "@/client/collab-provider";

const lowlight = createLowlight(common);

interface BuildExtensionsOptions {
  collabReady: boolean;
  collab: CollabProvider | null;
}

/** Build the TipTap extensions array. Pure function — safe to call outside React. */
export function buildExtensions({ collabReady, collab }: BuildExtensionsOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: collabReady ? false : undefined,
      codeBlock: false,
      link: false,
      underline: false,
    }),
    ...(collabReady && collab
      ? ([
          Collaboration.configure({
            document: collab.doc,
            field: COLLAB_FIELD,
          }),
          CollaborationCaret.configure({
            provider: collab.provider,
            user: { name: "You", color: PRESENCE_COLORS.human },
          }),
        ] as AnyExtension[])
      : []),
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
    MermaidDecoration,
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
  ];
}
