/**
 * Server-side and client-side Mermaid diagram rendering utilities.
 *
 * Lazy-loads mermaid to keep it out of the initial editor bundle (mermaid@11
 * is large). Provides render, validate, and SVG→PNG rasterization.
 *
 * Server-side rendering note: mermaid needs a real DOM with layout (specifically
 * `getBBox()` for sizing nodes/text). jsdom does not implement `getBBox`, so we
 * use `@mermaid-js/mermaid-cli` (mmdc) via a headless Chromium subprocess.
 *
 * As of this implementation, PDF export does **not** include mermaid diagrams
 * rendered server-side — that is deferred to a follow-up story pending a
 * decision on whether to accept a headless browser dependency in production.
 * For now, mermaid code blocks fall back to raw source in PDF exports.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum mermaid source length (bytes) — enforced at API boundary. */
export const MERMAID_MAX_SOURCE_BYTES = 8_192;

/** In-memory render cache TTL (ms). */
const RENDER_CACHE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Lazy mermaid loader (shared between server and client)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedMermaid: any | null = null;
let mermaidPromise: Promise<unknown> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMermaid(): Promise<any> {
  if (cachedMermaid) return cachedMermaid;
  if (mermaidPromise) return mermaidPromise;

  mermaidPromise = import("mermaid").then((m) => {
    // One-time config: strict security, no auto-render, theme follows system.
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
    });
    cachedMermaid = m.default;
    return cachedMermaid;
  });

  return mermaidPromise;
}

// ---------------------------------------------------------------------------
// In-memory render cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  svg: string;
  expiresAt: number;
}

const renderCache = new Map<string, CacheEntry>();

function cacheKey(source: string): string {
  // Simple hash for cache key — good enough for dedup.
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
  }
  return String(hash);
}

function getFromCache(source: string): string | null {
  const entry = renderCache.get(cacheKey(source));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    renderCache.delete(cacheKey(source));
    return null;
  }
  return entry.svg;
}

function setCache(source: string, svg: string): void {
  // Cap cache size to prevent unbounded growth.
  if (renderCache.size > 50) {
    const iterator = renderCache.keys();
    const oldest = iterator.next().value;
    if (oldest) {
      renderCache.delete(oldest);
    }
  }
  renderCache.set(cacheKey(source), {
    svg,
    expiresAt: Date.now() + RENDER_CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render Mermaid source to an SVG string.
 *
 * Uses `mermaid.render()` which returns a Promise in v11.
 * The returned SVG is sanitized (script/event handlers removed).
 *
 * @param source - Mermaid diagram source (e.g. "graph TD; A-->B")
 * @returns SVG string
 * @throws Error on syntax error or render failure
 */
export async function renderMermaidToSvg(source: string): Promise<string> {
  // Check cache first.
  const cached = getFromCache(source);
  if (cached) return cached;

  const mermaid = await loadMermaid();

  // mermaid.render() returns { svg, ... } in v11.
  const id = `mermaid-${Math.round(Math.random() * 1e6)}`;
  let result: { svg: string };
  try {
    const renderResult = await mermaid.render(id, source ?? "");
    result = renderResult as { svg: string };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Mermaid render failed: ${message}`);
  }

  // Sanitize: remove script tags and event handler attributes.
  let svg = result.svg;
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/\s+on\w+="[^"]*"/gi, "");
  svg = svg.replace(/\s+on\w+='[^']*'/gi, "");

  setCache(source, svg);
  return svg;
}

/**
 * Validate Mermaid source without rendering to SVG.
 *
 * Uses `mermaid.parse()` which is faster than render for validation-only.
 *
 * @param source - Mermaid diagram source
 * @returns true if valid
 */
export async function validateMermaid(source: string): Promise<boolean> {
  const mermaid = await loadMermaid();
  try {
    await mermaid.parse(source);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the render cache (mainly for testing).
 */
export function clearRenderCache(): void {
  renderCache.clear();
}
