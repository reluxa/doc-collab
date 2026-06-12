"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DocumentMeta } from "@/types/document";

export function DocumentList({
  onCreate,
  onDeleted,
}: {
  onCreate: () => void;
  onDeleted: (id: string) => void;
}) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const mounted = useRef(false);

  async function fetchDocs() {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocs(data);
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }

  // Single fetch on mount, using ref guard to avoid React lint warnings.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      fetchDocs();
    }
  }, []);

  async function handleDelete(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    onDeleted(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  function formatModified(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-lg border border-border bg-surface"
          >
            <div className="h-[3px] w-full bg-gradient-to-r from-brand-500 to-brand-300" />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-surface-2" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
              <div className="mt-4 h-px bg-border" />
              <div className="mt-3 flex items-center gap-1.5">
                <div className="h-3 w-3 animate-pulse rounded-full bg-surface-2" />
                <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text">No documents yet</h2>
          <p className="mt-1 text-text-muted">Create your first document to get started.</p>
          <button
            onClick={onCreate}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5v14" />
            </svg>
            New document
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/editor/${doc.id}`}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-brand-100 hover:shadow-[0_4px_12px_rgba(99,102,241,.10),0_1px_3px_rgba(15,23,42,.08)] focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2"
          >
            {/* Top accent bar */}
            <div className="h-[3px] w-full bg-gradient-to-r from-brand-500 to-brand-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

            <div className="flex flex-1 flex-col p-5">
              {/* Icon + Title */}
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 transition-colors duration-200 group-hover:bg-brand-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <h3 className="truncate text-base font-semibold leading-tight text-text group-hover:text-brand-600">
                    {doc.title}
                  </h3>
                </div>
              </div>

              {/* Divider */}
              <div className="mt-4 h-px bg-border" />

              {/* Meta row */}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-text-subtle">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatModified(doc.modifiedAt as unknown as string)}
                </div>
                {/* Delete button - visible on hover */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDelete(doc.id);
                  }}
                  className="rounded-md p-1.5 text-text-subtle opacity-0 transition-all duration-200 hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  aria-label={`Delete ${doc.title}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmDeleteDialog
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </>
  );
}

function ConfirmDeleteDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
      onClick={(e) => e.currentTarget === e.target && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div className="w-full max-w-[480px] rounded-lg bg-surface p-6 shadow-[0_20px_48px_rgba(15,23,42,.24)]">
        <h2 className="text-lg font-semibold text-text">Delete document?</h2>
        <p className="mt-2 text-sm text-text-muted">
          This action cannot be undone. The document will be permanently deleted.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-danger/35"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
// touch Fri Jun 12 11:32:43 CEST 2026
