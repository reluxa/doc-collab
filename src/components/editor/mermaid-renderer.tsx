"use client";

/**
 * Renders a Mermaid diagram as inline SVG with source toggle.
 *
 * Displays the rendered diagram by default. Falls back to a syntax-highlighted
 * code block when rendering fails. A toggle button (</> icon) lets users switch
 * between rendered diagram and source code view.
 *
 * Uses lazy `import("mermaid")` to keep the library out of the initial bundle.
 * Re-renders are debounced (300ms) and cached (60s).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  renderMermaidToSvg,
  MERMAID_MAX_SOURCE_BYTES,
  clearRenderCache,
} from "@/lib/mermaid";

export interface MermaidRendererProps {
  /** Raw mermaid source string (e.g. "graph TD; A-->B"). */
  source: string;
  /** Called when the user toggles between diagram/code view. */
  onToggleView?: (showCode: boolean) => void;
  /** Whether to show the source code view instead of the diagram. */
  showCode?: boolean;
}

// Skeleton placeholder — shown while rendering.
function Skeleton() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-md bg-surface-2/60">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-3/60" />
    </div>
  );
}

// Error banner — shown when mermaid parse fails.
function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
      role="alert"
    >
      <span className="font-medium">Diagram error:</span> {message}
    </div>
  );
}

export function MermaidRenderer({
  source,
  onToggleView,
  showCode = false,
}: MermaidRendererProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const sourceRef = useRef(source);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  // Debounced re-render when source changes.
  const render = useCallback(async (src: string) => {
    // Skip if source changed while we were waiting.
    if (src !== sourceRef.current) return;

    // Skip if source exceeds max length.
    const byteLength = new TextEncoder().encode(src).byteLength;
    if (byteLength > MERMAID_MAX_SOURCE_BYTES) {
      setError(`Diagram too large (${byteLength} bytes, max ${MERMAID_MAX_SOURCE_BYTES})`);
      setSvg(null);
      setRendering(false);
      return;
    }

    abortRef.current = false;
    setRendering(true);
    setError(null);

    try {
      const rendered = await renderMermaidToSvg(src);
      if (!abortRef.current) {
        setSvg(rendered);
      }
    } catch (err: unknown) {
      if (!abortRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setSvg(null);
      }
    } finally {
      if (!abortRef.current) {
        setRendering(false);
      }
    }
  }, []);

  useEffect(() => {
    sourceRef.current = source;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => render(source), 300);
    return () => {
      abortRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [source, render]);

  const handleToggle = () => {
    onToggleView?.(!showCode);
  };

  // Source code view.
  if (showCode) {
    return (
      <div className="relative group">
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-4 text-sm">
          <code>{source}</code>
        </pre>
        <button
          onClick={handleToggle}
          className="absolute right-2 top-2 rounded p-1 text-text-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-text group-hover:opacity-100 focus:opacity-100"
          aria-label="Show diagram preview"
          title="Show diagram"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    );
  }

  // Rendering state.
  if (rendering) {
    return <Skeleton />;
  }

  // Error state — show source with error banner.
  if (error && !svg) {
    return (
      <div>
        <ErrorBanner message={error} />
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-4 text-sm">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  // Rendered diagram.
  if (svg) {
    return (
      <div className="relative group">
        <div
          className="overflow-auto rounded-md p-4"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <button
          onClick={handleToggle}
          className="absolute right-2 top-2 rounded p-1 text-text-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-text group-hover:opacity-100 focus:opacity-100"
          aria-label="Show source code"
          title="Show source"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
      </div>
    );
  }

  // Fallback — empty or loading.
  return <Skeleton />;
}
