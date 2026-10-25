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
      'This is a forty-one minute QBR. Somewhere in it is a roadmap decision, and today it probably never reaches the person who makes it.',
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
      'Now the real system. This is the only manual step, and in production it goes away: dlt pulls from the call recorder.',
      'The library looks like a recorder export. Mess levels aren’t labelled on purpose. Brightline is the main path; any file works and each one tells a different story.',
    ],
    click: ['Click Upload / “Bring in a call”.', 'Pick the highlighted Brightline QBR (or let a panelist pick).', 'Open, then Run pipeline.'],
  },
  ch2: {
    time: '2:30',
    say: [
      'What you’re watching is the real execution. Every step writes a row and the UI animates from those rows.',
      'Redaction first: only redacted text reaches a model.',
      'Screen is a cheap check before the expensive one.',
      'Grounding is the moment: the model wrote a plausible sentence the customer never said, and code caught it. Dropped, counted, never shown as fact.',
      'The gate decides who sees it next. Anything high stakes goes to a person.',
    ],
    click: ['→ through each step as it completes; stop on the dropped quote.'],
  },
  ch3: {
    time: '1:45',
    say: [
      'The workflow is paused, waiting for a human. Every item says why it’s here.',
      'Approve one with A. Edit one with E. The edit is saved as labelled data with a before/after diff, which is how the next prompt gets better.',
      'If there’s time, try another file: the injection one or the PHI-heavy call.',
    ],
    click: ['Press A on the first item.', 'Press E on another, change the type or severity, save.', 'Continue, or “Try another file”.'],
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
    time: '1:00',
    say: [
      'One complaint is an anecdote. Seven accounts saying it is a pattern.',
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
    time: '1:20',
    say: [
      'Measured, not vibes: precision and recall per type, against hand-labelled golden files.',
      'Sliced by mess level, because level 5 is where systems quietly break.',
      'The candidate prompt is better on average. Try to promote it: blocked, because recall dropped on the messiest files. Averages hide regressions.',
      'And the cost: a hard cap on live AI. Past it, it replays recorded runs. Never an outage.',
    ],
    click: ['Click Promote on the candidate.', 'Then the budget gauge on Health.'],
  },
  ch8: {
    time: '2:30',
    say: [
      'Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops.',
      'This is the exec view: hours returned, value against AI cost, adoption. Two agents today; the registry is built for fifty.',
      'Every agent has a named owner, purpose and review date, and is held to the same nine-check standard. Signal Loop passes all nine.',
      'That’s you on the live panel: this session is in the data. And these are the logs from the run you just did, same trace ID end to end.',
      'SLOs with error budgets; alerts with an owner and a runbook.',
    ],
    click: ['Click the Agent Ops link.', 'Walk overview → registry → agent page → usage → logs → trace → reliability.'],
  },
  rollout: {
    time: '2:30',
    say: [
      'Build it, then operate it. Discovery and the time study first, then shadow mode, then champions, then the team.',
      'I measure adoption from usage events, not surveys: weekly active reviewers, capture rate, time to owner.',
      'Hours returned go to execs monthly, with the assumptions labelled. It’s additive: it takes the data entry, not the judgement.',
      'After launch: a review cadence, the standard, and builder enablement (templates and office hours) so other people’s agents get there too.',
    ],
    click: ['→ twice: measurement, then operate.'],
  },
  horizon: {
    time: '1:30',
    say: [
      'Over 12–18 months: capture in the call, specialist agents checking each other, models cheap enough to process every call, drafted PRDs and replies, and plugging into Invoca’s own Signal AI.',
      'What doesn’t change: grounding in code, gates, routing as data, human judgement.',
    ],
    click: ['→ once.'],
  },
  production: {
    time: '0:45',
    say: [
      'The POC runs entirely on Cloudflare. The production design keeps the same boundaries on Vercel, Trigger.dev, Neon with pgvector, ClickHouse and dbt at volume, dlt for ingestion and Render for long-running workers. Strict TypeScript throughout.',
    ],
    click: ['→ once to slide the pieces across.'],
  },
  scorecard: {
    time: '0:45',
    say: [
      'These are real numbers from your session: what you did and what the system did.',
      'Everything is unlocked now. Explore freely. I’m happy to go into cost, security, failure handling, build vs buy or metrics.',
    ],
    click: ['Explore freely; use the backup list for Q&A.'],
  },
};

export const STEP_NOTES: Record<string, string> = {
  'ch1.intro': 'Let them click Upload. If driving, click it myself: “the only manual step, and it goes away in production.”',
  'ch1.pick': 'Recommend Brightline. If a panelist picks another file, say which branch it is and what to watch for.',
  'ch1.run': 'Name the branch out loud before pressing Run.',
  'ch2.intro': 'Real execution, not an animation. Every step writes a row.',
  'ch2.redact': 'Only redacted text reaches a model. The original never leaves the Worker.',
  'ch2.privacy': 'Have them toggle before/after. Tokens keep meaning, drop identity.',
  'ch2.screen': 'Security path: the planted instruction is inert data; schema-only output, no tools, audit row.',
  'ch2.extract': 'No quote, no insight. Negative path: zero insights is the correct answer.',
  'ch2.ground': 'Stop here. The model wrote a plausible sentence nobody said; code caught it.',
  'ch2.messy': 'Noise lowers confidence, so more goes to a person, not into a backlog.',
  'ch2.gate': '0.80 auto, 0.55 review, below held. Sev-1 bugs and churn risk always reviewed.',
  'ch2.trace': 'Read the cost and time out loud. Nothing is a black box.',
  'ch2.clean': 'Clean notes are the baseline. Offer the messy one if there’s time.',
  'ch3.approve': 'Press A. That resumes the paused workflow.',
  'ch3.edit': 'Press E. The correction becomes an eval case.',
  'ch3.fork': 'Offer one more file if we’re ahead of time; otherwise Continue.',
  'ch4.rule': 'Route pricing objections over $250k ARR to the VP. No prompt changed.',
  'ch4.sankey': 'Point at the flow moving. Workspace-only change.',
  'ch5.intro': 'Anecdote vs pattern. Open the theme.',
  'ch6.ship': 'Play the PM; move it to Shipped. Watch who finds out.',
  'ch7.promote': 'Let them click Promote. Pause for the block.',
  'ch7.gate': 'Averages hide regressions. Every slice must hold.',
  'ch7.budget': 'Hard cap, then replay. Never an outage.',
  'ch8.enter': 'Build it, then operate it. Click into Agent Ops.',
  'ch8.kpis': 'Exec view. Two agents today, built for fifty. Baselines are labelled assumptions.',
  'ch8.registry': 'Named owner, purpose, review date for every agent.',
  'ch8.standard': 'The standard I’d hold every builder’s agent to. Nine for nine.',
  'ch8.usage': 'That’s you. Adoption measured, not surveyed.',
  'ch8.logs': 'The run you just did, in the logs. One trace ID end to end.',
  'ch8.trace': 'Where the time went: steps, model calls, retries, deliveries.',
  'ch8.slos': 'Error budgets and alerts with owners and runbooks.',
};
