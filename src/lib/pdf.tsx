/**
 * Server-side PDF rendering from mdast trees.
 *
 * Maps Markdown AST nodes (from `lib/markdown.ts`) to `@react-pdf/renderer`
 * components. Independent of the browser editor — does not depend on Tiptap
 * or ProseMirror HTML.
 *
 * Streaming note: `renderToStream()` builds the full document model in memory
 * before emitting bytes to the stream. For MVP document sizes this is
 * acceptable. True chunked-from-source streaming is not supported by the
 * library and is out of scope.
 *
 * Font note: The default PDF 14 fonts (Helvetica, Courier) only support
 * WinAnsiEncoding (chars up to U+00FF). Characters like Hungarian ő/Ő/ű/Ű
 * (Latin Extended-A/B) are missing and get replaced by a fallback glyph.
 * We register DejaVu Sans which has broad Unicode coverage including
 * Latin Extended-A, Latin Extended-B, and many other scripts.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Root } from "mdast";

// ---------------------------------------------------------------------------
// Font management
// ---------------------------------------------------------------------------

const FONTS_DIR = path.resolve(process.cwd(), "fonts");
const DEJAVU_ZIP_URL =
  "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip";

/**
 * Ensure DejaVu Sans TTF files are available locally.
 *
 * Checks `fonts/` first. If missing, downloads the release zip from GitHub
 * and extracts only the Regular and Bold faces. Once downloaded, the fonts
 * are cached indefinitely.
 *
 * Returns `true` if fonts are available, `false` if download/extraction
 * failed (caller should fall back gracefully).
 */
let fontsEnsured = false;

async function ensureDejaVuFonts(): Promise<boolean> {
  if (fontsEnsured) return true;

  const requiredFonts = [
    "DejaVuSans.ttf",
    "DejaVuSans-Bold.ttf",
    "DejaVuSans-Oblique.ttf",
    "DejaVuSans-BoldOblique.ttf",
  ];

  // Already cached?
  if (requiredFonts.every((f) => fs.existsSync(path.join(FONTS_DIR, f)))) {
    fontsEnsured = true;
    return true;
  }

  // Try common system paths before downloading
  const systemBase = "/usr/share/fonts/truetype/dejavu";
  if (requiredFonts.every((f) => fs.existsSync(path.join(systemBase, f)))) {
    fontsEnsured = true;
    return true;
  }

  // Download and extract from GitHub release
  try {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    const zipPath = path.join(FONTS_DIR, "dejavu-fonts-ttf.zip");
    console.log(`[pdf] Downloading DejaVu Sans fonts from ${DEJAVU_ZIP_URL} ...`);

    // Use execSync with curl for simplicity (curl is available on most systems)
    execSync(`curl -sL "${DEJAVU_ZIP_URL}" -o "${zipPath}"`, {
      stdio: "pipe",
      timeout: 30_000,
    });

    execSync(
      `unzip -j -o "${zipPath}" "*/ttf/DejaVuSans.ttf" "*/ttf/DejaVuSans-Bold.ttf" "*/ttf/DejaVuSans-Oblique.ttf" "*/ttf/DejaVuSans-BoldOblique.ttf" -d "${FONTS_DIR}"`,
      { stdio: "pipe", timeout: 15_000 },
    );

    // Clean up zip
    fs.unlinkSync(zipPath);

    if (
      requiredFonts.every((f) => fs.existsSync(path.join(FONTS_DIR, f)))
    ) {
      fontsEnsured = true;
      return true;
    }
    console.warn("[pdf] Font extraction completed but files not found");
    return false;
  } catch (err) {
    console.warn("[pdf] Failed to download/extract DejaVu Sans fonts:", err);
    return false;
  }
}

/**
 * Register DejaVu Sans fonts with @react-pdf/renderer.
 *
 * Falls back to system DejaVu path first (no copy needed), then to the
 * locally cached `fonts/` directory if the download succeeded.
 */
let fontsRegistered = false;

function registerDejaVuFont(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Font: any,
): void {
  if (fontsRegistered) return;

  // Resolve font paths: prefer system DejaVu, fall back to local cache
  function resolveFont(filename: string): string {
    const sysPath = `/usr/share/fonts/truetype/dejavu/${filename}`;
    const localPath = path.join(FONTS_DIR, filename);
    return fs.existsSync(sysPath) ? sysPath : localPath;
  }

  const regularSrc = resolveFont("DejaVuSans.ttf");
  const boldSrc = resolveFont("DejaVuSans-Bold.ttf");
  const obliqueSrc = resolveFont("DejaVuSans-Oblique.ttf");
  const boldObliqueSrc = resolveFont("DejaVuSans-BoldOblique.ttf");

  const allExist = [regularSrc, boldSrc, obliqueSrc, boldObliqueSrc].every(
    (src) => fs.existsSync(src),
  );
  if (!allExist) {
    console.warn(
      "[pdf] DejaVu Sans fonts not available — exotic accented characters may not render",
    );
    return;
  }

  Font.register({
    family: "DejaVu Sans",
    fonts: [
      { src: regularSrc, fontWeight: "normal", fontStyle: "normal" },
      { src: boldSrc, fontWeight: "bold", fontStyle: "normal" },
      { src: obliqueSrc, fontWeight: "normal", fontStyle: "italic" },
      { src: boldObliqueSrc, fontWeight: "bold", fontStyle: "italic" },
    ],
  });

  fontsRegistered = true;
}

// ---------------------------------------------------------------------------
// Dynamic import of @react-pdf/renderer (ESM-only package)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReactPdfModule = any;

let cachedReactPdf: ReactPdfModule | null = null;

async function loadReactPdf(): Promise<ReactPdfModule> {
  if (cachedReactPdf) return cachedReactPdf;

  cachedReactPdf = await import("@react-pdf/renderer");
  return cachedReactPdf;
}

// ---------------------------------------------------------------------------
// Style sheet (lazy-initialized after React-PDF loads)
// ---------------------------------------------------------------------------

let cachedStyles: Record<string, React.CSSProperties> | null = null;

async function getStyles(
  rpm: ReactPdfModule,
): Promise<Record<string, React.CSSProperties>> {
  if (cachedStyles) return cachedStyles;

  // StyleSheet.create() returns CSSProperties objects in @react-pdf/renderer.
  const result = rpm.StyleSheet.create({
    page: {
      paddingTop: 35,
      paddingBottom: 65,
      paddingHorizontal: 40,
      fontSize: 11,
      fontFamily: "DejaVu Sans",
      color: "#0F172A",
      lineHeight: 1.6,
    } as React.CSSProperties,
    h1: {
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 10,
      marginTop: 0,
      color: "#1E293B",
    } as React.CSSProperties,
    h2: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 8,
      marginTop: 14,
      color: "#1E293B",
    } as React.CSSProperties,
    h3: {
      fontSize: 13,
      fontWeight: "bold",
      marginBottom: 6,
      marginTop: 12,
      color: "#334155",
    } as React.CSSProperties,
    p: {
      marginBottom: 8,
    } as React.CSSProperties,
    code: {
      fontFamily: "Courier",
      fontSize: 9,
      backgroundColor: "#F1F5F9",
      padding: 6,
      borderRadius: 3,
      marginBottom: 8,
      borderLeftWidth: 3,
      borderLeftColor: "#6366F1",
      paddingLeft: 8,
    } as React.CSSProperties,
    inlineCode: {
      fontFamily: "Courier",
      fontSize: 9,
      backgroundColor: "#F1F5F9",
      padding: "1 3",
      borderRadius: 2,
    } as React.CSSProperties,
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: "#A5B4FC",
      paddingLeft: 10,
      marginBottom: 8,
      color: "#475569",
      fontStyle: "italic",
    } as React.CSSProperties,
    list: {
      marginBottom: 8,
    } as React.CSSProperties,
    listItem: {
      marginBottom: 2,
    } as React.CSSProperties,
    table: {
      display: "table",
      width: "100%",
      marginBottom: 8,
      borderSpacing: 0,
    } as React.CSSProperties,
    tableRow: {
      // React-PDF uses display: flex for rows.
      flexDirection: "row",
    } as React.CSSProperties,
    tableHeaderRow: {
      backgroundColor: "#F1F5F9",
    } as React.CSSProperties,
    tableCell: {
      borderRightWidth: 0.5,
      borderRightColor: "#CBD5E1",
      borderRightStyle: "solid",
      borderBottomWidth: 0.5,
      borderBottomColor: "#CBD5E1",
      borderBottomStyle: "solid",
      padding: 4,
      fontSize: 9,
      // Equal-width columns.
      flex: 1,
    } as React.CSSProperties,
    tableHeaderCell: {
      fontWeight: "bold",
      backgroundColor: "#E2E8F0",
      borderBottomWidth: 1,
      borderBottomColor: "#94A3B8",
      borderBottomStyle: "solid",
    } as React.CSSProperties,
    hr: {
      borderBottomWidth: 1,
      borderBottomColor: "#E2E8F0",
      marginVertical: 12,
    } as React.CSSProperties,
    link: {
      color: "#6366F1",
      textDecoration: "underline",
    } as React.CSSProperties,
    strong: {
      fontWeight: "bold",
    } as React.CSSProperties,
    emphasis: {
      fontStyle: "italic",
    } as React.CSSProperties,
    del: {
      textDecoration: "line-through",
    } as React.CSSProperties,
  });

  cachedStyles = result as Record<string, React.CSSProperties>;
  return cachedStyles;
}

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

/**
 * Recursively render an mdast node tree to React-PDF elements.
 *
 * Supported nodes: heading (1-3), paragraph, text, strong, emphasis,
 * inlineCode, code (fenced), blockquote, list, listItem, table/tableRow/
 * tableCell, thematicBreak, link, delete (strikethrough).
 *
 * @param node - mdast node
 * @param s - compiled style sheet
 * @param cmp - React-PDF component references
 * @param isHeaderRow - true when rendering inside a table header row
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderNode(
  node: Record<string, unknown>,
  s: Record<string, React.CSSProperties>,
  cmp: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    View: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Text: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PdfLink: React.ComponentType<any>;
  },
  isHeaderRow = false,
): React.ReactElement | null {
  if (!node || typeof node.type !== "string") return null;

  const children = ((node.children as Record<string, unknown>[]) ?? []).map(
    (c) => renderNode(c, s, cmp, node.type === "tableRow" && isHeaderRow),
  );

  const { View, Text: PdfText, PdfLink } = cmp;

  switch (node.type) {
    case "root":
      return <View style={s.page}>{children}</View>;

    case "heading": {
      const level = (node.depth as number) ?? 1;
      const headingStyle =
        level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
      return <PdfText style={headingStyle}>{children}</PdfText>;
    }

    case "paragraph":
      return <PdfText style={s.p}>{children}</PdfText>;

    case "text":
      return <>{node.value as string}</>;

    case "strong":
      return <PdfText style={s.strong}>{children}</PdfText>;

    case "emphasis":
      return <PdfText style={s.emphasis}>{children}</PdfText>;

    case "delete":
      return <PdfText style={s.del}>{children}</PdfText>;

    case "inlineCode":
      return <PdfText style={s.inlineCode}>{node.value as string}</PdfText>;

    case "code": {
      // Check if this is a mermaid diagram code block.
      // If so, render raw source as code block (server-side mermaid rendering
      // in PDF is deferred pending headless browser decision).
      const lang = (node.lang as string) ?? "";
      const value = node.value as string;
      // Show "mermaid" language label in the code block for context.
      const displayValue = lang === "mermaid"
        ? `--- mermaid diagram (rendered in editor) ---\n${value}`
        : value;
      return <PdfText style={s.code}>{displayValue}</PdfText>;
    }

    case "blockquote":
      return <View style={s.blockquote}>{children}</View>;

    case "list":
      return <View style={s.list}>{children}</View>;

    case "listItem":
      return <PdfText style={s.listItem}>• {children}</PdfText>;

    case "table": {
      // In mdast, the first tableRow is the header row.
      const rows = node.children as Record<string, unknown>[];
      const tableChildren = rows.map((row, i) =>
        renderNode(row, s, cmp, i === 0),
      );
      return <View style={s.table}>{tableChildren}</View>;
    }

    case "tableRow":
      return <View style={s.tableRow}>{children}</View>;

    case "tableCell": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cellStyle: any = isHeaderRow
        ? [s.tableCell, s.tableHeaderCell]
        : s.tableCell;
      // react-pdf Views don't render text children; wrap in Text.
      return <View style={cellStyle}><PdfText>{children}</PdfText></View>;
    }

    case "thematicBreak":
      return <View style={s.hr} />;

    case "link":
      return (
        <PdfLink src={node.url as string} style={s.link} target="_blank">
          {children}
        </PdfLink>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register emoji image source for react-pdf.
 *
 * react-pdf converts emoji code points to inline images during layout.
 * Without this, emojis (🔬, 🌱, etc.) are silently dropped from the PDF.
 * Uses Twemoji SVG assets from jsdelivr CDN.
 */
let emojiSourceRegistered = false;

function registerEmojiSource(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Font: any,
): void {
  if (emojiSourceRegistered) return;
  if (Font && typeof Font.registerEmojiSource === "function") {
    Font.registerEmojiSource({
      // Twemoji PNGs are supported by pdfkit (SVG is not).
      builder: (code: string) =>
        `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${code}.png`,
    });
  }
  emojiSourceRegistered = true;
}

/**
 * Render an mdast tree to a PDF buffer.
 *
 * Uses `@react-pdf/renderer`'s `renderToBuffer()`. The document model is
 * built in memory before bytes are emitted. For MVP document sizes this is
 * acceptable.
 *
 * Registers a Unicode-capable font (DejaVu Sans) so that accented characters
 * (e.g. Hungarian ő/Ő/ű/Ű, Romanian ă/ș/ț) render correctly instead of being
 * replaced by a missing-glyph fallback.
 *
 * @param tree - mdast `Root` node (from `parseMarkdown` in `lib/markdown.ts`)
 * @returns PDF bytes as a `Uint8Array`
 */
export async function renderMarkdownToPdf(tree: Root): Promise<Uint8Array> {
  const rpm = await loadReactPdf();
  const styles = await getStyles(rpm);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Font: any = rpm.Font;

  // Ensure DejaVu Sans fonts are available for Unicode coverage.
  await ensureDejaVuFonts();
  registerDejaVuFont(Font);

  // Register emoji source so emoji code points render as Twemoji SVG images
  registerEmojiSource(Font);

  const cmp = {
    View: rpm.View,
    Text: rpm.Text,
    PdfLink: rpm.Link,
  };

  const element = (
    <rpm.Document>
      <rpm.Page size="A4" style={styles.page}>
        {renderNode(tree as unknown as Record<string, unknown>, styles, cmp)}
      </rpm.Page>
    </rpm.Document>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await (rpm as any).renderToBuffer(element);
  return new Uint8Array(buffer);
}
