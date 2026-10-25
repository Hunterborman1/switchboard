# Signal Loop design direction (v2: professional SaaS)

One visual language for everything a viewer sees: the hub, the narrative scenes, the walkthrough
overlay, the Signal Loop product, Agent Ops, the write-up and the login page. It should read like a
mature B2B SaaS product (think Linear, Stripe Dashboard, Vercel), not a landing-page demo.

## Rules

1. **No gradients, glows or blurs.** No `linear-gradient`, `radial-gradient`, `conic-gradient`,
   `box-shadow` glows, `filter: blur`, `backdrop-filter`, text gradients, noise or vignettes.
   Flat fills only. The one allowed shadow is the elevation scale below.
2. **One light theme everywhere.** White page, neutral greys, one accent (Invoca green). The
   narrative scenes are no longer a dark-green world; they are presentation pages in the same
   design as the product.
3. **One typeface: Inter** (self-hosted `Inter Variable`). No serif, no italic accent words.
   Headings are sentence case, semibold, tight tracking (-0.01em to -0.02em on large sizes).
   **Monospace only for things a person would copy**: IDs, file names, code, keys. Never for
   labels, eyebrows, prices, timestamps or metrics. Numbers use `font-variant-numeric: tabular-nums`.
4. **No letter-spaced uppercase eyebrows.** Section labels are sentence case, 13px, medium,
   secondary grey. Table headers may be 12px medium secondary grey, sentence case.
5. **Human-readable copy.** Write for a VP of Customer Success, not an engineer. Replace jargon on
   the surface (SHA-256, Zod schema, Σ, "pooled gate level", "fast tier", "durable Workflow",
   "turn IDs", "fuzzy ≥ 0.90", "×", "~321×"). Keep precise detail one click away (tooltip, drawer,
   Settings, trace page). Use plain units: "3.8 seconds", "$0.0014 per call", "18 minutes saved".
   Model tiers read "Main model" and "Backup model" (exact ids still only on /app/settings).
6. **Animation is functional and short.** Only animate to show a change of state or progression.
   - Durations: 120ms (hover, press), 180ms (enter/exit, tab change), 240ms (larger layout
     moves), never more than 320ms for UI; data reveals (bars, counters, stepper) may run up to
     600ms once.
   - Easing: `cubic-bezier(0.2, 0, 0, 1)` for enter, `cubic-bezier(0.4, 0, 1, 1)` for exit.
   - Properties: opacity and transform (translateY 4–8px max, scale 0.98–1). No bounce, spring
     overshoot, particles, pulsing, shimmer loops, infinite animations (except an honest
     in-progress spinner/progress bar while something is actually running).
   - Scene changes: 180ms cross-fade of content; chrome never moves.
   - `prefers-reduced-motion`: no transforms, opacity only, final frame drawn.
7. **Layout.** 4px grid. Page max width 1280px for content pages; generous whitespace; cards
   are white with a 1px `--border` and 8px radius; no nested cards inside cards where a divider
   works. Buttons 6px radius (not pills). Badges 4px radius, subtle tinted fill, no borders-plus-dots
   clutter.

## Tokens (light, flat)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | page |
| `--bg-subtle` | `#F7F8F7` | sidebar, table header, inset areas |
| `--bg-muted` | `#EFF1EF` | hover, selected row |
| `--border` | `#E3E6E3` | card and table borders |
| `--border-strong` | `#CDD2CD` | inputs |
| `--text` | `#111614` | primary text |
| `--text-secondary` | `#525C57` | secondary text (7.1:1 on white) |
| `--text-tertiary` | `#6B756F` | captions, placeholders (4.8:1) |
| `--accent` | `#008463` | primary buttons, focus, links-on-hover, active nav marker |
| `--accent-text` | `#006B51` | accent-coloured text on white |
| `--accent-subtle` | `#E8F4EF` | selected nav item, accent badge fill |
| `--success` / `-subtle` | `#0F7B48` / `#E7F4EC` | |
| `--warning` / `-subtle` | `#9A5B00` / `#FBF1DE` | |
| `--danger` / `-subtle` | `#B42318` / `#FDECEA` | real failures only |
| `--info` / `-subtle` | `#2F5DB8` / `#EAF0FB` | |
| `--shadow-1` | `0 1px 2px rgba(16,24,20,.06)` | cards (optional) |
| `--shadow-2` | `0 4px 12px rgba(16,24,20,.08), 0 1px 3px rgba(16,24,20,.06)` | popovers, dialogs, walkthrough callout |

Chart series (flat, distinguishable, colour-blind-safe order): `#008463`, `#2F5DB8`, `#C2780C`,
`#7A4FB5`, `#3E8E9E`, `#B5475A`. Never red/green as the only signal.

Type scale (Inter): 12 / 13 / 14 (body) / 16 / 20 / 24 / 32 / 44 (narrative headline max 56).
Weights 400, 500, 600. Line-height 1.5 body, 1.2 headings.

## Shells

- **Signal Loop and Agent Ops share one shell**: light sidebar (`--bg-subtle`, 1px right border),
  product name + small mark at top, nav items 14px/500 with 16px icons, selected item uses
  `--accent-subtle` fill and `--accent-text`. Section labels sentence case. A product switcher
  ("Signal Loop" / "Agent Ops") replaces the two different sidebars (dark green vs navy).
- **Top bar**: page title (20px/600), optional short subtitle, right side: live-AI budget as plain
  text ("Live AI · $0.07 of $15 used"), time-zone as a small select, not a three-button toggle.
- **Narrative scenes**: white page, same top bar style (product mark, chapter name, progress
  "4 of 17"), content centred in a 1120px column, headline 44–56px/600, one supporting line,
  then one clear diagram or set of cards. Bottom bar: Back / Next buttons and a thin progress
  bar. Keyboard hints in a single muted line.
- **Walkthrough callout**: white card, `--shadow-2`, 1px border, 8px radius, step count
  "Step 3 of 7", title 16px/600, body 14px, primary button "Next". Spotlight dims the page with a
  flat `rgba(17,22,20,.45)` overlay, no blur.
