/**
 * Agent Ops vocabulary on the Switchboard design system: one component per concept (agent
 * status, review status, service-target status, alert status, data source, standard score),
 * so each looks the same on every page. Status is colour plus a label, with the precise
 * meaning one hover away; never colour alone.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Card, Meter, Skeleton, Tooltip, type Option, type SortDir, type Tone } from '../../ds';
import { IconArrowDown, IconArrowUp, IconChevronRight, IconChevronsUpDown } from '../../ds/icons';
import { InfoTip } from './InfoTip';
import { SIGNAL_LOOP_AGENT_ID, type AgentRecord, type Alert, type DataSource, type Slo } from '../../shared/platform-contracts';
import type { RegistryRow, ReviewStatus } from '../../worker/platform/types';
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
/**
 * Live, simulated or both. Live is the accent; simulated is quiet (the same outline badge as
 * Switchboard's SimulatedBadge). `help` replaces the generic meaning when the context is narrower.
 */
export function SourceBadge({ source, label, help }: { source: DataSource | 'mixed'; label?: string; help?: string }) {
  const text = label ?? (source === 'live' ? 'Live' : source === 'simulated' ? 'Simulated' : 'Live and simulated');
  const tip = help ?? SRC_HELP[source];
  return (
    <Tooltip label={tip}>
      <span className="ao-badge-wrap">
        <Badge tone={source === 'live' ? 'success' : 'neutral'} outline={source !== 'live'}>
          {text}
        </Badge>
        <span className="ds-sr-only">{tip}</span>
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- real or simulated agent

const AGENT_SRC_HELP: Record<DataSource, string> = {
  live: 'A real agent: its runs in this demo report here live. The six weeks before today are simulated history.',
  simulated: 'A simulated agent: it, its users and its whole history are made up, to show a second agent held to the same standard. It is listed for comparison and does not open.',
};

/** Whether an agent is real or simulated. Rows that carry `source` win; otherwise only Signal Loop is live (the contract). */
export function agentSource(agentId: string, rows?: { id: string; source: DataSource }[] | null): DataSource {
  return rows?.find((r) => r.id === agentId)?.source ?? (agentId === SIGNAL_LOOP_AGENT_ID ? 'live' : 'simulated');
}

/**
 * Only a real agent opens in Agent Ops. A simulated agent is listed for comparison and counts in
 * every total, but has no page, runbook, trace or filter of its own: it shows as plain text
 * wherever it appears, and its old URLs fall back to the list page.
 */
export function canOpenAgent(agentId: string, rows?: { id: string; source: DataSource }[] | null): boolean {
  return isOpenable(agentSource(agentId, rows));
}
/** The same rule for a row that already carries its agent's source. */
export const isOpenable = (source: DataSource): boolean => source === 'live';

/**
 * Last column of an agent table: a quiet chevron on a row that opens the agent's page, nothing
 * on one that does not, so the difference reads as intended. Decorative; the first cell's link
 * is what assistive technology uses.
 */
export const GoHead = () => <th className="ao-go" aria-hidden="true" />;
export function GoCell({ opens }: { opens: boolean }) {
  return (
    <td className="ao-go" aria-hidden="true">
      {opens ? <IconChevronRight size={16} /> : null}
    </td>
  );
}

/**
 * Route guard for pages that take `?agentId=`: a filter naming an agent that cannot open (the
 * simulated one, or an id not in the registry) drops back to the same page without it, before
 * the page mounts. Decided from the contract (only Signal Loop is live), so it needs no fetch.
 */
export function AgentFilterGuard({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const { pathname, hash } = useLocation();
  const id = params.get('agentId');
  if (id && id !== 'all' && !canOpenAgent(id)) {
    const next = new URLSearchParams(params);
    next.delete('agentId');
    const qs = next.toString();
    return <Navigate replace to={{ pathname, search: qs ? `?${qs}` : '', hash }} />;
  }
  return <>{children}</>;
}

/** "Live" for the real agent, "Simulated" for a simulated one; one per agent in a list or header. */
export function AgentSourceBadge({ source }: { source: DataSource }) {
  return <SourceBadge source={source} help={AGENT_SRC_HELP[source]} />;
}

/** An agent's name where only text fits (selects, legends, chart tips): a simulated agent says so. */
export function agentLabel(name: string, source: DataSource): string {
  return source === 'simulated' ? `${name} (simulated)` : name;
}

/** Options for an agent filter: every agent is listed, and one that cannot open is listed but not selectable. */
export function agentOptions(rows: RegistryRow[] | null, allValue = ''): Option[] {
  return [{ value: allValue, label: 'All agents' }, ...(rows ?? []).map((r) => ({ value: r.id, label: agentLabel(r.profile.shortName || r.name, r.source), disabled: !isOpenable(r.source) }))];
}

// ---------------------------------------------------------------- small pieces

/** An agent's colour: a small square, like a chart legend key. */
export function AgentDot({ color }: { color: string }) {
  return <span className="ao-agent-dot" style={{ background: color }} aria-hidden="true" />;
}

/** Agent name with its colour key, whether it is live or simulated, and a quieter second line. */
export function AgentCell({ color, primary, secondary, source }: { color: string; primary: ReactNode; secondary?: ReactNode; source?: DataSource }) {
  return (
    <span className="ao-agent">
      <AgentDot color={color} />
      <span className="ao-agent__text">
        {source ? (
          <span className="ao-agent__name">
            <span className="ds-table__primary">{primary}</span>
            <AgentSourceBadge source={source} />
          </span>
        ) : (
          <span className="ds-table__primary">{primary}</span>
        )}
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
