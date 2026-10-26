/**
 * One set of number formatters for every surface that shows the same figure twice
 * (product pages, the walkthrough's Guide, Agent Ops). If a number appears in two places,
 * both must come from the same field and go through the same function here.
 */

type Rate = { value: number | null; numerator?: number | null; denominator?: number | null };

/** The exact rate: numerator/denominator when both are recorded, else the stored (rounded) value. */
export function rateOf(m: Rate | null | undefined): number | null {
  if (!m) return null;
  if (m.numerator != null && m.denominator != null && m.denominator > 0) return m.numerator / m.denominator;
  return m.value;
}

/** Percent with half-up rounding that is immune to float noise (0.8865 → "88.7%", not "88.6%"). */
export function pctText(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const f = 10 ** digits;
  const rounded = Math.round(Number((v * 100 * f).toPrecision(12))) / f;
  return `${rounded.toFixed(digits)}%`;
}

/** A metric's percent, from its exact fraction when it has one. */
export function metricPct(m: Rate | null | undefined, digits = 1): string {
  return pctText(rateOf(m), digits);
}

/** Signed percentage points between two rates ("−28.9 pts"). */
export function ptsText(delta: number, digits = 1): string {
  const f = 10 ** digits;
  const r = Math.round(Number((Math.abs(delta) * 100 * f).toPrecision(12))) / f;
  return `${delta >= 0 ? '+' : '−'}${r.toFixed(digits)} pts`;
}

/** Durations. Code-only steps finish inside a millisecond: say "<1 ms", never "0 ms". */
export function durationText(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 1) return '<1 ms';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`;
}

/**
 * Small dollar amounts (per-run, per-call, per-task AI cost): 4 decimals under a cent, 3 under
 * a dollar. Zero reads "$0", and an amount too small for 4 decimals reads "under 1¢", never
 * "$0.0000".
 */
export function usdPrecise(usd: number): string {
  if (usd === 0) return '$0';
  if (Math.abs(usd) < 0.00005) return 'under 1¢';
  if (Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`;
  if (Math.abs(usd) < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Money totals (spend so far, AI spend on your runs): "$0" for nothing, "under 1¢" for a
 * fraction of a cent, otherwise dollars and cents. Per-unit costs use usdPrecise instead.
 */
export function usdTotal(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0';
  if (Math.abs(usd) < 0.01) return 'under 1¢';
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Tooltip for a step that made no model call and took under a millisecond. */
export const INSTANT_STEP_HELP = 'Code-only step (no model call): it finishes in under a millisecond.';

type SpanLike = { name: string; start: string; status: 'ok' | 'error'; attrs: Record<string, unknown> };
const channelWord = (name: string) => {
  const c = name.replace(/^delivery\./, '');
  return c === 'jira' ? 'Jira' : c === 'slack' ? 'Slack' : c === 'linear' ? 'Linear' : c === 'email_digest' ? 'email digest' : c;
};

/**
 * One sentence that explains a trace's error spans, so a red bar never goes unexplained.
 * Delivery attempts are one span each: a failed attempt followed by an ok attempt to the
 * same destination was retried and delivered.
 */
export function explainSpanErrors(spans: SpanLike[]): string | null {
  const errs = spans.filter((s) => s.status === 'error');
  if (!errs.length) return null;
  const deliveries = errs.filter((e) => e.name.startsWith('delivery.'));
  const recovered = deliveries.filter((e) =>
    spans.some((o) => o.status === 'ok' && o.name === e.name && o.attrs.destination === e.attrs.destination && o.start >= e.start && o !== e),
  );
  const parts: string[] = [];
  if (recovered.length) {
    const chans = [...new Set(recovered.map((e) => channelWord(e.name)))].join(' and ');
    parts.push(recovered.length === 1 ? `1 ${chans} delivery failed once and was retried successfully` : `${recovered.length} ${chans} delivery attempts failed and were retried successfully`);
  }
  const lost = deliveries.length - recovered.length;
  if (lost) parts.push(`${lost} delivery attempt${lost === 1 ? '' : 's'} failed without a successful retry`);
  const other = errs.length - deliveries.length;
  if (other) parts.push(`${other} other span${other === 1 ? '' : 's'} ended in an error`);
  return `${parts.join('; ')}.`;
}

// ------------------------------------------------------------------ run cost (one source)

type CostStep = { key?: string; costUsd?: number | null; detail?: Record<string, unknown> | null };

/**
 * A run's AI cost, as shown on the Run view ("AI cost so far", the Trace total) and in the
 * Guide's trace step: the sum of the step rows. Deferred theme naming adds its cost to
 * the theme step after the run is final, so callers keep polling while `themeNamingPending`.
 */
export function stepsCostUsd(steps: ReadonlyArray<CostStep>): number {
  return steps.reduce((a, s) => a + (s.costUsd ?? 0), 0);
}

/** How long after a run finishes to keep polling for deferred theme naming before giving up. */
export const THEME_NAMING_WAIT_MS = 20_000;

/**
 * True while the run is final but its deferred theme naming (a cost that lands on the theme step
 * after the fact) has not been written yet, within THEME_NAMING_WAIT_MS of the run finishing.
 */
export function themeNamingPending(
  d: { run: { status: string; finishedAt: string | null }; steps: ReadonlyArray<CostStep> } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!d || !['completed', 'awaiting_review', 'failed'].includes(d.run.status)) return false;
  const theme = d.steps.find((s) => s.key === 'theme');
  if (!theme?.detail?.namingDeferred || theme.detail.namingMs != null) return false;
  const finished = d.run.finishedAt ? Date.parse(d.run.finishedAt) : NaN;
  return Number.isFinite(finished) && now - finished < THEME_NAMING_WAIT_MS;
}
