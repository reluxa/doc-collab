"use client";

type StatusVariant =
  | "saved"
  | "saving"
  | "error"
  | "idle"
  | "connected"
  | "reconnecting"
  | "offline"
  | "synced"
  | "syncing";

const VARIANT_STYLES: Record<StatusVariant, { dot: string; text: string }> = {
  saved: { dot: "bg-success", text: "text-success" },
  synced: { dot: "bg-success", text: "text-success" },
  saving: { dot: "animate-pulse bg-warning", text: "text-warning" },
  syncing: { dot: "animate-pulse bg-warning", text: "text-warning" },
  error: { dot: "bg-danger", text: "text-danger" },
  connected: { dot: "bg-success", text: "text-success" },
  reconnecting: { dot: "animate-pulse bg-warning", text: "text-warning" },
  offline: { dot: "bg-text-subtle", text: "text-text-subtle" },
  idle: { dot: "bg-text-subtle", text: "text-text-muted" },
};

export function StatusDot({ variant, label }: { variant: StatusVariant; label: string }) {
  const { dot, text } = VARIANT_STYLES[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${text}`} aria-live="polite">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
