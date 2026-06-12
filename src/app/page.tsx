"use client";

import { useState, useCallback } from "react";
import { DocumentList } from "@/components/documents/document-list";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/ui/theme-provider";
import { useToast } from "@/components/ui/toast";

export default function HomePage() {
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocId, setNewDocId] = useState("");
  const [creating, setCreating] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const handleCreate = useCallback(async () => {
    const id = newDocId.trim().replace(/\s+/g, "-").toLowerCase();
    if (!id) return;

    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: `# ${id.replace(/-/g, " ")}\n` }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast("error", data.error || "Failed to create document");
        return;
      }

      showToast("success", "Document created");
      setNewDocId("");
      setShowNewDoc(false);
      // Force a re-render by navigating to the new doc
      window.location.href = `/editor/${id}`;
    } catch {
      showToast("error", "Failed to create document");
    } finally {
      setCreating(false);
    }
  }, [newDocId, showToast]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Topbar */}
      <header className="glass-bar sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="accent-bar flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-[0_4px_10px_-2px_rgba(99,102,241,.5)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </span>
          <span className="gradient-text text-sm font-bold tracking-tight">doc-collab</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle current={theme} onToggle={toggleTheme} />
          <button
            onClick={() => setShowNewDoc(true)}
            className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5v14" />
            </svg>
            New
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text">Documents</h1>
              <p className="mt-0.5 text-sm text-text-muted">Your collaborative workspace</p>
            </div>
          </div>
          <DocumentList
            onCreate={() => setShowNewDoc(true)}
            onDeleted={() => showToast("success", "Document deleted")}
          />
        </div>
      </main>

      {/* New document dialog */}
      {showNewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={(e) => e.currentTarget === e.target && setShowNewDoc(false)}
          role="dialog"
          aria-modal="true"
          aria-label="New document"
        >
          <div className="animate-fade-up w-full max-w-[480px] rounded-lg border border-border bg-surface p-6 shadow-[0_20px_48px_rgba(15,23,42,.24)]">
            <h2 className="text-lg font-semibold text-text">New document</h2>
            <p className="mt-1 text-sm text-text-muted">Enter a name for your document.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
            >
              <div className="mt-4">
                <label htmlFor="doc-name" className="mb-1 block text-sm font-medium text-text">
                  Document name
                </label>
                <input
                  id="doc-name"
                  type="text"
                  value={newDocId}
                  onChange={(e) => setNewDocId(e.target.value)}
                  placeholder="my-new-document"
                  className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/35"
                  autoFocus
                />
                <p className="mt-1 text-xs text-text-subtle">
                  Only letters, numbers, hyphens, and underscores.
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewDoc(false)}
                  className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-500/35"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newDocId.trim()}
                  className="btn-primary rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
