# Signal Loop Narrative

The presentation layer: editorial dark, one luminous accent, slow deliberate motion. It is
deliberately separate from the product's HB Systems theme (`--cn-*`): everything here is
`--n-*` tokens and `n-*` classes, declared on `.sl-n` (pages) and `.sl-n-portal` (tour UI
portalled over the product), so the two never collide.

## Tokens (`tokens.css`)

| Group | Tokens |
|---|---|
| Colour | `--n-bg #0A231E` · `--n-bg-2 #0E2C26` · `--n-raised #12352E` · `--n-ink #F2F5E4` · `--n-ink-2` 68% · `--n-ink-3` 48% · `--n-line` 12% · `--n-accent #8EE58E` (+ `-glow`, `-wash`) · `--n-mint #D1FFD1` · `--n-indigo #5E74E3` (sparingly) · `--n-danger #FF9C8C` · `--n-amber` (assumptions only) |
| Type | `--n-font-display` Instrument Serif · `--n-font-body` Inter Tight · `--n-font-mono` JetBrains Mono · sizes `--n-text-xs…xl`, `--n-display-sm…xl` (fluid clamps) |
| Space | `--n-s-1…9` (4px base) · `--n-gutter` · `--n-safe-top/bottom` |
| Radius | `--n-r-sm 6` · `md 10` · `lg 16` · `xl 24` · `pill` |
| Elevation | `--n-e-1…3` (inset highlight + soft drop) · `--n-glow` |
| Motion | `--n-ease` cubic-bezier(.22,1,.36,1) · `--n-d-fast 160` · `ui 280` · `product 400` · `slow 600` · `slower 700`. All durations collapse to 0 under `prefers-reduced-motion`. |
| Layers | `--n-z-overlay 9000` · `callout 9010` · `hud 9020` · `menu 9030` |

`motion.ts` mirrors the motion tokens for Motion (`EASE`, `DUR`, `STAGGER` ≤ 120 ms, the
`reveal` blur-in variant and its reduced-motion twin). Story transitions are 500–700 ms;
anything on top of the product stays ≤ 400 ms.

## Components (`components.tsx`, `Scene.tsx`)

- **Scene**: full-bleed stage with safe area, hairline footer (key hints, beat dots, advance). Clicking empty stage advances; interactive children opt out with `data-no-advance`.
- **Backdrop**: radial light, vignette and a subtle SVG grain. No gimmicks.
- **Eyebrow / Display / Lede / Kicker**: mono eyebrow, serif display with an italic mint emphasis word (`<em>`), body lede.
- **Reveal / Reveal.Item**: staggered blur-reveal.
- **Stat**: count-up figure (`useCountUp`), optional accent glow.
- **Card / PersonaCard**: surfaces; the persona card flips (click or Enter) to job, struggles, success and emotional job.
- **Callout** (with `assumption` / `danger` tones), **Chip**, **Divider**, **Button** (primary lime / ghost / quiet), **Progress**, **Beats**, **Key / KeyHint**, **Mark / LoopGlyph**.

Hooks (`hooks.ts`): `useCalm()` (reduced motion, or `?motion=reduced`), `useCountUp`,
`useSize`, `useMediaQuery`.

## Scenes (`scenes/`)

Each scene is `({ beat, beats }) => JSX`, registered in `scenes/index.ts`. Visuals are SVG
+ Motion (the black hole is the one canvas particle field). Every scene renders a static,
fully composed frame under reduced motion and stacks to a single column at 390 px.

| Scene | Beats |
|---|---|
| ColdOpen | live waveform → loop mark + "Every call is a signal." |
| BlackHole | particles from calls; ~4 in 10 reach an owner (labelled assumption) |
| Why | Invoca Signal AI row, mirrored onto Invoca's own CSM calls |
| Jtbd | four flip cards, then the emotional job |
| States | swimlane: relay → leaks drip → morph and seal → loop closes |
| Rollout | phases → adoption + hours returned → operate it (cadence, standard, enablement) |
| Horizon | 12–18 month horizon line, then what doesn't change |
| Production | POC pieces slide into their production slots |
| Scorecard | real numbers from the viewer's workspace and Agent Ops |

Backup (Q&A) scenes live in `backup/` and are deep-linkable at `/backup/:topic`.
