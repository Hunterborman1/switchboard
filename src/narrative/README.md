# src/narrative: the presentation scenes

This folder holds the six scenes of the presentation (`/walkthrough/:part`) and the frame they
share with the site pages. Scenes are pages of the same product. They use the design system in
`src/ds` and follow [docs/DESIGN.md](../../docs/DESIGN.md).

## Read first

- `Scene.tsx`: the scene frame. The 52 px top bar shows the mark, the chapter and "4 of 10". Its
  right end is a slot for the chapter menu and the timer (`src/tour/hud/sceneSlot.tsx`). The
  bottom bar has a key hint, Back and Next, and a thin progress line.
- `components.tsx`: the shared parts.
  - `SiteBar`: the same 52 px bar on the hub, write-up, presenter and 404 pages.
  - `SceneHead`: the headline, an optional metadata row and one supporting line.
  - `Enter`: one part of a scene arriving once, with a fade and a 6 px rise.
  - `Stat`: a number that counts up once. Also `Brand`, `Display`, `Lede`, `Arrow`, `Check`, `Label`.
- `scenes/index.ts`: `SCENES`, which maps each scene id to its component.
- `hooks.ts`: `useCalm()` (reduced motion, or `?motion=reduced`), `useCountUp`, `useSize`,
  `useMediaQuery`. `motion.ts` holds the easing curves and durations.
- `narrative.css` and `scenes/scenes.css`: the styles. `tokens.css` defines `--n-*` tokens.
  Only two are read: the 1120 px column (`--n-column`) and the headline size (`--n-display`,
  32 to 48 px). New CSS reads the design system's tokens directly.

Page roots use the classes `ds-app sl-n n-page`. Walkthrough UI drawn over the product uses
`sl-n-portal`.

## Scenes

| Scene | Chapter | What is on screen |
|---|---|---|
| Signal | 1 · Every call is a signal | The QBR quote at 06:00, where feedback gets lost (labelled an assumption), and what Signal Loop makes of it |
| Real | 2 · Built in 48 hours: what's real | The byline and GitHub link, then what is built beside what is simulated, each with its reason |
| Why | 3 · Why this option | The three options with a verdict each, and how this one is built |
| Platform | 4 · A call comes in (first step) | In, Decide, Analyse, Out: the platform on one screen |
| Production | 9 · Making it real | Roll it out, grow it, run it: three columns side by side |
| Scorecard | 10 · Scorecard | Real numbers from the viewer's workspace and Agent Ops |

## How it connects

- `src/web/pages/Walkthrough.tsx` draws the scene for the current step. The step's `scene` field
  in `src/tour/script/steps.ts` picks it.
- On screens 1,200 px and wider, the chapter rail (`src/tour/hud/Hud.tsx`) sits left of the
  scene. The bars and the rail stay mounted between scenes. Only the stage cross-fades.
- Production and Scorecard read live numbers through `src/tour/api.ts`.

## Change it safely

- A scene shows all of its content at once. Its parts enter once, staggered with `Enter`, and
  settle within about 850 ms. Nothing waits for a click.
- Only Back and Next, the arrow keys, or a clicker's PageUp and PageDown move on. A click on the
  page never does.
- Every scene fits between the bars at 1440×900 and drops to one column at 390 px. Layouts use
  container queries (`@container scene`), so they work with or without the rail.
- Every number is read from data or labelled as an assumption.
- To add a scene, follow the
  [`signal-loop-extend` skill](../../.claude/skills/signal-loop-extend/SKILL.md).
- Tests: `npx playwright test --project=tour-desktop --project=tour-mobile` and
  `npx vitest run --project unit tests/unit/tour`.

## The write-up and the Q&A

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
