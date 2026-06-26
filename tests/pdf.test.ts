import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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

  /**
   * Decompress all FlateDecode streams in a PDF and return the decoded text.
   * Used to verify PDF text content without external tools.
   */
  function decompressPdfStreams(pdf: Uint8Array): string[] {
    // Use latin1 (binary) encoding to avoid UTF-8 corruption of binary PDF data
    const pdfStr = new TextDecoder("latin1").decode(pdf);
    const streams: string[] = [];
    let idx = 0;
    while ((idx = pdfStr.indexOf("stream", idx)) !== -1) {
      const endStream = pdfStr.indexOf("endstream", idx);
      if (endStream === -1) break;
      let dataStart = idx + 6;
      while (
        dataStart < endStream &&
        (pdfStr[dataStart] === "\r" || pdfStr[dataStart] === "\n")
      )
        dataStart++;
      const rawData = pdf.subarray(dataStart, endStream);
      try {
        const decompressed = zlib.inflateSync(rawData);
        // latin1 preserves the binary content 1:1
        streams.push(decompressed.toString("binary"));
      } catch {
        // skip streams that aren't FlateDecode
      }
      idx = endStream + 9;
    }
    return streams;
  }

  /**
   * Extract Unicode code points from ToUnicode CMap beginbfchar entries.
   * Returns a Set of Unicode code points found in any CMap.
   */
  function extractToUnicodeCodepoints(streams: string[]): Set<number> {
    const codepoints = new Set<number>();
    for (const text of streams) {
      if (!text.includes("beginbfchar")) continue;
      const lines = text.split("\n");
      const re = /<([0-9a-fA-F]+)><([0-9a-fA-F]+)>/;
      for (const line of lines) {
        const m = line.match(re);
        if (m) {
          const unicode = parseInt(m[2], 16);
          if (unicode > 0) codepoints.add(unicode);
        }
      }
    }
    return codepoints;
  }

  it("renders Hungarian accented characters (U+0150/U+0151, U+0170/U+0171) correctly", async () => {
    const md = [
      "# Magyar Szöveg",
      "",
      "Ez a szöveg tartalmaz magyar ékezetes betűket:",
      "",
      "- ő (U+0151) és Ő (U+0150) — o kettős ékezet",
      "- ű (U+0171) és Ű (U+0170) — u kettős ékezet",
      "- á é í ó ú ö ü ő ű — teljes magyar ábécé",
    ].join("\n");

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");

    // Decompress PDF streams and extract ToUnicode CMap entries.
    // With a custom Unicode font, @react-pdf/renderer stores a ToUnicode
    // CMap mapping character IDs (CIDs) to Unicode code points. We verify
    // that the Hungarian characters appear in this mapping.
    const streams = decompressPdfStreams(pdf);
    const cps = extractToUnicodeCodepoints(streams);

    // Hungarian double-acute characters (Latin Extended-A)
    expect(cps.has(0x0151)).toBe(true); // ő  (o with double acute)
    expect(cps.has(0x0150)).toBe(true); // Ő  (O with double acute)
    expect(cps.has(0x0171)).toBe(true); // ű  (u with double acute)
    expect(cps.has(0x0170)).toBe(true); // Ű  (U with double acute)

    // Common Hungarian accented chars (Latin-1 supplement)
    expect(cps.has(0x00E1)).toBe(true); // á
    expect(cps.has(0x00E9)).toBe(true); // é
    expect(cps.has(0x00ED)).toBe(true); // í
    expect(cps.has(0x00F3)).toBe(true); // ó
    expect(cps.has(0x00FA)).toBe(true); // ú
    expect(cps.has(0x00F6)).toBe(true); // ö
    expect(cps.has(0x00FC)).toBe(true); // ü
  });

  it("table roundtrip: markdown \u2192 PDF \u2192 markdown preserves tabular format via @pspdfkit/pdf-to-markdown", async () => {
    const md = [
      "| Name    | Age | City      |",
      "|---------|-----|-----------|",
      "| Alice   | 30  | New York  |",
      "| Bob     | 25  | London    |",
      "| Charlie | 35  | Tokyo     |",
    ].join("\n");

    const tree = parseMarkdown(md);
    const pdf = await renderMarkdownToPdf(tree);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe("%PDF-");

    const tmpDir = fs.mkdtempSync(path.join(__dirname, "../.tmp-pdf-roundtrip-"));
    const pdfPath = path.join(tmpDir, "table.pdf");
    fs.writeFileSync(pdfPath, Buffer.from(pdf));

    try {
      // Use Docker + @pspdfkit/pdf-to-markdown to convert PDF back to markdown.
      // Install inside ubuntu:24.04 for the correct glibc.
      const setupCmds = [
        "apt-get update -qq",
        "apt-get install -y -qq curl ca-certificates libcurl4 libssl3 libicu74",
        "curl -fsSL https://raw.githubusercontent.com/PSPDFKit/pdf-to-markdown/main/install.sh | sh",
        'export PATH="$HOME/.local/bin:$PATH"',
        "pdf-to-markdown /input.pdf",
      ].join(" && ");

      const shellCmd = `/bin/bash -c '${setupCmds}'`;
      const dockerCmd = `docker run --rm -v ${pdfPath}:/input.pdf:ro ubuntu:24.04 ${shellCmd}`;

      const output = execSync(dockerCmd, {
        encoding: "utf-8",
        timeout: 180_000,
        stdio: "pipe",
      });

      expect(output).toContain("<table>");
      expect(output).toContain("</table>");
      expect(output).toContain("<tr>");
      expect(output).toContain("</tr>");

      expect(output).toContain("<th>Name</th>");
      expect(output).toContain("<th>Age</th>");
      expect(output).toContain("<th>City</th>");

      expect(output).toContain("<td>Alice</td>");
      expect(output).toContain("<td>30</td>");
      expect(output).toContain("<td>New York</td>");
      expect(output).toContain("<td>Bob</td>");
      expect(output).toContain("<td>25</td>");
      expect(output).toContain("<td>London</td>");
      expect(output).toContain("<td>Charlie</td>");
      expect(output).toContain("<td>35</td>");
      expect(output).toContain("<td>Tokyo</td>");

      const thCount = output.match(/<th>/g)?.length ?? 0;
      const tdCount = output.match(/<td>/g)?.length ?? 0;
      expect(thCount).toBe(3);
      expect(tdCount).toBe(9);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 180_000);
});
