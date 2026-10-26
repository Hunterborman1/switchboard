> **Historical.** The plan written before the build (v2, with the v3 Agent Ops addendum). The code and
> [README](../README.md) are the source of truth where they differ; this file is kept because the
> walkthrough cites its reasoning.

# Signal Loop: build plan (v2)

Invoca take-home, final round for AI Operations Lead. **Option 3: the "Feedback Loop" Architect.**
Live at `https://repos.hunterborman.com/repo/invoca`, behind a password (provided separately) or a signed link that expires after 7 days.

Status: **plan v2, awaiting review.** Nothing is built, provisioned or deployed yet. The OpenRouter management key is saved in `.env`, which git ignores.

What changed from v1:
- The presentation is now an **interactive walkthrough** with its own design system.
- The product runs on **HB Systems, re-themed in Invoca's colours**, and borrows heavily from an earlier operations console.
- At most **two models**, picked for speed.
- A **$15 viewer spend cap** that switches the system to replay mode rather than breaking it.
- A **$20 build/test budget**.
- **Full test coverage** of every walkthrough branch and every data file.

---

## 1. The experience in one paragraph

The presentation is a walkthrough that runs on the real system. Short narrative "scenes" frame the problem: where feedback gets lost, the people involved, current state, future state.
Then the viewer steps into the product and *does* the work, chapter by chapter:
1. Open the file picker and choose a call. One file is highlighted for the walkthrough, but any file can be picked, and each choice leads somewhere different.
2. Watch it run through the real pipeline.
3. Approve an insight in the review queue.
4. See it routed to the right owner.
5. See it join a theme.
6. Close the loop back to the CSM.
7. Look at the evals.

It should feel like a well-made game (objectives, checkpoints, branching choices with visible consequences, and a scorecard at the end) while staying calm and professional.
At the end, everything unlocks and the panel can use the whole system themselves.
Hunter presents it live (about 25 minutes), and the panel can replay it on their own from the link.

---

## 2. Two design systems, kept apart on purpose

| Layer | System | Look | Used for |
|---|---|---|---|
| **Narrative** (new) | **Signal Loop Narrative** (`src/narrative/`) | Editorial dark: Invoca's black-green `#0A231E`, one bright lime/mint accent (`#8EE58E` / `#D1FFD1`), Instrument Serif for display, Inter Tight for body, JetBrains Mono for figures. Motion is slow and deliberate (500–700 ms fades and blur reveals, numbers that count up, a camera "dolly" into the product). | Opening scenes, chapter cards, coaching callouts, the HUD, the scorecard, closing scenes |
| **Product** | **HB Systems + an Invoca theme** (`src/system/` + `src/theme/invoca.css`) | HB Systems components and tokens, with the colour values replaced by Invoca's palette. Light surfaces, Inter, quick functional motion (150–300 ms). | The real, working system |

The contrast is the point: the story layer is dark and cinematic, and the product it opens onto is light, dense and real. The viewer always knows whether they're being *told* something or *doing* something.

### The Invoca theme for HB Systems
The values come from invoca.com's live CSS. Their own button green fails WCAG with white text, so the brand colour is darkened to pass. Only the `--cn-*` values change; the token names stay the same, so every HB component picks up the theme with no further changes.

| Token | Value | Notes |
|---|---|---|
| `--cn-green` (brand) | `#008463` | White text on it: 4.69:1, passes AA |
| `--cn-green-deep` (hover) | `#006B51` | 6.5:1 |
| `--cn-green-mid` (sidebar, inverse surface) | `#0A231E` | 16.5:1. The sidebar uses Invoca's darkest green. |
| `--cn-green-soft` / `--cn-sage` | `#00A87F` / `#D1FFD1` | Decorative fills. `#00A87F` is used only behind dark text. |
| `--cn-mist` / `--cn-wash` / `--cn-wash-line` | `#F2F5E4` / `#F9F9F6` / `#E3E4E1` | Invoca's warm "sand" neutrals |
| Status colours | success `#2E7D32`, warning `#B45309`, danger `#CF2519`, info `#016FA8` | Kept separate from brand so status never reads as branding |
| Charts 1–6 | `#00A87F` `#004030` `#5E74E3` `#016FA8` `#858538` `#7C4DCC` | |

- Leftover green-tinted shadows in HB are corrected.
- Fonts: Inter, as HB uses. Invoca's GT America is a paid font, and Inter is close.
- There's no Invoca logo anywhere. The lockup reads "Signal Loop · prepared for Invoca" with HB's mark.

---

## 3. What we borrow from an earlier console
Patterns from an operations console I built before, rebuilt here for this product: a collapsible
shell with nav badges, page headers that say how fresh the data is, provenance from transcript to
delivery, a step timeline, sortable data tables, honest empty states, and an audit trail with
before and after.

**UX rules carried over:**
- Colour is only used for meaning.
- A count is never shown without its reason.
- Every percentage shows its denominator.
- Every chart links to the records behind it.
- IDs are monospace and copyable.
- Disabled controls say why they're disabled.
- Filters live in the URL.
- Acknowledging something is not the same as resolving it.
- A partial failure reads as a failure.

---

## 4. The walkthrough

### Engine (custom; about 400 lines)
I'm building it rather than using a library. Shepherd and Intro.js are AGPL, and none of the MIT libraries handle waiting for an action, branching and narrative chapters together.
- **A step machine:** `{ id, chapter, target, copy, waitFor: event | predicate | apiState, next: id | (state) => id }`.
  Steps move forward when the viewer **does** something (clicks the real control, or a run finishes), not on a "Next" button. Narrative scenes are the exception.
- **Spotlight:** a single SVG mask cutout that springs between targets (Motion). Callouts are placed with Floating UI `autoUpdate`, so they stay attached through resizes and scrolling.
- **Accessibility:** focus is trapped in the callout and returned afterwards, every step is keyboard-operable, and there's a full `prefers-reduced-motion` fallback.
- **State** lives in the URL plus `sessionStorage`: `?tour=ch2.ground&path=messy`. Refreshing keeps your place, and Hunter can deep-link to any chapter during Q&A.

### Game mechanics (professional versions only)
- **Objective HUD:** a small fixed panel, e.g. "Chapter 2 of 7 · Objective: find the quote that failed grounding", with a thin progress bar.
- **Chapter rail:** jump to any chapter, skip ahead, or "Exit to free explore". The viewer is never trapped.
- **Doing, not watching:** the real UI with the spotlight on. The real API runs underneath.
- **Choices with consequences:** the file you pick changes the path, and the HUD tracks "Scenarios explored: 2 / 6".
- **Hints:** after about 6 seconds without input, a soft pulse appears on the target. It never blocks.
- **Checkpoint moments:** at the end of each chapter, the metric that changed counts up ("+1 insight routed · 0 minutes of CSM admin").
- **Narration:** callouts under 20 words that say *why*, with "How this works ›" for detail.
- **Scorecard at the end:** what you did and what the system did ("3 calls processed · 1 injection caught · 1 hallucinated quote rejected · 4 insights routed · $0.004 spent").
  Then "Explore freely" unlocks everything.
- **Off-limits:** confetti, XP points, badges, and any step transition longer than 400 ms.

### The script (~25 min, presenter-driven; ~15 min self-guided)
| # | Part | Layer | What happens | Time |
|---|---|---|---|---|
| 0 | **Cold open** | Narrative | A waveform resolves into the line "Every call is a signal." | 0:30 |
| 1 | **Where feedback gets lost** | Narrative | Feedback particles leave customer calls and most vanish. A counter reads "4 of 10 reach an owner" (labelled as an assumption). | 1:30 |
| 2 | **Why this option** | Narrative | Invoca turns *its customers'* calls into signals; this does the same for *Invoca's own* CSM calls. | 0:45 |
| 3 | **Jobs to be Done** | Narrative (interactive) | Four persona cards (CSM, PM, VP Product, Sales/Competitive/Support). Click one to flip it and see its job, struggle and success measure. Includes the emotional job: be the advocate, not the stenographer. | 2:30 |
| 4 | **Current → future state** | Narrative | An animated swimlane shows leaks at each handoff, then **morphs** into the future state as the leaks seal and the loop closes. | 2:30 |
| 5 | **Ch1 · A call comes in** | Product | Objective: "Bring in today's call." Click **Upload** to open a file picker over the synthetic library (§5). `C-1042 · Brightline Home Services · QBR` is highlighted. **Branching starts here** (below). | 1:30 |
| 6 | **Ch2 · Watch it think** | Product | The live Run view. Steps light up from real `run_steps` rows. PII redaction blurs in. Evidence spans highlight in the transcript as they're grounded. The spotlight stops on Ground with the real count (14 of 14, word for word, on the recorded run). Grounding is the seatbelt: a "See a rejected quote" beat appears only when a real run has a dropped quote. | 3:00 |
| 7 | **Ch3 · Human in the loop** | Product | Review queue. Objective: approve one item and edit one with keyboard `A` / `E`. The SeverityChip shows *why* each item is there. The edit is saved as labelled data. | 2:00 |
| 8 | **Ch4 · Right owner, right channel** | Product | Routing. See the Jira ticket and Slack message previews. **Choice:** change a rule (e.g. send `pricing_objection` on accounts over $250k ARR to the VP) and watch the Sankey re-flow. | 1:30 |
| 9 | **Ch5 · Patterns, not anecdotes** | Product | The insight joins a theme: "Offline conversions lag in Google Ads", with 7 accounts, $1.4M ARR, a trend line and representative quotes. | 1:15 |
| 10 | **Ch6 · Close the loop** | Product | The PM moves the Jira item to *Shipped*. The CSM's inbox gets a notice ("Your feedback from Brightline shipped") with a draft note to the customer. | 1:00 |
| 11 | **Ch7 · Prove it** | Product | Evals: precision and recall per type and per mess level, then the cost and latency ledger. **Choice:** "Promote prompt v5?" leads to **PROMOTION BLOCKED** on precision (88.7% → 59.7%: under the 85% bar and a 28.9-point regression). Cost and p95 are worse too; they are shown, not gated. | 1:30 |
| 12 | **Earning trust: rollout** | Narrative | Phased timeline (§8): shadow → champions → team → expand. Trust mechanics. "Additive, not replacement." | 2:15 |
| 13 | **The next 12–18 months** | Narrative | A horizon line that starts after the rollout: every call by default from month 3 (after shadow and champions; today's average cost per call makes it affordable), in-call capture from month 6, multi-agent specialists (extractor, critic, router), drafted PRDs, and feeding Invoca's own Signal AI. | 1:30 |
| 14 | **POC → production** | Narrative | The Cloudflare pieces slide into Neon / Vercel / AI SDK / Trigger.dev / ClickHouse / dbt / dlt / Render. | 0:30 |
| 15 | **Scorecard + free explore** | Both | The recap card, then the full system unlocks. | 0:30 |

**Total: about 24:45.** Six **Q&A backup scenes** can be deep-linked: cost model, security/PII, failure drill-down, build vs buy (Gong / Productboard / Enterpret), success metrics, and what I'd do differently.
**Presenter view** (`/presenter`): synced over `BroadcastChannel`, it shows notes, the elapsed timer against target per part, the current and next step, and a "jump to backup" list.

### Branches (Chapter 1's file choice changes Chapters 2–3; all paths rejoin at Chapter 4)
| Picked | Path | What the viewer sees that's different |
|---|---|---|
| ★ `C-1042` Brightline QBR (level 3, recommended) | **Main** | The full story: 4 insights, 1 grounding drop, 1 item sent to review |
| A level-1 clean notes file | **Clean** | A fast, clean run. The narrator says "Easy. Real calls aren't like this." and offers to try a messy one (the main path), or carry on. |
| A level-4 or level-5 messy file | **Messy** | Raw speech-to-text, a Slack export or a forwarded email thread (the intro names which). The model quotes the garbled text verbatim, so quotes usually ground exactly; noise shows up as lower confidence and more items routed to review. Shows the system staying honest under noise. |
| `Injection attempt` | **Security** | The screening step flags it, the injected instruction is shown as inert data, the output schema is unaffected, and an audit row is written. |
| `Friendly check-in` (nothing actionable) | **Negative control** | Zero insights. A calm "Nothing actionable" empty state. The point: it doesn't invent work. |
| `PHI-heavy` healthcare call | **Privacy** | A redaction reveal: before/after toggle, with tokens like `[PATIENT_1]` and `[DOB_1]`. Only redacted text ever reached the model. |

Each path has its own narration and its own objectives, and counts toward "Scenarios explored". After Chapter 3 the HUD offers "Try another file" (loop back) or "Continue".

### Free explore (after the scorecard, or via "Exit to free explore" at any time)
Every page of the system becomes available with no restrictions: new runs (live while budget remains), editing rules and thresholds, review, themes and evals.
A small "Resume walkthrough" pill stays in the corner.

---

## 5. Synthetic data: an Invoca-shaped world, from clean to chaotic

### The world (fictional names only)
- **14 accounts** across Invoca's actual verticals (healthcare, home services, auto, insurance, financial services, telecom, solar), each with:
  - Tier, ARR and seats.
  - Products owned (Call Tracking, Signal AI, PreSense, QM, AI Agents).
  - Renewal date, health and owning CSM.

  For example: *Brightline Home Services*, *Meridian Health Partners*, *Atlas Auto Group*, *Keystone Mutual*, *Northwind Telecom*, *Harbor Federal CU*, *SunPeak Solar*.
- **People:**
  - 6 CSMs.
  - A PM per product area.
  - A VP Product.
  - Competitive Intel, Pricing, and Support-escalation leads.
- **Product areas:**
  - Call Tracking & Attribution.
  - Signal AI (Studio, Discovery).
  - PreSense.
  - Integrations (Salesforce, Google Ads, Adobe, Five9, Genesys).
  - Quality Management.
  - AI Agents (Voice and Messaging).
  - Billing & Pricing.
- **Competitors mentioned:** CallRail, Marchex, CallTrackingMetrics, WhatConverts. Gong comes up where its features overlap.
- **Pain points:**
  - Late offline-conversion sync to Google Ads.
  - PreSense data dropped on Genesys transfers.
  - Signal AI mislabelling spam calls.
  - Add-on pricing friction at renewal.
  - HIPAA redaction gaps.
  - Salesforce field mapping.

  These are inferred from public material and labelled as such in the write-up.

### The file library (what the file picker shows)
Files are grouped in folders by week, as an export from a call recorder would look: `Calls / Week 43 / …`.
Each file has a real-looking name (`2026-10-21_Brightline_QBR_transcript.vtt`, `northwind-notes-oct.md`, `fwd_ RE_ renewal concerns.eml`), a size, a date and a format icon.
Mess levels are **not** labelled on the files themselves. The walkthrough reveals them after you pick, so the choice feels real.

| Level | Formats | What makes it hard | Files |
|---|---|---|---|
| **1 Clean** | Structured CSM notes template (`.md`) | Nothing; it's the baseline | 8 |
| **2 Tidy** | Speaker-labelled transcript (`.vtt` / `.txt`, timestamps) | Several insights in one call | 8 |
| **3 Real** | Natural transcript | Filler words, tangents, small talk, insights that span several turns | 8 |
| **4 Messy** | Raw speech-to-text output | Homophones ("in vocal", "call rail", "pre sense"), speaker swaps, `[crosstalk]`, sarcasm, hedged complaints | 8 |
| **5 Chaos** | Mixed: Slack-style shorthand, a forwarded `.eml` thread, a partial transcript | No structure, abbreviations, context you have to infer | 8 |
| **Edge** | Nothing-actionable ×2, injection ×2, PHI-heavy ×2, non-English snippet ×1, duplicate re-upload ×1 | Robustness | 8 |

That's **48 featured and golden files**, all hand-checked.
On top of those, there are about **220 backfill transcripts** spread over 6 weeks. They're run through the *real* pipeline, so the themes, trends and dashboards look lived-in, and every historical insight comes from a real run.

### How it's generated
1. **Scenario cards** (typed TS). Each card holds the account, attendees, call type, and *planted ground-truth insights* with the quotes meant to carry them. This is where the golden labels come from.
2. **The LLM writes the clean version** from the card (build key, fast model).
3. **A seeded, deterministic corruption pass** in TypeScript takes it to the target level. It adds:
   - Filler words and false starts.
   - Homophones of product and competitor names.
   - Label swaps near turn boundaries.
   - Crosstalk and inaudible markers.
   - Dropped punctuation and wrong casing.
   - Timestamp drift.
   - Text spliced in from other formats (for level 5).
4. **Golden quotes are found again in the corrupted text.** If a quote can't be found, the build fails, so the evals stay honest.
5. **Review:** a dedicated agent reads every featured file for realism (tone, Invoca accuracy, believable CSM behaviour), and the spot-check results are written up for you.

---

## 6. The system (fully functional, tested on every file)

### Pipeline: a Cloudflare Workflow with 10 durable steps
*As built:* live runs execute on a fast path inside the request's `waitUntil` and hand off to this Workflow (resuming after the last completed step) when a step throws or the run runs long. See [ARCHITECTURE.md](ARCHITECTURE.md).
Every step writes a `run_steps` row with status, timing, input and output hashes, model, tokens and cost. **The UI and the walkthrough animate from those rows.** What the panel watches is the real execution.
1. **Ingest:** store the raw file in R2, hash it (SHA-256), and skip it if the hash has been seen before (idempotent).
2. **Normalize:** detect the format (vtt, txt, md, eml, chat dump), parse speakers and turns, and assign turn IDs.
3. **Redact PII/PHI:** regex plus validators, swapping in reversible tokens. Only redacted text is sent to the model.
4. **Screen** (fast call): is it actionable, what language is it, is an injection suspected?
5. **Extract** (structured output, Zod schema to JSON schema, `require_parameters: true`): each insight carries `type`, `summary`, `product_area`, `severity`, `sentiment`, `evidence[]` (verbatim quote and turn ID), `confidence` and `rationale`.
6. **Ground (code, not the LLM):**
   1. Normalize the text.
   2. Try an exact substring match.
   3. If there's no exact match, slide a window and score with `fastest-levenshtein`. A score of 0.90 or more passes.
   4. A quote that doesn't ground means the insight is **dropped and counted as a hallucination**.
7. **Score + gate:** final confidence = model confidence × grounding score × type prior × account context.
   - 0.80 or above routes automatically.
   - 0.55 to 0.80 goes to review.
   - Below 0.55 is held (still visible).
   - A sev-1 `bug` or any `churn_risk` **always** goes to review.
8. **Theme:** embed with Workers AI bge, find the nearest neighbours in Vectorize, and join a theme if similarity is high enough, otherwise start a candidate theme. Membership is deterministic; the LLM only *names* themes.
9. **Route:** an **editable rules table** (type × area × severity × ARR band → owner and channel). Routing is never decided by the prompt. If nothing matches, it goes to triage.
10. **Deliver + close the loop:** write to the mock Slack, Jira and Linear destinations and the weekly digest, with receipts and retries. When a status changes, the CSM is notified.

*As built:* review is a state change, not a suspended Workflow. A run with items to review is parked as `awaiting_review`; nothing on it routes until someone approves, edits or rejects, and that action routes the insight and writes an audit row (`src/worker/review.ts`).
Edits are stored as labelled data with an audit diff, with before and after, as an audit log.

### Models (two at most, chosen for speed)
- **Primary:** `xiaomi/mimo-v2.6-pro` ($0.43 / $0.87 per million tokens). It does screen, extract and theme naming.
- **Secondary:** `anthropic/claude-haiku-5.5` ($0.10 / $0.50). It's the fallback when the primary fails or is slow, and it's the independent judge for evals (a different model family checking the primary).
- **Speed test first** (step 1 of the build). Run MiMo V2.6 Pro, Haiku 5.5 and Kimi K3.1 Pro on 10 golden files, measuring time to first token, total time and F1. The fastest model at equal accuracy becomes primary.
- **Privacy:** every call sends `provider: { data_collection: "deny", require_parameters: true }`, sorted by throughput.
- **In the walkthrough:** models are described as "fast tier, independent judge" along with the measured speed, cost and F1. The Settings page shows the model IDs.

### Prompts
- **System prompt:**
  - The role.
  - A taxonomy with definitions **and counter-examples** (e.g. a complaint about a rep is not a product bug).
  - The rule "no quote, no insight".
  - An explicit "return an empty list if nothing applies".
  - Transcript content wrapped as data with delimiters.
- **Few-shot examples:** three short ones (clean, messy, negative control).
- **Account context:** tier, ARR band and renewal date are injected, so severity reflects business impact.
- **One prompt per job:** screen, extract and theme naming are separate prompts.
- **Versioning:** prompts live in `src/shared/prompts/*.ts` with a version number, and `prompt_version` is stored on every insight. Evals run per version, which is how the promotion gate works.

### Error handling (visible in the UI, not just claimed)
- **Schema failure:** re-parse with Zod, then retry once with the errors fed back, then switch to the secondary model. If all of that fails, the item goes to the **dead-letter queue**, which appears on the Health page.
- **Provider errors (429, 5xx, timeouts):** step-level retries with backoff, a timeout on every call, and model fallback.
- **Other failure modes:**
  - **Hallucinated quotes** are dropped and counted.
  - **Prompt injection** is flagged, and output stays schema-only (the model can't take actions).
  - **Duplicates** are blocked by hash idempotency and merged into themes.
  - **Empty states** come in three kinds.
  - **Partial failures** read as failures.

### Spend limits: viewers get $15, then it switches to replay mode
- **Runtime OpenRouter key** (`signal-loop-runtime`, created from the management key):
  - Hard limit of **$15** at OpenRouter, the provider-side backstop.
  - Expires when the signed link does, plus a little margin.
  - Stored only as a Wrangler secret.
- **In-app budget ledger** (D1 `ai_calls`): every call records `usage.cost`.
  - Before each run, the system checks spend so far plus the estimated maximum cost of the run.
  - Once the total reaches **$15**, live AI turns off: an atomic switch in D1, plus a flag cached in KV.
- **Replay mode, not an outage.** Every featured file has a **recorded real run** (the actual `run_steps`, outputs and timings from a live execution). Once the budget is used up, or if a live call fails or runs slow, runs replay from that recording at real speed, labelled "Replay of a recorded live run".
  So the walkthrough works for the whole 7 days, whatever the budget does.
  Uploads of new custom files show a clear "Live AI budget reached" state, so a disabled control always says why.
- **Visibility:** a budget gauge (UIS LadderGauge) on the Health page shows "Live AI budget: $3.12 of $15.00 used · 214 runs".
- **Abuse limits:** a per-session rate limit (Workers Rate Limiting binding) and a per-run token cap.
- **Build/test key** (`signal-loop-build`): **$20** limit, expires in 14 days, stored in `.env` only. It's used for data generation, the speed test, evals, backfill and recording replays.
  Expected spend: about $3–6, which leaves room for re-runs.

### Production stack (stated in the walkthrough; the POC runs entirely on Cloudflare)
| Concern | POC (deployed) | Production |
|---|---|---|
| Web + API | Worker (Hono) + static assets (Vite, React, TS) | Vercel (Next.js) |
| Orchestration | Cloudflare Workflows | Trigger.dev |
| State | D1 (+ KV flag) | Neon Postgres |
| Similarity | Workers AI embeddings + Vectorize | pgvector on Neon via AI SDK |
| Raw evidence | R2 | Object storage |
| LLM | Vercel AI SDK + OpenRouter provider | Same, via direct BYOK |
| Analytics at scale | D1 rollups | ClickHouse + dbt marts |
| Ingestion | Upload + library | dlt (Gong, Zoom, Salesforce, Zendesk) |
| Long-running stateful work | — | Render (e.g. streaming speech-to-text workers) |

All of it is strict TypeScript. The AI SDK on Cloudflare Workers: I'll use whatever versions are current when I set up the repo. The live npm check showed `ai@7` and `@openrouter/ai-sdk-provider@3`.
Structured output goes through `generateText({ output: Output.object })` and is always re-validated with Zod.

---

## 7. Testing: "100% functional on all data"
| Layer | Tool | What's covered |
|---|---|---|
| Unit | Vitest | redact, ground (exact and fuzzy match, rejecting near misses), scoring and gating, routing rules, clustering, the corruption pass (deterministic for a given seed), file parsers (vtt, txt, md, eml, chat), signed-link tokens, password gate, budget ledger maths |
| Worker integration | `@cloudflare/vitest-pool-workers` (local D1, R2, Workflows) | Full pipeline with a mocked model, review actions routing parked insights, idempotent re-upload, DLQ path, budget kill switch → replay fallback, every API route's auth |
| **All-data run** | `npm run verify:data` (build key, real models) | **Every one of the 48 files runs through the real pipeline**: no failures, grounding passes, golden labels are met within thresholds. Results are written to a report you can read. |
| Evals | Vitest + custom scorers + Haiku judge | Precision and recall per type and per level, routing accuracy, negative-control false positives, injection resistance, p50/p95 latency, cost per call, promotion gate |
| End-to-end | Playwright | **Every walkthrough branch** (all 6 file paths through to the scorecard), chapter jumps, deep links, refresh mid-tour, free-explore on every page, keyboard-only run, reduced motion, budget-exhausted mode, mobile at 390px, presenter-view sync |
| Auth matrix | Playwright against the deployed URL | No cookie → login. Wrong password → 401. Right password → in. Valid link → in, with `k` stripped from the URL. Expired, tampered or revoked link → rejected. API without auth → 401. Other `/repo/*` sites unaffected. |
| Visual QA | Playwright screenshots + Chrome review | 1440, 1024 and 390 widths. Then a design-critique agent pass, a code-review agent pass and a security-review agent pass on the gate. |

---

## 8. The human lens (content for the rollout scenes)
- **Discovery (week 0):**
  - Shadow 2 CSMs.
  - Run a 2-week time study to replace the labelled assumptions with real numbers.
  - Co-design the taxonomy *with* CSMs and PMs.
- **Shadow mode (weeks 1–2):** the system runs silently and CSMs compare its output with their own notes. Nothing is routed automatically.
- **Champions (weeks 3–6):** 2–3 volunteer CSMs and 1 PM, with a weekly calibration on what it missed and what was noise.
- **Team (week 7 onward):** automatic routing above the threshold, and the rest goes to review.
- **Trust mechanics:**
  - A quote on every insight.
  - A one-click "this is wrong" button.
  - Precision published weekly.
  - High-stakes items always reviewed.
  - CSMs credited when their feedback ships.
- **"Additive, not replacement":** it takes over the data entry, not the judgement. CSMs keep the relationship and the final call, and the system makes their advocacy visible.
- **Metrics:**
  - Capture rate.
  - Time to owner.
  - Precision of routed items.
  - Percentage of PM decisions that cite evidence.
  - CSM minutes saved.
  - Weekly active reviewers.

---

## 9. Access
A dedicated gate in this Worker, separate from the shared host password.
- **Password:** provided separately, stored as the secret `INVOCA_PASSWORD`. The login page uses the narrative design.
- **Cookie:** `hb_invoca`, an HMAC token.
  - Scoped to `Path=/repo/invoca`.
  - Flags: HttpOnly, Secure, SameSite=Lax.
- **Owner:** `?owner=<OWNER_TOKEN>` (a random secret only the owner holds) sets `hb_invoca_owner`, an HMAC under `OWNER_TOKEN`. *As built:* the shared-host `hb_auth` owner bypass was removed; nothing on the shared host grants access or owner here.
- **Signed link:** `…/repo/invoca/?k=<payload>.<sig>`.
  - The payload is `{aud:"invoca", exp, jti}`, signed with HMAC-SHA256 using `LINK_SIGNING_SECRET`.
  - The signature is checked with a constant-time comparison.
  - The cookie's Max-Age is capped at `exp`.
  - A redirect strips `k` from the URL.
  - **The link expires 7 days after it's issued**, at the exact timestamp given in the handoff.
  - Revoke one link by adding its `jti` to a denylist, or revoke all links by rotating the secret. The password keeps working either way.
- **Routes:** `repos.hunterborman.com/repo/invoca` and `/repo/invoca/*`. `workers_dev: false`, Vite `base: '/repo/invoca/'`, `noindex`, same security headers as hb-repos.
- The API and AI endpoints are gated and rate-limited.

---

## 10. Repo layout (`hb-assessment`, new repository)
```
src/
  narrative/   Signal Loop Narrative design system: tokens, type, motion, scene components
  system/      HB Systems, vendored (components + tokens, unmodified)
  theme/       invoca.css: value overrides for --cn-* (the only token changes)
  uis/         ported UIS console components (shell, PageHeader, ProvenanceFlow, ...)
  tour/        walkthrough engine, step scripts per chapter and branch, HUD, scorecard
  web/         routes: hub, walkthrough, app pages, presenter view
  shared/      contracts.ts (Zod), prompts/, taxonomy.ts, scoring.ts
  pipeline/    parse, redact, ground, cluster, route (pure TS)
  worker/      Hono API, gate, signedLink, workflow, ai, budget, replay, db
data/          world (accounts, people, routing), scenarios/, files/ (the library), golden/, replays/
scripts/       provision-keys, speed-test, gen-data, corrupt, verify-data, backfill, record-replays, sign-link, deploy
tests/         unit/, worker/, e2e/
evals/
migrations/
docs/          PLAN.md, ARCHITECTURE.md, speaker-notes.md, RUNBOOK.md, data-review.md
```

---

## 11. Build sequence and subagents
1. **Me: foundation, deployed on day one.**
   - Repo, Vite, Worker/Hono and Wrangler setup.
   - Check D1 quota; create D1, R2, KV, Vectorize and Workflows.
   - Gate and signed link.
   - Vendor HB Systems and apply the Invoca theme.
   - Shared contracts.
   - Provision the two OpenRouter keys.
   - Run the **speed test** to lock the models.
   - Deploy an empty, gated shell to prove routes and auth.
2. **Parallel agents.** Each owns its own folders and they build against the shared contracts:
   - **A. Data:** the fictional world, scenario cards, generation, corruption, golden labels, the file library.
   - **B. Pipeline + backend:** schema, Workflow, AI layer, grounding, themes, routing, deliveries, budget, replay, APIs.
   - **C. Product UI:** port the UIS components and build every page on the Invoca-themed HB Systems.
   - **D. Narrative + walkthrough:** the new design system, the scenes, the tour engine, all branches, the HUD, the scorecard, the presenter view, the speaker notes.
3. **Integration:**
   - Run every file (`verify:data`).
   - Evals and prompt tuning.
   - Backfill about 220 transcripts.
   - Record replays.
   - Put the real numbers into the scenes.
4. **Hardening:**
   - The full Playwright suite.
   - Design, code and security review agents.
   - A "skeptical panelist" agent that writes the 20 hardest questions; answers go into the backup scenes and notes.
   - Fix everything they find.
5. **Launch:**
   - Deploy and run the auth matrix against production.
   - A live end-to-end run.
   - Check logs and the cost ledger.
   - Confirm the rollback path works.
   - Issue the signed link and record a backup video of the presenter run.
   - Hand off.

**Handoff package:**
- The URL, password and signed link (with its exact expiry).
- Speaker notes.
- The backup recording.
- Test and eval reports.
- An honest list of anything that isn't 100%.

---

## 12. Decisions still open
1. **GitHub:** create a private repo for this project and push to it? (Recommendation: yes.)
2. **repos.hunterborman.com landing page:** list it there? (Recommendation: no, keep it unlisted.)
3. **The name "Signal Loop":** keep it?
4. **Presentation direction:** I recommend the editorial dark narrative layer (§2). The alternative is light, paper-style editorial on Invoca's sand tones.

---

## v3 addendum: Agent Ops, the platform this agent lives in

The role is as much about *operating* agents as building them. That means logging and observability, maintenance after launch, knowing when and how often people actually use an agent, and showing how much time and money it returns. So the build now has two products:

- **Agent Ops** (`/ops`) is an internal AI-operations platform for executives and the AI team. It has:
  - **Overview:** the executive view, covering hours returned, value against AI cost, ROI and adoption across all agents, plus a list of what needs attention.
  - **Registry:** every agent has a named owner, purpose, review cadence and data access.
  - **The agent standard:** 9 checks plus a review calendar.
  - **Usage:** who uses each agent, when and how often, with retention and live viewers.
  - **Logs and traces:** structured logs, plus a span waterfall per run.
  - **Reliability:** SLOs, error budgets and alerts.
  - **Cost.**

  It has its own D1 database (`invoca-agent-ops`). It uses HB Systems in Invoca colours, with a deep-navy rail so it reads as a separate product from Signal Loop.
- **Signal Loop** is one registered agent. It reports real logs, spans, usage events and work units through `src/worker/platform/sdk.ts`. The other 7–9 agents (Claude, Gumloop and Databricks builds) are simulated, and every panel is labelled **Live** or **Simulated**.
- **The walkthrough** gains **Chapter 8, "Operate it"** (~2:30): the executive overview, Signal Loop's registry record and standard, the live usage panel ("that's you"), logs filtered to the viewer's own run, the trace waterfall, and SLOs and alerts.
  The other parts are trimmed to keep the total at about 25 minutes. The rollout scene now covers adoption measurement, reporting hours returned, review cadence and builder enablement.
- **The impact maths is honest:** hours returned = Σ(registered baseline minutes per unit − measured human review minutes). The baselines are labelled assumptions, to be checked against a 2-week time study.
