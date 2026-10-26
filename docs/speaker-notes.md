# Signal Loop: speaker notes

The talk track for the live presentation (10 chapters, about 25:00), what to click, and answers to likely questions.
The presenter view (`/presenter`) shows the same notes per chapter, synced to the main window. The source of truth for the in-app notes is `src/tour/script/notes.ts`; chapter targets are in `src/tour/script/chapters.ts`.

The chapters come in three groups: **Introduction** (1–3), **The platform** (4–8, the real product, with the platform scene at the start of 4) and **Closing** (9–10). Every scene shows everything at once; there is nothing to step through inside a scene.

---

## Pre-flight (10 minutes before)

1. Open the main window at `/repo/invoca/` on the shared screen, full screen, browser zoom 100%. At 1,200 px and wider the scenes show the chapter rail on the left.
2. Open `/repo/invoca/presenter` on the laptop screen. Check it says **Connected** and the step titles update when you press → in the main window. → and ← work in the presenter view too.
3. Reset my workspace (Settings → *Reset workspace*, or `POST /api/workspace/reset`) so the scorecard numbers are only from this session.
4. Check the budget gauge on Usage and health: live AI should have headroom. If it's at the cap, runs replay and say so; that's fine, and I mention it in chapter 8.
5. Run Brightline once in a private window to warm the pipeline. Close it.
6. Have the backup list ready in the presenter view (cost, security, failure, build vs buy, metrics, Agent Ops, what I'd do differently).
7. Close Slack and notifications. Keyboard: → next, ← back. A clicker sending PageDown/PageUp works too. On a scene, a click on the page, Space and Enter don't move on, so a stray click is safe. Esc opens the chapter menu on narrower screens.

**Timing rule:** the presenter timer goes amber when a chapter runs past its target and red at 125%. If I'm more than a minute behind when I reach the Timing step at the end of chapter 4, skip "Try another file" and go straight on to chapter 5 (Human in the loop).

## If they click through on their own

Point them at **the bar along the bottom**: the Guide. In chapters 4–8 it says what each step shows and why, and when it's their turn ("Your turn: press A, or click Approve and send", with "Show me"). **Explore on your own** leaves the presentation and remembers the step; on every screen the Guide then suggests one thing to try; **Resume presentation** goes back to exactly where they left. The chapter title in the Guide opens every chapter of the presentation, and on the scenes the rail (or the top bar's menu on a smaller screen) does the same. On a scene everything is on screen at once; Next (or →) moves on. Nothing is ever covered: the Guide moves out of the way of whatever it points at.

---

## Chapter 1 · Every call is a signal (2:00)

**Click:** nothing: the call, where feedback gets lost and what Signal Loop makes of the sentence are all on screen. Next when done.

**Say:**
> This is a thirteen-minute QBR. Twenty seconds in the middle of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks. Today it probably never reaches the person who makes that call.
> Invoca turns calls into signals for its customers. I built the same loop for Invoca's own customer calls, inside a platform that can run more analyses like it, and Agent Ops to operate it.
> Customers tell CSMs exactly what to build: what's broken, what's missing, what a competitor just offered them.
> Follow 100 pieces of it. 72 get written down, 55 get shared beyond the CSM, 40 reach someone who can act. The rest is in a notes field, a Slack thread or someone's memory.
> "40 of 100" is an assumption, and it says so on screen. The first thing I'd do in the job is a two-week time study with two CSMs to replace it with a real number.
> The bottom row is what Signal Loop makes of that one sentence: what it is, who hears it, the evidence, and why it matters now.

## Chapter 2 · Jobs to be done, today and tomorrow (2:30)

**Click:** nothing. The four people are on top, today and tomorrow are below. Next when done.

**Say:**
> Before any architecture: who uses this, and for what. Four people. The CSM wants it captured without retyping it. The PM wants evidence grouped by theme, with ARR attached. The VP wants an honest view across every account, before the renewal. Sales, competitive and support leads want it in their channel the same day.
> The job underneath all four is the CSM's: be the advocate, not the note-taker. If it doesn't make CSMs look good, they stop feeding it.
> Today the work goes like this. The customer says it on a call. Maybe the CSM writes it down. Maybe it lands in Slack. Then it's lost.
> With Signal Loop: the call comes in, Signal Loop reads it, the insight carries a checked quote, it lands with the owner in their own tool, and the CSM hears when it ships.

---

## Chapter 3 · What I built, and why (2:30)

**Click:** point at the GitHub link under the headline, then read left to right. Next.

**Say:**
> I built this from scratch in 48 hours. The code is on GitHub, linked under the headline.
> All of the AI is built and works. What goes in and what comes out really runs. The connections and the data are simulated, because I have no access to Invoca's systems and a demo must never message real people. The screen says so wherever it matters.
> Three options. I chose the feedback loop: it's the work Invoca's product does, pointed at Invoca's own calls. The RFP Responder is a crowded market, and a wrong answer is a compliance risk. The Churn Predictor needs believable fake data from three systems. Both can become analyses on the same platform later.
> How it's built: plain TypeScript, not n8n, Gumloop or Zapier, because checking the AI needs code. Three model roles, picked by measuring. One Cloudflare Worker for now. The production design comes in chapter 10.

---

## Chapter 4 · A call comes in (4:30)

Three parts: the platform scene, bringing the call in, and watching it run. The Guide appears along the bottom with the first product step.

### The platform scene

**Click:** nothing to step through: all four columns are on screen. Walk them left to right, then **Open the product**.

**Say:**
> One step back before the product. Signal Loop runs inside Switchboard.
> In: any conversation, from where it already lives (Gong, Zoom, Gmail, Slack, Google Drive) or any file you upload.
> Decide: a fast decision model reads it first, in about a second (0.9 s median in the speed test, `docs/reports/decision-models.md`). What is it, which analyses apply, is it safe to read. Later it gives a second opinion at the review gate.
> Analyse: Signal Loop is the one I built for this brief. Follow-ups, renewal risk, escalations, compliance review and call coaching are on the roadmap, and the screen says "Not built".
> Out: the right people in the tools they already use, each tagged by their own handle. The connectors are simulated here, and the product says so.

**Transition:** "Let me show you the real thing. The bar along the bottom walks you through it."

### Bring in the call

**Click:** *Browse conversations* → pick the suggested **Brightline QBR** (or let a panelist choose) and **Open** → **Process conversation**.

**Say:**
> Now the real system, with the Guide along the bottom. Bringing the call in is the only manual step, and in production it goes away: connectors pull calls from whichever recorder and CRM the CS team uses (Gong, Zoom, Salesforce and Zendesk are examples).
> Mess levels aren't labelled on purpose. Brightline is the main path; any file works and each one tells a different story.

If they pick something else, name the branch:
- **Clean notes:** the easy baseline.
- **Messy files:** raw speech-to-text ("in vocal", "call rail", crosstalk), a Slack export or a forwarded email thread. The Guide names which. Watch it stay honest.
- **Injection attempt:** someone planted an instruction in the transcript.
- **Friendly check-in:** the right output is nothing.
- **PHI-heavy healthcare call:** watch what reaches the model.

### Watch it run

**Click:** Next as each step lands (5 steps on the main path). On the Timing card, read the two numbers out loud. Then Next, or *Try another file* if we're ahead. *See a rejected quote* appears only when some real run has a dropped quote; if it's there, click it, then **Back to my run**. If it isn't, don't promise one.

**Say:**
> This is running live, right now. Watch the clock: a thirteen-minute call takes a few seconds. (If the Guide says replay, it's a recorded live run at its recorded speed, and the Timing card says so.)
> Triage first, on the decision model: what it is, which analyses apply, whether anyone is steering the AI. Names and health details were removed before any model saw a word.
> *(On the quotes)* This is the moment. Every insight carries a verbatim quote, and code checks it against the transcript. Read the count off the Guide: fourteen of fourteen, word for word, on the recorded Brightline run. If the model had stitched Dana's interrupted sentence into one tidy quote, code wouldn't find it and the insight would be dropped. On the promoted prompt every eval quote matched, 275 of 275. The quote check is the seatbelt.
> *(Only if See a rejected quote is on screen)* Read the Guide: it names the run and the quote code couldn't find, and the closest span's score, under 0.90. The insight was dropped and counted, never shown as fact.
> The gate decides who sees it next, and on a live run the decision model gives a second opinion. 0.80 and up routes itself; anything high stakes goes to a person.
> *(On the Timing card)* And why it's this fast, from the real timestamps: triage ran alongside extraction, not before it, and the code steps (the quote check, scoring, routing, delivery) took milliseconds. The second opinion overlaps the theme lookups. Every call is in Agent Ops: that link opens this run's trace.

On one live Brightline run (an example, not a benchmark): triage 1.55 s, extraction 4.94 s started with triage, score and second opinion 1.07 s, 6.09 s end to end, $0.0034 of AI. Read the viewer's own numbers off the card instead.

**Chapter 4 branch extras:** **privacy** → have them switch Before and After; tokens keep meaning, drop identity; **security** → point at the injection flag and the audit row; **negative** → "zero insights, and that's correct"; **messy** → "the model quoted the garbled text verbatim, so it grounds exactly; noise shows up as lower confidence and more review."

## Chapter 5 · Human in the loop (1:45)

**Click:** press **A** on the first item. Press **E** on another; the ring follows the edit form. Change the type or severity (Save stays disabled until a field changes), then **Save and send**.

**Say:**
> The run is parked awaiting review. Nothing on it is routed until someone approves, edits or rejects it, and that action routes it with an audit row. Every item says why it's here: "Score 0.71, below 0.80".
> An edit is saved as labelled data with a before and after, which is how the next prompt gets better.

## Chapter 6 · Right owner, right channel (1:45)

**Click:** edit the **pricing objection** rule: owner VP Product, ARR band over $250k. Next to the Jira preview, then Connections.

**Say:**
> Routing is a table, not a prompt. Ops can read it, change it and audit it.
> The VP wants pricing objections on big accounts. One rule change, no prompt changed, no redeploy, and it only affects your workspace. (The flow chart on the same page shows where today's rules send things.)
> The PM gets a Jira ticket with the quote and the ARR, tagged by their own handle. The tool is simulated; the content, the tags and the receipt are real.
> Connections are simulated too, but routing reads them: disconnect Jira and its rules go to triage. Nothing silently disappears.

## Chapter 7 · Patterns, and closing the loop (1:45)

**Click:** open the highlighted theme. Next once: ARR, trend and quotes are one step. Then move the ticket to **Shipped**, and Next to the CSM's view.

**Say:**
> One complaint is an anecdote. The same thing from seven accounts is a pattern. (Read the account count off the Guide rather than from memory; it names the highlighted card, "Google Ads offline conversions arrive late", with its live insight and account counts. If it says my call's insight just joined it, say that too.)
> Membership is decided in code, embeddings and a similarity threshold. The model only names it.
> ARR at stake, counted once per account, an eight-week trend, and quotes that click back to the exact turn.
> Now play the PM. Ship it.
> The CSM hears back automatically, with the credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs.

## Chapter 8 · Under the hood: prove it, then operate it (3:15)

**Click:** the Under the hood scene first (three columns: prompts, failures, data; keep it short), then Next through the accuracy, then **Promote** on the candidate prompt, then read the block. Then Next: the exec view, then my run's trace. The registry, the standard, usage, logs and SLOs are one click away if there's a question.

**Say:**
> First, under the hood. Prompts: the categories come first, the model must fill a strict form that code checks, every quote must appear word for word, and returning nothing is a correct answer. A small decision model sorts each call and gives a second opinion. A new prompt only ships if it passes the evals.
> When something fails: a bad answer is retried once with the errors, then the backup model takes over. Every call has a time limit. A quote that isn't in the call is dropped. A run that stalls picks up where it stopped. What still fails is kept for a person. Past the spend cap, it replays a recorded run.
> The data: each insight is a typed record with its quote and where it sits in the call. Routing is a table. Every step is saved with its timing. And each viewer gets their own workspace.
> Precision and recall per insight type, against 48 hand-labelled golden files. The gate checks them pooled; per type they're reported against that line, and four types (pricing, churn, praise, feature requests) sit under it. Churn is always reviewed, and per-type thresholds are next.
> Sliced by mess level, because the messiest files are where systems quietly break. The current prompt still holds 90% recall on level 5.
> v5 is a rewritten extraction prompt, scored on the same files. Its recall looks fine. Try to promote it. Blocked on precision: 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback: 38 extra praise items and 20 extra churn risks. Every quote was real, which is exactly why grounding alone isn't enough. It's also more expensive and slower at p95, which the screen shows; next I'd make cost and latency gate checks too. The Guide reads all of these numbers from the eval runs, so they match the screen.
> Cost: viewers share a hard $15 cap. Past it, runs replay recorded real executions. Never an outage. (It's under "How this works" on the block, and on Usage and health.)
> Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops.
> This is the exec view: hours returned first, then the value of that time against metered AI spend (build time not included), and adoption. Two agents today; the registry is built for fifty. The RFP Responder and the six-week history are simulated; this session is live.
> And this is your run, every step and model call on one trace: the same timings the conversation page drew. (Red spans are failed delivery attempts; the Guide says whether they were retried.)
> If asked: every agent has a named owner, a purpose and a review date, and is held to the same nine-check standard. Signal Loop meets all nine in the build; the security review and business-owner sign-off are illustrative records until Invoca's Security team does the real one. The runbook is `docs/RUNBOOK.md`.

---

## Chapter 9 · Earning trust: rollout and adoption (2:30)

**Click:** nothing to step through. Roll it out, helpful not replacing, and reasons to trust it are three sections on one screen. Talk left to right, then Next.

**Say:**
> Rolling it out: discovery and a time study first. Then shadow mode, where nothing is sent. Then a few champions, then the whole team.
> It has to help the CSM, not replace them. They stay the advocate. When feedback ships, the credit goes back to them. It drafts notes and never sends them. People make the high-stakes calls.
> Trust comes from what you can check. Every quote is checked against the call. Anything uncertain waits for a person. Every decision is logged. A new prompt only ships if it passes the evals. There's a spend cap. And I measure adoption from usage, not surveys.
> The hours saved number, 1.75 a week per CSM, is an assumption, and the screen says so. The time study replaces it.
> If asked: weekly active reviewers, capture rate and time to owner are what I'd report. Cost spikes and missed service targets alert the owner. Every agent gets an owner, a review date and the same nine-check standard, mine included.

---

## Chapter 10 · The next 12–18 months (2:30)

**Click:** read the three sections left to right. Next opens your scorecard. From the scorecard: *Explore freely*, then the write-up and Q&A (or *Ask Claude about it*). The scorecard has no Next button and → does nothing on it. If it says the scorecard is empty, *Bring in a call* goes back to the first product step of chapter 4.

**Say:**
> Over 12 to 18 months: earn trust first, then every call by default, then capture during the call, then more analyses on the same platform, then specialist agents, then plugging into Invoca's own Signal AI.
> More agents change the shape of it. One finds the feedback, one checks each claim, one decides who hears it. Agent Ops is how you run several agents like that.
> Faster, cheaper models change what's worth doing. Read today's cost per call off the card. At that price, reading every call beats sampling, the work can happen during the call, and each conversation can run more analyses.
> The production stack keeps the same parts: Vercel, Trigger.dev and Neon with pgvector, with real connectors in and the real Slack, Jira and Salesforce APIs out.
> Then your scorecard. Every number on it is counted from your own workspace and this session. Nothing on it is scripted. Everything is unlocked after that. Explore freely; Resume presentation brings you back.

---

## Likely questions

**1. What does it cost per call, and at Invoca's volume?**
The cost answer in the write-up's Q&A (`/backup/cost`) shows the measured per-call cost from the ledger: about a seventh of a cent per call (mean $0.00141 over the 48 recorded runs; extraction about 68%, screening 23%, theme naming 9%). At 3,000 calls a month that's around $4. That's noise next to the CSM time it returns. The real costs are review time, hosting and seats, which is why the gate exists.

**2. How do you stop it hallucinating?**
I don't trust the model to police itself. Every insight needs a verbatim quote, and grounding is code: exact, normalised, then a fuzzy window at 0.90. If a quote isn't in the transcript, the insight is dropped and counted. On the promoted prompt every eval quote grounded, 275 of 275, so grounding is the seatbelt. The bigger lesson is v5: 99.4% of its quotes grounded and its precision still fell to 59.7%. Grounding proves the words were said, not that they're feedback.

**3. What about PII and PHI?**
Redaction runs before any model call, with reversible tokens. The original never leaves the Worker and the browser only sees masked previews. Calls only route to providers that don't collect or train on data (`data_collection: 'deny'`); that's a routing filter, not a contract. Contractual zero retention and a DPA are production items. In production I'd add a labelled PHI set and make redaction recall a release gate, plus a formal data review with Security.

**4. Prompt injection?**
Transcript text is wrapped as data, the model can only return a fixed schema and has no tools, so a planted instruction has nothing to act on. It's flagged at triage (the decision model's flag, OR-ed with a code check over the full text) and audited, and everything from that file goes to a person. The injection file in the library shows it.

**5. Why build instead of buy Gong, Productboard or Enterpret?**
Each is good at something. None owns Invoca's taxonomy, routing rules and loop-closing back to CSMs, and that's the hard part. I'd prove the workflow thin, not build a recorder, and expect the long-term home to be Signal AI and Invoca's existing conversation data. `/backup/build-vs-buy` has the fair comparison.

**6. How would you get CSMs to adopt it?**
Make it make them look good. Shadow mode first so there's no risk, champions who calibrate it weekly, a one-click "this is wrong", precision published weekly, and credit when their feedback ships. Then measure weekly active reviewers from usage events, not a survey.

**7. How do you measure hours saved honestly?**
Hours returned = Σ(baseline minutes per unit − measured human review minutes). Review minutes are measured from the product. The baseline is one registered assumption per agent (Signal Loop: 18 minutes per call, used by both the live path and the history), labelled as an assumption until the 2-week time study replaces it. I'd rather report a smaller number I can defend.

**8. What is the agent standard, and would you hold other teams to it?**
Nine checks: named owner and business owner, documented purpose and success metric, security and data review, evals with a promotion gate, logs and traces into Agent Ops, a spend cap, human review on high-stakes output, a rollback path and runbook, and a current review cadence. Yes, every production agent, mine included. It's a checklist with templates, not a committee.

**9. How do you maintain it after launch?**
A review cadence per agent (Signal Loop is reviewed on a fixed schedule), every prompt, model or threshold change goes through the eval gate and lands in the changelog, SLOs and alerts with owners, and reviewer edits feed the eval set. Overdue reviews show up in "needs attention".

**10. What breaks at scale?**
Themes need history, so day one is thin. Volume moves analytics off D1 to ClickHouse and dbt, orchestration to Trigger.dev, state to Neon with pgvector. Review load is the real constraint, so I'd tune thresholds against measured precision rather than raise auto-routing blindly.

**11. How would this work for agents built in Claude or Gumloop?**
Same platform. The Gumloop-built RFP responder is registered next to Signal Loop. Any agent can report usage, logs and units of work through one SDK or an HTTP/OTLP endpoint, and gets held to the same standard. Builders get templates and office hours; I review against the standard before production.

**12. What would you report to executives?**
Monthly: agents in production, active users and trend, hours returned and their value at a loaded rate, AI cost, ROI, what needs attention and who owns it, and what changed with the eval result that allowed it. All on one page in Agent Ops.

**13. What if the model provider changes or degrades?**
Three model roles with fallback: the main model falls back to the backup model, and the decision model falls back to the main model, so a decision-model outage never blocks a run. The eval suite is the contract: a new model is promoted only if the gate holds (overall precision and recall, level-5 recall, grounding, safety checks, no regression over 2 points), and the decision model was itself chosen by a measured speed test (`docs/reports/decision-models.md`). I re-run the speed and quality tests quarterly. Gap: the backup model hasn't been scored as primary yet, so degraded-mode precision is unknown.

**14. Why not let the model decide routing?**
Routing has to be predictable, auditable and changeable by ops without a deploy. A rules table does that. The model classifies; the table decides who gets it.

**15. How confident are you in the eval numbers?**
48 golden files is enough to catch large regressions like v5, not to separate two good prompts. There's no held-out split yet, so v4's numbers are optimistic. It grows from reviewer edits. The numbers are real for this data, and the data is synthetic, labelled as such.

**16. What would you do in the first 30 days?**
Shadow two CSMs, run the time study, co-design the taxonomy with CSMs and PMs, agree the success metrics with the business owner, and run Signal Loop in shadow mode on real calls. No routing until the champions trust it.

**17. What happens when the budget runs out during a demo?**
It switches to replay of recorded real runs and labels them, on the clock and the Timing card. The presentation works for all 7 days. Custom uploads show "Live AI budget reached" so a disabled control always says why.

**18. Why a separate decision model?**
A small, fast model from a different family reads every input first: 0.9 s median, run alongside extraction so it adds no time, at about a quarter of the old screen's cost, and it returns more (what the input is, how noisy, which analyses apply). Honest caveat: the old screen was already fast, so the win is cost, richer triage and an independent check, not raw speed. At the gate its independent second opinion can send a borderline item straight to its owner when it agrees, or hold an item that would have gone automatically when it disagrees: fewer items wait for review, and nothing gets less honest. High-stakes items (churn risk, critical bugs, flagged files) are always reviewed by a person, and every insight still needs a quote code finds in the transcript. It runs through OpenRouter here; in production it's the same model on our own key.

**19. Are the Slack, Jira and Salesforce connections real?**
No, and the product says so. Connecting one records a workspace connection with a simulated account; deliveries render as in-app previews with receipts, tagged with each person's handle from the people directory. In production they'd be the real APIs, switched on one destination at a time.

**20. What would you do differently?**
Co-design the taxonomy before writing a prompt, run shadow mode before building any UI, and connect real Slack and Jira behind a flag. `/backup/differently` has the full list.

**21. It ran too fast. Is it real?**
Yes, and the conversation page shows why. The clock runs from the run's real start; steps appear as the server reports them, with no slowed-down animation. The Timing card draws every step from its real start and finish: triage on the decision model and extraction on the main model start together on the same redacted text, and the quote check, scoring, routing and delivery are code that takes milliseconds. On one live Brightline run that was 1.55 s of triage alongside 4.94 s of extraction, 6.09 s end to end, $0.0034 of AI. "See every call in Agent Ops" opens the trace with every model call, its tokens and cost. A replay says it's a replay, and that the recording is re-timed to today's step order.
