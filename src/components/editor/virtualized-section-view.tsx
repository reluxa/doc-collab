"use client";

import { useEffect, useRef, useState } from "react";

import type { Section } from "@/lib/collab/sections";
import { SectionPlaceholder, SheetSkeleton } from "./sheet-skeleton";

export const SECTION_VIRTUALIZE_THRESHOLD = 20;

interface VirtualizedSectionViewProps {
  sections: Section[];
}

/**
 * Lazy-render document sections with intersection observer (Story 14).
 * Off-screen sections stay as lightweight placeholders until scrolled into view.
 */
export function VirtualizedSectionView({ sections }: VirtualizedSectionViewProps) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const refs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.sectionId;
            if (!id) continue;
            if (entry.isIntersecting) next.add(id);
          }
          return next;
        });
      },
      { rootMargin: "200px 0px", threshold: 0 },
    );

    for (const el of refs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) {
    return <SheetSkeleton />;
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const isVisible = visible.has(section.id);
        const label = section.heading || section.id;
        const bodyPreview = section.body.slice(0, 2000);

        return (
          <section
            key={section.id}
            ref={(el) => {
              if (el) refs.current.set(section.id, el);
              else refs.current.delete(section.id);
            }}
            data-section-id={section.id}
            className="scroll-mt-4"
          >
            {isVisible ? (
              <div className="prose prose-sm max-w-none text-text">
                {section.heading && (
                  <h2 className="text-lg font-semibold text-text">{section.heading.replace(/^#+\s*/, "")}</h2>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-muted">
                  {bodyPreview}
                </pre>
              </div>
            ) : (
              <SectionPlaceholder heading={label} loading />
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Whether to use virtualized section rendering for this document. */
export function shouldVirtualizeSections(sectionCount: number): boolean {
  return sectionCount >= SECTION_VIRTUALIZE_THRESHOLD;
}
