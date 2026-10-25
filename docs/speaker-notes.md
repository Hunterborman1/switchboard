# Signal Loop: speaker notes

The talk track for the live walkthrough (about 25:00), what to click, and answers to likely questions.
The presenter view (`/presenter`) shows the same notes per part, synced to the main window. The source of truth for the in-app notes is `src/tour/script/notes.ts`.

---

## Pre-flight (10 minutes before)

1. Open the main window at `/repo/invoca/` on the shared screen, full screen, browser zoom 100%.
2. Open `/repo/invoca/presenter` on the laptop screen. Check it says **Connected** and the step titles update when you press → in the main window.
3. Reset my workspace (Health → *Reset my workspace*, or `POST /api/workspace/reset`) so the scorecard numbers are only from this session.
4. Check the budget gauge on Health: live AI should have headroom. If it's at the cap, runs replay and say so; that's fine, and I mention it in Ch7.
5. Run Brightline once in a private window to warm the pipeline. Close it.
6. Have the backup list ready in the presenter view (cost, security, failure, build vs buy, metrics, Agent Ops, what I'd do differently).
7. Close Slack and notifications. Keyboard: → next, ← back, Esc menu. A clicker sending PageDown/PageUp works too.

**Timing rule:** the presenter timer goes amber when a part runs past its target and red at 125%. If I'm more than a minute behind by Ch3, skip "Try another file" and go straight on.

---

## Part 0 · Cold open (0:30)

**Click:** → once. The waveform resolves into the mark and the headline.

**Say:**
> This is a forty-one minute QBR. Somewhere in it is a roadmap decision, and today it probably never reaches the person who makes it.
> Invoca turns calls into signals for its customers. I built the same loop for Invoca's own customer calls, and then I built the platform I'd use to operate it.

## Part 1 · The insight black hole (1:15)

**Click:** → to beat 2 (the void and the counter), → to beat 3 (the assumption label).

**Say:**
> Customers tell CSMs exactly what to build: what's broken, what's missing, what a competitor just offered them.
> Most of it ends up in a notes field, a Slack thread or someone's memory. The person who could act on it never hears it.
> "4 of 10" is an assumption, and it says so on screen. The first thing I'd do in the job is a 2-week time study with two CSMs to replace it with a real number.

## Part 2 · Why this option (0:35)

**Click:** → twice: the mirrored row, then the reasons.

**Say:**
> Invoca already does this for its customers' calls. Option 3 asks for the same discipline pointed inward.
> I picked it because the data already exists, it's internal and additive, a person reviews anything high stakes, and it can show value in weeks.

## Part 3 · Jobs to be done (2:15)

**Click:** flip all four cards (click, or Tab + Enter). Then → for the emotional job.

**Say:**
> Before architecture: who hires this, and for what.
> The CSM wants it captured without retyping, and to know when it ships. The PM wants evidence grouped by theme with ARR attached. The VP wants the cross-account view before the renewal, not after. Sales, competitive and support want it in their channel the same day.
> The job that matters most is the emotional one: be the advocate, not the stenographer. If the system doesn't make CSMs look good, they stop feeding it, and then nothing else works.

## Part 4 · Current → future state (2:10)

**Click:** → three times: leaks, morph, loop closes.

**Say:**
> Today it's a relay race with no baton. Five handoffs between the call and the VP, each one depending on someone remembering.
> Nobody is careless. Every step is manual, optional and invisible.
> The future state seals each leak with a system, not heroics: capture from the call, quote verbatim, ground in code, route by rule, theme by similarity. The CSM stays in the room.
> And the loop closes. When it ships, the CSM hears first, with a drafted note for the customer.

**Transition:** "Let me show you the real thing."

---

## Ch1 · A call comes in (1:30)

**Click:** *Bring in a call* → pick the highlighted **Brightline QBR** (or let a panelist choose) → Open → **Run pipeline**.

**Say:**
> This is the only manual step, and in production it goes away: dlt pulls from the call recorder.
> The library looks like a recorder export. Mess levels aren't labelled on purpose. Brightline is the main path; any file works and each one goes somewhere different.

If they pick something else, name the branch:
- **Clean notes:** the easy baseline.
- **Messy speech-to-text:** "in vocal", "call rail", crosstalk. Watch it stay honest.
- **Injection attempt:** someone planted an instruction in the transcript.
- **Friendly check-in:** the right output is nothing.
- **PHI-heavy healthcare call:** watch what reaches the model.

## Ch2 · Watch it think (2:30)

**Click:** → as each step completes. Stop on Ground. If every quote grounded (the usual case on Brightline), click **See a rejected quote**, then **Back to my run**.

**Say:**
> What you're watching is the real execution. Every step writes a row and the UI animates from those rows.
> Redaction first. Only redacted text reaches a model; the original never leaves the Worker.
> Screen is a cheap check before the expensive one: is it actionable, what language, is anyone trying to steer the model.
> Extraction returns a fixed schema. No quote, no insight.
> *(On Ground)* This is the moment. Fourteen of fourteen quotes matched the transcript (read the real count off the callout). One of them was interrupted mid-sentence and still matched, because grounding checks the words, not the model's word.
> *(See a rejected quote)* Across all 48 recordings exactly one quote failed. Here it is: a plausible sentence the customer never said. The closest span scored under 0.90, so the insight was dropped and counted, never shown as fact.
> The gate decides who sees it next. 0.80 and up routes itself; anything high stakes goes to a person.
> Every step logs model, tokens, cost and time. Nothing is a black box.

Branch extras: **privacy** → have them toggle before/after; **security** → point at the injection flag and the audit row; **negative** → "zero insights, and that's correct"; **messy** → lower confidence, more for review.

## Ch3 · Human in the loop (1:45)

**Click:** press **A** on the first item. Press **E** on another, change the type or severity, save. Then *Continue* (or *Try another file* if I'm ahead of time).

**Say:**
> The workflow is paused, waiting for a person. Every item says why it's here: "confidence 0.71, below 0.80".
> Approve resumes the workflow. An edit is saved as labelled data with a before/after diff, which is how the next prompt gets better.

## Ch4 · Right owner, right channel (1:20)

**Click:** edit the **pricing objection** rule: owner VP Product, ARR band over $250k. Point at the Sankey.

**Say:**
> Routing is a table, not a prompt. Ops can read it, change it and audit it.
> The VP wants pricing objections on big accounts. One rule change, the flows re-route. No prompt changed, no redeploy, and it only affects your workspace.
> The PM gets a Jira ticket with the quote and the ARR. Urgent items land in Slack, with a receipt.

## Ch5 · Patterns, not anecdotes (1:00)

**Click:** open the highlighted theme.

**Say:**
> One complaint is an anecdote. The same thing from nine accounts is a pattern. (Read the theme off the screen: the top one is “Google Ads offline conversions arrive late”, 36 insights.)
> Membership is deterministic, embeddings and a similarity threshold. The model only names it.
> ARR at stake, an eight-week trend, and quotes that click back to the exact turn.

## Ch6 · Close the loop (0:50)

**Click:** move the ticket to **Shipped**.

**Say:**
> Play the PM. Ship it.
> The CSM hears back automatically, with the credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs.

## Ch7 · Prove it (1:20)

**Click:** **Promote** on the candidate prompt → read the gate → Health budget gauge.

**Say:**
> Precision and recall per insight type, against 48 hand-labelled golden files.
> Sliced by mess level, because the messiest files are where systems quietly break. The current prompt still holds 90% recall on level 5.
> The candidate is cheaper. Try to promote it. Blocked: precision fell 29 points, from 88.6% to 59.7%. The cheaper prompt invented insights customers never raised. One regression blocks promotion, whatever it saves.
> Cost: viewers share a hard $15 cap. Past it, runs replay recorded real executions. Never an outage.

## Ch8 · Operate it (2:30)

**Click:** the **Agent Ops** link → overview → registry → Signal Loop's page → usage → logs (filtered to my run) → trace → reliability.

**Say:**
> Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops.
> This is the exec view: hours returned, value against AI cost, adoption. Two agents today; the registry is built for fifty.
> Every agent has a named owner, a purpose and a review date, and is held to the same nine-check standard. Signal Loop passes all nine.
> That's you on the live panel. This session is in the data. Adoption is measured, not surveyed.
> These are the logs from the run you just did, one trace ID end to end. And the waterfall shows where the time went.
> SLOs with error budgets; alerts with an owner and a runbook. Acknowledged isn't resolved.

---

## Part 13 · Earning trust: rollout (2:30)

**Click:** → twice.

**Say:**
> Build it, then operate it. Discovery and the time study in week 0, shadow mode in weeks 1–2 where nothing routes, champions in weeks 3–6 with a weekly calibration, then the team.
> I measure adoption from usage events, not surveys: weekly active reviewers, capture rate, time to owner.
> Hours returned go to execs monthly, with the assumptions labelled. It's additive. It takes the data entry, not the judgement.
> After launch: a review cadence, the standard, and builder enablement, meaning templates and office hours, so other people's Claude and Gumloop builds get to production too.

## Part 14 · The next 12–18 months (1:30)

**Click:** → once.

**Say:**
> Capture in the call, specialist agents checking each other, models cheap enough to process every call, drafted PRDs and customer replies, and plugging into Invoca's own Signal AI.
> What doesn't change: grounding in code, gates, routing as data, and human judgement where it counts.

## Part 15 · POC → production (0:45)

**Click:** → once.

**Say:**
> The POC runs entirely on Cloudflare. Production keeps the same boundaries on Vercel, Trigger.dev, Neon with pgvector, ClickHouse and dbt at volume, dlt for ingestion and Render for long-running workers. Strict TypeScript throughout.

## Part 16 · Scorecard (0:45)

**Say:**
> These are real numbers from your session: what you did and what the system did.
> Everything's unlocked. Explore freely. I'm happy to go into cost, security, failure handling, build vs buy, or how I'd measure it.

---

## Likely questions

**1. What does it cost per call, and at Invoca's volume?**
The cost backup (`/backup/cost`) shows the measured per-call cost from the ledger. It's a fraction of a cent per call; extraction is about 70% of it. At a few thousand CSM calls a month that's tens of dollars, which is noise next to the CSM time it returns. The real cost is people time for review, which is why the gate exists.

**2. How do you stop it hallucinating?**
I don't trust the model to police itself. Every insight needs a verbatim quote, and grounding is code: exact, normalised, then a fuzzy window at 0.90. If a quote isn't in the transcript, the insight is dropped and counted. On Brightline every quote grounded; across all 48 recordings exactly one failed, and I showed it.

**3. What about PII and PHI?**
Redaction runs before any model call, with reversible tokens. The original never leaves the Worker and the browser only sees masked previews. Providers are restricted to zero-retention routing. In production I'd add a labelled PHI set and make redaction recall a release gate, plus a formal data review with Security.

**4. Prompt injection?**
Transcript text is wrapped as data, the model can only return a fixed schema and has no tools, so a planted instruction has nothing to act on. It's flagged by the screen step and audited. The injection file in the library shows it.

**5. Why build instead of buy Gong, Productboard or Enterpret?**
Each is good at something. None owns Invoca's taxonomy, routing rules and loop-closing back to CSMs, and that's the hard part. I'd prove the workflow thin, not build a recorder, and expect the long-term home to be Signal AI and Invoca's existing conversation data. `/backup/build-vs-buy` has the fair comparison.

**6. How would you get CSMs to adopt it?**
Make it make them look good. Shadow mode first so there's no risk, champions who calibrate it weekly, a one-click "this is wrong", precision published weekly, and credit when their feedback ships. Then measure weekly active reviewers from usage events, not a survey.

**7. How do you measure hours saved honestly?**
Hours returned = Σ(baseline minutes per unit − measured human review minutes). Review minutes are measured from the product. Baselines are labelled assumptions until the 2-week time study replaces them. I'd rather report a smaller number I can defend.

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
Two tiers with fallback, and the eval suite is the contract: a new model is promoted only if every slice holds. I re-run the speed and quality test quarterly.

**14. Why not let the model decide routing?**
Routing has to be predictable, auditable and changeable by ops without a deploy. A rules table does that. The model classifies; the table decides who gets it.

**15. How confident are you in the eval numbers?**
48 golden files is enough to catch regressions by slice, not enough for tight confidence intervals. It grows from reviewer edits. The numbers are real for this data, and the data is synthetic, labelled as such.

**16. What would you do in the first 30 days?**
Shadow two CSMs, run the time study, co-design the taxonomy with CSMs and PMs, agree the success metrics with the business owner, and run Signal Loop in shadow mode on real calls. No routing until the champions trust it.

**17. What happens when the budget runs out during a demo?**
It switches to replay of recorded real runs and labels them. The walkthrough works for all 7 days. Custom uploads show "Live AI budget reached" so a disabled control always says why.

**18. What would you do differently?**
Co-design the taxonomy before writing a prompt, run shadow mode before building any UI, and connect real Slack and Jira behind a flag. `/backup/differently` has the full list.
