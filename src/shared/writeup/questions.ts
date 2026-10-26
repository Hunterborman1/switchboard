/**
 * The Q&A, one page per topic (/backup/<id>): the detail behind the questions the panel is likely
 * to ask. The topics and their order match BACKUPS in src/tour/script/chapters.ts (a unit test
 * checks it), so the presenter view's Q&A buttons land on the right page. The page and its
 * Markdown (./markdown.ts) are both rendered from here.
 */
import { BUDGET_LIMIT_USD } from '../contracts.ts';
import { STANDARD_CHECKS } from '../platform-contracts.ts';
import type { CostShare, QuestionPage } from './types.ts';

/** Shares of AI spend measured across the 48 recorded runs (data/replays/*.json). */
const COST_SPLIT: CostShare[] = [
  { label: 'Quick screen', share: 0.23, note: 'A short check on every file' },
  { label: 'Finding the feedback', share: 0.68, note: 'The whole redacted transcript in, structured results out' },
  { label: 'Naming themes', share: 0.09, note: 'Only when a new theme forms' },
  { label: 'Similarity matching', share: 0, note: 'Runs on the hosting platform, not billed per call' },
  { label: 'Retries and backup model', share: 0, note: 'None needed in the 48 recorded runs, but budgeted anyway' },
];

export const QUESTION_PAGES: QuestionPage[] = [
  {
    id: 'cost',
    number: 1,
    title: 'Cost model',
    blurb: 'What one call costs, measured live, and what happens when the money runs out.',
    lede: 'What one call costs, measured on this deployment, and what happens when the money runs out.',
    blocks: [
      {
        kind: 'cost',
        // Mean cost and median run time of the 48 recorded runs (data/replays/*.json); a unit
        // test recomputes both so they cannot drift from the data.
        recorded: { perCallUsd: 0.00141, runs: 48, p50Ms: 2886 },
        limitText: `Viewers share a hard $${BUDGET_LIMIT_USD} limit. One limit is set at the AI provider. The app also checks before every run: spend so far, plus the run’s worst case. The key I use for building and testing has its own $20 limit and never serves viewers.`,
        replay: { title: 'At the limit it replays; it doesn’t break.', text: 'Every featured file has a recorded real run: its steps, results and timings. Once the money is spent, or if a live call fails or runs slow, the run replays that recording at real speed. The screen says “Replay of a recorded live run”. Your own uploads show a clear “Live AI limit reached” message.' },
        split: COST_SPLIT,
        splitNote: 'Measured on the 48 recorded runs, before the decision model. Triage now runs on a model at about a quarter of the cost, and the second opinion adds one small call per run. Each run’s trace page has its exact split.',
      },
      { kind: 'p', text: 'The recorded runs average $0.00141, about a seventh of a cent per call. At an assumed 3,000 calls a month, that comes to around $4. The real costs are review time, hosting and seats, which is why the review gate exists.' },
    ],
  },
  {
    id: 'security',
    number: 2,
    title: 'Security & PII',
    blurb: 'Redaction before any model, hidden instructions, access and isolation.',
    lede: 'I treat every transcript as hostile and personal by default. Here is what that means in practice.',
    blocks: [
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Personal and health details', bullets: ['Redaction runs before any model sees the text. It covers names, phone numbers, emails, card numbers, dates of birth, medical record numbers and addresses.', 'Each value becomes a placeholder like [PATIENT_1]. The original never leaves the server.', 'The browser only ever receives a masked preview (“J••• D••”).'] },
          { title: 'Hidden instructions', bullets: ['Transcript text is marked clearly as data, never as instructions.', 'The model can only fill in a fixed form and has no tools. A planted instruction has nothing to act on.', 'Suspected attempts are flagged at triage and written to the audit log.'] },
          { title: 'Access', bullets: ['A password, plus signed links that expire seven days after they’re issued.', 'The sign-in cookie only works on this site, can’t be read by scripts, and expires with the link.', 'I can revoke one link on its own, or all of them at once.'] },
          { title: 'Isolation', bullets: ['Every viewer gets their own workspace. Everyone sees the same sample data, and changes only go to your own copy.', 'One panelist’s rule change or approval never shows up for another.'] },
          { title: 'Providers and keys', bullets: ['Model calls only go to providers that don’t keep or train on the data. That is a routing setting, not yet a contract.', 'Contractual zero retention and a data agreement are production items.', 'Keys live only on the server. Nothing sensitive is ever sent to the browser.', 'There are limits per session and per run, on top of the spending limit.'] },
        ],
      },
      { kind: 'callout', text: 'In production I’d add three things before any real call reaches the system: a formal data review with Security, a data agreement with each provider, and a release check that measures how much personal data redaction actually catches.' },
    ],
  },
  {
    id: 'failure',
    number: 3,
    title: 'Failure handling',
    blurb: 'Retry, fall back, park it for a person, or replay. Every failure is visible.',
    lede: 'Things will fail. My goal is that every failure is visible, bounded and recoverable.',
    blocks: [
      {
        kind: 'flow',
        title: 'When the model’s answer is malformed',
        summary: 'Every field of the answer is checked. If the check fails, the model retries once with the errors. If that fails, the backup model answers. If that fails too, the conversation is parked on the Health page for a person. As soon as a step works, the run carries on.',
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
        cols: 3,
        items: [
          { title: 'Provider errors', text: 'Rate limits, outages and timeouts are retried, waiting a little longer each time. Every call has a time limit. A slow or failing main model hands over to the backup model.' },
          { title: 'A quote that isn’t in the call', text: 'If code can’t find a quote in the transcript, word for word or very nearly, the insight is dropped and counted as made up. It is never shown as fact.' },
          { title: 'Spending limit or live failure', text: 'The run replays a recorded real run at real speed, labelled on screen. The presentation works for all seven days regardless.' },
          { title: 'Partial failure', text: 'If Jira succeeds and Slack fails, the delivery reads as failed, with attempts and receipts per destination. Partial is not success.' },
          { title: 'Duplicates', text: 'Every upload gets a fingerprint. Uploading the same file again opens the same run, with no double insights.' },
          { title: 'Picking up where it stopped', text: 'The ten steps run on a fast path and save as they go. If a step fails or the run takes too long, a background job resumes from the last finished step.' },
        ],
      },
    ],
  },
  {
    id: 'build-vs-buy',
    number: 4,
    title: 'Build vs buy',
    blurb: 'Gong, Productboard, Enterpret and Invoca’s own Signal AI, compared fairly.',
    lede: 'A fair comparison. Each of these is good at something. None of them does this specific job end to end.',
    blocks: [
      {
        kind: 'table',
        label: 'Build vs buy',
        head: ['Option', 'Strength', 'Gap for this job', 'Cost and ownership'],
        widths: [20, 27, 31, 22],
        rows: [
          { head: 'Gong', sub: 'Conversation intelligence', cells: ['Excellent capture, transcription and search across calls. Sales teams already know it.', 'Built for deal coaching. It doesn’t own Invoca’s product taxonomy, routing rules or the loop back to CSMs.', 'Per-seat licence. The data lives in their platform.'] },
          { head: 'Productboard', sub: 'Feedback and roadmap', cells: ['A good place for PMs to link feedback to features and roadmap items.', 'It depends on people submitting and tagging notes. That is exactly the step that leaks today.', 'Per-maker licence. Another tool for CSMs to feed.'] },
          { head: 'Enterpret', sub: 'Feedback analytics', cells: ['Unifies sources and tags themes well. Strong for trend analysis.', 'Less about checked quotes, human review gates and routing to a named owner in their channel.', 'Platform contract. The taxonomy is partly theirs.'] },
          { head: 'Invoca Signal AI', sub: 'Invoca’s own conversation AI', cells: ['Already turns calls into signals at scale. Invoca owns the data, the models and the roadmap.', 'Pointed at customers’ calls today, not at Invoca’s internal CSM workflow and its owners.', 'Internal. The natural long-term home.'] },
        ],
      },
      {
        kind: 'cards',
        cols: 3,
        items: [
          { title: 'Prove the workflow first', text: 'The hard part isn’t transcription. It’s the taxonomy, the routing rules and closing the loop, and those are specific to Invoca.', accent: true },
          { title: 'Don’t build a recorder', text: 'Calls come from whatever Invoca already records with. In production, they’re pulled in automatically.' },
          { title: 'Long-term home', text: 'Most likely Signal AI and Invoca’s existing conversation data. This proof of concept is the spec for that.' },
        ],
      },
    ],
  },
  {
    id: 'metrics',
    number: 5,
    title: 'Success metrics',
    blurb: 'What I’d report every week, and the guardrails that block a release.',
    lede: 'What I’d report every week. Baselines marked “assumed” get replaced by the two-week time study before anyone sees a target.',
    blocks: [
      {
        kind: 'table',
        label: 'Success metrics',
        head: ['Metric', 'Baseline', 'Target', 'How it’s measured'],
        widths: [30, 18, 20, 32],
        accentCol: 1,
        rows: [
          { head: 'Capture rate', sub: 'Share of hand-labelled feedback the system finds on real calls', cells: ['About 40% (assumed)', '80% or more', 'Champions label a weekly sample of calls, compared with what the system found'] },
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
          { figure: '95% or more', title: 'Quotes found in the call', text: 'Quotes that match the transcript. Misses are counted, not hidden.' },
        ],
      },
    ],
  },
  {
    id: 'agent-ops',
    number: 6,
    title: 'Agent Ops',
    blurb: 'Running every agent: the registry, the nine-check standard, usage, logs and cost.',
    lede: 'Signal Loop is one agent, running inside Switchboard. Agent Ops is where it is run like a product. Execs and the AI team look there to see what’s running, who owns it, who uses it and what it returns.',
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
            note: 'Two agents today. The registry is built for fifty. Every one has a purpose, a record of the data it touches, a review schedule and a next review date.',
          },
          { title: 'The agent standard: nine checks', numbered: STANDARD_CHECKS.map((c) => c.label) },
        ],
      },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'Usage', text: 'Who uses each agent, when and how often. By role, by weekday and hour, and retention by cohort, with a live panel of who’s in it right now.' },
          { title: 'Logs and reliability', text: 'Every run has its logs and a timeline of its steps. Reliability targets have alerts that say what was expected, what happened, who owns it and what to do.' },
          { title: 'Cost', text: 'AI cost per agent and per unit of work, next to the value of the time returned. So “is it worth it” has a number.' },
          { title: 'Review cadence', text: 'Each agent has a review date. Overdue reviews show up in “needs attention”, next to missed targets and gaps in the standard.' },
        ],
      },
      { kind: 'callout', tone: 'warning', title: 'How hours returned are counted.', text: 'For each unit of work: the minutes it used to take, minus the minutes a person now spends reviewing it. The “used to take” minutes are labelled assumptions until a two-week time study replaces them. Review minutes are measured, not estimated.' },
      {
        kind: 'cards',
        cols: 1,
        items: [{ title: 'What the monthly executive report says', text: 'Agents in production, active users and the trend. Hours returned and what they’re worth, AI cost and return. What needs attention and who owns it. And what changed (prompts, models, thresholds), with the test result that allowed it.' }],
      },
      { kind: 'action', to: '/ops', label: 'Open Agent Ops' },
    ],
  },
  {
    id: 'differently',
    number: 7,
    title: 'What I’d do differently',
    blurb: 'The honest limits of this build, and what I’d change in a real rollout.',
    lede: 'What I’d change, and what this build doesn’t prove yet.',
    blocks: [
      {
        kind: 'cards',
        cols: 3,
        items: [
          { title: 'Synthetic data', text: 'Every account, call and person is fictional. Realistic and hand-checked, but not Invoca’s actual calls. The first real test is shadow mode on real ones.' },
          { title: 'Assumptions, labelled', text: '“4 of 10 reach an owner” and the baseline admin minutes are assumptions. A two-week time study with two CSMs replaces them.' },
          { title: 'Mock destinations', text: 'Slack, Jira and Linear are faithful mocks with receipts and retries, not real integrations.' },
          { title: 'Two models only', text: 'A main model, and a second one that judges and stands in as backup. Fine for a proof of concept. In production I’d re-run the speed and quality comparison every quarter.' },
          { title: 'Themes need history', text: 'Grouping looks good because about 220 older transcripts were loaded first. On day one with real data, themes are thin for a few weeks.' },
          { title: 'Small test set', text: '48 hand-checked files catch a big drop like the latest candidate’s, not the gap between two good prompts. None are held back yet. The set should grow from reviewers’ edits.' },
        ],
      },
      {
        kind: 'cards',
        cols: 2,
        items: [
          { title: 'In a real rollout, first', accent: true, bullets: ['Agree the categories with CSMs and PMs before writing a prompt.', 'Run in shadow mode before anyone sees a screen, and compare its output with CSM notes quietly.', 'Agree the success metrics and the review cadence with the business owner.'] },
          { title: 'With more time', bullets: ['Less polish on the theme graph. Real Slack and Jira connections, switched on gradually.', 'A labelled set of health-data calls, so redaction is measured before every release.', 'Reviewers’ edits flowing automatically into the test set.'] },
        ],
      },
    ],
  },
];

export const QUESTION_IDS = QUESTION_PAGES.map((q) => q.id);

export const questionPage = (id: string): QuestionPage | undefined => QUESTION_PAGES.find((q) => q.id === id);
