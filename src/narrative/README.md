# Narrative layer

The presentation pages of Switchboard: the hub, the walkthrough scenes, the walkthrough overlay,
the presenter view, the write-up and the Q&A pages. They are pages of the same product and follow
`docs/DESIGN.md`: the design system in `src/ds` for tokens and components (Button, Badge, Callout,
Kbd, ProductMark, ConnectorMark, TabLinks…), one light flat theme, Inter only, short functional
motion.

## Tokens (`tokens.css`)

Every `--n-*` token is an alias of a token in `src/ds/tokens.css`, so values change in one place.
New CSS reads the ds tokens directly (`var(--text-secondary)`, `var(--space-4)`). The only values
defined here are the ones the system has no token for: the 1120px presentation column
(`--n-column`), the headline size (`--n-display`, 32 → 48px), the data-reveal duration
(`--n-d-data`, 600ms, zero under reduced motion) and the overlay layers (`--n-z-*`).

Page roots are `ds-app sl-n n-page` (they get the system's base styles); walkthrough UI portalled
over the product is `sl-n-portal`.

## Frame and components

- **Scene** (`Scene.tsx`): the product's 52px top bar (mark and "Switchboard", the chapter crumb,
  "4 of 19", and a slot for the chapter menu and presenter timer, `tour/hud/sceneSlot.tsx`), the
  1120px column, and a bottom bar with one muted key hint, Back / Next and one thin progress line.
  Clicking empty stage advances; interactive children opt out with `data-no-advance`. On screens
  1200px and wider the page is a deck: the persistent chapter rail (`tour/hud/Hud.tsx`,
  `ChapterRailNav`) sits to the left. Scene layouts respond to the scene's own width through
  container queries (`@container scene`), so they read the same with or without the rail.
- **SiteBar**: the same 52px bar for the hub, write-up, Q&A, presenter and not-found pages.
- **SceneHead**: one headline and one supporting line per beat. All beats share one grid cell, so
  the head is as tall as its longest version and nothing moves when the beat changes.
- **Appear**: a part of a scene that arrives on a beat. It keeps its space from the start and is
  invisible (and out of the accessibility tree) until shown, so labels never appear before their
  content and nothing jumps.
- **Stat** (count-up, 600ms once), **PersonaCard** (click or Enter reveals struggles and success),
  **Check**, **Arrow**, **Label**, **Display**, **Lede**.

Hooks (`hooks.ts`): `useCalm()` (reduced motion, or `?motion=reduced`), `useCountUp`, `useSize`,
`useMediaQuery`. Motion constants are in `motion.ts`.

## Scenes (`scenes/`)

Each scene is `({ beat, beats }) => JSX`, registered in `scenes/index.ts`, with a head and one
visual, its final frame at once under reduced motion, and one column at 390px. Every beat fits
between the bars at 1440×900 and 1024×768.

| Scene | Beats |
|---|---|
| ColdOpen | the recorded QBR with the 06:00 quote → "Every call is a signal." and what the sentence becomes |
| Real | built and working (all of the AI, inputs, outputs) beside simulated, each with its reason (one beat) |
| BlackHole | where feedback comes from and the starting 100 → the handoffs and what each loses → the total and the assumption |
| Why | the three options, each with its verdict, Option 3 chosen → how it is built (raw code, three measured model roles, one Worker) |
| Jtbd | four persona cards (open each) → the emotional job as the headline |
| States | the relay → leaks one by one → Signal Loop seals them → the loop closes up the right edge |
| Platform | In (any conversation) → Decide (the decision model) → Analyse (Signal Loop built, the rest not built) → Out (the right people, by handle) |
| Rollout | four phases → what is measured and reported → the operating loop |
| Horizon | six milestones over 18 months → what doesn't change |
| Production | today's stack → the production column fills in row by row |
| Scorecard | real numbers from the viewer's workspace and Agent Ops |

Q&A pages live in `backup/` and are deep-linkable at `/backup/:topic`.
