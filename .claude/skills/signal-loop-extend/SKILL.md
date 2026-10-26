---
name: signal-loop-extend
description: Extend the Signal Loop walkthrough or Agent Ops. Use when adding or changing a walkthrough chapter, step, narrative scene, branch, Guide nudge or tour anchor (src/tour), or registering a new agent in Agent Ops (data/platform/agents.json), and when deciding which tests to run for such a change.
---

# Extend the walkthrough or Agent Ops

Design authority: `docs/DESIGN.md`. Tour engine: `src/tour/engine/` (types in `types.ts`). Script: `src/tour/script/`. The on-page Guide: `src/tour/guide/` (`Guide.tsx`, placement in `dock.ts`, per-page nudges in `nudges.ts`). After any change, update `docs/WALKTHROUGH.md` and, if spoken lines change, `docs/speaker-notes.md`.

## Design rules that apply to every change

- One light theme, Inter only, flat fills: no gradients, glows, blurs or letter-spaced uppercase.
- Sentence case. Plain English for a VP of Customer Success; keep jargon behind "How this works" (`more`).
- A step's `body` is 20 words or fewer and says why; detail goes in `more` ("How this works").
- Motion only shows a change of state: 120–240 ms for UI, data reveals up to 600 ms once, no bounce or loops; reduced motion draws the final frame.
- A scene shows all of its content at once, with one staggered entrance on arrival (`Enter` in `src/narrative/components.tsx`). No beats, no click-to-reveal, no flip cards; only Back / Next and ← → move on, never a click on the page.
- "Decision model", "Main model" and "Backup model" on screen; exact model ids only on `/app/settings`.
- Product UI is built only from `src/ds` (tokens, components, Shell) and `src/app/components/domain.tsx`; see `docs/DESIGN.md`.
- Every number on screen is either read from real data or labelled as an assumption or simulated.

## Add a tour anchor

1. Add the id and a one-line description to `ANCHORS` in `src/tour/anchors.ts` first, so both sides agree.
2. Place it in the product UI with `{...tourAnchor('your.id')}` (the helper in `anchors.ts`), which renders `data-tour="your.id"`.
3. Use it as a step `target` (a list is a priority order: first one on screen wins) or `highlight`.

## Add or change a product step

Edit `src/tour/script/steps.ts`. A step needs `id`, `chapter`, `kind`, `title`, `body`, `next`, and usually `route`, `target`, `waitFor` (`highlight` adds soft rings). The Guide places itself; there is no per-step placement.
- `waitFor`: an event from `src/shared/events.ts` (`{ event, where?, hint }`), a `{ predicate }`, or `'next'` with a `ready` check (for example `stepDone(ctx.run, 'ground')`).
- Data-driven copy goes in `src/tour/script/copy.ts` and must degrade to honest generic text when data is missing; never promise something the screen may not show.
- Branch-only steps: route to them from `next: (ctx) => …` using `ctx.path`, and add their ids to the exclusion list in `MAIN_ORDER` at the bottom of `steps.ts`.
- New routes go in `src/tour/script/routes.ts` (`R`) and must match `src/app/routes.tsx` / `src/platform`.
- Presenter notes: `STEP_NOTES` in `src/tour/script/notes.ts`.

## Add or change a Guide nudge

Every Switchboard and Agent Ops page has one entry in `NUDGES` (`src/tour/guide/nudges.ts`): `match`, `page`, an imperative `title`, a one-line `body` that says what is simulated, and an optional `show` anchor for "Show me". A new page needs a nudge: `tests/unit/tour/nudges.test.ts` checks the list against the routes.

## Add a chapter or narrative scene

1. Add the id to `ChapterId` (and `SceneId` for a scene) in `src/tour/engine/types.ts`.
2. Add the chapter to `CHAPTERS` in `src/tour/script/chapters.ts` with `part`, `title`, `layer`, `objective`, `targetSec`, and to the right `GROUPS` entry (Introduction, The platform, Closing). Keep the sum of `targetSec` at 1,500 (25:00) by trimming another part; the hub shows `TOTAL_TARGET_SEC`. The talk is ten chapters (three, five, two); adding one is a deliberate change to that shape.
3. For a scene: create `src/narrative/scenes/<Name>.tsx` (a component with no props: `SceneHead` for the headline, `Enter` with staggered `delay`s for the parts, `useCalm()` for reduced motion; everything fits between the bars at 1440×900), register it in `SCENES` in `src/narrative/scenes/index.ts`, and add a `kind: 'scene'` step with `scene` and `route: R.scene('<chapter id>')`. Step ids are `<chapter>.<what>`; a scene that is a whole chapter uses the chapter id.
4. Add `NOTES['<id>']` in `notes.ts` with `time` matching `targetSec`, `say` and `click`.
5. Renumber `part` for every later chapter and update the parts table in `docs/WALKTHROUGH.md`.

## Add a branch

Branches are `TOUR_PATHS` in `src/tour/engine/types.ts` with labels in `PATH_LABELS`; the entry file per branch is `data/tour-files.json`. A new branch needs a featured library file with `tourPath` set (enforced by `scripts/data/check.ts`), a recorded replay (`npm run replays:record`), intro copy in `introFor` (`copy.ts`), and a Playwright path in `tests/e2e/tour/branches.spec.ts`.

## Register a new agent in Agent Ops

1. Add an entry to `agents` in `data/platform/agents.json`: `record` (id, name, purpose, owner, business owner, `builtWith`, status, data access, classification, `baselineMinutesPerUnit`, `unitLabel`, review dates and `reviewCadenceDays`), `profile` (success metric, budget and per-run cap, SLO targets, security review, integrations) and `sim` (generator parameters for `scripts/platform/simulate.ts`, never shown in the UI).
2. Give it all nine `standard` checks from `STANDARD_CHECKS` (`src/shared/platform-contracts.ts`) with honest `passed` and `evidence`. A failed check is fine and informative.
3. Label it: a simulated agent says so in the `note` and its evidence; a baseline is an assumption until measured.
4. A real agent reports through `src/worker/platform/sdk.ts` (logs, spans, usage events, work units), with one trace per run.
5. Seed locally: `npm run db:seed:platform:local`, then check `/ops`, the registry and the agent page.
6. If you change Signal Loop's baseline, `MINUTES_SAVED_PER_CALL` in `src/shared/scoring.ts` must equal `baselineMinutesPerUnit` (`tests/unit/shared/baseline.test.ts`).

## Tests to run

| Change | Command |
|---|---|
| Any | `npm run typecheck` and `npm test` (unit + worker) |
| Tour copy, steps, placement | `npx vitest run --project unit tests/unit/tour` |
| Walkthrough flow or branches | `npx playwright test --project=tour-desktop` (and `--project=tour-mobile` for layout) |
| Product UI | `npx playwright test --project=app` |
| Agent Ops | `npx vitest run --project unit tests/unit/platform` and `npx playwright test --project=platform-desktop` |
| Worker routes or gate | `npx vitest run --project worker` |

Do not deploy from this skill; use `signal-loop-operate`, which requires Hunter's go-ahead.
