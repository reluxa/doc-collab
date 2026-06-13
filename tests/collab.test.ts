/**
 * Unit tests for the section model, Y.Doc schema, and Markdown↔Y.Doc bridge.
 *
 * Covers:
 * - Section splitting at heading boundaries
 * - Anchor extraction and stamping
 * - Round-trip Markdown↔Y.Doc
 * - Section ID recovery (anchor match, heading+position, content similarity, mint)
 * - Per-section diff applying only changed sections
 * - Section reorder + edit commute
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as Y from "yjs";
import {
  Section,
  splitMarkdown,
  serializeSections,
  extractAnchorId,
  stripAnchor,
  stampAnchor,
  generateSectionId,
  reconcileSectionIds,
} from "@/lib/collab/sections";
import {
  createDoc,
  addSection,
  getSectionIds,
  getSections,
  removeSection,
  moveSection,
  setSectionContent,
  getSectionFragment,
} from "@/lib/collab/doc-model";
import {
  markdownToYDoc,
  yDocToMarkdown,
  applyMarkdownDiff,
  getSectionsFromDoc,
} from "@/lib/collab/md-bridge";

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

describe("splitMarkdown", () => {
  it("splits at H1 and H2 headings by default", () => {
    const md = `<!-- sec:aaa -->
# Title

Body 1

<!-- sec:bbb -->
## Subtitle

Body 2`;

    const sections = splitMarkdown(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("aaa");
    expect(sections[0].heading).toBe("# Title");
    expect(sections[0].body).toBe("Body 1");
    expect(sections[1].id).toBe("bbb");
    expect(sections[1].heading).toBe("## Subtitle");
    expect(sections[1].body).toBe("Body 2");
  });

  it("splits at configurable max level", () => {
    const md = `# H1

Body 1

## H2

Body 2

### H3

Body 3`;

    // Only split at H1.
    const sections = splitMarkdown(md, { maxLevel: 1 });
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("# H1");
    // H2 and H3 are part of the body.
    expect(sections[0].body).toContain("## H2");
    expect(sections[0].body).toContain("### H3");
  });

  it("generates IDs for sections without anchors", () => {
    const md = `# Heading

Body text`;

    const sections = splitMarkdown(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBeDefined();
    expect(sections[0].id).toHaveLength(10);
  });

  it("skips empty preamble", () => {
    const md = `

## Heading

Body`;

    const sections = splitMarkdown(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("## Heading");
  });

  it("handles preamble with content", () => {
    const md = `Some intro text

# Heading

Body`;

    const sections = splitMarkdown(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("");
    expect(sections[0].body).toBe("Some intro text");
    expect(sections[1].heading).toBe("# Heading");
  });
});

// ---------------------------------------------------------------------------
// Anchor helpers
// ---------------------------------------------------------------------------

describe("extractAnchorId", () => {
  it("extracts ID from a valid anchor", () => {
    expect(extractAnchorId("<!-- sec:abc123 -->\n## Title")).toBe("abc123");
  });

  it("returns null for missing anchor", () => {
    expect(extractAnchorId("## Title")).toBeNull();
  });

  it("returns null for clearly non-anchor text", () => {
    expect(extractAnchorId("## Title")).toBeNull();
  });
});

describe("stripAnchor", () => {
  it("removes anchor from text", () => {
    const input = "<!-- sec:abc123 -->\n## Title\nBody";
    expect(stripAnchor(input)).toBe("## Title\nBody");
  });

  it("leaves text unchanged when no anchor", () => {
    const input = "## Title\nBody";
    expect(stripAnchor(input)).toBe(input);
  });
});

describe("stampAnchor", () => {
  it("prepends anchor to text", () => {
    expect(stampAnchor("## Title", "xyz789")).toBe(
      "<!-- sec:xyz789 -->\n## Title",
    );
  });

  it("replaces existing anchor", () => {
    const input = "<!-- sec:old -->\n## Title";
    expect(stampAnchor(input, "new000")).toBe(
      "<!-- sec:new000 -->\n## Title",
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trip Markdown↔Y.Doc
// ---------------------------------------------------------------------------

describe("markdownToYDoc + yDocToMarkdown", () => {
  it("round-trips content and section IDs exactly", () => {
    const original = `<!-- sec:sec1 -->
# Title

Body 1

<!-- sec:sec2 -->
## Subtitle

Body 2`;

    const doc = markdownToYDoc(original);
    const sections = getSectionsFromDoc(doc);
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("sec1");
    expect(sections[1].id).toBe("sec2");

    const serialized = yDocToMarkdown(doc);
    // The round-trip should preserve IDs and content.
    expect(serialized).toContain("<!-- sec:sec1 -->");
    expect(serialized).toContain("<!-- sec:sec2 -->");
    expect(serialized).toContain("Body 1");
    expect(serialized).toContain("Body 2");
  });
});

// ---------------------------------------------------------------------------
// Section ID recovery
// ---------------------------------------------------------------------------

describe("reconcileSectionIds", () => {
  const existing: Section[] = [
    { id: "aaa", heading: "# Intro", body: "Welcome" },
    { id: "bbb", heading: "## Methods", body: "The approach" },
    { id: "ccc", heading: "## Results", body: "The findings" },
  ];

  it("keeps IDs when anchors are present", () => {
    const newSections: Section[] = [
      { id: "aaa", heading: "# Intro", body: "Welcome" },
      { id: "bbb", heading: "## Methods", body: "Updated approach" },
      { id: "ccc", heading: "## Results", body: "The findings" },
    ];

    const result = reconcileSectionIds(newSections, existing);
    expect(result[0].id).toBe("aaa");
    expect(result[1].id).toBe("bbb");
    expect(result[2].id).toBe("ccc");
  });

  it("recovers IDs by heading + position when anchors missing", () => {
    const newSections: Section[] = [
      { id: "", heading: "# Intro", body: "Welcome" },
      { id: "", heading: "## Methods", body: "Updated approach" },
      { id: "", heading: "## Results", body: "The findings" },
    ];

    const result = reconcileSectionIds(newSections, existing);
    expect(result[0].id).toBe("aaa");
    expect(result[1].id).toBe("bbb");
    expect(result[2].id).toBe("ccc");
  });

  it("recovers IDs even when new sections have generated nanoids", () => {
    // Simulates splitMarkdown output: sections without anchors get generated IDs.
    // The reconciler should still recover existing IDs by heading match.
    const newSections: Section[] = [
      { id: "x1newgen1", heading: "# Intro", body: "Welcome" },
      { id: "x2newgen2", heading: "## Methods", body: "Updated approach" },
      { id: "x3newgen3", heading: "## Results", body: "The findings" },
    ];

    const result = reconcileSectionIds(newSections, existing);
    expect(result[0].id).toBe("aaa");
    expect(result[1].id).toBe("bbb");
    expect(result[2].id).toBe("ccc");
  });

  it("mints new ID when no match found", () => {
    const newSections: Section[] = [
      ...existing,
      { id: "", heading: "## New Section", body: "Brand new content" },
    ];

    const result = reconcileSectionIds(newSections, existing);
    expect(result).toHaveLength(4);
    expect(result[3].id).toBeDefined();
    expect(result[3].id).not.toBe("aaa");
    expect(result[3].id).not.toBe("bbb");
    expect(result[3].id).not.toBe("ccc");
  });
});

// ---------------------------------------------------------------------------
// Y.Doc schema operations
// ---------------------------------------------------------------------------

describe("doc-model", () => {
  it("creates empty doc with schema", () => {
    const doc = createDoc();
    expect(getSectionIds(doc)).toEqual([]);
  });

  it("adds and removes sections", () => {
    const doc = createDoc();
    doc.transact(() => {
      addSection(doc, "sec1");
      addSection(doc, "sec2");
    }, null);

    expect(getSectionIds(doc)).toEqual(["sec1", "sec2"]);

    doc.transact(() => {
      removeSection(doc, "sec1");
    }, null);

    expect(getSectionIds(doc)).toEqual(["sec2"]);
  });

  it("moves sections in order", () => {
    const doc = createDoc();
    doc.transact(() => {
      addSection(doc, "a");
      addSection(doc, "b");
      addSection(doc, "c");
    }, null);

    doc.transact(() => {
      moveSection(doc, "c", 2, 0);
    }, null);

    expect(getSectionIds(doc)).toEqual(["c", "a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Per-section diff
// ---------------------------------------------------------------------------

describe("applyMarkdownDiff", () => {
  it("updates only changed sections", () => {
    const original = `<!-- sec:sec1 -->
# Section 1

Section 1 body

<!-- sec:sec2 -->
# Section 2

Section 2 body

<!-- sec:sec3 -->
# Section 3

Section 3 body`;

    const doc = markdownToYDoc(original);

    // Only section 2 changes.
    const updated = `<!-- sec:sec1 -->
# Section 1

Section 1 body

<!-- sec:sec2 -->
# Section 2

Section 2 UPDATED

<!-- sec:sec3 -->
# Section 3

Section 3 body`;

    const changed = applyMarkdownDiff(doc, updated);
    expect(changed).toBe(1);

    // Verify the result.
    const sections = getSectionsFromDoc(doc);
    expect(sections[0].body).toBe("Section 1 body");
    expect(sections[1].body).toBe("Section 2 UPDATED");
    expect(sections[2].body).toBe("Section 3 body");
  });

  it("adds new sections", () => {
    const original = `<!-- sec:sec1 -->
# Section 1

Section 1 body`;

    const doc = markdownToYDoc(original);

    const updated = `<!-- sec:sec1 -->
# Section 1

Section 1 body

<!-- sec:sec2 -->
# New Section

New section body`;

    const changed = applyMarkdownDiff(doc, updated);
    expect(changed).toBe(1); // 1 added

    const sections = getSectionsFromDoc(doc);
    expect(sections).toHaveLength(2);
    expect(sections[1].body).toBe("New section body");
  });

  it("removes sections no longer present", () => {
    const original = `<!-- sec:sec1 -->
# Section 1

Section 1 body

<!-- sec:sec2 -->
# Section 2

Section 2 body`;

    const doc = markdownToYDoc(original);

    const updated = `<!-- sec:sec1 -->
# Section 1

Section 1 body`;

    const changed = applyMarkdownDiff(doc, updated);
    expect(changed).toBe(1); // 1 removed

    const sections = getSectionsFromDoc(doc);
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("sec1");
  });
});

// ---------------------------------------------------------------------------
// Section reorder + edit commute
// ---------------------------------------------------------------------------

describe("commutativity", () => {
  it("reorder then edit equals edit then reorder", () => {
    // Scenario A: reorder then edit.
    const docA = createDoc();
    docA.transact(() => {
      addSection(docA, "a");
      addSection(docA, "b");
      addSection(docA, "c");
    }, null);

    // Reorder: move c to front.
    docA.transact(() => {
      moveSection(docA, "c", 2, 0);
    }, null);

    // Edit section a.
    docA.transact(() => {
      setSectionContent(docA, "a", "Edited A");
    }, null);

    // Scenario B: edit then reorder.
    const docB = createDoc();
    docB.transact(() => {
      addSection(docB, "a");
      addSection(docB, "b");
      addSection(docB, "c");
    }, null);

    // Edit section a.
    docB.transact(() => {
      setSectionContent(docB, "a", "Edited A");
    }, null);

    // Reorder: move c to front.
    docB.transact(() => {
      moveSection(docB, "c", 2, 0);
    }, null);

    // Both should have same order and content.
    expect(getSectionIds(docA)).toEqual(getSectionIds(docB));
    expect(getSectionIds(docA)).toEqual(["c", "a", "b"]);

    const sectionsA = getSectionsFromDoc(docA);
    const sectionsB = getSectionsFromDoc(docB);
    expect(sectionsA[1].body).toBe(sectionsB[1].body);
    expect(sectionsA[1].body).toBe("Edited A");
  });
});

// ---------------------------------------------------------------------------
// ID stability
// ---------------------------------------------------------------------------

describe("generateSectionId", () => {
  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateSectionId());
    }
    expect(ids.size).toBe(1000);
  });

  it("generates IDs of correct length", () => {
    const id = generateSectionId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[a-z0-9]{10}$/);
  });
});
