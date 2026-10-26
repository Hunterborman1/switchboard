---
name: signal-loop-present
description: Run or rehearse the 25-minute Signal Loop walkthrough for the Invoca panel. Use when Hunter asks to prep, rehearse, time, or present the walkthrough; to set up the presenter view; to check the demo is ready before a call; or when something breaks live (stuck run, the Guide can't find a step's target, budget hit, login loop) and he needs a recovery move.
---

# Present the Signal Loop walkthrough

The presentation is 10 chapters, 25:00 of target time, over the real product (`/app`) and Agent Ops (`/ops`) at `https://repos.hunterborman.com/repo/invoca/`: three to set up (Introduction), five in the product (The platform; chapter 4 opens on the platform scene), two to close (Closing). Chapters are numbered 1–10 in one sequence; the scene rail, the Guide's chapter picker and the presenter view all use the same numbers (`src/tour/script/chapters.ts`). Then the write-up and Q&A at `/write-up`.

Read first, only as needed:
- `docs/WALKTHROUGH.md`: per-chapter goal, clicks, numbers with sources, and justifications.
- `src/tour/script/notes.ts`: the exact speaker lines the presenter view shows.
- `docs/speaker-notes.md`: the long-form talk track.

## Rules

- Never type, paste or display the password, a signed link, or the owner link in chat, notes or a shared screen. Hunter enters them himself.
- Never deploy, reseed or flip the kill switch while the panel holds the link. That is `signal-loop-operate`, and it needs Hunter's go-ahead.
- Quote numbers from the Guide and the screen, not from memory. The Guide reads the viewer's real data.

## How the viewer moves around

- **Scenes:** everything is on screen at once (one short entrance animation, nothing to click open). Only Back / Next, ← → or a clicker move on; a click on the page does not. A chapter rail on the left at 1,200 px and wider; narrower, the menu button in the scene's top bar (or Esc) opens the same list.
- **Product pages:** the Guide, a full-width bar along the bottom of the page, with a green "Guided walkthrough" tag (a bottom sheet on phones). In presentation mode it shows the step, why it matters, "Your turn" when the viewer has to act (with "Show me"), Back / Next or "Skip this step", and "Explore on your own". Its chapter title opens every chapter.
- **Explore on your own** leaves the presentation and remembers the step; the Guide then suggests one thing to try on each screen; **Resume presentation** returns to the same step. If the viewer never started, it reads "Start the presentation".
- No scrim: the target gets a green ring that pulses and is scrolled into view above the Guide, which covers nothing (the page, dialogs and drawers keep clear of it).

## Prep checklist (T-15 minutes)

1. **Clean state.** Use a fresh browser profile (or a private window) so the workspace and presentation state start empty. If reusing a profile, open Settings → *Reset workspace*. The walkthrough always sends `rerun: true`, so Brightline runs live again; outside the presentation, New conversation offers *Run again live* for a file already run.
2. **Presenter view pairing.** Open `/repo/invoca/` (shared screen, full screen, zoom 100%) and `/repo/invoca/presenter` (laptop) in the **same browser profile**: they sync over a `BroadcastChannel`, which does not cross profiles or devices. The presenter must say "Connected to the main window" and update when you press → in the main window.
3. **Budget.** The budget gauge on Usage and health (`/app/health`): live AI needs headroom under the $15 cap (`wrangler.jsonc` → `BUDGET_LIMIT_USD`). At the cap, runs replay recorded real executions and say so. That is fine; mention it in chapter 8.
4. **Warm-up.** Run Brightline once in a separate private window, then close it.
5. **Signed link validity.** If the panel uses a signed link, confirm its `expiresAt` (printed by `npm run sign-link` when issued) is after the session. A signed-in viewer's `GET /api/session` returns `linkExpiresAt`.
6. **Backups ready.** Keep the Q&A backup list open in the presenter view. Close Slack and notifications.
7. **Keys.** → next, ← back (Space and Enter do not advance a scene). Esc opens the chapter menu on screens narrower than 1,200 px. A clicker sending PageDown / PageUp works. In review: A approve, E edit.

## Timing and clicks

Presenter timer: amber past a chapter's target, red at 125%. If more than a minute behind by the end of chapter 4, skip "Try another file" on the Timing step next time, and keep chapters 9 and 10 to their three headlines each.

| Start | Chapter | Target | Click |
|---|---|---|---|
| 0:00 | 1 Every call is a signal | 2:00 | nothing to click: the call, where feedback gets lost (an assumption) and what it becomes are all on screen; Next |
| 2:00 | 2 Jobs to be done, today and tomorrow | 2:30 | nothing to click: the four people, then today and tomorrow; Next |
| 4:30 | 3 What I built, and why | 2:30 | point at the GitHub link under the headline; the three options; how it's built, real and simulated; Next |
| 7:00 | 4 A call comes in | 4:30 | the platform scene, then Open the product; Browse conversations, pick Brightline (or let a panelist pick) and Open, Process conversation; Next as each step lands; read the quote count; on the Timing card read triage alongside extraction and the code steps out loud |
| 11:30 | 5 Human in the loop | 1:45 | A on one item; E on another, change a field, Save and send |
| 13:15 | 6 Right owner, right channel | 1:45 | edit the pricing rule (VP Product, ARR over $250k); Next to the Jira preview, then Connections |
| 15:00 | 7 Patterns, and closing the loop | 1:45 | open the highlighted theme; Next; move the ticket to Shipped; Next |
| 16:45 | 8 Under the hood: prove it, then operate it | 3:15 | the Under the hood scene (prompts, failures, data); Next; Promote; read the block; Next through the exec view and the run's trace |
| 20:00 | 9 Earning trust: rollout and adoption | 2:30 | left to right: roll it out, helpful not replacing, reasons to trust it; Next |
| 22:30 | 10 The next 12–18 months | 2:30 | left to right: what comes next, what changes the game, the path to production; Next opens your scorecard; Explore freely, then the write-up and Q&A |

Source: `src/tour/script/chapters.ts` (targetSec) and `src/tour/script/notes.ts` (click lists).

Lines that must match the screen:
- Chapter 1: "40 of 100" is an assumption, and the screen says so.
- Chapter 3: all of the AI is built and working; the connections and the data are simulated, each with its reason. Say "built from scratch in 48 hours".
- Chapter 4: say the quote count the Guide shows. Offer *See a rejected quote* only if the button is on screen. On the Timing card, read the real numbers; a replay says it is a replay, re-timed to today's step order.
- Chapter 7: read the theme name and account count off the Guide.
- Chapter 8: the Guide reads the eval numbers; v5 is blocked on precision (88.7% to 59.7%), cost and p95 are shown, not gated. In Agent Ops the history is real runs with simulated users; only this session is live.
- Chapter 9: the hours figure is an assumption until the time study.
- Chapter 10: read the per-call cost off the card.

## Branches

If a panelist picks another file in chapter 4, name the branch before pressing Process conversation: clean notes, messy (ASR, Slack export or email thread; the Guide says which), injection attempt, friendly check-in (right answer is nothing), PHI-heavy call (switch Before and After). Branches only change the run in chapter 4; every path rejoins at chapter 5. Details per branch are in `docs/WALKTHROUGH.md` → Branches.

## Fallbacks

- **Replay mode:** automatic when live AI is off, over budget, or a featured run is not finished within 25 s (`src/shared/scoring.ts` → `LIVE_FALLBACK_AFTER_MS`). The clock and the Timing card say "Replay"; say so too.
- **Q&A:** `/repo/invoca/backup/<topic>` for `cost`, `security`, `failure`, `build-vs-buy`, `metrics`, `agent-ops`, `differently` (the presenter view's Q&A buttons jump there).
- **Jump anywhere:** the chapter rail on scenes (or the top bar's menu, or Esc, on narrower screens); the Guide's chapter title on product pages; or deep-link `?tour=<stepId>` (step ids in `src/tour/script/steps.ts`).
- **Write-up:** `/repo/invoca/write-up` and `/repo/invoca/write-up/<chapter>` cover the brief, chapter by chapter, including the jobs to be done. For AI assistants it offers its Markdown, a .zip of every doc and the MCP connection.
- **Demo video:** the plan calls for a backup recording (`docs/PLAN.md` → Handoff package). It is not in the repo; confirm Hunter has it locally before relying on it.

## Recovery if something breaks live

| Symptom | Move |
|---|---|
| Run sits on a step | Keep talking through the step's "How this works". A run with no progress for 40 s is handed to the durable Workflow (`src/worker/runs.ts` → `STALLED_AFTER_MS`); a featured file replays after 25 s. If still stuck, use the Guide's chapter title to jump to chapter 5 (Human in the loop) and narrate from the recorded run. |
| The Guide says "That part of the page isn't on screen right now" | The target did not appear in time; the step still works. Press Next or →. |
| A step's data never arrives ("Starting the run…", "Finishing the run…") | After 9 seconds Next works anyway; or "Skip this step". |
| The viewer wandered off | "Resume presentation" in the Guide goes back to the same step; "Explore on your own" is safe to press any time. |
| The Guide takes too much room | Minimize it (the dash in its top row); it folds to a one-line strip that still shows the next action. On phones, fold the sheet with its chevron. |
| "Live AI budget reached" | Expected at the cap. Say "past the cap it replays, never an outage" and continue. |
| Agent Ops panel empty | Go to `/backup/agent-ops` and describe the registry and standard. |
| Presenter view says "Waiting…" | Reopen `/presenter` in the same profile as the main window; present from `notes.ts` lines if needed. |
| Signed out or link expired | Hunter signs in with the password himself, off the shared screen. |
| Site down | Use the write-up page or `docs/WALKTHROUGH.md` locally, and the demo video if it exists. Do not redeploy during the session. |

## After the session

Hand over to `signal-loop-qa` for questions. Do not reset or clean up workspaces until the panel's link has expired or Hunter says so.
