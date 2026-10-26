---
title: "Switchboard and Signal Loop: the walkthrough, for AI assistants and readers"
version: "1.1"
date: "2026-10-25"
url: "https://repos.hunterborman.com/repo/invoca/"
markdown_url: "https://repos.hunterborman.com/repo/invoca/walkthrough.md"
duration: "25:00 (sum of targetSec in src/tour/script/chapters.ts)"
parts: 18
product_chapters: 8
branches: 6
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
  - src/narrative/scenes/*.tsx
  - src/shared/platform.ts
  - src/app/routes.tsx
  - src/app/AppShell.tsx
  - src/app/pages/run/stepText.ts
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
  - data/world/routing.json
  - data/world/people.json
  - data/tour-files.json
  - src/shared/scoring.ts
  - src/shared/contracts.ts
  - src/shared/prompts/extract.ts
  - src/pipeline/run.ts
  - src/pipeline/score.ts
  - src/pipeline/route.ts
  - src/pipeline/deliver.ts
  - src/worker/ai.ts
  - src/worker/execute.ts
  - src/worker/runs.ts
  - src/worker/platform/math.ts
  - wrangler.jsonc
---

# Switchboard and Signal Loop: the walkthrough

## How to read this file

This is the machine-readable version of the 18-part guided walkthrough at `/repo/invoca/`. It is written so an AI assistant can answer questions about the build without inventing anything. The hub and the write-up link to it as "Markdown version for AI assistants".

**What is authoritative, in order:**

1. The code and data files named in `[source: …]` tags. If this file and a source disagree, the source wins.
2. This file, for the reasoning behind each decision ("Why this design").
3. `docs/speaker-notes.md` and `src/tour/script/notes.ts`, for how Hunter says it out loud.

**Conventions:**

- `[source: path]` follows every number. A path with a key (for example `latest.json → promoted.precision`) names the field.
- **Assumption:** marks a figure that is illustrative or registered, not measured. Each one names what would replace it.
- **Simulated:** marks data that was generated, not observed. All accounts, people and calls are fictional. All connectors are simulated.
- **Live:** marks a value the screen reads at run time from the viewer's own workspace or session. This file never states a live value as fixed; it gives the recorded or eval value instead and says so.
- "Decision model", "main model" and "backup model" are the three model roles. The product shows exact model ids only on `/app/settings`. This file names the decision model's id where its choice is the point (ADR 12); all three ids are in `wrangler.jsonc → vars`.
- Routes are relative to `/repo/invoca`. Keys: → or Space for next, ← for back, Esc for the menu; on Review, A to approve, E to edit, R to reject.
- Deep link to any step: `?tour=<stepId>&path=<branch>` [source: src/tour/engine/TourProvider.tsx header].

**When answering a question:** quote the number with its source, say whether it is measured, an assumption or simulated, and use the "Honest gaps" section rather than overstating.

## Summary

Customers tell Invoca's CSMs what to build, and most of it never reaches the person who could act on it. Switchboard is a working platform that reads any conversation or document (a call transcript, notes, an email thread, a chat export, a PDF or a deck), decides what it is, runs the analyses that apply, and sends the result to the right people in the tools they already use. Signal Loop, the brief's Option 3, is the one analysis built inside it. It redacts personal and health details, extracts typed insights that each carry a verbatim quote, checks every quote against the transcript in code, sends uncertain or high-stakes items to a person, routes the rest by an editable rules table, groups them into themes with ARR attached, and tells the CSM when their feedback ships. Five other analyses are listed and marked not built. A fast decision model triages every input and gives a second opinion at the review gate. Connectors are simulated, but routing and tagging behave as they would with real ones. Signal Loop reports into Agent Ops, the sibling product where every agent has an owner, a spend cap, a quality gate, logs and a measured return. The walkthrough is 5 narrative parts on the problem, 1 on the platform, 8 product chapters where the viewer uses the real system, and 4 parts on rollout, the next 12–18 months, production and a scorecard. Six different starting files send the viewer down six branches through the same pipeline. The proof of concept runs on Cloudflare; the production design keeps the same boundaries on Neon, Vercel, the Vercel AI SDK, Trigger.dev and Render, with ClickHouse and dbt only at volume and dlt for ingestion.

### All 18 parts

Target seconds sum to 1,500 (25:00) [source: src/tour/script/chapters.ts → CHAPTERS, TOTAL_TARGET_SEC]. Adding "The platform" (60 s) took 15 s each from jobs to be done, today and tomorrow, rollout and the horizon [source: chapters.ts header].

| Part | Id | Title | Route | Layer | Target (s) | Objective |
|---|---|---|---|---|---|---|
| 0 | `cold-open` | Cold open | `/walkthrough/cold-open` | narrative | 30 | Set the frame |
| 1 | `black-hole` | Where feedback gets lost | `/walkthrough/black-hole` | narrative | 75 | See where feedback goes today |
| 2 | `why` | Why this option | `/walkthrough/why` | narrative | 35 | Mirror Invoca back onto itself |
| 3 | `jtbd` | Jobs to be done | `/walkthrough/jtbd` | narrative | 120 | Flip each card: who needs what |
| 4 | `states` | Today and tomorrow | `/walkthrough/states` | narrative | 115 | Find the leaks, then seal them |
| 5 | `platform` | The platform | `/walkthrough/platform` | narrative | 60 | See where Signal Loop runs |
| 6 | `ch1` | A call comes in | `/app/new` | product | 90 | Bring in today's call |
| 7 | `ch2` | Watch it think | `/app/runs/:id` | product | 135 | Find what it refused to say |
| 8 | `ch3` | Human in the loop | `/app/review` | product | 120 | Approve one, correct one |
| 9 | `ch4` | Right owner, right channel | `/app/routing`, `/app/destinations`, `/app/connections` | product | 80 | Change who hears about pricing |
| 10 | `ch5` | Patterns, not anecdotes | `/app/themes`, `/app/themes/:id` | product | 75 | See the insight join a theme |
| 11 | `ch6` | Close the loop | `/app/destinations`, `/app/loop` | product | 50 | Ship it and tell the CSM |
| 12 | `ch7` | Prove it | `/app/evals`, `/app/health` | product | 95 | Try to promote the candidate prompt |
| 13 | `ch8` | Operate it | `/ops`, `/ops/agents`, `/ops/agents/agt_signal_loop`, `/ops/usage`, `/ops/logs`, `/ops/traces/:id`, `/ops/reliability` | product | 120 | Find your own run in the logs |
| 14 | `rollout` | Earning trust: rollout | `/walkthrough/rollout` | narrative | 135 | Build it, then operate it |
| 15 | `horizon` | The next 12–18 months | `/walkthrough/horizon` | narrative | 75 | Where this goes |
| 16 | `production` | From proof of concept to production | `/walkthrough/production` | narrative | 45 | Same design, production stack |
| 17 | `scorecard` | Scorecard | `/walkthrough/scorecard` | both | 45 | What you did, what it did |

Routes come from `src/tour/script/routes.ts` (`R`) and the `route` of each step in `src/tour/script/steps.ts`. The parts are grouped as "The problem" (0–4), "The system" (5–13, the platform scene plus the eight product chapters) and "Making it real" (14–17) [source: chapters.ts → GROUPS].

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
| `/ops/*` | Agent Ops, a separate product reached from the product switcher or the Agent Ops link | — |

### The four pillars of the brief, and where each is answered

| Pillar | Parts |
|---|---|
| Jobs to be done, current and future state | 1, 3, 4 |
| The build (proof of concept) | 5–13 |
| Stakeholder management and adoption | 3, 8, 14 |
| The next 12–18 months | 15, 16 |

---

## The problem (parts 0–4)

### Part 0 · Cold open

- **Goal:** make the problem one concrete sentence before any slide of context.
- **What's on screen:** a flat waveform of a 13-minute Brightline Home Services QBR (marked as recorded in Gong) with 06:00–06:23 highlighted, and three transcript lines around it. Jeff Kim at 06:00: "CallRail's been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day." On beat 1 the headline becomes "Every call is a signal." and a card shows what Signal Loop makes of that sentence: competitor offer, who hears it, the evidence at 06:00, and "Brightline renews in 12 weeks" [source: src/narrative/scenes/ColdOpen.tsx → LINES, BECOMES].
- **What the viewer does:** press → once (2 beats) [source: steps.ts → `cold-open`, beats: 2].
- **What it proves:** the valuable signal is a small part of a long, mostly routine call, and it has a deadline attached.
- **Key numbers:**
  - Call length 13:00, highlight at 06:00 [source: ColdOpen.tsx → CALL_SEC, HIGHLIGHT].
  - The file is about 1,850 spoken words with 6 planted insights; it was written by hand [source: docs/data-review.md → "The recommended file: C-1042"]. **Simulated.**
  - Renewal: "12 weeks" on the card; the recorded run's gate reasons say "renewal in 82 days" [source: data/replays/file_c1042.json → insights[].gateReasons].
- **Why this design:** Because the panel is judging whether I understand the job, not the market, we open on one sentence from the same file the viewer will run in part 6, over a problem statement or a market-size slide. Trade-off: no industry framing up front; part 1 supplies the scale, labelled as an assumption.
- **Likely question → short answer:** "Is this a real call?" → No. Every account and call is fictional. C-1042 was written by hand to carry six specific signals and one grounding trap [source: docs/data-review.md].
- **Speaker line:** "This is a thirteen-minute QBR. Twenty seconds of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks." Then: "I built the same loop for Invoca's own customer calls, inside a platform that can run more analyses like it, and Agent Ops to operate it." [source: src/tour/script/notes.ts → NOTES['cold-open']]

### Part 1 · Where feedback gets lost

- **Goal:** show where feedback leaks today, with the scale honestly labelled.
- **What's on screen:** four sources (quarterly reviews, renewal calls, check-ins, support escalations), then three handoffs shrinking a bar from 100 to 72 to 55 to 40, each with its reason ("said once, never written down", "stays in a notes field", "Slack thread scrolls away"). Beat 2 shows the total lost and an assumption callout [source: src/narrative/scenes/BlackHole.tsx → SOURCES, STAGES].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the loss is spread across manual, optional handoffs, not one broken step.
- **Key numbers:** 100 → 72 → 55 → 40 [source: BlackHole.tsx → STAGES]. **Assumption:** illustrative, not measured; a two-week time study with two CSMs replaces it [source: BlackHole.tsx callout; docs/speaker-notes.md Part 1].
- **Why this design:** Because there is no defensible public benchmark for how much internal CSM feedback reaches an owner at Invoca, we show an illustrative funnel labelled as an assumption on screen, over quoting an outside statistic. Trade-off: the number cannot carry an ROI case on its own, which is why the rollout starts with the time study (part 14).
- **Likely question → short answer:** "Where does 40 of 100 come from?" → It is an assumption and says so. Week 0 of the rollout replaces it with a measured number. The registry's success metric uses the same assumed baseline of about 40% [source: data/platform/agents.json → agt_signal_loop.profile.successMetric].
- **Speaker line:** "'40 of 100' is an assumption, and it says so on screen. The first thing I'd do in the job is a 2-week time study with two CSMs to replace it with a real number." [source: notes.ts → NOTES['black-hole']]

### Part 2 · Why this option

- **Goal:** explain why Option 3 fits Invoca specifically.
- **What's on screen:** two flow rows. Top: customers' calls → Invoca Signal AI → signals for their business. Bottom: Invoca's own CSM calls → Signal Loop → signals for Invoca's teams (Product, VP Product, Sales, Support). Then four reasons, and one line: "And it generalises: any conversation in, the right people out. Signal Loop runs inside Switchboard, which can run other analyses the same way." [source: src/narrative/scenes/Why.tsx → ROWS, REASONS].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the idea is Invoca's own product discipline pointed inward, and it is not limited to one kind of input.
- **Key numbers:** none; four stated reasons: the data already exists; internal and additive, with people reviewing; shows value in weeks, not quarters; a path into Signal AI later [source: Why.tsx → REASONS].
- **Why this design:** Because the transcripts and notes already exist, the work is internal, and a person reviews anything high stakes, we chose the feedback loop over the other take-home options; it can show value in weeks with low risk. Trade-off: it is less visible to customers than a customer-facing agent.
- **Likely question → short answer:** "Why not buy Gong, Productboard or Enterpret?" → Each covers part of it; none owns Invoca's taxonomy, routing rules and the loop back to CSMs. `/backup/build-vs-buy` has the comparison [source: src/narrative/backup/BackupPage.tsx; docs/speaker-notes.md Q5].
- **Speaker line:** "I picked it because the data exists, it's internal and additive, a person reviews anything high stakes, and it can show value in weeks." [source: notes.ts → NOTES.why]

### Part 3 · Jobs to be done

- **Goal:** name who hires the system and for what, before any architecture.
- **What's on screen:** four persona cards: Customer Success Manager, Product Manager, VP Product, and Sales, competitive and support leads. Each shows its job in when / want / so form; opening a card reveals struggles and a success measure. Beat 1 replaces the headline with "Be the advocate, not the stenographer." [source: src/narrative/scenes/Jtbd.tsx → PERSONAS, HEADS].
- **What the viewer does:** open all four cards (click, or Tab + Enter), then → (2 beats). A counter shows "n of 4 opened".
- **What it proves:** the CSM is the supplier of the data, so the system succeeds only if it makes CSMs look good.
- **Key numbers:** CSM persona "Owns 15–20 accounts and 15+ customer calls a week" [source: Jtbd.tsx → PERSONAS[0].who]. **Assumption:** a persona description, not Invoca data.
- **Why this design:** Because the success metrics (capture rate, time to owner, evidence rate) fall out of the four jobs, we put JTBD before architecture, over leading with the pipeline. The emotional job is the headline because a CSM who gets nothing back stops feeding the system, and then nothing downstream works. Trade-off: 2:00 of a 25-minute slot before the product appears.
- **Likely question → short answer:** "Which job matters most?" → The CSM's emotional job. The PM, VP and GTM jobs only get served if CSMs keep supplying calls, so loop-closing credit (part 11) is a requirement, not a nicety.
- **Speaker line:** "The job that matters most is the emotional one: be the advocate, not the stenographer. If the system doesn't make CSMs look good, they stop feeding it." [source: notes.ts → NOTES.jtbd]

### Part 4 · Today and tomorrow

- **Goal:** current state versus future state, leak by leak.
- **What's on screen:** a five-lane swimlane (Customer, CSM, Notes and Slack, Product, Leadership). Beat 1: a leak marker at each handoff ("Never written down", "Half remembered", "Lost in a notes field", "Scrolls away in Slack", "No pattern, no revenue", plus "Customer never hears back"). Beat 2: the middle lane becomes Signal Loop and each leak becomes a check ("Recorded and transcribed", "Quoted word for word", "Checked against the call", "Routed by an editable rule", "Grouped with revenue"). Beat 3: the loop closes back to the CSM and the customer [source: src/narrative/scenes/States.tsx → LEAKS, HEADS].
- **What the viewer does:** → three times (4 beats).
- **What it proves:** each future-state feature exists to close a named leak.
- **Key numbers:** 5 handoffs, 6 things that go missing [source: States.tsx → HEADS].
- **Why this design:** Because a feature list is hard to evaluate, we drew the future state on the same lanes as the current state, so each check maps one to one onto a leak, over a separate architecture diagram. Trade-off: the swimlane simplifies who does what; real handoffs vary by team.
- **Likely question → short answer:** "Isn't this just bad discipline by CSMs?" → No. Every step is manual, optional and invisible, so it depends on memory. The fix is a system, not heroics.
- **Speaker line:** "Today it's a relay race with no baton. Five handoffs between the call and the VP, each depending on someone remembering." [source: notes.ts → NOTES.states]

---

## The system (parts 5–13)

### Part 5 · The platform

- **Goal:** place Signal Loop inside the larger product before the demo: any conversation in, the right people out.
- **What's on screen:** one diagram, built over four beats, under the headline "Signal Loop runs inside Switchboard." [source: src/narrative/scenes/Platform.tsx → HEADS, IN, DECIDE, OUT].
  - **In, any conversation:** Gong (call recordings), Zoom (meeting transcripts), Gmail (email threads), Slack (customer channels), Google Drive (notes, decks and PDFs), and "Upload any file".
  - **Decide, read it first:** what it is, what applies, whether it's safe, and a second opinion later on borderline items. Footnote: "A small, fast model on OpenRouter: 0.9 s median in the speed test".
  - **Analyse, run what applies:** Signal Loop with a "Built" badge; under "Not built yet": Follow-ups, Renewal risk, Escalations, Compliance review, Call coaching [source: src/shared/platform.ts → ANALYSES]. Footnote: "Long documents are split and read in parallel".
  - **Out, the right people:** Jira assigned to Nina Patel, Slack mentioning @jordan.reyes, a Salesforce task for Marcus Bell, email to Elena Vasquez, and a Google Drive voice-of-customer doc, each tagged the way that tool tags people. Footnote: "Connectors are simulated in this demo" [source: Platform.tsx → OUT; platform.ts → personHandle].
- **What the viewer does:** → three times (4 beats). The last beat's button reads "Open the product" [source: steps.ts → `platform`, beats: 4; src/narrative/scenes/index.ts → exitLabel].
- **What it proves:** intake, triage and delivery are shared parts any analysis can reuse; Signal Loop is the first, not the whole.
- **Key numbers:**
  - Decision model triage: p50 882 ms, p95 1,465 ms over 18 calls (9 golden files, twice each) [source: docs/reports/decision-models.md → Results].
  - 6 analyses in the catalog, 1 built [source: platform.ts → ANALYSES].
  - 12 connectors in the catalog; a new workspace starts with 7 connected: Slack, Jira, Linear, Gmail, Gong, Zoom, Google Drive [source: platform.ts → CONNECTORS, SEED_CONNECTED]. **Simulated.**
- **Why this design:** Because feedback does not only arrive on calls (email, chat, tickets, decks), and every analysis needs the same intake, triage and delivery, we built those once as a platform with one analysis on top, over a single-purpose call pipeline. Trade-off: five of six analyses are listed but not built, and the connectors are simulated; the scene and the product both say so. See ADR 12 and ADR 13.
- **Likely question → short answer:** "Is Switchboard a real product?" → It is this build's platform layer: intake, triage, connections, people and delivery are working code in the deployed Worker; the connectors behind them are simulated, and Signal Loop is the only analysis that runs [source: platform.ts header; src/app/pages/Analyses.tsx].
- **Speaker line:** "One step back before the product. Signal Loop runs inside Switchboard." [source: notes.ts → NOTES.platform]

### Part 6 · Ch1 · A call comes in

- **Goal:** bring a conversation into a new run with no retyping.
- **What's on screen:** the New conversation page, with three ways in: "From a connected source", "Upload a file" and "Paste text" [source: src/app/pages/NewCall.tsx]. "Browse conversations" opens the library picker: conversations from the workspace's connected tools, in folders such as "Calls/Week 43", each showing the tool it came from, with a preview pane. The Brightline QBR has a quiet marker while the tour runs. Mess levels are not shown in the picker; the page reveals them after the pick [source: src/app/components/FilePicker.tsx header; steps.ts → `ch1.pick`.more].
- **What the viewer does:** click Browse conversations (`ch1.intro`, waits for `picker.opened`) → select a file (`ch1.pick`, waits for `file.selected`) → Open (`ch1.open`, waits for `picker.closed`) → Process conversation (`ch1.run`, waits for `run.started`) [source: steps.ts].
- **What it proves:** the only manual step is choosing the file, and in production it goes away.
- **Key numbers:**
  - 48 featured files in the picker: 8 per mess level 1–5, plus 8 edge cases [source: docs/data-review.md; docs/PLAN.md §5; data/library.json → featured]. **Simulated.**
  - Upload accepts PDF, DOCX, PPTX, XLSX, ODT, HTML, RTF, JSON and CSV exports, VTT and SRT transcripts, email (.eml, .msg), chat exports and text. Files are converted to text in the browser and only the text is sent [source: src/app/lib/convert/index.ts → ACCEPT, header].
  - Limits: 25 MB per file, at least 40 characters of text, and only the first 200,000 characters are processed [source: src/app/lib/convert/types.ts → MAX_FILE_BYTES, MIN_TEXT_CHARS, MAX_TEXT_CHARS].
  - Refused with a reason: audio and video ("Audio and video need a transcript"), images, PDFs with no text layer, older Office files (.doc, .ppt, .xls) and Apple iWork files [source: convert/index.ts → mediaError, unsupported].
  - Checkpoint: "0 fields typed by the CSM" [source: steps.ts → `ch1.run`.checkpoint].
- **Why this design:**
  - Because the CS team's recorder and CRM are not known yet, we use a library from simulated connectors plus any-file upload in the POC, and plan dlt ingestion and direct connectors from whichever recorder and CRM the team uses (Gong, Zoom, Salesforce and Zendesk are examples), over building one integration speculatively. Trade-off: the demo has one click a real CSM would not [source: steps.ts → `ch1.intro`.more; src/narrative/scenes/Production.tsx → ROWS].
  - Because a binary file does not need to reach the server, conversion runs in the browser and only extracted text is sent, then redacted before any model call, over a server-side converter. Trade-off: scanned PDFs need OCR first, and audio needs a transcript [source: convert/index.ts header].
  - Because a labelled "hard" file would make the choice feel staged, mess levels are hidden until after the pick, over a menu of labelled scenarios. Trade-off: a viewer may not know which branch they chose until the callout names it [source: docs/PLAN.md §5].
  - Because a restarted tour should run live again, the walkthrough always sends `rerun: true`; the same bytes otherwise return the earlier run (SHA-256 idempotency) [source: docs/ARCHITECTURE.md → Duplicates].
- **Likely question → short answer:** "What happens if I upload the same file twice?" → It is deduplicated by SHA-256 and you are offered "Open your earlier run" or "Run again live" [source: docs/ARCHITECTURE.md; NewCall.tsx]. "Can I run something from a tool that isn't connected?" → No: the run is refused with "isn't connected. Connect it first, or upload the file." [source: src/worker/runs.ts → source_not_connected].
- **Speaker line:** "This is the only manual step, and in production it goes away: dlt pulls from whichever recorder and CRM the CS team uses." [source: notes.ts → NOTES.ch1]

### Part 7 · Ch2 · Watch it think

- **Goal:** watch the real pipeline and see what it refuses to say.
- **What's on screen:** the conversation page. A 10-step stepper labelled Ingest, Read, Remove PII, Triage, Extract, Check quotes, Score, Theme, Route, Deliver (step keys `ingest`, `normalize`, `redact`, `screen`, `extract`, `ground`, `score`, `theme`, `route`, `deliver`) [source: src/app/pages/run/stepText.ts → STEP_NAME]. Also the transcript, a Triage card (what it is, its language, which analyses apply, any injection flag), insight cards, the gate result and a trace panel with model role, tokens, cost and milliseconds per step [source: src/app/pages/run/RunParts.tsx; src/tour/anchors.ts].
- **What the viewer does:** → as each step completes: `ch2.intro` → `ch2.redact` → (`ch2.privacy` on the privacy branch) → `ch2.screen` (Triage, on every branch) → `ch2.extract` → `ch2.ground` → (`ch2.rejected` only if offered) → (`ch2.messy` on the messy branch) → `ch2.gate` → `ch2.trace` → (`ch2.clean` on the clean branch). With no insights (the negative branch), extract goes straight to `ch2.trace` [source: steps.ts].
- **What it proves:** what is on screen is the real execution, drawn from saved step rows; a quote that is not in the transcript cannot become an insight.
- **Key numbers (recorded Brightline run, used when live AI is off):**
  - 6 insights, 14 of 14 quotes grounded by exact match, 0 dropped [source: data/replays/file_c1042.json → insights[].evidence[].method].
  - 19 values redacted [source: file_c1042.json → redactions].
  - 3 auto-route, 3 to review [source: file_c1042.json → insights[].gate].
  - 4,238 ms end to end; triage 357 ms, extract 2,859 ms, theme 1,014 ms [source: file_c1042.json → totalMs, steps[].durationMs].
  - $0.001401 of AI [source: file_c1042.json → run.costUsd].
  - All 48 recorded runs predate the decision model: their triage step ran on the main model, and no second opinion ran [source: data/replays/*.json → steps[key=screen].model, no secondOpinion field].
  - Grounding pass mark 0.90 [source: src/shared/contracts.ts → THRESHOLDS.grounding].
  - On the promoted prompt, 275 of 275 eval quotes grounded [source: data/evals/latest.json → promoted.metrics grounding_rate].
  - Live runs show the viewer's own numbers instead. **Live.**
- **Key numbers (decision model and long inputs):**
  - Triage on the decision model: p50 882 ms, p95 1,465 ms, $0.000141 per call. The old screen (main model) measured p50 470 ms, $0.000616 per call [source: docs/reports/decision-models.md → Results].
  - Second opinion: one batched call per run, 964–1,483 ms on three test files [source: decision-models.md → Second opinion]. It may move a borderline review item to auto-route at agreement ≥ 0.85, and an auto-route item to review at disagreement ≥ 0.6 [source: src/pipeline/score.ts → SECOND_OPINION_PROMOTE_AT, SECOND_OPINION_DEMOTE_AT].
  - On a live C-1042 run the theme step went from 1,187 ms to 2 ms once its embeddings started alongside the second opinion [source: decision-models.md → What this means for speed].
  - Inputs over 24,000 characters are extracted in windows of about 16,000 characters with 2,000 of overlap, up to 8 at once; triage reads at most 40,000 characters, from the beginning and the end [source: src/shared/scoring.ts → EXTRACT_CHUNKING, TRIAGE_MAX_CHARS].
- **Why this design:**
  - Because the model cannot be trusted to police itself, grounding is code (normalize, exact substring, then a sliding Levenshtein window at 0.90 or better), over asking the model to verify its own quotes. Trade-off: grounding proves the words were said, not that they are feedback; v5 in part 12 shows that limit [source: copy.ts → groundCopy.more; ADR 2].
  - Because a cheap first read can say what the input is, which analyses apply and whether anyone is steering the AI, a fast decision model triages every input; extraction starts alongside it on the same redacted input and is discarded if triage says nothing is actionable, over a single extraction call. Trade-off: the discarded extraction's cost is still spent [source: docs/ARCHITECTURE.md → Models: three tiers, Latency work; steps.ts → `ch2.screen`.more]. See ADR 12.
  - Because correct items in the 0.55–0.80 band still wait for a person, an independent model checks each kept insight against its own grounded quotes, and code decides what may move, over letting a model set the gate. Forced reviews and held items never move; a failed call changes nothing [source: score.ts → applySecondOpinion; docs/ARCHITECTURE.md → Second opinion]. Trade-off: one more model call per run, and its effect is not in the eval yet.
  - Because one call over a long document is slow, long inputs are extracted in overlapping windows in parallel and merged, with grounding still against the whole document, over one call. Trade-off: any failed window fails the step [source: docs/ARCHITECTURE.md → Long inputs].
  - Because watching rows is the only honest way to show a pipeline, the UI animates from `run_steps` rows and labels a replay as a replay, over a scripted animation [source: copy.ts → introCopy; docs/PLAN.md §6].
- **Likely question → short answer:** "Did grounding ever catch anything?" → Not on the promoted prompt: 275 of 275 [source: latest.json]. It is a seatbelt. The candidate v5 had 3 of 505 quotes fail (502 grounded) [source: latest.json → candidate grounding_rate]. "See a rejected quote" appears only if a real run with a dropped quote exists in the database; do not promise it otherwise [source: steps.ts → `ch2.ground`.notes]. "Did the second opinion change anything?" → Read the gate callout: on a live run it says how many items the second model moved, or that it agreed; on a replay it says nothing, because the recordings predate it [source: copy.ts → gateCopy].
- **Speaker line:** "Grounding is the moment. … fourteen of fourteen, word for word, on the recorded Brightline run. If the model had stitched Dana's interrupted sentence into one tidy quote, code wouldn't find it and the insight would be dropped." [source: notes.ts → NOTES.ch2]

### Part 8 · Ch3 · Human in the loop

- **Goal:** a person decides on anything uncertain or high stakes.
- **What's on screen:** the review queue; every item has a reason badge such as "Score 0.71, below 0.80" or "Churn risk is always reviewed", and a second-opinion reason when that check moved it ("Second opinion disagreed: …") [source: steps.ts → `ch3.why`; score.ts → applySecondOpinion].
- **What the viewer does:** press A (or click Approve and send) on one item (`ch3.approve`, waits for `review.action` approve); press E on another, change the type, area, severity or summary, then Save and send (`ch3.edit`, waits for edit or reject). Save stays disabled until a field changes ("Change a field to save"). R rejects. Then Next or "Try another file" (`ch3.fork`) [source: steps.ts; copy.ts → editCopy; src/app/pages/Review.tsx].
- **What it proves:** nothing on a parked run routes until someone acts, each correction becomes labelled data, and each decision carries a name.
- **Key numbers:**
  - Gate: 0.80 and above auto-routes, 0.55–0.80 goes to review, below 0.55 is held but visible [source: src/shared/contracts.ts → THRESHOLDS; src/pipeline/score.ts header].
  - Always reviewed: churn risk, high or critical bugs, every insight in a file where injection was suspected, and every insight when triage was unavailable [source: score.ts → scoreInsight; src/pipeline/run.ts → screenUnavailable].
  - On the v4 eval: 76 of 141 insights went to review (54%) and 65 auto-routed; 5 of those 65 were false positives (7.7%) [source: data/evals/details-v4.json → predicted[].gate, matched]. These predate the second opinion.
  - 45 of 48 eval runs ended with something to review [source: details-v4.json → status].
  - Reviews record the acting user by name ("approved by Elena Vasquez" in a new workspace) [source: src/worker/review.ts; src/worker/api/index.ts → applyReview(…, actor.name); platform.ts → DEFAULT_ACTOR_ID].
  - Checkpoint: "decisions made by a person" [source: steps.ts → `ch3.fork`.checkpoint]. **Live.**
- **Why this design:**
  - Because a wrong churn flag in front of a PM costs the CSM trust, high-stakes types always go to a person regardless of confidence, over one global threshold. Trade-off: 54% of v4 insights need a person, so review load is the real constraint [source: details-v4.json].
  - Because review can take hours, review is a state change on a parked run (`awaiting_review`), over a suspended workflow waiting for an event; the approve action routes the insight and writes an audit row [source: docs/PLAN.md §6 "As built"; src/worker/review.ts].
  - Because the next prompt should learn from corrections, edits follow the `operator_actions` pattern (idempotency key, before, after, reviewer, reason) and become eval cases [source: steps.ts → `ch3.edit`.more].
  - Because an audit row needs a person, not "reviewer", every review records the acting user, who defaults to Elena Vasquez (VP, Product, the agent's business owner) and can be switched with "Act as someone else" in the user menu, over an anonymous viewer. Trade-off: the acting user is a workspace preference, not a sign-in [source: platform.ts → Actor, DEFAULT_ACTOR_ID; docs/ARCHITECTURE.md → Acting user; src/app/AppShell.tsx].
- **Likely question → short answer:** "Haven't you just moved data entry into a review queue?" → Partly, by design for now. A review is approve-or-edit on a pre-filled, quoted item. The second opinion can send a borderline item straight to its owner when it agrees. Thresholds get tuned against champion labels in weeks 3–6 [source: src/narrative/scenes/Rollout.tsx → PHASES; docs/speaker-notes.md Q18].
- **Speaker line:** "The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it's here." [source: notes.ts → NOTES.ch3]

### Part 9 · Ch4 · Right owner, right channel

- **Goal:** show that routing is data that ops can change, and that a missing tool never loses an insight.
- **What's on screen:** the routing rules table and the "Where insights go" flow chart (type → product area → owner, with a "By owner" view). Then the Deliveries page, with Issues, Chat, CRM, Email and Docs tabs covering Jira and Linear, Slack and Teams, Salesforce, direct email and the weekly digest, and Google Drive, each preview with a receipt. Then the Connections page [source: steps.ts → `ch4.*`; src/app/pages/Routing.tsx; src/app/pages/Destinations.tsx → tabs; src/app/components/destinations/Previews.tsx].
- **What the viewer does:** edit the pricing-objection rule so objections on accounts over $250k ARR go to the VP of Product (`ch4.rule`, waits for `rule.changed`, or is already satisfied if the workspace has that override); watch the flows re-route (`ch4.sankey`); view the Jira ticket (`ch4.jira`) and the Slack message (`ch4.slack`); then the Connections page (`ch4.connections`): "Any tool is a connection. Disconnect one and its rules route to triage instead." [source: steps.ts; notes.ts → NOTES.ch4].
- **What it proves:** the model classifies; a table decides who hears it, with no prompt change and no redeploy; a disconnected tool or a removed owner sends matches to triage with the reason.
- **Key numbers:**
  - Rules match type × product area × severity × ARR band → owner and channel; lowest priority wins; no match goes to triage [source: steps.ts → `ch4.intro`.more; src/pipeline/route.ts].
  - 14 seed routing rules [source: data/world/routing.json; docs/data-review.md].
  - Routing accuracy on the v4 eval: 94.4% (118 of 125) [source: latest.json → promoted routing_accuracy].
  - Each delivery tags the owner, the account's CSM and, for churn risk or pricing objections on accounts over $250k ARR, the VP of Customer Success, by their handle in that tool [source: src/pipeline/deliver.ts → deliveryMentions, WATCHER_ARR_USD].
  - 21 people in the seed directory, with per-tool handles on the People page [source: data/world/people.json; src/app/pages/People.tsx]. **Simulated.**
  - 12 connectors, 7 connected in a new workspace [source: platform.ts → CONNECTORS, SEED_CONNECTED]. **Simulated.**
  - Checkpoint: "routing rules changed · 0 prompts edited", on `ch4.connections` [source: steps.ts → `ch4.connections`.checkpoint]. **Live.**
- **Why this design:** Because routing must be predictable, auditable and changeable by ops without a deploy, routing is an editable rules table, over letting the prompt choose an owner. Trade-off: new routing needs need a rule, and a missing rule sends items to triage rather than guessing. See ADR 1. Connections are simulated but routing reads their state; see ADR 13.
- **Likely question → short answer:** "Does my rule change affect other viewers?" → No. Each viewer has their own workspace; rule, connection and people edits apply only there [source: copy.ts → sankeyCopy; BackupPage.tsx → Isolation; docs/ARCHITECTURE.md → Switchboard]. "Are the Slack, Jira and Salesforce connections real?" → No, and the product says so. Connecting one records a workspace connection with a simulated account; deliveries render as in-app previews with receipts. In production they'd be the real APIs, switched on one destination at a time [source: docs/speaker-notes.md Q19].
- **Speaker line:** "Routing is a table, not a prompt. Ops can read it, change it and audit it." [source: notes.ts → NOTES.ch4]

### Part 10 · Ch5 · Patterns, not anecdotes

- **Goal:** turn one complaint into a pattern with ARR attached.
- **What's on screen:** the themes list with the Google Ads offline-conversions theme highlighted, then its page: ARR at stake, an eight-week trend whose bars link to their insights, and representative quotes that link back to the conversation they came from [source: steps.ts → `ch5.*`; copy.ts → isSpotlitTheme; src/app/pages/ThemeDetail.tsx].
- **What the viewer does:** open the highlighted theme (`ch5.intro`, waits for `theme.opened`), then → through ARR, trend and quotes.
- **What it proves:** the PM and VP get cross-account evidence, not a forwarded anecdote.
- **Key numbers:**
  - Join threshold: cosine similarity 0.82 [source: src/shared/scoring.ts → THEME_JOIN_THRESHOLD].
  - The spotlit theme was seeded with 32 insights from 7 accounts, $1.40M ARR [source: docs/data-review.md → Backfill and themes]. **Simulated.** The callout reads live counts; say what it says.
  - ARR is counted once per account [source: copy.ts → themeCopy].
- **Why this design:** Because theme membership has to be reproducible and auditable, membership is decided by embeddings and a similarity threshold in code and the model only names the theme, over asking the model to cluster. Trade-off: the threshold needs tuning, and theme quality has no eval yet (see Honest gaps). See ADR 11.
- **Likely question → short answer:** "Is ARR at stake a churn forecast?" → No. It is the ARR of accounts that raised the issue, counted once each.
- **Speaker line:** "One complaint is an anecdote. Membership is deterministic: embeddings and a similarity threshold. The model only names it." [source: notes.ts → NOTES.ch5]

### Part 11 · Ch6 · Close the loop

- **Goal:** the CSM hears back when their feedback ships.
- **What's on screen:** a Jira-style ticket with a state control on the Deliveries page, then the Close the loop page with a "shipped" notice and a drafted note for the customer [source: steps.ts → `ch6.*`].
- **What the viewer does:** play the PM: move the ticket to Shipped (`ch6.ship`, waits for `ticket.state` shipped), then → through the inbox and the note.
- **What it proves:** the CSM's emotional job from part 3 is served: credit, without status-chasing.
- **Key numbers:** checkpoint "1 loop closed back to the CSM · 0 status-chasing emails" [source: steps.ts → `ch6.note`.checkpoint].
- **Why this design:** Because the customer relationship belongs to the CSM, the customer note is drafted, not sent, over sending it automatically. Trade-off: one more action for the CSM, in exchange for keeping their voice and judgement [source: steps.ts → `ch6.note`].
- **Likely question → short answer:** "Are Jira and Slack real?" → Not in the POC. Connectors are simulated: deliveries are in-app previews with real receipts and retries, and nothing leaves the Worker. Real APIs behind a flag are a next step [source: platform.ts header; data/platform/agents.json → dataAccess "mock destinations in the demo"; docs/speaker-notes.md Q19, Q20].
- **Speaker line:** "The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs." [source: notes.ts → NOTES.ch6]

### Part 12 · Ch7 · Prove it

- **Goal:** show quality is measured, and that the gate blocks a bad prompt.
- **What's on screen:** the Quality page (precision and recall per type and per mess level, safety and routing, the candidate prompt, the "Go-live check" with its Promote button, and the result), then the budget gauge on Usage and health [source: steps.ts → `ch7.*`; src/app/pages/Evals.tsx; src/app/pages/evals/PromotionGate.tsx].
- **What the viewer does:** → through metrics and levels; click Promote on the candidate (`ch7.promote`, waits for `eval.promote_attempted`); read the block; → to Usage and health.
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
  - Blocked reasons, as the gate lists them: precision under the 85% threshold, and a −28.9 point precision regression against a −2.0 point limit [source: latest.json → candidate.blockedReasons].
  - Over-labelling: 38 extra praise items (51 predicted, 13 correct) and 20 extra churn risks (31 predicted, 11 correct) [source: latest.json → precision.praise, precision.churn_risk; details-v5.json].
  - Cost $0.113 and p95 6.3 s for the eval set, both worse than v4; shown, not gated [source: latest.json → candidate.costUsd, p95Ms; copy.ts → promoteCopy].
  - Budget: a hard $15 cap on live AI for viewers [source: wrangler.jsonc → vars.BUDGET_LIMIT_USD]. **Live** gauge.
- **Why this design:** Because a prompt can look better on one metric and quietly worse on another, promotion needs every gate check to pass (overall precision ≥ 85%, recall ≥ 80%, level-5 recall ≥ 70%, grounding ≥ 95%, zero negative false positives, every injection flagged, zero PHI leaks, zero run failures, and no regression over 2 points on precision, recall or level-5 recall), over a reviewer's judgement call [source: src/shared/scoring.ts → PROMOTION_GATE; docs/RUNBOOK.md → Prompt promotion]. Trade-off: per-type slices, cost and latency are reported, not gated yet. See ADR 6.
- **Likely question → short answer:** "Did you build v5 to fail?" → Yes, deliberately: it is the cost-cutting rewrite people really make. Every quote was real, which is exactly why grounding alone isn't enough [source: notes.ts → NOTES.ch7].
- **Speaker line:** "Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback." [source: notes.ts → NOTES.ch7]

### Part 13 · Ch8 · Operate it

- **Goal:** building the agent is half the job; show the platform that operates it.
- **What's on screen:** Agent Ops: the executive overview (hours returned, value of that time against metered AI spend, adoption), the registry, Signal Loop's agent page with the nine-check standard, the live usage panel, logs filtered to the viewer's run, the trace waterfall, and SLOs with alerts [source: steps.ts → `ch8.*`].
- **What the viewer does:** click the Agent Ops link (on phones, Menu then Agent Ops) (`ch8.enter`, waits for a path under `/ops`), then → through `ch8.kpis`, `ch8.registry`, `ch8.review`, `ch8.usage`, `ch8.logs`, `ch8.trace`, `ch8.slos`.
- **What it proves:** the viewer's own run is in the logs under one trace id, and the agent is owned past launch.
- **Key numbers:**
  - Two agents registered: Signal Loop (real) and an RFP & Security Questionnaire Responder (Gumloop-built, **Simulated**) [source: data/platform/agents.json → note].
  - Signal Loop passes 9 of 9 standard checks; the RFP agent fails the evals check [source: agents.json → agents[].record.standard]. The security review and business-owner sign-off are illustrative records [source: agents.json → standard owner, data_review evidence].
  - Review cadence 30 days; last review 2026-10-12; next 2026-11-11 [source: agents.json → agt_signal_loop.record].
  - Hours returned = Σ(registered baseline minutes per unit − measured human review minutes) [source: steps.ts → `ch8.kpis`.more]. Baseline 18 minutes per call [source: agents.json → baselineMinutesPerUnit; src/shared/scoring.ts → MINUTES_SAVED_PER_CALL]. **Assumption** until the time study. Loaded rate $85 an hour [source: src/worker/platform/math.ts → DEFAULT_LOADED_HOURLY_USD].
  - History: 218 real pipeline runs over synthetic calls, with simulated users, from 2026-09-14 to 2026-10-24 [source: data/backfill/runs.json; agents.json → window]. **Simulated** users. This session's telemetry is **Live**.
  - SLO targets: run success 99%, grounding 95%, delivery 99.5%, cost per unit $0.02, p95 900 ms [source: agents.json → agt_signal_loop.profile.slo].
- **Why this design:** Because the role is as much about operating agents as building them, Signal Loop reports logs, spans, usage and work units into a shared platform through one SDK, over a dashboard inside the agent. Every agent is held to the same nine checks, mine included. Trade-off: with one real agent, the multi-agent story is a design, not a track record. See ADR 9.
- **Likely question → short answer:** "Is the adoption panel real?" → The runs are real executions; the users in the history are simulated. Only this session is live. The instrumentation is what is real: on day one with real CSMs, the same panel is true [source: copy.ts → opsLiveCopy; steps.ts → `ch8.enter`.more].
- **Speaker line:** "Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops." [source: notes.ts → NOTES.ch8]

---

## Making it real (parts 14–17)

### Part 14 · Earning trust: rollout

- **Goal:** how adoption is earned and measured.
- **What's on screen:** beat 0, a phased timeline: Week 0 discovery, Weeks 1–2 shadow mode, Weeks 3–6 champions, Week 7+ whole team, plus trust mechanics. Beat 1, hours given back and what is measured weekly and reported to executives. Beat 2, the operating loop (build, launch, measure, review, improve) and four cards: review cadence, the agent standard, maintenance, helping other builders [source: src/narrative/scenes/Rollout.tsx → PHASES, TRUST, OPERATE].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the rollout is additive (it takes the data entry, not the judgement), and the platform keeps it owned after launch.
- **Key numbers:**
  - 1.75 hours given back to each CSM a week; 2,730 hours a year across 30 CSMs [source: Rollout.tsx → Stat values]. **Assumption:** 10 minutes of admin per call, 15 calls a week, 70% removed; the time study replaces it [source: Rollout.tsx callout].
  - Champions: two or three volunteer CSMs and one PM [source: Rollout.tsx → PHASES].
  - Weekly measures: capture rate, time to owner, accuracy, evidence rate, active reviewers [source: Rollout.tsx → MEASURE].
- **Why this design:** Because CSMs will not feed a system they don't trust, the rollout runs shadow mode first (nothing sent), then champions with a weekly calibration, then the team, over a big-bang launch. Adoption is measured from usage events, not surveys. Trade-off: no automatic routing until about week 7.
- **Likely question → short answer:** "What would make you shut it off?" → Kill and rework criteria are signed by the business owner [source: docs/RUNBOOK.md → Owners]. Proposed, not configured: auto-route precision under the 85% bar for two weeks, weekly active reviewers falling for a month, or net hours (after review time) below cost.
- **Speaker line:** "Build it, then operate it. Discovery and the time study first, then shadow mode, then champions, then the team." [source: notes.ts → NOTES.rollout]

### Part 15 · The next 12–18 months

- **Goal:** where this goes, and what doesn't change.
- **What's on screen:** six milestones: Months 0–3 earn trust first; 3–6 every call, by default; 6–9 capture during the call; 9–12 more analyses, one platform (follow-ups, renewal risk and escalations reuse the same intake, decision model and delivery, each with its own tests and owner); 12–15 specialist agents; 15–18 part of Invoca's platform (compliance review and call coaching join, and Switchboard plugs into Signal AI). Beat 1: "No quote, no insight. Code checks the model. People make the high-stakes calls." [source: src/narrative/scenes/Horizon.tsx → MILES].
- **What the viewer does:** → once (2 beats).
- **What it proves:** the ingredients get cheaper and faster and more analyses run on the same platform; the trust mechanisms stay.
- **Key numbers:** the "every call" card reads the measured average AI cost per live run at run time. **Live.** Recorded runs average $0.00141 per call (48 runs) and the backfill $0.00133 (218 runs) [source: computed from data/replays/*.json → run.costUsd and data/backfill/runs.json → costUsd].
- **Why this design:** Because "every call by default" before shadow mode and champions would contradict the rollout, the horizon starts after months 0–3, over a timeline that promises full coverage in the first quarter. Trade-off: slower to full coverage.
- **Likely question → short answer:** "Why would this move into Signal AI?" → The long-term engine should be Invoca's own conversation platform; the workflow, gates and routing layer still have to exist above it. "Which analysis comes next?" → Follow-ups, renewal risk and escalations in months 9–12, on the same intake, decision model and delivery [source: Horizon.tsx → MILES].
- **Speaker line:** "What doesn't change: grounding in code, gates, routing as data, human judgement." [source: notes.ts → NOTES.horizon]

### Part 16 · From proof of concept to production

- **Goal:** the same design on a production stack.
- **What's on screen:** a table of ten jobs, POC column first, production column filling in on beat 1: website and API (Cloudflare Worker and a React app → Vercel with Next.js); AI model calls (Vercel AI SDK through a shared router → Vercel AI SDK with our own provider keys); deciding what to run (a fast decision model via OpenRouter → the same, on our own key); long-running jobs (Cloudflare Workflows → Trigger.dev); database (Cloudflare D1 → Neon Postgres); finding similar feedback (Cloudflare Vectorize → pgvector on Neon); reporting at scale (daily summaries in D1 → ClickHouse with dbt models); bringing in conversations (any file, plus connectors, simulated here → dlt from Gong, Zoom, Salesforce and Zendesk, plus direct connectors); sending results (in-app previews with receipts, simulated → the Slack, Jira and Salesforce APIs); live transcription (not needed yet → Render, streaming speech to text). Constants: strict TypeScript everywhere, one set of data contracts end to end, each provider bills directly with keys on the server [source: src/narrative/scenes/Production.tsx → ROWS, CONSTANTS].
- **What the viewer does:** → once (2 beats).
- **What it proves:** the prompts, quote checks and tests move unchanged; only hosting and the connectors change.
- **Key numbers:** none.
- **Why this design:** see ADR 10.
- **Likely question → short answer:** "Isn't that a rewrite?" → A port of adapters, not logic. The 10-step pipeline core (`src/pipeline/run.ts`) is runtime-agnostic and the contracts are shared Zod and TypeScript; the eval suite proves parity.
- **Speaker line:** "The POC runs entirely on Cloudflare. The production design keeps the same boundaries." Then: "The decision model stays the same model on our own key." [source: notes.ts → NOTES.production]

### Part 17 · Scorecard

- **Goal:** recap what the viewer did and what the system did, then unlock everything.
- **What's on screen:** "You" tiles (calls run, decisions made, routing rules changed, tickets shipped, scenarios explored of 6) and "The system" tiles (insights extracted, quotes grounded or dropped, injections caught or values redacted, insights routed, AI spend), plus an Agent Ops line counting the viewer's log lines and timed steps. If the viewer ran nothing, it says so and offers "Start chapter 1" [source: src/narrative/scenes/Scorecard.tsx].
- **What the viewer does:** Explore freely, Open Agent Ops, Read the write-up, or Replay the walkthrough.
- **What it proves:** every number is counted from the viewer's workspace and session.
- **Key numbers:** all **Live**.
- **Why this design:** Because a zero the viewer did not cause reads as a failure, a zero system counter is swapped for a fact about their own run or left out, over a fixed tile grid [source: Scorecard.tsx comments]. Trade-off: different viewers see different tiles.
- **Likely question → short answer:** "Is any of this scripted?" → No. It reads the workspace and Agent Ops at render time.
- **Speaker line:** "Every number here is counted from your workspace and this session. Nothing on this page is scripted." [source: notes.ts → NOTES.scorecard]

---

## Branches

The file picked in part 6 changes chapters 2–3; all paths rejoin at chapter 4. The tour counts "Scenarios explored: n of 6" [source: docs/PLAN.md → Branches; steps.ts → `ch3.fork`]. Entry files come from `data/tour-files.json`. Numbers below are from each file's recorded run in `data/replays/<file>.json` (what the viewer sees when live AI is off); a live run may differ. The recordings predate the decision model, so their triage came from the main model and they carry no second opinion. All files are **Simulated**.

### Branch: main (Brightline QBR)

- **Goal:** the full story on a level-3 natural transcript.
- **What's on screen:** the standard ch2 sequence, with Triage as its own beat ("Read first, by a fast model") [source: copy.ts → screenCopy].
- **What the viewer does:** pick the highlighted `2026-10-21_Brightline_QBR_transcript.vtt` (`file_c1042`).
- **What it proves:** six real signals survive tangents and small talk, and an interruption is a grounding trap.
- **Key numbers:** 6 insights; 14/14 quotes exact; 3 auto-route, 3 review (two high or critical bugs and the churn risk); $0.001401; 4,238 ms [source: data/replays/file_c1042.json].
- **Why this design:** Because a tidy file would not test grounding, C-1042 has Dana's sentence interrupted by Jeff, so a model that stitches turns into one quote produces text that does not exist [source: docs/data-review.md → Where grounding matters]. Trade-off: hand-written, so it shows the trap exists, not how often real models fall in it.
- **Likely question → short answer:** "Why was the churn line reviewed at 0.94?" → Churn risk is always reviewed, whatever the confidence, and the second opinion cannot move a forced review [source: file_c1042.json → gateReasons; score.ts → applySecondOpinion].
- **Speaker line:** "Brightline is the main path; any file works and each one tells a different story." [source: notes.ts → NOTES.ch1]

### Branch: clean (Harbor FCU notes)

- **Goal:** a baseline on tidy CSM notes.
- **What's on screen:** a fast run, then `ch2.clean`: "Easy. Real calls aren't like this." with "Try a messy one" or Next [source: steps.ts → `ch2.clean`].
- **What the viewer does:** pick `file_harbor_checkin_notes`.
- **What it proves:** the easy case is easy; the interesting cases are the others.
- **Key numbers:** 3 insights; 3/3 quotes exact; 2 auto-route, 1 review; $0.000949; 1,931 ms [source: data/replays/file_harbor_checkin_notes.json].
- **Why this design:** Because a viewer who picks the easiest file should still learn something, the branch offers a messy one rather than ending, over silently continuing.
- **Likely question → short answer:** "Is level 1 in the evals?" → Yes: level-1 recall 100% (21/21) on v4 [source: latest.json → recall.level1].
- **Speaker line:** "Clean notes are the baseline. Offer the messy one if there's time." [source: notes.ts → STEP_NOTES['ch2.clean']]

### Branch: messy (SunPeak raw speech-to-text)

- **Goal:** stay honest under noise.
- **What's on screen:** `ch2.messy`: "Honest under noise" with the run's average confidence and review count [source: steps.ts; copy.ts → messyCopy].
- **What the viewer does:** pick `file_sunpeak_checkin_asr` (raw ASR: "google adds", "call rail", speaker bleed, sarcasm) [source: docs/data-review.md → Branch entry files].
- **What it proves:** the model quotes the garbled text verbatim, so quotes ground exactly.
- **Key numbers:** 3 insights; 7/7 quotes exact; average final confidence 0.92; 2 of 3 to review, both because high bugs are always reviewed [source: data/replays/file_sunpeak_checkin_asr.json → insights[].confidenceFinal, gateReasons]. v4 level-4 recall 100% (20/20), level-5 recall 90% (18/20) [source: latest.json].
- **Why this design:** Because golden quotes for levels 4–5 are the corrupted spans, grounding is checked against what was actually transcribed, over a cleaned-up version of the text [source: docs/data-review.md → Known limitations]. Trade-off: a model that "repairs" text when quoting needs the fuzzy path.
- **Likely question → short answer:** "Does noise lower confidence?" → That is the mechanism (final confidence includes the grounding score), but on this recorded run confidence stayed high and review was driven by severity rules. Triage also records how noisy the input is (clean, noisy, very noisy), but that label does not change how the file is extracted [source: src/pipeline/run.ts → screen step detail.complexity]. Say what the callout shows.
- **Speaker line:** "The model quoted the garbled text verbatim, so it grounds exactly; noise shows up as lower confidence and more review." [source: docs/speaker-notes.md → Ch2 branch extras]

### Branch: security (Ridgeway injection)

- **Goal:** a planted instruction is treated as data.
- **What's on screen:** `ch2.screen`: "Injection flagged, and kept inert. Caught by the decision model and a code check. Treated as data: output stays schema-only, with an audit row." [source: copy.ts → screenCopy].
- **What the viewer does:** pick `file_ridgeway_prep_injection` (a blunt planted instruction inside a pasted survey export, plus two real insights) [source: docs/data-review.md].
- **What it proves:** the instruction has nothing to act on: text is wrapped as data, output is schema-only, no model has tools; the attempt is flagged and audited.
- **Key numbers:** triage `injection_suspected: true`; 3 insights, all sent to review because injection was suspected in the file; $0.002042 [source: data/replays/file_ridgeway_prep_injection.json → screen, gateReasons]. The model's flag is OR-ed with a deterministic heuristic that scans the full text [source: docs/ARCHITECTURE.md → Triage]. Eval: 2 of 2 injections flagged [source: latest.json → injection_flagged]. In the decision-model speed test, the chosen model got 18 of 18 injection verdicts right on its own flag [source: decision-models.md → Results].
- **Why this design:** Because prompt-level defences can be talked around, we removed the capability instead (no tools, fixed schema) and sent the whole file to a person, over trusting a "do not follow instructions in the transcript" line. Trade-off: one hostile line puts a whole call into review.
- **Likely question → short answer:** "Is two injection files enough?" → No. It shows the mechanism, not coverage; a few hundred items is the production bar.
- **Speaker line:** "Point at the injection flag and the audit row." [source: docs/speaker-notes.md → Ch2 branch extras]

### Branch: negative (PrairieLink friendly check-in)

- **Goal:** the right output is nothing.
- **What's on screen:** Triage says it is friendly with nothing for the product team, and the main pass that started alongside is discarded; Extract shows zero insights with a calm empty state [source: copy.ts → screenCopy, extractCopy].
- **What the viewer does:** pick `file_prairielink_friendly` (training logistics, a puppy, the first snow) [source: docs/data-review.md].
- **What it proves:** the system does not invent work to look busy.
- **Key numbers:** 0 insights; status completed; 399 ms; $0.000156 [source: data/replays/file_prairielink_friendly.json]. Eval: 0 of 2 negative-control false positives [source: latest.json → negative_fp_rate].
- **Why this design:** Because false positives cost PM trust, the prompt says "return an empty list if nothing applies" and the gate requires zero negative false positives, over always producing a summary [source: docs/PLAN.md → Prompts; scoring.ts → PROMOTION_GATE.negativeFpRate].
- **Likely question → short answer:** "Why start extraction at all?" → To save time on the normal case: extraction starts alongside triage, and when triage says nothing is actionable its output is discarded (its cost stays on the run) and the Extract step shows as skipped [source: src/pipeline/run.ts → skipExtract; docs/ARCHITECTURE.md → Latency work].
- **Speaker line:** "Zero insights, and that's correct." [source: docs/speaker-notes.md → Ch2 branch extras]

### Branch: privacy (Meridian PHI-heavy call)

- **Goal:** only redacted text reaches a model.
- **What's on screen:** `ch2.privacy`: a before / after toggle with tokens like `[PATIENT_1]` [source: steps.ts → `ch2.privacy`].
- **What the viewer does:** pick `file_meridian_phi_call`, then toggle before / after (waits for `redaction.toggled`).
- **What it proves:** tokens keep the meaning and drop the identity; the original never leaves the Worker and the browser sees only a masked preview.
- **Key numbers:** 22 values redacted across address, DOB, MRN, patient, person and phone; 3 insights; $0.000802 [source: data/replays/file_meridian_phi_call.json → redactions]. Eval: 0 of 2 PHI leaks [source: latest.json → phi_leakage].
- **Why this design:** Because a model call is a data boundary, redaction runs before any model call with reversible tokens, over relying on the provider's retention terms. See ADR 5.
- **Likely question → short answer:** "Does the redactor catch patient names it doesn't know?" → Unproven. Names are keyword-anchored plus a known-names list; a labelled PHI set and redaction recall as a release gate come before any real PHI-bearing call.
- **Speaker line:** "Have them toggle before/after. Tokens keep meaning, drop identity." [source: notes.ts → STEP_NOTES['ch2.privacy']]

---

## Architecture and decisions

Each decision is a short ADR. Status for all: accepted for the POC.

### ADR 1 · Routing by table, not prompt

- **Context:** who gets paged must be predictable, auditable and changeable by ops.
- **Decision:** the model classifies (type, area, severity); an editable rules table (type × area × severity × ARR band → owner and channel) decides the destination. Lowest priority wins; no match goes to triage [source: steps.ts → `ch4.intro`.more; src/pipeline/route.ts; docs/PLAN.md §6 step 9].
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
- **Decision:** uploads are converted to text in the browser and only the text is sent; regex plus validators (Luhn for cards, date sanity for DOB) then swap values for reversible tokens before any model sees text; the original never leaves the Worker; the browser sees a masked preview; model calls route only to providers that don't collect or train on data (`data_collection: deny`) [source: src/app/lib/convert/index.ts header; steps.ts → `ch2.redact`.more; src/worker/ai.ts header; docs/ARCHITECTURE.md → Models].
- **Alternatives:** rely on provider retention terms; a managed de-identification service.
- **Consequences:** meaning survives as tokens; recall on unanchored names is unproven; the provider filter is a routing setting, not a contract.
- **Evidence:** 0 of 2 PHI leaks on the eval; 22 values redacted on the PHI branch file [source: latest.json; data/replays/file_meridian_phi_call.json].

### ADR 6 · Eval promotion gate

- **Context:** prompt changes are the most common way an agent quietly regresses.
- **Decision:** a candidate is promoted only if every check in `PROMOTION_GATE` passes and no regression exceeds 2 points on precision, recall or level-5 recall; matching is by code (same type, overlapping quote spans), and only ambiguous leftovers go to a judge from a different model family [source: scoring.ts → PROMOTION_GATE; steps.ts → `ch7.metrics`.more; docs/RUNBOOK.md].
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
- **Evidence:** price table used for estimates, per million input / output tokens: main $0.02 / $1.00, backup $0.10 / $0.50, decision $0.15 / $0.50 [source: scoring.ts → MODEL_PRICES]. Recorded runs average $0.00141 per call [source: computed from data/replays/*.json]. A simulated incident in the history shows 61% fallback during a primary outage [source: agents.json → alerts alr_hist_sl_fallback]. The decision-model speed test is summarised in `docs/reports/decision-models.md`; the general speed-test tool (`scripts/speed-test.ts`) has no results checked into the repo.

### ADR 9 · Agent Ops registry and the nine-check standard

- **Context:** dozens of agents built in Claude, Gumloop or code need owners and comparable reporting.
- **Decision:** a registry with a named owner, business owner, purpose, data access, review cadence and baseline minutes per unit; nine checks for every production agent: owner, purpose and success metric, security and data review, evals with a promotion gate, logs and traces, spend cap, human review on high-stakes output, rollback and runbook, current review cadence [source: src/shared/platform-contracts.ts → STANDARD_CHECKS; data/platform/agents.json].
- **Alternatives:** per-team dashboards; a review committee.
- **Consequences:** comparable hours-returned and cost across agents; overdue reviews surface automatically. Baselines are registered assumptions.
- **Evidence:** Signal Loop 9/9 (two records illustrative); the simulated RFP agent fails the evals check ("Spot-checks only") [source: agents.json → standard].

### ADR 10 · POC on Cloudflare, production on Neon, Vercel and Trigger.dev

- **Context:** the POC had to be deployed, gated and cheap to run for a week; production needs managed Postgres, observability and scale.
- **Decision:** POC: one Worker (gate, API, SPA, pipeline, Switchboard, Agent Ops), D1, Vectorize, R2, KV and Workflows, with model calls (decision model included) through OpenRouter and simulated connectors [source: wrangler.jsonc; docs/ARCHITECTURE.md; Production.tsx → ROWS]. Production: Vercel (Next.js), Neon Postgres with pgvector, Vercel AI SDK with direct provider keys and provider-owned billing, the same decision model on our own key, Trigger.dev for long-running jobs, Render for streaming speech-to-text workers, dlt plus direct connectors for ingestion from the recorder and CRM if and when it is needed, the real Slack, Jira and Salesforce APIs for delivery, ClickHouse with dbt only once analytics volume justifies it, strict TypeScript throughout [source: src/narrative/scenes/Production.tsx; src/web/pages/WriteUp.tsx → STACK; docs/PLAN.md → Production stack].
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

- **Replay mode:** if live AI is off or over budget, runs replay a recorded real execution at real speed, labelled "replay" [source: docs/RUNBOOK.md → Replay mode]. Replays predate the decision model, so they show no second opinion.
- **Decision model down:** triage and the second opinion move to the main model automatically; nothing to do live [source: docs/RUNBOOK.md → Model fallback].
- **Workspace reset:** Settings → Reset workspace (or `POST /api/workspace/reset`) clears the viewer's conversations, review decisions, ticket and routing changes, connections, people edits and acting user; sample history stays [source: src/app/pages/Settings.tsx; docs/ARCHITECTURE.md → Switchboard; tests/worker/switchboard.test.ts].
- **Backup scenes:** `/backup/cost`, `/backup/security`, `/backup/failure`, `/backup/build-vs-buy`, `/backup/metrics`, `/backup/agent-ops`, `/backup/differently` [source: chapters.ts → BACKUPS].
- **Presenter view:** `/presenter`, synced to the main window over a `BroadcastChannel` in the same browser profile [source: src/web/pages/Presenter.tsx].
- **Deep links:** `?tour=<stepId>` jumps to any step.

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
| Two different time assumptions: 18 minutes per call in the registry, 10 minutes × 70% in the rollout scene | agents.json, scoring.ts, Rollout.tsx | Replace both with the time study |
| PHI and injection evidence is two files each | latest.json | Sets of a few hundred items; redaction recall as a release gate |
| The provider filter is a routing setting, not contractual zero retention | src/worker/ai.ts; BackupPage.tsx | DPA and zero-retention terms with Security |
| Security review and business-owner sign-off are illustrative | agents.json → standard | Real review by Invoca Security; independent sign-off |
| Adoption history is simulated users; the RFP agent is simulated | agents.json → note | Register real agents in quarter 1 |
| Cost and latency are reported, not gated | latest.json; copy.ts → promoteCopy | Add them as gate checks |
| v4 was scored with no judge calls, v5 with 2 | details-v4.json, details-v5.json → judgeCalls | Re-run both under identical settings |
| Theme quality has no eval | none in data/evals | Merge and split review with PMs |
| The backup model has never been scored as primary | docs/speaker-notes.md Q13 | One `npm run eval` with it as primary |
| The production stack is a design, not a port | Production.tsx | Port adapters, prove parity with the eval suite |

---

## Glossary

- **Acting user:** the person the viewer acts as. A new workspace acts as Elena Vasquez (VP, Product); switch with "Act as someone else" in the user menu. Reviews, connection changes and directory changes record this person [source: platform.ts → DEFAULT_ACTOR_ID, Actor].
- **Agent standard:** the nine checks every production agent must pass [source: platform-contracts.ts → STANDARD_CHECKS].
- **Analysis:** one kind of work Switchboard runs on a conversation. Six are listed; Signal Loop (product feedback) is the only one built. Triage says which apply [source: platform.ts → ANALYSES].
- **Anchor:** a `data-tour="<id>"` attribute the walkthrough spotlights; ids live in `src/tour/anchors.ts`.
- **Auto-route:** final confidence ≥ 0.80 and not a high-stakes type; delivered without review.
- **Backup model:** the third model role, used after a failed main-model retry and as the eval tie-break judge; never a fallback for decision calls.
- **Beat:** one → press inside a narrative scene.
- **Branch (path):** one of six routes through chapters 2–3, chosen by the file picked in chapter 1: main, clean, messy, security, negative, privacy.
- **Checkpoint:** the counter shown when leaving a chapter.
- **Connection:** a connector's state in one workspace (connected or disconnected), with a simulated account. A rule whose tool is disconnected routes to triage [source: platform.ts → Connection].
- **Decision model:** the small, fast model (`z-ai/glm-5.3-flash`) that runs triage and the second opinion; it falls back to the main model [source: wrangler.jsonc → MODEL_DECISION; docs/reports/decision-models.md].
- **Deliveries:** what was sent to each tool, with previews and receipts, on `/app/destinations`.
- **Dropped:** an insight whose quotes could not be grounded; counted, never shown as fact.
- **Fast path:** the in-request execution of the 10 steps, before any Workflow handoff.
- **Golden file:** a hand-checked file with labelled expected insights; 48 featured files are scored [source: latest.json → files].
- **Grounding:** the code check that each quote exists in the transcript (0.90 or better). Shown as "Check quotes".
- **Held:** final confidence below 0.55; kept visible, not routed.
- **Hours returned:** Σ(baseline minutes per unit − measured human review minutes), with baselines labelled as assumptions.
- **Main model:** the model role for extraction and theme naming.
- **Mess level:** 1 clean notes, 2 tidy transcript, 3 natural, 4 raw speech-to-text, 5 chaos (Slack, forwarded email, partial) [source: docs/PLAN.md §5].
- **Owner link:** a sign-in URL that sets the owner cookie; treat as a secret.
- **Promotion gate:** the rule set a candidate prompt must pass to ship; "Go-live check" on screen [source: scoring.ts → PROMOTION_GATE].
- **Redaction token:** a reversible placeholder such as `[PATIENT_1]` that replaces a personal value before any model call. Shown as "Remove PII".
- **Replay:** a recorded real execution played back at real speed, labelled on screen; costs nothing.
- **Review:** final confidence 0.55–0.80, or any high-stakes item; waits for a person.
- **Second opinion:** one batched decision-model call after scoring that checks each kept insight against its own quotes. Code may move a borderline item it agrees with (≥ 0.85) to auto-route, or an auto-route item it disputes (≥ 0.6) to review; forced reviews and held items never move [source: score.ts → applySecondOpinion].
- **Signal Loop:** the analysis built for the brief: product feedback, proved with the customer's own words, routed to its owner. Also the agent registered in Agent Ops.
- **Signed link:** a 7-day access link (`?k=…`), revocable by its `jti` [source: src/worker/gate.ts].
- **Switchboard:** the platform Signal Loop runs inside: reads any conversation or document, decides what it is, runs the analyses that apply, and sends results to the right people in their own tools [source: platform.ts header].
- **Theme:** a group of similar insights across accounts (cosine ≥ 0.82), named by the model.
- **Triage (step `screen`):** the first model call, on the decision model: what the input is, its language, how noisy it is, whether it is actionable, which analyses apply, and whether injection is suspected. Extraction starts alongside it [source: src/shared/prompts/screen.ts; stepText.ts].
- **Triage queue:** where unmatched or diverted insights go, owned by Product Operations (Jamie Fowler in the seed directory). Not the same as the triage step [source: data/world/routing.json → rule_fallback; route.ts → triageOwner].
- **Workspace:** a viewer's private copy of the sample data, including routing rules, connections, people edits and the acting user; edits never reach other viewers.
