import type { Channel, Gate, InsightStatus, InsightType, ProductArea, Severity, StepKey } from '../../shared/contracts';
import type { StatusTone } from '../../uis/StatusChip';

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
  auto_route: 'Final confidence ≥ 0.80 and no always-review rule: routed without a human.',
  review: 'Between 0.55 and 0.80, or a type that is always reviewed (churn risk, sev-1 bug).',
  held: 'Below 0.55: kept and visible, but not routed.',
  dropped: 'The quote could not be found in the transcript (grounding < 0.90): counted as a hallucination.',
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

export const STEP_HELP: Record<StepKey, string> = {
  ingest: 'Store the raw file, hash it (SHA-256) and skip exact re-uploads.',
  normalize: 'Detect the format, parse speakers and turns, assign turn IDs.',
  redact: 'Swap PII/PHI for reversible tokens. Only redacted text reaches a model.',
  screen: 'Fast model call: actionable? language? injection suspected?',
  extract: 'Structured output (Zod schema): type, area, severity, quote, confidence.',
  ground: 'Code, not a model: find every quote in the transcript (exact, then fuzzy ≥ 0.90).',
  score: 'Final confidence = model × grounding × type prior; gate at 0.55 / 0.80.',
  theme: 'Embed and join the nearest theme, or start a candidate theme.',
  route: 'Editable rules table (type × area × severity × ARR) picks owner + channel.',
  deliver: 'Write to Slack / Jira / Linear / digest with receipts and retries.',
};

export function money(usd: number | null | undefined, opts: { precise?: boolean; compact?: boolean } = {}): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  if (opts.compact) {
    if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '')}M`;
    if (Math.abs(usd) >= 1_000) return `$${Math.round(usd / 1_000)}k`;
    return `$${usd.toFixed(0)}`;
  }
  if (opts.precise || Math.abs(usd) < 1) {
    if (usd === 0) return '$0.00';
    if (Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`;
    if (Math.abs(usd) < 1) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  }
  return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function ms(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`;
}

export function int(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

export function pct(value: number | null | undefined, digits = 0): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function dateShort(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
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
