/**
 * Agent Ops vocabulary on the Switchboard design system: one component per concept (agent
 * status, review status, service-target status, alert status, data source, standard score),
 * so each looks the same on every page. Status is colour plus a label, with the precise
 * meaning one hover away; never colour alone.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Card, Meter, Skeleton, Tooltip, type SortDir, type Tone } from '../../ds';
import { IconArrowDown, IconArrowUp, IconChevronsUpDown } from '../../ds/icons';
import { InfoTip } from './InfoTip';
import type { AgentRecord, Alert, DataSource, Slo } from '../../shared/platform-contracts';
import type { ReviewStatus } from '../../worker/platform/types';
import { modelAgentId, modelLabel } from '../../shared/modelLabels';
import { ErrorState } from '../../app/components/domain';

// ---------------------------------------------------------------- vocabularies

export type Vocab = Record<string, { label: string; tone: Tone; help: string }>;

export const AGENT_STATUS: Vocab = {
  production: { label: 'Production', tone: 'success', help: 'Live for its whole intended audience; held to every service target and the full agent standard.' },
  pilot: { label: 'Pilot', tone: 'info', help: 'Named pilot users only, with a planned production review.' },
  in_review: { label: 'In review', tone: 'warning', help: 'Waiting on a security, data or production-readiness review.' },
  retired: { label: 'Retired', tone: 'neutral', help: 'Switched off; access removed and data handled per the retirement runbook.' },
};
export const REVIEW_STATUS: Vocab = {
  current: { label: 'Current', tone: 'success', help: 'The next scheduled review is more than 14 days away.' },
  due_soon: { label: 'Due soon', tone: 'warning', help: 'The next scheduled review is within 14 days.' },
  overdue: { label: 'Overdue', tone: 'danger', help: 'The scheduled review date has passed; the standard check fails until it is held.' },
};
export const SLO_STATUS: Vocab = {
  ok: { label: 'Meeting', tone: 'success', help: 'Meeting the target with at least a quarter of the error budget left.' },
  at_risk: { label: 'At risk', tone: 'warning', help: 'Meeting the target, but less than a quarter of the error budget is left.' },
  breached: { label: 'Breached', tone: 'danger', help: 'Missing the target over the window; the error budget is spent.' },
  no_data: { label: 'No data', tone: 'neutral', help: 'Nothing in the window to measure. No data is not success.' },
};
export const ALERT_STATUS: Vocab = {
  open: { label: 'Open', tone: 'danger', help: 'Firing and not yet acknowledged by its owner.' },
  acknowledged: { label: 'Acknowledged', tone: 'warning', help: 'An owner is on it. Still firing: acknowledging is not resolving.' },
  resolved: { label: 'Resolved', tone: 'neutral', help: 'The rule stopped firing, or the incident was closed.' },
};
export const SEVERITY: Vocab = {
  info: { label: 'Info', tone: 'neutral', help: 'For awareness; no action needed.' },
  warning: { label: 'Warning', tone: 'warning', help: 'Needs an owner’s attention soon.' },
  critical: { label: 'Critical', tone: 'danger', help: 'Needs an owner now.' },
};
export const CLASSIFICATION: Vocab = {
  internal: { label: 'Internal', tone: 'neutral', help: 'Internal company data; no customer or personal data.' },
  confidential: { label: 'Confidential', tone: 'info', help: 'Customer or commercial data; access scoped to the agent’s function.' },
  restricted: { label: 'Restricted', tone: 'danger', help: 'Regulated or contract data; needs a passed security and data review before production.' },
};
export const SECURITY_REVIEW: Vocab = {
  approved: { label: 'Approved', tone: 'success', help: 'Passed the security and data review.' },
  approved_with_conditions: { label: 'Approved with conditions', tone: 'success', help: 'Passed, with conditions the owner must keep.' },
  pending: { label: 'Pending', tone: 'warning', help: 'The review is in progress.' },
  not_started: { label: 'Not started', tone: 'danger', help: 'No review yet.' },
};

/** A status from a vocabulary: a badge with a dot, its meaning on hover and for screen readers. */
export function VocabBadge({ vocab, value, dot = true }: { vocab: Vocab; value: string; dot?: boolean }) {
  const v = vocab[value] ?? { label: value.replace(/_/g, ' '), tone: 'neutral' as Tone, help: '' };
  const badge = (
    <span className="ao-badge-wrap">
      <Badge tone={v.tone} dot={dot}>
        {v.label}
      </Badge>
      {v.help ? <span className="ds-sr-only">{v.help}</span> : null}
    </span>
  );
  return v.help ? <Tooltip label={v.help}>{badge}</Tooltip> : badge;
}
export const AgentStatus = ({ value }: { value: AgentRecord['status'] }) => <VocabBadge vocab={AGENT_STATUS} value={value} />;
export const ReviewBadge = ({ value }: { value: ReviewStatus }) => <VocabBadge vocab={REVIEW_STATUS} value={value} />;
export const SloBadge = ({ value }: { value: Slo['status'] }) => <VocabBadge vocab={SLO_STATUS} value={value} />;
export const AlertBadge = ({ value }: { value: Alert['status'] }) => <VocabBadge vocab={ALERT_STATUS} value={value} />;

// ---------------------------------------------------------------- data source

const SRC_HELP: Record<DataSource | 'mixed', string> = {
  live: 'Real activity from Signal Loop and the people using this demo right now.',
  simulated: 'A seeded six-week history shaped like Invoca usage.',
  mixed: 'The simulated six-week history plus live activity from this demo.',
};
/** Live, simulated or both. Live is the accent; simulated is quiet. */
export function SourceBadge({ source, label }: { source: DataSource | 'mixed'; label?: string }) {
  const text = label ?? (source === 'live' ? 'Live' : source === 'simulated' ? 'Simulated' : 'Live and simulated');
  return (
    <Tooltip label={SRC_HELP[source]}>
      <span className="ao-badge-wrap">
        <Badge tone={source === 'live' ? 'success' : 'neutral'} outline={source !== 'live'}>
          {text}
        </Badge>
        <span className="ds-sr-only">{SRC_HELP[source]}</span>
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- small pieces

/** An agent's colour: a small square, like a chart legend key. */
export function AgentDot({ color }: { color: string }) {
  return <span className="ao-agent-dot" style={{ background: color }} aria-hidden="true" />;
}

/** Agent name with its colour key and a quieter second line. */
export function AgentCell({ color, primary, secondary }: { color: string; primary: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="ao-agent">
      <AgentDot color={color} />
      <span className="ao-agent__text">
        <span className="ds-table__primary">{primary}</span>
        {secondary ? <span className="ds-table__secondary">{secondary}</span> : null}
      </span>
    </span>
  );
}

/** A person in a ranked list: avatar, name and a role line that wraps instead of clipping. */
export function RankPerson({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <span className="ao-person">
      <Avatar name={name} />
      <span className="ao-person__text">
        <span className="ao-person__name">{name}</span>
        {sub ? <span className="ao-person__sub">{sub}</span> : null}
      </span>
    </span>
  );
}

/** Standard score: one pip per check, then "8/9". */
export function Score({ passed, total }: { passed: number; total: number }) {
  return (
    <span className="ao-score" title={`${passed} of ${total} standard checks pass`}>
      <span className="ao-score__pips" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < passed ? 'ao-score__pip' : 'ao-score__pip ao-score__pip--off'} />
        ))}
      </span>
      <span>
        {passed}/{total}
      </span>
      <span className="ds-sr-only">standard checks pass</span>
    </span>
  );
}

/** Change against a prior value, as a signed percentage. */
export function Delta({ value, goodWhen = 'up' }: { value: number | null; goodWhen?: 'up' | 'down' }) {
  if (value == null || !Number.isFinite(value)) return <span className="ao-delta">No change data</span>;
  const p = Math.round(value * 100);
  const cls = p === 0 ? 'ao-delta' : (p > 0) === (goodWhen === 'up') ? 'ao-delta ao-delta--up' : 'ao-delta ao-delta--down';
  return (
    <span className={cls}>
      {p > 0 ? '+' : p < 0 ? '−' : ''}
      {Math.abs(p)}%
    </span>
  );
}

/**
 * A model by role, never by vendor id (ids appear only on the product's Settings page).
 * In cross-agent tables pass `names` to name the owning agent on a second line.
 */
export function ModelName({ id, names }: { id: string; names?: Record<string, string> }) {
  const agent = names ? modelAgentId(id) : null;
  return (
    <>
      <span className="ds-table__primary">{modelLabel(id)}</span>
      {agent && names?.[agent] ? <span className="ds-table__secondary">{names[agent]}</span> : null}
    </>
  );
}

/** Error-budget meter: the share of the allowance for misses that is left. */
export function BudgetBar({ slo }: { slo: Slo }) {
  const rem = slo.errorBudgetRemaining;
  const tone = slo.status === 'breached' ? 'danger' : slo.status === 'at_risk' ? 'warning' : 'accent';
  const text = rem == null ? 'No data' : rem < 0 ? 'Used up' : `${Math.round(rem * 100)}%`;
  return (
    <div className="ao-budget">
      <Meter value={rem == null ? 0 : Math.max(0, Math.min(1, rem))} max={1} tone={tone} label={`Error budget left: ${text}`} />
      <div className="ao-budget__row">
        <span>Error budget left</span>
        <span className="ao-budget__value">{text}</span>
      </div>
    </div>
  );
}

/** A spend-against-cap meter with the numbers under it. */
export function SpendMeter({ value, max, label, format }: { value: number; max: number; label: string; format: (v: number) => string }) {
  const r = max > 0 ? value / max : 0;
  return (
    <div className="ao-budget" style={{ minWidth: 140 }}>
      <Meter value={Math.min(value, max)} max={max || 1} tone={r >= 1 ? 'danger' : r >= 0.8 ? 'warning' : 'accent'} label={`${label}: ${Math.round(r * 100)}% of the cap`} />
      <div className="ao-budget__row">
        <span>
          {format(value)} of {format(max)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page states

/** A failed load, in a card, with "Try again". */
export function LoadError({ error, onRetry, what }: { error: Error; onRetry?: () => void; what?: string }) {
  return (
    <Card>
      <ErrorState error={error} onRetry={onRetry} what={what} />
    </Card>
  );
}

/** Loading placeholder shaped like an Agent Ops page: header, a stats strip, two cards. */
export function OpsSkeleton({ stats = true }: { stats?: boolean }) {
  return (
    <div className="ds-page" aria-busy="true" aria-label="Loading">
      <div className="ds-stack" style={{ gap: 10 }}>
        <Skeleton width={260} height={24} />
        <Skeleton width={420} height={12} style={{ maxWidth: '100%' }} />
      </div>
      {stats ? <Skeleton height={104} radius={8} /> : null}
      <div className="ao-split">
        <Skeleton height={320} radius={8} />
        <Skeleton height={320} radius={8} />
      </div>
      <Skeleton height={220} radius={8} />
    </div>
  );
}

/** Sets the browser tab title: "Cost · Agent Ops". */
export function useOpsTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · Agent Ops`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

// ---------------------------------------------------------------- sortable tables

type Getter<T> = (r: T) => number | string | null | undefined;

/** Client-side sort for a ds Table: numbers sort high-first on first click, text A to Z. */
export function useSorted<T>(rows: T[], getters: Record<string, Getter<T>>, initial: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState(initial);
  const get = getters[sort.key];
  const sorted = !get
    ? rows
    : [...rows].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return sort.dir === 'asc' ? c : -c;
      });
  const state = (key: string): SortDir | null => (sort.key === key ? sort.dir : null);
  const by = (key: string, numeric = false) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: numeric ? 'desc' : 'asc' }));
  return { sorted, state, by };
}

/** A sortable header cell with an optional definition next to it (the ds SortTh plus an InfoTip). */
export function SortHead({ children, active, onSort, num, help, className }: { children: string; active: SortDir | null; onSort: () => void; num?: boolean; help?: ReactNode; className?: string }) {
  const cls = [num ? 'is-num' : '', className ?? ''].join(' ').trim() || undefined;
  return (
    <th aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined} className={cls}>
      <span className="ao-inline" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <button type="button" className="ds-th-sort" onClick={onSort}>
          {children}
          {active === 'asc' ? <IconArrowUp size={12} /> : active === 'desc' ? <IconArrowDown size={12} /> : <IconChevronsUpDown size={12} style={{ opacity: 0.45 }} />}
        </button>
        {help ? <InfoTip label={children}>{help}</InfoTip> : null}
      </span>
    </th>
  );
}
