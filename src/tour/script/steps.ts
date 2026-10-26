/**
 * The presentation script: ten chapters. A scene shows all of its content at once and moves on
 * only with Back / Next (or ← →). Product steps advance when the viewer does the real thing (an
 * event from src/shared/events.ts) or when the real pipeline reaches the step being narrated.
 * The Guide (src/tour/guide) shows one step at a time.
 *
 * Step ids are `<chapter>.<what>`; a scene that is a whole chapter uses the chapter id. Branch-only
 * steps (privacy, messy, clean, rejected) are excluded from MAIN_ORDER at the bottom.
 */
import { PATH_LABELS, type Step, type TourCtx, type TourPath } from '../engine/types';
import { R } from './routes';
import {
  candidateCopy, candidateTitle, editCopy, extractCopy, gateCopy, gateTitle, groundCopy, introCopy, introFor, introTitle, messyCopy,
  opsKpiCopy, opsTraceCopy, pricingRuleOverridden, promoteCopy, redactCopy, rejectedCopy, runSettled, screenCopy, stepDone, themeCopy, timingCopy,
} from './copy';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';

const runRoute = (ctx: TourCtx) => (ctx.runId ? R.run(ctx.runId) : null);
const has = (ctx: TourCtx, p: TourPath) => ctx.path === p;
/** Stay on a theme page if we're on one; otherwise open the viewer's theme (or the top theme). */
const themeRoute = (ctx: TourCtx) => {
  if (/^\/app\/themes\/.+/.test(ctx.pathname)) return null;
  const id = ctx.themeId ?? ctx.theme?.id;
  return id ? R.theme(id) : null;
};
/** Branches where triage is the story (injection flag, nothing actionable). */
const screenMatters = (ctx: TourCtx) => has(ctx, 'security') || has(ctx, 'negative') || !!ctx.run?.screen?.injection_suspected || ctx.run?.screen?.actionable === false;
const nothingFound = (ctx: TourCtx) => has(ctx, 'negative') || (ctx.run?.insights.length === 0 && runSettled(ctx.run));

/** "Injection attempt" → "injection attempt", but "PHI-heavy call" stays "PHI-heavy call". */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const scenariosLeft = (ctx: TourCtx) => {
  const left = (['security', 'privacy', 'messy', 'negative', 'clean'] as TourPath[]).filter((p) => !ctx.explored.includes(p)).map((p) => lowerFirst(PATH_LABELS[p]));
  return left.length ? ` Still to try: ${left.slice(0, 3).join(', ')}.` : '';
};

export const STEPS: Step[] = [
  // ============================================================ introduction
  {
    id: 'signal', chapter: 'signal', kind: 'scene', scene: 'signal', route: R.scene('signal'),
    title: 'Every call is a signal.', body: 'One sentence in a 13-minute QBR belongs on the roadmap. Most feedback like it never reaches an owner.', next: 'real',
  },
  {
    id: 'real', chapter: 'real', kind: 'scene', scene: 'real', route: R.scene('real'),
    title: 'Built from scratch in 48 hours. Here’s what’s real.', body: 'All of the AI is built and works. The connections and the data are simulated, and labelled that way.', next: 'why',
  },
  {
    id: 'why', chapter: 'why', kind: 'scene', scene: 'why', route: R.scene('why'),
    title: 'Three options. I chose the feedback loop.', body: 'Option 3 points Invoca’s product at its own calls. Built in code, with three tested models on one Cloudflare Worker.', next: 'call.platform',
  },

  // ============================================================ the platform
  // ------------------------------------------------------------ call · where Signal Loop runs
  {
    id: 'call.platform', chapter: 'call', kind: 'scene', scene: 'platform', route: R.scene('call'),
    title: 'Signal Loop runs inside Switchboard.', body: 'Any conversation in, the right people out. Next, the real product, with the Guide along the bottom.', next: 'call.intro',
  },

  // ------------------------------------------------------------ call · bring in a call
  {
    id: 'call.intro', chapter: 'call', kind: 'product', route: R.newCall, target: 'new.upload',
    title: 'Bring in today’s call',
    body: 'A CSM shouldn’t retype a call into three tools. Bring it in, and the system does the data entry.',
    more: 'Upload takes any file: transcripts (VTT, SRT, Zoom or Gong files), notes, email, chat exports, PDF, Word, slides and spreadsheets. The browser turns each into text. Here you pick from a fictional library that looks like a call recorder’s export. In production, connectors pull calls in as they happen (simulated here).',
    waitFor: { event: 'picker.opened', hint: 'click Browse conversations' },
    next: 'call.pick',
    notes: 'Let them click. If I’m presenting, I click it myself. It’s the only manual step, and it goes away in production.',
  },
  {
    id: 'call.pick', chapter: 'call', kind: 'product', target: ['picker.recommended', 'picker.dialog'], resumeAt: 'call.intro',
    title: 'Choose a call',
    body: 'Start with Brightline’s QBR, highlighted. Or pick any file. Each one takes a different path.',
    more: 'Files aren’t labelled by how messy they are, on purpose. Clean notes, tidy transcripts, raw speech-to-text, forwarded emails, and tricky cases: a hidden instruction to the AI, a call full of health data, a check-in with nothing in it.',
    waitFor: { event: 'file.selected', hint: 'select a file, then press Open' },
    next: 'call.process',
  },
  {
    id: 'call.process', chapter: 'call', kind: 'product', route: R.newCall, target: 'new.run',
    title: (ctx) => introFor(ctx).title,
    body: (ctx) => introFor(ctx).body,
    more: 'Each run has ten steps. Each one is saved as it runs, with its timing, model, tokens and cost. If a step fails or runs long, the run picks up from the last saved step.',
    waitFor: { event: 'run.started', hint: 'press Process conversation' },
    next: 'call.watch',
    checkpoint: () => ({ value: 0, label: 'fields typed by the CSM', sub: 'the system did the data entry' }),
    notes: 'Name the branch out loud. If they picked something other than Brightline, say what this file is and what to watch for.',
  },

  // ------------------------------------------------------------ call · watch it run
  {
    // The latency story starts here: the clock on the page is the run's real one.
    id: 'call.watch', chapter: 'call', kind: 'product', route: runRoute, target: ['run.clock', 'run.stepper'],
    title: introTitle,
    body: introCopy,
    more: 'Ten steps run in order. Each saves a row as it goes: status, timing, model, tokens and cost. If a step fails or runs long, the run picks up from the last saved step. If live AI is off or over budget, it replays a recorded live run and says so.',
    ready: (ctx) => !!ctx.run, readyLabel: 'Starting the run…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'privacy') ? 'call.privacy' : 'call.screen'),
  },
  {
    id: 'call.privacy', chapter: 'call', kind: 'product', route: runRoute, target: 'run.redaction',
    title: 'Before and after redaction', body: redactCopy,
    more: 'Before any model call, code swaps personal details for reversible tokens like [PATIENT_1]. It double-checks each match, for example card checksums and believable birth dates. The original never leaves the server. The browser only sees a masked preview. Tokens keep the meaning and drop the identity.',
    ready: (ctx) => stepDone(ctx.run, 'redact'), readyLabel: 'Removing personal details…',
    waitFor: { event: 'redaction.toggled', hint: 'switch between Before and After' },
    next: 'call.screen',
  },
  {
    id: 'call.screen', chapter: 'call', kind: 'product', route: runRoute, target: 'run.screen',
    title: (ctx) => screenCopy(ctx).title, body: (ctx) => screenCopy(ctx).body,
    more: (ctx) =>
      screenMatters(ctx)
        ? 'The text is fenced off as data, not instructions. Every model can only answer in a fixed format, and none can take actions. So a planted “ignore your instructions” has nothing to act on. It’s flagged, logged and sent to a person.'
        : 'A small, fast model reads every input first. It comes from a different family than the main model. It works out what the input is, its language, which analyses apply, and whether anyone is trying to steer the AI. Names and health details were removed before it saw a word.',
    ready: (ctx) => stepDone(ctx.run, 'screen'), readyLabel: 'Reading it first…',
    waitFor: 'next', next: (ctx) => (nothingFound(ctx) ? 'call.timing' : 'call.ground'),
  },
  {
    // What extraction found and what the quote check did with it, in one step. A dropped quote is
    // the story when there is one; otherwise the insight list.
    id: 'call.ground', chapter: 'call', kind: 'product', route: runRoute, target: ['run.dropped', 'run.insights'], anchorTimeoutMs: 2500,
    title: (ctx) => (nothingFound(ctx) ? extractCopy(ctx).title : groundCopy(ctx).title),
    body: (ctx) => (nothingFound(ctx) ? extractCopy(ctx).body : groundCopy(ctx).body),
    more: (ctx) => groundCopy(ctx).more,
    ready: (ctx) => stepDone(ctx.run, 'ground'), readyLabel: 'Checking quotes…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'call.messy' : 'call.gate'),
    actions: (ctx) => {
      const dropped = ctx.run ? ctx.run.run.droppedCount + ctx.run.insights.flatMap((i) => i.evidence).filter((e) => e.method === 'failed').length : 0;
      if (!ctx.run || dropped > 0 || !ctx.peek || !stepDone(ctx.run, 'ground')) return undefined;
      return [
        { label: 'See a rejected quote', to: 'call.rejected', variant: 'ghost' },
        { label: 'Next', to: has(ctx, 'messy') ? 'call.messy' : 'call.gate', variant: 'primary' },
      ];
    },
    notes: 'Say the count of matched quotes out loud. On the current prompt every test quote matched (275 of 275), so the check is a seatbelt. “See a rejected quote” only shows up when a real run has dropped a quote.',
  },
  {
    id: 'call.rejected', chapter: 'call', kind: 'product', route: (ctx) => (ctx.peek ? R.run(ctx.peek.run.id) : null), target: 'run.dropped', anchorTimeoutMs: 5000,
    title: (ctx) => rejectedCopy(ctx).title, body: (ctx) => rejectedCopy(ctx).body,
    more: 'This is a different, real run. A quote came back that code couldn’t find in that run’s text, so its insight was dropped and counted. It never reached a reviewer as fact.',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'call.messy' : 'call.gate'),
    actions: (ctx) => [{ label: 'Back to my run', to: has(ctx, 'messy') ? 'call.messy' : 'call.gate', variant: 'primary' }],
  },
  {
    id: 'call.messy', chapter: 'call', kind: 'product', route: runRoute, target: 'run.insights',
    title: 'Still honest when it’s messy', body: messyCopy,
    more: 'Final confidence multiplies four things: the model’s confidence, how well the quote matched, how reliable that insight type usually is, and the account’s context. The model copies garbled text word for word, so quotes usually match exactly. Noise shows up as lower confidence and more review.',
    waitFor: 'next', next: 'call.gate',
  },
  {
    id: 'call.gate', chapter: 'call', kind: 'product', route: runRoute, target: 'run.gate',
    title: gateTitle, body: gateCopy,
    more: 'A score of 0.80 or more routes itself. From 0.55 to 0.80 goes to a person. Below that is held, but still visible. Churn risk and severe bugs always go to a person. Then the decision model checks each kept insight against its own quotes. Code decides what it may move, and items that must be reviewed never move.',
    ready: (ctx) => stepDone(ctx.run, 'score'), readyLabel: 'Scoring…',
    waitFor: 'next', next: 'call.timing',
  },
  {
    // The latency story lands here: the Timing card draws the real step timestamps.
    id: 'call.timing', chapter: 'call', kind: 'product', route: runRoute, target: ['run.timing', 'run.clock'], anchorTimeoutMs: 4000,
    title: (ctx) => timingCopy(ctx).title, body: (ctx) => timingCopy(ctx).body, more: (ctx) => timingCopy(ctx).more,
    ready: (ctx) => runSettled(ctx.run), readyLabel: 'Finishing the run…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'clean') ? 'call.clean' : 'review.approve'),
    actions: (ctx) =>
      has(ctx, 'clean')
        ? undefined
        : [
            { label: 'Try another file', to: 'call.intro', variant: 'ghost' },
            { label: 'Next', to: 'review.approve', variant: 'primary' },
          ],
    checkpoint: (ctx) => ({ value: ctx.explored.length, suffix: ' of 6', label: 'scenarios explored', sub: scenariosLeft(ctx).trim() || 'each file takes its own path' }),
    notes: 'Read the two real numbers out loud: triage alongside extraction, and the code steps under a millisecond. Then the link to every call in Agent Ops.',
  },
  {
    id: 'call.clean', chapter: 'call', kind: 'product', route: runRoute,
    title: 'Easy. Real calls aren’t like this.',
    body: 'Clean notes are the baseline. Want to see it hold up on a messy one?',
    waitFor: 'next', next: 'review.approve',
    actions: [
      { label: 'Try a messy one', to: 'call.intro', variant: 'ghost' },
      { label: 'Next', to: 'review.approve', variant: 'primary' },
    ],
  },

  // ============================================================ review · human in the loop
  {
    id: 'review.approve', chapter: 'review', kind: 'product', route: R.review, target: 'review.approve', highlight: ['review.why'],
    title: 'A person decides: approve one',
    body: 'Unsure or high-stakes items wait here, each with its reason. Approving sends it on and logs who did it.',
    more: 'Anything below 0.80 waits for a person. So does every severe bug, every churn risk, and anything from a file that may hold a planted instruction. Hover the badge to see why, like “Score 0.71, below 0.80”. Nothing on a waiting run routes until someone acts.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && e.action === 'approve', hint: 'press A, or click Approve and send' },
    next: 'review.edit',
  },
  {
    // Pressing Edit swaps the button for the edit form: follow it, and say what saving needs.
    id: 'review.edit', chapter: 'review', kind: 'product', route: R.review, target: ['review.editform', 'review.edit'],
    title: 'Now correct one', body: editCopy,
    more: 'Each correction saves who made it, the before, the after and a reason. Corrections become test cases. That’s how the next prompt gets better.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && (e.action === 'edit' || e.action === 'reject'), hint: 'press E, change a field, then Save and send' },
    next: 'routing.rule',
    checkpoint: (ctx) => ({ value: ctx.counters.approvals + ctx.counters.edits + ctx.counters.rejects, label: 'decisions made by a person', sub: 'saved as labelled examples' }),
  },

  // ============================================================ routing · right owner, right channel
  {
    id: 'routing.rule', chapter: 'routing', kind: 'product', route: R.routing, target: 'routing.rule.pricing',
    title: 'Routing is a table, not a prompt',
    body: (ctx) =>
      pricingRuleOverridden(ctx)
        ? 'You already changed this rule in your workspace. Change it again, or press Next.'
        : 'Your call: send pricing objections on accounts over $250k ARR to the VP of Product.',
    more: 'The model labels each insight. A rules table decides who hears it. Each rule matches type, product area, severity and ARR band to an owner and a channel. If several match, the lowest priority number wins. If none match, it goes to the triage queue, never nowhere. A change needs no prompt edit and no redeploy, and only affects your workspace.',
    waitFor: { event: 'rule.changed', hint: 'edit the pricing objection rule', satisfied: pricingRuleOverridden },
    next: 'routing.delivery',
  },
  {
    id: 'routing.delivery', chapter: 'routing', kind: 'product', route: R.destinations, target: ['dest.jira', 'dest.slack'],
    title: 'Where people already work',
    body: 'A Jira ticket with the quote, the account and its ARR. The owner is tagged by their own handle.',
    more: 'The tools are simulated: nothing is sent to a real Jira or Slack. The content, the people tagged and the receipt are generated for real, just as a real connector would get them. The other tabs show Slack, Salesforce, email and Google Drive.',
    waitFor: 'next', next: 'routing.connections',
  },
  {
    id: 'routing.connections', chapter: 'routing', kind: 'product', route: R.connections, target: 'connections.grid',
    title: 'Connections are simulated, routing is real',
    body: 'No real tool is called. Disconnect Jira and its rules go to triage instead. Nothing quietly disappears.',
    more: 'Connecting saves a connection to a simulated account in your workspace. Deliveries show as in-app previews with receipts. Routing checks those connections. If a rule’s tool is disconnected, or its owner has left the directory, the item goes to the triage queue with the reason. In production, the real APIs replace these one tool at a time.',
    waitFor: 'next', next: 'patterns.intro',
    checkpoint: (ctx) => ({ value: ctx.counters.rulesChanged, label: ctx.counters.rulesChanged === 1 ? 'routing rule changed' : 'routing rules changed', sub: '0 prompts edited' }),
  },

  // ============================================================ patterns · one complaint becomes a pattern
  {
    id: 'patterns.intro', chapter: 'patterns', kind: 'product', route: R.themes, target: 'theme.c1042',
    title: 'One complaint is an anecdote', body: (ctx) => themeCopy(ctx).intro,
    more: 'Code decides which theme an insight joins. It turns meaning into numbers (embeddings) and groups close matches above a similarity cutoff. The model only names the theme.',
    waitFor: { event: 'theme.opened', hint: 'open the highlighted theme' },
    next: 'patterns.theme',
  },
  {
    id: 'patterns.theme', chapter: 'patterns', kind: 'product', route: themeRoute, target: 'theme.arr',
    title: 'A pattern, with ARR attached', body: (ctx) => themeCopy(ctx).arr,
    more: 'ARR at stake is the ARR of the accounts that raised it, counted once each. It isn’t a churn forecast. The eight-week trend shows whether it’s growing. Every bar and every quote links back to the conversation it came from.',
    waitFor: 'next', next: 'patterns.ship',
    checkpoint: (ctx) => (ctx.theme ? { value: ctx.theme.accountCount, label: ctx.theme.accountCount === 1 ? 'account in one theme' : 'accounts in one theme', sub: `${ctx.theme.insightCount} insights, ARR attached` } : null),
  },

  // ------------------------------------------------------------ patterns · close the loop
  {
    id: 'patterns.ship', chapter: 'patterns', kind: 'product', route: R.destinations, target: 'ticket.state',
    title: 'Play the PM: ship it', body: 'Move the ticket to Shipped and watch who finds out.',
    waitFor: { event: 'ticket.state', where: (e) => e.name === 'ticket.state' && e.state === 'shipped', hint: 'move the ticket to Shipped' },
    next: 'patterns.loop',
  },
  {
    id: 'patterns.loop', chapter: 'patterns', kind: 'product', route: R.loop, target: ['loop.note', 'loop.shipped', 'loop.inbox'],
    title: 'The CSM hears back, with a note drafted',
    body: 'The moment it ships, the CSM gets the credit and a note for the customer. Drafted, not sent.',
    more: 'The relationship stays with the CSM. They edit the note and send it themselves. It lets them be the customer’s advocate, not the note-taker.',
    waitFor: 'next', next: 'operate.metrics',
    checkpoint: () => ({ value: 1, label: 'loop closed back to the CSM', sub: '0 status-chasing emails' }),
  },

  // ============================================================ operate · prove it
  {
    id: 'operate.metrics', chapter: 'operate', kind: 'product', route: R.evals, target: 'evals.metrics',
    title: 'Measured, not vibes',
    body: 'How often it’s right (precision) and how much it catches (recall), per type, on 48 hand-labelled files, by mess level.',
    more: 'Code matches answers to the labels: same type and overlapping quotes. Only unclear leftovers go to a judge model from a different family. The gate checks precision and recall across all types together. Per-type numbers are shown against that line. Level 5, the messiest, is where systems quietly break.',
    waitFor: 'next', next: 'operate.promote',
  },
  {
    id: 'operate.promote', chapter: 'operate', kind: 'product', route: R.evals, target: 'evals.promote',
    title: candidateTitle, body: 'A rewritten prompt, scored on the same files. It looks fine on recall. Try to promote it.',
    more: candidateCopy,
    waitFor: { event: 'eval.promote_attempted', hint: 'click Promote' },
    next: 'operate.gate',
  },
  {
    id: 'operate.gate', chapter: 'operate', kind: 'product', route: R.evals, target: 'evals.gate',
    title: (ctx) => promoteCopy(ctx).title, body: (ctx) => promoteCopy(ctx).body,
    more: (ctx) =>
      `${promoteCopy(ctx).more ?? ''} To promote, it must pass overall precision and recall, level-5 recall, the quote check and every safety check. No score can drop more than 2 points. Live AI also has a hard spend cap. Past it, runs replay recorded live runs, so nothing breaks.`.trim(),
    waitFor: 'next', next: 'operate.kpis',
    checkpoint: (ctx) => (ctx.counters.promoteAttempts && ctx.counters.promoted === false ? { value: 1, label: 'bad prompt blocked before it shipped', sub: 'by rule, not by judgement' } : null),
  },

  // ------------------------------------------------------------ operate · operate it (Agent Ops)
  {
    id: 'operate.kpis', chapter: 'operate', kind: 'product', route: R.ops, target: 'ops.overview.kpis',
    title: 'Agent Ops: what the exec sees', body: opsKpiCopy,
    more: 'Signal Loop is one agent in Agent Ops, the companion product for running every agent. Hours returned is the baseline minutes per task, as registered, minus the review minutes we measure. Baselines are labelled assumptions until a time study replaces them. This session’s data is live. The six-week history and the second agent, the RFP Responder, are simulated.',
    waitFor: 'next', next: 'operate.trace',
  },
  {
    id: 'operate.trace', chapter: 'operate', kind: 'product',
    route: (ctx) => (ctx.runId ? R.opsTrace(ctx.runId) : ctx.ops?.traceId ? R.opsTrace(ctx.ops.traceId) : null),
    target: 'ops.trace.waterfall', anchorTimeoutMs: 4000,
    title: 'Your run, every call', body: opsTraceCopy,
    more: 'Each run gets one trace, with a timed bar for every step, model call and delivery. They’re the same timings the conversation page showed. Logs, usage, cost, service targets and the nine-check agent standard are one click away.',
    waitFor: 'next', next: 'production',
    checkpoint: (ctx) => {
      const sl = ctx.ops?.overview?.agents.find((a) => a.agentId === SIGNAL_LOOP_AGENT_ID);
      return sl ? { value: Math.round(sl.hoursReturned), label: 'hours returned by Signal Loop', sub: 'baselines are labelled assumptions' } : null;
    },
  },

  // ============================================================ closing
  {
    id: 'production', chapter: 'production', kind: 'scene', scene: 'production', route: R.scene('production'),
    title: 'Making it real', body: 'Earn trust one phase at a time. Grow on the same platform. Run the same design on production tools.', next: 'scorecard',
  },
  {
    id: 'scorecard', chapter: 'scorecard', kind: 'scene', scene: 'scorecard', route: R.scene('scorecard'),
    title: 'Scorecard', body: 'What you did, what the system did.', next: 'scorecard',
  },
];

export const STEP_BY_ID: Record<string, Step> = Object.fromEntries(STEPS.map((s) => [s.id, s]));
export const FIRST_STEP = 'signal';
export const firstStepOf = (chapter: string): string => STEPS.find((s) => s.chapter === chapter)?.id ?? FIRST_STEP;
/** Branch-only steps: off the main path, so they don't count in progress or "Step n of m". */
export const BRANCH_STEPS = ['call.privacy', 'call.messy', 'call.clean', 'call.rejected'];
/** The main-path order, for progress. */
export const MAIN_ORDER = STEPS.filter((s) => !BRANCH_STEPS.includes(s.id)).map((s) => s.id);
/** Steps of a chapter on the main path. */
export const chapterSteps = (chapter: string): string[] => MAIN_ORDER.filter((id) => STEP_BY_ID[id]?.chapter === chapter);
