# src/tour: the walkthrough engine, script and Guide

This folder runs the presentation. It holds the step engine and the script: 10 chapters and
their steps. It also holds the Guide, the bar that docks along the bottom of every Switchboard and
Agent Ops page. The scenes themselves live in `src/narrative/`.

The full chapter-by-chapter account, with sources, is [docs/WALKTHROUGH.md](../../docs/WALKTHROUGH.md).

## Folders

- `script/`: what the presentation says and does.
  - `chapters.ts`: the 10 chapters in three groups. Their target times add up to 25:00.
  - `steps.ts`: every step, in order. Branch-only steps are listed in `BRANCH_STEPS`.
  - `copy.ts`: narration built from the viewer's real data, with honest fallbacks.
  - `notes.ts`: speaker notes for the presenter view.
  - `routes.ts`: the paths steps open. They must match the product routes.
- `engine/`: the step machine.
  - `TourProvider.tsx`: the current step, the keyboard, and the link to the presenter view. State
    lives in the URL (`?tour=<stepId>&path=<branch>`) and in `sessionStorage`.
  - `types.ts`: `Step`, `ChapterId`, `SceneId` and the six branches (`TOUR_PATHS`).
  - `useAnchor.ts`: finds the element a step points at.
- `guide/`: the Guide on product pages.
  - `Guide.tsx`: presentation mode (the step, "Your turn", Back and Next) and explore mode (one
    nudge per page, and "Resume presentation").
  - `dock.ts`: pure placement maths. It works out where the page must scroll so the target shows
    above the Guide.
  - `nudges.ts`: one "Try it" nudge per product page.
- `hud/`: the chrome around the scenes. `Hud.tsx` has the chapter rail (1,200 px and wider), the
  chapter menu for narrower screens and the presenter timer. `ChapterList.tsx` is the one chapter
  list that the rail, the menu and the Guide's picker all render.
- `anchors.ts`: every element the walkthrough can point at.
- `api.ts`: a read-only API client. The product owns all writes.
- `dev/DevHarness.tsx`: a dev-only stand-in product, opened with `?dev=1`.
- `tour.css`: styles for the Guide, the chapter rail and the target ring.

## How it connects

- The product places anchors with `tourAnchor(id)`, which renders `data-tour="<id>"`. That is the
  only thing the product imports from this folder.
- The product reports what the viewer did through events in `src/shared/events.ts`. Steps wait on
  those events, or on live API data, before they move on.
- `src/web/RootLayout.tsx` mounts the `TourProvider` and the Guide. `src/web/pages/Walkthrough.tsx`
  draws the scene for the current step.

## Change it safely

- Follow the [`signal-loop-extend` skill](../../.claude/skills/signal-loop-extend/SKILL.md). It
  covers chapters, steps, anchors, nudges and branches.
- Keep the chapter target times at 1,500 seconds in total. Chapters are numbered 1 to 10 the same
  way on every surface.
- A step's `body` is 20 words or fewer. Copy must never promise something the screen may not show.
- Add a new anchor to `ANCHORS` first. Give every new product page a nudge.
- Update `docs/WALKTHROUGH.md`, and `docs/speaker-notes.md` if the spoken lines change.
- Tests: `npx vitest run --project unit tests/unit/tour`, then
  `npx playwright test --project=tour-desktop`. Add `--project=tour-mobile` for layout changes.
