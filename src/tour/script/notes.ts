/**
 * Speaker notes for the presenter view, per part and per key product step.
 * Hunter's voice: first person, direct, specific. Times match CHAPTERS.targetSec.
 * docs/speaker-notes.md is the long-form version of the same talk track.
 */
import type { ChapterId } from '../engine/types';

export type ChapterNotes = { say: string[]; click?: string[]; time: string };

export const NOTES: Record<ChapterId, ChapterNotes> = {
  'cold-open': {
    time: '0:30',
    say: [
      'This is a thirteen-minute slice of a QBR. Somewhere in it is a roadmap decision, and today it probably never reaches the person who makes it.',
      'Invoca turns calls into signals for its customers. I built the same loop for Invoca’s own customer calls, and then I built the platform I’d use to operate it.',
    ],
    click: ['→ once to resolve the waveform into the headline.'],
  },
  'black-hole': {
    time: '1:15',
    say: [
      'Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered.',
      'Most of it ends up in a notes field, a Slack thread or someone’s memory.',
      '“4 of 10” is an assumption, and it says so on screen. The first thing I’d do in the job is a 2-week time study with two CSMs to replace it with a real number.',
    ],
    click: ['→ to beat 2 (the void), → to beat 3 (the assumption label).'],
  },
  why: {
    time: '0:35',
    say: [
      'Invoca already does this for its customers’ calls. Option 3 asks for the same discipline pointed inward.',
      'I picked it because the data exists, it’s internal and additive, a person reviews anything high stakes, and it can show value in weeks.',
    ],
    click: ['→ twice: mirror row, then the reasons.'],
  },
  jtbd: {
    time: '2:15',
    say: [
      'Before architecture: who hires this, and for what. Four people.',
      'The CSM wants it captured without retyping. The PM wants evidence with ARR attached. The VP wants the cross-account view before the renewal, not after. Sales, competitive and support want it in their channel the same day.',
      'The job that matters most is the emotional one: be the advocate, not the stenographer. If the system doesn’t make CSMs look good, they stop feeding it.',
    ],
    click: ['Flip all four cards (click or Enter on each).', '→ to reveal the emotional job.'],
  },
  states: {
    time: '2:10',
    say: [
      'Today it’s a relay race with no baton. Five handoffs between the call and the VP, each depending on someone remembering.',
      'Nobody is careless. Every step is manual, optional and invisible.',
      'The future state seals each leak with a system: capture from the call, quote verbatim, ground in code, route by rule, theme by similarity.',
      'And then the loop closes: when it ships, the CSM hears first, with a drafted note for the customer.',
    ],
    click: ['→ three times: leaks, morph, loop closes.'],
  },
  ch1: {
    time: '1:30',
    say: [
      'Now the real system. This is the only manual step, and in production it goes away: dlt pulls from whichever recorder and CRM the CS team uses.',
      'The library looks like a recorder export. Mess levels aren’t labelled on purpose. Brightline is the main path; any file works and each one tells a different story.',
    ],
    click: ['Click Upload / “Bring in a call”.', 'Pick the highlighted Brightline QBR (or let a panelist pick).', 'Open, then Run pipeline.'],
  },
  ch2: {
    time: '2:15',
    say: [
      'Ten steps on a fast path, each saved as it runs; if a step fails or runs long, a durable Workflow resumes from the last saved step. What you’re watching is the real execution (if the callout says replay, it’s a recorded real run at real speed).',
      'Redaction first: only redacted text reaches a model.',
      'Then one beat for screen and extract: a cheap check says it’s worth reading, then the main pass returns typed insights, each with a verbatim quote. No quote, no insight.',
      'Grounding is the moment. Read the real number off the callout: fourteen of fourteen, word for word, on the recorded Brightline run. If the model had stitched Dana\u2019s interrupted sentence into one tidy quote, code wouldn\u2019t find it and the insight would be dropped. On the promoted prompt every eval quote grounded, 275 of 275: grounding is the seatbelt. Only offer See a rejected quote if the button is on screen, and describe it as what it is.',
      'The gate decides who sees it next. Anything high stakes goes to a person.',
    ],
    click: ['→ through each step as it completes; stop on the dropped quote.'],
  },
  ch3: {
    time: '2:00',
    say: [
      'The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it’s here.',
      'Approve one with A. Edit one with E. The edit is saved as labelled data with a before/after diff, which is how the next prompt gets better.',
      'If there’s time, try another file: the injection one or the PHI-heavy call.',
    ],
    click: ['Press A on the first item.', 'Press E on another; the callout follows the form. Change the type or severity (Save stays disabled until a field changes), then Save edit & route.', 'Continue, or “Try another file”.'],
  },
  ch4: {
    time: '1:20',
    say: [
      'Routing is a table, not a prompt. Ops can read it, change it and audit it.',
      'Let’s say the VP wants pricing objections on accounts over $250k. One rule change, the flows re-route, no prompt changed, no redeploy.',
      'The PM gets a Jira ticket with the quote and the ARR; urgent items land in Slack with a receipt.',
    ],
    click: ['Edit the pricing-objection rule → owner VP Product, ARR band ≥ $250k.', 'Point at the Sankey re-flowing.'],
  },
  ch5: {
    time: '1:15',
    say: [
      'One complaint is an anecdote. Read the theme off the callout: it names the highlighted card, Google Ads offline conversions arriving late, with its insight and account counts and ARR attached. That is a pattern. If the callout says my call’s insight just joined it, say so.',
      'Membership is deterministic: embeddings and a similarity threshold. The model only names it.',
      'ARR at stake, the trend, and quotes that click back to the exact turn.',
    ],
    click: ['Open the highlighted theme.'],
  },
  ch6: {
    time: '0:50',
    say: [
      'Play the PM: move the ticket to Shipped.',
      'The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs.',
    ],
    click: ['Move the ticket to Shipped.'],
  },
  ch7: {
    time: '1:35',
    say: [
      'Measured, not vibes: precision and recall per type, against hand-labelled golden files.',
      'Sliced by mess level, because the messiest files are where systems quietly break. The current prompt holds 90% recall even on level 5. The gate checks precision and recall pooled; per type they are reported against that line, and four types sit under it.',
      'v5 is a rewritten prompt, and it looks fine on recall. Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback: 38 extra praise items, 20 extra churn risks. Every quote was real, which is exactly why grounding alone isn’t enough. It is also more expensive and slower at p95, which the screen shows; next I’d make cost and latency gate checks too.',
      'And the cost: a hard cap on live AI. Past it, it replays recorded runs. Never an outage.',
    ],
    click: ['Click Promote on the candidate.', 'Then the budget gauge on Health.'],
  },
  ch8: {
    time: '2:00',
    say: [
      'Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops.',
      'This is the exec view: hours returned first, then the value of that time against metered AI spend (build time not included), and adoption. Two agents today; the registry is built for fifty.',
      'Every agent has a named owner, purpose and review date, and is held to the same nine-check standard (it’s under How this works on the agent page). Signal Loop meets all nine in the build; the security review and business-owner sign-off are illustrative records until Invoca’s Security team does the real one.',
      'That’s you on the live panel: this session’s telemetry is live. The six-week history behind it is 218 real pipeline runs over synthetic calls, with simulated users. And these are the logs from the run you just did, same trace ID end to end.',
      'SLOs with error budgets; alerts with an owner and a runbook.',
    ],
    click: ['Click the Agent Ops link.', 'Walk overview → registry → agent page → usage → logs → trace → reliability.'],
  },
  rollout: {
    time: '2:30',
    say: [
      'Build it, then operate it. Discovery and the time study first, then shadow mode, then champions, then the team.',
      'I measure adoption from usage events, not surveys: weekly active reviewers, capture rate, time to owner. Cost spikes and SLO breaches alert the owner; drift is caught by re-running the eval suite on a schedule and by watching the reviewer-edit rate.',
      'Hours returned go to execs monthly, with the assumptions labelled. It’s additive: it takes the data entry, not the judgement.',
      'After launch: a review cadence, the standard, and builder enablement (templates and office hours) so other people’s agents get there too.',
    ],
    click: ['→ twice: measurement, then operate.'],
  },
  horizon: {
    time: '1:30',
    say: [
      'Over 12–18 months, after the rollout: shadow, champions and the team first; every call by default from month 3 (read today’s average cost per call off the card); in-call capture; specialist agents checking each other; drafted PRDs and replies; and plugging into Invoca’s own Signal AI.',
      'What doesn’t change: grounding in code, gates, routing as data, human judgement.',
    ],
    click: ['→ once.'],
  },
  production: {
    time: '0:45',
    say: [
      'The POC runs entirely on Cloudflare. The production design keeps the same boundaries on Vercel, Trigger.dev, Neon with pgvector, ClickHouse and dbt at volume, dlt for ingestion from whichever recorder and CRM the team uses, and Render for long-running workers. Strict TypeScript throughout.',
    ],
    click: ['→ once to slide the pieces across.'],
  },
  scorecard: {
    time: '0:45',
    say: [
      'Every number here is counted from your workspace and this session: what you did and what the system did. Nothing on this page is scripted.',
      'Everything is unlocked now. Explore freely. I’m happy to go into cost, security, failure handling, build vs buy or metrics.',
    ],
    click: ['Explore freely; use the backup list for Q&A.'],
  },
};

export const STEP_NOTES: Record<string, string> = {
  'ch1.intro': 'Let them click Upload. If driving, click it myself: “the only manual step, and it goes away in production.”',
  'ch1.pick': 'Recommend Brightline. If a panelist picks another file, say which branch it is and what to watch for.',
  'ch1.run': 'Name the branch out loud before pressing Run.',
  'ch2.intro': 'Ten steps, each saved as it runs. Real execution, not an animation; on a replay the callout says so.',
  'ch2.redact': 'Only redacted text reaches a model. The original never leaves the Worker.',
  'ch2.privacy': 'Have them toggle before/after. Tokens keep meaning, drop identity.',
  'ch2.screen': 'Security and negative paths only: the planted instruction is inert data (schema-only output, no tools, audit row), or screen says nothing is actionable.',
  'ch2.extract': 'Main path folds screen in here: cheap check first, then typed insights. No quote, no insight. Negative path: zero insights is the correct answer.',
  'ch2.ground': 'Stop here. Say the grounded count out loud. On the promoted prompt every eval quote grounded (275 of 275): grounding is the seatbelt. Offer See a rejected quote only if it is on screen.',
  'ch2.messy': 'Noise lowers confidence, so more goes to a person, not into a backlog.',
  'ch2.gate': '0.80 auto, 0.55 review, below held. Sev-1 bugs and churn risk always reviewed.',
  'ch2.trace': 'Read the cost and time out loud. Nothing is a black box.',
  'ch2.clean': 'Clean notes are the baseline. Offer the messy one if there’s time.',
  'ch3.approve': 'Press A. That routes it, with an audit row.',
  'ch3.edit': 'Press E, change a field, Save edit & route. The correction becomes an eval case.',
  'ch3.fork': 'Offer one more file if we’re ahead of time; otherwise Continue.',
  'ch4.rule': 'Route pricing objections over $250k ARR to the VP. No prompt changed.',
  'ch4.sankey': 'If they changed the rule: point at the flow moving, workspace-only. If not: this is where today’s rules send them.',
  'ch5.intro': 'Anecdote vs pattern. Read the theme name and account count off the callout; it is the highlighted card. Open it.',
  'ch6.ship': 'Play the PM; move it to Shipped. Watch who finds out.',
  'ch7.promote': 'Let them click Promote. Pause for the block.',
  'ch7.gate': 'Blocked on precision: under the 85% bar and a 29-point regression. Cost and p95 are worse too, shown but not gated yet.',
  'ch7.budget': 'Hard cap, then replay. Never an outage.',
  'ch8.enter': 'Build it, then operate it. Click into Agent Ops.',
  'ch8.kpis': 'Exec view: lead with hours returned. Value is against metered AI spend, build excluded. Baselines are labelled assumptions.',
  'ch8.registry': 'Named owner, purpose, review date for every agent.',
  'ch8.review': 'Owned past launch, nine for nine in the build. Security review and business-owner sign-off are illustrative until Invoca Security does them.',
  'ch8.usage': 'That’s you, live. Adoption is measured from usage events; the history is simulated users.',
  'ch8.logs': 'The run you just did, in the logs. One trace ID end to end.',
  'ch8.trace': 'Where the time went: steps, model calls, retries, deliveries. Red spans are failed attempts; the callout says whether they were retried.',
  'ch8.slos': 'Error budgets and alerts with owners and runbooks.',
};
