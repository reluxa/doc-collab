"use client";

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionMeta {
  version: number;
  timestamp: string;
  trigger: string;
  author: string;
  summary: string;
}

interface VersionRecord extends VersionMeta {
  md: string;
}

interface VersionHistoryProps {
  documentId: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTHOR_COLORS: Record<string, string> = {
  human: "bg-brand-500",
  agent: "bg-agent-500",
  system: "bg-text-subtle",
};

/** Format a relative time string like "2 min ago". */
function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionHistory({
  documentId,
  open,
  onClose,
  onRestored,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<VersionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // Restore handler — defined before useCallback that references it.
  const handleRestore = useCallback(
    async (version: number) => {
      setRestoring(true);
      setRestoringVersion(version);
      try {
        const res = await fetch(
          `/api/documents/${documentId}/versions/${version}/restore`,
          { method: "POST" },
        );
        if (res.ok) {
          onRestored();
          onClose();
        }
      } catch {
        // Ignore.
      } finally {
        setRestoring(false);
        setRestoringVersion(null);
      }
    },
    [documentId, onRestored, onClose],
  );

  // Loading state: true while the modal is open and versions haven't loaded.
  // This avoids calling setState synchronously in an effect.
  const isLoading = open && versions.length === 0 && !loading;

  // Fetch versions when modal opens.
  useEffect(() => {
    if (!open) return;
    fetch(`/api/documents/${documentId}/versions`)
      .then((r) => r.json())
      .then((data) => {
        setVersions(data);
        setLoading(true);
        // Auto-select the most recent version.
        if (data.length > 0) {
          setSelectedVersion(data[0].version);
        }
      })
      .catch(() => {
        setVersions([]);
        setLoading(true);
      });
  }, [open, documentId]);

  // Fetch preview when selection changes.
  useEffect(() => {
    if (selectedVersion === null) return;
    let cancelled = false;
    fetch(`/api/documents/${documentId}/versions/${selectedVersion}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVersion, documentId]);

  // Keyboard handler: arrow keys to navigate, Enter to restore, Esc to close.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = versions.findIndex((v) => v.version === selectedVersion);
        if (idx < 0) return;
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(idx + 1, versions.length - 1)
            : Math.max(idx - 1, 0);
        setSelectedVersion(versions[nextIdx].version);
      }
      if (e.key === "Enter" && selectedVersion !== null) {
        e.preventDefault();
        void handleRestore(selectedVersion);
      }
    },
    [versions, selectedVersion, onClose, handleRestore],
  );

  if (!open) return null;

  const isCurrentVersion = selectedVersion === versions[0]?.version;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
      onClick={(e) => e.currentTarget === e.target && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="flex w-full max-w-5xl animate-fade-up flex-col gap-0 overflow-hidden rounded-lg border border-border bg-surface shadow-[0_20px_48px_rgba(15,23,42,.24)] sm:h-[600px] sm:max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-text">Version History</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-brand-500/35"
            aria-label="Close version history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body — two panels */}
        <div className="flex flex-1 overflow-hidden sm:flex-row">
          {/* Left panel — timeline */}
          <div className="flex flex-col border-r border-border sm:w-[280px] sm:min-w-[280px]">
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-surface-2" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
                        <div className="h-2.5 w-20 animate-pulse rounded bg-surface-2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5" role="listbox" aria-label="Versions">
                  {versions.map((v) => {
                    const isSelected = v.version === selectedVersion;
                    const isCurrent = v.version === versions[0]?.version;
                    return (
                      <button
                        key={v.version}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => setSelectedVersion(v.version)}
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? "bg-brand-50 text-brand-700"
                            : "hover:bg-surface-2 text-text"
                        }`}
                      >
                        {/* Author dot */}
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            AUTHOR_COLORS[v.author] ?? "bg-text-subtle"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">v{v.version}</span>
                            {isCurrent && (
                              <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                                current
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-text-muted">
                            {v.summary} · {formatRelative(v.timestamp)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {versions.length === 0 && !loading && (
                    <p className="px-3 py-6 text-center text-sm text-text-muted">
                      No versions yet
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {preview ? (
              <>
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="font-medium text-text">v{preview.version}</span>
                    <span>·</span>
                    <span>{preview.summary}</span>
                    <span>·</span>
                    <span>{formatRelative(preview.timestamp)}</span>
                  </div>
                  <button
                    onClick={() => handleRestore(preview.version)}
                    disabled={restoring || isCurrentVersion}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/35 ${
                      restoring || isCurrentVersion
                        ? "cursor-not-allowed text-text-subtle"
                        : "bg-brand-500 text-white hover:bg-brand-600"
                    }`}
                  >
                    {restoring && restoringVersion === preview.version
                      ? "Restoring…"
                      : isCurrentVersion
                        ? "Current version"
                        : `Restore v${preview.version}`}
                  </button>
                </div>

                {/* Preview content */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="ProseMirror max-w-none">
                    <MarkdownPreview md={preview.md} />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                Select a version to preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown preview renderer
// ---------------------------------------------------------------------------

/**
 * Simple Markdown preview: render as styled text with basic formatting.
 * For a full Markdown preview in a future story, use a server-side render
 * route or a client-side remark pipeline.
 */
function MarkdownPreview({ md }: { md: string }) {
  const lines = md.split("\n");

  return (
    <div className="space-y-1 font-mono text-sm leading-relaxed text-text">
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith("# ")) {
          return (
            <div key={i} className="mt-4 text-xl font-bold text-text">
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <div key={i} className="mt-3 text-lg font-semibold text-text">
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <div key={i} className="mt-2 text-base font-semibold text-text">
              {line.slice(4)}
            </div>
          );
        }
        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          return <hr key={i} className="my-4 border-border" />;
        }
        // Empty line
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        // Blockquote
        if (line.startsWith("> ")) {
          return (
            <div key={i} className="border-l-2 border-brand-300 pl-3 italic text-text-muted">
              {line.slice(2)}
            </div>
          );
        }
        // Code block
        if (line.startsWith("```")) {
          return (
            <div key={i} className="rounded bg-surface-2 px-3 py-1 font-mono text-xs">
              {line.slice(3)}
            </div>
          );
        }
        // Inline code
        if (line.includes("`")) {
          const parts = line.split(/(`[^`]+`)/g);
          return (
            <div key={i}>
              {parts.map((part, j) =>
                part.startsWith("`") ? (
                  <code key={j} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">
                    {part.slice(1, -1)}
                  </code>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
            </div>
          );
        }
        // Default: plain text
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}
