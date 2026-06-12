import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../src/lib/markdown";
import { renderMarkdownToPdf } from "../src/lib/pdf";

describe("PDF rendering", () => {
  it("renders a simple heading to a valid PDF", async () => {
    const tree = parseMarkdown("# Hello World");
    const pdf = await renderMarkdownToPdf(tree);

    // PDF magic number: %PDF
    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(100);
  });

  it("renders mixed content (headings, lists, paragraphs)", async () => {
    const md = `# Main Title

## Subheading

Some paragraph text here.

- Item one
- Item two
- Item three

More text after the list.`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(200);
  });

  it("renders code blocks", async () => {
    const md = `# Code Example

\`\`\`
function hello() {
  return "world";
}
\`\`\``;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("renders blockquotes", async () => {
    const md = `> This is a blockquote
> with multiple lines`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("renders tables", async () => {
    const md = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("renders inline formatting (bold, italic, code, link)", async () => {
    const md = `Text with **bold**, *italic*, \`inline code\`, and [a link](https://example.com).`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("renders horizontal rule", async () => {
    const md = `Before

---

After`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("renders strikethrough", async () => {
    const md = `This is ~~deleted~~ text.`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("handles empty content", async () => {
    const tree = parseMarkdown("");
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
