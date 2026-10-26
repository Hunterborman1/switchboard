---
name: signal-loop-present
description: Run or rehearse the 25-minute Signal Loop walkthrough for the Invoca panel. Use when Hunter asks to prep, rehearse, time, or present the walkthrough; to set up the presenter view; to check the demo is ready before a call; or when something breaks live (stuck run, missing callout, budget hit, login loop) and he needs a recovery move.
---

# Present the Signal Loop walkthrough

The walkthrough is 18 parts, 25:00 of target time, over the real product (`/app`) and Agent Ops (`/ops`) at `https://repos.hunterborman.com/repo/invoca/`.

Read first, only as needed:
- `docs/WALKTHROUGH.md`: per-part goal, clicks, numbers with sources, and justifications.
- `src/tour/script/notes.ts`: the exact speaker lines the presenter view shows.
- `docs/speaker-notes.md`: the long-form talk track.

## Rules

- Never type, paste or display the password, a signed link, or the owner link in chat, notes or a shared screen. Hunter enters them himself.
- Never deploy, reseed or flip the kill switch while the panel holds the link. That is `signal-loop-operate`, and it needs Hunter's go-ahead.
- Quote numbers from the callout on screen, not from memory. The callouts read the viewer's real data.

## Prep checklist (T-15 minutes)

1. **Clean state.** Use a fresh browser profile (or a private window) so the workspace and tour state start empty. If reusing a profile, open Settings → *Reset workspace*. The walkthrough always sends `rerun: true`, so Brightline runs live again; outside the tour, New conversation offers *Run again live* for a file already run.
2. **Presenter view pairing.** Open `/repo/invoca/` (shared screen, full screen, zoom 100%) and `/repo/invoca/presenter` (laptop) in the **same browser profile**: they sync over a `BroadcastChannel`, which does not cross profiles or devices. The presenter must say "Connected to the main window" and update when you press → in the main window.
3. **Budget.** The budget gauge on Usage and health (`/app/health`): live AI needs headroom under the $15 cap (`wrangler.jsonc` → `BUDGET_LIMIT_USD`). At the cap, runs replay recorded real executions and say so. That is fine; mention it in Ch7.
4. **Warm-up.** Run Brightline once in a separate private window, then close it.
5. **Signed link validity.** If the panel uses a signed link, confirm its `expiresAt` (printed by `npm run sign-link` when issued) is after the session. A signed-in viewer's `GET /api/session` returns `linkExpiresAt`.
6. **Backups ready.** Keep the Q&A backup list open in the presenter view. Close Slack and notifications.
7. **Keys.** → or Space next, ← back, Esc menu. A clicker sending PageDown / PageUp works. In review: A approve, E edit.

## Timing and clicks

Presenter timer: amber past a part's target, red at 125%. If more than a minute behind by Ch3, skip "Try another file".

| Start | Part | Target | Click |
|---|---|---|---|
| 0:00 | 0 Cold open | 0:30 | → once |
| 0:30 | 1 Where feedback gets lost | 1:15 | → twice |
| 1:45 | 2 Why this option | 0:35 | → twice |
| 2:20 | 3 Jobs to be done | 2:00 | open all four cards, then → |
| 4:20 | 4 Today and tomorrow | 1:55 | → three times |
| 6:15 | 5 The platform | 1:00 | → three times, then Open the product |
| 7:15 | Ch1 A call comes in | 1:30 | Browse conversations → pick Brightline (or let a panelist pick) → Open → Process conversation |
| 8:45 | Ch2 Watch it think | 2:15 | → per step; read the triage card; stop on Check quotes and read the count aloud |
| 11:00 | Ch3 Human in the loop | 2:00 | A on one item; E on another, change a field, Save and send |
| 13:00 | Ch4 Right owner, right channel | 1:20 | edit pricing rule → VP Product, ARR over $250k; point at the flow chart; Connections beat |
| 14:20 | Ch5 Patterns, not anecdotes | 1:15 | open the highlighted theme |
| 15:35 | Ch6 Close the loop | 0:50 | move the ticket to Shipped |
| 16:25 | Ch7 Prove it | 1:35 | Promote → read the block → Usage and health budget |
| 18:00 | Ch8 Operate it | 2:00 | Agent Ops link → overview, registry, agent page, usage, logs, trace, reliability |
| 20:00 | 14 Rollout | 2:15 | → twice |
| 22:15 | 15 Next 12–18 months | 1:15 | → once |
| 23:30 | 16 POC to production | 0:45 | → once |
| 24:15 | 17 Scorecard | 0:45 | Explore freely; open Q&A |

Source: `src/tour/script/chapters.ts` (targetSec) and `src/tour/script/notes.ts` (click lists).

Lines that must match the screen:
- Ch2 Check quotes: say the grounded count the callout shows. Offer *See a rejected quote* only if the button is on screen.
- Ch5: read the theme name and account count off the callout.
- Ch7: the callout reads the eval numbers; v5 is blocked on precision (88.7% → 59.7%), cost and p95 are shown, not gated.
- Ch8: the history is real runs with simulated users; only this session is live.

## Branches

If a panelist picks another file in Ch1, name the branch before pressing Run: clean notes, messy (ASR, Slack export or email thread; the callout says which), injection attempt, friendly check-in (right answer is nothing), PHI-heavy call (toggle before / after). Details per branch are in `docs/WALKTHROUGH.md` → Branches.

## Fallbacks

- **Replay mode:** automatic when live AI is off, over budget, or a featured run is not finished within 25 s (`src/shared/scoring.ts` → `LIVE_FALLBACK_AFTER_MS`). The callout says "replay"; say so too.
- **Backup scenes:** `/repo/invoca/backup/<topic>` for `cost`, `security`, `failure`, `build-vs-buy`, `metrics`, `agent-ops`, `differently`.
- **Jump anywhere:** Esc opens the chapter menu; or deep-link `?tour=<stepId>` (step ids in `src/tour/script/steps.ts`).
- **Write-up:** `/repo/invoca/write-up` covers the four pillars on one page.
- **Demo video:** the plan calls for a backup recording (`docs/PLAN.md` → Handoff package). It is not in the repo; confirm Hunter has it locally before relying on it.

## Recovery if something breaks live

| Symptom | Move |
|---|---|
| Run sits on a step | Keep talking through the step's "How this works". A run with no progress for 40 s is handed to the durable Workflow (`src/worker/runs.ts` → `STALLED_AFTER_MS`); a featured file replays after 25 s. If still stuck, Esc → Ch3 and narrate from the recorded run. |
| Callout floats in the middle | The anchor did not appear in time; the step still works. Press → or use Esc to move on. |
| "Live AI budget reached" | Expected at the cap. Say "past the cap it replays, never an outage" and continue. |
| Agent Ops panel empty | Go to `/backup/agent-ops` and describe the registry and standard. |
| Presenter view says "Waiting…" | Reopen `/presenter` in the same profile as the main window; present from `notes.ts` lines if needed. |
| Signed out or link expired | Hunter signs in with the password himself, off the shared screen. |
| Site down | Use the write-up page or `docs/WALKTHROUGH.md` locally, and the demo video if it exists. Do not redeploy during the session. |

## After the session

Hand over to `signal-loop-qa` for questions. Do not reset or clean up workspaces until the panel's link has expired or Hunter says so.
