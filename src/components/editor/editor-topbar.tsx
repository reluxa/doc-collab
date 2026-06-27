"use client";

import Link from "next/link";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PresenceStack } from "./presence-stack";
import { StatusDot } from "./status-indicators";

interface EditorTopbarProps {
  documentId: string;
  /** "saved" | "saving" | "error" | "idle" */
  saveVariant: string;
  saveLabel: string;
  /** "connected" | "reconnecting" | "offline" | "synced" | "syncing" */
  connectionVariant: string;
  connectionLabel: string;
  collabMode: boolean;
  collabProvider: HocuspocusProvider | null;
  awarenessRevision: number;
  onToggleVersionHistory: () => void;
  onSave?: () => void;
  saving: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function EditorTopbar({
  documentId,
  saveVariant,
  saveLabel,
  connectionVariant,
  connectionLabel,
  collabMode,
  collabProvider,
  awarenessRevision,
  onToggleVersionHistory,
  onSave,
  saving,
  theme,
  onToggleTheme,
}: EditorTopbarProps) {
  return (
    <div className="glass-bar flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-brand-500/35"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Docs
        </Link>
        <span className="text-sm font-medium text-text">{documentId.replace(/-/g, " ")}</span>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot variant={saveVariant as any} label={saveLabel} />
        <StatusDot variant={connectionVariant as any} label={connectionLabel} />
        {collabMode && (
          <PresenceStack
            provider={collabProvider}
            revision={awarenessRevision}
          />
        )}
        <ThemeToggle current={theme} onToggle={onToggleTheme} />
        <button
          onClick={onToggleVersionHistory}
          className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-brand-500/35"
          aria-label="Version history (Ctrl+Shift+H)"
          title="Version history (Ctrl+Shift+H)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
        {!collabMode && onSave && (
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500/35"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
        )}
      </div>
    </div>
  );
}
