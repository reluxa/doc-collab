/** Minimum section count before virtualized rendering (Story 14). */
export const SECTION_VIRTUALIZE_THRESHOLD = 20;

interface SheetSkeletonProps {
  lines?: number;
}

/** Editor sheet loading skeleton per ui-design.md §6.13. */
export function SheetSkeleton({ lines = 8 }: SheetSkeletonProps) {
  return (
    <div
      className="space-y-3 motion-reduce:animate-none"
      role="status"
      aria-label="Loading document"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-surface-2 animate-pulse motion-reduce:animate-none"
          style={{ width: `${Math.max(40, 100 - i * 8)}%` }}
        />
      ))}
    </div>
  );
}

interface SectionPlaceholderProps {
  heading: string;
  loading?: boolean;
}

/** Placeholder for an off-screen section (lazy load). */
export function SectionPlaceholder({ heading, loading }: SectionPlaceholderProps) {
  return (
    <div
      className="min-h-[6rem] rounded-lg border border-dashed border-border/60 px-4 py-6"
      aria-hidden={!loading}
    >
      {loading ? (
        <SheetSkeleton lines={4} />
      ) : (
        <p className="text-xs font-medium text-text-muted">{heading || "Section"}</p>
      )}
    </div>
  );
}
