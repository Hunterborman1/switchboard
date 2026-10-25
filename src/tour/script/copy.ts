/**
 * Data-driven narration. Every function reads the viewer's real RunDetail / eval / platform
 * data and degrades to honest generic copy when the data isn't there yet.
 */
import type { RunDetail, StepKey, Evidence } from '../../shared/contracts';
import type { TourCtx } from '../engine/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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

export const runSettled = (run: RunDetail | null) => !!run && ['completed', 'failed', 'awaiting_review'].includes(run.run.status);

function allEvidence(run: RunDetail): Evidence[] {
  return run.insights.flatMap((i) => i.evidence);
}

export function redactCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run) return 'Names, phones and health details are swapped for tokens before any model sees a word.';
  const n = run.redactions.reduce((a, r) => a + r.count, 0);
  if (n === 0) return 'Nothing personal to redact in this one. When there is, it’s tokenised before any model sees it.';
  const kinds = [...new Set(run.redactions.map((r) => r.kind))].slice(0, 3).join(', ');
  return `${plural(n, 'value')} redacted (${kinds}) before any model saw the text.`;
}

export function screenCopy(ctx: TourCtx): { title: string; body: string } {
  const s = ctx.run?.screen;
  if (ctx.path === 'security' || s?.injection_suspected) {
    return {
      title: 'Injection flagged, and kept inert',
      body: 'The planted instruction is treated as data. Output stays schema-only, and an audit row is written.',
    };
  }
  if (ctx.path === 'negative' || s?.actionable === false) {
    return { title: 'A cheap check first', body: 'Screen says: friendly, nothing actionable. The expensive step still runs, and it must agree.' };
  }
  return {
    title: 'A cheap check before the expensive one',
    body: s ? `Actionable, language “${s.language}”, no injection suspected. Fast model, a few hundred tokens.` : 'Is it actionable? What language? Is someone trying to steer the model? One fast call answers all three.',
  };
}

export function extractCopy(ctx: TourCtx): { title: string; body: string } {
  const run = ctx.run;
  const n = run ? run.insights.length : null;
  if (ctx.path === 'negative' || n === 0) {
    return { title: 'Nothing actionable, and that’s the right answer', body: 'Zero insights. A calm empty state. It doesn’t invent work to look busy.' };
  }
  return {
    title: 'Structured, quoted, typed',
    body: n != null ? `${plural(n, 'candidate insight')}, each with a verbatim quote and a turn ID. No quote, no insight.` : 'Every candidate carries a verbatim quote and a turn ID. No quote, no insight.',
  };
}

export function groundCopy(ctx: TourCtx): { title: string; body: string; more: string } {
  const run = ctx.run;
  const more =
    'Grounding is code, not the model. Normalise both texts, try an exact substring, then slide a window scored with Levenshtein; 0.90 or better passes. Anything that doesn’t match is dropped and counted as a hallucination, never shown as fact.';
  if (!run) return { title: 'Ground every quote', body: 'Each quote must exist in the transcript. If it doesn’t, the insight is dropped, never shown as fact.', more };
  const ev = allEvidence(run);
  const failed = ev.filter((e) => e.method === 'failed').length;
  const dropped = Math.max(run.run.droppedCount, run.insights.filter((i) => i.status === 'dropped_ungrounded').length, failed);
  const fuzzy = ev.filter((e) => e.method === 'fuzzy').length;
  const grounded = ev.length - failed;
  if (ev.length === 0) return { title: 'Nothing to ground', body: 'No insights means no quotes to check. Grounding still ran, and passed trivially.', more };
  if (dropped > 0) {
    return {
      title: dropped === 1 ? 'One quote didn’t survive' : `${dropped} quotes didn’t survive`,
      body: `${grounded} of ${ev.length} quotes matched the transcript. ${dropped === 1 ? 'One didn’t match anything said on the call, so its insight was' : `${dropped} didn’t match, so their insights were`} dropped.`,
      more,
    };
  }
  return {
    title: `${ev.length} of ${ev.length} quotes are real`,
    body: `Every quote matched the transcript${fuzzy ? `, ${fuzzy === 1 ? 'one' : fuzzy} through fuzzy matching across an interruption` : ' word for word'}. Anything that doesn’t is dropped, never shown as fact.`,
    more,
  };
}

/** The optional beat: a real rejected quote from another run. */
export function rejectedCopy(ctx: TourCtx): { title: string; body: string } {
  const p = ctx.peek;
  const bad = p?.insights.flatMap((i) => i.evidence).find((e) => e.method === 'failed');
  if (!p || !bad) return { title: 'What a rejected quote looks like', body: 'When a quote can’t be found in the transcript, its insight is dropped and counted. It never reaches a person as fact.' };
  const q = bad.quote.length > 90 ? `${bad.quote.slice(0, 88)}…` : bad.quote;
  return {
    title: 'A quote the customer never said',
    body: `“${q}” The closest span scored ${bad.score.toFixed(2)}, under 0.90, so the insight was dropped.`,
  };
}

export function gateCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run || run.insights.length === 0) return '0.80+ routes itself, 0.55–0.80 goes to a person, below that is held. High stakes always get reviewed.';
  const live = run.insights.filter((i) => i.gate !== 'dropped');
  const auto = live.filter((i) => i.gate === 'auto_route').length;
  const review = live.filter((i) => i.gate === 'review').length;
  const held = live.filter((i) => i.gate === 'held').length;
  return `${auto} route${auto === 1 ? 's' : ''} automatically, ${review} go${review === 1 ? 'es' : ''} to a person${held ? `, ${held} held` : ''}. Sev-1 bugs and churn risk are always reviewed.`;
}

export function traceCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run) return 'Every step records its model, tokens, cost and milliseconds. Nothing is a black box.';
  const mode = run.run.mode === 'replay' ? ' (replay of a recorded live run)' : '';
  const secs = run.run.durationMs ? `${(run.run.durationMs / 1000).toFixed(1)}s` : 'a few seconds';
  return `This call: ${secs}, ${usd(run.run.costUsd)}${mode}. Every step logs model, tokens, cost and time.`;
}

export function messyCopy(ctx: TourCtx): string {
  const run = ctx.run;
  if (!run || run.insights.length === 0) return 'Noise lowers confidence, so more lands with a person instead of in a PM’s backlog.';
  const avg = run.insights.reduce((a, i) => a + i.confidenceFinal, 0) / run.insights.length;
  return `Average confidence ${avg.toFixed(2)}, ${run.run.reviewCount} to review. Noise sends work to a person, not into a backlog.`;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export function candidateCopy(ctx: TourCtx): string {
  const c = ctx.evals?.candidate;
  const l = ctx.evals?.latest;
  if (!c) return 'A cheaper candidate prompt is ready. Should it ship?';
  const cheaper = l && c.costUsd < l.costUsd ? ` It’s cheaper to run (${usd(c.costUsd)} vs ${usd(l.costUsd)} for the eval set).` : '';
  return `${c.promptVersion} is the candidate.${cheaper} Should it ship?`;
}

export function promoteCopy(ctx: TourCtx): { title: string; body: string } {
  const cand = ctx.evals?.candidate;
  const latest = ctx.evals?.latest;
  const promoted = ctx.counters.promoted ?? cand?.promoted ?? false;
  if (promoted) {
    return { title: 'Promoted', body: `Every slice held its threshold, so ${cand?.promptVersion ?? 'the candidate'} ships. The gate checks each slice, not the average.` };
  }
  const failed = cand?.metrics.filter((m) => m.passed === false) ?? [];
  const reg = failed.find((m) => m.key.startsWith('regression.'));
  const key = reg ? reg.key.replace('regression.', '') : failed[0]?.key;
  const now = cand?.metrics.find((m) => m.key === key);
  const before = latest?.metrics.find((m) => m.key === key);
  if (now && now.value != null) {
    const label = now.label.replace(/\s*\(.*\)\s*$/, '');
    const drop = before?.value != null ? Math.round((before.value - now.value) * 100) : reg?.value != null ? Math.round(-reg.value * 100) : null;
    const why = key?.startsWith('precision') ? 'It flagged things customers never raised.' : key?.startsWith('recall') ? 'It missed real insights.' : 'One slice regressed.';
    return {
      title: 'PROMOTION BLOCKED',
      body: drop != null ? `${label} fell ${drop} points (${pct(before?.value)} → ${pct(now.value)}). ${why} One regression blocks promotion.` : `${label} is ${pct(now.value)}, under its threshold. ${why}`,
    };
  }
  const reason = cand?.blockedReasons[0];
  return { title: 'PROMOTION BLOCKED', body: reason ? `${reason}. One regression blocks promotion.` : 'A slice regressed against the current prompt, so the gate held. One regression blocks promotion.' };
}

export function themeCopy(ctx: TourCtx): { intro: string; arr: string } {
  const t = ctx.theme;
  if (!t) return { intro: 'One complaint is an anecdote; the same thing from several accounts is a pattern. Open the theme.', arr: 'Summed across distinct accounts. That’s the number that moves a roadmap.' };
  return {
    intro: `“${t.name}”: ${plural(t.insightCount, 'insight')} from ${plural(t.accountCount, 'account')}. Open it.`,
    arr: `${compactUsd(t.arrUsd)} of ARR across ${plural(t.accountCount, 'account')}, counted once each. That’s what moves a roadmap.`,
  };
}

export function budgetCopy(ctx: TourCtx): string {
  const b = ctx.budget;
  if (!b) return 'A hard $15 cap on live AI for viewers. Past it, runs replay recorded executions, so nothing breaks.';
  return `${usd(b.spentUsd, 2)} of ${usd(b.limitUsd, 2)} used across ${b.liveRuns} live runs. Past the cap it replays: never an outage.`;
}

// ---------------------------------------------------------------- platform (ch8)

export function opsKpiCopy(ctx: TourCtx): string {
  const t = ctx.ops?.overview?.totals;
  if (!t) return 'Hours returned, value against AI cost, ROI and active users, per agent. Two agents today; built for fifty.';
  const roi = t.roiMultiple != null ? `, ${t.roiMultiple.toFixed(0)}× return` : '';
  return `${Math.round(t.hoursReturned).toLocaleString()} hours returned across ${t.agentsInProduction === 1 ? '1 agent' : `${t.agentsInProduction} agents`}: ${compactUsd(t.valueUsd)} of time for ${compactUsd(t.aiCostUsd)} of AI${roi}.`;
}

export function opsAttentionCopy(ctx: TourCtx): string {
  const a = ctx.ops?.overview?.attention;
  if (!a) return 'Overdue reviews, SLO breaches and standard gaps. Operating an agent means working this list.';
  if (a.length === 0) return 'Nothing needs attention right now. When something does, it lands here with an owner.';
  return `${plural(a.length, 'item')} need${a.length === 1 ? 's' : ''} attention: ${a[0]?.message ?? ''}`.slice(0, 140);
}

export function opsRegistryCopy(ctx: TourCtx): string {
  const ag = ctx.ops?.agent;
  if (!ag) return 'Every production agent has a named owner, a purpose and a review date. Signal Loop included.';
  return `Owner ${ag.ownerName}, business owner ${ag.businessOwner}. Reviewed every ${ag.reviewCadenceDays} days; next on ${ag.nextReview.slice(0, 10)}.`;
}

export function opsStandardCopy(ctx: TourCtx): string {
  const st = ctx.ops?.agent?.standard;
  if (!st || st.length === 0) return 'Nine checks I’d hold every builder’s agent to, mine included, before it touches production.';
  const passed = st.filter((c) => c.passed).length;
  return `The standard I’d hold every builder’s agent to. Signal Loop passes ${passed}/${st.length}, with evidence linked for each.`;
}

export function opsLiveCopy(ctx: TourCtx): string {
  const l = ctx.ops?.live;
  if (!l) return 'That’s you. This session is in the data: adoption is measured, not surveyed.';
  return `That’s you: ${plural(l.activeNow, 'viewer')} active now, ${l.tourStarts} walkthroughs started today. Adoption is measured, not surveyed.`;
}

export function opsLogsCopy(ctx: TourCtx): string {
  const n = ctx.ops?.logCount;
  if (ctx.runId && n) return `${plural(n, 'structured log line')} from the run you just did. Same trace ID end to end.`;
  return 'Filtered to your own run: every step, model call and delivery, as structured logs with one trace ID.';
}
