import type { Channel, Gate, InsightStatus, InsightType, ProductArea, Severity, StepKey } from '../../shared/contracts';
import type { StatusTone } from '../../uis/StatusChip';
import { durationText, pctText, usdPrecise } from '../../shared/format';

export const TYPE_LABEL: Record<InsightType, string> = {
  feature_request: 'Feature request',
  bug: 'Bug',
  pricing_objection: 'Pricing objection',
  competitor_mention: 'Competitor mention',
  churn_risk: 'Churn risk',
  praise: 'Praise',
};

/** Categorical identity per insight type (Invoca chart ramp). Identity is also always in words. */
export const TYPE_COLOR: Record<InsightType, string> = {
  feature_request: 'var(--cn-chart-1)',
  bug: 'var(--cn-chart-3)',
  pricing_objection: 'var(--cn-chart-5)',
  competitor_mention: 'var(--cn-chart-4)',
  churn_risk: 'var(--cn-chart-6)',
  praise: 'var(--cn-chart-2)',
};

export const AREA_LABEL: Record<ProductArea, string> = {
  call_tracking: 'Call Tracking & Attribution',
  signal_ai: 'Signal AI',
  presense: 'PreSense',
  integrations: 'Integrations',
  quality_management: 'Quality Management',
  ai_agents: 'AI Agents',
  billing_pricing: 'Billing & Pricing',
  platform: 'Platform & Reporting',
};

export const AREA_SHORT: Record<ProductArea, string> = {
  call_tracking: 'Call Tracking',
  signal_ai: 'Signal AI',
  presense: 'PreSense',
  integrations: 'Integrations',
  quality_management: 'QM',
  ai_agents: 'AI Agents',
  billing_pricing: 'Billing',
  platform: 'Platform',
};

export const SEVERITY_LABEL: Record<Severity, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const SEVERITY_TONE: Record<Severity, StatusTone> = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' };

export const GATE_LABEL: Record<Gate, string> = {
  auto_route: 'Auto-routed',
  review: 'Needs review',
  held: 'Held',
  dropped: 'Dropped',
};
export const GATE_TONE: Record<Gate, StatusTone> = { auto_route: 'success', review: 'warning', held: 'neutral', dropped: 'danger' };
export const GATE_HELP: Record<Gate, string> = {
  auto_route: 'Confident enough (score 0.80 or higher) to send without a person checking.',
  review: 'A person checks it first: the score is between 0.55 and 0.80, or it is a type that is always checked (churn risk, critical bugs).',
  held: 'Score below 0.55: kept and visible, but not sent anywhere.',
  dropped: 'The quote could not be found in the conversation, so the insight was discarded.',
};

export const STATUS_LABEL: Record<InsightStatus, string> = {
  pending_review: 'Pending review',
  routed: 'Routed',
  rejected: 'Rejected',
  held: 'Held',
  dropped_ungrounded: 'Dropped (ungrounded)',
};
export const STATUS_TONE: Record<InsightStatus, StatusTone> = {
  pending_review: 'warning',
  routed: 'success',
  rejected: 'neutral',
  held: 'neutral',
  dropped_ungrounded: 'danger',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  slack: 'Slack',
  jira: 'Jira',
  linear: 'Linear',
  email_digest: 'Email digest',
  triage: 'Triage queue',
};

/** Plain-English description of each pipeline step (what a CS leader needs to know). */
export const STEP_HELP: Record<StepKey, string> = {
  ingest: 'Saves the original file. Uploading the same file twice is recognised and not processed again.',
  normalize: 'Reads the format and splits the conversation into speakers and lines.',
  redact: 'Replaces names, emails and phone numbers with placeholders. Only the redacted text is sent to AI.',
  screen: 'A quick AI check: is there anything actionable, what language is it, does anything look like an attempt to manipulate the AI?',
  extract: 'The main AI step: pulls out each insight with its type, product area, severity and the exact customer quote.',
  ground: 'Checks every quote really appears in the conversation. Quotes that cannot be found are dropped.',
  score: 'Combines AI confidence and the quote check into one score that decides: send automatically, ask a person, or hold.',
  theme: 'Groups the insight with similar feedback from other customers, or starts a new theme.',
  route: 'Your routing rules pick the owner and channel by type, product area, severity and account size.',
  deliver: 'Posts to Slack, Jira, Linear or the email digest and keeps a receipt. Here the destinations are in-app previews, so delivery is instant.',
};

/** The precise, engineer-facing version of each step, for tooltips and Settings. */
export const STEP_DETAIL: Record<StepKey, string> = {
  ingest: 'Stores the raw file and hashes it (SHA-256); an exact re-upload returns the earlier run.',
  normalize: 'Detects the format, parses speakers and turns, and assigns turn IDs.',
  redact: 'Swaps PII/PHI for reversible tokens before any model call.',
  screen: 'Fast model call: actionable, language, injection suspected.',
  extract: 'Schema-validated structured output: type, area, severity, quote, confidence.',
  ground: 'Code, not a model: exact match, then fuzzy match at 0.90 similarity or better.',
  score: 'Final confidence = model confidence × grounding × type prior. Auto-route at 0.80, review from 0.55.',
  theme: 'Embeds the insight and joins the nearest theme, or proposes a candidate theme.',
  route: 'Editable rules table (type, area, severity, ARR); lowest priority number wins.',
  deliver: 'Writes with receipts and retries with backoff; failures go to a dead-letter queue.',
};

export function money(usd: number | null | undefined, opts: { precise?: boolean; compact?: boolean } = {}): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (opts.compact) {
    if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '')}M`;
    if (Math.abs(usd) >= 1_000) return `$${Math.round(usd / 1_000)}k`;
    return `$${usd.toFixed(0)}`;
  }
  if (opts.precise || Math.abs(usd) < 1) return usdPrecise(usd);
  return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Durations ("<1 ms" for code-only steps, never "0 ms"). Same formatter as the walkthrough. */
export const ms = durationText;

export function int(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

export function pct(value: number | null | undefined, digits = 0): string {
  return pctText(value, digits);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Short date. A date-only value ("2027-01-15": a renewal date, a day bucket) is a calendar
 * date, not an instant, so it is formatted in UTC; formatting it in the viewer's zone would show
 * Jan 14 anywhere west of UTC.
 */
export function dateShort(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const dateOnly = DATE_ONLY.test(isoStr);
  const d = new Date(dateOnly ? `${isoStr}T00:00:00Z` : isoStr);
  const timeZone = dateOnly ? 'UTC' : undefined;
  const year = dateOnly ? d.getUTCFullYear() : d.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: year !== new Date().getFullYear() ? 'numeric' : undefined, timeZone });
}

export function dateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function renewalIn(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const days = Math.round((new Date(`${dateStr}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${dateShort(dateStr)} (passed)`;
  if (days < 60) return `${dateShort(dateStr)} · in ${days} days`;
  return `${dateShort(dateStr)} · in ${Math.round(days / 30)} months`;
}

/** Parse a gate reason like "confidence 0.71 < 0.80" into rule/expected/actual for SeverityChip. */
export function reasonToObservation(reason: string): { rule: string; expected: string; actual: string } {
  const m = reason.match(/^(confidence|grounding)\s+([\d.]+)\s*([<≥>=]+)\s*([\d.]+)/i);
  if (m) {
    const [, what, actual, op, threshold] = m;
    const isConf = what!.toLowerCase() === 'confidence';
    if (op === '<') {
      return {
        rule: isConf ? (Number(threshold) >= 0.8 ? 'Final confidence below the auto-route threshold' : 'Final confidence below the review floor') : 'Quote not found in the transcript',
        expected: `≥ ${threshold}`,
        actual: actual!,
      };
    }
    return { rule: 'Final confidence clears the auto-route threshold', expected: `≥ ${threshold}`, actual: actual! };
  }
  if (/churn_risk/i.test(reason)) return { rule: 'Churn risk is always reviewed by a human', expected: 'human review', actual: 'type = churn_risk' };
  if (/sev-1|critical/i.test(reason)) return { rule: 'Sev-1 bugs are always reviewed by a human', expected: 'human review', actual: 'severity = critical' };
  if (/quote not found/i.test(reason)) return { rule: 'No quote, no insight', expected: 'quote located in transcript', actual: 'not found' };
  return { rule: reason, expected: '—', actual: '—' };
}
