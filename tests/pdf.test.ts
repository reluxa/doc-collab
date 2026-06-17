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

  it("renders emojis correctly in PDF", async () => {
    const md = `# Science Lab 🔬

This document contains emojis: \u{1F52C} \u{1F31F} \u{2764} \u{1F680}

- Item with emoji \u{1F4A1}
- Another \u{2705} check`;

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");

    // react-pdf renders emojis as inline SVG images (via Twemoji CDN).
    // Verify that the PDF is valid AND that emoji content produces a
    // noticeably larger file than equivalent text without emojis
    // (the embedded SVG image data adds bytes).

    // Render the same text without emojis for comparison
    const mdNoEmoji = `# Science Lab

This document contains emojis: 4

- Item with emoji 1
- Another 1 check`;
    const treeNoEmoji = parseMarkdown(mdNoEmoji);
    const pdfNoEmoji = await renderMarkdownToPdf(treeNoEmoji);

    // The emoji PDF should be significantly larger (Twemoji SVGs add image
    // data per unique emoji). We have 6 unique emojis here, each SVG is
    // roughly 500-800 bytes → expect at least 1000 bytes difference.
    expect(pdf.byteLength).toBeGreaterThan(pdfNoEmoji.byteLength + 1000);
  });
});
