"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DocumentMeta } from "@/types/document";

function PreviewImage({
  previewUrl,
  title,
  onError,
}: {
  previewUrl: string | null;
  title: string;
  onError: () => void;
}) {
  // When previewUrl is null or falsy, show the gradient placeholder.
  if (!previewUrl) {
    return <PlaceholderPreview />;
  }

  return (
    <img
      src={previewUrl}
      alt={`Preview of ${title}`}
      loading="lazy"
      decoding="async"
      onError={onError}
      className="h-full w-full object-cover object-top transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.03]"
    />
  );
}

function PlaceholderPreview() {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600">
      {/* Soft top-left light bloom */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 120% at 25% 15%, rgba(255,255,255,.28), transparent 55%)",
        }}
      />
      {/* Subtle oversized glyph bleed at one corner for texture */}
      <svg
        className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/5"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      {/* Centered document glyph */}
      <svg
        className="relative h-9 w-9 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,.18)]"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

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
  const [erroredPreviews, setErroredPreviews] = useState<Set<string>>(new Set());
  const mounted = useRef(false);

  const handleImageError = useCallback((id: string) => {
    setErroredPreviews((prev) => new Set(prev).add(id));
  }, []);

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
            {/* Preview shimmer — 4:3 aspect ratio */}
            <div className="aspect-[4/3] w-full animate-pulse bg-surface-2" />
            <div className="p-5">
              <div className="space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
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
          <div className="accent-bar mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-[0_10px_24px_-6px_rgba(99,102,241,.55)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text">No documents yet</h2>
          <p className="mt-1 text-text-muted">Create your first document to get started.</p>
          <button
            onClick={onCreate}
            className="btn-primary mt-4 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
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
        {docs.map((doc, i) => {
          const hasPreview =
            doc.previewUrl && !erroredPreviews.has(doc.id);

          return (
            <Link
              key={doc.id}
              href={`/editor/${doc.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              className="group animate-fade-up relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-e1)] transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-brand-300/60 hover:shadow-[0_12px_28px_-8px_rgba(99,102,241,.30)] focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2"
            >
              {/* Preview area — full-bleed at top, 4:3 aspect ratio */}
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                {/* Inset hairline in light mode */}
                <div className="pointer-events-none absolute inset-0 z-10 rounded-t-lg ring-1 ring-inset ring-black/[.06] dark:ring-0" />

                <PreviewImage
                  previewUrl={hasPreview ? doc.previewUrl : null}
                  title={doc.title}
                  onError={() => handleImageError(doc.id)}
                />
              </div>

              {/* Brand seam at the base of the preview */}
              <div className="h-[2px] w-full bg-gradient-to-r from-brand-500 to-brand-300 opacity-60 transition-opacity duration-200 group-hover:opacity-100" />

              {/* Card body — no icon tile, just title + meta */}
              <div className="flex flex-1 flex-col p-5 pt-4">
                <h3 className="truncate text-base font-semibold leading-tight text-text group-hover:text-brand-600">
                  {doc.title}
                </h3>

                {/* Divider */}
                <div className="mt-4 h-px bg-border" />

                {/* Meta row */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-text-subtle">
                    <div className="flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {formatModified(doc.modifiedAt as unknown as string)}
                    </div>
                    {doc.versionCount && doc.versionCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                        v{doc.versionCount}
                      </span>
                    )}
                  </div>
                  {/* Delete button — visible on hover */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmDelete(doc.id);
                    }}
                    className="rounded-md p-1.5 text-text-subtle opacity-0 transition-all duration-200 hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    aria-label={`Delete ${doc.title}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </Link>
          );
        })}
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
