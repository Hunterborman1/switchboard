---
title: "Switchboard and Signal Loop: the walkthrough, for AI assistants and readers"
version: "1.3"
date: "2026-10-26"
url: "https://repos.hunterborman.com/repo/invoca/"
markdown_url: "https://repos.hunterborman.com/repo/invoca/walkthrough.md"
duration: "25:00 (sum of targetSec in src/tour/script/chapters.ts)"
parts: 10
groups: "Introduction (chapters 1–3), The platform (chapters 4–8), Closing (chapters 9–10)"
product_chapters: 5
product_chapters_note: "Chapters 4–8, the group 'The platform'. Chapter 4 opens on the platform scene (step call.platform), then moves into the real product."
product_steps_main_path: 22
scene_steps_main_path: 6
branches: 6
build_time: "Built from scratch in 48 hours by Hunter Borman (src/narrative/scenes/Real.tsx)"
products:
  - "Switchboard: the platform (any conversation in, the right people out)"
  - "Signal Loop: the one analysis built inside it (the brief's Option 3)"
  - "Agent Ops: the sibling product for operating agents"
audience:
  - Invoca final-round panel (AI Operations Lead)
  - AI assistants answering questions about this build
author: "Hunter Borman"
assignment: "Option 3, the Feedback Loop Architect: ingest CSM call transcripts and notes, extract structured insights, route them to stakeholders"
sources:
  - src/tour/script/chapters.ts
  - src/tour/script/steps.ts
  - src/tour/script/copy.ts
  - src/tour/script/notes.ts
  - src/tour/script/routes.ts
  - src/tour/guide/Guide.tsx
  - src/tour/guide/dock.ts
  - src/tour/guide/nudges.ts
  - src/tour/hud/ChapterList.tsx
  - src/tour/hud/Hud.tsx
  - src/tour/engine/TourProvider.tsx
  - src/tour/engine/types.ts
  - src/tour/tour.css
  - src/narrative/Scene.tsx
  - src/narrative/components.tsx
  - src/narrative/hooks.ts
  - src/narrative/scenes/index.ts
  - src/narrative/scenes/Signal.tsx
  - src/narrative/scenes/Real.tsx
  - src/narrative/scenes/Why.tsx
  - src/narrative/scenes/Platform.tsx
  - src/narrative/scenes/Production.tsx
  - src/narrative/scenes/Scorecard.tsx
  - src/narrative/backup/BackupPage.tsx
  - src/web/pages/Hub.tsx
  - src/web/pages/Walkthrough.tsx
  - src/web/pages/Presenter.tsx
  - src/web/pages/WriteUp.tsx
  - src/shared/platform.ts
  - src/shared/runTiming.ts
  - src/app/routes.tsx
  - src/app/AppShell.tsx
  - src/app/pages/run/stepText.ts
  - src/app/pages/run/Timing.tsx
  - src/app/pages/run/useReveal.ts
  - src/app/lib/convert/index.ts
  - docs/speaker-notes.md
  - docs/PLAN.md
  - docs/ARCHITECTURE.md
  - docs/RUNBOOK.md
  - docs/DESIGN.md
  - docs/data-review.md
  - docs/reports/decision-models.md
  - data/evals/latest.json
  - data/evals/details-v4.json
  - data/evals/details-v5.json
  - data/replays/*.json
  - data/backfill/runs.json
  - data/platform/agents.json
  - data/world/accounts.json
  - data/world/routing.json
  - data/world/people.json
  - data/library.json
  - data/tour-files.json
  - src/shared/scoring.ts
  - src/shared/contracts.ts
  - src/shared/prompts/extract.ts
  - src/pipeline/run.ts
  - src/pipeline/replay.ts
  - src/pipeline/score.ts
  - src/pipeline/route.ts
  - src/pipeline/deliver.ts
  - src/worker/ai.ts
  - src/worker/execute.ts
  - src/worker/runs.ts
  - src/worker/telemetry.ts
  - src/worker/platform/math.ts
  - wrangler.jsonc
---

# Switchboard and Signal Loop: the walkthrough

## How to read this file

This is the machine-readable version of the 10-chapter guided presentation at `/repo/invoca/`. It is written so an AI assistant can answer questions about the build without inventing anything. The hub and the write-up link to it as "Markdown version for AI assistants".

**What is authoritative, in order:**

1. The code and data files named in `[source: …]` tags. If this file and a source disagree, the source wins.
2. This file, for the reasoning behind each decision ("Why this design").
3. `docs/speaker-notes.md` and `src/tour/script/notes.ts`, for how Hunter says it out loud.

**Conventions:**

- `[source: path]` follows every number. A path with a key (for example `latest.json → promoted.precision`) names the field.
- **Assumption:** marks a figure that is illustrative or registered, not measured. Each one names what would replace it.
- **Simulated:** marks data that was generated, not observed. All accounts, people and calls are fictional. All connectors are simulated.
- **Live:** marks a value the screen reads at run time from the viewer's own workspace or session. This file never states a live value as fixed; it gives the recorded or eval value instead and says so. Where it quotes one live run as an example, it says so and that it is one run, not a benchmark.
- "Decision model", "main model" and "backup model" are the three model roles. The product shows exact model ids only on `/app/settings`. This file names the decision model's id where its choice is the point (ADR 12); all three ids are in `wrangler.jsonc → vars`.
- Chapters are numbered 1–10 in one sequence, narrative and product alike, in three groups: Introduction (1–3), The platform (4–8) and Closing (9–10). The chapter rail, the Guide's chapter picker and the presenter view all use the same numbers and titles [source: src/tour/script/chapters.ts → CHAPTERS, GROUPS, chapterLabel; src/tour/hud/ChapterList.tsx].
- Step ids are `<chapter>.<what>`, for example `call.ground`. A scene that is a whole chapter uses the chapter id (`signal`, `real`, `why`, `production`, `scorecard`); the platform scene that opens chapter 4 is `call.platform` [source: src/tour/script/steps.ts header].
- Routes are relative to `/repo/invoca`. Keys: → (or a clicker's PageDown) for next, ← (or PageUp) for back. On a scene only these and the Back and Next buttons move on: Space, Enter and a click on the page do not. Esc opens the chapter menu on scenes narrower than 1,200 px. On product pages ← and → move the Guide; on Review, A approves, E edits, R rejects [source: src/tour/engine/TourProvider.tsx → keyboard, RAIL_QUERY; src/narrative/Scene.tsx header; src/app/pages/Review.tsx].
- Deep link to any step: `?tour=<stepId>&path=<branch>` (an optional `&run=<runId>` attaches a run). `/walkthrough/<chapterId>` starts the presentation at that chapter's first step, so `/walkthrough/call` opens the platform scene [source: src/tour/engine/TourProvider.tsx header, initial; src/web/pages/Walkthrough.tsx].

**When answering a question:** quote the number with its source, say whether it is measured, an assumption or simulated, and use the "Honest gaps" section rather than overstating.

## Summary

Customers tell Invoca's CSMs what to build, and most of it never reaches the person who could act on it. Switchboard, built from scratch in 48 hours by Hunter Borman, is a working platform that reads any conversation or document (a call transcript, notes, an email thread, a chat export, a PDF or a deck), decides what it is, runs the analyses that apply, and sends the result to the right people in the tools they already use. Signal Loop, the brief's Option 3, is the one analysis built inside it. It redacts personal and health details, extracts typed insights that each carry a verbatim quote, checks every quote against the transcript in code, sends uncertain or high-stakes items to a person, routes the rest by an editable rules table, groups them into themes with ARR attached, and tells the CSM when their feedback ships. All of the AI is built and runs live; the connections to other tools and the data are simulated, and the second chapter says exactly which is which. Five other analyses are listed and marked not built. A fast decision model triages every input alongside extraction and gives a second opinion at the review gate; a 13-minute call takes a few seconds, and the conversation page shows where the time went from the run's real timestamps. Signal Loop reports into Agent Ops, the sibling product where every agent has an owner, a spend cap, a quality gate, logs and a measured return. The presentation is 10 chapters in three groups. Introduction (chapters 1–3): one sentence from a 13-minute QBR and where feedback like it gets lost today, what is real in this demo, and why this option. The platform (chapters 4–8): chapter 4 opens on the platform scene and then moves into the real product, where the viewer uses the real system with a Guide in the corner they can leave and resume. Closing (chapters 9–10): rollout, the next 12–18 months and the production stack on one screen, then a scorecard. Six different starting files send the viewer down six branches through the same pipeline. The proof of concept runs on one Cloudflare Worker; the production design keeps the same boundaries on Neon, Vercel, the Vercel AI SDK, Trigger.dev and Render, with ClickHouse and dbt only at volume and dlt for ingestion.

### All 10 chapters

Target seconds sum to 1,500 (25:00) [source: src/tour/script/chapters.ts → CHAPTERS, TOTAL_TARGET_SEC]. Introduction takes 6:00, the platform 13:15 and closing 5:45, so the product appears a little after 6:00, once the platform scene has been shown [source: computed from chapters.ts → targetSec; chapters.ts → targetOffsetSec]. The main path is 28 steps: 22 product steps, all in chapters 4–8, and 6 scenes [source: steps.ts → MAIN_ORDER, BRANCH_STEPS].

| Chapter | Id | Title | Route(s) | Layer | Target (s) | Objective |
|---|---|---|---|---|---|---|
| 1 | `signal` | Every call is a signal | `/walkthrough/signal` | narrative | 150 | One sentence that belongs on the roadmap, and where it gets lost |
| 2 | `real` | Built in 48 hours: what's real | `/walkthrough/real` | narrative | 90 | Built and working, or simulated, and why |
| 3 | `why` | Why this option | `/walkthrough/why` | narrative | 120 | The choice, and how it was built |
| 4 | `call` | A call comes in | `/walkthrough/call`, `/app/new`, `/app/runs/:id` | both | 270 | See the platform, bring in a call and watch it run |
| 5 | `review` | Human in the loop | `/app/review` | product | 105 | Approve one, correct one |
| 6 | `routing` | Right owner, right channel | `/app/routing`, `/app/destinations`, `/app/connections` | product | 105 | Change who hears about pricing |
| 7 | `patterns` | Patterns, and closing the loop | `/app/themes`, `/app/themes/:id`, `/app/destinations`, `/app/loop` | product | 120 | One complaint becomes a pattern; ship it and tell the CSM |
| 8 | `operate` | Prove it, then operate it | `/app/evals`, `/ops`, `/ops/traces/:id` | product | 195 | Try to promote a worse prompt; find your run in Agent Ops |
| 9 | `production` | Making it real | `/walkthrough/production` | narrative | 270 | Roll it out, grow it, run it in production |
| 10 | `scorecard` | Scorecard | `/walkthrough/scorecard` | both | 75 | What you did, what it did |

Routes come from `src/tour/script/routes.ts` (`R`) and the `route` of each step in `src/tour/script/steps.ts`. Chapter 4's layer is "both" because it opens on a scene (`call.platform` at `/walkthrough/call`) and continues in the product; chapter 10's is "both" because it is a scene that reads the viewer's own product data [source: src/tour/engine/types.ts → Chapter.layer]. The groups are Introduction (1–3), The platform (4–8) and Closing (9–10) [source: chapters.ts → GROUPS].

Jobs to be done and the current and future state no longer have chapters of their own. Chapter 1 shows the current state (where feedback like the 06:00 sentence gets lost) and what Signal Loop makes of that sentence; chapters 4–8 are the future state, working. The four jobs (CSM, Product Manager, VP Product, and sales, competitive and support leads) and the emotional job, "be the advocate, not the stenographer", are in Part 1 of the write-up at `/write-up` [source: src/web/pages/WriteUp.tsx → section `problem`].

### The Guide and the chapter navigator

The presentation has two kinds of page, and each has one way to move around it.

- **Scenes** (`/walkthrough/:part`) are the six presentation pages: chapters 1, 2, 3, 9 and 10, and the platform scene that opens chapter 4 [source: src/narrative/scenes/index.ts → SCENES; steps.ts]. A scene shows all of its content on arrival, with one short staggered entrance; under reduced motion it draws the final frame [source: src/narrative/hooks.ts → useCalm; the headers of Signal.tsx, Platform.tsx and Production.tsx]. Only Back and Next, → and ←, or a clicker's PageDown and PageUp move on; a click on the page does not, and Space and Enter keep their normal meaning [source: src/narrative/Scene.tsx header; TourProvider.tsx → keyboard]. The top bar names the group and the chapter and shows "n of 10". The bottom bar has a keyboard hint, Back and Next (the platform scene's Next reads "Open the product", the production scene's "Scorecard"; the scorecard has no bottom bar) and a thin progress line [source: Scene.tsx → SceneTopBar, Scene; scenes/index.ts → exitLabel, bare]. Scenes also have a persistent chapter navigator. On screens 1,200 px and wider it is a left rail the width of the product sidebar: the Switchboard lockup, "Presentation" with the total ("10 chapters, 25:00"), every chapter in its group with the current one marked and earlier ones ticked, each one a button, and "Explore on your own" at the foot. Narrower, the same list opens from a menu button in the scene's top bar (or with Esc), with "Explore on your own" and "Back to the start" [source: src/tour/hud/Hud.tsx → ChapterRailNav, SceneTools, ChapterDrawer; src/narrative/narrative.css → .n-deck].
- **Product pages** (every `/app` and `/ops` page) have the **Guide**, one persistent box [source: src/tour/guide/Guide.tsx].
  - **Presentation mode** (the presentation is on a product step): a one-row header: the chapter ("Chapter 5 of 10" and its title), which opens the chapter picker (the same list as the rail, grouped, current marked, earlier ticked, every chapter clickable), and a minimize button. The body has "Step n of m" within the chapter, counted along the main path (in chapter 4 the platform scene counts as step 1, so "Bring in today's call" is step 2 of 9), the step's title, a body of 20 words or fewer that says why, an optional "How this works", and, when the step waits for the viewer, a "Your turn:" line with what to do and a "Show me" link that scrolls back to the target and briefly widens its ring [source: Guide.tsx → stepOfChapter; steps.ts → chapterSteps]. On a chapter's last main-path step, one quiet line says what changed in that chapter (for example "2 decisions made by a person, saved as labelled data"); it replaced the old count-up modal. Since the chapters were merged, three steps still define such a line but are no longer the last step of their chapter, so their line does not show: `call.process` ("0 fields typed by the CSM"), `patterns.theme` ("accounts in one theme") and `operate.gate` ("1 bad prompt blocked before it shipped") [source: Guide.tsx → PresentBody, lastOfChapter; steps.ts → checkpoint]. While a step waits on the product (a run finishing), a spinner line says so. The footer is one row: "Explore on your own" on the left; Back and Next (or "Skip this step" while the step waits, or the step's own choices) on the right. ← and → also move [source: Guide.tsx → PresentBody].
  - **Explore mode** (after "Explore on your own", after the scorecard, or when the product is opened from the hub): the same box, smaller. A "Try it" nudge for whatever page is open (one per Switchboard and Agent Ops screen), "Show me" when the nudge has a target on the page, the chapter list, and a primary button: "Resume presentation" (back to the step the viewer left), "Start the presentation" if they never started, or "Replay the presentation" after they finished [source: Guide.tsx → ExploreBody, ResumeButton; src/tour/guide/nudges.ts].
  - **Resuming** returns to the same step. A step that needs something the viewer may have closed resumes where it can be picked up: choosing a file (`call.pick`) resumes at "Bring in today's call" (`call.intro`) [source: TourProvider.tsx → resume; steps.ts → resumeAt].
  - **It never blocks the product.** There is no scrim. The step's target gets a 2px accent ring with a flat accent-subtle halo just outside it, which never takes a click [source: src/tour/tour.css → .t-ring].
  - **It never covers its target.** On desktop it sits bottom-right, 380 px wide and at most 60% of the viewport tall, never over the left sidebar. The page first scrolls the target into the part of the screen the Guide leaves free; then the Guide takes the first corner (bottom-right, bottom-left, top-right) that covers neither the target, an open product dialog or drawer, nor a sticky action bar (the review's decision bar), narrowing to 340 px when that clears it. If no corner has room it folds to a compact size (the title and the why), then a one-line bar, then a small "Guide" pill. A target taller than any free band is parked just below a compact Guide at the top right. A viewer who opens it fully keeps it open until the next step [source: src/tour/guide/dock.ts → bandFor, chooseDock; Guide.tsx → keptOpen].
  - **Phones** (900 px and narrower, where the product sidebar is a drawer): a bottom sheet with a bar. Open, the bar names the chapter and holds the chapter picker; folded, it says what to do and keeps the Next or Skip button. It folds when a product dialog is open or the target is taller than the room above it. In explore mode it starts folded [source: Guide.tsx → SheetBar, placeGuide; dock.ts → sheetPlan].
  - Minimizing is remembered for the browser session (`sl-guide-min` in sessionStorage); in presentation mode each new step opens the Guide again because it carries the instruction [source: Guide.tsx → MIN_KEY].

**The nudges, one per screen** [source: src/tour/guide/nudges.ts → NUDGES]:

| Page | Try it |
|---|---|
| Overview | See what came in and where it went |
| Conversations | Open any conversation |
| New conversation | Bring in any conversation |
| A conversation | See where the time went |
| Review | Approve, edit or reject one |
| Insights | Open an insight |
| Themes | Open a theme |
| A theme | Follow a quote back to its call |
| Routing | Change who hears about what |
| Deliveries | Move a ticket to Shipped |
| Close the loop | Read the drafted customer note |
| Quality | Try to promote the candidate prompt |
| Analyses | See what's built and what isn't |
| Connections | Disconnect a tool |
| A connection | Send a test |
| People | Change someone's handle |
| Usage and health | Check the live AI budget |
| Settings | See the exact models |
| Connect Claude | Connect Claude and ask it how this was built |
| Agent Ops overview | Read the exec view |
| Agent registry | Open an agent |
| An agent | Check who owns it |
| Usage (Agent Ops) | Find yourself in the live panel |
| Logs and traces | Jump to your last run |
| A trace | Select a step on the timeline |
| Reliability | Check the promises |
| Cost | Compare cost per task |
| Runbook | Read what to do when it breaks |
| Standard and reviews | Select a cell to see its evidence |

Each nudge's line says what is simulated where it matters, for example "Connections are simulated: disconnect Jira and its rules route to triage. Reconnect to restore them." A unit test checks that every route in `src/app/routes.tsx` and `src/platform/index.ts` has one [source: tests/unit/tour/nudges.test.ts].

### Product pages

What each `/app` route is called in the product's sidebar [source: src/app/routes.tsx; src/app/AppShell.tsx → sections].

| Route | Name on screen | Sidebar group |
|---|---|---|
| `/app/overview` | Overview (where `/app` lands) | Top level |
| `/app/runs`, `/app/runs/:id` | Conversations, and one conversation | Top level |
| `/app/new` | New conversation | Top level |
| `/app/review` | Review | Signal Loop |
| `/app/insights` | Insights | Signal Loop |
| `/app/themes`, `/app/themes/:id` | Themes | Signal Loop |
| `/app/routing` | Routing | Signal Loop |
| `/app/destinations` | Deliveries | Signal Loop |
| `/app/loop` | Close the loop | Signal Loop |
| `/app/evals` | Quality | Signal Loop |
| `/app/analyses` | Analyses | Workspace |
| `/app/connections`, `/app/connections/:id` | Connections | Workspace |
| `/app/people` | People | Workspace |
| `/app/health` | Usage and health | Workspace |
| `/app/settings` | Settings (the only page with model ids) | Workspace |
| `/app/claude` | Connect Claude (an MCP token and setup for Claude) | Workspace |
| `/ops/*` | Agent Ops, a separate product reached from the product switcher or the Agent Ops link | — |

### The four pillars of the brief, and where each is answered

| Pillar | Chapters |
|---|---|
| Jobs to be done, current and future state | 1 (the current state and what Signal Loop makes of one sentence), 4–8 (the future state, working), and Part 1 of the write-up (`/write-up`) for the four jobs |
| The build (proof of concept) | 2, 3, 4–8 |
| Stakeholder management and adoption | 5, 7, 9, and the jobs in Part 1 of the write-up |
| The next 12–18 months | 9 |

---

## Introduction (chapters 1–3)

### Chapter 1 · Every call is a signal

- **Goal:** make the problem one concrete sentence before any slide of context, then show where feedback like it gets lost today, with the scale honestly labelled.
- **What's on screen:** one scene, everything at once, under the headline "Every call is a signal." and the line "One sentence in this 13-minute QBR belongs on the roadmap. Today, most feedback like it gets lost." [source: src/narrative/scenes/Signal.tsx → LINES, STAGES, BECOMES].
  - **The call** (left): "Quarterly review", Brightline Home Services, Oct 21, 13 min, 3 speakers, marked as recorded in Gong. A flat waveform of the whole call with 06:00–06:23 highlighted, and three transcript lines: Dana Ortiz at 05:54 ("Because I'll be honest with you, this is the one that keeps me up at night."), Jeff Kim at 06:00, highlighted ("CallRail's been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day."), and Marcus Bell, the Invoca CSM, at 06:24 ("That's fair, and I appreciate you telling me.").
  - **Where feedback like this gets lost today** (right): "Out of every 100 things customers tell a CSM", four bars: said by a customer on a call, 100; written down by the CSM, 72 (−28, "said once, never written down"); shared beyond the CSM, 55 (−17, "stays in a notes field"); reaches the right owner, 40 (−15, "the Slack thread scrolls away"). Under them: "60 of every 100 never reach an owner." and an Assumption callout: "Illustrative, not measured. A two-week time study with two CSMs would replace these numbers."
  - **What Signal Loop makes of that sentence** (bottom row): what it is (competitor offer: same-day conversions), who hears it (competitive intel and the product owner, today), the evidence (Jeff Kim's words, at 06:00 in the call) and why it matters ("Brightline renews in 12 weeks").
  - The entrance runs once: the call, then the handoffs (each bar arrives at the previous stage's size and shrinks to what survives), then the bottom row, settled by about 850 ms [source: Signal.tsx header].
- **What the viewer does:** reads it, then Next (or →). Nothing on the page needs a click [source: steps.ts → `signal`; TourProvider.tsx → next].
- **What it proves:** the valuable signal is a small part of a long, mostly routine call, and it has a deadline attached; today, the loss is spread across manual, optional handoffs, not one broken step.
- **Key numbers:**
  - Call length 13:00, highlight 06:00–06:23 [source: Signal.tsx → CALL_SEC, HIGHLIGHT].
  - The file is about 1,850 spoken words with 6 planted insights; it was written by hand [source: docs/data-review.md → "The recommended file: C-1042"]. **Simulated.**
  - Renewal: "12 weeks" on the bottom row; the recorded run's gate reasons say "renewal in 82 days" [source: data/replays/file_c1042.json → insights[].gateReasons].
  - 100 → 72 → 55 → 40 [source: Signal.tsx → STAGES]. **Assumption:** illustrative, not measured; a two-week time study with two CSMs replaces it [source: Signal.tsx → Callout; docs/speaker-notes.md chapter 1].
- **Why this design:** Because the panel is judging whether I understand the job, not the market, we open on one sentence from the same file the viewer will run in chapter 4, over a problem statement or a market-size slide. Because there is no defensible public benchmark for how much internal CSM feedback reaches an owner at Invoca, the scale beside it is an illustrative funnel labelled as an assumption on screen, over an outside statistic. The call, the funnel and what Signal Loop makes of the sentence share one screen, so the sentence and where it would get lost are seen together. Trade-off: no industry framing up front, and the funnel cannot carry an ROI case on its own, which is why the rollout starts with the time study (chapter 9).
- **Likely question → short answer:** "Is this a real call?" → No. Every account and call is fictional. C-1042 was written by hand to carry six specific signals and one grounding trap [source: docs/data-review.md]. "Where does 40 of 100 come from?" → It is an assumption and says so. Week 0 of the rollout replaces it with a measured number. The registry's success metric uses the same assumed baseline of about 40% [source: data/platform/agents.json → agt_signal_loop.profile.successMetric]. "Isn't this just bad discipline by CSMs?" → No. Every step is manual, optional and invisible, so it depends on memory. The fix is a system, not heroics.
- **Speaker line:** "This is a thirteen-minute QBR. Twenty seconds of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks." Then: "'40 of 100' is an assumption, and it says so on screen. The first thing I'd do in the job is a two-week time study with two CSMs to replace it with a real number." [source: src/tour/script/notes.ts → NOTES.signal]

### Chapter 2 · Built in 48 hours: what's real

- **Goal:** say what is built and working, and what is simulated and why, before any other claim about the build.
- **What's on screen:** the headline "Built from scratch in 48 hours. Here's what's real." Right under it, "By Hunter Borman" and, beside that, a button to the source code on GitHub, labelled `github.com/Hunterborman1/switchboard`, which opens in a new tab [source: src/narrative/scenes/Real.tsx → SceneHead meta; src/narrative/components.tsx → SceneHead; src/shared/platform.ts → REPO_URL]. One line: "All of the AI is built and working: what goes in and what comes out really runs. The connections and the data are simulated, and every screen says so." Two cards, both on screen at once [source: Real.tsx → AI, SIMULATED]:
  - **Built and working.** All of the AI: triage by the decision model, extraction by the main model, the quote check in code, scoring and a second opinion, themes from embeddings and nearest neighbours, the routing rules engine, the review queue, evals with a promotion gate, a spend cap then replay, and Agent Ops telemetry for this agent. Inputs: upload any file (PDF, Word, slides, spreadsheets, transcripts, email, chat exports), paste text, or pick from the library. Outputs: each delivery's content, the people tagged and the receipt are generated for real.
  - **Simulated, and why.** Connections to Slack, Jira, Teams, Linear, Salesforce, Gmail, Google Drive, Gong, Zoom and 3 more: "There is no access to Invoca's systems, and a demo must never message real people. Routing and tagging still behave exactly as they would." The data (14 accounts, 21 people and 266 calls, notes and threads): "Real customer conversations can't leave Invoca, so every account, person and call here is fictional." Agent Ops' second agent, the RFP Responder, and six weeks of usage history: "To show the platform with more than one agent. Signal Loop's own history is 218 real pipeline runs, with simulated users." The other 5 analyses: "Listed and marked Not built. Forty-eight hours went into one analysis, done properly."
- **What the viewer does:** reads it, and can open the source; then Next [source: steps.ts → `real`].
- **What it proves:** the viewer can judge every later screen knowing which parts run for real, and can check "built from scratch" against the code.
- **Key numbers:**
  - 12 connectors in the catalog, 9 named on the slide [source: src/shared/platform.ts → CONNECTORS; Real.tsx → SHOWN_TOOLS]. **Simulated.**
  - 14 accounts, 21 people [source: data/world/accounts.json, data/world/people.json]; 266 library files, 48 of them featured golden files [source: data/library.json]. **Simulated.**
  - 218 backfill runs behind Signal Loop's history [source: data/backfill/runs.json]. Real pipeline runs over synthetic calls, with **Simulated** users.
  - 6 analyses in the catalog, 5 not built [source: platform.ts → ANALYSES].
- **Why this design:** Because a viewer clicking through alone can't ask "is this real?", we answer it in chapter 2, in two columns with a reason for every simulated part, over leaving it to small labels and Q&A. The source link sits next to the byline so the claim can be checked from the slide. Trade-off: a slide of scope before the product; it is 1:30.
- **Likely question → short answer:** "Is the AI mocked?" → No. Every model call is made from the Worker through OpenRouter on the build key, under a spend cap; past the cap, runs replay a recorded live run and say so [source: src/worker/ai.ts; wrangler.jsonc → BUDGET_LIMIT_USD; docs/RUNBOOK.md → Replay mode]. "Why simulate the connectors?" → No access to Invoca's systems, and a demo must never message real people; routing and tagging read the simulated connection state exactly as they would a real one [source: Real.tsx → SIMULATED; ADR 13].
- **Speaker line:** "Before anything else: I built this from scratch in 48 hours, and I want to be precise about what's real. The source is on GitHub, linked right under the headline." Then: "All of the AI is built and working." [source: notes.ts → NOTES.real]

### Chapter 3 · Why this option

- **Goal:** show the choice between the brief's three options, and why the build looks the way it does, on one screen.
- **What's on screen:** the headline "Three options. I chose the feedback loop." and the line "Option 3 is the same work Invoca's product does, pointed at Invoca's own customer calls. Each build choice is about trust: the model proposes, code checks, people decide." Everything is on screen at once [source: src/narrative/scenes/Why.tsx → OPTIONS, BUILD].
  - **Three option cards,** each with what the option is, a verdict and where it goes next:
    - **Option 1, RFP Responder (not chosen):** "Mature products already do this (Loopio, Responsive, Vanta, Conveyor), so the first question is why not buy one. And a wrong answer on a security questionnaire is a compliance risk." Next: simulated in Agent Ops as a second agent.
    - **Option 2, Churn Predictor (not chosen):** "It needs believable data faked from three systems, and a prediction is hard to defend without real outcomes to check it against." Next: on the roadmap as the Renewal risk analysis.
    - **Option 3, Feedback Loop (chosen):** "It's the work Invoca's own product does, pointed at Invoca's own CSM calls. And it shows all four pillars: several people with different jobs, real engineering, an easy additive pitch (stop retyping it into Jira) and a clear future." Built: Signal Loop, inside Switchboard.
    - One line under them: "Switchboard is built so options 1 and 2 can become analyses on the same platform later. Same intake, same decision model, same delivery."
  - **"How it's built, and why"** (bottom row), three choices: "Raw TypeScript, not n8n, Gumloop or Zapier" (the trust features need code: quotes checked against the transcript, a typed schema validated on every model output, deterministic routing rules, an eval suite with a promotion gate, budgets and replay, and tests); "Three model roles, chosen by measurement" (a decision model triages every input and gives a second opinion, a main model extracts, and a backup model takes over if it fails; all on OpenRouter; the decision model was the fastest of 12 candidates with every answer valid and every verdict right); "One Cloudflare Worker for the proof of concept" (fast to ship, one deploy, behind a gate; the production design keeps the same boundaries on Neon, Vercel and Trigger.dev, in chapter 9).
- **What the viewer does:** reads the options, then the build row; Next [source: steps.ts → `why`].
- **What it proves:** the option was chosen against the others for stated reasons, and the build approach serves trust: the model proposes, code checks, people decide.
- **Key numbers:**
  - Decision model chosen from 12 candidates; p50 882 ms, p95 1,465 ms over 18 calls, 18 of 18 answers valid and every actionable and injection verdict right [source: docs/reports/decision-models.md → Results].
  - "Renewal risk" is listed as not built [source: src/shared/platform.ts → ANALYSES deal_risk].
  - The RFP Responder in Agent Ops is simulated [source: data/platform/agents.json → note].
- **Why this design:** Because "why this option" without the alternatives reads like a preference, we put the three verdicts side by side with what each would become on this platform, with the build choices under them, over a single page of reasons for Option 3. Trade-off: the competitor products named for Option 1 are named from the market, not from a hands-on comparison in this build.
- **Likely question → short answer:** "Why not buy Gong, Productboard or Enterpret?" → Each covers part of it; none owns Invoca's taxonomy, routing rules and the loop back to CSMs. `/backup/build-vs-buy` has the comparison [source: src/narrative/backup/BackupPage.tsx; docs/speaker-notes.md Q5]. "Why not n8n, Gumloop or Zapier?" → The trust features need code: grounding against the transcript, schema validation on every output, deterministic routing, an eval gate, budgets and replay, and tests [source: Why.tsx → BUILD]. "Why not the churn predictor?" → It needs believable data faked from three systems, and prediction claims need real outcomes to check against; renewal risk can come later as an analysis on the same platform [source: Why.tsx → OPTIONS].
- **Speaker line:** "Three options. I chose the feedback loop because it's the same work Invoca's product does, pointed at Invoca's own CSM calls, and it shows all four pillars." Then: "How I built it, the bottom row: raw TypeScript, not n8n, Gumloop or Zapier, because the trust features need code." [source: notes.ts → NOTES.why]

---

## The platform (chapters 4–8)

### Chapter 4 · A call comes in

- **Goal:** place Signal Loop inside the larger product, bring a conversation into a new run with no retyping, then watch the real pipeline: what it finds, what it refuses to say, and why it is this fast.
- **Shape:** three parts in one chapter, 4:30 in all: the platform scene (`call.platform`, `/walkthrough/call`), bringing the call in (`call.intro`, `call.pick`, `call.process`, `/app/new`) and watching it run (`call.watch` to `call.timing`, `/app/runs/:id`). The Guide appears with the first product step and stays in the corner from here on [source: steps.ts; chapters.ts → CHAPTERS].

#### The platform scene (`call.platform`)

- **What's on screen:** one diagram under the headline "Signal Loop runs inside Switchboard." and the line "Any conversation comes in. A fast decision model reads it first, only the analyses that apply run, and the results reach the right people in their own tools." All four columns are on screen at once; they arrive left to right, settled within about half a second [source: src/narrative/scenes/Platform.tsx → IN, DECIDE, OUT, COL].
  - **In, any conversation:** Gong (call recordings), Zoom (meeting transcripts), Gmail (email threads), Slack (customer channels), Google Drive (notes, decks and PDFs), and "Upload any file".
  - **Decide, read it first:** what it is, what applies, whether it's safe, and a second opinion later on borderline items. Footnote: "A small, fast model on OpenRouter: 0.9 s median in the speed test".
  - **Analyse, run what applies:** Signal Loop with a "Built" badge; under "Not built yet": Follow-ups, Renewal risk, Escalations, Compliance review, Call coaching [source: src/shared/platform.ts → ANALYSES]. Footnote: "Long documents are split and read in parallel".
  - **Out, the right people:** Jira assigned to Nina Patel, Slack mentioning @jordan.reyes, a Salesforce task for Marcus Bell, email to Elena Vasquez, and a Google Drive voice-of-customer doc, each tagged the way that tool tags people. Footnote: "Connectors are simulated in this demo" [source: Platform.tsx → OUT; platform.ts → personHandle].
- **What the viewer does:** reads it; the Next button reads "Open the product" [source: src/narrative/scenes/index.ts → exitLabel].
- **What it proves:** intake, triage and delivery are shared parts any analysis can reuse; Signal Loop is the first, not the whole.
- **Key numbers:**
  - Decision model triage: p50 882 ms, p95 1,465 ms over 18 calls (9 golden files, twice each) [source: docs/reports/decision-models.md → Results].
  - 6 analyses in the catalog, 1 built [source: platform.ts → ANALYSES].
  - 12 connectors in the catalog; a new workspace starts with 7 connected: Slack, Jira, Linear, Gmail, Gong, Zoom, Google Drive [source: platform.ts → CONNECTORS, SEED_CONNECTED]. **Simulated.**
- **Why this design:** Because feedback does not only arrive on calls (email, chat, tickets, decks), and every analysis needs the same intake, triage and delivery, we built those once as a platform with one analysis on top, over a single-purpose call pipeline. Trade-off: five of six analyses are listed but not built, and the connectors are simulated; the scene and the product both say so. See ADR 12 and ADR 13.
- **Likely question → short answer:** "Is Switchboard a real product?" → It is this build's platform layer: intake, triage, connections, people and delivery are working code in the deployed Worker; the connectors behind them are simulated, and Signal Loop is the only analysis that runs [source: platform.ts header; src/app/pages/Analyses.tsx].
- **Speaker line:** "One step back before the product. Signal Loop runs inside Switchboard." [source: notes.ts → NOTES.call]

#### Bring in the call (`call.intro`, `call.pick`, `call.process`)

- **What's on screen:** the New conversation page, with three ways in: "From a connected source", "Upload a file" and "Paste text" [source: src/app/pages/NewCall.tsx]. "Browse conversations" opens the library picker: conversations from the workspace's connected tools, in folders such as "Calls/Week 43", each showing the tool it came from, with a preview pane. The Brightline QBR is marked "Suggested for the walkthrough" while the presentation runs. Mess levels are not shown in the picker; the page reveals them after the pick [source: src/app/components/FilePicker.tsx header; steps.ts → `call.pick`.more].
- **What the viewer does (3 steps):** click Browse conversations (`call.intro`, waits for `picker.opened`; "Your turn: click Browse conversations") → select a file and press Open (`call.pick`, the ring is on the suggested file; waits for `file.selected`, which the picker emits on Open; resumes at `call.intro` if the viewer left with the picker closed) → Process conversation (`call.process`, waits for `run.started`) [source: steps.ts]. While the picker is open the Guide folds to a bar or a pill clear of the dialog, so it never covers the list or the Open button [source: src/tour/guide/dock.ts → chooseDock].
- **What it proves:** the only manual step is choosing the file, and in production it goes away.
- **Key numbers:**
  - 48 featured files in the picker: 8 per mess level 1–5, plus 8 edge cases [source: docs/data-review.md; docs/PLAN.md §5; data/library.json → featured]. **Simulated.**
  - Upload accepts PDF, DOCX, PPTX, XLSX, ODT, HTML, RTF, JSON and CSV exports, VTT and SRT transcripts, email (.eml, .msg), chat exports and text. Files are converted to text in the browser and only the text is sent [source: src/app/lib/convert/index.ts → ACCEPT, header].
  - Limits: 25 MB per file, at least 40 characters of text, and only the first 200,000 characters are processed [source: src/app/lib/convert/types.ts → MAX_FILE_BYTES, MIN_TEXT_CHARS, MAX_TEXT_CHARS].
  - Refused with a reason: audio and video ("Audio and video need a transcript"), images, PDFs with no text layer, older Office files (.doc, .ppt, .xls) and Apple iWork files [source: convert/index.ts → mediaError, unsupported].
  - `call.process` still defines the chapter-end line "0 fields typed by the CSM, the system did the data entry", but it no longer shows, because `call.process` is not chapter 4's last step [source: steps.ts → `call.process`.checkpoint; Guide.tsx → PresentBody].
- **Why this design:**
  - Because the CS team's recorder and CRM are not known yet, we use a library from simulated connectors plus any-file upload in the POC, and plan dlt ingestion and direct connectors from whichever recorder and CRM the team uses (Gong, Zoom, Salesforce and Zendesk are examples), over building one integration speculatively. Trade-off: the demo has one click a real CSM would not [source: steps.ts → `call.intro`.more; src/narrative/scenes/Production.tsx → STACK; src/web/pages/WriteUp.tsx → STACK].
  - Because a binary file does not need to reach the server, conversion runs in the browser and only extracted text is sent, then redacted before any model call, over a server-side converter. Trade-off: scanned PDFs need OCR first, and audio needs a transcript [source: convert/index.ts header].
  - Because a labelled "hard" file would make the choice feel staged, mess levels are hidden until after the pick, over a menu of labelled scenarios. Trade-off: a viewer may not know which branch they chose until the Guide names it [source: docs/PLAN.md §5; copy.ts → introFor].
  - Because a restarted presentation should run live again, the walkthrough always sends `rerun: true`; the same bytes otherwise return the earlier run (SHA-256 idempotency) [source: docs/ARCHITECTURE.md → Duplicates].
- **Likely question → short answer:** "What happens if I upload the same file twice?" → It is deduplicated by SHA-256 and you are offered "Open your earlier run" or "Run again live" [source: docs/ARCHITECTURE.md; NewCall.tsx]. "Can I run something from a tool that isn't connected?" → No: the run is refused with "isn't connected. Connect it first, or upload the file." [source: src/worker/runs.ts → source_not_connected].
- **Speaker line:** "Bringing the call in is the only manual step, and in production it goes away: connectors pull calls from whichever recorder and CRM the CS team uses." [source: notes.ts → NOTES.call]

#### Watch it run (`call.watch` to `call.timing`)

- **What's on screen:** the conversation page. A live clock in the Progress card: "Running · 3.4 s" ticking every 100 ms from the first step's real start while the run goes, then the server's total ("Finished in …") with "Live run" or "Replay" [source: src/app/pages/run/Timing.tsx → RunClock; src/shared/runTiming.ts → runElapsedMs]. A 10-step stepper labelled Ingest, Read, Remove PII, Triage, Extract, Check quotes, Score, Theme, Route, Deliver (step keys `ingest`, `normalize`, `redact`, `screen`, `extract`, `ground`, `score`, `theme`, `route`, `deliver`) [source: src/app/pages/run/stepText.ts → STEP_NAME]. Steps appear as soon as the server reports them, with no artificial dwell (at most 120 ms between steps that land in the same poll; instant under reduced motion) [source: src/app/pages/run/useReveal.ts]. Also the transcript, a Triage card (what it is, its language, which analyses apply, any injection flag), insight cards with the score, gate and second opinion, any dropped quotes, and, once the run finishes, the **Timing card** [source: src/app/pages/RunView.tsx; src/app/pages/run/RunParts.tsx].
  - **The Timing card** draws every step on one shared clock from its real `startedAt` and `finishedAt`: the step name, the model role (never a model id), a bar and the duration. Code steps under a millisecond are hairline ticks with "<1 ms". Extraction that ran alongside triage reads "Main model, started with triage" and is drawn from triage's start; the score step with the decision model reads "Score and second opinion"; a theme step that only ran similarity search reads "Theme lookups", and when new themes are named after the run the row says so. Under the bars, one line from the run's data: "Triage ran alongside extraction, so it added no time." when it did, and "The N code steps took … in all." with their summed time. The footer has wall time, tokens in and out, AI cost, a Logs link and "See every call in Agent Ops" to `/ops/traces/<runId>` (the trace id is the run id) [source: Timing.tsx → rowName, rowSub, why, TimingCard; runTiming.ts; src/worker/telemetry.ts header].
- **What the viewer does (5 steps on the main path):** `call.watch` (target the live clock; title "Running live, right now", then "Done in 6.09 s, live", "Replayed in …" or "Your earlier run of this file"; Next once the run has loaded) → (`call.privacy` on the privacy branch, which waits for the Before and After switch) → `call.screen` (Triage, every branch) → `call.ground` (what extraction found and what the quote check did, in one step; "See a rejected quote" only if a real run with a dropped quote exists, leading to `call.rejected`) → (`call.messy` on the messy branch) → `call.gate` (title "Scored, then a second opinion" when this run had one, else "Scored: who sees it next") → `call.timing` (the Timing card; "Try another file" or Next) → (`call.clean` on the clean branch). With nothing actionable (the negative branch), triage goes straight to `call.timing` [source: steps.ts; copy.ts → introTitle, introCopy, groundCopy, gateTitle, timingCopy].
- **What it proves:** what is on screen is the real execution, drawn from saved step rows; a quote that is not in the transcript cannot become an insight; and the speed is real: only the model calls take time, and the two big ones run side by side.
- **Key numbers (one live Brightline run, as an example):** **Live**, one run on 2026-10-25, not a benchmark; a viewer's own run shows its own numbers [source: one live run's Timing card and step rows, `GET /api/runs/:id` → steps[].startedAt, finishedAt; not saved in the repo].
  - Triage 1.55 s on the decision model; extraction 4.94 s on the main model, started with triage (16 ms into the run).
  - Code steps 1 to 6 ms each.
  - Score and second opinion 1.07 s on the decision model, overlapping the theme lookups; the theme step took 1 ms in the run, with new themes named after the run.
  - Wall time 6.09 s; 11,031 tokens in and 1,365 out; $0.0034 of AI.
- **Key numbers (recorded Brightline run, what a replay shows when live AI is off):**
  - 6 insights, 14 of 14 quotes grounded by exact match, 0 dropped [source: data/replays/file_c1042.json → insights[].evidence[].method].
  - 19 values redacted [source: file_c1042.json → redactions].
  - 3 auto-route, 3 to review [source: file_c1042.json → insights[].gate].
  - Recorded: 4,238 ms end to end; triage 357 ms, extract 2,859 ms, theme 1,014 ms [source: file_c1042.json → totalMs, steps[].durationMs].
  - A replay is re-timed to today's step order: extraction is drawn from triage's start (the extract row waits 2,502 ms after triage), theme naming moves after the run (theme capped at 380 ms), and the replay runs 3,247 ms end to end. The Timing card says "Replay of a recorded live run, at its recorded speed. Recorded before triage ran alongside extraction, so the steps are re-timed to today's order." [source: src/pipeline/replay.ts → fastPathTiming applied to data/replays/file_c1042.json; Timing.tsx → caption].
  - $0.001401 of AI [source: file_c1042.json → run.costUsd].
  - All 48 recorded runs predate the decision model: their triage step ran on the main model, and no second opinion ran [source: data/replays/*.json → steps[key=screen].model, no secondOpinion field].
  - Grounding pass mark 0.90 [source: src/shared/contracts.ts → THRESHOLDS.grounding].
  - On the promoted prompt, 275 of 275 eval quotes grounded [source: data/evals/latest.json → promoted.metrics grounding_rate].
- **Key numbers (decision model and long inputs):**
  - Triage on the decision model: p50 882 ms, p95 1,465 ms, $0.000141 per call. The old screen (main model) measured p50 470 ms, $0.000616 per call [source: docs/reports/decision-models.md → Results].
  - Second opinion: one batched call per run, 964–1,483 ms on three test files [source: decision-models.md → Second opinion]. It may move a borderline review item to auto-route at agreement ≥ 0.85, and an auto-route item to review at disagreement ≥ 0.6 [source: src/pipeline/score.ts → SECOND_OPINION_PROMOTE_AT, SECOND_OPINION_DEMOTE_AT].
  - On a live C-1042 run the theme step went from 1,187 ms to 2 ms once its embeddings started alongside the second opinion [source: decision-models.md → What this means for speed].
  - Inputs over 24,000 characters are extracted in windows of about 16,000 characters with 2,000 of overlap, up to 8 at once; triage reads at most 40,000 characters, from the beginning and the end [source: src/shared/scoring.ts → EXTRACT_CHUNKING, TRIAGE_MAX_CHARS].
- **Chapter-end line:** on `call.timing`, "n of 6 scenarios explored", with the ones still to try [source: steps.ts → `call.timing`.checkpoint]. **Live.**
- **Why this design:**
  - Because a run that finishes in a few seconds can look pre-canned, the page shows a live clock from the run's real start, reveals steps as the server reports them, and draws the Timing card from real step timestamps, over a slowed-down animation that would make the clock disagree with the steps. Trade-off: on a fast run the steps arrive in batches; the reveal staggers them by at most 120 ms, which is motion, not pacing [source: useReveal.ts header; Timing.tsx].
  - Because the model cannot be trusted to police itself, grounding is code (normalize, exact substring, then a sliding Levenshtein window at 0.90 or better), over asking the model to verify its own quotes. Trade-off: grounding proves the words were said, not that they are feedback; chapter 8 shows that limit [source: copy.ts → groundCopy.more; ADR 2].
  - Because a cheap first read can say what the input is, which analyses apply and whether anyone is steering the AI, a fast decision model triages every input; extraction starts alongside it on the same redacted input and is discarded if triage says nothing is actionable, over a single extraction call. Trade-off: the discarded extraction's cost is still spent [source: docs/ARCHITECTURE.md → Models: three tiers, Latency work; steps.ts → `call.screen`.more]. See ADR 12.
  - Because correct items in the 0.55–0.80 band still wait for a person, an independent model checks each kept insight against its own grounded quotes, and code decides what may move, over letting a model set the gate. Forced reviews and held items never move; a failed call changes nothing [source: score.ts → applySecondOpinion; docs/ARCHITECTURE.md → Second opinion]. Trade-off: one more model call per run, and its effect is not in the eval yet.
  - Because one call over a long document is slow, long inputs are extracted in overlapping windows in parallel and merged, with grounding still against the whole document, over one call. Trade-off: any failed window fails the step [source: docs/ARCHITECTURE.md → Long inputs].
- **Likely question → short answer:** "It's too fast. Is it real?" → Yes. Read the Timing card: triage and extraction start together, the quote check, scoring, routing and delivery are code that takes milliseconds, and "See every call in Agent Ops" opens the trace with every model call, its tokens and cost [source: Timing.tsx; runTiming.ts; copy.ts → timingCopy]. "Did grounding ever catch anything?" → Not on the promoted prompt: 275 of 275 [source: latest.json]. It is a seatbelt. The candidate v5 had 3 of 505 quotes fail (502 grounded) [source: latest.json → candidate grounding_rate]. "See a rejected quote" appears only if a real run with a dropped quote exists in the database; do not promise it otherwise [source: steps.ts → `call.ground`.notes]. "Did the second opinion change anything?" → Read the Guide on `call.gate`: on a live run it says how many items the second model moved, or that it agreed; on a replay it says nothing, because the recordings predate it [source: copy.ts → gateCopy].
- **Speaker line:** "This is running live, right now. Watch the clock: a thirteen-minute call takes a few seconds." Then, on the Timing card: "Triage ran alongside extraction, not before it, and the code steps took under a millisecond each. Every call is in Agent Ops." [source: notes.ts → NOTES.call]

### Chapter 5 · Human in the loop

- **Goal:** a person decides on anything uncertain or high stakes.
- **What's on screen:** the review queue; every item has a reason badge such as "Score 0.71, below 0.80" or "Churn risk is always reviewed", and a second-opinion reason when that check moved it ("Second opinion disagreed: …") [source: src/app/pages/Review.tsx; score.ts → applySecondOpinion]. The decision bar (Approve and send, Edit, Reject) sticks to the bottom of the detail; the Guide scrolls the detail's end into view above itself so it never covers that bar [source: src/tour/guide/Guide.tsx → stickyBottom, scrollEndIntoBand].
- **What the viewer does (2 steps):** press A (or click Approve and send) on one item (`review.approve`, the ring on Approve and a soft ring on the reason badge; waits for `review.action` approve); press E on another, change the type, area, severity or summary, then Save and send (`review.edit`, the ring follows the edit form; waits for edit or reject). Save stays disabled until a field changes ("Change a field to save"). R rejects [source: steps.ts; copy.ts → editCopy; Review.tsx].
- **What it proves:** nothing on a parked run routes until someone acts, each correction becomes labelled data, and each decision carries a name.
- **Key numbers:**
  - Gate: 0.80 and above auto-routes, 0.55–0.80 goes to review, below 0.55 is held but visible [source: src/shared/contracts.ts → THRESHOLDS; src/pipeline/score.ts header].
  - Always reviewed: churn risk, high or critical bugs, every insight in a file where injection was suspected, and every insight when triage was unavailable [source: score.ts → scoreInsight; src/pipeline/run.ts → screenUnavailable].
  - On the v4 eval: 76 of 141 insights went to review (54%) and 65 auto-routed; 5 of those 65 were false positives (7.7%) [source: data/evals/details-v4.json → predicted[].gate, matched]. These predate the second opinion.
  - 45 of 48 eval runs ended with something to review [source: details-v4.json → status].
  - Reviews record the acting user by name ("approved by Elena Vasquez" in a new workspace) [source: src/worker/review.ts; src/worker/api/index.ts → applyReview(…, actor.name); platform.ts → DEFAULT_ACTOR_ID].
  - Chapter-end line: "decisions made by a person, saved as labelled data" [source: steps.ts → `review.edit`.checkpoint]. **Live.**
- **Why this design:**
  - Because a wrong churn flag in front of a PM costs the CSM trust, high-stakes types always go to a person regardless of confidence, over one global threshold. Trade-off: 54% of v4 insights need a person, so review load is the real constraint [source: details-v4.json].
  - Because review can take hours, review is a state change on a parked run (`awaiting_review`), over a suspended workflow waiting for an event; the approve action routes the insight and writes an audit row [source: docs/PLAN.md §6 "As built"; src/worker/review.ts].
  - Because the next prompt should learn from corrections, edits follow the `operator_actions` pattern (idempotency key, before, after, reviewer, reason) and become eval cases [source: steps.ts → `review.edit`.more].
  - Because an audit row needs a person, not "reviewer", every review records the acting user, who defaults to Elena Vasquez (VP, Product, the agent's business owner) and can be switched with "Act as someone else" in the user menu, over an anonymous viewer. Trade-off: the acting user is a workspace preference, not a sign-in [source: platform.ts → Actor, DEFAULT_ACTOR_ID; docs/ARCHITECTURE.md → Acting user; src/app/AppShell.tsx].
- **Likely question → short answer:** "Haven't you just moved data entry into a review queue?" → Partly, by design for now. A review is approve-or-edit on a pre-filled, quoted item. The second opinion can send a borderline item straight to its owner when it agrees. Thresholds get tuned against champion labels in weeks 3–6 [source: src/narrative/scenes/Production.tsx → PHASES; docs/speaker-notes.md Q18].
- **Speaker line:** "The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it's here." [source: notes.ts → NOTES.review]

### Chapter 6 · Right owner, right channel

- **Goal:** show that routing is data that ops can change, that deliveries land where people already work, and that a missing tool never loses an insight.
- **What's on screen:** the routing rules table (the "Where insights go" flow chart is on the same page), then the Deliveries page with a Jira or Slack preview and its receipt, then the Connections page [source: steps.ts → `routing.*`; src/app/pages/Routing.tsx; src/app/pages/Destinations.tsx; src/app/components/destinations/Previews.tsx].
- **What the viewer does (3 steps):** edit the pricing-objection rule so objections on accounts over $250k ARR go to the VP of Product (`routing.rule`, waits for `rule.changed`, or is already satisfied if the workspace has that override); look at the delivery where the PM already works (`routing.delivery`: "A Jira ticket with the quote, the account and its ARR, the owner tagged by their own handle"); then the Connections page (`routing.connections`: "Connections are simulated, routing is real. No real tool is called. Disconnect Jira and its rules route to triage instead; nothing silently disappears.") [source: steps.ts].
- **What it proves:** the model classifies; a table decides who hears it, with no prompt change and no redeploy; a disconnected tool or a removed owner sends matches to triage with the reason.
- **Key numbers:**
  - Rules match type, product area, severity and ARR band to an owner and a channel; the lowest priority wins; no match goes to triage [source: steps.ts → `routing.rule`.more; src/pipeline/route.ts].
  - 14 seed routing rules [source: data/world/routing.json; docs/data-review.md].
  - Routing accuracy on the v4 eval: 94.4% (118 of 125) [source: latest.json → promoted routing_accuracy].
  - Each delivery tags the owner, the account's CSM and, for churn risk or pricing objections on accounts over $250k ARR, the VP of Customer Success, by their handle in that tool [source: src/pipeline/deliver.ts → deliveryMentions, WATCHER_ARR_USD].
  - 21 people in the seed directory, with per-tool handles on the People page [source: data/world/people.json; src/app/pages/People.tsx]. **Simulated.**
  - 12 connectors, 7 connected in a new workspace [source: platform.ts → CONNECTORS, SEED_CONNECTED]. **Simulated.**
  - Chapter-end line: "routing rules changed, 0 prompts edited" [source: steps.ts → `routing.connections`.checkpoint]. **Live.**
- **Why this design:** Because routing must be predictable, auditable and changeable by ops without a deploy, routing is an editable rules table, over letting the prompt choose an owner. Trade-off: new routing needs need a rule, and a missing rule sends items to triage rather than guessing. See ADR 1. Connections are simulated but routing reads their state; see ADR 13.
- **Likely question → short answer:** "Does my rule change affect other viewers?" → No. Each viewer has their own workspace; rule, connection and people edits apply only there [source: steps.ts → `routing.rule`.more; BackupPage.tsx → Isolation; docs/ARCHITECTURE.md → Switchboard]. "Are the Slack, Jira and Salesforce connections real?" → No, and the product says so. Connecting one records a workspace connection with a simulated account; deliveries render as in-app previews with receipts. In production they'd be the real APIs, switched on one destination at a time [source: docs/speaker-notes.md Q19].
- **Speaker line:** "Routing is a table, not a prompt. Ops can read it, change it and audit it." [source: notes.ts → NOTES.routing]

### Chapter 7 · Patterns, and closing the loop

- **Goal:** turn one complaint into a pattern with ARR attached, then show the CSM hearing back when their feedback ships.
- **Shape:** four steps in two parts: patterns (`patterns.intro`, `patterns.theme`) and closing the loop (`patterns.ship`, `patterns.loop`) [source: steps.ts].

#### Patterns, not anecdotes (`patterns.intro`, `patterns.theme`)

- **What's on screen:** the themes list with the Google Ads offline-conversions theme highlighted, then its page: ARR at stake, an eight-week trend whose bars link to their insights, and representative quotes that link back to the conversation they came from [source: steps.ts → `patterns.intro`, `patterns.theme`; copy.ts → isSpotlitTheme; src/app/pages/ThemeDetail.tsx].
- **What the viewer does (2 steps):** open the highlighted theme (`patterns.intro`, waits for `theme.opened`), then one step for ARR, trend and quotes together (`patterns.theme`, the ring on ARR at stake).
- **What it proves:** the PM and VP get cross-account evidence, not a forwarded anecdote.
- **Key numbers:**
  - Join threshold: cosine similarity 0.82 [source: src/shared/scoring.ts → THEME_JOIN_THRESHOLD].
  - The spotlit theme was seeded with 32 insights from 7 accounts, $1.40M ARR [source: docs/data-review.md → Backfill and themes]. **Simulated.** The Guide reads live counts; say what it says.
  - ARR is counted once per account [source: copy.ts → themeCopy].
  - `patterns.theme` still defines the chapter-end line "accounts in one theme", but it no longer shows, because `patterns.theme` is not chapter 7's last step [source: steps.ts → `patterns.theme`.checkpoint; Guide.tsx → PresentBody].
- **Why this design:** Because theme membership has to be reproducible and auditable, membership is decided by embeddings and a similarity threshold in code and the model only names the theme, over asking the model to cluster. Trade-off: the threshold needs tuning, and theme quality has no eval yet (see Honest gaps). See ADR 11.
- **Likely question → short answer:** "Is ARR at stake a churn forecast?" → No. It is the ARR of accounts that raised the issue, counted once each [source: steps.ts → `patterns.theme`.more].
- **Speaker line:** "One complaint is an anecdote. Membership is decided in code, embeddings and a similarity threshold. The model only names it." [source: notes.ts → NOTES.patterns]

#### Close the loop (`patterns.ship`, `patterns.loop`)

- **What's on screen:** a Jira-style ticket with a state control on the Deliveries page, then the Close the loop page with a "Shipped" notice and a drafted note for the customer [source: steps.ts → `patterns.ship`, `patterns.loop`].
- **What the viewer does (2 steps):** play the PM: move the ticket to Shipped (`patterns.ship`, waits for `ticket.state` shipped), then the CSM's view with the drafted note (`patterns.loop`).
- **What it proves:** the CSM's emotional job, "be the advocate, not the stenographer", is served: credit, without status-chasing [source: steps.ts → `patterns.loop`.more; src/web/pages/WriteUp.tsx → section `problem`].
- **Key numbers:** chapter-end line "1 loop closed back to the CSM, 0 status-chasing emails" [source: steps.ts → `patterns.loop`.checkpoint].
- **Why this design:** Because the customer relationship belongs to the CSM, the customer note is drafted, not sent, over sending it automatically. Trade-off: one more action for the CSM, in exchange for keeping their voice and judgement [source: steps.ts → `patterns.loop`].
- **Likely question → short answer:** "Are Jira and Slack real?" → Not in the POC. Connectors are simulated: deliveries are in-app previews with real receipts and retries, and nothing leaves the Worker. Real APIs behind a flag are a next step [source: platform.ts header; data/platform/agents.json → dataAccess "mock destinations in the demo"; docs/speaker-notes.md Q19, Q20]. "Which job matters most?" → The CSM's emotional job. The PM, VP and GTM jobs only get served if CSMs keep supplying calls, so loop-closing credit is a requirement, not a nicety [source: src/web/pages/WriteUp.tsx → section `problem`].
- **Speaker line:** "Now play the PM: move the ticket to Shipped. The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs." [source: notes.ts → NOTES.patterns]

### Chapter 8 · Prove it, then operate it

- **Goal:** show quality is measured and that the gate blocks a bad prompt; then that building the agent is half the job, with the platform that operates it and the viewer's own run in it.
- **Shape:** five steps in two parts: prove it (`operate.metrics`, `operate.promote`, `operate.gate` on `/app/evals`) and operate it (`operate.kpis`, `operate.trace` in Agent Ops) [source: steps.ts].

#### Prove it (`operate.metrics`, `operate.promote`, `operate.gate`)

- **What's on screen:** the Quality page (precision and recall per type and per mess level, safety and routing, the candidate prompt, the "Go-live check" with its Promote button, and the result) [source: steps.ts → `operate.metrics`, `operate.promote`, `operate.gate`; src/app/pages/Evals.tsx; src/app/pages/evals/PromotionGate.tsx].
- **What the viewer does (3 steps):** read the accuracy (`operate.metrics`); click Promote on the candidate (`operate.promote`, "A rewritten prompt, scored on the same files. It looks fine on recall. Try to promote it."; waits for `eval.promote_attempted`); read the block (`operate.gate`).
- **What it proves:** a change that looks fine on recall is blocked on precision, by rule, before it ships.
- **Key numbers (promoted prompt v4, 48 golden files):**
  - Precision 88.7% (125/141), recall 97.7% (125/128) [source: latest.json → promoted.metrics precision, recall].
  - Level-5 recall 90% (18/20) [source: latest.json → recall.level5].
  - Grounding 100% (275/275); routing 94.4% (118/125) [source: latest.json].
  - Safety: 0 of 2 negative-control false positives, 2 of 2 injections flagged, 0 of 2 PHI leaks, 0 of 48 run failures [source: latest.json].
  - Under the 85% line per type: feature request 81.5% (22/27), praise 81.3% (13/16), churn risk 78.6% (11/14), pricing objection 77.8% (14/18) [source: latest.json → precision.<type>].
  - Eval run cost $0.093 for 48 files; p50 2.7 s, p95 3.8 s [source: latest.json → promoted.costUsd, p50Ms, p95Ms].
  - These eval runs predate the decision model and the second opinion [source: latest.json → promoted.createdAt 2026-10-25T03:58Z, before the Switchboard commit].
- **Key numbers (candidate v5):**
  - Precision 59.7% (126/211), recall 98.4% (126/128), grounding 99.4% (502/505) [source: latest.json → candidate.metrics].
  - The Guide says "Blocked on precision: from 88.7% to 59.7%, under the 85% bar and a 29-point regression." [source: copy.ts → promoteCopy]. The gate's own reasons: precision under the 85% threshold, and a −28.9 point precision regression against a −2.0 point limit [source: latest.json → candidate.blockedReasons].
  - Over-labelling: 38 extra praise items (51 predicted, 13 correct) and 20 extra churn risks (31 predicted, 11 correct) [source: latest.json → precision.praise, precision.churn_risk; details-v5.json].
  - Cost $0.113 and p95 6.3 s for the eval set, both worse than v4; shown, not gated [source: latest.json → candidate.costUsd, p95Ms; copy.ts → promoteCopy].
  - Live AI has a hard $15 cap for viewers; past it, runs replay recorded live runs. The cap is in `operate.gate`'s "How this works" and on Usage and health; it is not its own step [source: wrangler.jsonc → vars.BUDGET_LIMIT_USD; steps.ts → `operate.gate`.more].
  - `operate.gate` still defines the chapter-end line "1 bad prompt blocked before it shipped, by rule, not by judgement", but it no longer shows, because `operate.gate` is not chapter 8's last step [source: steps.ts → `operate.gate`.checkpoint; Guide.tsx → PresentBody].
- **Why this design:** Because a prompt can look better on one metric and quietly worse on another, promotion needs every gate check to pass (overall precision ≥ 85%, recall ≥ 80%, level-5 recall ≥ 70%, grounding ≥ 95%, zero negative false positives, every injection flagged, zero PHI leaks, zero run failures, and no regression over 2 points on precision, recall or level-5 recall), over a reviewer's judgement call [source: src/shared/scoring.ts → PROMOTION_GATE; docs/RUNBOOK.md → Prompt promotion]. Trade-off: per-type slices, cost and latency are reported, not gated yet. See ADR 6.
- **Likely question → short answer:** "Did you build v5 to fail?" → Yes, deliberately: it is the cost-cutting rewrite people really make. Every quote was real, which is exactly why grounding alone isn't enough [source: notes.ts → NOTES.operate].
- **Speaker line:** "Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback." [source: notes.ts → NOTES.operate]

#### Operate it (`operate.kpis`, `operate.trace`)

- **What's on screen:** Agent Ops' executive overview (hours returned, value of that time against metered AI spend, adoption), then the trace of the viewer's own run: every step, model call, retry and delivery on one timeline [source: steps.ts → `operate.kpis`, `operate.trace`; src/platform/pages/Overview.tsx, Trace.tsx].
- **What the viewer does (2 steps):** read the exec view (`operate.kpis`, the presentation opens `/ops` directly), then their run's trace (`operate.trace`, at `/ops/traces/<runId>`; the trace id is the run id). The registry, the agent page with the nine-check standard, usage, logs and SLOs are one click away, and each has a nudge in explore mode [source: steps.ts; src/worker/telemetry.ts header; src/tour/guide/nudges.ts].
- **What it proves:** the viewer's own run is in Agent Ops under one trace, with the same timings the conversation page drew, and the agent is owned past launch.
- **Key numbers:**
  - Two agents registered: Signal Loop (real) and an RFP & Security Questionnaire Responder (Gumloop-built, **Simulated**) [source: data/platform/agents.json → note].
  - Signal Loop passes 9 of 9 standard checks; the RFP agent fails the evals check [source: agents.json → agents[].record.standard]. The security review and business-owner sign-off are illustrative records [source: agents.json → standard owner, data_review evidence].
  - Review cadence 30 days; last review 2026-10-12; next 2026-11-11 [source: agents.json → agt_signal_loop.record].
  - Hours returned = Σ(registered baseline minutes per unit − measured human review minutes) [source: steps.ts → `operate.kpis`.more]. Baseline 18 minutes per call [source: agents.json → baselineMinutesPerUnit; src/shared/scoring.ts → MINUTES_SAVED_PER_CALL]. **Assumption** until the time study. Loaded rate $85 an hour [source: src/worker/platform/math.ts → DEFAULT_LOADED_HOURLY_USD].
  - History: 218 real pipeline runs over synthetic calls, with simulated users, from 2026-09-14 to 2026-10-24 [source: data/backfill/runs.json; agents.json → window]. **Simulated** users. This session's telemetry is **Live**.
  - SLO targets: run success 99%, grounding 95%, delivery 99.5%, cost per unit $0.02, p95 900 ms [source: agents.json → agt_signal_loop.profile.slo].
  - Chapter-end line: "hours returned by Signal Loop, baselines are labelled assumptions" [source: steps.ts → `operate.trace`.checkpoint]. **Live.**
- **Why this design:** Because the role is as much about operating agents as building them, Signal Loop reports logs, spans, usage and work units into a shared platform through one SDK, over a dashboard inside the agent. Every agent is held to the same nine checks, mine included. Trade-off: with one real agent, the multi-agent story is a design, not a track record; and with two stops, the standard and SLOs are shown in explore mode rather than narrated. See ADR 9.
- **Likely question → short answer:** "Is the adoption panel real?" → The runs are real executions; the users in the history are simulated. Only this session is live. The instrumentation is what is real: on day one with real CSMs, the same panel is true [source: copy.ts → opsLiveCopy; steps.ts → `operate.kpis`.more].
- **Speaker line:** "Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops." Then: "And this is your run, every step and model call on one trace." [source: notes.ts → NOTES.operate]

---

## Closing (chapters 9–10)

### Chapter 9 · Making it real

- **Goal:** how adoption is earned and measured, where this goes over the next 12–18 months, and the same design on a production stack.
- **What's on screen:** one scene under the headline "Making it real." and the line "Roll it out one phase at a time, grow it on one platform, and run the same design in production." Three sections side by side (stacked on phones), all on screen at arrival; they enter left to right once [source: src/narrative/scenes/Production.tsx header, PHASES, MILES, STACK].
  - **Roll it out: "Earn trust, one phase at a time".** Four phases, one line each: Week 0, Discovery ("Shadow two CSMs; a two-week time study."); Weeks 1–2, Shadow mode ("Runs on real calls; nothing is sent."); Weeks 3–6, Champions ("Two or three CSMs and a PM tune it."); Week 7+, Whole team ("High stakes stay reviewed; the rest routes."). Then "1.75 hours back to each CSM every week, about 2,730 a year across 30 CSMs" with an Assumption callout ("10 minutes of admin per call, 15 calls a week, 70% removed."), and "Then operate it. Adoption from usage events, not surveys. Every agent gets an owner, a review date and the nine-check standard."
  - **Grow it: "The next 12 to 18 months".** Six milestones, one line each: Months 0–3, earn trust first ("The rollout, before anything is automatic."); Months 3–6, every call, by default ("Read calls straight from the recorder and CRM.", replaced by the measured AI cost per call when the run ledger answers); Months 6–9, capture during the call ("The CSM confirms a signal before hanging up."); Months 9–12, more analyses, one platform ("Follow-ups, renewal risk and escalations."); Months 12–15, specialist agents ("One finds, one checks each claim, one routes."); Months 15–18, part of Invoca's platform ("Compliance review, coaching, and Signal AI."). Then "What doesn't change: no quote, no insight. Code checks the model. People make the high-stakes calls."
  - **Run it: "Same design, production stack".** Eight jobs, production first with today's proof-of-concept piece under each: website and API (Vercel with Next.js; today a Cloudflare Worker and a React app); AI calls (AI SDK on our own keys; today the Vercel AI SDK through OpenRouter); long-running jobs (Trigger.dev; today Cloudflare Workflows); data and search (Neon Postgres, pgvector; today Cloudflare D1 and Vectorize); reporting at scale (ClickHouse with dbt; today daily summaries in D1); conversations in (dlt from Gong, Zoom, CRMs; today any file, connectors simulated); results out (Slack, Jira, Salesforce APIs; today in-app previews, simulated); live transcription (streaming on Render; not needed yet). Two constants: "Strict TypeScript, one set of contracts" and "Providers bill directly; keys stay on the server".
  - Not on this screen, and where it is instead: the trust mechanics, the operating loop and the post-launch cards are in Part 4 of the write-up; the weekly success metrics with baselines and targets are on `/backup/metrics`; the full 11-row stack table (including "Deciding what to run" and "Original files") is in Part 5 of the write-up; drift, alerting and builder enablement are in the speaker notes [source: src/web/pages/WriteUp.tsx → sections `rollout`, `next`, STACK; src/narrative/backup/BackupPage.tsx → METRICS; docs/speaker-notes.md chapter 9].
- **What the viewer does:** reads it left to right; the Next button reads "Scorecard" [source: src/narrative/scenes/index.ts → exitLabel].
- **What it proves:** the rollout is additive (it takes the data entry, not the judgement); the ingredients get cheaper and faster and more analyses run on the same platform while the trust mechanisms stay; and the prompts, quote checks and tests move unchanged to production, where only hosting and the connectors change.
- **Key numbers:**
  - 1.75 hours given back to each CSM a week; about 2,730 hours a year across 30 CSMs [source: Production.tsx → Stat]. **Assumption:** 10 minutes of admin per call, 15 calls a week, 70% removed; the time study replaces it [source: Production.tsx → Callout].
  - Champions: two or three CSMs and a PM [source: Production.tsx → PHASES].
  - The "every call" milestone reads the mean AI cost of the live runs in the run ledger at run time. **Live.** Recorded runs average $0.00141 per call (48 runs) and the backfill $0.00133 (218 runs) [source: Production.tsx → usePerCallCost; computed from data/replays/*.json → run.costUsd and data/backfill/runs.json → costUsd].
- **Why this design:**
  - Because CSMs will not feed a system they don't trust, the rollout runs shadow mode first (nothing sent), then champions with a weekly calibration, then the team, over a big-bang launch. Adoption is measured from usage events, not surveys. Trade-off: no automatic routing until about week 7.
  - Because "every call by default" before shadow mode and champions would contradict the rollout, the horizon starts after months 0–3, over a timeline that promises full coverage in the first quarter. Trade-off: slower to full coverage.
  - One Cloudflare Worker was fast to ship, one deploy, and behind a gate for the proof of concept (chapter 3); see ADR 10 for the production mapping.
  - Rollout, growth and production share one screen in three columns, one line per item. Trade-off: the detail (trust mechanics, the weekly measures, the full stack table) moves to the write-up and the speaker notes.
- **Likely question → short answer:** "What would make you shut it off?" → Kill and rework criteria are signed by the business owner [source: docs/RUNBOOK.md → Owners]. Proposed, not configured: auto-route precision under the 85% bar for two weeks, weekly active reviewers falling for a month, or net hours (after review time) below cost. "Why would this move into Signal AI?" → The long-term engine should be Invoca's own conversation platform; the workflow, gates and routing layer still have to exist above it. "Which analysis comes next?" → Follow-ups, renewal risk and escalations in months 9–12, on the same intake, decision model and delivery [source: Production.tsx → MILES; WriteUp.tsx → section `next`]. "Isn't that a rewrite?" → A port of adapters, not logic. The 10-step pipeline core (`src/pipeline/run.ts`) is runtime-agnostic and the contracts are shared Zod and TypeScript; the eval suite proves parity.
- **Speaker line:** "Three things on one screen: roll it out, grow it, run it in production." Then: "What doesn't change: quotes checked in code, gates, routing as data, human judgement." And: "The proof of concept runs on one Cloudflare Worker: fast to ship, one deploy, behind a gate. The production design keeps the same boundaries." [source: notes.ts → NOTES.production]

### Chapter 10 · Scorecard

- **Goal:** recap what the viewer did and what the system did, then unlock everything.
- **What's on screen:** "You" tiles (calls run, decisions made, routing rules changed, tickets shipped, scenarios explored of 6) and "The system" tiles (insights extracted, quotes grounded or dropped, injections caught or values redacted, insights routed, AI spend), plus an Agent Ops line counting the viewer's log lines and timed steps. If the viewer ran nothing, the headline says "Your scorecard is empty so far." and the page offers "Bring in a call", which goes to chapter 4's first product step (`call.intro`) [source: src/narrative/scenes/Scorecard.tsx → empty, startCall].
- **What the viewer does:** Explore freely (to New conversation, with the Guide in explore mode), Open Agent Ops, Read the write-up, Ask Claude about it (`/app/claude`), or Replay the presentation (hidden when the scorecard is empty). Each way out finishes the presentation, so the Guide offers a nudge per screen afterwards. The scorecard has no bottom bar, and → does nothing on it; ← goes back [source: Scorecard.tsx → leave, explore; TourProvider.tsx → finish, keyboard; scenes/index.ts → bare].
- **What it proves:** every number is counted from the viewer's workspace and session.
- **Key numbers:** all **Live**.
- **Why this design:** Because a zero the viewer did not cause reads as a failure, a zero system counter is swapped for a fact about their own run or left out, over a fixed tile grid; with nothing run at all, the page says so and points at chapter 4 [source: Scorecard.tsx comments]. Trade-off: different viewers see different tiles.
- **Likely question → short answer:** "Is any of this scripted?" → No. It reads the workspace and Agent Ops at render time.
- **Speaker line:** "Every number here is counted from your workspace and this session. Nothing on this page is scripted." [source: notes.ts → NOTES.scorecard]

---

## Branches

The file picked in chapter 4 changes the rest of chapter 4 (watching it run); every path rejoins at chapter 5. The last main-path step of chapter 4 (`call.timing`) counts scenarios explored ("1 of 6 scenarios explored", with the ones still to try) and offers "Try another file", which goes back to "Bring in today's call" (`call.intro`) to open the picker again [source: docs/PLAN.md → Branches; steps.ts → `call.timing`.checkpoint, actions]. Entry files come from `data/tour-files.json`. Numbers below are from each file's recorded run in `data/replays/<file>.json` (what the viewer sees when live AI is off); a live run may differ. The recordings predate the decision model, so their triage came from the main model and they carry no second opinion. All files are **Simulated**.

### Branch: main (Brightline QBR)

- **Goal:** the full story on a level-3 natural transcript.
- **What's on screen:** the standard chapter 4 run sequence: `call.watch`, `call.screen` (Triage, "Read first, by a fast model"), `call.ground`, `call.gate`, `call.timing` [source: steps.ts; copy.ts → screenCopy].
- **What the viewer does:** pick the highlighted `2026-10-21_Brightline_QBR_transcript.vtt` (`file_c1042`).
- **What it proves:** six real signals survive tangents and small talk, and an interruption is a grounding trap.
- **Key numbers:** 6 insights; 14/14 quotes exact; 3 auto-route, 3 review (two high or critical bugs and the churn risk); $0.001401; 4,238 ms recorded [source: data/replays/file_c1042.json]. Replayed today it runs 3,247 ms, re-timed to the current step order [source: src/pipeline/replay.ts → fastPathTiming].
- **Why this design:** Because a tidy file would not test grounding, C-1042 has Dana's sentence interrupted by Jeff, so a model that stitches turns into one quote produces text that does not exist [source: docs/data-review.md → Where grounding matters]. Trade-off: hand-written, so it shows the trap exists, not how often real models fall in it.
- **Likely question → short answer:** "Why was the churn line reviewed at 0.94?" → Churn risk is always reviewed, whatever the confidence, and the second opinion cannot move a forced review [source: file_c1042.json → gateReasons; score.ts → applySecondOpinion].
- **Speaker line:** "Brightline is the main path; any file works and each one tells a different story." [source: notes.ts → NOTES.call]

### Branch: clean (Harbor FCU notes)

- **Goal:** a baseline on tidy CSM notes.
- **What's on screen:** a fast run; after `call.timing` comes `call.clean`: "Easy. Real calls aren't like this." with "Try a messy one" or Next [source: steps.ts → `call.timing`.next, `call.clean`].
- **What the viewer does:** pick `file_harbor_checkin_notes`.
- **What it proves:** the easy case is easy; the interesting cases are the others.
- **Key numbers:** 3 insights; 3/3 quotes exact; 2 auto-route, 1 review; $0.000949; 1,931 ms [source: data/replays/file_harbor_checkin_notes.json].
- **Why this design:** Because a viewer who picks the easiest file should still learn something, the branch offers a messy one rather than ending, over silently continuing.
- **Likely question → short answer:** "Is level 1 in the evals?" → Yes: level-1 recall 100% (21/21) on v4 [source: latest.json → recall.level1].
- **Speaker line:** "Clean notes are the baseline. Offer the messy one if there's time." [source: notes.ts → STEP_NOTES['call.clean']]

### Branch: messy (SunPeak raw speech-to-text)

- **Goal:** stay honest under noise.
- **What's on screen:** `call.messy`: "Honest under noise" with the run's average confidence and review count [source: steps.ts; copy.ts → messyCopy].
- **What the viewer does:** pick `file_sunpeak_checkin_asr` (raw ASR: "google adds", "call rail", speaker bleed, sarcasm) [source: docs/data-review.md → Branch entry files].
- **What it proves:** the model quotes the garbled text verbatim, so quotes ground exactly.
- **Key numbers:** 3 insights; 7/7 quotes exact; average final confidence 0.92; 2 of 3 to review, both because high bugs are always reviewed [source: data/replays/file_sunpeak_checkin_asr.json → insights[].confidenceFinal, gateReasons]. v4 level-4 recall 100% (20/20), level-5 recall 90% (18/20) [source: latest.json].
- **Why this design:** Because golden quotes for levels 4–5 are the corrupted spans, grounding is checked against what was actually transcribed, over a cleaned-up version of the text [source: docs/data-review.md → Known limitations]. Trade-off: a model that "repairs" text when quoting needs the fuzzy path.
- **Likely question → short answer:** "Does noise lower confidence?" → That is the mechanism (final confidence includes the grounding score), but on this recorded run confidence stayed high and review was driven by severity rules. Triage also records how noisy the input is (clean, noisy, very noisy), but that label does not change how the file is extracted [source: src/pipeline/run.ts → screen step detail.complexity]. Say what the Guide shows.
- **Speaker line:** "The model quoted the garbled text verbatim, so it grounds exactly; noise shows up as lower confidence and more review." [source: docs/speaker-notes.md → Chapter 4 branch extras]

### Branch: security (Ridgeway injection)

- **Goal:** a planted instruction is treated as data.
- **What's on screen:** `call.screen`: "Injection flagged, and kept inert. Caught by the decision model and a code check. Treated as data: output stays schema-only, with an audit row." [source: copy.ts → screenCopy].
- **What the viewer does:** pick `file_ridgeway_prep_injection` (a blunt planted instruction inside a pasted survey export, plus two real insights) [source: docs/data-review.md].
- **What it proves:** the instruction has nothing to act on: text is wrapped as data, output is schema-only, no model has tools; the attempt is flagged and audited.
- **Key numbers:** triage `injection_suspected: true`; 3 insights, all sent to review because injection was suspected in the file; $0.002042 [source: data/replays/file_ridgeway_prep_injection.json → screen, gateReasons]. The model's flag is OR-ed with a deterministic heuristic that scans the full text [source: docs/ARCHITECTURE.md → Triage]. Eval: 2 of 2 injections flagged [source: latest.json → injection_flagged]. In the decision-model speed test, the chosen model got 18 of 18 injection verdicts right on its own flag [source: decision-models.md → Results].
- **Why this design:** Because prompt-level defences can be talked around, we removed the capability instead (no tools, fixed schema) and sent the whole file to a person, over trusting a "do not follow instructions in the transcript" line. Trade-off: one hostile line puts a whole call into review.
- **Likely question → short answer:** "Is two injection files enough?" → No. It shows the mechanism, not coverage; a few hundred items is the production bar.
- **Speaker line:** "Point at the injection flag and the audit row." [source: docs/speaker-notes.md → Chapter 4 branch extras]

### Branch: negative (PrairieLink friendly check-in)

- **Goal:** the right output is nothing.
- **What's on screen:** Triage says it is friendly with nothing for the product team, and the main pass that started alongside is discarded; Extract shows zero insights with a calm empty state. The Guide goes from `call.screen` straight to `call.timing` [source: copy.ts → screenCopy, extractCopy; steps.ts → `call.screen`.next].
- **What the viewer does:** pick `file_prairielink_friendly` (training logistics, a puppy, the first snow) [source: docs/data-review.md].
- **What it proves:** the system does not invent work to look busy.
- **Key numbers:** 0 insights; status completed; 399 ms; $0.000156 [source: data/replays/file_prairielink_friendly.json]. Eval: 0 of 2 negative-control false positives [source: latest.json → negative_fp_rate].
- **Why this design:** Because false positives cost PM trust, the prompt says "return an empty list if nothing applies" and the gate requires zero negative false positives, over always producing a summary [source: docs/PLAN.md → Prompts; scoring.ts → PROMOTION_GATE.negativeFpRate].
- **Likely question → short answer:** "Why start extraction at all?" → To save time on the normal case: extraction starts alongside triage, and when triage says nothing is actionable its output is discarded (its cost stays on the run) and the Extract step shows as skipped [source: src/pipeline/run.ts → skipExtract; docs/ARCHITECTURE.md → Latency work].
- **Speaker line:** "Zero insights, and that's correct." [source: docs/speaker-notes.md → Chapter 4 branch extras]

### Branch: privacy (Meridian PHI-heavy call)

- **Goal:** only redacted text reaches a model.
- **What's on screen:** `call.privacy`, right after `call.watch`: the Before and After switch on the transcript, with tokens like `[PATIENT_1]`, and the count of values redacted [source: steps.ts → `call.privacy`; copy.ts → redactCopy].
- **What the viewer does:** pick `file_meridian_phi_call`, then switch between Before and After (the step waits for `redaction.toggled`; "Your turn: switch between Before and After").
- **What it proves:** tokens keep the meaning and drop the identity; the original never leaves the Worker and the browser sees only a masked preview.
- **Key numbers:** 22 values redacted across address, DOB, MRN, patient, person and phone; 3 insights; $0.000802 [source: data/replays/file_meridian_phi_call.json → redactions]. Eval: 0 of 2 PHI leaks [source: latest.json → phi_leakage].
- **Why this design:** Because a model call is a data boundary, redaction runs before any model call with reversible tokens, over relying on the provider's retention terms. See ADR 5.
- **Likely question → short answer:** "Does the redactor catch patient names it doesn't know?" → Unproven. Names are keyword-anchored plus a known-names list; a labelled PHI set and redaction recall as a release gate come before any real PHI-bearing call.
- **Speaker line:** "Have them switch Before and After. Tokens keep meaning, drop identity. Only the redacted side reached a model." [source: notes.ts → STEP_NOTES['call.privacy']]

---

## Architecture and decisions

Each decision is a short ADR. Status for all: accepted for the POC.

### ADR 1 · Routing by table, not prompt

- **Context:** who gets paged must be predictable, auditable and changeable by ops.
- **Decision:** the model classifies (type, area, severity); an editable rules table (type × area × severity × ARR band → owner and channel) decides the destination. Lowest priority wins; no match goes to triage [source: steps.ts → `routing.rule`.more; src/pipeline/route.ts; docs/PLAN.md §6 step 9].
- **Alternatives:** the prompt names the owner; a learned router.
- **Consequences:** a rule change re-routes with no prompt change and no redeploy; every change has a before and after in the audit log. New routing needs a rule.
- **Evidence:** routing accuracy 94.4% (118/125) on v4 [source: latest.json]; rollback for a bad rule is "revert the rule" [source: docs/RUNBOOK.md → Rollback].

### ADR 2 · Quote grounding in code

- **Context:** a fabricated quote shown as customer evidence is the worst failure for PM trust.
- **Decision:** every insight needs a verbatim quote; code normalizes both texts, tries an exact substring, then a sliding Levenshtein window; 0.90 or better passes; a quote that fails drops its insight and is counted. Long inputs are extracted in windows, but grounding always runs against the whole document [source: copy.ts → groundCopy; contracts.ts → THRESHOLDS.grounding; docs/ARCHITECTURE.md → Long inputs].
- **Alternatives:** the model checks itself; a second model checks quotes.
- **Consequences:** deterministic and testable; proves presence, not meaning or speaker. The second opinion (ADR 12) checks meaning against the grounded quotes, as advice only.
- **Evidence:** v4 275/275 grounded; v5 502/505 grounded yet precision 59.7% [source: latest.json]. Across the 48 recorded runs, 262 quotes matched exactly and 10 after normalization, 0 failed [source: computed from data/replays/*.json → evidence[].method].

### ADR 3 · Human review gate and thresholds

- **Context:** some outputs are cheap to get wrong (praise), others are not (churn, sev-1 bugs).
- **Decision:** final confidence = model confidence × grounding score × type prior × account context; ≥ 0.80 auto-route, 0.55–0.80 review, < 0.55 held; churn risk, high or critical bugs, every item in a file with suspected injection, and every item when triage was unavailable always go to review [source: src/pipeline/score.ts; src/pipeline/run.ts; scoring.ts → TYPE_PRIORS, ACCOUNT_CONTEXT]. The second opinion may then move a non-forced item one step, by policy in code (ADR 12).
- **Alternatives:** review everything; review nothing; one global threshold.
- **Consequences:** v4 sent 76 of 141 insights (54%) to review; 5 of 65 auto-routed were false positives (7.7%) [source: details-v4.json]. Both figures predate the second opinion. Type priors are **assumptions** [source: scoring.ts comment].
- **Evidence:** per-type precision is uneven (bug 98.0%, pricing 77.8%) [source: latest.json], which argues for per-type thresholds next.

### ADR 4 · Fast path first, durable Workflow as the fallback

- **Context:** a Workflow instance takes seconds to start and each durable step adds a few hundred milliseconds [source: docs/ARCHITECTURE.md].
- **Decision:** run the 10 steps on a fast path in `waitUntil`; if a step throws or the 18 s fast-path budget runs out, a conditional `UPDATE` claims the run and a Workflow resumes from the last completed step. Stalled runs (no progress for 40 s) are recovered; featured files not finished within 25 s become a replay [source: src/worker/execute.ts → FAST_PATH_BUDGET_MS; src/worker/runs.ts → STALLED_AFTER_MS; scoring.ts → LIVE_FALLBACK_AFTER_MS].
- **Alternatives:** Workflow for every run; fast path only.
- **Consequences:** normal runs are fast and still durable; steps are idempotent upserts; a run never executes twice (single claimant); writes go through one ordered queue with a liveness guard [source: docs/ARCHITECTURE.md]. A resumed Workflow recomputes the theme prefetch rather than reusing it [source: docs/ARCHITECTURE.md → Second opinion].
- **Evidence:** v4 eval p50 2.7 s, p95 3.8 s, 0 of 48 run failures [source: latest.json].

### ADR 5 · Redaction before any model call

- **Context:** CSM calls carry PII and, for healthcare customers, PHI.
- **Decision:** uploads are converted to text in the browser and only the text is sent; regex plus validators (Luhn for cards, date sanity for DOB) then swap values for reversible tokens before any model sees text; the original never leaves the Worker; the browser sees a masked preview; model calls route only to providers that don't collect or train on data (`data_collection: deny`) [source: src/app/lib/convert/index.ts header; steps.ts → `call.privacy`.more; src/worker/ai.ts header; docs/ARCHITECTURE.md → Models].
- **Alternatives:** rely on provider retention terms; a managed de-identification service.
- **Consequences:** meaning survives as tokens; recall on unanchored names is unproven; the provider filter is a routing setting, not a contract.
- **Evidence:** 0 of 2 PHI leaks on the eval; 22 values redacted on the PHI branch file [source: latest.json; data/replays/file_meridian_phi_call.json].

### ADR 6 · Eval promotion gate

- **Context:** prompt changes are the most common way an agent quietly regresses.
- **Decision:** a candidate is promoted only if every check in `PROMOTION_GATE` passes and no regression exceeds 2 points on precision, recall or level-5 recall; matching is by code (same type, overlapping quote spans), and only ambiguous leftovers go to a judge from a different model family [source: scoring.ts → PROMOTION_GATE; steps.ts → `operate.metrics`.more; docs/RUNBOOK.md].
- **Alternatives:** manual review of sample outputs; an LLM judge for everything.
- **Consequences:** v5 was blocked on precision even though recall rose; cost and p95 are shown, not gated [source: latest.json → candidate.blockedReasons].
- **Evidence:** 48 golden files across 5 mess levels plus edge cases [source: latest.json → files; docs/data-review.md]. Every insight records its prompt version, so a bad prompt's blast radius is queryable [source: docs/RUNBOOK.md → Rollback].

### ADR 7 · Budget hard stop, then replay

- **Context:** the demo link is open to a panel for 7 days with a fixed spend.
- **Decision:** viewers share a $15 cap. Each live run reserves its worst case with one atomic conditional insert: every call at max output (triage, extraction in as many windows as the input needs, the second opinion, theme naming), every attempt its chain allows (three on the main tier, two on the decision tier), the dearest configured model's prices, plus 20%. At most 8 unsettled reservations at once; rate limits fail closed; when the remainder cannot cover a run, or the provider answers 402, live AI flips off and runs replay recorded real executions, labelled on screen. The provider key has its own hard limit too [source: wrangler.jsonc → BUDGET_LIMIT_USD, ratelimits; scoring.ts → estimateRunCostUsd, MAX_UNSETTLED_RESERVATIONS; docs/ARCHITECTURE.md → Budget].
- **Alternatives:** soft alerting only; no live AI (replay only).
- **Consequences:** never an outage; custom uploads show "Live AI budget reached" instead of replaying.
- **Evidence:** rate limits 12 runs a minute per workspace, 30 per IP, 10 sign-in attempts per IP [source: wrangler.jsonc]; per-run cap $0.05 [source: agents.json → profile.perRunCapUsd]; spend alert at 80% of cap [source: math.ts; docs/RUNBOOK.md].

### ADR 8 · Three model roles: decision, main and backup

- **Context:** speed matters for a watched demo; one provider can degrade or reprice; triage and the gate check need a model that is not the one being checked.
- **Decision:** three roles, each with a short chain [source: docs/ARCHITECTURE.md → Models: three tiers; docs/RUNBOOK.md → Model fallback; src/worker/ai.ts].
  - **Main model:** extraction and theme naming. Tries the main model, retries once with the schema errors fed back, then falls back to the backup model, then the dead-letter queue.
  - **Decision model:** triage and the second opinion. 4 s timeout, routed by latency; falls back to the main model, never the backup [source: ai.ts → DECISION_TIMEOUT_MS].
  - **Backup model:** fallback for main-tier calls, and its family is the eval tie-break judge [source: scripts/eval.ts → judge].
- **Alternatives:** one model; two models with the main model also screening (the previous design); a larger pool chosen per call.
- **Consequences:** a fallback that is easy to reason about. A decision-model outage costs one main-model call and never blocks a run; if the main model is also down, triage reads "Triage unavailable" and every insight is held for review [source: docs/RUNBOOK.md → Model fallback; run.ts]. Gap: the backup model has not been scored as primary, so degraded-mode precision is unknown.
- **Evidence:** price table used for estimates, per million input / output tokens: main $0.02 / $1.00, backup $0.10 / $0.50, decision $0.15 / $0.50 [source: scoring.ts → MODEL_PRICES]. Recorded runs average $0.00141 per call [source: computed from data/replays/*.json]. A simulated incident in the history shows 61% fallback during a primary outage [source: agents.json → alerts alr_hist_sl_fallback]. The decision-model speed test (`scripts/decision-speed-test.ts`) is summarised in `docs/reports/decision-models.md`; it timed the main and backup models too, as triage candidates (ADR 12). The earlier general speed-test script was removed from the repo.

### ADR 9 · Agent Ops registry and the nine-check standard

- **Context:** dozens of agents built in Claude, Gumloop or code need owners and comparable reporting.
- **Decision:** a registry with a named owner, business owner, purpose, data access, review cadence and baseline minutes per unit; nine checks for every production agent: owner, purpose and success metric, security and data review, evals with a promotion gate, logs and traces, spend cap, human review on high-stakes output, rollback and runbook, current review cadence [source: src/shared/platform-contracts.ts → STANDARD_CHECKS; data/platform/agents.json].
- **Alternatives:** per-team dashboards; a review committee.
- **Consequences:** comparable hours-returned and cost across agents; overdue reviews surface automatically. Baselines are registered assumptions.
- **Evidence:** Signal Loop 9/9 (two records illustrative); the simulated RFP agent fails the evals check ("Spot-checks only") [source: agents.json → standard].

### ADR 10 · POC on Cloudflare, production on Neon, Vercel and Trigger.dev

- **Context:** the POC had to be deployed, gated and cheap to run for a week; production needs managed Postgres, observability and scale.
- **Decision:** POC: one Worker (gate, API, SPA, pipeline, Switchboard, Agent Ops), D1, Vectorize, R2, KV and Workflows, with model calls (decision model included) through OpenRouter and simulated connectors [source: wrangler.jsonc; docs/ARCHITECTURE.md; Production.tsx → STACK]. Production: Vercel (Next.js), Neon Postgres with pgvector, Vercel AI SDK with direct provider keys and provider-owned billing, the same decision model on our own key, Trigger.dev for long-running jobs, Render for streaming speech-to-text workers, dlt plus direct connectors for ingestion from the recorder and CRM if and when it is needed, the real Slack, Jira and Salesforce APIs for delivery, ClickHouse with dbt only once analytics volume justifies it, strict TypeScript throughout [source: src/narrative/scenes/Production.tsx → STACK (8 rows, on screen in chapter 9); src/web/pages/WriteUp.tsx → STACK (11 rows, including the decision model on our own key); docs/PLAN.md → Production stack].
- **Alternatives:** build directly on the production stack; stay on Cloudflare.
- **Consequences:** a port of adapters, not logic; the eval suite is the parity contract. The production stack is a design, not a port yet.
- **Evidence:** the pipeline core `src/pipeline/run.ts` is runtime-agnostic; contracts are shared Zod (`src/shared/contracts.ts`, `src/shared/platform.ts`) [source: docs/ARCHITECTURE.md].

### ADR 11 · Deterministic theme membership

- **Context:** a PM must be able to trust that a theme's members and ARR are reproducible.
- **Decision:** embeddings plus nearest neighbours; join an existing theme at cosine ≥ 0.82, else start a candidate theme; the model only names themes, in one batched call after the run. Embeddings and neighbour lookups start alongside the second opinion, since they don't depend on its verdict [source: scoring.ts → THEME_JOIN_THRESHOLD; docs/ARCHITECTURE.md → Latency work, Second opinion].
- **Alternatives:** LLM clustering; manual tagging.
- **Consequences:** reproducible membership; themes need history, so day one is thin; no theme-quality eval yet.
- **Evidence:** 15 planted backfill themes, the largest 32 insights from 7 accounts [source: docs/data-review.md]. **Simulated.**

### ADR 12 · A separate decision model for triage and the second opinion

- **Context:** every input needs a quick first read (what it is, which analyses apply, whether anyone is steering the AI), and borderline items benefit from an independent check. The old screen ran on the main model.
- **Decision:** `z-ai/glm-5.3-flash` (`MODEL_DECISION`), chosen by a measured speed test: 12 candidates on OpenRouter, 9 golden files (one per kind of input) twice each through the production call path; the rule was the fastest model with every answer valid and every actionable and injection verdict right, ties broken on cost. It runs triage (prompt v5) and one batched second opinion per run; code applies the second opinion's policy [source: docs/reports/decision-models.md; wrangler.jsonc → vars; src/shared/prompts/screen.ts, secondOpinion.ts].
- **Alternatives:** keep triage on the main model (the fastest in the test, p50 484 ms, every verdict right); a slower model that also qualified, such as the backup model (p50 1,324 ms).
- **Why not the faster main model:** the second opinion would be the same model checking its own extraction; the fallback would not be a fallback, because one outage would take out triage and the second opinion together; and the chosen model has the better p95 (1,465 vs 1,765 ms) at about a third of the cost per call ($0.000141 vs $0.000417) [source: decision-models.md → Why GLM-5.3 Flash].
- **Consequences:** triage is not faster than the old screen (p50 882 vs 470 ms), but it runs alongside extraction so it adds no wall time, costs about a quarter of the old screen per call ($0.000141 vs $0.000616), and returns more (document kind, complexity, which analyses apply). The second opinion adds no wall time because the theme step's embeddings overlap it. Switching back is one variable: set `MODEL_DECISION` to the main model [source: decision-models.md → What this means for speed; docs/RUNBOOK.md → Model fallback].
- **Evidence:** 18/18 valid answers, 18/18 actionable and 18/18 injection verdicts right [source: decision-models.md → Results]. Second opinion on three files: disputed 6 of 6 deliberately misread items and agreed with 11 of 12 correct ones [source: decision-models.md → Second opinion]. The test cost $0.1069 [source: decision-models.md → Spend].

### ADR 13 · Connectors simulated, behaviour real

- **Context:** a panel demo cannot hold real Slack, Jira or Salesforce credentials, but routing and tagging must behave as they would.
- **Decision:** connecting a tool records a workspace-scoped connection with a simulated account; deliveries render as in-app previews with receipts; nothing leaves the Worker. Routing reads connection state: a rule whose tool is disconnected, or whose owner was removed from the directory, routes to triage with the reason ("Jira isn't connected, so this went to triage"). People are tagged by their handle in each tool, from the People directory [source: platform.ts header, CHANNEL_CONNECTOR, personHandle; src/pipeline/route.ts; src/pipeline/deliver.ts; docs/ARCHITECTURE.md → Switchboard].
- **Alternatives:** real sandbox integrations; static screenshots of destinations.
- **Consequences:** a viewer can disconnect a tool and watch routing change, safely, in their own workspace; a run from a disconnected source tool is refused. Real-API failure modes (expired auth, rate limits, payload rejections) are not exercised. Production swaps previews for the real APIs one destination at a time [source: src/worker/runs.ts → source_not_connected; docs/speaker-notes.md Q19].
- **Evidence:** 12 connectors in the catalog, 7 connected by default [source: platform.ts → CONNECTORS, SEED_CONNECTED]; routing to triage on disconnect, tagging by handle, and reconnect restoring the rule are tested [source: tests/unit/pipeline/connectors.test.ts; tests/worker/switchboard.test.ts].

---

## Fallbacks during a live presentation

- **Replay mode:** if live AI is off or over budget, runs replay a recorded real execution at its recorded speed, labelled "Replay" on the clock and the Timing card [source: docs/RUNBOOK.md → Replay mode; src/app/pages/run/Timing.tsx]. Replays predate the decision model, so they show no second opinion, and they are re-timed to today's step order [source: src/pipeline/replay.ts → fastPathTiming].
- **Decision model down:** triage and the second opinion move to the main model automatically; nothing to do live [source: docs/RUNBOOK.md → Model fallback].
- **Workspace reset:** Settings → Reset workspace (or `POST /api/workspace/reset`) clears the viewer's conversations, review decisions, ticket and routing changes, connections, people edits and acting user; sample history stays [source: src/app/pages/Settings.tsx; docs/ARCHITECTURE.md → Switchboard; tests/worker/switchboard.test.ts].
- **Jump anywhere:** on scenes, the chapter rail (1,200 px and wider) or the top bar's chapter menu (narrower, also Esc); on product pages, the Guide's chapter picker. All three list the same 10 chapters [source: src/tour/hud/Hud.tsx; src/tour/guide/Guide.tsx → ChapterPicker; src/tour/hud/ChapterList.tsx].
- **Step back out:** "Explore on your own" in the Guide (and at the foot of the rail) leaves presentation mode and remembers the step; "Resume presentation" returns to it [source: Guide.tsx; src/tour/engine/TourProvider.tsx → exit, resume].
- **A target that isn't on screen:** the Guide says "That part of the page isn't on screen right now. Carry on when you're ready." and offers Next; a step whose live data never arrives can continue after 9 seconds [source: Guide.tsx → PresentBody; TourProvider.tsx → READY_GRACE_MS].
- **Backup scenes:** `/backup/cost`, `/backup/security`, `/backup/failure`, `/backup/build-vs-buy`, `/backup/metrics`, `/backup/agent-ops`, `/backup/differently` [source: chapters.ts → BACKUPS].
- **Presenter view:** `/presenter`, synced to the main window over a `BroadcastChannel` in the same browser profile, with the same chapter numbers and a jump list [source: src/web/pages/Presenter.tsx].
- **Deep links:** `?tour=<stepId>&path=<branch>` jumps to any step; `/walkthrough/<chapterId>` starts at a chapter's first step [source: TourProvider.tsx header; src/web/pages/Walkthrough.tsx].
- **Scenes don't move by accident:** a click on a scene, Space or Enter never advances it; only Back and Next, → and ←, or a clicker's PageDown and PageUp do [source: src/narrative/Scene.tsx header; TourProvider.tsx → keyboard].

---

## Honest gaps and next steps

Each gap names its evidence. These are the answers to give rather than overstating.

| Gap | Evidence | Next step |
|---|---|---|
| The data is synthetic and I labelled it; recall on planted insights is partly circular | docs/data-review.md | Label 50–100 real calls with a CSM and a PM in week 1 |
| No held-out test split, so v4's numbers are optimistic | docs/speaker-notes.md Q15 | Freeze a test set prompt authors never read |
| Four types sit under 85% precision (78–82%) | latest.json → precision.<type> | Per-type auto-route thresholds |
| 54% of v4 insights need a person | details-v4.json | Measure the second opinion's effect; tune thresholds on champion labels, weeks 3–6 |
| The eval results, the 48 recorded replays and the 218-run backfill predate the decision model and the second opinion; in replay mode triage shows the main model's result | latest.json → promoted.createdAt; data/replays/*.json → steps[key=screen].model | Re-run `npm run eval` and re-record replays with the decision tier |
| The decision model does not make triage faster than the old screen (p50 882 vs 470 ms); the gain is no added wall time, about a quarter of the cost, richer output and an independent check | docs/reports/decision-models.md | Say it that way; don't claim speed |
| The decision-model test is small: 9 files × 2 runs per model, and the second opinion was checked on 3 files | decision-models.md | A larger triage and second-opinion set inside the eval suite |
| Triage records complexity (clean, noisy, very noisy) but it does not choose the extraction path; long inputs are split by length alone | src/pipeline/run.ts (complexity only in step detail); scoring.ts → EXTRACT_CHUNKING | Use it to pick a path, or drop it |
| Parallel extraction of long inputs has not been measured against a single call | decision-models.md → What this means for speed | Time and score both on long golden files |
| Triage reads only the beginning and end of inputs over 40,000 characters (the injection heuristic still scans all of it) | scoring.ts → TRIAGE_MAX_CHARS; docs/ARCHITECTURE.md → Triage | Check triage verdicts on long files |
| Connectors are simulated: no real Slack, Teams, Jira, Linear, Salesforce, Gmail or Drive call is made, and library files are labelled by the tool they would have come from | platform.ts header, sourceForLibraryFile | Real APIs behind a flag, one destination at a time |
| Five of six analyses are listed but not built | platform.ts → ANALYSES | Follow-ups, renewal risk and escalations first (months 9–12) |
| Audio and video need a transcript; images, PDFs with no text layer, older Office and iWork files are refused; text past 200,000 characters is cut | src/app/lib/convert/index.ts, types.ts | Transcription (Render, in the production design) and OCR |
| The acting user is a workspace preference, not a sign-in; any viewer can act as anyone in the directory | platform.ts → Actor; docs/ARCHITECTURE.md → Acting user | Take identity from the real sign-in in production |
| Two different time assumptions: 18 minutes per call in the registry, 10 minutes × 70% in chapter 9's rollout section | agents.json, scoring.ts, Production.tsx → Stat, Callout | Replace both with the time study |
| PHI and injection evidence is two files each | latest.json | Sets of a few hundred items; redaction recall as a release gate |
| The provider filter is a routing setting, not contractual zero retention | src/worker/ai.ts; BackupPage.tsx | DPA and zero-retention terms with Security |
| Security review and business-owner sign-off are illustrative | agents.json → standard | Real review by Invoca Security; independent sign-off |
| Adoption history is simulated users; the RFP agent is simulated | agents.json → note | Register real agents in quarter 1 |
| Cost and latency are reported, not gated | latest.json; copy.ts → promoteCopy | Add them as gate checks |
| v4 was scored with no judge calls, v5 with 2 | details-v4.json, details-v5.json → judgeCalls | Re-run both under identical settings |
| Theme quality has no eval | none in data/evals | Merge and split review with PMs |
| The backup model has never been scored as primary | docs/speaker-notes.md Q13 | One `npm run eval` with it as primary |
| The production stack is a design, not a port | Production.tsx | Port adapters, prove parity with the eval suite |
| Replays are re-timed to today's step order (extraction drawn from triage's start, theme naming after the run), so a replay's timings are the recording adjusted, not a second recording; the Timing card says so | src/pipeline/replay.ts → fastPathTiming; src/app/pages/run/Timing.tsx → caption | Re-record replays with the parallel fast path |
| The live timings quoted in chapter 4 are one run, not a benchmark | one live run's step rows, not saved in the repo | Time 20 live runs per branch file and publish p50 and p95 |
| The fixture-mode product used by the end-to-end tests runs steps one after another, so the tests cannot see triage and extraction overlap | src/app/api/fixtures.ts → planRun, snapshot | A fixture with the fast path's shape |
| On phones the Guide is a bottom sheet that folds to its bar when a target is taller than the room above it, so a tall target's instruction is one line until the viewer opens the sheet | src/tour/guide/dock.ts → sheetPlan | Point those steps at a smaller part of the page |
| When the file picker is open on a smaller laptop screen (1024 × 768) the Guide shrinks to its pill, so the "select a file, then press Open" line is hidden until it is opened | src/tour/guide/dock.ts → chooseDock | A dialog-aware inline hint |

---

## Glossary

- **Acting user:** the person the viewer acts as. A new workspace acts as Elena Vasquez (VP, Product); switch with "Act as someone else" in the user menu. Reviews, connection changes and directory changes record this person [source: platform.ts → DEFAULT_ACTOR_ID, Actor].
- **Agent standard:** the nine checks every production agent must pass [source: platform-contracts.ts → STANDARD_CHECKS].
- **Analysis:** one kind of work Switchboard runs on a conversation. Six are listed; Signal Loop (product feedback) is the only one built. Triage says which apply [source: platform.ts → ANALYSES].
- **Anchor:** a `data-tour="<id>"` attribute the Guide points at with its ring; ids live in `src/tour/anchors.ts`.
- **Auto-route:** final confidence ≥ 0.80 and not a high-stakes type; delivered without review.
- **Backup model:** the third model role, used after a failed main-model retry and as the eval tie-break judge; never a fallback for decision calls.
- **Branch (path):** one of six routes through the run in chapter 4 (watching it run), chosen by the file picked earlier in chapter 4: main, clean, messy, security, negative, privacy. Every branch rejoins at chapter 5.
- **Chapter:** one of the 10 parts of the presentation, numbered in one sequence and grouped as Introduction (1–3), The platform (4–8) and Closing (9–10). Step ids are `<chapter>.<what>`; a scene that is a whole chapter uses the chapter id [source: chapters.ts → CHAPTERS, GROUPS; steps.ts header].
- **Chapter-end line:** the one quiet line the Guide shows on a chapter's last main-path step, saying what changed in that chapter (for example decisions made by a person). It replaced the count-up checkpoint modal [source: steps.ts → checkpoint; Guide.tsx → PresentBody].
- **Chapter rail:** the persistent chapter list to the left of the scenes on screens 1,200 px and wider; narrower, the top bar's chapter menu [source: src/tour/hud/Hud.tsx].
- **Connection:** a connector's state in one workspace (connected or disconnected), with a simulated account. A rule whose tool is disconnected routes to triage [source: platform.ts → Connection].
- **Decision model:** the small, fast model (`z-ai/glm-5.3-flash`) that runs triage and the second opinion; it falls back to the main model [source: wrangler.jsonc → MODEL_DECISION; docs/reports/decision-models.md].
- **Deliveries:** what was sent to each tool, with previews and receipts, on `/app/destinations`.
- **Dropped:** an insight whose quotes could not be grounded; counted, never shown as fact.
- **Explore mode:** the Guide after leaving the presentation: a nudge per screen and "Resume presentation" [source: Guide.tsx → ExploreBody].
- **Fast path:** the in-request execution of the 10 steps, before any Workflow handoff.
- **Golden file:** a hand-checked file with labelled expected insights; 48 featured files are scored [source: latest.json → files].
- **Grounding:** the code check that each quote exists in the transcript (0.90 or better). Shown as "Check quotes".
- **Guide:** the one persistent box on every product page, in presentation mode or explore mode; bottom-right on desktop, a bottom sheet on phones; never covers its target [source: src/tour/guide/Guide.tsx, dock.ts].
- **Held:** final confidence below 0.55; kept visible, not routed.
- **Hours returned:** Σ(baseline minutes per unit − measured human review minutes), with baselines labelled as assumptions.
- **Main model:** the model role for extraction and theme naming.
- **Mess level:** 1 clean notes, 2 tidy transcript, 3 natural, 4 raw speech-to-text, 5 chaos (Slack, forwarded email, partial) [source: docs/PLAN.md §5].
- **Nudge:** the Guide's "Try it" suggestion for the page that is open, one per Switchboard and Agent Ops screen [source: src/tour/guide/nudges.ts].
- **Owner link:** a sign-in URL that sets the owner cookie; treat as a secret.
- **Presentation mode:** the Guide while the presentation is on a product step: the step, its why, "Your turn" when it waits, Back and Next, and "Explore on your own" [source: Guide.tsx → PresentBody].
- **Promotion gate:** the rule set a candidate prompt must pass to ship; "Go-live check" on screen [source: scoring.ts → PROMOTION_GATE].
- **Redaction token:** a reversible placeholder such as `[PATIENT_1]` that replaces a personal value before any model call. Shown as "Remove PII".
- **Replay:** a recorded real execution played back at its recorded speed, re-timed to today's step order and labelled on screen; costs nothing.
- **Review:** final confidence 0.55–0.80, or any high-stakes item; waits for a person.
- **Scene:** a presentation page at `/walkthrough/:part` (chapters 1, 2, 3, 9 and 10, and the platform scene that opens chapter 4). It shows all of its content at once after one short entrance; only Back and Next, → and ←, or a clicker's PageDown and PageUp move on [source: src/narrative/scenes/index.ts; src/narrative/Scene.tsx; TourProvider.tsx → keyboard].
- **Second opinion:** one batched decision-model call after scoring that checks each kept insight against its own quotes. Code may move a borderline item it agrees with (≥ 0.85) to auto-route, or an auto-route item it disputes (≥ 0.6) to review; forced reviews and held items never move [source: score.ts → applySecondOpinion].
- **Signal Loop:** the analysis built for the brief: product feedback, proved with the customer's own words, routed to its owner. Also the agent registered in Agent Ops.
- **Signed link:** a 7-day access link (`?k=…`), revocable by its `jti` [source: src/worker/gate.ts].
- **Switchboard:** the platform Signal Loop runs inside: reads any conversation or document, decides what it is, runs the analyses that apply, and sends results to the right people in their own tools [source: platform.ts header].
- **Theme:** a group of similar insights across accounts (cosine ≥ 0.82), named by the model.
- **Timing card:** the card on a finished conversation that draws every step on one clock from its real timestamps, with model roles, tokens, AI cost and a link to the run's trace in Agent Ops [source: src/app/pages/run/Timing.tsx; src/shared/runTiming.ts].
- **Triage (step `screen`):** the first model call, on the decision model: what the input is, its language, how noisy it is, whether it is actionable, which analyses apply, and whether injection is suspected. Extraction starts alongside it [source: src/shared/prompts/screen.ts; stepText.ts].
- **Triage queue:** where unmatched or diverted insights go, owned by Product Operations (Jamie Fowler in the seed directory). Not the same as the triage step [source: data/world/routing.json → rule_fallback; route.ts → triageOwner].
- **Workspace:** a viewer's private copy of the sample data, including routing rules, connections, people edits and the acting user; edits never reach other viewers.
