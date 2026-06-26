"use client";

import dynamic from "next/dynamic";

const EditorInner = dynamic(
  () => import("@/components/editor/editor").then((m) => m.Editor),
  { ssr: false },
);

// Re-export the same props the original Editor component expects.
interface DynamicEditorProps {
  id: string;
  initialContent: string;
  initialEtag: string;
}

export function DynamicEditor({ id, initialContent, initialEtag }: DynamicEditorProps) {
  return (
    <EditorInner id={id} initialContent={initialContent} initialEtag={initialEtag} />
  );
}
