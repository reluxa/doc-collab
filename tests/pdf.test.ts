import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

  it("table roundtrip: markdown → PDF → markdown preserves tabular format via @pspdfkit/pdf-to-markdown", async () => {
    // Create a markdown document with a table
    const md = `| Name    | Age | City      |
|---------|-----|-----------|
| Alice   | 30  | New York  |
| Bob     | 25  | London    |
| Charlie | 35  | Tokyo     |`;

    // Render to PDF
    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");

    // Write PDF to a temp file
    const tmpDir = fs.mkdtempSync(path.join(__dirname, "../.tmp-pdf-roundtrip-"));
    const pdfPath = path.join(tmpDir, "table.pdf");
    fs.writeFileSync(pdfPath, Buffer.from(pdf));

    try {
      // Use Docker + @pspdfkit/pdf-to-markdown (nutrient CLI) to convert PDF back to markdown
      const nutrientBinary = path.resolve(
        process.env.HOME ?? "/home/reluxa",
        ".local/share/nutrient/cli/nutrient-linux-amd64",
      );

      const dockerCmd = [
        "docker", "run", "--rm",
        `-v ${pdfPath}:/input.pdf:ro`,
        `-v ${nutrientBinary}:/nutrient:ro`,
        "ubuntu:24.04",
        "/bin/bash", "-c",
        "'apt-get update -qq && apt-get install -y -qq libcurl4 libssl3 libicu74 2>/dev/null && /nutrient pdf-to-markdown /input.pdf'",
      ].join(" ");

      const output = execSync(dockerCmd, {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      });

      // The tool converts PDF tables to HTML table elements.
      // Verify the tabular structure is preserved.
      expect(output).toContain("<table>");
      expect(output).toContain("</table>");
      expect(output).toContain("<tr>");
      expect(output).toContain("</tr>");

      // Header cells
      expect(output).toContain("<th>Name</th>");
      expect(output).toContain("<th>Age</th>");
      expect(output).toContain("<th>City</th>");

      // Data cells
      expect(output).toContain("<td>Alice</td>");
      expect(output).toContain("<td>30</td>");
      expect(output).toContain("<td>New York</td>");
      expect(output).toContain("<td>Bob</td>");
      expect(output).toContain("<td>25</td>");
      expect(output).toContain("<td>London</td>");
      expect(output).toContain("<td>Charlie</td>");
      expect(output).toContain("<td>35</td>");
      expect(output).toContain("<td>Tokyo</td>");

      // All 3 header cells + 3 rows × 3 cells = 12 table cells total
      const thCount = output.match(/<th>/g)?.length ?? 0;
      const tdCount = output.match(/<td>/g)?.length ?? 0;
      expect(thCount).toBe(3);
      expect(tdCount).toBe(9);
    } finally {
      // Cleanup temp directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);
});
