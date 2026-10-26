/**
 * Speaker notes for the presenter view, per chapter and per key product step.
 * Hunter's voice: first person, direct, specific. Times match CHAPTERS.targetSec.
 * docs/speaker-notes.md is the long-form version of the same talk track.
 */
import type { ChapterId } from '../engine/types';

export type ChapterNotes = { say: string[]; click?: string[]; time: string };

export const NOTES: Record<ChapterId, ChapterNotes> = {
  signal: {
    time: '2:00',
    say: [
      'This is a thirteen-minute QBR. Twenty seconds of it, at the six-minute mark, is a roadmap decision. A competitor is offering same-day conversions to an account that renews in twelve weeks. Today, that probably never reaches the person who makes the call.',
      'Invoca turns calls into signals for its customers. I built the same loop for Invoca’s own customer calls. It sits inside a platform that can run more analyses like it. And I built Agent Ops to run it.',
      'Customers tell CSMs exactly what to build. What’s broken, what’s missing, what a competitor just offered. Take 100 pieces of that. 72 get written down. 55 get shared beyond the CSM. 40 reach someone who can act. The rest sits in a notes field, a Slack thread or someone’s memory.',
      'That “40 of 100” is an assumption, and the screen says so. The first thing I’d do in the job is a two-week time study with two CSMs. That gives us a real number instead.',
      'The bottom row is what Signal Loop makes of that one sentence. What it is, who hears it, the evidence, and why it matters now.',
    ],
    click: ['Nothing to click: everything is on screen. Next when done.'],
  },
  jobs: {
    time: '2:30',
    say: [
      'Before any architecture: who uses this, and for what. Four people. The CSM wants it captured without retyping it. The PM wants evidence grouped by theme, with ARR attached. The VP wants an honest view across every account, before the renewal. Sales, competitive and support leads want it in their channel the same day.',
      'The job underneath all four is the CSM’s: be the advocate, not the note-taker. If it doesn’t make CSMs look good, they stop feeding it.',
      'Today the work goes like this. The customer says it on a call. Maybe the CSM writes it down. Maybe it lands in Slack. Then it’s lost. With Signal Loop: the call comes in, Signal Loop reads it, the insight carries a checked quote, it lands with the owner in their own tool, and the CSM hears when it ships.',
    ],
    click: ['Nothing to click. The four people on top, the two workflows below. Next.'],
  },
  built: {
    time: '2:30',
    say: [
      'I built this from scratch in 48 hours. The code is on GitHub, linked under the headline.',
      'All of the AI is built and works. What goes in and what comes out really runs. The connections and the data are simulated, because I have no access to Invoca’s systems and a demo must never message real people. The screen says so wherever it matters.',
      'Three options. I chose the feedback loop: it’s the work Invoca’s product does, pointed at Invoca’s own calls. The RFP Responder is a crowded market and a wrong answer is a compliance risk. The Churn Predictor needs believable fake data from three systems. Both can become analyses on the same platform later.',
      'How it’s built: plain TypeScript, not n8n, Gumloop or Zapier, because checking the AI needs code. Three model roles, picked by measuring. One Cloudflare Worker for now. The production design comes in chapter 10.',
    ],
    click: ['Point at the GitHub link, then left to right. Next.'],
  },
  call: {
    time: '4:30',
    say: [
      'One step back before the product. Signal Loop runs inside Switchboard. In: any conversation, from where it already lives, or any file you upload. Decide: a fast decision model reads it first, in about a second. Analyse: Signal Loop is the one I built. The others say “Not built”. Out: the right people, in the tools they already use, tagged by their own handle. The connectors are simulated, and the product says so.',
      'Now the real system, with the Guide along the bottom. Bringing the call in is the only manual step. In production it goes away: connectors pull calls from whatever recorder and CRM the CS team uses. I didn’t label how messy the files are, on purpose. Brightline is the main path. Any file works, and each one tells a different story.',
      'This is running live, right now. Watch the clock: a thirteen-minute call takes a few seconds. If the Guide says replay, it’s a recorded live run at its recorded speed.',
      'First, the decision model sorts it. What is it, which analyses apply, and is anyone trying to steer the AI? Names and health details were removed before any model saw a word.',
      'Then the key moment. Every insight carries the customer’s exact words, and code checks them against the transcript. Read the count off the Guide. On the current prompt, every test quote matched: 275 of 275. A quote that isn’t there drops its insight.',
      'Next, the gate decides who sees it, and the decision model gives a second opinion. Anything high stakes goes to a person. Then why it’s this fast, from the real timestamps. Triage ran alongside extraction, not before it. And the code steps took under a millisecond each. Every call is in Agent Ops.',
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
      'The run is now waiting for review. Nothing on it goes anywhere until a person decides. Every item says why it’s here.',
      'Approve one with A. Edit one with E. The edit is saved as a labelled example, with a before and after. That’s how the next prompt gets better.',
    ],
    click: ['Press A on the first item.', 'Press E on another; change the type or severity (Save stays disabled until a field changes), then Save and send.'],
  },
  routing: {
    time: '1:45',
    say: [
      'Routing is a table, not a prompt. Ops can read it, change it and audit it. Pricing objections over $250k go to the VP. That’s one rule change. No prompt edit, no redeploy.',
      'The PM gets a Jira ticket with the quote and the ARR, tagged by their own handle. The tools are simulated; the content, the tags and the receipt are real.',
      'Connections are simulated too, but routing reads them: disconnect Jira and its rules go to triage. Nothing silently disappears.',
    ],
    click: ['Edit the pricing-objection rule: owner VP Product, ARR band over $250k.', 'Next to the Jira preview, then Connections.'],
  },
  patterns: {
    time: '1:45',
    say: [
      'One complaint is an anecdote. Read the theme off the Guide. It names the highlighted card, with how many insights and accounts it has. That’s a pattern. The next step adds its ARR.',
      'Code decides what joins a theme, by how close the meaning is. The model only names it. ARR is counted once per account. The trend and every quote link back to the calls.',
      'Now play the PM: move the ticket to Shipped. The CSM hears back automatically, with credit and a drafted note for the customer. Drafted, not sent. The relationship stays theirs.',
    ],
    click: ['Open the highlighted theme; Next.', 'Move the ticket to Shipped; Next.'],
  },
  operate: {
    time: '3:15',
    say: [
      'First, under the hood. Prompts: the categories come first, the model must fill a strict form that code checks, every quote must appear word for word, and returning nothing is a correct answer. A small decision model sorts each call and gives a second opinion. A new prompt only ships if it passes the evals.',
      'When something fails: a bad answer is retried once with the errors, then the backup model takes over. Every call has a time limit. A quote that isn’t in the call is dropped. A run that stalls picks up where it stopped. What still fails is kept for a person. Past the spend cap, it replays a recorded run.',
      'The data: each insight is a typed record with its quote and where it sits in the call. Routing is a table. Every step is saved with its timing. And each viewer gets their own workspace.',
      'Measured, not vibes. Precision and recall for each type, on 48 hand-labelled files, split by how messy they are.',
      'v5 is a rewritten prompt, and it looks fine on recall. Try to promote it. It’s blocked on precision: 88.7% down to 59.7%. That’s under the 85% bar, and a 29-point drop. It labelled too many real sentences as feedback. Every quote was real, which is exactly why the quote check alone isn’t enough. It also costs more and is slower at p95. That’s shown, but not gated yet.',
      'Building the agent is half the job. Operating it is the other half. Signal Loop is one agent in Agent Ops. The exec view leads with hours returned. Then what that time is worth, against metered AI spend, not counting build time. The RFP Responder and the six-week history are simulated. This session is live.',
      'And this is your run, every step and model call on one trace: the same timings the conversation page drew.',
    ],
    click: ['Next; click Promote on the candidate; read the block.', 'Next through the exec view and the run’s trace.'],
  },
  trust: {
    time: '2:30',
    say: [
      'Rolling it out: discovery and a time study first. Then shadow mode, where nothing is sent. Then a few champions, then the whole team.',
      'It has to help the CSM, not replace them. They stay the advocate. When feedback ships, the credit goes back to them. It drafts notes and never sends them. People make the high-stakes calls.',
      'Trust comes from what you can check. Every quote is checked against the call. Anything uncertain waits for a person. Every decision is logged. A new prompt only ships if it passes the evals. There’s a spend cap. And I measure adoption from usage, not surveys.',
      'The hours saved number is an assumption, and the screen says so. The time study replaces it.',
    ],
    click: ['Left to right: roll it out, helpful, trust. Next.'],
  },
  future: {
    time: '2:30',
    say: [
      'Over 12 to 18 months: earn trust first, then every call by default, then capture during the call, then more analyses on the same platform, then specialist agents, then plugging into Invoca’s own Signal AI.',
      'More agents change the shape of it. One finds the feedback, one checks each claim, one decides who hears it. Agent Ops is how you run several agents like that.',
      'Faster, cheaper models change what’s worth doing. Read today’s cost per call off the card. At that price, reading every call beats sampling, the work can happen during the call, and each conversation can run more analyses.',
      'The production stack keeps the same parts: Vercel, Trigger.dev and Neon with pgvector, with real connectors in and the real Slack, Jira and Salesforce APIs out.',
      'Then your scorecard. Every number on it is counted from your own workspace and this session. Everything is unlocked after that. Explore freely; Resume presentation brings you back.',
    ],
    click: ['Read left to right. Next opens your scorecard; from there, Explore freely, or the write-up and Q&A.'],
  },
};

export const STEP_NOTES: Record<string, string> = {
  'operate.hood': 'Three columns: prompts, failures, data. Keep it short; the evals come next and prove the first column.',
  'call.platform': 'All four columns are on screen: walk them left to right, then Open the product.',
  'call.intro': 'Let them click Browse conversations. If driving, click it myself: “the only manual step, and it goes away in production.”',
  'call.pick': 'Recommend Brightline. If a panelist picks another file, say which branch it is and what to watch for.',
  'call.process': 'Name the branch out loud before pressing Process conversation.',
  'call.watch': 'The latency story starts here: running live, watch the clock. On a replay the Guide says so.',
  'call.privacy': 'Have them switch Before and After. Tokens keep meaning, drop identity. Only the redacted side reached a model.',
  'call.screen': 'A small, fast decision model from a different family reads it first. Security path: the planted instruction is just data, so it does nothing. Negative path: nothing actionable, so the extraction that started alongside is thrown away.',
  'call.ground': 'Stop here. Say the count out loud. On the current prompt every test quote matched, 275 of 275. The quote check is the seatbelt. Offer See a rejected quote only if it’s on screen.',
  'call.messy': 'Noise lowers confidence, so more goes to a person, not into a backlog.',
  'call.gate': '0.80 and up routes itself, 0.55 and up goes to review, lower is held. Severe bugs and churn risk are always reviewed. On a live run, each item shows the decision model’s second opinion.',
  'call.timing': 'Read the real numbers: triage alongside extraction, code steps under a millisecond. Then “See every call in Agent Ops”.',
  'call.clean': 'Clean notes are the baseline. Offer the messy one if there’s time.',
  'review.approve': 'Press A. That routes it, with an audit row.',
  'review.edit': 'Press E, change a field, Save and send. The correction becomes a test case.',
  'routing.rule': 'Route pricing objections over $250k ARR to the VP. No prompt changed.',
  'routing.delivery': 'Simulated tool, real content: the quote, the ARR, the owner tagged by handle, the receipt.',
  'routing.connections': 'Simulated connections, real routing: disconnect one and its rules go to triage.',
  'patterns.intro': 'Anecdote versus pattern. Read the theme name and account count off the Guide; it is the highlighted card. Open it.',
  'patterns.theme': 'ARR at stake, counted once per account; the trend; quotes that link back to the calls.',
  'patterns.ship': 'Play the PM; move it to Shipped. Watch who finds out.',
  'operate.promote': 'Let them click Promote. Pause for the block.',
  'operate.gate': 'Blocked on precision: under the 85% bar and a 29-point regression. Cost and p95 are worse too, shown but not gated yet.',
  'operate.kpis': 'Exec view: lead with hours returned. Value is set against metered AI spend, not counting build time. Baselines are labelled assumptions.',
  'operate.trace': 'Their run on one trace: steps, model calls, retries and deliveries.',
};
