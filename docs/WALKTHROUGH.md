---
title: "Signal Loop: the walkthrough, for AI assistants and readers"
version: "1.0"
date: "2026-10-25"
url: "https://repos.hunterborman.com/repo/invoca/"
markdown_url: "https://repos.hunterborman.com/repo/invoca/walkthrough.md"
duration: "25:00 (sum of targetSec in src/tour/script/chapters.ts)"
parts: 17
product_chapters: 8
branches: 6
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
  - docs/speaker-notes.md
  - docs/PLAN.md
  - docs/ARCHITECTURE.md
  - docs/RUNBOOK.md
  - docs/DESIGN.md
  - docs/data-review.md
  - data/evals/latest.json
  - data/evals/details-v4.json
  - data/evals/details-v5.json
  - data/replays/*.json
  - data/backfill/runs.json
  - data/platform/agents.json
  - data/tour-files.json
  - src/shared/scoring.ts
  - src/shared/contracts.ts
  - src/shared/prompts/extract.ts
  - src/pipeline/score.ts
  - src/worker/execute.ts
  - src/worker/runs.ts
  - src/worker/platform/math.ts
  - wrangler.jsonc
---

# Signal Loop: the walkthrough

## How to read this file

This is the machine-readable version of the 17-part guided walkthrough at `/repo/invoca/`. It is written so an AI assistant can answer questions about the build without inventing anything.

**What is authoritative, in order:**

1. The code and data files named in `[source: …]` tags. If this file and a source disagree, the source wins.
2. This file, for the reasoning behind each decision ("Why this design").
3. `docs/speaker-notes.md` and `src/tour/script/notes.ts`, for how Hunter says it out loud.

**Conventions:**

- `[source: path]` follows every number. A path with a key (for example `latest.json → promoted.precision`) names the field.
- **Assumption:** marks a figure that is illustrative or registered, not measured. Each one names what would replace it.
- **Simulated:** marks data that was generated, not observed. All accounts, people and calls are fictional.
- **Live:** marks a value the screen reads at run time from the viewer's own workspace or session. This file never states a live value as fixed; it gives the recorded or eval value instead and says so.
- "Main model" and "backup model" are the two model tiers. Exact model ids appear only on `/app/settings` in the product; this file does not repeat them.
- Routes are relative to `/repo/invoca`. Keys: → or Space for next, ← for back, Esc for the menu, A to approve, E to edit.
- Deep link to any step: `?tour=<stepId>&path=<branch>` [source: src/tour/engine/TourProvider.tsx header].

**When answering a question:** quote the number with its source, say whether it is measured, an assumption or simulated, and use the "Honest gaps" section rather than overstating.

## Summary

Customers tell Invoca's CSMs what to build, and most of it never reaches the person who could act on it. Signal Loop is a working agent that takes a CSM call transcript or set of notes, redacts personal and health details, extracts typed insights that each carry a verbatim quote, checks every quote against the transcript in code, sends uncertain or high-stakes items to a person, routes the rest by an editable rules table, groups them into themes with ARR attached, and tells the CSM when their feedback ships. It reports into Agent Ops, an internal platform where every agent has an owner, a spend cap, a quality gate, logs and a measured return. The walkthrough is 5 narrative parts on the problem, 8 product chapters where the viewer uses the real system, and 4 parts on rollout, the next 12–18 months, production and a scorecard. Six different starting files send the viewer down six branches through the same pipeline. The proof of concept runs on Cloudflare; the production design keeps the same boundaries on Neon, Vercel, the Vercel AI SDK, Trigger.dev and Render, with ClickHouse and dbt only at volume and dlt for ingestion.

### All 17 parts

Target seconds sum to 1,500 (25:00) [source: src/tour/script/chapters.ts → CHAPTERS, TOTAL_TARGET_SEC].

| Part | Id | Title | Route | Layer | Target (s) | Objective |
|---|---|---|---|---|---|---|
| 0 | `cold-open` | Cold open | `/walkthrough/cold-open` | narrative | 30 | Set the frame |
| 1 | `black-hole` | Where feedback gets lost | `/walkthrough/black-hole` | narrative | 75 | See where feedback goes today |
| 2 | `why` | Why this option | `/walkthrough/why` | narrative | 35 | Mirror Invoca back onto itself |
| 3 | `jtbd` | Jobs to be done | `/walkthrough/jtbd` | narrative | 135 | Flip each card: who needs what |
| 4 | `states` | Today and tomorrow | `/walkthrough/states` | narrative | 130 | Find the leaks, then seal them |
| 5 | `ch1` | A call comes in | `/app/new` | product | 90 | Bring in today's call |
| 6 | `ch2` | Watch it think | `/app/runs/:id` | product | 135 | Find what it refused to say |
| 7 | `ch3` | Human in the loop | `/app/review` | product | 120 | Approve one, correct one |
| 8 | `ch4` | Right owner, right channel | `/app/routing`, `/app/destinations` | product | 80 | Change who hears about pricing |
| 9 | `ch5` | Patterns, not anecdotes | `/app/themes`, `/app/themes/:id` | product | 75 | See the insight join a theme |
| 10 | `ch6` | Close the loop | `/app/destinations`, `/app/loop` | product | 50 | Ship it and tell the CSM |
| 11 | `ch7` | Prove it | `/app/evals`, `/app/health` | product | 95 | Try to promote the candidate prompt |
| 12 | `ch8` | Operate it | `/ops`, `/ops/agents`, `/ops/agents/agt_signal_loop`, `/ops/usage`, `/ops/logs`, `/ops/traces/:id`, `/ops/reliability` | product | 120 | Find your own run in the logs |
| 13 | `rollout` | Earning trust: rollout | `/walkthrough/rollout` | narrative | 150 | Build it, then operate it |
| 14 | `horizon` | The next 12–18 months | `/walkthrough/horizon` | narrative | 90 | Where this goes |
| 15 | `production` | From proof of concept to production | `/walkthrough/production` | narrative | 45 | Same design, production stack |
| 16 | `scorecard` | Scorecard | `/walkthrough/scorecard` | both | 45 | What you did, what it did |

Routes come from `src/tour/script/routes.ts` (`R`) and the `route` of each step in `src/tour/script/steps.ts`. The parts are grouped as "The problem" (0–4), "The system" (5–12) and "Making it real" (13–16) [source: chapters.ts → GROUPS].

### The four pillars of the brief, and where each is answered

| Pillar | Parts |
|---|---|
| Jobs to be done, current and future state | 1, 3, 4 |
| The build (proof of concept) | 5–12 |
| Stakeholder management and adoption | 3, 7, 13 |
| The next 12–18 months | 14, 15 |

---

## The problem (parts 0–4)

### Part 0 · Cold open

- **Goal:** make the problem one concrete sentence before any slide of context.
- **What's on screen:** a flat waveform of a 13-minute Brightline Home Services QBR with 06:00–06:23 highlighted, and three transcript lines around it. Jeff Kim at 06:00: "CallRail's been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day." On beat 1 the headline becomes "Every call is a signal." and a card shows what Signal Loop makes of that sentence: competitor offer, who hears it, the evidence at 06:00, and "Brightline renews in 12 weeks" [source: src/narrative/scenes/ColdOpen.tsx → LINES, BECOMES].
- **What the viewer does:** press → once (2 beats) [source: steps.ts → `cold-open`, beats: 2].
- **What it proves:** the valuable signal is a small part of a long, mostly routine call, and it has a deadline attached.
- **Key numbers:**
  - Call length 13:00, highlight at 06:00 [source: ColdOpen.tsx → CALL_SEC, HIGHLIGHT].
  - The file is about 1,850 spoken words with 6 planted insights; it was written by hand [source: docs/data-review.md → "The recommended file: C-1042"]. **Simulated.**
  - Renewal: "12 weeks" on the card; the recorded run's gate reasons say "renewal in 82 days" [source: data/replays/file_c1042.json → insights[].gateReasons].
- **Why this design:** Because the panel is judging whether I understand the job, not the market, we open on one sentence from the same file the viewer will run in part 5, over a problem statement or a market-size slide. Trade-off: no industry framing up front; part 1 supplies the scale, labelled as an assumption.
- **Likely question → short answer:** "Is this a real call?" → No. Every account and call is fictional. C-1042 was written by hand to carry six specific signals and one grounding trap [source: docs/data-review.md].
- **Speaker line:** "This is a thirteen-minute QBR. Twenty seconds of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks." [source: src/tour/script/notes.ts → NOTES['cold-open']]

### Part 1 · Where feedback gets lost

- **Goal:** show where feedback leaks today, with the scale honestly labelled.
- **What's on screen:** four sources (QBRs, renewals, check-ins, escalations), then three handoffs shrinking a bar from 100 to 72 to 55 to 40, each with its reason ("said once, never written down", "stays in a notes field", "Slack thread scrolls away"). Beat 2 shows "60 of every 100 never reach an owner" and an assumption callout [source: src/narrative/scenes/BlackHole.tsx → STAGES].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the loss is spread across manual, optional handoffs, not one broken step.
- **Key numbers:** 100 → 72 → 55 → 40 [source: BlackHole.tsx → STAGES]. **Assumption:** illustrative, not measured; a 2-week time study with two CSMs replaces it [source: BlackHole.tsx callout; docs/speaker-notes.md Part 1].
- **Why this design:** Because there is no defensible public benchmark for how much internal CSM feedback reaches an owner at Invoca, we show an illustrative funnel labelled as an assumption on screen, over quoting an outside statistic. Trade-off: the number cannot carry an ROI case on its own, which is why the rollout starts with the time study (part 13).
- **Likely question → short answer:** "Where does 40 of 100 come from?" → It is an assumption and says so. Week 0 of the rollout replaces it with a measured number. The registry's success metric uses the same assumed baseline of about 40% [source: data/platform/agents.json → agt_signal_loop.profile.successMetric].
- **Speaker line:** "'40 of 100' is an assumption, and it says so on screen. The first thing I'd do in the job is a 2-week time study with two CSMs to replace it with a real number." [source: notes.ts → NOTES['black-hole']]

### Part 2 · Why this option

- **Goal:** explain why Option 3 fits Invoca specifically.
- **What's on screen:** two flow rows. Top: customers' calls → Invoca Signal AI → signals for their business. Bottom: Invoca's own CSM calls → Signal Loop → signals for Product, VP Product, Sales and Support. Then four reasons [source: src/narrative/scenes/Why.tsx → ROWS, REASONS].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the idea is Invoca's own product discipline pointed inward.
- **Key numbers:** none; four stated reasons: the data already exists; internal and additive, with people reviewing; shows value in weeks, not quarters; a path into Signal AI later [source: Why.tsx → REASONS].
- **Why this design:** Because the transcripts and notes already exist, the work is internal, and a person reviews anything high stakes, we chose the feedback loop over the other take-home options; it can show value in weeks with low risk. Trade-off: it is less visible to customers than a customer-facing agent.
- **Likely question → short answer:** "Why not buy Gong, Productboard or Enterpret?" → Each covers part of it; none owns Invoca's taxonomy, routing rules and the loop back to CSMs. `/backup/build-vs-buy` has the comparison [source: src/narrative/backup/BackupPage.tsx; docs/speaker-notes.md Q5].
- **Speaker line:** "I picked it because the data exists, it's internal and additive, a person reviews anything high stakes, and it can show value in weeks." [source: notes.ts → NOTES.why]

### Part 3 · Jobs to be done

- **Goal:** name who hires the system and for what, before any architecture.
- **What's on screen:** four persona cards: Customer Success Manager, Product Manager, VP Product, and Sales · Competitive · Support. Each shows its job in when / want / so form; opening a card reveals struggles and a success measure. Beat 1 replaces the headline with "Be the advocate, not the stenographer." [source: src/narrative/scenes/Jtbd.tsx → PERSONAS].
- **What the viewer does:** open all four cards (click, or Tab + Enter), then → (2 beats). A counter shows "n of 4 opened".
- **What it proves:** the CSM is the supplier of the data, so the system succeeds only if it makes CSMs look good.
- **Key numbers:** CSM persona "owns 15–20 accounts, 15+ customer calls a week" [source: Jtbd.tsx → PERSONAS[0].who]. **Assumption:** a persona description, not Invoca data.
- **Why this design:** Because the success metrics (capture rate, time to owner, evidence rate) fall out of the four jobs, we put JTBD before architecture, over leading with the pipeline. The emotional job is the headline because a CSM who gets nothing back stops feeding the system, and then nothing downstream works. Trade-off: 2:15 of a 25-minute slot before the product appears.
- **Likely question → short answer:** "Which job matters most?" → The CSM's emotional job. The PM, VP and GTM jobs only get served if CSMs keep supplying calls, so loop-closing credit (part 10) is a requirement, not a nicety.
- **Speaker line:** "The job that matters most is the emotional one: be the advocate, not the stenographer. If the system doesn't make CSMs look good, they stop feeding it." [source: notes.ts → NOTES.jtbd]

### Part 4 · Today and tomorrow

- **Goal:** current state versus future state, leak by leak.
- **What's on screen:** a five-lane swimlane (Customer, CSM, Notes and Slack, Product, Leadership). Beat 1: a leak marker at each handoff ("Never written down", "Half remembered", "Lost in a notes field", "Scrolls away in Slack", "No pattern, no revenue", plus "Customer never hears back"). Beat 2: the middle lane becomes Signal Loop and each leak becomes a check ("Recorded and transcribed", "Quoted word for word", "Checked against the call", "Routed by an editable rule", "Grouped with revenue"). Beat 3: the loop closes back to the CSM and the customer [source: src/narrative/scenes/States.tsx → LEAKS, HEAD].
- **What the viewer does:** → three times (4 beats).
- **What it proves:** each future-state feature exists to close a named leak.
- **Key numbers:** 5 handoffs, 6 things that go missing [source: States.tsx → HEAD].
- **Why this design:** Because a feature list is hard to evaluate, we drew the future state on the same lanes as the current state, so each check maps one to one onto a leak, over a separate architecture diagram. Trade-off: the swimlane simplifies who does what; real handoffs vary by team.
- **Likely question → short answer:** "Isn't this just bad discipline by CSMs?" → No. Every step is manual, optional and invisible, so it depends on memory. The fix is a system, not heroics.
- **Speaker line:** "Today it's a relay race with no baton. Five handoffs between the call and the VP, each depending on someone remembering." [source: notes.ts → NOTES.states]

---

## The system (parts 5–12)

### Part 5 · Ch1 · A call comes in

- **Goal:** bring a call into a new run with no retyping.
- **What's on screen:** the New call page. The file picker shows a library shaped like a call-recorder export, grouped by week, with the Brightline QBR highlighted. Mess levels are not labelled [source: steps.ts → `ch1.pick`.more; docs/PLAN.md §5].
- **What the viewer does:** click Upload (`ch1.intro`, waits for `picker.opened`) → select a file (`ch1.pick`, waits for `file.selected`) → Open (`ch1.open`, waits for `picker.closed`) → Run pipeline (`ch1.run`, waits for `run.started`) [source: steps.ts].
- **What it proves:** the only manual step is choosing the file, and in production it goes away.
- **Key numbers:**
  - 48 featured files in the picker: 8 per mess level 1–5, plus 8 edge cases [source: docs/data-review.md; docs/PLAN.md §5]. **Simulated.**
  - Checkpoint: "0 fields typed by the CSM" [source: steps.ts → `ch1.run`.checkpoint].
- **Why this design:**
  - Because the CS team's recorder and CRM are not known yet, we use upload and a synthetic library in the POC and plan dlt ingestion from whichever recorder and CRM the team uses (Gong, Zoom, Salesforce and Zendesk are examples), over building one integration speculatively. Trade-off: the demo has one click a real CSM would not [source: steps.ts → `ch1.intro`.more; src/narrative/scenes/Production.tsx].
  - Because a labelled "hard" file would make the choice feel staged, mess levels are hidden until after the pick, over a menu of labelled scenarios. Trade-off: a viewer may not know which branch they chose until the callout names it [source: docs/PLAN.md §5].
  - Because a restarted tour should run live again, the walkthrough always sends `rerun: true`; the same bytes otherwise return the earlier run (SHA-256 idempotency) [source: docs/ARCHITECTURE.md → Duplicates].
- **Likely question → short answer:** "What happens if I upload the same file twice?" → It is deduplicated by SHA-256 and you are offered "Open your earlier run" or "Run again live" [source: docs/ARCHITECTURE.md].
- **Speaker line:** "This is the only manual step, and in production it goes away: dlt pulls from whichever recorder and CRM the CS team uses." [source: notes.ts → NOTES.ch1]

### Part 6 · Ch2 · Watch it think

- **Goal:** watch the real pipeline and see what it refuses to say.
- **What's on screen:** the Run view. A 10-step stepper (ingest, normalize, redact, screen, extract, ground, score, theme, route, deliver), the transcript, insight cards, the gate result and a trace panel with model, tokens, cost and milliseconds per step [source: data/replays/file_c1042.json → steps; src/tour/anchors.ts].
- **What the viewer does:** → as each step completes: `ch2.intro` → `ch2.redact` → (`ch2.privacy` / `ch2.screen` on some branches) → `ch2.extract` → `ch2.ground` → (`ch2.rejected` only if offered) → (`ch2.messy` on the messy branch) → `ch2.gate` → `ch2.trace` → (`ch2.clean` on the clean branch) [source: steps.ts].
- **What it proves:** what is on screen is the real execution, drawn from saved step rows; a quote that is not in the transcript cannot become an insight.
- **Key numbers (recorded Brightline run, used when live AI is off):**
  - 6 insights, 14 of 14 quotes grounded by exact match, 0 dropped [source: data/replays/file_c1042.json → insights[].evidence[].method].
  - 19 values redacted [source: file_c1042.json → redactions].
  - 3 auto-route, 3 to review [source: file_c1042.json → insights[].gate].
  - 4,238 ms end to end; screen 357 ms, extract 2,859 ms, theme 1,014 ms [source: file_c1042.json → totalMs, steps[].durationMs].
  - $0.001401 of AI [source: file_c1042.json → run.costUsd].
  - Grounding pass mark 0.90 [source: src/shared/contracts.ts → THRESHOLDS.grounding].
  - On the promoted prompt, 275 of 275 eval quotes grounded [source: data/evals/latest.json → promoted.metrics grounding_rate].
  - Live runs show the viewer's own numbers instead. **Live.**
- **Why this design:**
  - Because the model cannot be trusted to police itself, grounding is code (normalize, exact substring, then a sliding Levenshtein window at 0.90 or better), over asking the model to verify its own quotes. Trade-off: grounding proves the words were said, not that they are feedback; v5 in part 11 shows that limit [source: copy.ts → groundCopy.more; ADR 2].
  - Because a cheap check can stop work early and flag injection, a fast screen call runs before extraction; extraction starts alongside it on the same redacted input and is discarded if screen says nothing is actionable, over a single extraction call. Trade-off: the discarded extraction's cost is still spent [source: docs/ARCHITECTURE.md → Latency work].
  - Because watching rows is the only honest way to show a pipeline, the UI animates from `run_steps` rows and labels a replay as a replay, over a scripted animation [source: copy.ts → introCopy; docs/PLAN.md §6].
- **Likely question → short answer:** "Did grounding ever catch anything?" → Not on the promoted prompt: 275 of 275 [source: latest.json]. It is a seatbelt. The candidate v5 had 3 of 505 quotes fail (502 grounded) [source: latest.json → candidate grounding_rate]. "See a rejected quote" appears only if a real run with a dropped quote exists in the database; do not promise it otherwise [source: steps.ts → `ch2.ground`.notes].
- **Speaker line:** "Grounding is the moment. Fourteen of fourteen, word for word, on the recorded Brightline run. If the model had stitched Dana's interrupted sentence into one tidy quote, code wouldn't find it and the insight would be dropped." [source: notes.ts → NOTES.ch2]

### Part 7 · Ch3 · Human in the loop

- **Goal:** a person decides on anything uncertain or high stakes.
- **What's on screen:** the review queue; every item has a reason chip such as "confidence 0.71 < 0.80" [source: steps.ts → `ch3.why`].
- **What the viewer does:** press A (or click Approve) on one item (`ch3.approve`, waits for `review.action` approve); press E on another, change type, area or severity, then Save edit & route (`ch3.edit`, waits for edit or reject). Save stays disabled until a field changes. Then Next or "Try another file" (`ch3.fork`) [source: steps.ts; notes.ts → NOTES.ch3].
- **What it proves:** nothing on a parked run routes until someone acts, and each correction becomes labelled data.
- **Key numbers:**
  - Gate: 0.80 and above auto-routes, 0.55–0.80 goes to review, below 0.55 is held but visible [source: src/shared/contracts.ts → THRESHOLDS; src/pipeline/score.ts header].
  - Always reviewed: churn risk, high or critical bugs, and every insight in a file where injection was suspected [source: src/pipeline/score.ts header].
  - On the v4 eval: 76 of 141 insights went to review (54%) and 65 auto-routed; 5 of those 65 were false positives (7.7%) [source: data/evals/details-v4.json → predicted[].gate, matched].
  - 45 of 48 eval runs ended with something to review [source: details-v4.json → status].
  - Checkpoint: "decisions made by a person" [source: steps.ts → `ch3.fork`.checkpoint]. **Live.**
- **Why this design:**
  - Because a wrong churn flag in front of a PM costs the CSM trust, high-stakes types always go to a person regardless of confidence, over one global threshold. Trade-off: 54% of v4 insights need a person, so review load is the real constraint [source: details-v4.json].
  - Because review can take hours, review is a state change on a parked run (`awaiting_review`), over a suspended workflow waiting for an event; the approve action routes the insight and writes an audit row [source: docs/PLAN.md §6 "As built"; src/worker/review.ts].
  - Because the next prompt should learn from corrections, edits follow the `operator_actions` pattern (idempotency key, before, after, reviewer, reason) and become eval cases [source: steps.ts → `ch3.edit`.more].
- **Likely question → short answer:** "Haven't you just moved data entry into a review queue?" → Partly, by design for now. A review is approve-or-edit on a pre-filled, quoted item. Thresholds get tuned against champion labels in weeks 3–6 [source: src/narrative/scenes/Rollout.tsx → PHASES].
- **Speaker line:** "The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it's here." [source: notes.ts → NOTES.ch3]

### Part 8 · Ch4 · Right owner, right channel

- **Goal:** show that routing is data that ops can change.
- **What's on screen:** the routing rules table, a Sankey of type → product area → owner, then Jira and Slack destination previews with delivery receipts [source: steps.ts → `ch4.*`].
- **What the viewer does:** edit the pricing-objection rule so objections on accounts over $250k ARR go to the VP of Product (`ch4.rule`, waits for `rule.changed`); watch the Sankey re-flow; view the Jira ticket and the Slack message [source: steps.ts; notes.ts → NOTES.ch4].
- **What it proves:** the model classifies; a table decides who hears it, with no prompt change and no redeploy.
- **Key numbers:**
  - Rules match type × product area × severity × ARR band → owner and channel; lowest priority wins; no match goes to triage [source: steps.ts → `ch4.intro`.more].
  - 14 seed routing rules [source: docs/data-review.md].
  - Routing accuracy on the v4 eval: 94.4% (118 of 125) [source: latest.json → promoted routing_accuracy].
  - Checkpoint: "routing rules changed · 0 prompts edited" [source: steps.ts → `ch4.slack`.checkpoint]. **Live.**
- **Why this design:** Because routing must be predictable, auditable and changeable by ops without a deploy, routing is an editable rules table, over letting the prompt choose an owner. Trade-off: new routing needs need a rule, and a missing rule sends items to triage rather than guessing. See ADR 1.
- **Likely question → short answer:** "Does my rule change affect other viewers?" → No. Each viewer has their own workspace; edits apply only there [source: copy.ts → sankeyCopy; BackupPage.tsx → Isolation].
- **Speaker line:** "Routing is a table, not a prompt. Ops can read it, change it and audit it." [source: notes.ts → NOTES.ch4]

### Part 9 · Ch5 · Patterns, not anecdotes

- **Goal:** turn one complaint into a pattern with ARR attached.
- **What's on screen:** the themes list with the Google Ads offline-conversions theme highlighted, then its page: ARR at stake, an eight-week trend whose bars link to their insights, and representative quotes that link back to the exact transcript turn [source: steps.ts → `ch5.*`; copy.ts → isSpotlitTheme].
- **What the viewer does:** open the highlighted theme (`ch5.intro`, waits for `theme.opened`), then → through ARR, trend and quotes.
- **What it proves:** the PM and VP get cross-account evidence, not a forwarded anecdote.
- **Key numbers:**
  - Join threshold: cosine similarity 0.82 [source: src/shared/scoring.ts → THEME_JOIN_THRESHOLD].
  - The spotlit theme was seeded with 32 insights from 7 accounts, $1.40M ARR [source: docs/data-review.md → Backfill and themes]. **Simulated.** The callout reads live counts; say what it says.
  - ARR is counted once per account [source: copy.ts → themeCopy].
- **Why this design:** Because theme membership has to be reproducible and auditable, membership is decided by embeddings and a similarity threshold in code and the model only names the theme, over asking the model to cluster. Trade-off: the threshold needs tuning, and theme quality has no eval yet (see Honest gaps). See ADR 11.
- **Likely question → short answer:** "Is ARR at stake a churn forecast?" → No. It is the ARR of accounts that raised the issue, counted once each.
- **Speaker line:** "One complaint is an anecdote. Membership is deterministic: embeddings and a similarity threshold. The model only names it." [source: notes.ts → NOTES.ch5]

### Part 10 · Ch6 · Close the loop

- **Goal:** the CSM hears back when their feedback ships.
- **What's on screen:** a Jira-style ticket with a state control, then the CSM loop page with a "shipped" notice and a drafted note for the customer [source: steps.ts → `ch6.*`].
- **What the viewer does:** play the PM: move the ticket to Shipped (`ch6.ship`, waits for `ticket.state` shipped), then → through the inbox and the note.
- **What it proves:** the CSM's emotional job from part 3 is served: credit, without status-chasing.
- **Key numbers:** checkpoint "1 loop closed back to the CSM · 0 status-chasing emails" [source: steps.ts → `ch6.note`.checkpoint].
- **Why this design:** Because the customer relationship belongs to the CSM, the customer note is drafted, not sent, over sending it automatically. Trade-off: one more action for the CSM, in exchange for keeping their voice and judgement [source: steps.ts → `ch6.note`].
- **Likely question → short answer:** "Are Jira and Slack real?" → Not in the POC. Destinations are mocks with real receipts and retries; connecting real Slack and Jira behind a flag is a next step [source: data/platform/agents.json → dataAccess "mock destinations in the demo"; docs/speaker-notes.md Q18].
- **Speaker line:** "The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs." [source: notes.ts → NOTES.ch6]

### Part 11 · Ch7 · Prove it

- **Goal:** show quality is measured, and that the gate blocks a bad prompt.
- **What's on screen:** the Evals page (precision and recall per type and per mess level, the candidate prompt, the Promote button and the gate result), then the budget gauge on Health [source: steps.ts → `ch7.*`].
- **What the viewer does:** → through metrics and levels; click Promote on the candidate (`ch7.promote`, waits for `eval.promote_attempted`); read the block; → to Health.
- **What it proves:** a change that looks fine on recall is blocked on precision, by rule, before it ships.
- **Key numbers (promoted prompt v4, 48 golden files):**
  - Precision 88.7% (125/141), recall 97.7% (125/128) [source: latest.json → promoted.metrics precision, recall].
  - Level-5 recall 90% (18/20) [source: latest.json → recall.level5].
  - Grounding 100% (275/275); routing 94.4% (118/125) [source: latest.json].
  - Safety: 0 of 2 negative-control false positives, 2 of 2 injections flagged, 0 of 2 PHI leaks, 0 of 48 run failures [source: latest.json].
  - Under the 85% line per type: feature request 81.5% (22/27), praise 81.3% (13/16), churn risk 78.6% (11/14), pricing objection 77.8% (14/18) [source: latest.json → precision.<type>].
  - Eval run cost $0.093 for 48 files; p50 2.7 s, p95 3.8 s [source: latest.json → promoted.costUsd, p50Ms, p95Ms].
- **Key numbers (candidate v5):**
  - Precision 59.7% (126/211), recall 98.4% (126/128), grounding 99.4% (502/505) [source: latest.json → candidate.metrics].
  - Blocked reasons, as the gate lists them: precision under the 85% threshold, and a −28.9 point precision regression against a −2.0 point limit [source: latest.json → candidate.blockedReasons].
  - Over-labelling: 38 extra praise items (51 predicted, 13 correct) and 20 extra churn risks (31 predicted, 11 correct) [source: latest.json → precision.praise, precision.churn_risk; details-v5.json].
  - Cost $0.113 and p95 6.3 s for the eval set, both worse than v4; shown, not gated [source: latest.json → candidate.costUsd, p95Ms; copy.ts → promoteCopy].
  - Budget: a hard $15 cap on live AI for viewers [source: wrangler.jsonc → vars.BUDGET_LIMIT_USD]. **Live** gauge.
- **Why this design:** Because a prompt can look better on one metric and quietly worse on another, promotion needs every gate check to pass (overall precision ≥ 85%, recall ≥ 80%, level-5 recall ≥ 70%, grounding ≥ 95%, zero negative false positives, every injection flagged, zero PHI leaks, zero run failures, and no regression over 2 points on precision, recall or level-5 recall), over a reviewer's judgement call [source: src/shared/scoring.ts → PROMOTION_GATE; docs/RUNBOOK.md → Prompt promotion]. Trade-off: per-type slices, cost and latency are reported, not gated yet. See ADR 6.
- **Likely question → short answer:** "Did you build v5 to fail?" → Yes, deliberately: it is the cost-cutting rewrite people really make. Every quote was real, which is exactly why grounding alone isn't enough [source: notes.ts → NOTES.ch7].
- **Speaker line:** "Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback." [source: notes.ts → NOTES.ch7]

### Part 12 · Ch8 · Operate it

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

## Making it real (parts 13–16)

### Part 13 · Earning trust: rollout

- **Goal:** how adoption is earned and measured.
- **What's on screen:** beat 0, a phased timeline: Week 0 discovery, Weeks 1–2 shadow mode, Weeks 3–6 champions, Week 7+ whole team, plus trust mechanics. Beat 1, hours given back and what is measured weekly and reported to executives. Beat 2, the operating loop (build, launch, measure, review, improve) and four cards: review cadence, the agent standard, maintenance, helping other builders [source: src/narrative/scenes/Rollout.tsx → PHASES, TRUST, OPERATE].
- **What the viewer does:** → twice (3 beats).
- **What it proves:** the rollout is additive (it takes the data entry, not the judgement), and the platform keeps it owned after launch.
- **Key numbers:**
  - 1.75 hours given back to each CSM a week; 2,730 hours a year across 30 CSMs [source: Rollout.tsx → Stat values]. **Assumption:** 10 minutes of admin per call, 15 calls a week, 70% removed; the time study replaces it [source: Rollout.tsx callout].
  - Champions: two or three volunteer CSMs and one PM [source: Rollout.tsx → PHASES].
  - Weekly measures: capture rate, time to owner, accuracy, evidence rate, active reviewers [source: Rollout.tsx].
- **Why this design:** Because CSMs will not feed a system they don't trust, the rollout runs shadow mode first (nothing sent), then champions with a weekly calibration, then the team, over a big-bang launch. Adoption is measured from usage events, not surveys. Trade-off: no automatic routing until about week 7.
- **Likely question → short answer:** "What would make you shut it off?" → Kill and rework criteria are signed by the business owner [source: docs/RUNBOOK.md → Owners]. Proposed, not configured: auto-route precision under the 85% bar for two weeks, weekly active reviewers falling for a month, or net hours (after review time) below cost.
- **Speaker line:** "Build it, then operate it. Discovery and the time study first, then shadow mode, then champions, then the team." [source: notes.ts → NOTES.rollout]

### Part 14 · The next 12–18 months

- **Goal:** where this goes, and what doesn't change.
- **What's on screen:** six milestones: Months 0–3 earn trust first; 3–6 every call by default; 6–9 capture during the call; 9–12 specialist agents; 12–15 drafted specs and replies; 15–18 part of Invoca's platform (Signal AI). Beat 1: "No quote, no insight. Code checks the model. People make the high-stakes calls." [source: src/narrative/scenes/Horizon.tsx → MILES].
- **What the viewer does:** → once (2 beats).
- **What it proves:** the ingredients get cheaper and faster; the trust mechanisms stay.
- **Key numbers:** the "every call" card reads the measured average AI cost per live run at run time. **Live.** Recorded runs average $0.00141 per call (48 runs) and the backfill $0.00133 (218 runs) [source: computed from data/replays/*.json → run.costUsd and data/backfill/runs.json → costUsd].
- **Why this design:** Because "every call by default" before shadow mode and champions would contradict the rollout, the horizon starts after months 0–3, over a timeline that promises full coverage in the first quarter. Trade-off: slower to full coverage.
- **Likely question → short answer:** "Why would this move into Signal AI?" → The long-term engine should be Invoca's own conversation platform; the workflow, gates and routing layer still have to exist above it.
- **Speaker line:** "What doesn't change: grounding in code, gates, routing as data, human judgement." [source: notes.ts → NOTES.horizon]

### Part 15 · From proof of concept to production

- **Goal:** the same design on a production stack.
- **What's on screen:** a table of eight jobs, POC column first, production column filling in on beat 1: website and API (Cloudflare Worker and React → Vercel with Next.js); AI model calls (Vercel AI SDK through a shared router → Vercel AI SDK with our own provider keys); long-running jobs (Cloudflare Workflows → Trigger.dev); database (D1 → Neon Postgres); similar feedback (Vectorize → pgvector on Neon); reporting at scale (daily summaries in D1 → ClickHouse with dbt); bringing in calls (upload or library → pulled from the recorder and CRM); live transcription (not needed yet → Render). Constants: strict TypeScript everywhere, one set of data contracts, each AI provider bills directly with keys on the server [source: src/narrative/scenes/Production.tsx → ROWS, CONSTANTS].
- **What the viewer does:** → once (2 beats).
- **What it proves:** the prompts, quote checks and tests move unchanged; only hosting changes.
- **Key numbers:** none.
- **Why this design:** see ADR 10.
- **Likely question → short answer:** "Isn't that a rewrite?" → A port of adapters, not logic. The 10-step pipeline core (`src/pipeline/run.ts`) is runtime-agnostic and the contracts are shared Zod and TypeScript; the eval suite proves parity.
- **Speaker line:** "The POC runs entirely on Cloudflare. The production design keeps the same boundaries." [source: notes.ts → NOTES.production]

### Part 16 · Scorecard

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

The file picked in part 5 changes chapters 2–3; all paths rejoin at chapter 4. The tour counts "Scenarios explored: n of 6" [source: docs/PLAN.md → Branches; steps.ts → `ch3.fork`]. Entry files come from `data/tour-files.json`. Numbers below are from each file's recorded run in `data/replays/<file>.json` (what the viewer sees when live AI is off); a live run may differ. All files are **Simulated**.

### Branch: main (Brightline QBR)

- **Goal:** the full story on a level-3 natural transcript.
- **What's on screen:** the standard ch2 sequence; screen folded into the extract beat.
- **What the viewer does:** pick the highlighted `2026-10-21_Brightline_QBR_transcript.vtt` (`file_c1042`).
- **What it proves:** six real signals survive tangents and small talk, and an interruption is a grounding trap.
- **Key numbers:** 6 insights; 14/14 quotes exact; 3 auto-route, 3 review (two high or critical bugs and the churn risk); $0.001401; 4,238 ms [source: data/replays/file_c1042.json].
- **Why this design:** Because a tidy file would not test grounding, C-1042 has Dana's sentence interrupted by Jeff, so a model that stitches turns into one quote produces text that does not exist [source: docs/data-review.md → Where grounding matters]. Trade-off: hand-written, so it shows the trap exists, not how often real models fall in it.
- **Likely question → short answer:** "Why was the churn line reviewed at 0.94?" → Churn risk is always reviewed, whatever the confidence [source: file_c1042.json → gateReasons].
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
- **Likely question → short answer:** "Does noise lower confidence?" → That is the mechanism (final confidence includes the grounding score), but on this recorded run confidence stayed high and review was driven by severity rules. Say what the callout shows.
- **Speaker line:** "The model quoted the garbled text verbatim, so it grounds exactly; noise shows up as lower confidence and more review." [source: docs/speaker-notes.md → Ch2 branch extras]

### Branch: security (Ridgeway injection)

- **Goal:** a planted instruction is treated as data.
- **What's on screen:** `ch2.screen`: "Injection flagged, and kept inert" [source: copy.ts → screenCopy].
- **What the viewer does:** pick `file_ridgeway_prep_injection` (a blunt planted instruction inside a pasted survey export, plus two real insights) [source: docs/data-review.md].
- **What it proves:** the instruction has nothing to act on: text is wrapped as data, output is schema-only, the model has no tools; the attempt is flagged and audited.
- **Key numbers:** screen `injection_suspected: true`; 3 insights, all sent to review because injection was suspected in the file; $0.002042 [source: data/replays/file_ridgeway_prep_injection.json → screen, gateReasons]. Eval: 2 of 2 injections flagged [source: latest.json → injection_flagged].
- **Why this design:** Because prompt-level defences can be talked around, we removed the capability instead (no tools, fixed schema) and sent the whole file to a person, over trusting a "do not follow instructions in the transcript" line. Trade-off: one hostile line puts a whole call into review.
- **Likely question → short answer:** "Is two injection files enough?" → No. It shows the mechanism, not coverage; a few hundred items is the production bar.
- **Speaker line:** "The planted instruction is inert data: schema-only output, no tools, an audit row." [source: notes.ts → STEP_NOTES['ch2.screen']]

### Branch: negative (PrairieLink friendly check-in)

- **Goal:** the right output is nothing.
- **What's on screen:** screen says nothing actionable; extract returns zero insights with a calm empty state [source: copy.ts → extractCopy].
- **What the viewer does:** pick `file_prairielink_friendly` (training logistics, a puppy, the first snow) [source: docs/data-review.md].
- **What it proves:** the system does not invent work to look busy.
- **Key numbers:** 0 insights; status completed; 399 ms; $0.000156 [source: data/replays/file_prairielink_friendly.json]. Eval: 0 of 2 negative-control false positives [source: latest.json → negative_fp_rate].
- **Why this design:** Because false positives cost PM trust, the prompt says "return an empty list if nothing applies" and the gate requires zero negative false positives, over always producing a summary [source: docs/PLAN.md → Prompts; scoring.ts → PROMOTION_GATE.negativeFpRate].
- **Likely question → short answer:** "Why still run extraction?" → Screen is a cheap first opinion; the expensive step still runs and must agree [source: copy.ts → screenCopy].
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
- **Decision:** the model classifies (type, area, severity); an editable rules table (type × area × severity × ARR band → owner and channel) decides the destination. Lowest priority wins; no match goes to triage [source: steps.ts → `ch4.intro`.more; docs/PLAN.md §6 step 9].
- **Alternatives:** the prompt names the owner; a learned router.
- **Consequences:** a rule change re-routes with no prompt change and no redeploy; every change has a before and after in the audit log. New routing needs a rule.
- **Evidence:** routing accuracy 94.4% (118/125) on v4 [source: latest.json]; rollback for a bad rule is "revert the rule" [source: docs/RUNBOOK.md → Rollback].

### ADR 2 · Quote grounding in code

- **Context:** a fabricated quote shown as customer evidence is the worst failure for PM trust.
- **Decision:** every insight needs a verbatim quote; code normalizes both texts, tries an exact substring, then a sliding Levenshtein window; 0.90 or better passes; a quote that fails drops its insight and is counted [source: copy.ts → groundCopy; contracts.ts → THRESHOLDS.grounding].
- **Alternatives:** the model checks itself; a second model checks quotes.
- **Consequences:** deterministic and testable; proves presence, not meaning or speaker.
- **Evidence:** v4 275/275 grounded; v5 502/505 grounded yet precision 59.7% [source: latest.json]. Across the 48 recorded runs, 262 quotes matched exactly and 10 after normalization, 0 failed [source: computed from data/replays/*.json → evidence[].method].

### ADR 3 · Human review gate and thresholds

- **Context:** some outputs are cheap to get wrong (praise), others are not (churn, sev-1 bugs).
- **Decision:** final confidence = model confidence × grounding score × type prior × account context; ≥ 0.80 auto-route, 0.55–0.80 review, < 0.55 held; churn risk, high or critical bugs, and every item in a file with suspected injection always go to review [source: src/pipeline/score.ts; scoring.ts → TYPE_PRIORS, ACCOUNT_CONTEXT].
- **Alternatives:** review everything; review nothing; one global threshold.
- **Consequences:** v4 sent 76 of 141 insights (54%) to review; 5 of 65 auto-routed were false positives (7.7%) [source: details-v4.json]. Type priors are **assumptions** [source: scoring.ts comment].
- **Evidence:** per-type precision is uneven (bug 98.0%, pricing 77.8%) [source: latest.json], which argues for per-type thresholds next.

### ADR 4 · Fast path first, durable Workflow as the fallback

- **Context:** a Workflow instance takes seconds to start and each durable step adds a few hundred milliseconds [source: docs/ARCHITECTURE.md].
- **Decision:** run the 10 steps on a fast path in `waitUntil`; if a step throws or the 18 s fast-path budget runs out, a conditional `UPDATE` claims the run and a Workflow resumes from the last completed step. Stalled runs (no progress for 40 s) are recovered; featured files not finished within 25 s become a replay [source: src/worker/execute.ts → FAST_PATH_BUDGET_MS; src/worker/runs.ts → STALLED_AFTER_MS; scoring.ts → LIVE_FALLBACK_AFTER_MS].
- **Alternatives:** Workflow for every run; fast path only.
- **Consequences:** normal runs are fast and still durable; steps are idempotent upserts; a run never executes twice (single claimant); writes go through one ordered queue with a liveness guard [source: docs/ARCHITECTURE.md].
- **Evidence:** v4 eval p50 2.7 s, p95 3.8 s, 0 of 48 run failures [source: latest.json].

### ADR 5 · Redaction before any model call

- **Context:** CSM calls carry PII and, for healthcare customers, PHI.
- **Decision:** regex plus validators (Luhn for cards, date sanity for DOB) swap values for reversible tokens before any model sees text; the original never leaves the Worker; the browser sees a masked preview; model calls route only to providers that don't collect or train on data [source: steps.ts → `ch2.redact`.more; src/worker/ai.ts header].
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
- **Decision:** viewers share a $15 cap. Each live run reserves its worst case (every call at max output, three attempts, the dearer model's price, plus 20%) with one atomic conditional insert; at most 8 unsettled reservations at once; rate limits fail closed; when the remainder cannot cover a run, or the provider answers 402, live AI flips off and runs replay recorded real executions, labelled on screen. The provider key has its own hard limit too [source: wrangler.jsonc → BUDGET_LIMIT_USD, ratelimits; scoring.ts → estimateRunCostUsd, MAX_UNSETTLED_RESERVATIONS; docs/ARCHITECTURE.md → Budget].
- **Alternatives:** soft alerting only; no live AI (replay only).
- **Consequences:** never an outage; custom uploads show "Live AI budget reached" instead of replaying.
- **Evidence:** rate limits 12 runs a minute per workspace, 30 per IP, 10 sign-in attempts per IP [source: wrangler.jsonc]; per-run cap $0.05 [source: agents.json → profile.perRunCapUsd]; spend alert at 80% of cap [source: math.ts; docs/RUNBOOK.md].

### ADR 8 · Two models: main and backup

- **Context:** speed matters for a watched demo; one provider can degrade or reprice.
- **Decision:** at most two models. The main model does screen, extract and theme naming. Each call tries the main model, retries once with the schema errors fed back, then falls back to the backup model, then the dead-letter queue. The backup model's family is also the eval tie-break judge [source: docs/RUNBOOK.md → Model fallback; steps.ts → `ch2.extract`.more; docs/PLAN.md → Models].
- **Alternatives:** one model; a larger pool chosen per call.
- **Consequences:** a simple fallback that is easy to reason about. Gap: the backup model has not been scored as primary, so degraded-mode precision is unknown.
- **Evidence:** price table used for estimates: main $0.10 / $0.40 and backup $0.10 / $0.50 per million input / output tokens [source: scoring.ts → MODEL_PRICES]. Recorded runs average $0.00141 per call [source: computed from data/replays/*.json]. A simulated incident in the history shows 61% fallback during a primary outage [source: agents.json → alerts alr_hist_sl_fallback]. Speed-test tooling exists (`scripts/speed-test.ts`); its results are not checked into the repo.

### ADR 9 · Agent Ops registry and the nine-check standard

- **Context:** dozens of agents built in Claude, Gumloop or code need owners and comparable reporting.
- **Decision:** a registry with a named owner, business owner, purpose, data access, review cadence and baseline minutes per unit; nine checks for every production agent: owner, purpose and success metric, security and data review, evals with a promotion gate, logs and traces, spend cap, human review on high-stakes output, rollback and runbook, current review cadence [source: src/shared/platform-contracts.ts → STANDARD_CHECKS; data/platform/agents.json].
- **Alternatives:** per-team dashboards; a review committee.
- **Consequences:** comparable hours-returned and cost across agents; overdue reviews surface automatically. Baselines are registered assumptions.
- **Evidence:** Signal Loop 9/9 (two records illustrative); the simulated RFP agent fails the evals check ("Spot-checks only") [source: agents.json → standard].

### ADR 10 · POC on Cloudflare, production on Neon, Vercel and Trigger.dev

- **Context:** the POC had to be deployed, gated and cheap to run for a week; production needs managed Postgres, observability and scale.
- **Decision:** POC: one Worker (gate, API, SPA, pipeline, platform), D1, Vectorize, R2, KV and Workflows [source: wrangler.jsonc; docs/ARCHITECTURE.md]. Production: Vercel (Next.js), Neon Postgres with pgvector, Vercel AI SDK with direct provider keys and provider-owned billing, Trigger.dev for long-running jobs, Render for streaming speech-to-text workers, dlt for ingestion from the recorder and CRM if and when it is needed, ClickHouse with dbt only once analytics volume justifies it, strict TypeScript throughout [source: src/narrative/scenes/Production.tsx; src/web/pages/WriteUp.tsx → STACK; docs/PLAN.md → Production stack].
- **Alternatives:** build directly on the production stack; stay on Cloudflare.
- **Consequences:** a port of adapters, not logic; the eval suite is the parity contract. The production stack is a design, not a port yet.
- **Evidence:** the pipeline core `src/pipeline/run.ts` is runtime-agnostic; contracts are shared Zod (`src/shared/contracts.ts`) [source: docs/ARCHITECTURE.md].

### ADR 11 · Deterministic theme membership

- **Context:** a PM must be able to trust that a theme's members and ARR are reproducible.
- **Decision:** embeddings plus nearest neighbours; join an existing theme at cosine ≥ 0.82, else start a candidate theme; the model only names themes, in one batched call after the run [source: scoring.ts → THEME_JOIN_THRESHOLD; docs/ARCHITECTURE.md → Latency work].
- **Alternatives:** LLM clustering; manual tagging.
- **Consequences:** reproducible membership; themes need history, so day one is thin; no theme-quality eval yet.
- **Evidence:** 15 planted backfill themes, the largest 32 insights from 7 accounts [source: docs/data-review.md]. **Simulated.**

---

## Fallbacks during a live presentation

- **Replay mode:** if live AI is off or over budget, runs replay a recorded real execution at real speed, labelled "replay" [source: docs/RUNBOOK.md → Replay mode].
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
| 54% of v4 insights need a person | details-v4.json | Tune thresholds on champion labels, weeks 3–6 |
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

- **Agent standard:** the nine checks every production agent must pass [source: platform-contracts.ts → STANDARD_CHECKS].
- **Anchor:** a `data-tour="<id>"` attribute the walkthrough spotlights; ids live in `src/tour/anchors.ts`.
- **Auto-route:** final confidence ≥ 0.80 and not a high-stakes type; delivered without review.
- **Backup model:** the second model tier, used after a failed retry and as the eval tie-break judge.
- **Beat:** one → press inside a narrative scene.
- **Branch (path):** one of six routes through chapters 2–3, chosen by the file picked in chapter 1: main, clean, messy, security, negative, privacy.
- **Checkpoint:** the counter shown when leaving a chapter.
- **Dropped:** an insight whose quotes could not be grounded; counted, never shown as fact.
- **Fast path:** the in-request execution of the 10 steps, before any Workflow handoff.
- **Golden file:** a hand-checked file with labelled expected insights; 48 featured files are scored [source: latest.json → files].
- **Grounding:** the code check that each quote exists in the transcript (0.90 or better).
- **Held:** final confidence below 0.55; kept visible, not routed.
- **Hours returned:** Σ(baseline minutes per unit − measured human review minutes), with baselines labelled as assumptions.
- **Main model:** the first model tier; screen, extract and theme naming.
- **Mess level:** 1 clean notes, 2 tidy transcript, 3 natural, 4 raw speech-to-text, 5 chaos (Slack, forwarded email, partial) [source: docs/PLAN.md §5].
- **Owner link:** a sign-in URL that sets the owner cookie; treat as a secret.
- **Promotion gate:** the rule set a candidate prompt must pass to ship [source: scoring.ts → PROMOTION_GATE].
- **Redaction token:** a reversible placeholder such as `[PATIENT_1]` that replaces a personal value before any model call.
- **Replay:** a recorded real execution played back at real speed, labelled on screen; costs nothing.
- **Review:** final confidence 0.55–0.80, or any high-stakes item; waits for a person.
- **Screen:** the cheap first model call: actionable, language, injection suspected.
- **Signed link:** a 7-day access link (`?k=…`), revocable by its `jti` [source: src/worker/gate.ts].
- **Theme:** a group of similar insights across accounts (cosine ≥ 0.82), named by the model.
- **Workspace:** a viewer's private copy of the sample data; edits never reach other viewers.
