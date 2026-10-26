/**
 * The presentation script. Scenes are presenter-paced (→ / Space). Product steps advance when
 * the viewer does the real thing (an event from src/shared/events.ts) or when the real pipeline
 * reaches the step being narrated. The Guide (src/tour/guide) shows one step at a time.
 *
 * Product chapters keep only the essential beats: 22 steps on the main path. Branch-only steps
 * (privacy, messy, clean, rejected) are excluded from MAIN_ORDER at the bottom.
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
  // ============================================================ before the build
  {
    id: 'cold-open', chapter: 'cold-open', kind: 'scene', scene: 'cold-open', beats: 2, route: R.scene('cold-open'),
    title: 'Every call is a signal.', body: 'Invoca turns calls into signals. I built the same loop for Invoca’s own customer calls.', next: 'real',
  },
  {
    id: 'real', chapter: 'real', kind: 'scene', scene: 'real', beats: 1, route: R.scene('real'),
    title: 'Built from scratch in 48 hours. Here’s what’s real.', body: 'All of the AI is built and working. The connections and the data are simulated, and say so.', next: 'black-hole',
  },
  {
    id: 'black-hole', chapter: 'black-hole', kind: 'scene', scene: 'black-hole', beats: 3, route: R.scene('black-hole'),
    title: 'Where feedback gets lost', body: 'Most of what customers tell CSMs never reaches the person who could act on it.', next: 'why',
  },
  {
    id: 'why', chapter: 'why', kind: 'scene', scene: 'why', beats: 2, route: R.scene('why'),
    title: 'Why this option, and not the others', body: 'Option 3 is Invoca’s own product pointed inward. Then: why raw code, three models and one Worker.', next: 'jtbd',
  },
  {
    id: 'jtbd', chapter: 'jtbd', kind: 'scene', scene: 'jtbd', beats: 2, route: R.scene('jtbd'),
    title: 'Jobs to be done', body: 'Four people, four jobs. Open each card.', next: 'states',
  },
  {
    id: 'states', chapter: 'states', kind: 'scene', scene: 'states', beats: 4, route: R.scene('states'),
    title: 'Today and tomorrow', body: 'Leaks at every handoff, then sealed.', next: 'platform',
  },

  // ============================================================ the system
  {
    id: 'platform', chapter: 'platform', kind: 'scene', scene: 'platform', beats: 4, route: R.scene('platform'),
    title: 'The platform', body: 'Signal Loop runs inside Switchboard: any conversation in, the right people out.', next: 'ch1.intro',
  },

  // ------------------------------------------------------------ ch1 · a call comes in
  {
    id: 'ch1.intro', chapter: 'ch1', kind: 'product', route: R.newCall, target: 'new.upload',
    title: 'Bring in today’s call',
    body: 'A CSM shouldn’t retype a call into three tools. Bring it in; the system does the data entry.',
    more: 'Upload takes any file: transcripts (VTT, SRT, Zoom or Gong JSON), notes, email, chat exports, PDF, Word, slides and spreadsheets, converted to text in the browser. Here you pick from a fictional library shaped like a call-recorder export; in production, connectors pull calls as they happen (simulated here).',
    waitFor: { event: 'picker.opened', hint: 'click Browse conversations' },
    next: 'ch1.pick',
    notes: 'Let them click. If presenting, click it myself: this is the only manual step, and in production it goes away.',
  },
  {
    id: 'ch1.pick', chapter: 'ch1', kind: 'product', target: ['picker.recommended', 'picker.dialog'], resumeAt: 'ch1.intro',
    title: 'Choose a call',
    body: 'Start with Brightline’s QBR, highlighted. Or pick any file: each one takes a different path.',
    more: 'Mess levels aren’t labelled on purpose. Clean notes, tidy transcripts, raw speech-to-text, forwarded email threads, plus edge cases: an injection attempt, a PHI-heavy call, a check-in with nothing in it.',
    waitFor: { event: 'file.selected', hint: 'select a file, then press Open' },
    next: 'ch1.run',
  },
  {
    id: 'ch1.run', chapter: 'ch1', kind: 'product', route: R.newCall, target: 'new.run',
    title: (ctx) => introFor(ctx).title,
    body: (ctx) => introFor(ctx).body,
    more: 'Each run executes ten steps, each saved as it runs with its timing, model, tokens and cost. If a step fails or runs long, a durable workflow resumes from the last saved step.',
    waitFor: { event: 'run.started', hint: 'press Process conversation' },
    next: 'ch2.intro',
    checkpoint: () => ({ value: 0, label: 'fields typed by the CSM', sub: 'the system did the data entry' }),
    notes: 'Name the branch out loud. If they picked something other than Brightline, say what this file is and what to watch for.',
  },

  // ------------------------------------------------------------ ch2 · watch it run
  {
    // The latency beat starts here: the clock on the page is the run's real one.
    id: 'ch2.intro', chapter: 'ch2', kind: 'product', route: runRoute, target: ['run.clock', 'run.stepper'],
    title: introTitle,
    body: introCopy,
    more: 'Ten steps run in order and save a row as they go: status, timing, model, tokens, cost. If a step fails or runs long, a durable workflow resumes from the last saved step. If live AI is off or over budget, the run replays a recorded live run and says so.',
    ready: (ctx) => !!ctx.run, readyLabel: 'Starting the run…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'privacy') ? 'ch2.privacy' : 'ch2.screen'),
  },
  {
    id: 'ch2.privacy', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.redaction',
    title: 'Before and after redaction', body: redactCopy,
    more: 'Patterns plus validators (card checksums, date sanity for birth dates) swap values for reversible tokens like [PATIENT_1] before any model call. The original never leaves the Worker; the browser only sees a masked preview. Tokens keep the meaning and drop the identity.',
    ready: (ctx) => stepDone(ctx.run, 'redact'), readyLabel: 'Removing personal details…',
    waitFor: { event: 'redaction.toggled', hint: 'switch between Before and After' },
    next: 'ch2.screen',
  },
  {
    id: 'ch2.screen', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.screen',
    title: (ctx) => screenCopy(ctx).title, body: (ctx) => screenCopy(ctx).body,
    more: (ctx) =>
      screenMatters(ctx)
        ? 'Text is wrapped as data between delimiters, every model can only return a fixed schema, and none has tools. A planted “ignore your instructions” has nothing to act on, so it’s flagged, logged and sent to a person.'
        : 'A small, fast model from a different family than the main one reads every input first: what it is, its language, which analyses apply, and whether anyone is trying to steer the AI. Names and health details were removed before it saw a word.',
    ready: (ctx) => stepDone(ctx.run, 'screen'), readyLabel: 'Triaging…',
    waitFor: 'next', next: (ctx) => (nothingFound(ctx) ? 'ch2.timing' : 'ch2.ground'),
  },
  {
    // What extraction found and what the quote check did with it, in one beat. A dropped quote is
    // the story when there is one; otherwise the insight list.
    id: 'ch2.ground', chapter: 'ch2', kind: 'product', route: runRoute, target: ['run.dropped', 'run.insights'], anchorTimeoutMs: 2500,
    title: (ctx) => (nothingFound(ctx) ? extractCopy(ctx).title : groundCopy(ctx).title),
    body: (ctx) => (nothingFound(ctx) ? extractCopy(ctx).body : groundCopy(ctx).body),
    more: (ctx) => groundCopy(ctx).more,
    ready: (ctx) => stepDone(ctx.run, 'ground'), readyLabel: 'Checking quotes…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate'),
    actions: (ctx) => {
      const dropped = ctx.run ? ctx.run.run.droppedCount + ctx.run.insights.flatMap((i) => i.evidence).filter((e) => e.method === 'failed').length : 0;
      if (!ctx.run || dropped > 0 || !ctx.peek || !stepDone(ctx.run, 'ground')) return undefined;
      return [
        { label: 'See a rejected quote', to: 'ch2.rejected', variant: 'ghost' },
        { label: 'Next', to: has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate', variant: 'primary' },
      ];
    },
    notes: 'Say the grounded count out loud. On the promoted prompt every eval quote grounded (275 of 275), so the check is the seatbelt. “See a rejected quote” only appears when a real run with a dropped quote exists.',
  },
  {
    id: 'ch2.rejected', chapter: 'ch2', kind: 'product', route: (ctx) => (ctx.peek ? R.run(ctx.peek.run.id) : null), target: 'run.dropped', anchorTimeoutMs: 5000,
    title: (ctx) => rejectedCopy(ctx).title, body: (ctx) => rejectedCopy(ctx).body,
    more: 'This is a different, real run. A quote came back that code couldn’t find in that run’s text, so its insight was dropped and counted. It never reached a reviewer as fact.',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate'),
    actions: (ctx) => [{ label: 'Back to my run', to: has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate', variant: 'primary' }],
  },
  {
    id: 'ch2.messy', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.insights',
    title: 'Honest under noise', body: messyCopy,
    more: 'Final confidence = model confidence × quote match × type prior × account context. The model quotes the garbled text verbatim, so quotes usually match exactly; noise shows up as lower confidence and more review.',
    waitFor: 'next', next: 'ch2.gate',
  },
  {
    id: 'ch2.gate', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.gate',
    title: gateTitle, body: gateCopy,
    more: 'Thresholds: 0.80 and up routes itself, 0.55 to 0.80 goes to a person, below that is held but visible. Churn risk and severe bugs always go to a person. The decision model then checks each kept insight against its own quotes; code decides what it may move, and forced reviews never move.',
    ready: (ctx) => stepDone(ctx.run, 'score'), readyLabel: 'Scoring…',
    waitFor: 'next', next: 'ch2.timing',
  },
  {
    // The latency beat lands here: the Timing card draws the real step timestamps.
    id: 'ch2.timing', chapter: 'ch2', kind: 'product', route: runRoute, target: ['run.timing', 'run.clock'], anchorTimeoutMs: 4000,
    title: (ctx) => timingCopy(ctx).title, body: (ctx) => timingCopy(ctx).body, more: (ctx) => timingCopy(ctx).more,
    ready: (ctx) => runSettled(ctx.run), readyLabel: 'Finishing the run…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'clean') ? 'ch2.clean' : 'ch3.approve'),
    actions: (ctx) =>
      has(ctx, 'clean')
        ? undefined
        : [
            { label: 'Try another file', to: 'ch1.intro', variant: 'ghost' },
            { label: 'Next', to: 'ch3.approve', variant: 'primary' },
          ],
    checkpoint: (ctx) => ({ value: ctx.explored.length, suffix: ' of 6', label: 'scenarios explored', sub: scenariosLeft(ctx).trim() || 'each file takes its own path' }),
    notes: 'Read the two real numbers out loud: triage alongside extraction, and the code steps under a millisecond. Then the link to every call in Agent Ops.',
  },
  {
    id: 'ch2.clean', chapter: 'ch2', kind: 'product', route: runRoute,
    title: 'Easy. Real calls aren’t like this.',
    body: 'Clean notes are the baseline. Want to see it hold up on a messy one?',
    waitFor: 'next', next: 'ch3.approve',
    actions: [
      { label: 'Try a messy one', to: 'ch1.intro', variant: 'ghost' },
      { label: 'Next', to: 'ch3.approve', variant: 'primary' },
    ],
  },

  // ------------------------------------------------------------ ch3 · human in the loop
  {
    id: 'ch3.approve', chapter: 'ch3', kind: 'product', route: R.review, target: 'review.approve', highlight: ['review.why'],
    title: 'A person decides: approve one',
    body: 'Uncertain or high-stakes items wait here, each with its reason. Approving routes it, with an audit row.',
    more: 'Below 0.80, every severe bug, every churn risk, and everything from a file with a suspected injection waits for a person. Hover the badge for the reason, like “Score 0.71, below 0.80”. Nothing on a parked run routes until someone acts.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && e.action === 'approve', hint: 'press A, or click Approve and send' },
    next: 'ch3.edit',
  },
  {
    // Pressing Edit swaps the button for the edit form: follow it, and say what saving needs.
    id: 'ch3.edit', chapter: 'ch3', kind: 'product', route: R.review, target: ['review.editform', 'review.edit'],
    title: 'Now correct one', body: editCopy,
    more: 'Each correction is saved with who made it, the before and the after, and a reason. Corrections become test cases, which is how the next prompt version gets better.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && (e.action === 'edit' || e.action === 'reject'), hint: 'press E, change a field, then Save and send' },
    next: 'ch4.rule',
    checkpoint: (ctx) => ({ value: ctx.counters.approvals + ctx.counters.edits + ctx.counters.rejects, label: 'decisions made by a person', sub: 'saved as labelled data' }),
  },

  // ------------------------------------------------------------ ch4 · right owner, right channel
  {
    id: 'ch4.rule', chapter: 'ch4', kind: 'product', route: R.routing, target: 'routing.rule.pricing',
    title: 'Routing is a table, not a prompt',
    body: (ctx) =>
      pricingRuleOverridden(ctx)
        ? 'You already changed this rule in your workspace. Change it again, or press Next.'
        : 'Your call: send pricing objections on accounts over $250k ARR to the VP of Product.',
    more: 'The model classifies; a rules table decides who hears it. Rules match type, product area, severity and ARR band to an owner and a channel; the lowest priority wins, and no match goes to the triage queue, never nowhere. A change needs no prompt edit and no redeploy, and applies to your workspace only.',
    waitFor: { event: 'rule.changed', hint: 'edit the pricing objection rule', satisfied: pricingRuleOverridden },
    next: 'ch4.delivery',
  },
  {
    id: 'ch4.delivery', chapter: 'ch4', kind: 'product', route: R.destinations, target: ['dest.jira', 'dest.slack'],
    title: 'Where people already work',
    body: 'A Jira ticket with the quote, the account and its ARR, the owner tagged by their own handle.',
    more: 'The tools are simulated: nothing is sent to a real Jira or Slack. The content, the people tagged and the receipt are generated for real, the same way a real connector would get them. The other tabs show Slack, Salesforce, email and Google Drive.',
    waitFor: 'next', next: 'ch4.connections',
  },
  {
    id: 'ch4.connections', chapter: 'ch4', kind: 'product', route: R.connections, target: 'connections.grid',
    title: 'Connections are simulated, routing is real',
    body: 'No real tool is called. Disconnect Jira and its rules route to triage instead; nothing silently disappears.',
    more: 'Connecting records a workspace connection with a simulated account; deliveries render as in-app previews with receipts. Routing reads that state: a rule whose tool is disconnected, or whose owner left the directory, goes to the triage queue with the reason. Production swaps in the real APIs, one destination at a time.',
    waitFor: 'next', next: 'ch5.intro',
    checkpoint: (ctx) => ({ value: ctx.counters.rulesChanged, label: ctx.counters.rulesChanged === 1 ? 'routing rule changed' : 'routing rules changed', sub: '0 prompts edited' }),
  },

  // ------------------------------------------------------------ ch5 · patterns
  {
    id: 'ch5.intro', chapter: 'ch5', kind: 'product', route: R.themes, target: 'theme.c1042',
    title: 'One complaint is an anecdote', body: (ctx) => themeCopy(ctx).intro,
    more: 'Membership is decided in code: embeddings plus nearest neighbours above a similarity threshold. The model only names the theme.',
    waitFor: { event: 'theme.opened', hint: 'open the highlighted theme' },
    next: 'ch5.theme',
  },
  {
    id: 'ch5.theme', chapter: 'ch5', kind: 'product', route: themeRoute, target: 'theme.arr',
    title: 'A pattern, with ARR attached', body: (ctx) => themeCopy(ctx).arr,
    more: 'ARR at stake is the ARR of the accounts that raised it, counted once each, not a churn forecast. The eight-week trend shows whether it’s growing; every bar and every representative quote links back to the conversation it came from.',
    waitFor: 'next', next: 'ch6.ship',
    checkpoint: (ctx) => (ctx.theme ? { value: ctx.theme.accountCount, label: ctx.theme.accountCount === 1 ? 'account in one theme' : 'accounts in one theme', sub: `${ctx.theme.insightCount} insights, ARR attached` } : null),
  },

  // ------------------------------------------------------------ ch6 · close the loop
  {
    id: 'ch6.ship', chapter: 'ch6', kind: 'product', route: R.destinations, target: 'ticket.state',
    title: 'Play the PM: ship it', body: 'Move the ticket to Shipped and watch who finds out.',
    waitFor: { event: 'ticket.state', where: (e) => e.name === 'ticket.state' && e.state === 'shipped', hint: 'move the ticket to Shipped' },
    next: 'ch6.loop',
  },
  {
    id: 'ch6.loop', chapter: 'ch6', kind: 'product', route: R.loop, target: ['loop.note', 'loop.shipped', 'loop.inbox'],
    title: 'The CSM hears back, with a note drafted',
    body: 'The moment it ships, the CSM gets the credit and a note for the customer. Drafted, not sent.',
    more: 'The relationship stays the CSM’s: they edit the note and send it themselves. This is the emotional job from the start: be the advocate, not the stenographer.',
    waitFor: 'next', next: 'ch7.metrics',
    checkpoint: () => ({ value: 1, label: 'loop closed back to the CSM', sub: '0 status-chasing emails' }),
  },

  // ------------------------------------------------------------ ch7 · prove it
  {
    id: 'ch7.metrics', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.metrics',
    title: 'Measured, not vibes',
    body: 'Precision and recall per insight type, against 48 hand-labelled files, sliced by how messy they are.',
    more: 'Matching is by code: same type and overlapping quote spans. Only ambiguous leftovers go to a judge from a different model family. The gate checks precision and recall pooled; per type they are reported against that line. Level 5 is where systems quietly break.',
    waitFor: 'next', next: 'ch7.promote',
  },
  {
    id: 'ch7.promote', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.promote',
    title: candidateTitle, body: 'A rewritten prompt, scored on the same files. It looks fine on recall. Try to promote it.',
    more: candidateCopy,
    waitFor: { event: 'eval.promote_attempted', hint: 'click Promote' },
    next: 'ch7.gate',
  },
  {
    id: 'ch7.gate', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.gate',
    title: (ctx) => promoteCopy(ctx).title, body: (ctx) => promoteCopy(ctx).body,
    more: (ctx) =>
      `${promoteCopy(ctx).more ?? ''} Promotion needs overall precision and recall, level-5 recall, the quote check and every safety check to pass, with no regression over 2 points. Live AI also has a hard spend cap: past it, runs replay recorded live runs, so nothing breaks.`.trim(),
    waitFor: 'next', next: 'ch8.kpis',
    checkpoint: (ctx) => (ctx.counters.promoteAttempts && ctx.counters.promoted === false ? { value: 1, label: 'bad prompt blocked before it shipped', sub: 'by rule, not by judgement' } : null),
  },

  // ------------------------------------------------------------ ch8 · operate it (Agent Ops)
  {
    id: 'ch8.kpis', chapter: 'ch8', kind: 'product', route: R.ops, target: 'ops.overview.kpis',
    title: 'Agent Ops: what the exec sees', body: opsKpiCopy,
    more: 'Signal Loop is one agent in Agent Ops, the sibling product for operating every agent. Hours returned = registered baseline minutes per unit minus measured review minutes; baselines are labelled assumptions until a time study replaces them. This session’s telemetry is live; the six-week history and the second agent, the RFP Responder, are simulated.',
    waitFor: 'next', next: 'ch8.trace',
  },
  {
    id: 'ch8.trace', chapter: 'ch8', kind: 'product',
    route: (ctx) => (ctx.runId ? R.opsTrace(ctx.runId) : ctx.ops?.traceId ? R.opsTrace(ctx.ops.traceId) : null),
    target: 'ops.trace.waterfall', anchorTimeoutMs: 4000,
    title: 'Your run, every call', body: opsTraceCopy,
    more: 'One trace per run, with a span for every step, model call and delivery: the same timings the conversation page drew. Logs, usage, cost, SLOs and the nine-check agent standard live one click away.',
    waitFor: 'next', next: 'rollout',
    checkpoint: (ctx) => {
      const sl = ctx.ops?.overview?.agents.find((a) => a.agentId === SIGNAL_LOOP_AGENT_ID);
      return sl ? { value: Math.round(sl.hoursReturned), label: 'hours returned by Signal Loop', sub: 'baselines are labelled assumptions' } : null;
    },
  },

  // ============================================================ making it real
  {
    id: 'rollout', chapter: 'rollout', kind: 'scene', scene: 'rollout', beats: 3, route: R.scene('rollout'),
    title: 'Earning trust', body: 'Build it, then operate it.', next: 'horizon',
  },
  {
    id: 'horizon', chapter: 'horizon', kind: 'scene', scene: 'horizon', beats: 2, route: R.scene('horizon'),
    title: 'The next 12–18 months', body: 'Where this goes.', next: 'production',
  },
  {
    id: 'production', chapter: 'production', kind: 'scene', scene: 'production', beats: 2, route: R.scene('production'),
    title: 'From proof of concept to production', body: 'Same design, production stack.', next: 'scorecard',
  },
  {
    id: 'scorecard', chapter: 'scorecard', kind: 'scene', scene: 'scorecard', beats: 1, route: R.scene('scorecard'),
    title: 'Scorecard', body: 'What you did, what the system did.', next: 'scorecard',
  },
];

export const STEP_BY_ID: Record<string, Step> = Object.fromEntries(STEPS.map((s) => [s.id, s]));
export const FIRST_STEP = 'cold-open';
export const firstStepOf = (chapter: string): string => STEPS.find((s) => s.chapter === chapter)?.id ?? FIRST_STEP;
/** Branch-only steps: off the main path, so they don't count in progress or "Step n of m". */
export const BRANCH_STEPS = ['ch2.privacy', 'ch2.messy', 'ch2.clean', 'ch2.rejected'];
/** The main-path order, for progress. */
export const MAIN_ORDER = STEPS.filter((s) => !BRANCH_STEPS.includes(s.id)).map((s) => s.id);
/** Steps of a chapter on the main path. */
export const chapterSteps = (chapter: string): string[] => MAIN_ORDER.filter((id) => STEP_BY_ID[id]?.chapter === chapter);
