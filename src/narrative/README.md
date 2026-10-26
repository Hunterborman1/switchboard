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
  "4 of 10", and a slot for the chapter menu and presenter timer, `tour/hud/sceneSlot.tsx`), the
  1120px column, and a bottom bar with one muted key hint, Back / Next and one thin progress line.
  Only Back / Next (and ← →, or a clicker's PageUp / PageDown) move on; a click on the page never
  does. On screens 1200px and wider the page is a deck: the persistent chapter rail
  (`tour/hud/Hud.tsx`, `ChapterRailNav`) sits to the left. The top bar, bottom bar and rail stay
  mounted between scenes and never re-animate; only the stage cross-fades. Scene layouts respond
  to the scene's own width through container queries (`@container scene`), so they read the same
  with or without the rail.
- **SiteBar**: the same 52px bar for the hub, write-up, Q&A, presenter and not-found pages.
- **SceneHead**: the headline, an optional metadata row (a byline, a link) and one supporting line.
  A scene has one head, and it never changes while the scene is on screen.
- **Enter**: one part of a scene arriving once, with the scene: a fade and a 6px rise after a
  `delay`. Scenes stagger their parts so the whole entrance settles within about 600–850 ms.
  Nothing waits for a click; reduced motion draws the final frame.
- **Stat** (count-up, 600ms once), **Check**, **Arrow**, **Label**, **Display**, **Lede**.

Hooks (`hooks.ts`): `useCalm()` (reduced motion, or `?motion=reduced`), `useCountUp`, `useSize`,
`useMediaQuery`. Motion constants are in `motion.ts`.

## Scenes (`scenes/`)

Each scene is a component with no props, registered in `scenes/index.ts`. It shows all of its
content at once: a head, then its visual, entering once on arrival (staggered with `Enter`), its
final frame at once under reduced motion, and one column at 390px. Every scene fits between the
bars at 1440×900.

| Scene | Chapter | What is on screen |
|---|---|---|
| Signal | 1 · Every call is a signal | the recorded QBR with the 06:00 quote, where feedback gets lost (100 → 72 → 55 → 40, labelled an assumption), and what Signal Loop makes of that sentence |
| Real | 2 · Built in 48 hours: what's real | the byline and the GitHub link under the headline; built and working (all of the AI, inputs, outputs) beside simulated, each with its reason |
| Why | 3 · Why this option | the three options, each with its verdict, Option 3 chosen, and how it is built (raw code, three measured model roles, one Worker) |
| Platform | 4 · A call comes in (first step) | In (any conversation), Decide (the decision model), Analyse (Signal Loop built, the rest not built), Out (the right people, by handle) |
| Production | 9 · Making it real | three sections side by side: roll it out (phases, the hours assumption, operating it), grow it (six milestones, what doesn't change), run it (the production stack, today's piece under each) |
| Scorecard | 10 · Scorecard | real numbers from the viewer's workspace and Agent Ops |

The write-up and the Q&A are read-through pages in `src/web/pages/writeup/`, with all prose as data in
`src/shared/writeup/` (which also renders each page's Markdown):

- `/write-up`: short answers on process design, the build, rollout and trust and the next 12–18
  months, the "For AI assistants" block, then the ten chapters and the Q&A topics.
- `/write-up/:chapter`: one page per chapter (`chapters.ts`), with a contents column, previous and
  next, "Open in the presentation" (`/walkthrough/<chapter>`) and links to its Markdown and the .zip.
- `/backup` and `/backup/:topic`: one page per Q&A topic (`questions.ts`, topics as `BACKUPS` in
  `src/tour/script/chapters.ts`): a tab strip of topic links, then the cards. The cost page reads
  its figures live. Nothing needs a click to be read. The presenter view's Q&A buttons open these
  pages, and old `/write-up#<topic>` links land on them.
