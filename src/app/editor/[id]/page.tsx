
import Link from "next/link";
import { Editor } from "@/components/editor/editor";
import type { DocumentContent } from "@/types/document";

async function fetchDocument(id: string): Promise<DocumentContent | null> {
  try {
    const res = await fetch(`http://localhost:3000/api/documents/${id}`, {
      next: { revalidate: 0 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await fetchDocument(id);

  if (!doc) {
    return (
      <NotFound id={id} />
    );
  }

  return (
    <Editor
      id={doc.id}
      initialContent={doc.content}
      initialEtag={doc.etag}
    />
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text">Document not found</h1>
        <p className="mt-2 text-text-muted">The document &ldquo;{id}&rdquo; does not exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-600">
          ← Back to documents
        </Link>
      </div>
    </div>
  );
}
