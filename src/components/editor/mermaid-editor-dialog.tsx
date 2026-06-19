"use client";

/**
 * Modal dialog for editing Mermaid diagrams.
 *
 * Left panel: source code editor
 * Right panel: live preview of the diagram
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  renderMermaidToSvg,
  MERMAID_MAX_SOURCE_BYTES,
} from "@/lib/mermaid";

interface MermaidEditorDialogProps {
  open: boolean;
  initialSource: string;
  onClose: () => void;
  onSave: (source: string) => void;
}

// Skeleton placeholder
function Skeleton() {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-md bg-surface-2/60">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-3/60" />
    </div>
  );
}

// Error banner
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

// Live preview panel
function PreviewPanel({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const sourceRef = useRef(source);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  const render = useCallback(async (src: string) => {
    if (src !== sourceRef.current) return;
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

  if (rendering) return <Skeleton />;
  if (error && !svg) return <ErrorBanner message={error} />;
  if (svg) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-4">
        <div
          className="overflow-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    );
  }
  return <Skeleton />;
}

export function MermaidEditorDialog({
  open,
  initialSource,
  onClose,
  onSave,
}: MermaidEditorDialogProps) {
  const [source, setSource] = useState(initialSource);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset source when dialog opens with new content
  useEffect(() => {
    setSource(initialSource);
  }, [initialSource, open]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  const handleSave = () => {
    onSave(source);
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Edit Diagram">
      <div className="mt-2 flex h-[520px] gap-4">
        {/* Left panel - Source editor */}
        <div className="flex flex-1 flex-col">
          <label className="mb-1 text-xs font-medium text-text-subtle">
            Mermaid Source
          </label>
          <textarea
            ref={textareaRef}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="flex-1 resize-none rounded-md border border-surface-3 bg-surface-2 p-3 font-mono text-sm text-text outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            spellCheck={false}
            placeholder="graph TD&#10;  A[Start] --> B[End]"
          />
        </div>

        {/* Right panel - Preview */}
        <div className="flex flex-1 flex-col">
          <label className="mb-1 text-xs font-medium text-text-subtle">
            Preview
          </label>
          <div className="flex-1 overflow-hidden rounded-md border border-surface-3 bg-white">
            <PreviewPanel source={source} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={handleClose}
          className="rounded-md px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </Dialog>
  );
}
