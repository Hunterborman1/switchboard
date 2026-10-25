# Signal Loop Narrative

The presentation layer: the hub, the walkthrough scenes, the walkthrough overlay, the
presenter view, the write-up and the Q&A pages. It follows `docs/DESIGN.md`: one light, flat
theme, Inter only, no gradients, glows or blur, short functional motion. Everything here is
`--n-*` tokens and `n-*` classes, declared on `.sl-n` (pages) and `.sl-n-portal` (walkthrough UI
portalled over the product), so it never collides with the product's own tokens.

## Tokens (`tokens.css`)

| Group | Tokens |
|---|---|
| Colour | `--n-bg #FFF` · `--n-bg-subtle` · `--n-bg-muted` · `--n-border` · `--n-border-strong` · `--n-text` · `--n-text-2` · `--n-text-3` · `--n-accent #008463` (+ `-hover`, `-text`, `-subtle`) · `--n-success` / `--n-warning` / `--n-danger` / `--n-info` (+ `-subtle`) · `--n-scrim` rgba(17,22,20,.45) |
| Type | `--n-font-body` Inter Variable (also `--n-font-display`) · `--n-font-mono` only for IDs and code · `--n-text-xs…3xl` (12–32) · `--n-display-sm/md/lg` (headlines up to 56) |
| Space | `--n-s-1…9` (4px grid) · `--n-gutter` · `--n-column` 1120px |
| Radius | `--n-r-xs 4` (badges) · `--n-r-sm 6` (buttons) · `--n-r-md 8` (cards) |
| Elevation | `--n-shadow-1` (cards, optional) · `--n-shadow-2` (popovers, callout, menus) |
| Motion | `--n-ease` cubic-bezier(0.2,0,0,1) · `--n-ease-exit` · `--n-d-press 120` · `--n-d-ui 180` · `--n-d-layout 240` · `--n-d-data 600`. All collapse to 0 under `prefers-reduced-motion`. |
| Layers | `--n-z-overlay 9000` · `callout 9010` · `hud 9020` · `menu 9030` |

`motion.ts` mirrors these for Motion (`EASE`, `DUR`, `reveal` fade-up 6px and its reduced
twin). Nothing loops except an honest spinner while something is running.

## Components (`components.tsx`, `Scene.tsx`)

- **Scene**: still top bar (mark, part / chapter, "4 of 17"), the 1120px column, still bottom bar
  (progress line, key hints, Back / Next). Clicking empty stage advances; interactive children
  opt out with `data-no-advance`. Only the stage cross-fades between scenes (180 ms).
- **SceneHead**: one headline and one supporting line; cross-fades when its key changes.
- **Display / Lede / Eyebrow**: sentence-case Inter headings and secondary text.
- **Reveal / Reveal.Item**: short fade-up sequence.
- **Stat**: tabular number that counts up once (600 ms).
- **Card / Callout** (`assumption`, `danger`) / **Chip** / **Button** (primary, ghost, quiet) /
  **Progress / Beats / Key / KeyHint / Mark / LoopGlyph / Check**.
- **PersonaCard**: the job on the front; click or Enter reveals struggles and success (180 ms
  crossfade, no flip).

Hooks (`hooks.ts`): `useCalm()` (reduced motion, or `?motion=reduced`), `useCountUp`,
`useSize`, `useMediaQuery`.

## Scenes (`scenes/`)

Each scene is `({ beat, beats }) => JSX`, registered in `scenes/index.ts`. Every scene is a head
plus one visual, renders its final frame at once under reduced motion, and stacks to one
column at 390px.

| Scene | Steps |
|---|---|
| ColdOpen | a recorded 13-minute QBR with the 06:00 quote highlighted → "Every call is a signal." and what that sentence becomes |
| BlackHole | where feedback comes from → 100 pieces through three handoffs, losses shown at each → total and the labelled assumption |
| Why | Invoca Signal AI row → the same shape for Signal Loop → four reasons |
| Jtbd | four persona cards (open each) → the emotional job as the headline |
| States | swimlane relay → leaks appear one by one → Signal Loop seals them → the loop closes |
| Rollout | four phases → what is measured and reported → the operating loop and how it's run |
| Horizon | six milestones over 18 months → what doesn't change |
| Production | today's stack → the production column fills in row by row |
| Scorecard | real numbers from the viewer's workspace and Agent Ops |

Q&A pages live in `backup/` and are deep-linkable at `/backup/:topic`.
