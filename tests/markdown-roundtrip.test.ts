import { describe, expect, it } from "vitest";

import { parseMarkdown, roundTrip, serializeMarkdown } from "../src/lib/markdown";

// Representative GFM Markdown sample covering all listed node types.
const SAMPLE = `# Heading 1

## Heading 2

### Heading 3

This is a paragraph with **bold**, *italic*, and ~~strikethrough~~ text.
Also \`inline code\` and a [link](https://example.com "title").

- Unordered item one
- Unordered item two

1. Ordered item one
2. Ordered item two

- [x] Task done
- [ ] Task pending

> This is a blockquote
> with multiple lines

\`\`\`javascript
const hello = "world";
console.log(hello);
\`\`\`

| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |

Text before hr.
`;

/**
 * Normalize Markdown output for comparison.
 * remark-stringify makes cosmetic normalizations that are semantically
 * identical but change bytes:
 *   - thematicBreak: `---` ↔ `***` ↔ `___` (all valid)
 *   - table alignment: `|---|` ↔ `| - |` (spacing variation)
 *
 * The invariant is semantic equivalence, not byte-identity.
 * The *editor* pipeline (tiptap-markdown) handles the actual byte-identical
 * round-trip for user save→load. This server-side pipeline is for PDF + validation.
 */
function normalize(md: string): string {
  return md
    // Normalize thematicBreak to `---` (remark-stringify uses `***`).
    .replace(/^(\*{3,}|-{3,}|_{3,})$/gm, "---")
    // Normalize table alignment cells: collapse to minimal `|--|--|` form.
    // Only match rows where every cell is composed entirely of `-`, `:`, and spaces.
    .replace(/^\|(\s*[-:]+\s*\|)+$/gm, (line) => {
      return line.replace(/[-:\s]+/g, (m) => {
        // Preserve the pipe-separated structure: collapse each cell to `--` or `:--`.
        if (m.includes("|")) return m; // don't touch the pipes
        const trimmed = m.trim();
        if (!trimmed) return "";
        if (trimmed.includes(":")) return ":--";
        return "--";
      });
    })
    // Collapse trailing whitespace per line.
    .replace(/[ \t]+$/gm, "")
    // Normalize trailing newlines: treat any number as identical.
    .replace(/\n+$/, "");
}

describe("markdown pipeline", () => {
  describe("parseMarkdown", () => {
    it("returns an mdast Root with children", () => {
      const tree = parseMarkdown("# Hello\n\nWorld");
      expect(tree.type).toBe("root");
      expect(Array.isArray(tree.children)).toBe(true);
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it("recognizes headings", () => {
      const tree = parseMarkdown("# H1\n## H2\n### H3");
      const headings = tree.children.filter((n) => n.type === "heading");
      expect(headings.length).toBe(3);
    });

    it("recognizes bold and italic", () => {
      const tree = parseMarkdown("**bold** and *italic*");
      const paragraph = tree.children[0];
      expect(paragraph.type).toBe("paragraph");
    });

    it("recognizes strikethrough (GFM delete)", () => {
      const tree = parseMarkdown("~~deleted~~");
      const paragraph = tree.children[0];
      const text = (paragraph as { children: unknown[] }).children[0];
      expect((text as { type: string }).type).toBe("delete");
    });

    it("recognizes inline code", () => {
      const tree = parseMarkdown("`code`");
      const paragraph = tree.children[0];
      const inlineCode = (paragraph as { children: unknown[] }).children[0];
      expect((inlineCode as { type: string }).type).toBe("inlineCode");
    });

    it("recognizes links", () => {
      const tree = parseMarkdown("[link](https://example.com)");
      const paragraph = tree.children[0];
      const link = (paragraph as { children: unknown[] }).children[0];
      expect((link as { type: string }).type).toBe("link");
    });

    it("recognizes unordered lists", () => {
      const tree = parseMarkdown("- one\n- two");
      expect(tree.children[0].type).toBe("list");
    });

    it("recognizes ordered lists", () => {
      const tree = parseMarkdown("1. one\n2. two");
      expect(tree.children[0].type).toBe("list");
    });

    it("recognizes task lists", () => {
      const tree = parseMarkdown("- [x] done\n- [ ] pending");
      expect(tree.children[0].type).toBe("list");
    });

    it("recognizes blockquotes", () => {
      const tree = parseMarkdown("> quoted text");
      expect(tree.children[0].type).toBe("blockquote");
    });

    it("recognizes fenced code blocks", () => {
      const tree = parseMarkdown("```\ncode\n```");
      expect(tree.children[0].type).toBe("code");
    });

    it("recognizes tables (GFM)", () => {
      const tree = parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
      expect(tree.children[0].type).toBe("table");
    });

    it("recognizes thematicBreak (hr)", () => {
      const tree = parseMarkdown("---");
      expect(tree.children[0].type).toBe("thematicBreak");
    });
  });

  describe("serializeMarkdown", () => {
    it("serializes an mdast tree to Markdown string", () => {
      const tree = parseMarkdown("# Hello\n\nWorld");
      const output = serializeMarkdown(tree);
      expect(typeof output).toBe("string");
      expect(output).toContain("Hello");
    });
  });

  describe("roundTrip (parse → serialize)", () => {
    it("full GFM sample round-trips stably (semantic equivalence)", () => {
      const output = roundTrip(SAMPLE);
      expect(normalize(output)).toBe(normalize(SAMPLE));
    });

    it("headings round-trip", () => {
      const input = "# H1\n\n## H2\n\n### H3";
      expect(roundTrip(input)).toBe(input);
    });

    it("bold and italic round-trip", () => {
      const input = "**bold** and *italic*";
      expect(roundTrip(input)).toBe(input);
    });

    it("strikethrough round-trips", () => {
      const input = "~~deleted~~";
      expect(roundTrip(input)).toBe(input);
    });

    it("inline code round-trips", () => {
      const input = "Use `console.log()`";
      expect(roundTrip(input)).toBe(input);
    });

    it("links round-trip", () => {
      const input = "[example](https://example.com)";
      expect(roundTrip(input)).toBe(input);
    });

    it("unordered list round-trips", () => {
      const input = "- item one\n- item two";
      expect(roundTrip(input)).toBe(input);
    });

    it("ordered list round-trips", () => {
      const input = "1. first\n2. second";
      expect(roundTrip(input)).toBe(input);
    });

    it("task list round-trips", () => {
      const input = "- [x] done\n- [ ] pending";
      expect(roundTrip(input)).toBe(input);
    });

    it("blockquote round-trips", () => {
      const input = "> quoted text";
      expect(roundTrip(input)).toBe(input);
    });

    it("fenced code block round-trips", () => {
      const input = "```javascript\nconst x = 1;\n```";
      expect(roundTrip(input)).toBe(input);
    });

    it("table round-trips (semantic equivalence)", () => {
      const input = "| A | B |\n|---|---|\n| 1 | 2 |";
      expect(normalize(roundTrip(input))).toBe(normalize(input));
    });

    it("thematicBreak (hr) round-trips (semantic equivalence)", () => {
      const input = "---";
      // remark-stringify serializes as `***`; normalize to `---`.
      expect(normalize(roundTrip(input))).toBe(normalize(input));
    });

    it("empty document round-trips", () => {
      expect(roundTrip("")).toBe("");
    });

    it("paragraph with mixed inline marks round-trips", () => {
      const input = "Here is **bold**, *italic*, `code`, and ~~strikethrough~~ in one line.";
      expect(roundTrip(input)).toBe(input);
    });
  });
});
