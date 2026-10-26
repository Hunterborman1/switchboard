/**
 * The write-up, one page per chapter of the presentation (/write-up/<id>). The ten chapters
 * answer the brief's four questions (./brief.ts): process design (1–2), the build (3–8),
 * stakeholder management (9) and the future (10). Each page tells the chapter's story, then
 * adds what the screen leaves out: decisions and trade-offs, numbers with their sources, honest
 * gaps and the questions people ask. The detail comes from docs/WALKTHROUGH.md; the page and its
 * Markdown (./markdown.ts) are both rendered from here.
 *
 * Write it the way Hunter would explain it to a colleague: first person, plain words, short
 * sentences. Keep every number exactly as its source has it, and mark assumptions. A number and
 * its unit are joined by a no-break space ( ), so "1,465 ms" never splits across lines.
 */
import { REPO_URL } from '../platform.ts';
import { STANDARD_CHECKS } from '../platform-contracts.ts';
import { src, srcs } from './site.ts';
import type { ChapterPage, TableRow } from './types.ts';

const NUMBERS_HEAD = ['Figure', 'Value', 'Source'];
const NUMBERS_WIDTHS = [28, 46, 26];

/** The production stack, today's piece beside each (chapter 10). */
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

export const CHAPTER_PAGES: ChapterPage[] = [
  // ============================================================ Introduction
  {
    id: 'signal',
    number: 1,
    group: 'Introduction',
    question: 1,
    title: 'Every call is a signal',
    summary: 'One sentence from a 13-minute call belongs on the roadmap. Most feedback like it gets lost today.',
    lede: 'One sentence in a 13-minute QBR belongs on the roadmap. Today, most feedback like it never reaches the person who could act on it. This chapter is about that sentence and where it gets lost.',
    sections: [
      {
        id: 'story',
        title: 'The sentence',
        blocks: [
          { kind: 'p', text: 'The scene opens on a fictional quarterly review with Brightline Home Services. It runs 13 minutes and has three speakers. At 06:00, Jeff Kim says this:' },
          { kind: 'quote', text: 'CallRail’s been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day.', cite: 'Jeff Kim, Brightline Home Services, at 06:00 in the call' },
          { kind: 'p', text: 'That is a competitor offer, and Brightline renews in 12 weeks. Competitive intel and the product owner should hear it today. Signal Loop finds the sentence, names what it is and sends it to them with the quote attached.' },
        ],
      },
      {
        id: 'lost',
        title: 'Where it gets lost today',
        blocks: [
          { kind: 'p', text: 'Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered them. Most of it never reaches the person who could act on it. It lives in a notes field, a Slack thread that scrolls away, or a CSM’s memory.' },
          {
            kind: 'table',
            label: 'Out of every 100 things customers tell a CSM',
            head: ['Stage', 'Out of 100', 'Where the rest goes'],
            widths: [40, 20, 40],
            rows: [
              { head: 'Said by a customer on a call', cells: ['100', 'Nowhere yet'] },
              { head: 'Written down by the CSM', cells: ['72', 'Said once, never written down'] },
              { head: 'Shared beyond the CSM', cells: ['55', 'Stays in a notes field'] },
              { head: 'Reaches the right owner', cells: ['40', 'The Slack thread scrolls away'] },
            ],
          },
          { kind: 'callout', tone: 'warning', title: 'Assumption', text: 'These numbers are illustrative, not measured. A two-week time study with two CSMs would replace them with real ones.' },
          { kind: 'p', text: 'No single step is broken. Every handoff is manual, optional and invisible, so the loss is spread across all of them.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Open on one sentence', text: 'The panel is judging whether I understand the job, not the market. So I open on one sentence from the same file you run in chapter 4.', note: 'Trade-off: no industry framing up front.' },
              { title: 'Label the scale as an assumption', text: 'There is no fair public number for how much CSM feedback reaches an owner at Invoca. So the funnel is illustrative, and the screen says so.', note: 'Trade-off: the funnel can’t carry an ROI case on its own. That is why the rollout starts with a time study.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 1 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Call length', cells: ['13 minutes. The quote runs from 06:00 to 06:23.', src('src/narrative/scenes/Signal.tsx')] },
              { head: 'The file', cells: ['About 1,850 spoken words with 6 planted insights, written by hand. Simulated.', src('docs/data-review.md')] },
              { head: 'Renewal', cells: ['“12 weeks” on screen. The recorded run says “renewal in 82 days”.', src('data/replays/file_c1042.json')] },
              { head: 'Feedback that reaches an owner', cells: ['40 of 100. Assumption.', src('src/narrative/scenes/Signal.tsx')] },
              { head: 'Capture rate today', cells: ['About 40%, the same assumption, in the agent registry.', src('data/platform/agents.json')] },
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'Is this a real call?', a: 'No. Every account and call is fictional. I wrote this one by hand to carry six signals and one trap for the quote check.' },
              { q: 'Isn’t this just bad discipline by CSMs?', a: 'No. Every handoff depends on memory. The fix is a system, not heroics.' },
            ],
          },
          { kind: 'related', label: 'Related questions', links: [{ to: '/backup/metrics', label: 'Success metrics' }] },
        ],
      },
    ],
  },
  {
    id: 'jobs',
    number: 2,
    group: 'Introduction',
    question: 1,
    title: 'Jobs to be done, today and tomorrow',
    summary: 'The four people who need this feedback, what each is trying to get done, and the workflow today against tomorrow.',
    lede: 'Before any architecture, I asked who would use this and what they need from it. This chapter covers the four people in the loop, and their workflow today against the future state, step by step.',
    sections: [
      {
        id: 'people',
        title: 'The four people',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'CSM', text: 'When a customer says something the product team should hear, I want it captured and routed without retyping it. Then I can stay present on the call and show I spoke up for them.' },
              { title: 'Product Manager', text: 'When I plan next quarter, I want real evidence grouped by theme, with ARR attached. Then I can prioritise on signal, not volume.' },
              { title: 'VP Product', text: 'When renewals or competitive pressure shift, I want an honest view across accounts. Then I can make portfolio calls and defend them.' },
              { title: 'Sales, competitive and support leads', text: 'When a competitor, a pricing objection or a repeat bug comes up, I want it in my channel the same day. Then I can act before it costs a deal.' },
            ],
          },
          { kind: 'p', text: 'The job that matters most is emotional: **be the advocate, not the stenographer.** CSMs keep the relationship and the judgement. The system takes the data entry and makes their advocacy visible.' },
          { kind: 'p', text: 'Everything else depends on that job. The PM, VP and sales jobs only get served if CSMs keep feeding the system. If it doesn’t help them, they won’t.' },
        ],
      },
      {
        id: 'workflow',
        title: 'Today against tomorrow',
        blocks: [
          { kind: 'p', text: 'The same piece of feedback, followed through each step:' },
          {
            kind: 'table',
            label: 'The workflow today and in the future state',
            head: ['Step', 'Today', 'With Signal Loop'],
            widths: [22, 39, 39],
            rows: [
              { head: 'The customer says it', cells: ['Only the CSM hears it.', 'The recorded call comes in through a connector. No retyping.'] },
              { head: 'Write it down', cells: ['Maybe, in a notes field. 72 of 100 (assumed).', 'Extracted with its type, area, severity and the exact quote. Code checks the quote is really in the call.'] },
              { head: 'Decide if it’s real', cells: ['The CSM’s judgement, if there is time.', 'Confident items go on. Uncertain and high-stakes ones wait for a person.'] },
              { head: 'Get it to the owner', cells: ['Retyped into Slack or Jira. 40 of 100 reach an owner (assumed). Takes days, or never.', 'A rules table sends it to the owner’s own tool, tagged by their handle. Target: under one business day.'] },
              { head: 'Spot a pattern', cells: ['Someone’s memory.', 'Similar feedback is grouped into themes across accounts, with ARR attached.'] },
              { head: 'Close the loop', cells: ['The CSM chases status.', 'When the ticket ships, the CSM hears back with a drafted note for the customer.'] },
            ],
          },
          { kind: 'callout', tone: 'warning', title: 'Assumption', text: 'The 72 and 40 of 100 come from the illustrative funnel in chapter 1. “Days, or never” is the baseline I’d expect. The time study replaces all three.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Design for the CSM first', text: 'Every other job depends on CSMs feeding the system. So the CSM gets credit when feedback ships, and the system drafts but never speaks for them.', note: 'Trade-off: one more action for the CSM, in exchange for keeping their voice.' },
              { title: 'Keep the judgement human', text: 'The future state removes retyping and chasing, not decisions. People still decide anything uncertain or high stakes.', note: 'Trade-off: review load. In the evals, 54% of insights needed a person.' },
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'Which job matters most?', a: 'The CSM’s emotional job. If CSMs don’t trust it, they won’t feed it, and nobody else gets served. So credit when feedback ships is a requirement, not a nicety.' },
              { q: 'Where is the future state in the demo?', a: 'Chapters 4 to 7 are the future state, working: a call comes in, a person reviews it, it routes to its owner, and the CSM hears back when it ships.' },
            ],
          },
          { kind: 'related', label: 'Related questions', links: [{ to: '/backup/metrics', label: 'Success metrics' }] },
        ],
      },
    ],
  },
  {
    id: 'built',
    number: 3,
    group: 'Introduction',
    question: 2,
    title: 'What I built, and why',
    summary: 'Built in 48 hours: what is real and what is simulated, why I chose option 3, and how it is built.',
    lede: `I built Switchboard from scratch in 48 hours. The source is on [GitHub](${REPO_URL}). This chapter says exactly what is real and what is simulated, why I chose the feedback loop, and how it is built.`,
    sections: [
      {
        id: 'real',
        title: 'What’s real',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              {
                title: 'Built and working',
                bullets: [
                  'All of the AI: triage, extraction, the quote check, scoring and a second opinion.',
                  'Themes from embeddings, the routing rules engine and the review queue.',
                  'Evals with a promotion gate, a spend cap then replay, and telemetry in Agent Ops.',
                  'Inputs: upload any file, paste text or pick from the library.',
                  'Outputs: each delivery’s content, the people tagged and the receipt are generated for real.',
                ],
              },
              {
                title: 'Simulated, and why',
                bullets: [
                  'Connections to Slack, Jira, Salesforce and the rest. I have no access to Invoca’s systems, and a demo must never message real people.',
                  'The data. Real customer conversations can’t leave Invoca, so every account, person and call is fictional.',
                  'Agent Ops’ second agent and six weeks of usage history, to show the platform with more than one agent.',
                  'Five other analyses. They are listed and marked “Not built”.',
                ],
              },
            ],
          },
          { kind: 'p', text: 'Routing and tagging read the simulated connections exactly as they would read real ones. So the behaviour you see is real, even where the tool is not.' },
        ],
      },
      {
        id: 'options',
        title: 'Why option 3',
        blocks: [
          {
            kind: 'cards',
            cols: 3,
            items: [
              { kicker: 'Option 1, not chosen', title: 'RFP Responder', text: 'Mature products already do this, such as Loopio, Responsive, Vanta and Conveyor. So the first question is why not buy one. A wrong answer on a security questionnaire is also a compliance risk.', note: 'Next: simulated in Agent Ops as a second agent.' },
              { kicker: 'Option 2, not chosen', title: 'Churn Predictor', text: 'It needs believable data faked from three systems. And a prediction is hard to defend without real outcomes to check it against.', note: 'Next: on the roadmap as the Renewal risk analysis.' },
              { kicker: 'Option 3, chosen', title: 'Feedback Loop', accent: true, text: 'It has it all: several people with different jobs, real engineering, an easy additive pitch and a clear future. The pitch is simple: stop retyping it into Jira.', note: 'Built: Signal Loop, inside Switchboard.' },
            ],
          },
          { kind: 'p', text: 'Invoca already turns its customers’ calls into signals. Signal Loop points the same discipline inward, at Invoca’s own CSM conversations. The data exists, the work is internal and additive, and it can show value in weeks.' },
          { kind: 'p', text: 'I built Switchboard so options 1 and 2 can become analyses on the same platform later. Same intake, same decision model, same delivery.' },
        ],
      },
      {
        id: 'how',
        title: 'How it’s built',
        blocks: [
          {
            kind: 'cards',
            cols: 1,
            items: [
              { title: 'Raw TypeScript, not n8n, Gumloop or Zapier', text: 'The trust features need code. Quotes are checked against the transcript. Every model answer is checked against a typed schema. Routing rules give the same result every time. There is an eval suite with a promotion gate, budgets, replay and tests.' },
              { title: 'Three model roles, chosen by measurement', text: 'A decision model triages every input and gives a second opinion. A main model extracts. A backup model takes over if the main one fails. I tested 12 candidates for the decision model and took the fastest with every answer valid and every verdict right.', note: 'Gap: the backup model has never been scored as the main model, so quality in fallback is unknown.' },
              { title: 'One Cloudflare Worker for the proof of concept', text: 'It was fast to ship, it is one deploy, and it sits behind a password. The production design keeps the same boundaries on Neon, Vercel and Trigger.dev. Chapter 10 has the full stack.', note: 'Gap: the production stack is a design, not a port yet.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 3 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Connectors', cells: ['12 in the catalog. Simulated.', src('src/shared/platform.ts')] },
              { head: 'Accounts and people', cells: ['14 accounts and 21 people. Simulated.', srcs('data/world/accounts.json', 'data/world/people.json')] },
              { head: 'Library', cells: ['266 files. 48 of them are hand-checked “golden” files. Simulated.', src('data/library.json')] },
              { head: 'Signal Loop’s history', cells: ['218 real pipeline runs over fictional calls, with simulated users.', src('data/backfill/runs.json')] },
              { head: 'Analyses', cells: ['6 in the catalog, 1 built.', src('src/shared/platform.ts')] },
              { head: 'Decision model speed', cells: ['882 ms at the median. 95% of calls within 1,465 ms. 18 of 18 answers valid.', src('docs/reports/decision-models.md')] },
            ],
          },
          { kind: 'callout', title: 'Honest gap', text: 'I named the Option 1 products from the market. I didn’t compare them hands-on in this build.' },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'Is the AI mocked?', a: 'No. Every model call is made live from the server through OpenRouter, under a spend cap. Past the cap, runs replay a recorded live run and say so on screen.' },
              { q: 'Why not buy Gong, Productboard or Enterpret?', a: 'Each covers part of it. None owns Invoca’s taxonomy, routing rules and the loop back to CSMs. The [build vs buy](/backup/build-vs-buy) page has the comparison.' },
            ],
          },
          {
            kind: 'related',
            label: 'Related questions',
            links: [
              { to: '/backup/build-vs-buy', label: 'Build vs buy' },
              { to: '/backup/differently', label: 'What I’d do differently' },
            ],
          },
        ],
      },
    ],
  },

  // ============================================================ The platform
  {
    id: 'call',
    number: 4,
    group: 'The platform',
    question: 2,
    title: 'A call comes in',
    summary: 'Signal Loop inside Switchboard, a call brought in with no retyping, and the real pipeline running in seconds.',
    lede: 'This chapter opens on the platform, then moves into the real product. You bring in a call and watch the pipeline run live. A 13-minute call takes a few seconds.',
    sections: [
      {
        id: 'platform',
        title: 'The platform first',
        blocks: [
          { kind: 'p', text: 'Feedback doesn’t only arrive on calls. So Signal Loop runs inside a small platform, Switchboard. It does the parts every analysis needs: bring a conversation in, work out what it is, and get the result to the right person.' },
          {
            kind: 'cards',
            cols: 2,
            items: [
              { kicker: 'In', title: 'Any conversation', text: 'Connectors for Gong, Zoom, Gmail, Slack and Google Drive, or any uploaded file. PDF, Word, slides, transcripts, email and chat exports all work.' },
              { kicker: 'Decide', title: 'A fast decision model reads it first', text: 'What kind of document it is, how messy it is, which analyses apply, and whether anyone is trying to trick the model.' },
              { kicker: 'Analyse', title: 'Only what applies runs', text: 'Signal Loop is built. Follow-ups, renewal risk, escalations, compliance review and call coaching are listed and marked “Not built”.' },
              { kicker: 'Out', title: 'The right people, in their tools', text: 'Jira, Linear, Slack, Teams, Salesforce, email and Google Drive. Each owner is tagged by their own handle in that tool.' },
            ],
          },
          { kind: 'p', text: '**Connectors and people.** The connectors are simulated, and the product says so. A people directory holds each person’s handle in each tool. So a delivery mentions @jordan.reyes in Slack and assigns Nina Patel in Jira.' },
        ],
      },
      {
        id: 'bring-in',
        title: 'Bringing the call in',
        blocks: [
          { kind: 'p', text: 'In the product, you open New conversation and browse the library. The Brightline QBR is suggested, but any file works. Mess levels stay hidden until after you pick, so the choice doesn’t feel staged.' },
          { kind: 'p', text: 'Bringing the call in is the only manual step. In production it goes away: connectors pull calls from whichever recorder and CRM the CS team uses.' },
          {
            kind: 'list',
            items: [
              'Files are converted to text in your browser. Only the text is sent, and it is redacted before any model sees it.',
              'Up to 25 MB per file. Only the first 200,000 characters are processed.',
              'Audio, video, images and scanned PDFs are refused with a reason. They need a transcript or OCR first.',
              'The same file twice opens your earlier run, unless you choose to run it again live.',
            ],
          },
        ],
      },
      {
        id: 'steps',
        title: 'The ten steps',
        blocks: [
          { kind: 'p', text: 'Every conversation goes through ten steps. Each step records what it did, how long it took and what it cost. The screen is drawn from those records, so what you watch is the real run.' },
          {
            kind: 'steps',
            items: [
              { title: 'Bring in', text: 'The file is fingerprinted, so uploading it twice does nothing new.' },
              { title: 'Read', text: 'Transcripts, notes, emails, chats and documents are split into who said what.' },
              { title: 'Redact', text: 'Personal and health details are replaced before any AI model sees the text.' },
              { title: 'Triage', text: 'The decision model says what it is, which analyses apply, and whether anyone is trying to trick the model.' },
              { title: 'Extract', text: 'Each piece of feedback comes back with its type, area, severity, exact quote and confidence. Long documents are split and read in parallel.' },
              { title: 'Check the quote', text: 'Code, not the model, looks for every quote in the transcript. A quote it can’t find is dropped and counted.' },
              { title: 'Gate', text: 'Confident items go to the owner, uncertain ones to a person, the rest are held. Serious bugs and churn risk always go to a person.' },
              { title: 'Group', text: 'Similar feedback is grouped into themes by meaning. The model only names the theme.' },
              { title: 'Route', text: 'An editable table of rules decides who hears what, never the prompt. Anything without a match goes to triage.' },
              { title: 'Deliver', text: 'To the owner’s tool, tagged by their handle, with receipts and retries (simulated here).' },
            ],
          },
        ],
      },
      {
        id: 'branches',
        title: 'Six files, six stories',
        blocks: [
          { kind: 'p', text: 'The file you pick changes the rest of the chapter. Every path rejoins at chapter 5. These are the recorded results, which a replay shows when live AI is off.' },
          {
            kind: 'table',
            label: 'The six starting files',
            head: ['File', 'What it shows', 'Recorded result'],
            widths: [28, 34, 38],
            rows: [
              { head: 'Brightline QBR', sub: 'Main path', cells: ['Six real signals in a natural transcript, and a trap for the quote check.', '6 insights. 14 of 14 quotes found word for word. 3 to review.'] },
              { head: 'Harbor FCU notes', sub: 'Clean', cells: ['The easy baseline.', '3 insights. 3 of 3 quotes found. 1 to review.'] },
              { head: 'SunPeak check-in', sub: 'Raw speech to text', cells: ['Staying honest under noise. The model quotes the garbled text as it was said.', '3 insights. 7 of 7 quotes found. 2 to review.'] },
              { head: 'Ridgeway prep', sub: 'Injection attempt', cells: ['A planted instruction is treated as data.', 'Flagged. All 3 insights sent to review.'] },
              { head: 'PrairieLink check-in', sub: 'Nothing actionable', cells: ['The right output is nothing.', '0 insights, in 399 ms.'] },
              { head: 'Meridian call', sub: 'Health details', cells: ['Only redacted text reaches a model.', '22 values redacted. 3 insights.'] },
            ],
          },
          { kind: 'source', text: `Source: the recorded runs in ${src('data/replays/file_c1042.json')} and the five other files beside it.` },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'A decision model reads first', text: 'A small, fast model from a different family reads every input first. Extraction starts at the same time, so triage adds no time to a run. It costs about a quarter of the old screen.', note: 'Honest caveat: it isn’t faster than the old screen. The win is cost, richer output and an independent check.' },
              { title: 'Quotes are checked in code', text: 'The model can’t police itself. Code tidies both texts, looks for an exact match, then a near match scoring 0.90 or better.', note: 'Trade-off: it proves the words were said, not that they are feedback. Chapter 8 shows that limit.' },
              { title: 'Show the real clock', text: 'A run that finishes in seconds can look pre-canned. So the page shows a live clock from the real start. The Timing card draws every step from its real timestamps.', note: 'Trade-off: on a fast run, steps arrive in batches. The page staggers them by at most 120 ms.' },
              { title: 'Long documents in parallel', text: 'Inputs over 24,000 characters are read in overlapping windows, up to 8 at once. The quote check still runs against the whole document.', note: 'Trade-off: one failed window fails the step.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 4 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Recorded Brightline run', cells: ['6 insights. 14 of 14 quotes found word for word. 19 values redacted.', src('data/replays/file_c1042.json')] },
              { head: 'Recorded speed and cost', cells: ['4,238 ms end to end. $0.001401 of AI.', src('data/replays/file_c1042.json')] },
              { head: 'One live run', sub: 'On 2026-10-25. An example, not a benchmark.', cells: ['Triage 1.55 s, alongside extraction 4.94 s. 6.09 s end to end. $0.0034 of AI.', 'Not saved in the repo'] },
              { head: 'Triage on the decision model', cells: ['882 ms at the median. $0.000141 per call.', src('docs/reports/decision-models.md')] },
              { head: 'The old screen, on the main model', cells: ['470 ms at the median. $0.000616 per call.', src('docs/reports/decision-models.md')] },
              { head: 'Quotes found on the current prompt', cells: ['275 of 275 in the evals.', src('data/evals/latest.json')] },
            ],
          },
        ],
      },
      {
        id: 'gaps',
        title: 'Honest gaps',
        blocks: [
          {
            kind: 'list',
            items: [
              'The 48 recorded runs predate the decision model. In a replay, triage shows the main model’s result and there is no second opinion.',
              'Replays are re-timed to today’s step order. Their timings are the recording adjusted, not a second recording. The Timing card says so.',
              'The live timings above are one run. I’d time 20 live runs per file and publish the median and the slowest 5%.',
              'Parallel extraction of long inputs hasn’t been measured against a single call yet.',
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'It’s too fast. Is it real?', a: 'Yes. The Timing card shows why. Triage and extraction start together, and the code steps take milliseconds. “See every call in Agent Ops” opens the trace with every model call, its tokens and its cost.' },
              { q: 'Did the quote check ever catch anything?', a: 'Not on the current prompt: 275 of 275 quotes matched. It is a seatbelt. The rejected candidate prompt had 3 of 505 quotes fail.' },
            ],
          },
          {
            kind: 'related',
            label: 'Related questions',
            links: [
              { to: '/backup/cost', label: 'Cost model' },
              { to: '/backup/security', label: 'Security & PII' },
              { to: '/backup/failure', label: 'Failure handling' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'review',
    number: 5,
    group: 'The platform',
    question: 2,
    title: 'Human in the loop',
    summary: 'A person decides anything uncertain or high stakes, and every correction becomes labelled data.',
    lede: 'Anything uncertain or high stakes waits for a person. In this chapter you approve one item and correct another. Each decision carries a name and becomes labelled data.',
    sections: [
      {
        id: 'story',
        title: 'What it shows',
        blocks: [
          { kind: 'p', text: 'The review queue lists every item waiting for a decision. Each one says why it is there, for example “Score 0.71, below 0.80” or “Churn risk is always reviewed”.' },
          { kind: 'p', text: 'You press A to approve one item. Then you press E on another, change a field and save. R rejects. Save stays disabled until a field changes.' },
          { kind: 'p', text: 'Nothing on a parked run is routed until someone acts. The approval routes the item and writes an audit row with the reviewer’s name.' },
        ],
      },
      {
        id: 'gate',
        title: 'How the gate decides',
        blocks: [
          {
            kind: 'table',
            label: 'The review gate',
            head: ['Score', 'What happens'],
            widths: [34, 66],
            rows: [
              { head: '0.80 and above', cells: ['Sent straight to the owner.'] },
              { head: '0.55 to 0.80', cells: ['Waits for a person.'] },
              { head: 'Below 0.55', cells: ['Held, but kept visible.'] },
            ],
          },
          { kind: 'p', text: 'Some items always go to a person, whatever the score. That covers churn risk, high or critical bugs, everything from a file with a suspected injection, and everything when triage was unavailable.' },
          { kind: 'p', text: 'The decision model’s second opinion can then move a borderline item one step. If it agrees at 0.85 or more, a review item can go straight to its owner. If it disagrees at 0.6 or more, an automatic item waits for a person. Forced reviews never move.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'High stakes always go to a person', text: 'A wrong churn flag in front of a PM costs the CSM trust. So churn risk and serious bugs are always reviewed, however confident the model is.', note: 'Trade-off: 54% of insights in the eval needed a person. Review load is the real constraint.' },
              { title: 'Review is a state, not a paused job', text: 'Review can take hours. So a run waiting for review is simply parked. The approval itself routes the item and writes the audit row.' },
              { title: 'Every correction is data', text: 'An edit is saved with what it was before, what it became, who changed it and why. Those edits become test cases for the next prompt.' },
              { title: 'A named reviewer', text: 'An audit row needs a person, not “reviewer”. A new workspace acts as Elena Vasquez, VP Product. You can switch with “Act as someone else”.', note: 'Trade-off: the acting user is a workspace setting, not a sign-in.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 5 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Sent to review in the eval', cells: ['76 of 141 insights (54%).', src('data/evals/details-v4.json')] },
              { head: 'Sent automatically', cells: ['65. Five of them were wrong (7.7%).', src('data/evals/details-v4.json')] },
              { head: 'Eval runs with something to review', cells: ['45 of 48.', src('data/evals/details-v4.json')] },
              { head: 'Second opinion thresholds', cells: ['Promote at 0.85 agreement. Demote at 0.6 disagreement.', src('src/pipeline/score.ts')] },
            ],
          },
        ],
      },
      {
        id: 'gaps',
        title: 'Honest gaps',
        blocks: [
          {
            kind: 'list',
            items: [
              'The eval figures predate the second opinion. Its effect on review load hasn’t been measured yet.',
              'The thresholds are the same for every type. Precision varies by type (bugs 98.0%, pricing 77.8%), so per-type thresholds come next.',
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [{ q: 'Haven’t you just moved data entry into a review queue?', a: 'Partly, by design for now. A review is approve or edit on a pre-filled, quoted item. The second opinion can send borderline items straight through. Champions tune the thresholds in weeks 3 to 6.' }],
          },
        ],
      },
    ],
  },
  {
    id: 'routing',
    number: 6,
    group: 'The platform',
    question: 2,
    title: 'Right owner, right channel',
    summary: 'Routing is a table ops can change, deliveries land where people already work, and nothing gets lost.',
    lede: 'The model classifies. A table decides who hears about it. In this chapter you change one rule, see the delivery land in the PM’s tool, and see what happens when a tool is disconnected.',
    sections: [
      {
        id: 'story',
        title: 'What it shows',
        blocks: [
          { kind: 'p', text: 'You edit the pricing-objection rule so objections on accounts over $250k ARR go to the VP of Product. No prompt changes and nothing is redeployed. The change only affects your own workspace.' },
          { kind: 'p', text: 'Then you see the delivery where the PM already works: a Jira ticket with the quote, the account and its ARR. The owner is tagged by their own handle.' },
          { kind: 'p', text: 'Last, the Connections page. Connections are simulated, but routing reads them. Disconnect Jira and its rules send items to triage instead. Nothing silently disappears.' },
        ],
      },
      {
        id: 'rules',
        title: 'How a rule works',
        blocks: [
          {
            kind: 'list',
            items: [
              'A rule matches type, product area, severity and ARR band. It names an owner and a channel.',
              'When several rules match, the one with the lowest priority number wins.',
              'No match sends the item to triage, owned by Product Operations.',
              'Each delivery tags the owner and the account’s CSM. For churn risk or pricing objections over $250k ARR, it also tags the VP of Customer Success.',
              'A rule whose tool is disconnected, or whose owner was removed, sends items to triage with the reason.',
            ],
          },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Routing by table, not prompt', text: 'Who gets paged must be predictable, auditable and changeable by ops without a deploy. A table does that. Every change has a before and after in the audit log.', note: 'Trade-off: a new routing need needs a rule. A missing rule sends items to triage rather than guessing.' },
              { title: 'Simulated tools, real routing', text: 'Connecting a tool records a connection with a simulated account. Routing reads that state exactly as it would read a real one.', note: 'Trade-off: real-API failures, such as expired logins and rate limits, aren’t exercised.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 6 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Seed routing rules', cells: ['14.', src('data/world/routing.json')] },
              { head: 'Routing accuracy in the eval', cells: ['94.4% (118 of 125).', src('data/evals/latest.json')] },
              { head: 'People in the directory', cells: ['21, each with a handle per tool. Simulated.', src('data/world/people.json')] },
              { head: 'Connectors', cells: ['12 in the catalog, 7 connected in a new workspace. Simulated.', src('src/shared/platform.ts')] },
              { head: 'Extra tag for big accounts', cells: ['Over $250k ARR.', src('src/pipeline/deliver.ts')] },
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'Does my rule change affect other viewers?', a: 'No. Each viewer has their own workspace. Rule, connection and people edits apply only there.' },
              { q: 'Are the Slack, Jira and Salesforce connections real?', a: 'No, and the product says so. Deliveries render as in-app previews with receipts. In production they would be the real APIs, switched on one destination at a time.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'patterns',
    number: 7,
    group: 'The platform',
    question: 2,
    title: 'Patterns, and closing the loop',
    summary: 'One complaint becomes a pattern with ARR attached, and the CSM hears back when it ships.',
    lede: 'One complaint is an anecdote. The same thing from seven accounts is a pattern. This chapter shows a theme with ARR attached, then the CSM hearing back when the fix ships.',
    sections: [
      {
        id: 'story',
        title: 'What it shows',
        blocks: [
          { kind: 'p', text: 'You open the highlighted theme: Google Ads offline conversions arrive late. It shows ARR at stake, an eight-week trend and representative quotes. Each quote links back to the call it came from.' },
          { kind: 'p', text: 'Then you play the PM and move the Jira ticket to Shipped. The CSM hears back automatically, with credit and a drafted note for the customer. The note is drafted, not sent. The relationship stays with the CSM.' },
          { kind: 'p', text: 'This serves the CSM’s job from chapter 2: be the advocate, not the stenographer. They get credit without chasing status.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Code decides who is in a theme', text: 'A PM must trust that a theme’s members and ARR are reproducible. So membership comes from embeddings and a similarity threshold in code. The model only names the theme.', note: 'Trade-off: the threshold needs tuning, and theme quality has no eval yet.' },
              { title: 'ARR counted once per account', text: 'ARR at stake is the ARR of the accounts that raised the issue, counted once each. It is not a churn forecast.' },
              { title: 'Drafted, not sent', text: 'The customer relationship belongs to the CSM. So the note to the customer is a draft they can edit and send.', note: 'Trade-off: one more action for the CSM, in exchange for keeping their voice.' },
            ],
          },
        ],
      },
      {
        id: 'numbers',
        title: 'The numbers',
        blocks: [
          {
            kind: 'table',
            label: 'Chapter 7 numbers',
            head: NUMBERS_HEAD,
            widths: NUMBERS_WIDTHS,
            rows: [
              { head: 'Join threshold', cells: ['Cosine similarity of 0.82.', src('src/shared/scoring.ts')] },
              { head: 'The highlighted theme', cells: ['Seeded with 32 insights from 7 accounts, $1.40M ARR. Simulated.', src('docs/data-review.md')] },
              { head: 'Planted themes in the history', cells: ['15.', src('docs/data-review.md')] },
              { head: 'Naming themes', cells: ['One batched model call, after the run.', src('docs/ARCHITECTURE.md')] },
            ],
          },
        ],
      },
      {
        id: 'gaps',
        title: 'Honest gaps',
        blocks: [
          {
            kind: 'list',
            items: [
              'Themes need history. Grouping looks good because about 220 older transcripts were loaded first. On day one with real data, themes are thin for a few weeks.',
              'Theme quality has no eval yet. I’d add a merge-and-split review with PMs.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'operate',
    number: 8,
    group: 'The platform',
    question: 2,
    title: 'Under the hood: prove it, then operate it',
    summary: 'How the prompts are written, how errors are handled and how the data is shaped. Then the tests that gate a change, and Agent Ops.',
    lede: 'This chapter opens the hood. It covers how I write the prompts, how failures are handled and how the data is shaped. Then you try to promote a worse prompt and watch the gate block it, and you find your own run in Agent Ops.',
    sections: [
      {
        id: 'prompts',
        title: 'Prompt engineering strategy',
        nav: 'Prompt strategy',
        blocks: [
          { kind: 'p', text: 'Each model gets one small job and a fixed form to fill in. The model proposes. Code checks everything it can.' },
          {
            kind: 'list',
            items: [
              '**One prompt per job.** Triage and the second opinion run on the decision model. Extraction and theme names run on the main model. Each prompt is short and does one thing.',
              '**A fixed form.** Extraction must return one of six types, a product area from a set list, a severity and a sentiment. Every answer is checked against that schema.',
              '**Definitions, counter-examples and three short examples.** The current prompt (v4) says what each type is and what it is not. The categories are data, so CSMs and PMs can change them without a code change.',
              '**Exact quotes.** Each insight needs one to three quotes, copied word for word with their turn. That includes filler and transcription errors. Code then checks every quote against the transcript.',
              '**Nothing is a good answer.** The prompt says an empty list is correct and common. So the model doesn’t invent work to look busy.',
              '**The transcript is data.** It sits inside delimiters, marked as untrusted. Any attempt to close the delimiter from inside is removed. No model has tools.',
              '**Account context.** The prompt gets the account’s tier, ARR band, renewal date and health, so severity can reflect the account.',
              '**Every change is tested.** Each insight records its prompt version. A new prompt only goes live through the promotion gate below.',
            ],
          },
          { kind: 'source', text: `Sources: ${srcs('src/shared/prompts/extract.ts', 'src/shared/prompts/context.ts', 'src/shared/prompts/screen.ts', 'src/shared/prompts/secondOpinion.ts')}.` },
        ],
      },
      {
        id: 'errors',
        title: 'Error handling',
        blocks: [
          { kind: 'p', text: 'Things will fail. My goal is that every failure is visible, bounded and recoverable.' },
          {
            kind: 'table',
            label: 'What happens when something fails',
            head: ['When', 'What happens'],
            widths: [32, 68],
            rows: [
              { head: 'A malformed answer', cells: ['Small fixable issues are repaired in code. Otherwise the model retries once with the errors, then the backup model answers. If that fails too, the conversation waits on the Health page for a person.'] },
              { head: 'Provider errors', cells: ['Rate limits, outages and timeouts are retried, waiting a little longer each time. Every call has a time limit: 4 s for the decision model.'] },
              { head: 'The decision model is down', cells: ['Triage and the second opinion move to the main model. If that is down too, every insight waits for review.'] },
              { head: 'A step fails mid-run', cells: ['The ten steps run on a fast path and save as they go. A background job picks up from the last finished step, and a run never executes twice.'] },
              { head: 'A run stalls', cells: ['After 40 s with no progress, it is handed to the background job. A featured file not finished within 25 s replays its recorded run.'] },
              { head: 'The money runs out', cells: ['Runs replay a recorded real run, labelled on screen. Your own uploads say the live AI limit is reached.'] },
              { head: 'One delivery fails', cells: ['If Jira succeeds and Slack fails, the delivery reads as failed. Partial is not success.'] },
              { head: 'A quote isn’t in the call', cells: ['The insight is dropped and counted as made up. It is never shown as fact.'] },
            ],
          },
          { kind: 'source', text: `Sources: ${srcs('src/worker/ai.ts', 'src/worker/execute.ts', 'docs/ARCHITECTURE.md')}.` },
        ],
      },
      {
        id: 'data',
        title: 'Data structure choices',
        nav: 'Data structures',
        blocks: [
          {
            kind: 'list',
            items: [
              '**One set of contracts.** The Worker, the pipeline and the screens share typed schemas. Change them first, and everything that disagrees fails to build.',
              '**A row per step.** Every step writes a timed record of what it did. The screens draw from those rows, and a resumed run skips the steps already done.',
              '**An insight carries its evidence.** Type, area, severity and summary. Each quote with its turn and how it matched. Confidence, the gate’s decision and reasons, the second opinion and the prompt version.',
              '**Routing is rows, not prose.** Type, area, severity and ARR band map to an owner and a channel, with a priority. Ops can read and change it.',
              '**Every decision is recorded.** A review saves what it was before, what it became, who decided and why. Those rows become test cases.',
              '**A workspace per viewer.** Edits are stored over a shared sample, keyed by workspace. Reset clears them, and nobody sees anyone else’s changes.',
              '**A fingerprint per file.** Uploads are keyed by a hash of their bytes, so the same file opens the same run.',
              '**Placeholders, not personal data.** Redaction swaps values for tokens like [PATIENT_1]. The original stays on the server.',
            ],
          },
          { kind: 'p', text: 'Today records live in Cloudflare D1, similar feedback is found with Vectorize, and original files sit in R2. In production that becomes Postgres with pgvector on Neon.' },
          { kind: 'source', text: `Sources: ${srcs('src/shared/contracts.ts', 'src/pipeline/route.ts', 'docs/ARCHITECTURE.md')}.` },
        ],
      },
      {
        id: 'evals',
        title: 'Prove it: the promotion gate',
        nav: 'The promotion gate',
        blocks: [
          { kind: 'p', text: 'The Quality page scores the current prompt against 48 hand-checked files. It shows precision, how often what it sends is right, and recall, how much it finds.' },
          { kind: 'p', text: 'A rewritten prompt, v5, looks fine on recall. You try to promote it, and the gate blocks it. Precision fell from 88.7% to 59.7%, under the 85% bar. Every quote was real. It labelled ordinary sentences as feedback.' },
          { kind: 'p', text: 'A new prompt goes live only if every one of these passes:' },
          {
            kind: 'list',
            items: [
              'Overall precision of 85% or more, and recall of 80% or more.',
              'Recall of 70% or more on the messiest files (level 5).',
              'At least 95% of quotes found in the transcript.',
              'No made-up insights on empty calls, every planted instruction flagged, no health details leaked and no failed runs.',
              'No drop of more than 2 points on precision, recall or level-5 recall.',
            ],
          },
          {
            kind: 'table',
            label: 'The current prompt and the candidate',
            head: ['Measure', 'Current prompt (v4)', 'Candidate (v5)'],
            widths: [30, 35, 35],
            rows: [
              { head: 'Precision', cells: ['88.7% (125 of 141)', '59.7% (126 of 211)'] },
              { head: 'Recall', cells: ['97.7% (125 of 128)', '98.4% (126 of 128)'] },
              { head: 'Quotes found', cells: ['100% (275 of 275)', '99.4% (502 of 505)'] },
              { head: 'Eval cost for 48 files', cells: ['$0.093', '$0.113'] },
              { head: '95% of runs finish within', cells: ['3.8 s', '6.3 s'] },
            ],
          },
          { kind: 'source', text: `Source: ${src('data/evals/latest.json')}.` },
          { kind: 'p', text: 'v5 was the cost-cutting rewrite people really make: shorter, with no counter-examples and no examples. It added 38 extra praise items and 20 extra churn risks. Cost and speed are shown, but they don’t block a release yet.' },
        ],
      },
      {
        id: 'operating',
        title: 'Operate it: Agent Ops',
        nav: 'Agent Ops',
        blocks: [
          { kind: 'p', text: 'Building the agent is half the job. Agent Ops shows hours returned, the value of that time against AI spend, and adoption. Your own run is there as one trace, with every step and model call.' },
          {
            kind: 'list',
            items: [
              'Two agents are registered: Signal Loop, which is real, and an RFP Responder built in Gumloop, which is simulated.',
              `Signal Loop passes all ${STANDARD_CHECKS.length} checks of the agent standard. Its security review and business-owner sign-off are illustrative records.`,
              'It is reviewed every 30 days. The last review was 2026-10-12 and the next is 2026-11-11.',
              'Hours returned are the baseline minutes per call minus the measured review minutes. The baseline is 18 minutes per call, an assumption until the time study.',
              'The history is 218 real pipeline runs over fictional calls, with simulated users. Only this session is live.',
            ],
          },
          { kind: 'source', text: `Sources: ${srcs('data/platform/agents.json', 'src/worker/platform/math.ts', 'data/backfill/runs.json')}.` },
        ],
      },
      {
        id: 'gaps',
        title: 'Honest gaps',
        blocks: [
          {
            kind: 'list',
            items: [
              '48 files catch a big drop like v5’s, not the gap between two good prompts. There is no held-out test set yet, so v4’s numbers are optimistic.',
              'Four types sit under 85% precision: feature requests 81.5%, praise 81.3%, churn risk 78.6% and pricing objections 77.8%.',
              'These eval runs predate the decision model and the second opinion.',
              'The backup model has never been scored as the main model.',
            ],
          },
          {
            kind: 'related',
            label: 'Related questions',
            links: [
              { to: '/backup/failure', label: 'Failure handling' },
              { to: '/backup/agent-ops', label: 'Agent Ops' },
              { to: '/backup/metrics', label: 'Success metrics' },
            ],
          },
        ],
      },
    ],
  },

  // ============================================================ Closing
  {
    id: 'trust',
    number: 9,
    group: 'Closing',
    question: 3,
    title: 'Earning trust: rollout and adoption',
    summary: 'How I’d roll it out to a busy, sceptical team, keep it helpful and additive, and earn their trust.',
    lede: 'CSMs are busy, and many will be sceptical of a tool that reads their calls. This chapter covers how I’d roll it out, how it stays helpful rather than a threat, and how it earns trust.',
    sections: [
      {
        id: 'rollout',
        title: 'Roll it out in phases',
        blocks: [
          {
            kind: 'cards',
            cols: 4,
            items: [
              { kicker: 'Week 0', title: 'Discovery', text: 'Shadow two CSMs. Run the time study. Design the categories with CSMs and PMs.' },
              { kicker: 'Weeks 1–2', title: 'Shadow mode', text: 'It runs quietly on real calls. CSMs compare its output with their own notes. Nothing is sent.' },
              { kicker: 'Weeks 3–6', title: 'Champions', text: 'Two or three volunteer CSMs and one PM, with a weekly calibration on misses and noise.' },
              { kicker: 'Week 7+', title: 'Whole team', text: 'Confident items go straight to the owner. Everything else goes to review.' },
            ],
          },
          { kind: 'p', text: 'Nothing routes automatically until the champions trust it. If I’m wrong about what CSMs need, shadow mode tells me before anyone sees a screen.' },
        ],
      },
      {
        id: 'additive',
        title: 'Helpful and additive, not a threat',
        nav: 'Helpful, not a threat',
        blocks: [
          {
            kind: 'list',
            items: [
              '**It takes the data entry, not the judgement.** CSMs keep the relationship and the final call.',
              '**The CSM is the advocate, not the stenographer.** Their feedback reaches the owner, and they can see it did.',
              '**Credit goes to the CSM.** When a ticket ships, the CSM hears back first, with the credit.',
              '**It drafts, never sends.** The note to the customer is a draft. The CSM edits it and sends it in their own voice.',
              '**The pitch is simple:** stop retyping it into Jira.',
            ],
          },
          { kind: 'callout', tone: 'warning', title: 'Assumption', text: 'The rollout scene shows 1.75 hours back to each CSM every week, about 2,730 a year across 30 CSMs. That assumes 10 minutes of admin per call, 15 calls a week and 70% removed. The time study replaces it.' },
        ],
      },
      {
        id: 'trust-built',
        title: 'How trust is built',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Every insight shows its quote', text: 'Code checks each quote is really in the call. A quote it can’t find drops the insight.' },
              { title: 'People decide what’s uncertain', text: 'Uncertain and high-stakes items wait for a person. Churn risk and serious bugs are always reviewed.' },
              { title: 'A trail for every decision', text: 'Each approval, edit and rule change records who made it, with a before and after.' },
              { title: 'Tests gate every prompt change', text: 'A new prompt only goes live if it holds the bar on accuracy, coverage and safety.' },
              { title: 'A hard spend cap', text: 'Live AI has a fixed limit. Past it, runs replay a recorded run and say so. It never becomes an outage.' },
              { title: 'It owns up when it’s wrong', text: 'A one-click “this is wrong”, and precision published weekly.' },
            ],
          },
        ],
      },
      {
        id: 'measure',
        title: 'Measure adoption, don’t survey it',
        nav: 'Measure adoption',
        blocks: [
          { kind: 'p', text: 'Signal Loop reports its logs, timings, usage and units of work into Agent Ops. That’s where I’d measure weekly active reviewers, capture rate and time to owner.' },
          { kind: 'p', text: 'Executives get hours returned every month. That is the time each call used to take, minus the time people now spend reviewing. The baselines stay labelled as assumptions until the time study.' },
          { kind: 'p', text: 'Cost spikes and missed reliability targets alert the owner. Drift shows up when the evals are re-run on a schedule, and in how often reviewers edit.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Shadow mode first', text: 'CSMs won’t feed a system they don’t trust. So it runs quietly first, then with champions, then for the whole team.', note: 'Trade-off: no automatic routing until about week 7.' },
              { title: 'Make the CSM look good', text: 'A tool that makes CSMs look good gets fed. So credit, the drafted note and the visible loop are built in, not added later.', note: 'Trade-off: the drafted note is one more action for the CSM.' },
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'How would you get CSMs to adopt it?', a: 'Make it make them look good. Shadow mode first so there’s no risk, champions who tune it weekly, and credit when their feedback ships. Then measure weekly active reviewers from real use, not a survey.' },
              { q: 'What would make you shut it off?', a: 'The business owner signs the kill criteria. I’d propose three: auto-route precision under 85% for two weeks, weekly active reviewers falling for a month, or net hours below cost. These are proposed, not configured.' },
            ],
          },
          {
            kind: 'related',
            label: 'Related questions',
            links: [
              { to: '/backup/metrics', label: 'Success metrics' },
              { to: '/backup/agent-ops', label: 'Agent Ops' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'future',
    number: 10,
    group: 'Closing',
    question: 4,
    title: 'The next 12–18 months',
    summary: 'The roadmap, what multi-agent systems and faster, cheaper models change, and the path to production.',
    lede: 'The same design gets cheaper, faster and closer to the conversation. This chapter covers the roadmap, what new models and multi-agent systems change, and the path from proof of concept to production.',
    sections: [
      {
        id: 'roadmap',
        title: 'The roadmap',
        blocks: [
          {
            kind: 'table',
            label: 'The next 12 to 18 months',
            head: ['When', 'Milestone'],
            widths: [24, 76],
            rows: [
              { head: 'Months 0–3', cells: ['**Earn trust first.** The rollout, before anything is automatic.'] },
              { head: 'Months 3–6', cells: ['**Every call, by default.** Read calls straight from the recorder and CRM.'] },
              { head: 'Months 6–9', cells: ['**Capture during the call.** The CSM confirms a signal before hanging up.'] },
              { head: 'Months 9–12', cells: ['**More analyses, one platform.** Follow-ups, renewal risk and escalations.'] },
              { head: 'Months 12–15', cells: ['**Specialist agents.** One finds, one checks each claim, one routes.'] },
              { head: 'Months 15–18', cells: ['**Part of Invoca’s platform.** Compliance review, coaching, and Signal AI.'] },
            ],
          },
          { kind: 'p', text: 'What doesn’t change: no quote, no insight. Code checks the model. People make the high-stakes calls. Routing stays data.' },
        ],
      },
      {
        id: 'models',
        title: 'Faster, cheaper models',
        blocks: [
          { kind: 'p', text: 'Reading every call is already cheap. The recorded runs average $0.00141 of AI per call, over 48 runs. Cheaper, faster models make it economical to read every call straight from the recorder, not a sample.' },
          { kind: 'p', text: 'Speed changes when it can happen. Today a call is read after it ends, in a few seconds. Next, signals are caught during the call, and the CSM confirms them before hanging up.' },
          { kind: 'p', text: 'I’d re-run the speed and quality comparison every quarter. Switching a model is one setting, and the eval suite decides whether it may go live.' },
        ],
      },
      {
        id: 'agents',
        title: 'Multi-agent systems',
        blocks: [
          { kind: 'p', text: 'The build already has one agent checking another. The decision model gives an independent second opinion on the main model’s work, and code decides what that changes.' },
          {
            kind: 'list',
            items: [
              '**Specialist agents.** One finds the feedback, one checks each claim against the call, one routes. Each has its own tests and owner.',
              '**Drafts from a theme.** Agents draft a spec or a customer reply from a theme, and the owner reviews it.',
              '**More analyses on the same platform.** Follow-ups, renewal risk and escalations first, then compliance review and call coaching.',
              '**One place to run them all.** Agent Ops is built for fifty agents, each with an owner, a review date and the same nine checks.',
            ],
          },
        ],
      },
      {
        id: 'stack',
        title: 'From proof of concept to production',
        nav: 'The production stack',
        blocks: [
          { kind: 'p', text: 'The proof of concept runs on one Cloudflare Worker. The production design keeps the same boundaries on a stack built for scale, all in strict TypeScript. Only the hosting and the connectors change.' },
          { kind: 'table', label: 'From proof of concept to production', head: ['Job', 'Today (deployed)', 'In production'], rows: STACK, accentCol: 1 },
          { kind: 'p', text: 'Providers bill us directly, and keys stay on the server. The pipeline core doesn’t depend on Cloudflare, so this is a port of adapters, not a rewrite. The eval suite proves the port behaves the same.' },
        ],
      },
      {
        id: 'decisions',
        title: 'Why I built it this way',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Every call only after the rollout', text: 'Promising every call in the first quarter would contradict the rollout. So “every call, by default” starts after month 3.', note: 'Trade-off: slower to full coverage.' },
              { title: 'Build the platform, not one pipeline', text: 'Intake, triage and delivery are shared. So the next analysis reuses them instead of starting again.', note: 'Gap: the production stack is a design, not a port yet.' },
            ],
          },
        ],
      },
      {
        id: 'role',
        title: 'How this maps to AI Operations',
        nav: 'How this maps to the role',
        blocks: [
          {
            kind: 'cards',
            cols: 2,
            items: [
              { title: 'Build agents', text: 'Signal Loop is a working agent: redaction, a decision model for triage and second opinions, structured extraction, quotes checked in code, review gates, routing and quality tests.' },
              { title: 'Own the platform', text: 'Switchboard for the work: intake, triage, delivery and people. Agent Ops for running it: a registry, review dates, usage, logs, reliability targets, alerts and cost for every agent.' },
              { title: 'Raise the bar for builders', text: 'A nine-check agent standard, templates and office hours. So a Claude or Gumloop build gets to production safely.' },
              { title: 'Report impact', text: 'Adoption, hours returned, what it costs and what it’s worth, with the assumptions labelled.' },
            ],
          },
        ],
      },
      {
        id: 'questions',
        title: 'Questions people ask',
        blocks: [
          {
            kind: 'qa',
            items: [
              { q: 'Why would this move into Signal AI?', a: 'The long-term engine should be Invoca’s own conversation platform. The workflow, gates and routing still have to sit above it.' },
              { q: 'Isn’t production a rewrite?', a: 'No. It is a port of adapters, not logic. The ten-step pipeline and the shared contracts move unchanged, and the eval suite proves they behave the same.' },
            ],
          },
          {
            kind: 'related',
            label: 'Related questions',
            links: [
              { to: '/backup/build-vs-buy', label: 'Build vs buy' },
              { to: '/backup/differently', label: 'What I’d do differently' },
            ],
          },
        ],
      },
    ],
  },
];

export const CHAPTER_IDS = CHAPTER_PAGES.map((c) => c.id);

export const chapterPage = (id: string): ChapterPage | undefined => CHAPTER_PAGES.find((c) => c.id === id);

/** The groups in order, as the presentation shows them. */
export const CHAPTER_GROUPS = [...new Set(CHAPTER_PAGES.map((c) => c.group))].map((label) => ({ label, chapters: CHAPTER_PAGES.filter((c) => c.group === label) }));
