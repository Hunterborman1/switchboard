---
name: signal-loop-present
description: Run or rehearse the 25-minute Signal Loop walkthrough for the Invoca panel. Use when Hunter asks to prep, rehearse, time, or present the walkthrough; to set up the presenter view; to check the demo is ready before a call; or when something breaks live (stuck run, the Guide can't find a step's target, budget hit, login loop) and he needs a recovery move.
---

# Present the Signal Loop walkthrough

The presentation is 19 chapters, 25:00 of target time, over the real product (`/app`) and Agent Ops (`/ops`) at `https://repos.hunterborman.com/repo/invoca/`. Chapters are numbered 1–19 in one sequence; the scene rail, the Guide's chapter picker and the presenter view all use the same numbers (`src/tour/script/chapters.ts`).

Read first, only as needed:
- `docs/WALKTHROUGH.md`: per-chapter goal, clicks, numbers with sources, and justifications.
- `src/tour/script/notes.ts`: the exact speaker lines the presenter view shows.
- `docs/speaker-notes.md`: the long-form talk track.

## Rules

- Never type, paste or display the password, a signed link, or the owner link in chat, notes or a shared screen. Hunter enters them himself.
- Never deploy, reseed or flip the kill switch while the panel holds the link. That is `signal-loop-operate`, and it needs Hunter's go-ahead.
- Quote numbers from the Guide and the screen, not from memory. The Guide reads the viewer's real data.

## How the viewer moves around

- **Scenes:** a chapter rail on the left at 1,200 px and wider; narrower, the menu button in the scene's top bar (or Esc) opens the same list.
- **Product pages:** the Guide, the box in the corner (bottom-right on desktop, a bottom sheet on phones). In presentation mode it shows the step, why it matters, "Your turn" when the viewer has to act (with "Show me"), Back / Next or "Skip this step", and "Explore on your own". Its chapter title opens every chapter.
- **Explore on your own** leaves the presentation and remembers the step; the Guide then suggests one thing to try on each screen; **Resume presentation** returns to the same step. If the viewer never started, it reads "Start the presentation".
- No scrim: the target gets a calm ring and the Guide moves (or folds) so it never covers it.

## Prep checklist (T-15 minutes)

1. **Clean state.** Use a fresh browser profile (or a private window) so the workspace and presentation state start empty. If reusing a profile, open Settings → *Reset workspace*. The walkthrough always sends `rerun: true`, so Brightline runs live again; outside the presentation, New conversation offers *Run again live* for a file already run.
2. **Presenter view pairing.** Open `/repo/invoca/` (shared screen, full screen, zoom 100%) and `/repo/invoca/presenter` (laptop) in the **same browser profile**: they sync over a `BroadcastChannel`, which does not cross profiles or devices. The presenter must say "Connected to the main window" and update when you press → in the main window.
3. **Budget.** The budget gauge on Usage and health (`/app/health`): live AI needs headroom under the $15 cap (`wrangler.jsonc` → `BUDGET_LIMIT_USD`). At the cap, runs replay recorded real executions and say so. That is fine; mention it in chapter 14.
4. **Warm-up.** Run Brightline once in a separate private window, then close it.
5. **Signed link validity.** If the panel uses a signed link, confirm its `expiresAt` (printed by `npm run sign-link` when issued) is after the session. A signed-in viewer's `GET /api/session` returns `linkExpiresAt`.
6. **Backups ready.** Keep the Q&A backup list open in the presenter view. Close Slack and notifications.
7. **Keys.** → or Space next, ← back. Esc opens the chapter menu on screens narrower than 1,200 px. A clicker sending PageDown / PageUp works. In review: A approve, E edit.

## Timing and clicks

Presenter timer: amber past a chapter's target, red at 125%. If more than a minute behind by chapter 10, skip "Try another file" on the Timing step.

| Start | Chapter | Target | Click |
|---|---|---|---|
| 0:00 | 1 Every call is a signal | 0:30 | → once |
| 0:30 | 2 What's real in this demo | 1:15 | read the two columns; Next (built from scratch in 48 hours) |
| 1:45 | 3 Where feedback gets lost | 1:15 | → twice |
| 3:00 | 4 Why this option, and not the others | 1:30 | → once (the three options, then how it was built) |
| 4:30 | 5 Jobs to be done | 1:45 | open the cards, then → |
| 6:15 | 6 Today and tomorrow | 1:40 | → three times |
| 7:55 | 7 The platform | 1:00 | → three times, then Open the product |
| 8:55 | 8 A call comes in | 1:00 | Browse conversations → pick Brightline (or let a panelist pick) and Open → Process conversation |
| 9:55 | 9 Watch it run | 2:15 | Next as each step lands; read the quote count; on the Timing card read triage alongside extraction and the code steps out loud |
| 12:10 | 10 Human in the loop | 1:30 | A on one item; E on another, change a field, Save and send |
| 13:40 | 11 Right owner, right channel | 1:30 | edit the pricing rule (VP Product, ARR over $250k); Next to the Jira preview, then Connections |
| 15:10 | 12 Patterns, not anecdotes | 1:00 | open the highlighted theme; Next |
| 16:10 | 13 Close the loop | 0:50 | move the ticket to Shipped; Next |
| 17:00 | 14 Prove it | 1:30 | Next; Promote; read the block |
| 18:30 | 15 Operate it | 1:30 | Next through the exec view and the run's trace |
| 20:00 | 16 Earning trust: rollout | 2:15 | → twice |
| 22:15 | 17 The next 12–18 months | 1:15 | → once |
| 23:30 | 18 From proof of concept to production | 0:45 | → once |
| 24:15 | 19 Scorecard | 0:45 | Explore freely; open Q&A |

Source: `src/tour/script/chapters.ts` (targetSec) and `src/tour/script/notes.ts` (click lists).

Lines that must match the screen:
- Chapter 2: all of the AI is built and working; the connections and the data are simulated, each with its reason. Say "built from scratch in 48 hours".
- Chapter 9: say the quote count the Guide shows. Offer *See a rejected quote* only if the button is on screen. On the Timing card, read the real numbers; a replay says it is a replay, re-timed to today's step order.
- Chapter 12: read the theme name and account count off the Guide.
- Chapter 14: the Guide reads the eval numbers; v5 is blocked on precision (88.7% to 59.7%), cost and p95 are shown, not gated.
- Chapter 15: the history is real runs with simulated users; only this session is live.

## Branches

If a panelist picks another file in chapter 8, name the branch before pressing Process conversation: clean notes, messy (ASR, Slack export or email thread; the Guide says which), injection attempt, friendly check-in (right answer is nothing), PHI-heavy call (switch Before and After). Branches only change chapter 9; every path rejoins at chapter 10. Details per branch are in `docs/WALKTHROUGH.md` → Branches.

## Fallbacks

- **Replay mode:** automatic when live AI is off, over budget, or a featured run is not finished within 25 s (`src/shared/scoring.ts` → `LIVE_FALLBACK_AFTER_MS`). The clock and the Timing card say "Replay"; say so too.
- **Backup scenes:** `/repo/invoca/backup/<topic>` for `cost`, `security`, `failure`, `build-vs-buy`, `metrics`, `agent-ops`, `differently`.
- **Jump anywhere:** the chapter rail on scenes (or the top bar's menu, or Esc, on narrower screens); the Guide's chapter title on product pages; or deep-link `?tour=<stepId>` (step ids in `src/tour/script/steps.ts`).
- **Write-up:** `/repo/invoca/write-up` covers the four pillars on one page.
- **Demo video:** the plan calls for a backup recording (`docs/PLAN.md` → Handoff package). It is not in the repo; confirm Hunter has it locally before relying on it.

## Recovery if something breaks live

| Symptom | Move |
|---|---|
| Run sits on a step | Keep talking through the step's "How this works". A run with no progress for 40 s is handed to the durable Workflow (`src/worker/runs.ts` → `STALLED_AFTER_MS`); a featured file replays after 25 s. If still stuck, use the Guide's chapter title to jump to chapter 10 (Human in the loop) and narrate from the recorded run. |
| The Guide says "That part of the page isn't on screen right now" | The target did not appear in time; the step still works. Press Next or →. |
| A step's data never arrives ("Starting the run…", "Finishing the run…") | After 9 seconds Next works anyway; or "Skip this step". |
| The viewer wandered off | "Resume presentation" in the Guide goes back to the same step; "Explore on your own" is safe to press any time. |
| The Guide is in the way | Minimize it (the dash in its header); it stays a small "Guide" pill until opened. On phones, fold the sheet with its chevron. |
| "Live AI budget reached" | Expected at the cap. Say "past the cap it replays, never an outage" and continue. |
| Agent Ops panel empty | Go to `/backup/agent-ops` and describe the registry and standard. |
| Presenter view says "Waiting…" | Reopen `/presenter` in the same profile as the main window; present from `notes.ts` lines if needed. |
| Signed out or link expired | Hunter signs in with the password himself, off the shared screen. |
| Site down | Use the write-up page or `docs/WALKTHROUGH.md` locally, and the demo video if it exists. Do not redeploy during the session. |

## After the session

Hand over to `signal-loop-qa` for questions. Do not reset or clean up workspaces until the panel's link has expired or Hunter says so.
