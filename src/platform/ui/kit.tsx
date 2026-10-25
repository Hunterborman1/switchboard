/**
 * Agent Ops building blocks. HB Systems tokens and patterns, platform identity. Fixed
 * status vocabularies live here (colour + label + help text, never colour alone).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentRecord, Alert, DataSource, Slo } from '../../shared/platform-contracts';
import type { ReviewStatus } from '../../worker/platform/types';
import { IconAlert, IconInfo, IconX } from './icons';

// ---------------------------------------------------------------- vocabularies

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'indigo';
type Vocab = Record<string, { label: string; tone: Tone; help: string }>;

export const AGENT_STATUS: Vocab = {
  production: { label: 'Production', tone: 'success', help: 'Live for its whole intended audience; held to every SLO and the full agent standard.' },
  pilot: { label: 'Pilot', tone: 'info', help: 'Named pilot users only, with a planned production review.' },
  in_review: { label: 'In review', tone: 'warning', help: 'Waiting on a security, data or production-readiness review.' },
  retired: { label: 'Retired', tone: 'neutral', help: 'Switched off; access removed and data handled per the retirement runbook.' },
};
export const REVIEW_STATUS: Vocab = {
  current: { label: 'Current', tone: 'success', help: 'Next scheduled review is more than 14 days away.' },
  due_soon: { label: 'Due soon', tone: 'warning', help: 'Next scheduled review is within 14 days.' },
  overdue: { label: 'Overdue', tone: 'danger', help: 'The scheduled review date has passed; the standard check fails until it is held.' },
};
export const SLO_STATUS: Vocab = {
  ok: { label: 'Meeting', tone: 'success', help: 'Meeting the objective with at least 25% of the error budget left.' },
  at_risk: { label: 'At risk', tone: 'warning', help: 'Meeting the objective, but less than 25% of the error budget is left.' },
  breached: { label: 'Breached', tone: 'danger', help: 'Missing the objective over the window; the error budget is spent.' },
  no_data: { label: 'No data', tone: 'neutral', help: 'No events in the window to measure. Absence of data is not success.' },
};
export const ALERT_STATUS: Vocab = {
  open: { label: 'Open', tone: 'danger', help: 'Firing and not yet acknowledged by its owner.' },
  acknowledged: { label: 'Acknowledged', tone: 'warning', help: 'An owner is on it. Still firing: acknowledging is not resolving.' },
  resolved: { label: 'Resolved', tone: 'neutral', help: 'The rule stopped firing (or the incident was closed).' },
};
export const CLASSIFICATION: Vocab = {
  internal: { label: 'Internal', tone: 'neutral', help: 'Internal company data; no customer or personal data.' },
  confidential: { label: 'Confidential', tone: 'info', help: 'Customer or commercial data; access scoped to the agent’s function.' },
  restricted: { label: 'Restricted', tone: 'danger', help: 'Regulated or contract data; requires a passed security & data review before production.' },
};

export function Pill({ vocab, value, size }: { vocab: Vocab; value: string; size?: 'sm' }) {
  const v = vocab[value] ?? { label: value, tone: 'neutral' as Tone, help: '' };
  return (
    <span className={`ao-pill ${v.tone}`} title={v.help || undefined} data-help={v.help ? '' : undefined} style={size === 'sm' ? { fontSize: 'var(--fs-micro)' } : undefined}>
      <i aria-hidden="true" />
      {v.label}
      {v.help ? <span className="ao-sr">. {v.help}</span> : null}
    </span>
  );
}
export const AgentStatus = ({ value }: { value: AgentRecord['status'] }) => <Pill vocab={AGENT_STATUS} value={value} />;
export const ReviewPill = ({ value }: { value: ReviewStatus }) => <Pill vocab={REVIEW_STATUS} value={value} />;
export const SloPill = ({ value }: { value: Slo['status'] }) => <Pill vocab={SLO_STATUS} value={value} />;
export const AlertPill = ({ value }: { value: Alert['status'] }) => <Pill vocab={ALERT_STATUS} value={value} />;

// ---------------------------------------------------------------- source chips

const SRC_HELP: Record<DataSource | 'mixed', string> = {
  live: 'Live: real telemetry from Signal Loop and the people using this demo right now.',
  simulated: 'Simulated: seeded six-week history of Invoca-shaped usage. Labelled wherever it appears.',
  mixed: 'Mixed: seeded history plus live telemetry, tagged per row.',
};
export function SourceChip({ source, label }: { source: DataSource | 'mixed'; label?: string }) {
  const cls = source === 'live' ? 'live' : source === 'simulated' ? 'sim' : 'mixed';
  const text = label ?? (source === 'live' ? 'Live' : source === 'simulated' ? 'Simulated' : 'Live + simulated');
  return (
    <span className={`ao-src ${cls}`} title={SRC_HELP[source]}>
      <i aria-hidden="true" />
      {text}
      <span className="ao-sr">. {SRC_HELP[source]}</span>
    </span>
  );
}

// ---------------------------------------------------------------- layout

export function PageHead({ eyebrow, title, sub, meta, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ao-head">
      <div className="ao-head-main">
        {eyebrow ? <span className="ao-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {sub ? <p className="ao-head-sub">{sub}</p> : null}
        {meta ? <div className="ao-head-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ao-head-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  sub,
  source,
  actions,
  children,
  foot,
  flush,
  id,
  className,
  attrs,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  source?: DataSource | 'mixed';
  actions?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  flush?: boolean;
  id?: string;
  className?: string;
  attrs?: Record<string, string>;
}) {
  const hid = useId();
  return (
    <section className={`ao-panel${flush ? ' flush' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={title ? hid : undefined} id={id} {...attrs}>
      {title || actions || source ? (
        <div className="ao-panel-head">
          <div className="ao-panel-title">
            {title ? (
              <h2 id={hid}>
                {title}
                {source ? <SourceChip source={source} /> : null}
              </h2>
            ) : null}
            {sub ? <p>{sub}</p> : null}
          </div>
          {actions ? <div className="ao-panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ao-panel-body">{children}</div>
      {foot ? <div className="ao-panel-foot">{foot}</div> : null}
    </section>
  );
}

export function Callout({ tone = 'neutral', title, children, icon }: { tone?: 'neutral' | 'warning' | 'indigo' | 'live'; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`ao-callout ${tone}`} role="note">
      <span className="ao-callout-icon">{icon ?? (tone === 'warning' ? <IconAlert /> : <IconInfo />)}</span>
      <div>
        {title ? <b>{title}</b> : null} {children}
      </div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="ao-empty">
      <span className="ic" aria-hidden="true">
        {icon ?? <IconInfo />}
      </span>
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ao-error" role="alert">
      <span>
        <b>Couldn’t load this.</b> {message}
      </span>
      {onRetry ? (
        <button type="button" className="ao-btn sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Skel({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="ao-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}
export function PageSkeleton({ kpis = true }: { kpis?: boolean }) {
  return (
    <div className="ao-page" aria-busy="true" aria-label="Loading">
      <div style={{ display: 'grid', gap: 10 }}>
        <Skel h={12} w={120} />
        <Skel h={30} w={320} />
        <Skel h={14} w="60%" />
      </div>
      {kpis ? <Skel h={92} r={8} /> : null}
      <div className="ao-grid g-main">
        <Skel h={300} r={8} />
        <Skel h={300} r={8} />
      </div>
      <Skel h={220} r={8} />
    </div>
  );
}

// ---------------------------------------------------------------- segmented + select

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ao-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- table

export type Col<T> = {
  key: string;
  header: ReactNode;
  num?: boolean;
  sort?: (r: T) => number | string | null;
  render: (r: T) => ReactNode;
  width?: string;
  /** Hide on phones (< 760px): the slimmed-down mobile view keeps only the essentials. */
  mobileHide?: boolean;
};

export function Table<T>({
  rows,
  cols,
  rowKey,
  onRow,
  rowClass,
  defaultSort,
  caption,
  compact,
  className,
  rowAttrs,
  foot,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  rowClass?: (r: T) => string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  caption: string;
  compact?: boolean;
  className?: string;
  rowAttrs?: (r: T) => Record<string, string> | undefined;
  foot?: ReactNode;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, cols, sort]);
  return (
    <div className="ao-table-wrap">
      <table className={`ao-table${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
        <caption className="ao-sr">{caption}</caption>
        <thead>
          <tr>
            {cols.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className={[c.num ? 'num' : '', c.mobileHide ? 'ao-hide-sm' : ''].join(' ').trim() || undefined} style={c.width ? { width: c.width } : undefined} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined} scope="col">
                  {c.sort ? (
                    <button type="button" onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' })}>
                      {c.header}
                      <span aria-hidden="true" style={{ opacity: active ? 1 : 0.3 }}>
                        {active && sort!.dir === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              className={`${onRow ? 'clickable' : ''} ${rowClass?.(r) ?? ''}`.trim() || undefined}
              onClick={onRow ? (e) => {
                if ((e.target as HTMLElement).closest('a,button')) return;
                onRow(r);
              } : undefined}
              onKeyDown={onRow ? (e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) onRow(r);
              } : undefined}
              tabIndex={onRow ? 0 : undefined}
              {...rowAttrs?.(r)}
            >
              {cols.map((c) => (
                <td key={c.key} className={[c.num ? 'num' : '', c.mobileHide ? 'ao-hide-sm' : ''].join(' ').trim() || undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot ? <tfoot>{foot}</tfoot> : null}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- drawer

export function Drawer({ open, onClose, title, sub, children, foot, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; foot?: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  const ret = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    ret.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('button, a[href], input, select, textarea')?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]')];
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      ret.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="ao-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="ao-drawer" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? hid} ref={ref}>
        <div className="ao-drawer-head">
          <div>
            <h2 id={hid}>{title}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="ao-x" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="ao-drawer-body">{children}</div>
        {foot ? <div className="ao-drawer-foot">{foot}</div> : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- small pieces

export function Delta({ value, goodWhen = 'up', suffix }: { value: number | null; goodWhen?: 'up' | 'down'; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="ao-delta flat">—</span>;
  const p = Math.round(value * 100);
  const dir = p === 0 ? 'flat' : (p > 0) === (goodWhen === 'up') ? 'up' : 'down';
  return (
    <span className={`ao-delta ${dir}`}>
      {p > 0 ? '▲' : p < 0 ? '▼' : '■'} {Math.abs(p)}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className="ao-avatar" style={color ? { background: color } : undefined} aria-hidden="true">
      {ini}
    </span>
  );
}

export function AgentDot({ color }: { color: string }) {
  return <span className="ao-dot" style={{ background: color }} aria-hidden="true" />;
}

export function Score({ passed, total }: { passed: number; total: number }) {
  return (
    <span className="ao-score" title={`${passed} of ${total} standard checks pass`}>
      <span className="pips" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < passed ? '' : 'off'} />
        ))}
      </span>
      <span>
        {passed}/{total}
      </span>
    </span>
  );
}

/** Error-budget bar: remaining share of the budget, coloured by SLO status. */
export function BudgetBar({ slo }: { slo: Slo }) {
  const rem = slo.errorBudgetRemaining;
  const w = rem == null ? 0 : Math.max(0, Math.min(1, rem));
  const color = slo.status === 'breached' ? 'var(--cn-danger)' : slo.status === 'at_risk' ? '#B45309' : slo.status === 'ok' ? 'var(--cn-success)' : 'var(--cn-line-ghost)';
  return (
    <div className="ao-budget">
      <div className="ao-budget-track" role="img" aria-label={rem == null ? 'Error budget: no data' : `Error budget remaining ${Math.round(Math.max(rem, 0) * 100)}%`}>
        <span style={{ width: `${w * 100}%`, background: color }} />
      </div>
      <div className="ao-budget-lbl">
        <span>Error budget left</span>
        <b>{rem == null ? '—' : rem < 0 ? 'Exhausted' : `${Math.round(rem * 100)}%`}</b>
      </div>
    </div>
  );
}
