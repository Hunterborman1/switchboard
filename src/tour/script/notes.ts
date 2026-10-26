/**
 * Speaker notes for the presenter view, per chapter and per key product step.
 * Hunter's voice: first person, direct, specific. Times match CHAPTERS.targetSec.
 * docs/speaker-notes.md is the long-form version of the same talk track.
 */
import type { ChapterId } from '../engine/types';

export type ChapterNotes = { say: string[]; click?: string[]; time: string };

export const NOTES: Record<ChapterId, ChapterNotes> = {
  'cold-open': {
    time: '0:30',
    say: [
      'This is a thirteen-minute QBR. Twenty seconds of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks. Today it probably never reaches the person who makes that call.',
      'Invoca turns calls into signals for its customers. I built the same loop for Invoca’s own customer calls, inside a platform that can run more analyses like it, and Agent Ops to operate it.',
    ],
    click: ['→ once: the highlighted moment becomes what Signal Loop makes of it.'],
  },
  real: {
    time: '1:15',
    say: [
      'Before anything else: I built this from scratch in 48 hours, and I want to be precise about what’s real.',
      'All of the AI is built and working. Triage, extraction, the quote check, scoring and the second opinion, themes, the routing rules, the review queue, the evals and their gate, the spend cap and replay, and the telemetry in Agent Ops. What you upload really runs, and what comes out (the message, the people tagged, the receipt) is generated for real.',
      'Simulated, and labelled wherever it shows: the connections to Slack, Jira, Salesforce and the rest, because I have no access to Invoca’s systems and a demo must never message real people; the data, because real customer calls can’t leave Invoca; the RFP Responder and the six-week history in Agent Ops, to show the platform with more than one agent; and the other analyses, which are listed but not built.',
    ],
    click: ['Read the two columns; no beats.'],
  },
  'black-hole': {
    time: '1:15',
    say: [
      'Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered.',
      'Follow 100 pieces of it: 72 written down, 55 shared beyond the CSM, 40 reach someone who can act. The rest is in a notes field, a Slack thread or someone’s memory.',
      '“40 of 100” is an assumption, and it says so on screen. The first thing I’d do in the job is a 2-week time study with two CSMs to replace it with a real number.',
    ],
    click: ['→ to step 2 (the handoffs fill in), → to step 3 (the total and the assumption label).'],
  },
  why: {
    time: '1:30',
    say: [
      'Three options. I chose the feedback loop because it’s the same work Invoca’s product does, pointed at Invoca’s own CSM calls, and it shows all four pillars: several people with different jobs, real engineering in extraction, grounding, scoring, routing and evals, an easy additive pitch (stop retyping it into Jira) and a clear future.',
      'Not the RFP Responder: mature products already do it (Loopio, Responsive, Vanta, Conveyor), so the first question would be why not buy one, and a wrong answer on a security questionnaire is a compliance risk. Not the Churn Predictor: it needs believable data faked from three systems, and prediction claims are hard to defend without real outcomes. Switchboard is built so both can become analyses on the same platform later; renewal risk is on the roadmap and the RFP Responder is simulated in Agent Ops.',
      'How I built it: raw TypeScript, not n8n, Gumloop or Zapier, because the trust features need code. Three model roles on OpenRouter, the decision model chosen by measurement. One Cloudflare Worker for the proof of concept; the production design comes at the end.',
    ],
    click: ['→ once: the three options become the three build choices.'],
  },
  jtbd: {
    time: '1:45',
    say: [
      'Before architecture: who hires this, and for what. Four people.',
      'The CSM wants it captured without retyping. The PM wants evidence with ARR attached. The VP wants the cross-account view before the renewal, not after. Sales, competitive and support want it in their channel the same day.',
      'The job that matters most is the emotional one: be the advocate, not the stenographer. If the system doesn’t make CSMs look good, they stop feeding it.',
    ],
    click: ['Open the cards (click or Enter on each) to show what gets in the way.', '→ to bring up the emotional job as the headline.'],
  },
  states: {
    time: '1:40',
    say: [
      'Today it’s a relay race with no baton. Five handoffs between the call and the VP, each depending on someone remembering. Nobody is careless; every step is manual, optional and invisible.',
      'The future state seals each leak with a system: capture from the call, quote verbatim, check it in code, route by rule, theme by similarity.',
      'And then the loop closes: when it ships, the CSM hears first, with a drafted note for the customer.',
    ],
    click: ['→ three times: leaks appear, Signal Loop seals them, the loop closes.'],
  },
  platform: {
    time: '1:00',
    say: [
      'One step back before the product. Signal Loop runs inside Switchboard.',
      'In: any conversation, from where it already lives or any file you upload. Decide: a fast decision model reads it first, in about a second. Analyse: Signal Loop is the one I built; the others say “Not built”. Out: the right people in the tools they already use, tagged by their own handle. The connectors are simulated, and the product says so.',
    ],
    click: ['→ three times: decide, analyse, out. Then Open the product.'],
  },
  ch1: {
    time: '1:00',
    say: [
      'Now the real system, with the Guide in the corner. This is the only manual step, and in production it goes away: connectors pull calls from whichever recorder and CRM the CS team uses.',
      'Mess levels aren’t labelled on purpose. Brightline is the main path; any file works and each one tells a different story.',
    ],
    click: ['Click Browse conversations.', 'Pick the highlighted Brightline QBR (or let a panelist pick), then Open.', 'Process conversation.'],
  },
  ch2: {
    time: '2:15',
    say: [
      'This is running live, right now. Watch the clock: a thirteen-minute call takes a few seconds. If the Guide says replay, it’s a recorded live run at its recorded speed.',
      'Triage first, on the decision model: what it is, which analyses apply, whether anyone is steering the AI. Names and health details were removed before any model saw a word.',
      'Then the moment: every insight carries a verbatim quote, and code checks it against the transcript. Read the count off the Guide; on the promoted prompt every eval quote matched, 275 of 275. A quote that isn’t there drops its insight.',
      'The gate decides who sees it next, and the decision model gives a second opinion. Anything high stakes goes to a person.',
      'And why it’s this fast, from the real timestamps: triage ran alongside extraction, not before it, and the code steps took under a millisecond each. Every call is in Agent Ops.',
    ],
    click: ['→ as each step completes.', 'On the Timing card: read the two numbers out loud.', 'Next, or Try another file if we’re ahead.'],
  },
  ch3: {
    time: '1:30',
    say: [
      'The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it’s here.',
      'Approve one with A. Edit one with E. The edit is saved as labelled data with a before and after, which is how the next prompt gets better.',
    ],
    click: ['Press A on the first item.', 'Press E on another; change the type or severity (Save stays disabled until a field changes), then Save and send.'],
  },
  ch4: {
    time: '1:30',
    say: [
      'Routing is a table, not a prompt. Ops can read it, change it and audit it. Pricing objections over $250k go to the VP: one rule change, no prompt, no redeploy.',
      'The PM gets a Jira ticket with the quote and the ARR, tagged by their own handle. The tools are simulated; the content, the tags and the receipt are real.',
      'Connections are simulated too, but routing reads them: disconnect Jira and its rules go to triage. Nothing silently disappears.',
    ],
    click: ['Edit the pricing-objection rule: owner VP Product, ARR band over $250k.', 'Next to the Jira preview, then Connections.'],
  },
  ch5: {
    time: '1:00',
    say: [
      'One complaint is an anecdote. Read the theme off the Guide: it names the highlighted card with its insight and account counts and ARR. That is a pattern.',
      'Membership is decided in code, embeddings and a similarity threshold. The model only names it. ARR is counted once per account; the trend and every quote link back to the calls.',
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
    time: '1:30',
    say: [
      'Measured, not vibes: precision and recall per type, against 48 hand-labelled files, sliced by how messy they are.',
      'v5 is a rewritten prompt, and it looks fine on recall. Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback. Every quote was real, which is exactly why the quote check alone isn’t enough. It is also more expensive and slower at p95, which is shown but not gated yet.',
    ],
    click: ['Click Promote on the candidate.'],
  },
  ch8: {
    time: '1:30',
    say: [
      'Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops.',
      'The exec view leads with hours returned, then the value of that time against metered AI spend, build time not included. The RFP Responder and the six-week history are simulated; this session is live.',
      'And this is your run, every step and model call on one trace: the same timings the conversation page drew.',
    ],
    click: ['Next through the exec view and the trace.'],
  },
  rollout: {
    time: '2:15',
    say: [
      'Build it, then operate it. Discovery and the time study first, then shadow mode, then champions, then the team.',
      'I measure adoption from usage events, not surveys: weekly active reviewers, capture rate, time to owner. Cost spikes and SLO breaches alert the owner; drift is caught by re-running the eval suite on a schedule and by watching the reviewer-edit rate.',
      'Hours returned go to execs monthly, with the assumptions labelled. It’s additive: it takes the data entry, not the judgement.',
      'After launch: a review cadence, the standard, and builder enablement (templates and office hours) so other people’s agents get there too.',
    ],
    click: ['→ twice: measurement, then operate.'],
  },
  horizon: {
    time: '1:15',
    say: [
      'Over 12–18 months, after the rollout: every call by default from month 3 (read today’s cost per call off the card); in-call capture; more analyses on the same platform (follow-ups, renewal risk, escalations, then compliance review and coaching); specialist agents checking each other; and plugging into Invoca’s own Signal AI.',
      'What doesn’t change: quotes checked in code, gates, routing as data, human judgement.',
    ],
    click: ['→ once.'],
  },
  production: {
    time: '0:45',
    say: [
      'The proof of concept runs on one Cloudflare Worker: fast to ship, one deploy, behind a gate. The production design keeps the same boundaries on Vercel, Trigger.dev, Neon with pgvector, ClickHouse and dbt at volume, dlt for ingestion, and Render for streaming transcription. Strict TypeScript throughout.',
      'The decision model stays the same model on our own key. Conversations come in through connectors instead of uploads, and results go out through the real Slack, Jira and Salesforce APIs instead of previews.',
    ],
    click: ['→ once to fill in the production column.'],
  },
  scorecard: {
    time: '0:45',
    say: [
      'Every number here is counted from your workspace and this session: what you did and what the system did. Nothing on this page is scripted.',
      'Everything is unlocked now. Explore freely; the Guide in the corner suggests something to try on every screen, and Resume presentation brings you back. You can also connect Claude over MCP and ask it how any of this was built.',
    ],
    click: ['Explore freely; use the backup list for Q&A.'],
  },
};

export const STEP_NOTES: Record<string, string> = {
  'ch1.intro': 'Let them click Browse conversations. If driving, click it myself: “the only manual step, and it goes away in production.”',
  'ch1.pick': 'Recommend Brightline. If a panelist picks another file, say which branch it is and what to watch for.',
  'ch1.run': 'Name the branch out loud before pressing Process conversation.',
  'ch2.intro': 'The latency beat starts here: running live, watch the clock. On a replay the Guide says so.',
  'ch2.privacy': 'Have them switch Before and After. Tokens keep meaning, drop identity. Only the redacted side reached a model.',
  'ch2.screen': 'A small, fast decision model from a different family reads it first. Security path: the planted instruction is inert data. Negative path: nothing actionable, so the extraction that started alongside is discarded.',
  'ch2.ground': 'Stop here. Say the count out loud. On the promoted prompt every eval quote matched (275 of 275): the quote check is the seatbelt. Offer See a rejected quote only if it is on screen.',
  'ch2.messy': 'Noise lowers confidence, so more goes to a person, not into a backlog.',
  'ch2.gate': '0.80 auto, 0.55 review, below held. Severe bugs and churn risk always reviewed. On a live run the decision model’s second opinion shows on each item.',
  'ch2.timing': 'Read the real numbers: triage alongside extraction, code steps under a millisecond. Then “See every call in Agent Ops”.',
  'ch2.clean': 'Clean notes are the baseline. Offer the messy one if there’s time.',
  'ch3.approve': 'Press A. That routes it, with an audit row.',
  'ch3.edit': 'Press E, change a field, Save and send. The correction becomes an eval case.',
  'ch4.rule': 'Route pricing objections over $250k ARR to the VP. No prompt changed.',
  'ch4.delivery': 'Simulated tool, real content: the quote, the ARR, the owner tagged by handle, the receipt.',
  'ch4.connections': 'Simulated connections, real routing: disconnect one and its rules go to triage.',
  'ch5.intro': 'Anecdote vs pattern. Read the theme name and account count off the Guide; it is the highlighted card. Open it.',
  'ch5.theme': 'ARR at stake, counted once per account; the trend; quotes that link back to the calls.',
  'ch6.ship': 'Play the PM; move it to Shipped. Watch who finds out.',
  'ch7.promote': 'Let them click Promote. Pause for the block.',
  'ch7.gate': 'Blocked on precision: under the 85% bar and a 29-point regression. Cost and p95 are worse too, shown but not gated yet.',
  'ch8.kpis': 'Exec view: lead with hours returned. Value is against metered AI spend, build excluded. Baselines are labelled assumptions.',
  'ch8.trace': 'Their run on one trace: steps, model calls, retries and deliveries.',
};
