/**
 * The write-up and its Q&A: one source for the page (/write-up, src/web/pages/WriteUp.tsx) and
 * the Markdown for AI assistants (/write-up.md, the docs .zip and MCP read_doc, via
 * ./markdown.ts). Plain data, no React and no Worker imports, so both sides can load it.
 *
 * Inline text supports two marks only: **bold** and [label](href). An href is a site route
 * ("/ops"), an anchor on this page ("#cost") or an absolute URL.
 */
import { BUDGET_LIMIT_USD } from '../contracts.ts';
import { STANDARD_CHECKS } from '../platform-contracts.ts';
import { REPO_URL } from '../platform.ts';

// ---------------------------------------------------------------- types

export type CardItem = {
  /** A small accent label above the title ("In", "Week 0"). */
  kicker?: string;
  /** A large accent figure above the title (a guardrail's target). */
  figure?: string;
  title: string;
  text?: string;
  bullets?: string[];
  numbered?: string[];
  /** Registry rows: a name, its status and a few facts. */
  entries?: { title: string; status: { label: string; tone: 'success' | 'neutral' }; meta: string[] }[];
  /** A quieter closing line under the body. */
  note?: string;
  /** The recommended or most important card in a group. */
  accent?: boolean;
};

export type TableRow = { head: string; sub?: string; cells: string[] };

export type FlowStep = { title: string; text: string; when?: string; ok?: string; last?: boolean };

export type CostShare = { label: string; share: number; note: string };

export type CostBlock = {
  kind: 'cost';
  /** Recorded values: what the Markdown states and what the page falls back to. */
  recorded: { perCallUsd: number; runs: number; p50Ms: number };
  limitText: string;
  /** What happens at the limit: shown with the limit. */
  replay: { title: string; text: string };
  split: CostShare[];
  splitNote: string;
};

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'callout'; tone?: 'neutral' | 'warning'; title?: string; text: string }
  | { kind: 'cards'; cols?: 1 | 2 | 3 | 4; items: CardItem[] }
  | { kind: 'steps'; items: { title: string; text: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; label: string; head: string[]; rows: TableRow[]; accentCol?: number; /** Column widths in percent, for the page. */ widths?: number[] }
  | { kind: 'h3'; text: string }
  | { kind: 'flow'; title: string; summary: string; steps: FlowStep[] }
  | { kind: 'related'; label: string; links: { to: string; label: string }[] }
  | { kind: 'action'; to: string; label: string }
  | CostBlock;

export type Section = {
  id: string;
  /** "Part 1", "Question 3". */
  kicker: string;
  title: string;
  /** The contents entry, when shorter than the title. */
  nav?: string;
  lede?: string;
  blocks: Block[];
};

// ---------------------------------------------------------------- inline marks

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

const MARKS = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(MARKS)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: s.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2] ?? '', href: m[3] ?? '' });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

/** The text without marks: for titles, aria labels and tests. */
export const plain = (s: string): string =>
  parseInline(s)
    .map((p) => p.text)
    .join('');

// ---------------------------------------------------------------- hero

export const HERO = {
  kicker: 'Option 3, the feedback loop',
  title: 'Every call is a signal.',
  lede: 'Built from scratch in 48 hours by Hunter Borman. Switchboard reads any customer conversation, decides what it is, runs the analyses that apply and sends the result to the right people in their own tools. Signal Loop is the analysis built for this brief: what customers tell Invoca’s CSMs becomes product insight with the quote attached, sent to the person who can act on it.',
  facts: ['All of the AI is built and working, not a mock-up', 'Fictional data and simulated connections, labelled as such', 'Assumptions marked on the page', `Source code on [GitHub](${REPO_URL})`],
};

// ---------------------------------------------------------------- the write-up

const STACK: TableRow[] = [
  { head: 'Website and API', cells: ['Cloudflare Worker and a React app', 'Vercel with Next.js'] },
  { head: 'AI model calls', cells: ['Vercel AI SDK through a shared router', 'Vercel AI SDK with our own provider keys'] },
  { head: 'Deciding what to run', cells: ['A fast decision model via OpenRouter', 'The same, on our own key'] },
  { head: 'Long-running jobs', cells: ['Cloudflare Workflows', 'Trigger.dev'] },
  { head: 'Database', cells: ['Cloudflare D1', 'Neon Postgres'] },
  { head: 'Finding similar feedback', cells: ['Cloudflare Vectorize', 'pgvector on Neon'] },
  { head: 'Original files', cells: ['Cloudflare R2', 'Object storage'] },
  { head: 'Reporting at scale', cells: ['Daily summaries in D1', 'ClickHouse with dbt models'] },
  { head: 'Bringing in conversations', cells: ['Any file, plus connectors (simulated here)', 'dlt from Gong, Zoom, Salesforce and Zendesk, plus direct connectors'] },
  { head: 'Sending results', cells: ['In-app previews with receipts (simulated)', 'The Slack, Jira and Salesforce APIs'] },
  { head: 'Live transcription', cells: ['Not needed yet', 'Render, streaming speech to text'] },
];

export const PARTS: Section[] = [
  {
    id: 'problem',
    kicker: 'Part 1',
    title: 'The problem and the people',
    blocks: [
      { kind: 'p', text: 'Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered them. It comes up on every QBR, renewal and check-in. Most of it never reaches the person who could act on it. It lives in a notes field, a Slack thread that scrolls away, or a CSM’s memory.' },
      { kind: 'callout', tone: 'warning', title: 'Assumption', text: 'Roughly 4 of 10 pieces of feedback reach an owner today. That’s illustrative, not measured. The first thing I’d do is a 2-week time study with two CSMs to replace it with a real number.' },
      { kind: 'p', text: 'Before any architecture, I asked who hires this system and for what:' },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'CSM', text: 'When a customer tells me something the product team should hear, I want it captured, routed and tracked without retyping it, so I can stay present and show I advocated for them.' },
          { title: 'Product Manager', text: 'When I’m planning next quarter, I want real evidence grouped by theme with ARR attached, so I can prioritise on signal, not volume.' },
          { title: 'VP Product', text: 'When renewals or competitive pressure shift, I want an honest cross-account view, so I can make and defend portfolio calls.' },
          { title: 'Sales, competitive and support leads', text: 'When a competitor, pricing objection or repeat bug comes up, I want it in my channel the same day, so I can act before it costs a deal.' },
        ],
      },
      { kind: 'p', text: 'The emotional job matters most: **be the advocate, not the stenographer.** CSMs keep the relationship and the judgement; the system takes the data entry and makes their advocacy visible. If it doesn’t do that, CSMs won’t feed it.' },
      { kind: 'p', text: 'Why this option: Invoca already turns its customers’ calls into signals. This points the same discipline inward, at Invoca’s own CSM conversations. The data exists, the work is internal and additive, and it can show value in weeks.' },
    ],
  },
  {
    id: 'platform',
    kicker: 'Part 2',
    title: 'Switchboard: any conversation in, the right people out',
    nav: 'Switchboard',
    blocks: [
      { kind: 'p', text: 'Feedback doesn’t only arrive on calls. So Signal Loop runs inside a small platform, Switchboard, that does the parts every analysis needs: bring a conversation in, work out what it is, and get the result to the right person.' },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { kicker: 'In', title: 'Any conversation', text: 'Connectors for Gong, Zoom, Gmail, Slack and Google Drive, or any uploaded file: PDF, Word, slides, transcripts, email and chat exports. Binary formats are converted to text in the browser.' },
          { kicker: 'Decide', title: 'A fast decision model reads it first', text: 'What kind of document it is, how messy it is, which analyses apply, and whether anyone is trying to trick the model.' },
          { kicker: 'Analyse', title: 'Only what applies runs', text: 'Signal Loop is built. Follow-ups, renewal risk, escalations, compliance review and call coaching are listed in the catalog and marked “Not built”.' },
          { kicker: 'Out', title: 'The right people, in their tools', text: 'Jira, Linear, Slack, Teams, Salesforce, email and Google Drive, tagging each owner by their own handle in that tool.' },
        ],
      },
      { kind: 'p', text: '**Why a decision model.** A small, fast model from a different family does the first read on every input: 0.9 seconds at the median in the speed test, run alongside extraction so it adds no time to a run, at about a quarter of the old screen’s cost, and it says more (what the input is, how noisy, which analyses apply). It earns its keep a second time at the review gate: its independent second opinion can send a borderline item straight to its owner when it agrees, or hold an item that would have gone automatically when it disagrees. That means fewer items waiting for review without lowering the bar. High-stakes items (churn risk, critical bugs, flagged files) are always reviewed by a person, and every insight still needs a quote that code finds in the transcript.' },
      { kind: 'p', text: '**Connectors and people.** The connectors are simulated: connecting one records a workspace connection, and deliveries render as in-app previews with receipts. Nothing leaves the system, and the product says so. A people directory holds each person’s handle in each tool, so a delivery mentions @jordan.reyes in Slack and assigns Nina Patel in Jira, and you can act as anyone in it to see their view.' },
    ],
  },
  {
    id: 'system',
    kicker: 'Part 3',
    title: 'Signal Loop, the analysis built for this brief',
    nav: 'Signal Loop',
    blocks: [
      { kind: 'p', text: 'Every conversation goes through ten steps. Each step records what it did, how long it took and what it cost, and the screen is drawn from those records, so what you watch is the real run.' },
      {
        kind: 'steps',
        items: [
          { title: 'Bring in', text: 'The file is fingerprinted, so uploading it twice does nothing new.' },
          { title: 'Read', text: 'Transcripts, notes, emails, chats and documents are split into who said what.' },
          { title: 'Redact', text: 'Personal and health details are replaced before any AI model sees the text.' },
          { title: 'Triage', text: 'The decision model says what it is, which analyses apply, and whether anyone is trying to trick the model.' },
          { title: 'Extract', text: 'Each piece of feedback comes back with its type, area, severity, the exact quote and how confident the model is. Long documents are split and read in parallel.' },
          { title: 'Check the quote', text: 'Code, not the model, looks for every quote in the transcript. A quote it can’t find is dropped and counted.' },
          { title: 'Gate', text: 'Confident items go straight to the owner, uncertain ones go to a person, the rest are held. The decision model’s second opinion can move a borderline item either way. Serious bugs and churn risk always go to a person.' },
          { title: 'Group', text: 'Similar feedback is grouped into themes by meaning; the model only names the theme.' },
          { title: 'Route', text: 'An editable table of rules decides who hears what, never the prompt. Anything without a match goes to triage.' },
          { title: 'Deliver', text: 'To the owner’s tool, tagged by their handle, with receipts and retries (simulated here). When a ticket ships, the CSM is told, with a drafted note for the customer.' },
        ],
      },
      { kind: 'p', text: '**Proving it.** Quality tests measure how often it’s right and how much it finds, against 48 hand-checked sample files, from clean notes to raw speech-to-text and forwarded email threads, plus hard cases: a hidden instruction, a call full of health details, a call with nothing in it. A new prompt goes live only if it holds the bar on accuracy, coverage, the messiest files, quote checks and every safety check, and drops no score by more than 2 points. The latest candidate was blocked: accuracy fell from 88.7% to 59.7%, under the 85% bar. Its quotes were real; it labelled ordinary sentences as feedback. It was also slower and more expensive, which is reported but not yet a blocker.' },
      { kind: 'p', text: `**Cost and failure.** Viewers share a hard $${BUDGET_LIMIT_USD} limit on live AI, enforced by the provider and by the app. At the limit, or if a live call fails, runs replay a recorded real run, labelled on screen, so it never becomes an outage. If the model’s answer is malformed, it retries once, then switches to a backup model, then parks the conversation on the Health page for a person.` },
      {
        kind: 'related',
        label: 'Related questions',
        links: [
          { to: '#cost', label: 'Cost model' },
          { to: '#security', label: 'Security and PII' },
          { to: '#failure', label: 'Failure handling' },
        ],
      },
    ],
  },
  {
    id: 'rollout',
    kicker: 'Part 4',
    title: 'Rollout and adoption',
    blocks: [
      { kind: 'p', text: 'Trust is earned in phases, and adoption is measured, not surveyed.' },
      {
        kind: 'cards',
        cols: 4,
        items: [
          { kicker: 'Week 0', title: 'Discovery', text: 'Shadow two CSMs. Run the time study. Co-design the taxonomy with CSMs and PMs.' },
          { kicker: 'Weeks 1–2', title: 'Shadow mode', text: 'Runs quietly; CSMs compare its output with their own notes. Nothing is sent.' },
          { kicker: 'Weeks 3–6', title: 'Champions', text: '2–3 volunteer CSMs and one PM, with a weekly calibration on misses and noise.' },
          { kicker: 'Week 7+', title: 'Whole team', text: 'Confident items go straight to the owner; everything else goes to review.' },
        ],
      },
      { kind: 'p', text: '**Trust mechanics:** a quote on every insight, a one-click “this is wrong”, precision published weekly, high-stakes items always reviewed, and CSMs credited when their feedback ships.' },
      { kind: 'p', text: '**Additive, not replacement.** It takes over the data entry, not the judgement. CSMs keep the relationship and the final call.' },
      { kind: 'p', text: '**Operating it.** Signal Loop reports its logs, timings, usage and units of work into Agent Ops. That’s where I’d measure weekly active reviewers, capture rate and time to owner, and report hours returned to executives: the time each call used to take, minus the time people now spend reviewing, with the baselines labelled as assumptions until the time study. It has a named owner, a review cadence, and meets the same nine-check agent standard in the build that I’d hold every builder’s agent to; its security review and business-owner sign-off are illustrative until Invoca Security does the real one.' },
      {
        kind: 'related',
        label: 'Related questions',
        links: [
          { to: '#metrics', label: 'Success metrics' },
          { to: '#agent-ops', label: 'Agent Ops' },
          { to: '/ops', label: 'Open Agent Ops' },
        ],
      },
    ],
  },
  {
    id: 'next',
    kicker: 'Part 5',
    title: 'What’s next',
    blocks: [
      { kind: 'p', text: 'Over the next 12–18 months, the same design gets cheaper, faster and closer to the conversation:' },
      {
        kind: 'list',
        items: [
          'Cheaper, faster models making it economical to read every call, straight from the recorder and CRM, not a sample.',
          'Real-time, in-call capture instead of after-the-fact processing.',
          'More analyses on the same platform: follow-ups, renewal risk and escalations first, then compliance review and call coaching, each with its own tests and owner.',
          'Specialist agents (extractor, critic, router) checking each other, and drafted specs and customer replies from a theme, reviewed by the owner.',
          'Plugging into Invoca’s own Signal AI and conversation data as the long-term home.',
        ],
      },
      { kind: 'p', text: 'What stays the same: quotes grounded in code, gates on high-stakes output, routing as data, and human judgement where it counts.' },
      { kind: 'p', text: '**From proof of concept to production.** The proof of concept runs entirely on Cloudflare. The production design keeps the same boundaries on a stack built for scale, all strict TypeScript:' },
      { kind: 'table', label: 'From proof of concept to production', head: ['Job', 'Today (deployed)', 'In production'], rows: STACK, accentCol: 1 },
      {
        kind: 'related',
        label: 'Related questions',
        links: [
          { to: '#build-vs-buy', label: 'Build vs buy' },
          { to: '#differently', label: 'What I’d do differently' },
        ],
      },
    ],
  },
  {
    id: 'role',
    kicker: 'The role',
    title: 'How this maps to AI Operations',
    nav: 'How this maps to the role',
    blocks: [
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Build agents', text: 'Signal Loop is a working agent: redaction, a decision model for triage and second opinions, structured extraction, quotes checked in code, review gates, routing and quality tests.' },
          { title: 'Own the platform', text: 'Switchboard for the work (intake, triage, delivery, people) and Agent Ops for operating it: a registry, review dates, usage, logs, reliability targets, alerts and cost for every agent, not just mine.' },
          { title: 'Raise the bar for builders', text: 'A nine-check agent standard, templates and office hours, so a Claude or Gumloop build gets to production safely.' },
          { title: 'Report impact', text: 'Adoption, hours returned, what it costs and what it’s worth, with the assumptions labelled.' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------- questions and answers

export const QUESTIONS_INTRO: Section = {
  id: 'questions',
  kicker: 'Questions and answers',
  title: 'The detail behind the likely questions',
  lede: 'Cost, security, failure, build vs buy, success metrics, how every agent is operated, and what I’d change. The cost figures are read live from this deployment.',
  blocks: [],
};

/** Shares of AI spend measured across the 48 recorded runs (data/replays/*.json). */
const COST_SPLIT: CostShare[] = [
  { label: 'Quick screen', share: 0.23, note: 'A short check on every file' },
  { label: 'Finding the feedback', share: 0.68, note: 'The whole redacted transcript in, structured results out' },
  { label: 'Naming themes', share: 0.09, note: 'Only when a new theme forms' },
  { label: 'Similarity matching', share: 0, note: 'Runs on the hosting platform, not billed per call' },
  { label: 'Retries and backup model', share: 0, note: 'None needed in the 48 recorded runs; budgeted anyway' },
];

export const QUESTIONS: Section[] = [
  {
    id: 'cost',
    kicker: 'Question 1',
    title: 'Cost model',
    lede: 'What one call costs, measured on this deployment, and what happens when the money runs out.',
    blocks: [
      {
        kind: 'cost',
        // Mean cost and median run time of the 48 recorded runs (data/replays/*.json); a unit
        // test recomputes both so they cannot drift from the data.
        recorded: { perCallUsd: 0.00141, runs: 48, p50Ms: 2886 },
        limitText: `Viewers share a hard $${BUDGET_LIMIT_USD} limit: one set at the AI provider, plus a check inside the app before every run (spend so far plus the run’s worst case). The key used for building and testing has its own $20 limit and never serves viewers.`,
        replay: { title: 'At the limit it replays; it doesn’t break.', text: 'Every featured file has a recorded real run (its steps, results and timings). Once the money is spent, or if a live call fails or runs slow, the run replays that recording at real speed and says “Replay of a recorded live run” on screen. Your own uploads show a clear “Live AI limit reached” message.' },
        split: COST_SPLIT,
        splitNote: 'Measured on the 48 recorded runs, before the decision model. Triage now runs on a model about a quarter of the cost, and the second opinion adds one small call per run. The exact split for every run is on its trace page.',
      },
    ],
  },
  {
    id: 'security',
    kicker: 'Question 2',
    title: 'Security and PII',
    lede: 'Treat the transcript as hostile and personal by default. Here’s what that means concretely.',
    blocks: [
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Personal and health details', bullets: ['Redaction runs before any model sees the text: names, phone numbers, emails, card numbers, dates of birth, medical record numbers, addresses.', 'Each value becomes a placeholder like [PATIENT_1]; the original never leaves the server.', 'The browser only ever receives a masked preview (“J••• D••”).'] },
          { title: 'Hidden instructions', bullets: ['Transcript text is marked clearly as data, never as instructions.', 'The model can only fill in a fixed form and has no tools, so a planted instruction has nothing to act on.', 'Suspected attempts are flagged by the screening step and written to the audit log.'] },
          { title: 'Access', bullets: ['A password, plus signed links that expire seven days after they’re issued.', 'The sign-in cookie only works on this site, can’t be read by scripts, and expires with the link.', 'Revoke one link on its own, or all of them at once.'] },
          { title: 'Isolation', bullets: ['Every viewer gets their own workspace. Everyone sees the same sample data; changes only ever go to your own copy.', 'One panelist’s rule change or approval never shows up for another.'] },
          { title: 'Providers and keys', bullets: ['Model calls only go to providers that don’t keep or train on the data (a routing setting, not yet a contract). Contractual zero retention and a data agreement are production items.', 'Keys live only on the server; nothing sensitive is ever sent to the browser.', 'Limits per session and per run, on top of the spending limit.'] },
        ],
      },
      { kind: 'callout', text: 'In production I’d add a formal data review with Security before any real call reaches the system, a data agreement with each provider, and a release check that measures how much personal data redaction actually catches.' },
    ],
  },
  {
    id: 'failure',
    kicker: 'Question 3',
    title: 'Failure handling',
    lede: 'Things will fail. The design goal is that every failure is visible, bounded and recoverable.',
    blocks: [
      {
        kind: 'flow',
        title: 'When the model’s answer is malformed',
        summary: 'The answer is checked field by field. If the check fails, the model retries once with the errors; if that fails, the backup model answers; if that fails too, the conversation is parked on the Health page for a person. As soon as a step works, the run carries on.',
        steps: [
          { title: 'Model answer', text: 'A filled-in form' },
          { title: 'Check the form', text: 'Every field validated', ok: 'Passes: carry on' },
          { title: 'Retry once', text: 'With the errors', when: 'If the check fails', ok: 'Works: carry on' },
          { title: 'Backup model', text: 'A second provider', when: 'If the retry fails', ok: 'Works: carry on' },
          { title: 'Parked for a person', text: 'On the Health page', when: 'If the backup fails', last: true },
        ],
      },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Provider errors', text: 'Rate limits, outages and timeouts are retried, waiting a little longer each time. Every call has a time limit. A slow or failing main model hands over to the backup model.' },
          { title: 'A quote that isn’t in the call', text: 'If a quote can’t be found in the transcript, word for word or very nearly, the insight is dropped and counted as made up. It’s never shown as fact.' },
          { title: 'Spending limit or live failure', text: 'The run replays a recorded real run at real speed, labelled on screen. The presentation works for all seven days regardless.' },
          { title: 'Partial failure', text: 'If Jira succeeds and Slack fails, the delivery reads as failed, with attempts and receipts per destination. Partial is not success.' },
          { title: 'Duplicates', text: 'Every upload gets a fingerprint. Uploading the same file again opens the same run, with no double insights.' },
          { title: 'Picking up where it stopped', text: 'The ten steps run on a fast path and save as they go. If a step fails or the run takes too long, a background job resumes from the last finished step, not from scratch.' },
        ],
      },
    ],
  },
  {
    id: 'build-vs-buy',
    kicker: 'Question 4',
    title: 'Build vs buy',
    lede: 'A fair comparison. Each of these is good at something; none of them does this specific job end to end.',
    blocks: [
      {
        kind: 'table',
        label: 'Build vs buy',
        head: ['Option', 'Strength', 'Gap for this job', 'Cost and ownership'],
        widths: [20, 26, 32, 22],
        rows: [
          { head: 'Gong', sub: 'Conversation intelligence', cells: ['Excellent capture, transcription and search across calls. Sales teams already know it.', 'Built for deal coaching. It doesn’t own Invoca’s product taxonomy, routing rules or loop-closing back to CSMs.', 'Per-seat licence; data lives in their platform.'] },
          { head: 'Productboard', sub: 'Feedback and roadmap', cells: ['Good place for PMs to link feedback to features and roadmap items.', 'Depends on people submitting and tagging notes, which is exactly the step that leaks today.', 'Per-maker licence; another tool for CSMs to feed.'] },
          { head: 'Enterpret', sub: 'Feedback analytics', cells: ['Unifies sources and auto-tags themes well; strong for trend analysis.', 'Less about per-insight grounding, human review gates and routing to a named owner in their channel.', 'Platform contract; taxonomy partly theirs.'] },
          { head: 'Invoca Signal AI', sub: 'Invoca’s own conversation AI', cells: ['Already turns calls into signals at scale. Invoca owns the data, the models and the roadmap.', 'Pointed at customers’ calls today, not at Invoca’s internal CSM workflow and its owners.', 'Internal; the natural long-term home.'] },
        ],
      },
      {
        kind: 'cards',
        cols: 3,
        items: [
          { title: 'Prove the workflow first', text: 'The hard part isn’t transcription. It’s the taxonomy, the routing rules and closing the loop, and those are Invoca-specific.', accent: true },
          { title: 'Don’t build a recorder', text: 'Calls come from whatever Invoca already records with. In production, they’re pulled in automatically.' },
          { title: 'Long-term home', text: 'Most likely Signal AI and Invoca’s existing conversation data. This proof of concept is the spec for that.' },
        ],
      },
    ],
  },
  {
    id: 'metrics',
    kicker: 'Question 5',
    title: 'Success metrics',
    lede: 'What I’d report every week. Baselines marked “assumed” get replaced by the 2-week time study before anyone sees a target.',
    blocks: [
      {
        kind: 'table',
        label: 'Success metrics',
        head: ['Metric', 'Baseline', 'Target', 'How it’s measured'],
        widths: [30, 18, 20, 32],
        accentCol: 1,
        rows: [
          { head: 'Capture rate', sub: 'Share of hand-labelled feedback the system finds on real calls', cells: ['About 40% (assumed)', '80% or more', 'A weekly sample of calls labelled by champions, compared with what the system found'] },
          { head: 'Time to owner', sub: 'From the customer saying it to the named owner having it', cells: ['Days, or never', 'Under 1 business day', 'Delivery receipts minus the time of the call'] },
          { head: 'Accuracy of what’s sent', sub: 'Items the owner agrees are real and correctly labelled', cells: ['Not measured', '90% or more', '“This is wrong” clicks and review outcomes'] },
          { head: 'Decisions citing evidence', sub: 'Roadmap items that link to at least one checked quote', cells: ['Unknown', 'Half, within two quarters', 'Jira and Linear links back to insights'] },
          { head: 'CSM minutes saved', sub: 'Admin minutes per call before, minus review minutes now', cells: ['18 minutes per call (assumed)', '70% removed', 'Agent Ops: time before minus time now, per call'] },
          { head: 'Weekly active reviewers', sub: 'People who approve, edit or reject at least once a week', cells: ['None', 'Every champion, then every CSM', 'Agent Ops usage data'] },
        ],
      },
      { kind: 'h3', text: 'Guardrails that block a release' },
      {
        kind: 'cards',
        cols: 3,
        items: [
          { figure: '5% or less', title: 'Made-up feedback', text: 'Insights invented on calls that have nothing in them' },
          { figure: '100%', title: 'Hidden instructions', text: 'Planted instructions flagged, and the results unaffected' },
          { figure: '95% or more', title: 'Quotes found in the call', text: 'Quotes that match the transcript; misses are counted, not hidden' },
        ],
      },
    ],
  },
  {
    id: 'agent-ops',
    kicker: 'Question 6',
    title: 'Agent Ops',
    lede: 'Signal Loop is one agent, running inside Switchboard. Agent Ops is where it is operated: the place an exec and the AI team look to see what’s running, who owns it, who uses it, and what it returns.',
    blocks: [
      {
        kind: 'cards',
        cols: 2,
        items: [
          {
            title: 'Registry',
            entries: [
              { title: 'Signal Loop', status: { label: 'Live', tone: 'success' }, meta: ['Built in code', 'Customer Success', 'Named owner and business owner'] },
              { title: 'RFP & Security Questionnaire Responder', status: { label: 'Simulated', tone: 'neutral' }, meta: ['Built in Gumloop', 'Sales', 'Named owner and business owner'] },
            ],
            note: 'Two agents today; the registry is built for fifty. Every one has a purpose, a record of the data it touches, a review schedule and a next review date.',
          },
          { title: 'The agent standard: nine checks', numbered: STANDARD_CHECKS.map((c) => c.label) },
        ],
      },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Usage', text: 'Who uses each agent, when and how often: by role, by weekday and hour, retention by cohort, and a live panel of who’s in it right now.' },
          { title: 'Logs and reliability', text: 'Every run has its logs and a timeline of its steps. Reliability targets have alerts that say what was expected, what happened, who owns it and what to do.' },
          { title: 'Cost', text: 'AI cost per agent and per unit of work, next to the value of the time returned, so “is it worth it” has a number.' },
          { title: 'Review cadence', text: 'Each agent has a review date. Overdue reviews show up in “needs attention” next to missed targets and gaps in the standard.' },
        ],
      },
      { kind: 'callout', tone: 'warning', title: 'How hours returned are counted.', text: 'For each unit of work: the minutes it used to take, minus the minutes a person now spends reviewing it. The “used to take” minutes are labelled assumptions until a two-week time study replaces them. Review minutes are measured, not estimated.' },
      { kind: 'p', text: '**What the monthly executive report says.** Agents in production, active users and the trend, hours returned and what they’re worth, AI cost and return, what needs attention and who owns it, and what changed (prompts, models, thresholds) with the test result that allowed it.' },
      { kind: 'action', to: '/ops', label: 'Open Agent Ops' },
    ],
  },
  {
    id: 'differently',
    kicker: 'Question 7',
    title: 'What I’d do differently',
    lede: 'What I’d change, and what this build doesn’t prove yet.',
    blocks: [
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Synthetic data', text: 'Every account, call and person is fictional. Realistic, hand-checked, but not Invoca’s actual calls. The first real test is shadow mode on real ones.' },
          { title: 'Assumptions, labelled', text: '“4 of 10 reach an owner” and the baseline admin minutes are assumptions. A 2-week time study with two CSMs replaces them.' },
          { title: 'Mock destinations', text: 'Slack, Jira and Linear are faithful mocks with receipts and retries, not real integrations.' },
          { title: 'Two models only', text: 'A main model, and a second one that judges and stands in as backup. Fine for a proof of concept; in production I’d re-run the speed and quality comparison every quarter.' },
          { title: 'Themes need history', text: 'Grouping looks good because about 220 older transcripts were loaded first. On day one with real data, themes are thin for a few weeks.' },
          { title: 'Small test set', text: '48 hand-checked files are enough to catch a big drop like the latest candidate’s, not to tell two good prompts apart, and none are held back yet. It should grow from reviewers’ edits.' },
        ],
      },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'In a real rollout, first', accent: true, bullets: ['Agree the categories with CSMs and PMs before writing a prompt.', 'Run in shadow mode before anyone sees a screen: compare its output with CSM notes quietly.', 'Agree the success metrics and the review cadence with the business owner.'] },
          { title: 'With more time', bullets: ['Less polish on the theme graph; real Slack and Jira connections, switched on gradually.', 'A labelled set of health-data calls, so redaction is measured before every release.', 'Reviewers’ edits flowing automatically into the test set.'] },
        ],
      },
    ],
  },
];

export const QUESTION_IDS = QUESTIONS.map((q) => q.id);

/** Every anchor on the page, in order: the parts, the Q&A heading, then each question. */
export const SECTIONS: Section[] = [...PARTS, QUESTIONS_INTRO, ...QUESTIONS];

export const WRITEUP_TITLE = 'Switchboard: the write-up and Q&A';
