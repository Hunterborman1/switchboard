/**
 * The walkthrough script. Scenes are presenter-paced (→ / Space). Product steps advance
 * when the viewer does the real thing (an event from src/shared/events.ts) or when the
 * real pipeline reaches the step being narrated.
 */
import { PATH_LABELS, type Step, type TourCtx, type TourPath } from '../engine/types';
import { R } from './routes';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';
import {
  budgetCopy, extractCopy, gateCopy, groundCopy, messyCopy, opsKpiCopy, opsLiveCopy, opsLogsCopy,
  opsRegistryCopy, promoteCopy, redactCopy, runSettled, screenCopy, stepDone, traceCopy, usd,
  rejectedCopy, candidateCopy, candidateTitle, themeCopy, introCopy, editCopy, introFor, sankeyCopy, opsTraceCopy, pricingRuleOverridden,
} from './copy';

const runRoute = (ctx: TourCtx) => (ctx.runId ? R.run(ctx.runId) : null);
const has = (ctx: TourCtx, p: TourPath) => ctx.path === p;
/** Stay on a theme page if we're on one; otherwise open the viewer's theme (or the top theme). */
const themeRoute = (ctx: TourCtx) => {
  if (/^\/app\/themes\/.+/.test(ctx.pathname)) return null;
  const id = ctx.themeId ?? ctx.theme?.id;
  return id ? R.theme(id) : null;
};
/** Branches where the screen result is the story (injection flag, nothing actionable). */
const screenMatters = (ctx: TourCtx) => has(ctx, 'security') || has(ctx, 'negative') || !!ctx.run?.screen?.injection_suspected || ctx.run?.screen?.actionable === false;
const anchorPresent = (id: string) => typeof document !== 'undefined' && !!document.querySelector(`[data-tour="${id}"]`);

/** "Injection attempt" → "injection attempt", but "PHI-heavy call" stays "PHI-heavy call". */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export const STEPS: Step[] = [
  // ============================================================ narrative · the problem
  {
    id: 'cold-open', chapter: 'cold-open', kind: 'scene', scene: 'cold-open', beats: 2, route: R.scene('cold-open'),
    title: 'Every call is a signal.', body: 'Invoca turns calls into signals. I built the same loop for Invoca’s own customer calls.', next: 'black-hole',
  },
  {
    id: 'black-hole', chapter: 'black-hole', kind: 'scene', scene: 'black-hole', beats: 3, route: R.scene('black-hole'),
    title: 'The insight black hole', body: 'Most of what customers tell CSMs never reaches the person who could act on it.', next: 'why',
  },
  {
    id: 'why', chapter: 'why', kind: 'scene', scene: 'why', beats: 3, route: R.scene('why'),
    title: 'Why this option', body: 'The product already does this for customers’ calls. Point it inward.', next: 'jtbd',
  },
  {
    id: 'jtbd', chapter: 'jtbd', kind: 'scene', scene: 'jtbd', beats: 2, route: R.scene('jtbd'),
    title: 'Jobs to be done', body: 'Four people, four jobs. Flip each card.', next: 'states',
  },
  {
    id: 'states', chapter: 'states', kind: 'scene', scene: 'states', beats: 4, route: R.scene('states'),
    title: 'Current → future state', body: 'Leaks at every handoff, then sealed.', next: 'ch1.intro',
  },

  // ============================================================ ch1 · a call comes in
  {
    id: 'ch1.intro', chapter: 'ch1', kind: 'product', route: R.newCall, target: 'new.upload', placement: 'bottom',
    title: 'Bring in today’s call',
    body: 'A CSM shouldn’t retype a call into three tools. Drop the file in; the system does the data entry.',
    more: 'In production this is automatic: dlt pulls recordings and notes from whichever recorder and CRM the CS team uses (Gong, Zoom, Salesforce and Zendesk are examples). Here you pick from a synthetic library shaped like a call-recorder export.',
    waitFor: { event: 'picker.opened', hint: 'Click Upload' },
    next: 'ch1.pick',
    notes: 'Let them click. If presenting, click Upload myself and say: this is the only manual step, and in production it goes away.',
  },
  {
    id: 'ch1.pick', chapter: 'ch1', kind: 'product', target: 'picker.dialog', highlight: ['picker.recommended'], placement: 'right', interact: 'all',
    title: 'Choose a call',
    body: 'We’ll start with Brightline’s QBR. Or pick any file; each one tells a different story.',
    more: 'Mess levels aren’t labelled on purpose. Clean notes, tidy transcripts, raw speech-to-text, forwarded email threads, plus edge cases: an injection attempt, a PHI-heavy call, a check-in with nothing in it.',
    waitFor: { event: 'file.selected', hint: 'Select a file and open it' },
    next: 'ch1.open',
  },
  {
    id: 'ch1.open', chapter: 'ch1', kind: 'product', target: 'picker.open', placement: 'top', interact: 'all',
    title: 'Open it', body: 'Good pick. Open the file to load it into a new run.',
    waitFor: { event: 'picker.closed', hint: 'Click Open' },
    onEnter: (_ctx, api) => {
      window.setTimeout(() => {
        if (!anchorPresent('picker.dialog')) api.next();
      }, 450);
    },
    next: 'ch1.run',
  },
  {
    id: 'ch1.run', chapter: 'ch1', kind: 'product', route: R.newCall, target: 'new.run', placement: 'top',
    title: (ctx) => introFor(ctx).title,
    body: (ctx) => introFor(ctx).body,
    more: 'Each run executes ten steps on a fast path, each saved as it runs: status, timing, hashes, model, tokens, cost. If a step fails or runs long, a durable Cloudflare Workflow resumes from the last completed step. The UI animates from those rows.',
    waitFor: { event: 'run.started', hint: 'Click Run pipeline' },
    next: 'ch2.intro',
    checkpoint: () => ({ value: 0, label: 'fields typed by the CSM', sub: '1 call in · the system does the data entry' }),
    notes: 'Name the branch out loud. If they picked something other than Brightline, say what this file is and what to watch for.',
  },

  // ============================================================ ch2 · watch it think
  {
    id: 'ch2.intro', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.stepper', placement: 'bottom', pace: 'slow',
    title: 'Ten steps, each saved as it runs',
    body: introCopy,
    more: 'Steps run on a fast path and save as they go. If one fails or runs long, a durable Workflow resumes from the last saved step. If live AI is unavailable or over budget, the run replays a recorded real execution at real speed, and says so on screen.',
    ready: (ctx) => !!ctx.run, readyLabel: 'Starting the run…',
    waitFor: 'next', next: 'ch2.redact',
  },
  {
    id: 'ch2.redact', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.transcript', placement: 'left', pace: 'slow',
    title: 'Redaction comes first', body: redactCopy,
    more: 'Regex plus validators (Luhn for cards, date sanity for DOB) swap values for reversible tokens like [PATIENT_1]. The original never leaves the Worker; the browser only sees a masked preview.',
    ready: (ctx) => stepDone(ctx.run, 'redact'), readyLabel: 'Redacting…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'privacy') ? 'ch2.privacy' : screenMatters(ctx) ? 'ch2.screen' : 'ch2.extract'),
  },
  {
    id: 'ch2.privacy', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.redaction', placement: 'bottom', pace: 'slow',
    title: 'Before and after', body: 'Toggle it. Only the redacted side ever reached a model. Tokens keep the meaning, drop the identity.',
    waitFor: { event: 'redaction.toggled', hint: 'Toggle before / after' },
    next: (ctx) => (screenMatters(ctx) ? 'ch2.screen' : 'ch2.extract'),
  },
  {
    id: 'ch2.screen', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.screen', placement: 'left', pace: 'slow',
    title: (ctx) => screenCopy(ctx).title, body: (ctx) => screenCopy(ctx).body,
    more: 'Transcript text is wrapped as data between delimiters, the model can only return a fixed schema, and it has no tools. A planted “ignore your instructions” can’t do anything, so it’s flagged and logged.',
    ready: (ctx) => stepDone(ctx.run, 'screen'), readyLabel: 'Screening…',
    waitFor: 'next', next: 'ch2.extract',
  },
  {
    id: 'ch2.extract', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.insights', placement: 'left', pace: 'slow',
    title: (ctx) => extractCopy(ctx).title, body: (ctx) => extractCopy(ctx).body,
    more: 'Structured output from a Zod schema: type, summary, product area, severity, sentiment, evidence[], confidence, rationale. Invalid JSON gets one retry with the errors fed back, then the fallback model, then the dead-letter queue.',
    ready: (ctx) => stepDone(ctx.run, 'extract'), readyLabel: 'Extracting…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'negative') || (ctx.run?.insights.length === 0 && runSettled(ctx.run)) ? 'ch2.trace' : 'ch2.ground'),
  },
  {
    // A dropped quote is the story when there is one; otherwise point at the Ground step itself.
    id: 'ch2.ground', chapter: 'ch2', kind: 'product', route: runRoute, target: ['run.dropped', 'run.ground'], placement: 'bottom', pace: 'slow', anchorTimeoutMs: 2500,
    title: (ctx) => groundCopy(ctx).title, body: (ctx) => groundCopy(ctx).body, more: (ctx) => groundCopy(ctx).more,
    ready: (ctx) => stepDone(ctx.run, 'ground'), readyLabel: 'Grounding quotes…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate'),
    actions: (ctx) => {
      const dropped = ctx.run ? ctx.run.run.droppedCount + ctx.run.insights.flatMap((i) => i.evidence).filter((e) => e.method === 'failed').length : 0;
      if (!ctx.run || dropped > 0 || !ctx.peek || !stepDone(ctx.run, 'ground')) return undefined;
      return [
        { label: 'See a rejected quote', to: 'ch2.rejected', variant: 'ghost' },
        { label: 'Continue', to: has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate', variant: 'primary' },
      ];
    },
    notes: 'Data-driven: say the grounded count out loud. On the promoted prompt every eval quote grounded (275 of 275), so grounding is the seatbelt. “See a rejected quote” only appears when a real run with a dropped quote exists.',
  },
  {
    id: 'ch2.rejected', chapter: 'ch2', kind: 'product', route: (ctx) => (ctx.peek ? R.run(ctx.peek.run.id) : null), target: 'run.dropped', placement: 'left', anchorTimeoutMs: 5000,
    title: (ctx) => rejectedCopy(ctx).title, body: (ctx) => rejectedCopy(ctx).body,
    more: 'This is a different, real run. A quote came back that code couldn’t find in that run’s text, so its insight was dropped and counted. It never reached a reviewer as fact.',
    waitFor: 'next', next: (ctx) => (has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate'),
    actions: (ctx) => [{ label: 'Back to my run', to: has(ctx, 'messy') ? 'ch2.messy' : 'ch2.gate', variant: 'primary' }],
  },
  {
    id: 'ch2.messy', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.insights', placement: 'left',
    title: 'Honest under noise', body: messyCopy,
    more: 'Final confidence = model confidence × grounding score × type prior × account context. The model quotes the garbled text verbatim, so quotes usually ground exactly; noise shows up as lower confidence and more review.',
    waitFor: 'next', next: 'ch2.gate',
  },
  {
    id: 'ch2.gate', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.gate', placement: 'left', pace: 'slow',
    title: 'Who sees it next', body: gateCopy,
    more: 'Thresholds: 0.80 auto-route, 0.55 review, below that held but still visible. Any churn_risk or sev-1 bug always goes to a person.',
    ready: (ctx) => stepDone(ctx.run, 'score'), readyLabel: 'Scoring…',
    waitFor: 'next', next: 'ch2.trace',
  },
  {
    id: 'ch2.trace', chapter: 'ch2', kind: 'product', route: runRoute, target: 'run.trace', placement: 'bottom',
    title: 'Nothing is a black box', body: traceCopy,
    ready: (ctx) => runSettled(ctx.run) || stepDone(ctx.run, 'route'), readyLabel: 'Finishing the run…',
    waitFor: 'next', next: (ctx) => (has(ctx, 'clean') ? 'ch2.clean' : 'ch3.intro'),
    checkpoint: (ctx) => (ctx.run ? { value: ctx.run.insights.filter((i) => i.status !== 'dropped_ungrounded').length, label: 'grounded insights', sub: `${ctx.run.run.droppedCount} dropped · ${usd(ctx.run.run.costUsd)} spent` } : null),
  },
  {
    id: 'ch2.clean', chapter: 'ch2', kind: 'product', placement: 'bottom',
    title: 'Easy. Real calls aren’t like this.',
    body: 'Clean notes are the baseline. Want to see it hold up on a messy one?',
    waitFor: 'next', next: 'ch3.intro',
    actions: [
      { label: 'Try a messy one', to: 'ch1.intro', variant: 'ghost' },
      { label: 'Continue', to: 'ch3.intro', variant: 'primary' },
    ],
  },

  // ============================================================ ch3 · human in the loop
  {
    id: 'ch3.intro', chapter: 'ch3', kind: 'product', route: R.review, target: 'review.queue', placement: 'right',
    title: 'A person decides',
    body: 'Below 0.80, every sev-1 bug, every churn risk. The run is parked here awaiting review.',
    more: 'Nothing on it is routed until someone approves, edits or rejects it. That action routes the insight and writes an audit row.',
    waitFor: 'next', next: 'ch3.why',
  },
  {
    id: 'ch3.why', chapter: 'ch3', kind: 'product', route: R.review, target: 'review.why', placement: 'bottom',
    title: 'Every item says why it’s here', body: 'A count is never shown without its reason: “confidence 0.71 < 0.80”.',
    waitFor: 'next', next: 'ch3.approve',
  },
  {
    id: 'ch3.approve', chapter: 'ch3', kind: 'product', route: R.review, target: 'review.approve', highlight: ['review.item'], placement: 'top',
    title: 'Approve one', body: 'Press A, or click Approve. That routes it, with an audit row.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && e.action === 'approve', hint: 'Press A or click Approve' },
    next: 'ch3.edit',
  },
  {
    // Pressing Edit swaps the button for the edit form: follow it, and say what saving needs.
    id: 'ch3.edit', chapter: 'ch3', kind: 'product', route: R.review, target: ['review.editform', 'review.edit'], placement: 'right', interact: 'all',
    title: 'Now correct one', body: editCopy,
    more: 'Edits follow the operator_actions pattern: idempotency key, before, after, reviewer, reason. They become eval cases, which is how the next prompt version gets better.',
    waitFor: { event: 'review.action', where: (e) => e.name === 'review.action' && (e.action === 'edit' || e.action === 'reject'), hint: 'Edit, change a field, save' },
    next: 'ch3.fork',
  },
  {
    id: 'ch3.fork', chapter: 'ch3', kind: 'product', placement: 'bottom',
    title: 'Try another file?',
    body: (ctx) => {
      // Name what's left, best stories first, instead of a generic "another file".
      const left = (['security', 'privacy', 'messy', 'negative', 'clean'] as TourPath[]).filter((p) => !ctx.explored.includes(p)).map((p) => lowerFirst(PATH_LABELS[p]));
      const next = left.length ? ` Still to try: ${left.slice(0, 3).join(', ')}.` : '';
      return `Scenarios explored: ${ctx.explored.length} of 6. Each file takes a different path through the same system.${next}`;
    },
    waitFor: 'next', next: 'ch4.intro',
    actions: [
      { label: 'Try another file', to: 'ch1.intro', variant: 'ghost' },
      { label: 'Continue', to: 'ch4.intro', variant: 'primary' },
    ],
    checkpoint: (ctx) => ({ value: ctx.counters.approvals + ctx.counters.edits + ctx.counters.rejects, label: 'decisions made by a person', sub: 'saved as labelled data' }),
  },

  // ============================================================ ch4 · right owner, right channel
  {
    id: 'ch4.intro', chapter: 'ch4', kind: 'product', route: R.routing, target: 'routing.rules', placement: 'bottom',
    title: 'Routing is a table, not a prompt', body: 'Ops can read it, change it and audit it. The model never decides who gets paged.',
    more: 'Rules match type × product area × severity × ARR band → owner and channel. Lowest priority wins. No match goes to triage, never nowhere.',
    waitFor: 'next', next: 'ch4.rule',
  },
  {
    id: 'ch4.rule', chapter: 'ch4', kind: 'product', route: R.routing, target: 'routing.rule.pricing', placement: 'bottom', interact: 'all',
    title: 'Your call: who hears about pricing?',
    body: (ctx) => (pricingRuleOverridden(ctx) ? 'You already changed this rule in your workspace. Change it again, or Continue to see where the flows go.' : 'Send pricing objections on accounts over $250k ARR to the VP of Product.'),
    waitFor: { event: 'rule.changed', hint: 'Edit the pricing rule', satisfied: pricingRuleOverridden },
    next: 'ch4.sankey',
  },
  {
    // The panel is taller than the room around it: float top-left, over the panel heading, so the
    // card never covers the Pricing objection node (bottom-left) the beat is about.
    id: 'ch4.sankey', chapter: 'ch4', kind: 'product', route: R.routing, target: 'routing.sankey', placement: 'bottom', floatCorner: 'top-left',
    title: (ctx) => sankeyCopy(ctx).title, body: (ctx) => sankeyCopy(ctx).body,
    waitFor: 'next', next: 'ch4.jira',
  },
  {
    id: 'ch4.jira', chapter: 'ch4', kind: 'product', route: R.destinations, target: 'dest.jira', placement: 'left',
    title: 'Where the PM already works', body: 'A ticket with the quote, the account, its ARR and a link back to the transcript.',
    waitFor: 'next', next: 'ch4.slack',
  },
  {
    id: 'ch4.slack', chapter: 'ch4', kind: 'product', route: R.destinations, target: 'dest.slack', placement: 'left',
    title: 'And in Slack, with a receipt', body: 'Delivery is logged with attempts and retries. A partial failure reads as a failure.',
    waitFor: 'next', next: 'ch5.intro',
    checkpoint: (ctx) => ({ value: ctx.counters.rulesChanged, label: ctx.counters.rulesChanged === 1 ? 'routing rule changed' : 'routing rules changed', sub: '0 prompts edited' }),
  },

  // ============================================================ ch5 · patterns
  {
    id: 'ch5.intro', chapter: 'ch5', kind: 'product', route: R.themes, target: 'theme.c1042', placement: 'right',
    title: 'One complaint is an anecdote', body: (ctx) => themeCopy(ctx).intro,
    more: 'Membership is deterministic: embeddings plus nearest neighbours above a similarity threshold. The model only names the theme.',
    waitFor: { event: 'theme.opened', hint: 'Open the highlighted theme' },
    next: 'ch5.arr',
  },
  {
    id: 'ch5.arr', chapter: 'ch5', kind: 'product', route: themeRoute, target: 'theme.arr', placement: 'bottom',
    title: 'ARR at stake', body: (ctx) => themeCopy(ctx).arr,
    waitFor: 'next', next: 'ch5.trend',
  },
  {
    id: 'ch5.trend', chapter: 'ch5', kind: 'product', route: themeRoute, target: 'theme.trend', placement: 'bottom',
    title: 'Growing or fading?', body: 'Eight weeks of trend. Every bar links to the insights behind it.',
    waitFor: 'next', next: 'ch5.quotes',
  },
  {
    id: 'ch5.quotes', chapter: 'ch5', kind: 'product', route: themeRoute, target: 'theme.quotes', placement: 'top',
    title: 'In the customer’s words', body: 'Representative quotes, each one traceable back to the exact turn in the transcript.',
    waitFor: 'next', next: 'ch6.ship',
    checkpoint: (ctx) => (ctx.theme ? { value: ctx.theme.accountCount, label: 'accounts in one theme', sub: `${ctx.theme.insightCount} insights · ARR attached` } : { value: 1, label: 'anecdote became a pattern', sub: 'with ARR and quotes attached' }),
  },

  // ============================================================ ch6 · close the loop
  {
    id: 'ch6.ship', chapter: 'ch6', kind: 'product', route: R.destinations, target: 'ticket.state', placement: 'bottom', interact: 'all',
    title: 'Play the PM: ship it', body: 'Move the ticket to Shipped. Watch who finds out.',
    waitFor: { event: 'ticket.state', where: (e) => e.name === 'ticket.state' && e.state === 'shipped', hint: 'Move the ticket to Shipped' },
    next: 'ch6.inbox',
  },
  {
    id: 'ch6.inbox', chapter: 'ch6', kind: 'product', route: R.loop, target: ['loop.shipped', 'loop.inbox'], placement: 'right',
    title: 'The CSM hears back', body: 'Automatically, the moment it ships. Their feedback shipped, and they get the credit.',
    waitFor: 'next', next: 'ch6.note',
  },
  {
    id: 'ch6.note', chapter: 'ch6', kind: 'product', route: R.loop, target: 'loop.note', placement: 'left',
    title: 'A note for the customer', body: 'Drafted, not sent. The CSM edits it and sends it. The relationship stays theirs.',
    waitFor: 'next', next: 'ch7.metrics',
    checkpoint: () => ({ value: 1, label: 'loop closed back to the CSM', sub: '0 status-chasing emails' }),
  },

  // ============================================================ ch7 · prove it
  {
    id: 'ch7.metrics', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.metrics', placement: 'bottom',
    title: 'Measured, not vibes', body: 'Precision and recall per insight type, against hand-labelled golden files. The gate checks them pooled; per type they are reported against that line.',
    more: 'Matching is by code: same type and overlapping quote spans. Only ambiguous leftovers go to a judge from a different model family. Grounding and routing are scored by code.',
    waitFor: 'next', next: 'ch7.levels',
  },
  {
    id: 'ch7.levels', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.levels', placement: 'top',
    title: 'Sliced by mess level', body: 'Clean notes are easy. Level 5 is where systems quietly break.',
    waitFor: 'next', next: 'ch7.candidate',
  },
  {
    id: 'ch7.candidate', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.candidate', placement: 'bottom',
    title: candidateTitle, body: candidateCopy,
    waitFor: 'next', next: 'ch7.promote',
  },
  {
    id: 'ch7.promote', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.promote', placement: 'left',
    title: 'Your call', body: 'Try to promote it.',
    waitFor: { event: 'eval.promote_attempted', hint: 'Click Promote' },
    next: 'ch7.gate',
  },
  {
    id: 'ch7.gate', chapter: 'ch7', kind: 'product', route: R.evals, target: 'evals.gate', placement: 'left',
    title: (ctx) => promoteCopy(ctx).title, body: (ctx) => promoteCopy(ctx).body,
    more: 'Promotion needs overall precision and recall, level-5 recall, grounding and every safety check (negatives, injection, PHI) to pass, with no regression over 2 points. Per-type slices and cost are reported; gating them is next.',
    waitFor: 'next', next: 'ch7.budget',
  },
  {
    id: 'ch7.budget', chapter: 'ch7', kind: 'product', route: R.health, target: 'health.budget', placement: 'bottom',
    title: 'What it costs', body: budgetCopy,
    more: 'A provider-side hard limit on the key, plus an in-app ledger checked before every run. At the cap an atomic switch flips the system to replay mode.',
    waitFor: 'next', next: 'ch8.enter',
    checkpoint: (ctx) => (ctx.budget ? { value: ctx.budget.spentUsd, prefix: '$', decimals: 2, label: 'of live AI spent so far', sub: `cap ${usd(ctx.budget.limitUsd, 0)}` } : null),
  },

  // ============================================================ ch8 · operate it (Agent Ops)
  {
    // Phones: the Agent Ops link lives in the closed nav drawer, so spotlight the Menu button.
    id: 'ch8.enter', chapter: 'ch8', kind: 'product', target: ['nav.agentops', 'nav.menu'], placement: 'right', interact: 'all',
    title: 'Build it, then operate it',
    body: () =>
      typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
        ? 'Signal Loop is one agent. Open the Menu, then Agent Ops: the platform it reports into.'
        : 'Signal Loop is one agent. Open the platform it reports into.',
    more: 'Agent Ops is the internal platform for executives and the AI team. Every agent reports logs, spans, usage and work units through one SDK. This session’s telemetry is live. Signal Loop’s six-week history replays 218 real pipeline runs over synthetic calls, with simulated users; the RFP agent is fully simulated.',
    waitFor: { predicate: (ctx) => ctx.pathname.startsWith('/ops'), hint: 'Open Agent Ops' },
    next: 'ch8.kpis',
  },
  {
    id: 'ch8.kpis', chapter: 'ch8', kind: 'product', route: R.ops, target: 'ops.overview.kpis', placement: 'bottom',
    title: 'What the exec sees', body: opsKpiCopy,
    more: 'Hours returned = Σ(registered baseline minutes per unit − measured human review minutes). Baselines are labelled assumptions until the 2-week time study replaces them.',
    waitFor: 'next', next: 'ch8.registry',
  },
  {
    id: 'ch8.registry', chapter: 'ch8', kind: 'product', route: R.opsRegistry, target: 'ops.registry.signal', placement: 'bottom',
    title: 'Every agent has an owner', body: 'Two agents today; the registry is built for fifty. Each has a named owner, purpose and review date.',
    waitFor: 'next', next: 'ch8.review',
  },
  {
    id: 'ch8.review', chapter: 'ch8', kind: 'product', route: R.opsAgent(SIGNAL_LOOP_AGENT_ID), target: 'ops.agent.review', placement: 'bottom',
    title: 'Owned past launch', body: opsRegistryCopy,
    more: 'The agent standard: owner, purpose and success metric, security & data review, evals with a promotion gate, logs and traces, spend cap, human review on high-stakes output, rollback and runbook, review cadence.',
    waitFor: 'next', next: 'ch8.usage',
  },
  {
    id: 'ch8.usage', chapter: 'ch8', kind: 'product', route: R.opsUsage, target: 'ops.usage.live', placement: 'bottom',
    title: 'That’s you, live', body: opsLiveCopy,
    waitFor: 'next', next: 'ch8.logs',
  },
  {
    id: 'ch8.logs', chapter: 'ch8', kind: 'product', route: (ctx) => R.opsLogs(ctx.runId), target: 'ops.logs.trace', placement: 'bottom',
    title: 'Your run, in the logs', body: opsLogsCopy,
    waitFor: 'next', next: 'ch8.trace',
  },
  {
    id: 'ch8.trace', chapter: 'ch8', kind: 'product', route: (ctx) => (ctx.ops?.traceId ? R.opsTrace(ctx.ops.traceId) : null), target: 'ops.trace.waterfall', placement: 'bottom', anchorTimeoutMs: 3500,
    title: 'Where the time went', body: opsTraceCopy,
    waitFor: 'next', next: 'ch8.slos',
  },
  {
    id: 'ch8.slos', chapter: 'ch8', kind: 'product', route: R.opsReliability, target: 'ops.slos', placement: 'bottom',
    title: 'Promises, with budgets', body: 'Latency, grounding rate, delivery success. Breaches raise an alert with an owner and a runbook.',
    more: 'Alerts carry expected vs actual, an owner, a runbook link and the trace that tripped them. Acknowledged is not resolved.',
    waitFor: 'next', next: 'rollout',
    checkpoint: (ctx) => {
      const sl = ctx.ops?.overview?.agents.find((a) => a.agentId === SIGNAL_LOOP_AGENT_ID);
      return sl ? { value: Math.round(sl.hoursReturned), label: 'hours returned by Signal Loop', sub: 'baseline minutes are labelled assumptions' } : { value: 9, suffix: '/9', label: 'agent standard checks passed', sub: 'owner · evals · logs · cap · rollback' };
    },
  },

  // ============================================================ narrative · making it real
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
    title: 'POC → production', body: 'Same design, production stack.', next: 'scorecard',
  },
  {
    id: 'scorecard', chapter: 'scorecard', kind: 'scene', scene: 'scorecard', beats: 1, route: R.scene('scorecard'),
    title: 'Scorecard', body: 'What you did, what the system did.', next: 'scorecard',
  },
];

export const STEP_BY_ID: Record<string, Step> = Object.fromEntries(STEPS.map((s) => [s.id, s]));
export const FIRST_STEP = 'cold-open';
export const firstStepOf = (chapter: string): string => STEPS.find((s) => s.chapter === chapter)?.id ?? FIRST_STEP;
/** The main-path order, for progress. */
export const MAIN_ORDER = STEPS.filter((s) => !['ch2.privacy', 'ch2.screen', 'ch2.messy', 'ch2.clean', 'ch2.rejected', 'ch1.open'].includes(s.id)).map((s) => s.id);
