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
 */

import type { Root } from "mdast";

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
      fontFamily: "Helvetica",
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

    case "code":
      return <PdfText style={s.code}>{node.value as string}</PdfText>;

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
 * @param tree - mdast `Root` node (from `parseMarkdown` in `lib/markdown.ts`)
 * @returns PDF bytes as a `Uint8Array`
 */
export async function renderMarkdownToPdf(tree: Root): Promise<Uint8Array> {
  const rpm = await loadReactPdf();
  const styles = await getStyles(rpm);

  // Register emoji source so emoji code points render as Twemoji SVG images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Font: any = rpm.Font;
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
