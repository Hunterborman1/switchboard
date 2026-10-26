# Design system (v3: Switchboard)

One visual language for everything a viewer sees: the Switchboard product (Signal Loop is one
analysis inside it), Agent Ops, the walkthrough overlay, the narrative scenes, the hub, the
write-up and the login page. It should read like a mature B2B SaaS product, not a demo.

The code is the source of truth: tokens in `src/ds/tokens.css`, components in `src/ds/`
(`import { … } from '../ds'`), the frame in `src/ds/shell/Shell.tsx`. This page explains the
intent and the rules the code cannot enforce.

## Product structure

- **Switchboard** reads any conversation or document, decides what it is, runs the analyses
  that apply, and sends the result to the right people in the tools they already use.
- **Signal Loop** is the one analysis built out: product feedback → evidence-backed insight →
  the owner. Other analyses are listed in the catalog and marked "Not built".
- **Agent Ops** is a separate product (switcher, top-left) for operating every agent.
- Connectors are simulated: connecting one records a workspace connection; deliveries render as
  in-app previews with receipts. Say so where it matters, never pretend otherwise.

## Rules

1. **Flat and light.** White page, quiet greys, one accent (Invoca green `--accent`). No
   gradients, glows, blurs, noise or text effects. Shadows only for things that float
   (`--shadow-2`: menus, dialogs, drawers, toasts, the walkthrough Guide); `--shadow-1` on
   secondary buttons and the selected nav item only.
2. **One typeface: Inter.** Sentence case everywhere. No uppercase or letter-spaced labels.
   Monospace only for things a person would copy: IDs, receipts, hashes, code. File names are
   not monospace. Numbers in tables and stats use tabular figures (`.ds-num`, `is-num`).
3. **Colour means something.** Status colours for status only; the accent for the primary
   action, focus, selection and links. Insight types use the chart ramp with a text label
   (`TypeLabel`), never colour alone. Connector tiles use each tool's colour.
4. **Write for a VP of Customer Success.** Lead with the outcome, then the next action. Plain
   words ("Needs review", "AI cost", "Took"), no jargon on the surface (no "SHA-256", "Zod",
   "turn IDs", "fuzzy ≥ 0.90", "Σ"). Precise detail lives one hover, drawer or settings page
   away. No `→` in link or button text; no "A · B · C" meta strings where separate elements
   work; buttons say exactly what happens ("Connect Jira", "Approve and send").
5. **Every state is designed.** Loading uses a skeleton the shape of the content
   (`TableSkeleton`, `PageSkeleton`), never bare "Loading…". Empty states invite the next
   action. Errors say what failed and offer "Try again". Disabled controls say why (tooltip).
6. **Motion is functional and short.** 120ms hover/press, 180ms enter/exit, 240ms drawers.
   `cubic-bezier(0.2, 0, 0, 1)` in, `(0.4, 0, 1, 1)` out. Opacity and ≤ 8px translate only. No
   bounce, pulse, shimmer or infinite loops (an honest spinner while work runs is fine).
   `prefers-reduced-motion` zeroes durations.
7. **Nothing overlaps, nothing clips.** Every row that can hold long text has `min-width: 0`
   and truncates with an ellipsis (title attribute for the full value). Tables scroll inside
   their card, never the page. Pages work at 1440, 1024 and 390 wide with no horizontal page
   scroll.

## Tokens (src/ds/tokens.css)

| Group | Tokens |
|---|---|
| Surface | `--bg` #FFF · `--bg-subtle` #F7F8F7 (sidebar, table head, footers) · `--bg-muted` #EFF1EF (hover) · `--bg-emphasis` · `--bg-inverse` (tooltips) |
| Line | `--border` #E3E6E3 (cards) · `--border-row` #ECEEEC (table rows) · `--border-strong` #CDD2CD (inputs) |
| Text | `--text` #111614 · `--text-secondary` #525C57 · `--text-tertiary` #6B756F · `--text-disabled` |
| Accent | `--accent` #008463 · `--accent-hover` · `--accent-text` #006B51 · `--accent-subtle` #E8F4EF · `--accent-line` |
| Status | `--success` `--warning` (`--warning-mark` for bars) `--danger` `--info`, each with `-subtle` |
| Charts | `--chart-1…6`: #008463 #2F5DB8 #C2780C #7A4FB5 #3E8E9E #B5475A |
| Type | 12 / 13 / 14 (body) / 16 / 20 / 24 / 32. Weights 400 / 500 / 600. |
| Space | 4px grid: `--space-1` 4 … `--space-16` 64 |
| Radius | 4 badges · 6 buttons and inputs · 8 cards and popovers · 12 dialogs · full for avatars, dots, switches |
| Size | controls 28 / 32 / 36 · table rows 44 (compact 36) · sidebar 248 · top bar 52 · page max 1280, gutter 32 (16 on phones) |

## Layout

- **Shell** (`Shell`): sidebar on `--bg-subtle` with the product switcher, the primary create
  action, nav groups (Overview and Conversations; Signal Loop; Workspace) and a footer (walkthrough
  pill, Agent Ops, the user menu). The selected nav item is a white raised row with an accent
  icon. A 52px top bar holds the breadcrumb and the "Live AI" status. Below 900px the sidebar is
  a drawer opened from the top bar.
- **Page** (`Page` → `PageHeader` → optional `Toolbar` → content). Title 24/600; one short
  description line; the page's primary action on the right. Sections are 24px apart.
- **Cards** (`Card`): white, 1px border, 8px radius. Header 16/20px padding with a 14/600 title
  and an optional 13px description; `flush` for tables and lists. Do not nest cards; use a
  divider or a `--bg-subtle` inset instead.
- **Tables** (`Table`, `SortTh`, `CellText`): header 12/500 secondary on `--bg-subtle`, rows
  44px, 13px text, first and last cells 20px in. A row that opens something is clickable as a
  whole and also has a real link in its first cell.
- **Detail views**: a page for things with their own URL (a conversation, a theme, a
  connection); a `Drawer` for a quick look from a list (an insight, a person).

## Components (src/ds)

Button (primary, secondary, ghost, danger, link; sm 28 / md 32 / lg 36) · ButtonLink ·
IconButton (always labelled, tooltip) · Badge (neutral, accent, success, warning, danger, info;
optional dot) · DotLabel · Kbd · Avatar · PersonChip · CopyText · Card · Page · PageHeader ·
Section · Toolbar · Grid · Field · Input · SearchInput · Textarea · Select · Switch · Checkbox ·
Segmented · Tabs · TabLinks · Table · SortTh · CellText · Stats · KeyValue · Meter · Quote ·
Callout · EmptyState · Skeleton · TableSkeleton · PageSkeleton · Tooltip · Menu · Popover ·
Modal · Drawer · ToastProvider/useToast · ProductMark · ConnectorMark · icons (`src/ds/icons`).

Domain vocabulary on top (`src/app/components/domain.tsx`): TypeLabel, SeverityBadge,
GateBadge (reasons on hover), InsightStatusBadge, RunStatusBadge, ModeBadge, SourceLabel,
ErrorState. Use these instead of restyling the concept on each page.

**The one distinctive treatment** is the customer's own words: `Quote` (a 2px accent rule, the
quote in body text, a quiet citation). Every place evidence appears uses it.

## Walkthrough and narrative

- Scenes are presentation pages in the same system: white page, the same top bar style
  (product mark, chapter, "4 of 10"), content in a 1120px column, headline 40–48px/600, one
  supporting line, then one diagram or set of cards. A scene shows everything at once: one short
  staggered entrance on arrival (opacity and a 6px rise, each part 120–600 ms), never a click to
  reveal. Bottom bar: Back / Next and a thin progress bar; only those (and ← →) move on, never a
  click on the page. The top bar, bottom bar and rail stay put between scenes and never
  re-animate. From 1200px a left chapter rail the width of the product sidebar.
- On product pages the walkthrough is the Guide: a bar docked along the bottom of the content
  column, white with a 1px top border and the presentation's progress on that edge, like the
  scenes' bottom bar. Top row: the chapter picker, "Step 1 of 2", "Explore on your own", minimize.
  Below: a 16/600 title and a 14px why of 20 words or fewer with "How this works" inline, the
  "Your turn" box on `--accent-subtle`, then Back / Next as on the scenes. It folds to a one-line
  strip when minimized or while a dialog is open. Phones: a bottom sheet.
- No scrim and no blur. The target gets a 2px accent ring. The Guide covers nothing: the page
  reserves its height (`--sl-guide-h`), and dialogs, drawers, toasts and sticky action bars sit
  above it.
