/**
 * Data-driven narration. Every function reads the viewer's real RunDetail / eval / platform
 * data and degrades to honest generic copy when the data isn't there yet.
 */
import type { RunDetail, StepKey, Evidence, Theme } from '../../shared/contracts';
import { durationText, metricPct, pctText, rateOf, usdPrecise } from '../../shared/format';
import { runTiming } from '../../shared/runTiming';
import type { TourCtx, TourPath } from '../engine/types';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const usd = (n: number, digits?: number) => {
  const d = digits ?? (n < 0.1 ? 4 : n < 10 ? 2 : 0);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
export const compactUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : usd(n, 0));

export function stepDone(run: RunDetail | null, key: StepKey): boolean {
  if (!run) return false;
  if (run.run.status === 'completed' || run.run.status === 'failed' || run.run.status === 'awaiting_review') return true;
  const s = run.steps.find((x) => x.key === key);
  return !!s && ['passed', 'warned', 'failed', 'skipped'].includes(s.status);
}

/**
 * call.process intro. The branch (path) says what story the file tells; the format says what the
 * file actually is, so a Slack export never gets the speech-to-text line.
 */
export function introFor(ctx: Pick<TourCtx, 'path' | 'fileFormat'>): { title: string; body: string } {
  const f = ctx.fileFormat ?? null;
  const noun = f === 'eml' ? 'email thread' : f === 'chat' ? 'Slack export' : f === 'md' ? 'set of notes' : 'transcript';
  const p: TourPath = ctx.path;
  if (p === 'main') return { title: 'Run the pipeline', body: 'A real QBR: thirteen minutes of conversation with product signals buried in it.' };
  if (p === 'clean') return { title: 'Clean notes: the easy case', body: 'A tidy CSM template. A good baseline before the messy ones.' };
  if (p === 'messy') {
    if (f === 'chat') return { title: 'A Slack export. Good test.', body: 'Handles instead of speakers, threads, shorthand and half-sentences. Let’s see if it stays honest.' };
    if (f === 'eml') return { title: 'A forwarded email thread. Good test.', body: 'Quoted replies, signatures and three people talking past each other. Let’s see if it stays honest.' };
    return { title: 'Raw speech-to-text. Good test.', body: '“In vocal”, “call rail”, crosstalk, sarcasm. Let’s see if it stays honest.' };
  }
  if (p === 'security') return { title: 'This one is hostile', body: `Somebody planted an instruction in this ${noun}. Watch what the system does with it.` };
  if (p === 'negative') return { title: 'A friendly check-in', body: 'Pleasant, and nothing actionable in it. The right output is nothing.' };
  return { title: f === 'eml' ? 'A healthcare email, full of PHI' : 'A healthcare call, full of PHI', body: 'Patient names, dates of birth, member IDs. Watch what reaches the model.' };
}

export const runSettled = (run: RunDetail | null) => !!run && ['completed', 'failed', 'awaiting_review'].includes(run.run.status);

function allEvidence(run: RunDetail): Evidence[] {
  return run.insights.flatMap((i) => i.evidence);
}

/** call.watch title: the run's real state, never a promise. */
export function introTitle(ctx: TourCtx): string {
  const run = ctx.run;
  if (ctx.runReused) return 'Your earlier run of this file';
  if (!run) return 'Starting the run';
  if (run.run.mode === 'replay') return runSettled(run) && run.run.durationMs ? `Replayed in ${durationText(run.run.durationMs)}` : 'A recorded run, replaying';
  return runSettled(run) && run.run.durationMs ? `Done in ${durationText(run.run.durationMs)}, live` : 'Running live, right now';
}

/** call.watch: "real execution" is only true live; a replay says what it is. The latency story starts here. */
export function introCopy(ctx: TourCtx): string {
  if (ctx.runReused) {
    return 'This file was already run, so this is that earlier run, revealed from its saved steps. Nothing new is executing.';
  }
  if (ctx.run?.run.mode === 'replay') {
    return 'A recorded real execution, replayed at its recorded speed and labelled as a replay. The clock shows its timing.';
  }
  if (ctx.run && runSettled(ctx.run)) {
    return 'That clock is real: the real execution, not an animation. A whole call takes seconds; the last step shows why.';
  }
  return 'The real execution, not an animation. Watch the clock: a whole call takes seconds, not minutes.';
}

/** review.edit: once the edit form is open, say what saving needs. */
export function editCopy(): string {
  const formOpen = typeof document !== 'undefined' && !!document.querySelector('[data-tour="review.editform"]');
  if (formOpen) return 'Change the type, area or severity, then Save and send. The fix is saved as labelled data with a before/after diff.';
  return 'Press E or click Edit. Your fix is saved as labelled data, with a before/after audit diff.';
}

export function redactCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run) return 'Names, phones and health details are swapped for tokens before any model sees a word.';
  const n = run.redactions.reduce((a, r) => a + r.count, 0);
  if (n === 0) return 'Nothing personal to redact in this one. When there is, it’s tokenised before any model sees it.';
  const kinds = [...new Set(run.redactions.map((r) => r.kind))].slice(0, 3).join(', ');
  return `${plural(n, 'value')} redacted (${kinds}) before any model saw the text.`;
}

const LANGUAGE: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch' };
const KIND: Record<string, string> = {
  call_transcript: 'A call transcript', meeting_notes: 'Meeting notes', email_thread: 'An email thread', chat_thread: 'A chat thread',
  support_ticket: 'A support ticket', survey_response: 'A survey response', document: 'A document', other: 'A conversation',
};

/** call.screen: the decision model's triage, read from the run. Honest generic text before it lands. */
export function screenCopy(ctx: TourCtx): { title: string; body: string } {
  const s = ctx.run?.screen;
  if (ctx.path === 'security' || s?.injection_suspected) {
    return {
      title: 'Injection flagged, and kept inert',
      body: 'Caught by the decision model and a code check. Treated as data: output stays schema-only, with an audit row.',
    };
  }
  if (ctx.path === 'negative' || s?.actionable === false) {
    return { title: 'Read first, by a fast model', body: 'Friendly, nothing for the product team. The main pass that started alongside is discarded, so nothing gets invented.' };
  }
  if (!s) return { title: 'Read first, by a fast model', body: 'What is it, what language, which analyses apply, is anyone steering the AI? One quick call answers.' };
  const kind = KIND[s.doc_kind ?? ''] ?? 'A conversation';
  const lang = LANGUAGE[s.language] ?? s.language.toUpperCase();
  const others = (s.analyses ?? []).filter((a) => a !== 'product_feedback').length;
  return {
    title: 'Read first, by a fast model',
    body: `${kind} in ${lang}, with product feedback, so Signal Loop runs.${others ? ` ${plural(others, 'roadmap analysis', 'roadmap analyses')} would apply too.` : ''} No added time.`,
  };
}

export function extractCopy(ctx: TourCtx): { title: string; body: string } {
  const run = ctx.run;
  const n = run ? run.insights.length : null;
  if (ctx.path === 'negative' || n === 0) {
    return { title: 'Nothing actionable, and that’s the right answer', body: 'Zero insights. A calm empty state. It doesn’t invent work to look busy.' };
  }
  const chunks = Number(run?.steps.find((x) => x.key === 'extract')?.detail?.chunks ?? 1);
  const found = n != null ? `${plural(n, 'candidate insight')}, each with a verbatim quote.` : 'Every candidate carries a verbatim quote.';
  return {
    title: 'Structured, quoted, typed',
    body: `${found.charAt(0).toUpperCase()}${found.slice(1)}${chunks > 1 ? ` Read in ${chunks} parts at once.` : ''} No quote, no insight.`,
  };
}

/** call.ground: what extraction found and what the quote check (code) did with it, in one step. */
export function groundCopy(ctx: TourCtx): { title: string; body: string; more: string } {
  const run = ctx.run;
  const chunks = Number(run?.steps.find((x) => x.key === 'extract')?.detail?.chunks ?? 1);
  const more = `The main model returns typed insights (type, summary, product area, severity, confidence) in a fixed schema, each with a verbatim quote${chunks > 1 ? `; this long file was read in ${chunks} parts at once` : ''}. The check is code, not the model: normalise both texts, try an exact match, then slide a window scored by edit distance; 0.90 or better passes. A quote that doesn’t match is dropped with its insight and counted, never shown as fact.`;
  if (!run) return { title: 'Every quote, checked in code', body: 'Each insight carries the customer’s exact words. Code checks they are in the transcript; if not, the insight is dropped.', more };
  const ev = allEvidence(run);
  const failed = ev.filter((e) => e.method === 'failed').length;
  const dropped = Math.max(run.run.droppedCount, run.insights.filter((i) => i.status === 'dropped_ungrounded').length, failed);
  const fuzzy = ev.filter((e) => e.method === 'fuzzy').length;
  const grounded = ev.length - failed;
  if (ev.length === 0) return { title: 'Nothing to check', body: 'No insights means no quotes to check. The check still ran, and passed trivially.', more };
  if (dropped > 0) {
    return {
      title: dropped === 1 ? 'One quote didn’t survive' : `${dropped} quotes didn’t survive`,
      body: `${grounded} of ${ev.length} quotes matched the transcript. ${dropped === 1 ? 'One didn’t match anything said on the call, so its insight was' : `${dropped} didn’t match, so their insights were`} dropped.`,
      more,
    };
  }
  const kept = run.insights.filter((i) => i.gate !== 'dropped' && i.status !== 'dropped_ungrounded').length;
  return {
    title: `${plural(kept, 'insight')}, ${ev.length} of ${ev.length} quotes found`,
    body: `Each insight carries the customer’s exact words. Code found every quote in the transcript${fuzzy ? `, ${fuzzy === 1 ? 'one' : fuzzy} as a close match` : ', word for word'}; a missing one drops its insight.`,
    more,
  };
}

/**
 * The optional step: a real rejected quote from another run. It is only offered when a run
 * with a dropped quote exists (TourProvider.peek); it describes exactly what is on screen.
 */
export function rejectedCopy(ctx: TourCtx): { title: string; body: string } {
  const p = ctx.peek;
  const bad = p?.insights.flatMap((i) => i.evidence).find((e) => e.method === 'failed');
  if (!p || !bad) return { title: 'What grounding does with a missing quote', body: 'When a quote can’t be found in the transcript, its insight is dropped and counted. It never reaches a person as fact.' };
  const q = bad.quote.length > 90 ? `${bad.quote.slice(0, 88)}…` : bad.quote;
  return {
    title: 'A quote that wasn’t in the transcript',
    body: `“${q}” Code couldn’t find it in ${p.run.filename}: the closest span scored ${bad.score.toFixed(2)}, under 0.90, so the insight was dropped before review.`,
  };
}

/** call.gate title: only mention a second opinion when this run had one (recordings predate it). */
export function gateTitle(ctx: TourCtx): string {
  return ctx.run?.insights.some((i) => i.secondOpinion) ? 'Scored, then a second opinion' : 'Scored: who sees it next';
}

export function gateCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run || run.insights.length === 0) return '0.80+ routes itself, 0.55–0.80 goes to a person, below that is held. High stakes always get reviewed.';
  const live = run.insights.filter((i) => i.gate !== 'dropped');
  const auto = live.filter((i) => i.gate === 'auto_route').length;
  const review = live.filter((i) => i.gate === 'review').length;
  const held = live.filter((i) => i.gate === 'held').length;
  const so = live.filter((i) => i.secondOpinion);
  const moved = so.filter((i) => i.secondOpinion?.effect !== 'none').length;
  const opinion = so.length ? (moved ? ` A second model checked each one and moved ${moved}.` : ` A second model checked each one and agreed.`) : '';
  return `${auto} route${auto === 1 ? 's' : ''} automatically, ${review} go${review === 1 ? 'es' : ''} to a person${held ? `, ${held} held` : ''}.${opinion} High stakes are always reviewed.`;
}

/**
 * call.timing: why it's this fast, in plain words, with this run's real numbers (the same
 * runTiming() the Timing card draws). Generic and honest when the data isn't there.
 */
export function timingCopy(ctx: Pick<TourCtx, 'run'>): { title: string; body: string; more: string } {
  const t = runTiming(ctx.run);
  const generic = {
    title: 'Why it’s this fast',
    body: 'Only the model calls take time, and the two big ones run side by side. Everything else is code.',
    more: 'Triage runs on the decision model and extraction on the main model, started together on the same redacted text. The quote check, scoring rules, routing and delivery are code and take under a millisecond. Every call is in Agent Ops with its tokens and cost.',
  };
  if (!t || !t.complete || !ctx.run) return generic;
  const d = (n: number | null) => (n == null ? null : durationText(n));
  const tri = d(t.triageMs);
  const ext = d(t.extractMs);
  // Same sum as the Timing card: steps with no model call and no lookups.
  const codeRows = t.rows.filter((r) => !r.ai && !r.lookups && r.status !== 'skipped' && r.status !== 'failed');
  const codeMs = codeRows.reduce((a, r) => a + r.ms, 0);
  const code = codeRows.length ? `The ${plural(codeRows.length, 'code step')} took ${codeMs < 1 ? 'under a millisecond' : durationText(codeMs)} in all.` : 'The rest is code.';
  const body =
    tri && ext
      ? t.parallel
        ? `Triage (${tri}) ran alongside extraction (${ext}), not before it. ${code}`
        : `Triage took ${tri}, extraction ${ext}. ${code}`
      : tri
        ? `Triage took ${tri} and found nothing to extract, so the run stopped early. ${code}`
        : generic.body;
  const so = t.secondOpinionMs != null ? ` The second opinion (${d(t.secondOpinionMs)}) overlaps the theme lookups${t.themeMs != null ? `, so the theme step took ${d(t.themeMs)}` : ''}.` : '';
  const replay = t.replay ? ' This is a replay of a recorded live run, at its recorded speed, re-timed to today’s order of steps.' : '';
  const more = `Only model calls take real time: triage on the decision model, extraction on the main model${t.parallel ? ', started together on the same redacted text' : ''}.${so} ${t.tokensIn.toLocaleString('en-US')} tokens in, ${t.tokensOut.toLocaleString('en-US')} out, ${usdPrecise(t.costUsd)} of AI. Every call is in Agent Ops under this run’s trace.${replay}`;
  return { title: `Why it took ${durationText(t.wallMs)}`, body, more };
}

export function messyCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run || run.insights.length === 0) return 'Noise lowers confidence, so more lands with a person instead of in a PM’s backlog.';
  const avg = run.insights.reduce((a, i) => a + i.confidenceFinal, 0) / run.insights.length;
  return `Average confidence ${avg.toFixed(2)}, ${run.run.reviewCount} to review. Noise sends work to a person, not into a backlog.`;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Cost and p95 of the candidate against the current prompt, read from the two eval runs. */
export function evalTradeoff(ctx: TourCtx): { cost: string; speed: string; cheaper: boolean; faster: boolean } | null {
  const c = ctx.evals?.candidate;
  const l = ctx.evals?.latest;
  if (!c || !l || c.id === l.id) return null;
  const cheaper = c.costUsd < l.costUsd;
  const faster = c.p95Ms < l.p95Ms;
  return {
    cheaper,
    faster,
    cost: `${cheaper ? 'cheaper' : 'more expensive'} to run (${usd(c.costUsd, 3)} vs ${usd(l.costUsd, 3)} for the eval set)`,
    speed: `${faster ? 'faster' : 'slower'} at p95 (${secs(c.p95Ms)} vs ${secs(l.p95Ms)})`,
  };
}

/** operate.promote title: only promise a saving when the eval data shows one. */
export function candidateTitle(ctx: TourCtx): string {
  const t = evalTradeoff(ctx);
  if (t?.cheaper && t.faster) return 'A cheaper, faster prompt?';
  if (t?.cheaper) return 'A cheaper prompt?';
  return 'A new prompt version?';
}

export function candidateCopy(ctx: TourCtx): string {
  const c = ctx.evals?.candidate;
  const l = ctx.evals?.latest;
  if (!c) return 'A candidate prompt is ready, scored on the same golden files. Should it ship?';
  const vs = l && l.id !== c.id ? ` as ${l.promptVersion}` : '';
  const t = evalTradeoff(ctx);
  if (!t) return `${c.promptVersion} is the candidate, scored on the same golden files${vs}. Should it ship?`;
  return `${c.promptVersion} is the candidate, scored on the same golden files${vs}. It’s ${t.cost} and ${t.speed}. Should it ship?`;
}

export function promoteCopy(ctx: TourCtx): { title: string; body: string; more?: string } {
  const cand = ctx.evals?.candidate;
  const latest = ctx.evals?.latest;
  const promoted = ctx.counters.promoted ?? cand?.promoted ?? false;
  if (promoted) {
    return {
      title: 'Promoted',
      body: `Every gate check passed, so ${cand?.promptVersion ?? 'the candidate'} ships.`,
      more: 'The checks: overall precision and recall, level-5 recall, grounding, the safety checks, and no regression over 2 points.',
    };
  }
  const failed = cand?.metrics.filter((m) => m.passed === false) ?? [];
  const reg = failed.find((m) => m.key.startsWith('regression.'));
  const key = reg ? reg.key.replace('regression.', '') : failed[0]?.key;
  const now = cand?.metrics.find((m) => m.key === key);
  const before = latest?.metrics.find((m) => m.key === key);
  // Name what else regressed, from the same eval runs, so the copy never claims a saving the screen contradicts.
  const t = evalTradeoff(ctx);
  const worse = t ? [!t.cheaper ? 'costs more' : '', !t.faster ? 'runs slower at p95' : ''].filter(Boolean) : [];
  // Cost and latency are shown on screen but are not gate rules: say so, never list them as reasons.
  const also = worse.length ? ` It also ${worse.join(' and ')}, which is reported, not gated.` : '';
  if (now && now.value != null) {
    const label = now.label.replace(/\s*\(.*\)\s*$/, '');
    const nowR = rateOf(now);
    const beforeR = rateOf(before);
    const drop = beforeR != null && nowR != null ? Math.round((beforeR - nowR) * 1000) / 10 : reg?.value != null ? Math.round(-reg.value * 1000) / 10 : null;
    const underBar = now.passed === false && now.threshold != null ? `under the ${pctText(now.threshold, 0)} bar` : '';
    const regressed = reg && reg.passed === false && drop != null ? `a ${Math.round(drop)}-point regression` : '';
    const reasons = [underBar, regressed].filter(Boolean).join(' and ');
    const why = key?.startsWith('precision')
      ? 'It over-labelled real sentences as feedback: the quotes were real, the labels weren’t.'
      : key?.startsWith('recall')
        ? 'It missed real insights.'
        : 'A gate check failed.';
    return {
      title: 'Promotion blocked',
      body: `Blocked on ${label.toLowerCase()}: from ${metricPct(before)} to ${metricPct(now)}${reasons ? `, ${reasons}` : ''}.`,
      more: `${why}${also}`.trim(),
    };
  }
  const reason = cand?.blockedReasons[0];
  return { title: 'Promotion blocked', body: reason ? `${reason}.${also}` : 'A gate check failed against the current prompt, so the gate held.' };
}

/**
 * The theme card patterns.intro points at. Mirrors isC1042Theme in src/app/pages/Themes.tsx, which
 * places the `theme.c1042` anchor: the copy and the ring must name the same theme.
 */
export function isSpotlitTheme(t: Pick<Theme, 'id' | 'name'>): boolean {
  return t.id === 'thm_offline_conv' || /offline conversions/i.test(t.name);
}

export function themeCopy(ctx: TourCtx): { intro: string; arr: string } {
  const t = ctx.theme;
  if (!t) return { intro: 'One complaint is an anecdote; the same thing from several accounts is a pattern. Open the highlighted theme.', arr: 'ARR summed across distinct accounts, an eight-week trend, and quotes that link back to each call.' };
  const yours = ctx.run?.insights.some((i) => i.themeId === t.id) ? ' Your call’s insight just joined it.' : '';
  return {
    intro: `“${t.name}”: ${plural(t.insightCount, 'insight')} from ${plural(t.accountCount, 'account')}.${yours} Open it.`,
    arr: `${compactUsd(t.arrUsd)} of ARR across ${plural(t.accountCount, 'account')}, counted once each. The trend and every quote link back to the calls.`,
  };
}

export function budgetCopy(ctx: TourCtx): string {
  const b = ctx.budget;
  if (!b) return 'A hard $15 cap on live AI for viewers. Past it, runs replay recorded executions, so nothing breaks.';
  return `${usd(b.spentUsd, 2)} of ${usd(b.limitUsd, 2)} used across ${plural(b.liveRuns, 'live run')}. Past the cap it replays: never an outage.`;
}

// ---------------------------------------------------------------- Agent Ops (operate.kpis, operate.trace)

export function opsKpiCopy(ctx: TourCtx): string {
  const t = ctx.ops?.overview?.totals;
  if (!t) return 'Hours returned, value of that time and AI cost, per agent. Two agents today; built for fifty.';
  // Lead with hours; the value ratio is against metered AI spend only, so say so instead of quoting a multiple.
  return `${Math.round(t.hoursReturned).toLocaleString()} hours returned across ${plural(t.agentsInProduction, 'agent')}: about ${compactUsd(t.valueUsd)} of time, against ${compactUsd(t.aiCostUsd)} of metered AI spend (build time not included).`;
}

export function opsRegistryCopy(ctx: TourCtx): string {
  const ag = ctx.ops?.agent;
  if (!ag) return 'Every production agent has a named owner, a purpose and a review date, and is held to the same nine-check standard.';
  const st = ag.standard ?? [];
  const std = st.length ? ` Passes ${st.filter((c) => c.passed).length}/${st.length} checks of the agent standard.` : '';
  return `Owner ${ag.ownerName}, business owner ${ag.businessOwner}. Reviewed every ${ag.reviewCadenceDays} days; next on ${ag.nextReview.slice(0, 10)}.${std}`;
}

export function opsLiveCopy(ctx: TourCtx): string {
  const l = ctx.ops?.live;
  if (!l) return 'This session is in the data. Adoption is measured from usage events, not surveys; the six-week history behind it is simulated users.';
  return `This session is in the data: ${plural(l.activeNow, 'session')} active now, ${plural(l.tourStarts, 'walkthrough')} started in the last 24 hours. Measured from usage events, not surveys; the history behind it is simulated users.`;
}

export function opsLogsCopy(ctx: TourCtx): string {
  const n = ctx.ops?.logCount;
  if (ctx.runId && n) return `${plural(n, 'structured log line')} from the run you just did. Same trace ID end to end.`;
  return 'Filtered to your own run: every step, model call and delivery, as structured logs with one trace ID.';
}

/** routing: only claim a re-route when the viewer actually changed a rule. */
export function sankeyCopy(ctx: TourCtx): { title: string; body: string } {
  if (ctx.counters.rulesChanged > 0) {
    return { title: 'The flows re-route', body: 'Same insights, new owner. No prompt changed, no redeploy. The edit is in your workspace only.' };
  }
  return { title: 'Where today’s rules send them', body: 'From type to product area to owner, under the current rules. Change a rule and the flows move.' };
}

/** operate.trace: name any red spans instead of leaving them unexplained. */
export function opsTraceCopy(ctx: TourCtx): string {
  const base = 'Every span of your run: the steps, each model call, retries and deliveries.';
  const e = ctx.ops?.traceErrors;
  return e ? `${base} The red ones: ${e.charAt(0).toLowerCase()}${e.slice(1)}` : base;
}

/**
 * routing.rule revisit: the pricing rule already carries this workspace's override, so choosing the
 * same owner again shows no Save. Read from the routing table the step points at.
 */
export function pricingRuleOverridden(_ctx?: TourCtx): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[data-tour="routing.rule.pricing"][data-override="true"]');
}
