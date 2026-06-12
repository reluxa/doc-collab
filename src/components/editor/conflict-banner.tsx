"use client";

/**
 * Non-modal conflict banner shown when a remote change arrives
 * while the editor has unsaved local edits.
 *
 * Per ui-design.md §6.11: warning tone (amber), anchored under toolbar,
 * offers Reload (discard mine) / Keep mine (overwrite on next save).
 */

export function ConflictBanner({
  onReload,
  onKeepMine,
  onDismiss,
}: {
  onReload: () => void;
  onKeepMine: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-b border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex-1">
        <span className="font-medium">This document was changed elsewhere.</span>
        <p className="mt-0.5 text-xs text-warning/80">
          You have unsaved edits. Choose to reload the latest version or keep
          your changes (they will overwrite remote changes on next save).
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onReload}
          className="rounded-md border border-warning/30 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-warning/35"
        >
          Reload
        </button>
        <button
          onClick={onKeepMine}
          className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-yellow-600 focus-visible:ring-2 focus-visible:ring-warning/35"
        >
          Keep mine
        </button>
        <button
          onClick={onDismiss}
          className="ml-1 text-warning/60 hover:text-warning"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
