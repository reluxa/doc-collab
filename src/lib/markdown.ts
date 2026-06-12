import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify, { type Options as StringifyOptions } from "remark-stringify";
import type { Root } from "mdast";

/**
 * Server-side Markdown parsing pipeline.
 *
 * Produces an mdast (Markdown Abstract Syntax Tree) consumable by
 * downstream modules (PDF rendering, validation). Independent of the
 * browser editor — does not depend on Tiptap or ProseMirror.
 *
 * Pipeline: `unified` → `remark-parse` (string → mdast) → `remark-gfm` (GFM extensions)
 *
 * Supported node types: heading, paragraph, text, strong, emphasis, inlineCode,
 * code (fenced), blockquote, list, listItem, table, tableRow, tableCell,
 * thematicBreak, link, delete (strikethrough).
 *
 * Lossy / unsupported nodes:
 *   - HTML blocks/inline — dropped (not re-emitted on serialize).
 *     Rationale: security (XSS) + simplicity. Users who need HTML should
 *     use a dedicated HTML export path (future consideration).
 *   - Text color / custom spans — no round-trip support in the editor
 *     extension set; they become plain text on serialize.
 */

const parser = unified().use(remarkParse).use(remarkGfm);

/**
 * Parse a Markdown string into an mdast tree.
 *
 * @param markdown - Raw Markdown source
 * @returns mdast `Root` node
 */
export function parseMarkdown(markdown: string): Root {
  return parser.parse(markdown);
}

/**
 * Serialize an mdast tree back to a Markdown string.
 *
 * Uses `remark-stringify` with GFM settings for round-trip stability.
 *
 * @param tree - mdast `Root` node (from `parseMarkdown`)
 * @returns Markdown string
 */
export function serializeMarkdown(tree: Root): string {
  const options: StringifyOptions = {
    // Consistent output for round-trip stability.
    bullet: "-",
    fence: "`",
    rule: "-",
    tightDefinitions: true,
  };
  const result = unified()
    .use(remarkGfm)
    .use(remarkStringify, options)
    .stringify(tree);
  return (typeof result === "string" ? result : Buffer.from(result).toString()).trimEnd();
}

/**
 * Parse then re-serialize — the full round-trip.
 *
 * For an untouched document (load → save without edits), the output
 * should be byte-identical to the input. This is the critical invariant
 * tested by `tests/markdown-roundtrip.test.ts`.
 *
 * @param markdown - Raw Markdown source
 * @returns Re-serialized Markdown string
 */
export function roundTrip(markdown: string): string {
  const tree = parseMarkdown(markdown);
  return serializeMarkdown(tree);
}

export type { Root } from "mdast";
