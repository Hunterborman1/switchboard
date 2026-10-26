/**
 * Speaker notes for the presenter view, per chapter and per key product step.
 * Hunter's voice: first person, direct, specific. Times match CHAPTERS.targetSec.
 * docs/speaker-notes.md is the long-form version of the same talk track.
 */
import type { ChapterId } from '../engine/types';

export type ChapterNotes = { say: string[]; click?: string[]; time: string };

export const NOTES: Record<ChapterId, ChapterNotes> = {
  signal: {
    time: '2:30',
    say: [
      'This is a thirteen-minute QBR. Twenty seconds of it, at 06:00, is a roadmap decision: a competitor offering same-day conversions to an account that renews in twelve weeks. Today it probably never reaches the person who makes that call.',
      'Invoca turns calls into signals for its customers. I built the same loop for Invoca’s own customer calls, inside a platform that can run more analyses like it, and Agent Ops to operate it.',
      'Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered. Follow 100 pieces of it: 72 written down, 55 shared beyond the CSM, 40 reach someone who can act. The rest is in a notes field, a Slack thread or someone’s memory.',
      '“40 of 100” is an assumption, and it says so on screen. The first thing I’d do in the job is a two-week time study with two CSMs to replace it with a real number.',
      'The bottom row is what Signal Loop makes of that one sentence: what it is, who hears it, the evidence, and why it matters now.',
    ],
    click: ['Nothing to click: everything is on screen. Next when done.'],
  },
  real: {
    time: '1:30',
    say: [
      'Before anything else: I built this from scratch in 48 hours, and I want to be precise about what’s real. The source is on GitHub, linked right under the headline.',
      'All of the AI is built and working. Triage, extraction, the quote check, scoring and the second opinion, themes, the routing rules, the review queue, the evals and their gate, the spend cap and replay, and the telemetry in Agent Ops. What you upload really runs, and what comes out (the message, the people tagged, the receipt) is generated for real.',
      'Simulated, and labelled wherever it shows: the connections to Slack, Jira, Salesforce and the rest, because I have no access to Invoca’s systems and a demo must never message real people; the data, because real customer calls can’t leave Invoca; the RFP Responder and the six-week history in Agent Ops, to show the platform with more than one agent; and the other analyses, which are listed but not built.',
    ],
    click: ['Read the two columns; point at the GitHub link. Next.'],
  },
  why: {
    time: '2:00',
    say: [
      'Three options. I chose the feedback loop because it’s the same work Invoca’s product does, pointed at Invoca’s own CSM calls, and it shows all four pillars: several people with different jobs, real engineering in extraction, grounding, scoring, routing and evals, an easy additive pitch (stop retyping it into Jira) and a clear future.',
      'Not the RFP Responder: mature products already do it (Loopio, Responsive, Vanta, Conveyor), so the first question would be why not buy one, and a wrong answer on a security questionnaire is a compliance risk. Not the Churn Predictor: it needs believable data faked from three systems, and prediction claims are hard to defend without real outcomes. Switchboard is built so both can become analyses on the same platform later; renewal risk is on the roadmap and the RFP Responder is simulated in Agent Ops.',
      'How I built it, the bottom row: raw TypeScript, not n8n, Gumloop or Zapier, because the trust features need code. Three model roles on OpenRouter, the decision model chosen by measurement. One Cloudflare Worker for the proof of concept; the production design comes in chapter 9.',
    ],
    click: ['Options first, then the build row. Next.'],
  },
  call: {
    time: '4:30',
    say: [
      'One step back before the product. Signal Loop runs inside Switchboard. In: any conversation, from where it already lives or any file you upload. Decide: a fast decision model reads it first, in about a second. Analyse: Signal Loop is the one I built; the others say “Not built”. Out: the right people in the tools they already use, tagged by their own handle. The connectors are simulated, and the product says so.',
      'Now the real system, with the Guide in the corner. Bringing the call in is the only manual step, and in production it goes away: connectors pull calls from whichever recorder and CRM the CS team uses. Mess levels aren’t labelled on purpose. Brightline is the main path; any file works and each one tells a different story.',
      'This is running live, right now. Watch the clock: a thirteen-minute call takes a few seconds. If the Guide says replay, it’s a recorded live run at its recorded speed.',
      'Triage first, on the decision model: what it is, which analyses apply, whether anyone is steering the AI. Names and health details were removed before any model saw a word.',
      'Then the moment: every insight carries a verbatim quote, and code checks it against the transcript. Read the count off the Guide; on the promoted prompt every eval quote matched, 275 of 275. A quote that isn’t there drops its insight.',
      'The gate decides who sees it next, and the decision model gives a second opinion. Anything high stakes goes to a person. And why it’s this fast, from the real timestamps: triage ran alongside extraction, not before it, and the code steps took under a millisecond each. Every call is in Agent Ops.',
    ],
    click: [
      'On the platform scene: Open the product.',
      'Click Browse conversations; pick the highlighted Brightline QBR (or let a panelist pick), then Open; Process conversation.',
      '→ as each step completes. On the Timing card read the two numbers out loud; Next, or Try another file if we’re ahead.',
    ],
  },
  review: {
    time: '1:45',
    say: [
      'The run is parked awaiting review: nothing on it routes until a person decides. Every item says why it’s here.',
      'Approve one with A. Edit one with E. The edit is saved as labelled data with a before and after, which is how the next prompt gets better.',
    ],
    click: ['Press A on the first item.', 'Press E on another; change the type or severity (Save stays disabled until a field changes), then Save and send.'],
  },
  routing: {
    time: '1:45',
    say: [
      'Routing is a table, not a prompt. Ops can read it, change it and audit it. Pricing objections over $250k go to the VP: one rule change, no prompt, no redeploy.',
      'The PM gets a Jira ticket with the quote and the ARR, tagged by their own handle. The tools are simulated; the content, the tags and the receipt are real.',
      'Connections are simulated too, but routing reads them: disconnect Jira and its rules go to triage. Nothing silently disappears.',
    ],
    click: ['Edit the pricing-objection rule: owner VP Product, ARR band over $250k.', 'Next to the Jira preview, then Connections.'],
  },
  patterns: {
    time: '2:00',
    say: [
      'One complaint is an anecdote. Read the theme off the Guide: it names the highlighted card with its insight and account counts. That is a pattern; the next step adds its ARR.',
      'Membership is decided in code, embeddings and a similarity threshold. The model only names it. ARR is counted once per account; the trend and every quote link back to the calls.',
      'Now play the PM: move the ticket to Shipped. The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs.',
    ],
    click: ['Open the highlighted theme; Next.', 'Move the ticket to Shipped; Next.'],
  },
  operate: {
    time: '3:15',
    say: [
      'Measured, not vibes: precision and recall per type, against 48 hand-labelled files, sliced by how messy they are.',
      'v5 is a rewritten prompt, and it looks fine on recall. Try to promote it: blocked on precision, 88.7% to 59.7%, under the 85% bar and a 29-point regression. It over-labelled real sentences as feedback. Every quote was real, which is exactly why the quote check alone isn’t enough. It is also more expensive and slower at p95, which is shown but not gated yet.',
      'Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops. The exec view leads with hours returned, then the value of that time against metered AI spend, build time not included. The RFP Responder and the six-week history are simulated; this session is live.',
      'And this is your run, every step and model call on one trace: the same timings the conversation page drew.',
    ],
    click: ['Next; click Promote on the candidate; read the block.', 'Next through the exec view and the run’s trace.'],
  },
  production: {
    time: '4:30',
    say: [
      'Three things on one screen: roll it out, grow it, run it in production.',
      'Roll it out: discovery and the time study first, then shadow mode where nothing is sent, then champions, then the team. It’s additive: it takes the data entry, not the judgement. The hours number is an assumption until the time study replaces it.',
      'I measure adoption from usage events, not surveys: weekly active reviewers, capture rate, time to owner. Cost spikes and SLO breaches alert the owner; drift is caught by re-running the eval suite on a schedule and by watching the reviewer-edit rate. Every agent gets an owner, a review date and the same nine-check standard, mine included, and templates and office hours so other people’s agents get there too.',
      'Over 12–18 months: every call by default from month 3 (read today’s cost per call off the card); in-call capture; more analyses on the same platform; specialist agents checking each other; and plugging into Invoca’s own Signal AI. What doesn’t change: quotes checked in code, gates, routing as data, human judgement.',
      'The proof of concept runs on one Cloudflare Worker: fast to ship, one deploy, behind a gate. The production design keeps the same boundaries on Vercel, Trigger.dev, Neon with pgvector, ClickHouse and dbt at volume, dlt for ingestion, and Render for streaming transcription. Strict TypeScript throughout. Conversations come in through connectors instead of uploads, and results go out through the real Slack, Jira and Salesforce APIs instead of previews.',
    ],
    click: ['Left to right: roll out, grow, production. Next to the scorecard.'],
  },
  scorecard: {
    time: '1:15',
    say: [
      'Every number here is counted from your workspace and this session: what you did and what the system did. Nothing on this page is scripted.',
      'Everything is unlocked now. Explore freely; the Guide in the corner suggests something to try on every screen, and Resume presentation brings you back. You can also connect Claude over MCP and ask it how any of this was built.',
    ],
    click: ['Explore freely; then the write-up and Q&A.'],
  },
};

export const STEP_NOTES: Record<string, string> = {
  'call.platform': 'All four columns are on screen: walk them left to right, then Open the product.',
  'call.intro': 'Let them click Browse conversations. If driving, click it myself: “the only manual step, and it goes away in production.”',
  'call.pick': 'Recommend Brightline. If a panelist picks another file, say which branch it is and what to watch for.',
  'call.process': 'Name the branch out loud before pressing Process conversation.',
  'call.watch': 'The latency story starts here: running live, watch the clock. On a replay the Guide says so.',
  'call.privacy': 'Have them switch Before and After. Tokens keep meaning, drop identity. Only the redacted side reached a model.',
  'call.screen': 'A small, fast decision model from a different family reads it first. Security path: the planted instruction is inert data. Negative path: nothing actionable, so the extraction that started alongside is discarded.',
  'call.ground': 'Stop here. Say the count out loud. On the promoted prompt every eval quote matched (275 of 275): the quote check is the seatbelt. Offer See a rejected quote only if it is on screen.',
  'call.messy': 'Noise lowers confidence, so more goes to a person, not into a backlog.',
  'call.gate': '0.80 auto, 0.55 review, below held. Severe bugs and churn risk always reviewed. On a live run the decision model’s second opinion shows on each item.',
  'call.timing': 'Read the real numbers: triage alongside extraction, code steps under a millisecond. Then “See every call in Agent Ops”.',
  'call.clean': 'Clean notes are the baseline. Offer the messy one if there’s time.',
  'review.approve': 'Press A. That routes it, with an audit row.',
  'review.edit': 'Press E, change a field, Save and send. The correction becomes an eval case.',
  'routing.rule': 'Route pricing objections over $250k ARR to the VP. No prompt changed.',
  'routing.delivery': 'Simulated tool, real content: the quote, the ARR, the owner tagged by handle, the receipt.',
  'routing.connections': 'Simulated connections, real routing: disconnect one and its rules go to triage.',
  'patterns.intro': 'Anecdote vs pattern. Read the theme name and account count off the Guide; it is the highlighted card. Open it.',
  'patterns.theme': 'ARR at stake, counted once per account; the trend; quotes that link back to the calls.',
  'patterns.ship': 'Play the PM; move it to Shipped. Watch who finds out.',
  'operate.promote': 'Let them click Promote. Pause for the block.',
  'operate.gate': 'Blocked on precision: under the 85% bar and a 29-point regression. Cost and p95 are worse too, shown but not gated yet.',
  'operate.kpis': 'Exec view: lead with hours returned. Value is against metered AI spend, build excluded. Baselines are labelled assumptions.',
  'operate.trace': 'Their run on one trace: steps, model calls, retries and deliveries.',
};
