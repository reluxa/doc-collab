# doc-collab — UI Design

A detailed, implementation-ready design spec for the doc-collab web app: design principles, color system, typography, spacing, iconography, the component library, page layouts, responsive behavior, motion, accessibility, and the Phase 2 collaboration UI.

Implementation target: **Next.js 16 + Tailwind CSS v4** (CSS-first `@theme` tokens). Stories that consume this spec: [Story 1](./Story-1.md) (theme tokens), [Story 5](./Story-5.md) (editor + list), [Story 6](./Story-6.md) (export), [Story 8](./Story-8.md) (status + conflict), [Story 12](./Story-12.md) (presence), [Story 14](./Story-14.md) (skeletons/virtualization).

---

## 1. Design principles

1. **Content first.** The document is the hero. Chrome is quiet; the editing surface gets the light, the contrast, and the space.
2. **Calm, focused, modern.** Generous whitespace, soft surfaces, one confident accent color. No visual noise that competes with the writing.
3. **Legible by default.** Comfortable measure (~70ch), strong type hierarchy, AA contrast minimum.
4. **Collaboration is visible, never alarming.** Presence and remote edits are surfaced gently (avatars, soft highlights), never with jarring modals unless data is at risk.
5. **Human vs agent are distinguishable at a glance.** The human is **indigo**; the agent (openclaw) is **teal**. This mapping is consistent everywhere (cursors, avatars, activity).
6. **Keyboard-first.** Everything reachable by keyboard; a command palette for power users.

---

## 2. Color system

Defined as design tokens (CSS variables) so light/dark themes swap cleanly. Values are the source of truth; Tailwind utilities map to them via `@theme` (see §10).

### 2.1 Brand & accent

| Token | Hex | Use |
|-------|-----|-----|
| `--brand-50` | `#EEF2FF` | tint backgrounds |
| `--brand-100` | `#E0E7FF` | hover tint |
| `--brand-300` | `#A5B4FC` | borders, disabled brand |
| `--brand-500` | `#6366F1` | **primary action**, focus ring, human cursor |
| `--brand-600` | `#4F46E5` | primary hover/pressed |
| `--brand-700` | `#4338CA` | primary active, on-tint text |
| `--agent-500` | `#14B8A6` | **agent (openclaw)** cursor, avatar, activity |
| `--agent-600` | `#0D9488` | agent hover/emphasis |

### 2.2 Neutrals (Slate)

| Token | Hex (light) | Use |
|-------|-------------|-----|
| `--bg` | `#F8FAFC` | app background |
| `--surface` | `#FFFFFF` | cards, toolbar, editor sheet |
| `--surface-2` | `#F1F5F9` | sunken areas, hover rows |
| `--border` | `#E2E8F0` | hairline borders |
| `--border-strong` | `#CBD5E1` | inputs, dividers |
| `--text` | `#0F172A` | primary text |
| `--text-muted` | `#475569` | secondary text |
| `--text-subtle` | `#94A3B8` | placeholders, meta, icons |

### 2.3 Semantic

| Token | Hex | Use |
|-------|-----|-----|
| `--success` | `#10B981` | saved, connected |
| `--warning` | `#F59E0B` | unsaved, reconnecting, soft-lock |
| `--danger` | `#EF4444` | errors, destructive, conflict |
| `--info` | `#3B82F6` | informational banners |

### 2.4 Dark theme

| Token | Hex (dark) |
|-------|-----------|
| `--bg` | `#0B1120` |
| `--surface` | `#111827` |
| `--surface-2` | `#1E293B` |
| `--border` | `#1E293B` |
| `--border-strong` | `#334155` |
| `--text` | `#E5E7EB` |
| `--text-muted` | `#94A3B8` |
| `--text-subtle` | `#64748B` |
| `--brand-500` | `#818CF8` (lifted for contrast on dark) |
| `--agent-500` | `#2DD4BF` |

Theme is selected via `prefers-color-scheme` with a manual override toggle persisted in `localStorage` (`data-theme="light|dark"` on `<html>`).

### 2.5 Presence palette (multi-user, Phase 2)

A fixed, color-blind-conscious set assigned round-robin to collaborators (human variants); the agent is always teal. Each has a `light` (cursor/selection tint) and `solid` (caret/label) value:

`#6366F1` indigo · `#EC4899` pink · `#F59E0B` amber · `#10B981` emerald · `#8B5CF6` violet · `#0EA5E9` sky. Agent reserved: `#14B8A6` teal.

---

## 3. Typography

| Role | Font | Notes |
|------|------|-------|
| UI (chrome) | **Inter** (variable), system-ui fallback | weights 400/500/600 |
| Document body | **Inter** default; optional reading serif **"Source Serif 4"** toggle | line-height 1.7, measure ~70ch |
| Monospace | `ui-monospace, "JetBrains Mono", SFMono-Regular` | code blocks/inline code |

### Type scale (rem / px @16)

| Token | Size | Line | Use |
|-------|------|------|-----|
| `display` | 2.25 / 36 | 1.2 | page titles |
| `h1` | 1.875 / 30 | 1.25 | doc H1 |
| `h2` | 1.5 / 24 | 1.3 | doc H2 |
| `h3` | 1.25 / 20 | 1.4 | doc H3 |
| `body` | 1.0 / 16 | 1.7 | editor + UI body |
| `sm` | 0.875 / 14 | 1.5 | meta, labels |
| `xs` | 0.75 / 12 | 1.4 | badges, timestamps |

---

## 4. Spacing, radius, elevation, motion

- **Spacing scale** (px): 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Base rhythm = 8.
- **Radius:** `sm 6px`, `md 10px`, `lg 14px`, `xl 20px`, `full 9999px`. Cards/inputs use `md`; dialogs `lg`; pills `full`.
- **Elevation (light):**
  - `e1` cards: `0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.10)`
  - `e2` popovers/toolbar float: `0 4px 12px rgba(15,23,42,.10)`
  - `e3` dialogs: `0 20px 48px rgba(15,23,42,.24)`
- **Focus ring:** `0 0 0 3px color-mix(in srgb, var(--brand-500) 35%, transparent)` + 1px brand border. Always visible on keyboard focus.
- **Motion:** durations `fast 120ms`, `base 180ms`, `slow 280ms`; easing `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion` (disable non-essential transitions).

---

## 5. Iconography

- Library: **Lucide** (consistent 1.5px stroke, 20px default, 16px in dense rows).
- Common icons: `file-text` (doc), `plus` (new), `download` (PDF), `trash-2` (delete), `search`, `bold/italic/underline/strikethrough`, `list/list-ordered/list-checks`, `quote`, `code`, `code-2`, `link`, `table`, `minus` (hr), `highlighter`, `check`, `loader-2` (spin), `wifi/wifi-off`, `users`, `sun/moon`.

---

## 6. Component library

Each component lists anatomy, sizes, and key states (default / hover / active / focus / disabled / loading).

### 6.1 Buttons
- **Variants:** `primary` (brand fill, white text), `secondary` (surface, `--border-strong`, `--text`), `ghost` (transparent, hover `--surface-2`), `danger` (red fill / red ghost for destructive), `icon` (square, ghost).
- **Sizes:** `sm` 28px, `md` 36px, `lg` 44px height; `md` is default. Radius `md`, icon buttons `md`.
- **States:** hover darken one step; active translateY(0) + inner press; focus ring; disabled 40% opacity + `not-allowed`; loading shows `loader-2` spinner and disables.

### 6.2 Inputs & textareas
- Surface fill, `--border-strong` border, radius `md`, 36px min height, 12px horizontal padding.
- Focus → brand border + focus ring. Error → `--danger` border + helper text. Placeholder `--text-subtle`.

### 6.3 Document card (list item)
- Anatomy: leading `file-text` icon in a brand-tinted rounded square, **title** (`body`/600), **excerpt** (1 line, `--text-muted`), meta row (`updated 2h ago`, size), trailing actions (open on click; kebab → rename/delete; download).
- States: hover raises to `e1` + `--surface-2` tint + border brand-100; focus ring; active collaborators show small avatar stack on the right.
- Layout: grid of cards on wide screens (min 280px), single column on mobile.

### 6.4 Editor toolbar
- Sticky top of the editing column, `--surface` with bottom hairline, `e2` when content scrolls under it.
- Grouped icon buttons with thin dividers: **text style** (H1/H2/H3 dropdown, bold, italic, underline, strike, code) · **blocks** (bulleted, ordered, task, quote, code block, table, hr) · **insert** (link, highlight) · spacer · **Export PDF** · overflow `⋯` on narrow widths.
- Active formatting state = brand-tinted background on the toggle. Tooltips on hover with shortcut hints (e.g., `Bold ⌘B`).

### 6.5 Editor surface (the document sheet)
- Centered column, max-width ~`760px` (≈70ch), `--surface` "sheet" with `md` radius and subtle `e1` on `--bg`, generous padding (48px top, 64px on desktop).
- ProseMirror content styled per §3: headings, lists, task lists (round check), blockquote (left brand-300 bar), code blocks (`--surface-2` bg, mono, lowlight syntax), tables (hairline borders, header tint), links (brand, underline on hover), `hr` (subtle divider), highlight mark (amber tint).
- Placeholder for empty doc: muted "Start writing, or let openclaw help…".

### 6.6 Dialog / modal
- Centered, `lg` radius, `e3`, max-width 480px, scrim `rgba(15,23,42,.45)` with slight blur. Title (`h3`), body (`body`/muted), footer actions right-aligned (secondary + primary). Focus-trapped, `Esc` to dismiss (except destructive confirmations require explicit choice).

### 6.7 Toast / notification
- Bottom-right stack, `--surface`, `e2`, `md` radius, leading status icon, auto-dismiss (success 3s; errors persist with close). Variants map to semantic colors. Used for "Saved", "Export ready", "Connection lost".

### 6.8 Status & badges
- **Save status** (toolbar): pill with dot + label — `Saved` (success dot), `Saving…` (spinner), `Unsaved` (warning dot), `Error` (danger).
- **Connection status:** `Live` (success dot + `wifi`), `Reconnecting…` (warning, pulsing), `Offline` (subtle, `wifi-off`).
- **Badges/pills:** `xs`/`sm`, `full` radius, tinted bg + matching text (e.g., brand pill for tags).

### 6.9 Presence avatars & cursors (Phase 2)
- **Avatar:** 24px circle, initials or icon, 2px ring in the user's presence color; agent (openclaw) avatar uses teal with a small spark/bot glyph.
- **Avatar stack:** top-right of editor, overlapping −8px, `+N` overflow chip, tooltip with names on hover.
- **Remote cursor:** 2px caret in presence color with a small floating name label (fades after 2s of inactivity). **Remote selection:** 18% tint of the presence color.

### 6.10 Soft-lock indicator (Phase 2)
- When the agent is actively editing a section, the section heading shows a subtle teal left-border + a small pill "openclaw is editing" (warning-calm tone, not blocking). Hover explains it's advisory.

### 6.11 Conflict prompt (Phase 1)
- A **non-modal banner** anchored to the top of the editor (not a blocking dialog), warning tone (amber, not red): "This document changed elsewhere." Actions: **Reload (discard my changes)** secondary, **Keep mine** primary. Includes who changed it if known. Only shown when the local editor is dirty (see Story 8). For a `409` on save, the same banner appears with the save-time copy.

### 6.12 Command palette
- `⌘K` opens a centered overlay search: jump to document, create doc, toggle theme, export PDF, insert table, etc. Fuzzy search, keyboard-navigable, `e3`.

### 6.13 Empty & loading states
- **Empty list:** friendly illustration/icon, "No documents yet", primary "New document".
- **Skeletons:** card skeletons on list load; sheet skeleton (animated shimmer lines) on editor load. Used by lazy/virtualized rendering in Story 14.

---

## 7. Layouts

### 7.1 App shell

```
┌───────────────────────────────────────────────────────────────┐
│  TOPBAR  ◭ doc-collab        [ ⌘K search ]        ☾  ⊕ New      │  56px, --surface, hairline bottom
├───────────────────────────────────────────────────────────────┤
│                                                                 │
│                      page content (--bg)                        │
│                                                                 │
└───────────────────────────────────────────────────────────────┘
```
- Topbar: brand mark (left), centered command-palette search trigger, theme toggle + "New document" (right). Sticky.
- No persistent left sidebar in MVP (keeps focus); document navigation is the home page + command palette. (A collapsible sidebar is a future option.)

### 7.2 Home — document list

```
┌───────────────────────────────────────────────────────────────┐
│  Documents                                  [ search ]  [⊕ New] │
├───────────────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐         │
│  │▣ Project Notes│ │▣ Meeting Mins │ │▣ Design Doc   │   ...    │
│  │ excerpt…       │ │ excerpt…      │ │ excerpt…      │         │
│  │ updated 2h • 4k│ │ updated 1d    │ │ updated 3d    │         │
│  └───────────────┘ └───────────────┘ └───────────────┘         │
└───────────────────────────────────────────────────────────────┘
```
- Responsive card grid (≥1024px: 3–4 cols; 640–1024px: 2 cols; <640px: 1 col). Sort by recently modified.

### 7.3 Editor page

```
┌───────────────────────────────────────────────────────────────┐
│ ‹ Docs   Project Notes            ● Saved   ● Live   ◑◑+2  ⋯    │  editor topbar (title editable)
├───────────────────────────────────────────────────────────────┤
│ [H2▾ B I U S </>] [• 1. ☑ ❝ {} ▦ —] [🔗 ▰]      [⤓ PDF]   ⋯    │  formatting toolbar (sticky)
├───────────────────────────────────────────────────────────────┤
│                                                                 │
│        ┌─────────────────────────────────────────────┐         │
│        │                                             │         │
│        │   # Heading                                 │         │  centered sheet (~760px),
│        │   Body text on a comfortable measure…       │         │  e1, generous padding
│        │                                             │         │
│        └─────────────────────────────────────────────┘         │
│                                                                 │
└───────────────────────────────────────────────────────────────┘
```
- Editor topbar: back to docs, inline-editable title, save status, connection status, presence avatar stack, overflow menu (rename, delete, copy link, theme).
- Conflict banner (Phase 1) slots directly under the toolbar when triggered.

### 7.4 Responsive behavior
- **≥1024px:** full toolbar, multi-col card grid, 64px sheet side padding.
- **768–1024px:** toolbar collapses "insert/blocks" tail into `⋯`; sheet padding 32px.
- **<768px:** single-column list; toolbar becomes a horizontally scrollable row with the most-used actions + `⋯`; topbar search becomes an icon.
- Touch targets ≥44px on small screens.

---

## 8. Accessibility

- Contrast: body/UI text ≥ 4.5:1; large text/icons ≥ 3:1 (verify both themes).
- Visible focus ring on every interactive element; logical tab order; skip-to-content link.
- Full keyboard operation incl. toolbar (roving tabindex), dialogs (focus trap + `Esc`), command palette.
- Toolbar toggles use `aria-pressed`; status pills use `aria-live="polite"`; conflict banner uses `role="alert"`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Remote-cursor labels are decorative; presence is also conveyed in the avatar stack (not color alone).

---

## 9. Motion & feedback

- Buttons/cards: 120–180ms color/elevation transitions.
- Toast in/out: slide+fade 180ms. Dialog: scrim fade + content scale from .98 (180ms).
- Save indicator: spinner during write, soft check pop on success.
- Remote edits (Phase 2): brief 600ms highlight fade on changed text so the user notices without distraction. Skeleton shimmer ~1.2s loop.

---

## 10. Tailwind v4 token mapping (implementation)

Define tokens once in CSS and let utilities consume them (Tailwind v4 CSS-first). Set up in [Story 1](./Story-1.md).

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-2: #F1F5F9;
  --color-border: #E2E8F0;
  --color-border-strong: #CBD5E1;
  --color-text: #0F172A;
  --color-text-muted: #475569;
  --color-text-subtle: #94A3B8;

  --color-brand-50: #EEF2FF;
  --color-brand-500: #6366F1;
  --color-brand-600: #4F46E5;
  --color-brand-700: #4338CA;
  --color-agent-500: #14B8A6;

  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-info: #3B82F6;

  --radius-md: 10px;
  --radius-lg: 14px;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "JetBrains Mono", SFMono-Regular, monospace;
}

:root[data-theme="dark"] {
  --color-bg: #0B1120;
  --color-surface: #111827;
  --color-surface-2: #1E293B;
  --color-border: #1E293B;
  --color-border-strong: #334155;
  --color-text: #E5E7EB;
  --color-text-muted: #94A3B8;
  --color-text-subtle: #64748B;
  --color-brand-500: #818CF8;
  --color-agent-500: #2DD4BF;
}
```

Then use semantic utilities (`bg-surface`, `text-muted`, `border-border-strong`, `ring-brand-500`, etc.) throughout components.

---

## 11. Component → Story map

| UI element | Spec § | Story |
|------------|--------|-------|
| Theme tokens, fonts, globals | §2, §3, §10 | [1](./Story-1.md) |
| Topbar, document list, cards, empty/skeleton, editor sheet, toolbar, dialogs | §6, §7 | [5](./Story-5.md) |
| Export PDF button + "Export ready" toast | §6.4, §6.7 | [6](./Story-6.md) |
| Save status, connection status, conflict banner | §6.8, §6.11 | [8](./Story-8.md) |
| Presence avatars, remote cursors/selection, soft-lock | §2.5, §6.9, §6.10 | [12](./Story-12.md) |
| Skeletons / virtualized list & sheet | §6.13 | [14](./Story-14.md) |
| Command palette | §6.12 | [5](./Story-5.md) (baseline) / future enhancement |
