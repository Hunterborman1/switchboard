/**
 * Data display: table helpers, stats, key/value lists, meters, quotes, callouts, empty states
 * and skeletons.
 */
import type { CSSProperties, ReactNode, ThHTMLAttributes } from 'react';
import { IconAlertCircle, IconAlertTriangle, IconArrowDown, IconArrowUp, IconCheckCircle, IconChevronsUpDown, IconInfo } from './icons';
import { cx, type Tone } from './primitives';

// ---------------------------------------------------------------- table

export function Table({ children, compact, label, className, minWidth }: { children: ReactNode; compact?: boolean; label?: string; className?: string; minWidth?: number }) {
  return (
    <div className="ds-table-wrap">
      <table className={cx('ds-table', compact && 'ds-table--compact', className)} aria-label={label} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export type SortDir = 'asc' | 'desc';

/** A header cell that sorts. `active` is this column's direction when it is the sort key. */
export function SortTh({ children, active, onSort, align, ...rest }: { children: ReactNode; active: SortDir | null; onSort: () => void; align?: 'left' | 'right' } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined} className={align === 'right' ? 'is-num' : undefined} {...rest}>
      <button type="button" className="ds-th-sort" onClick={onSort} aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}>
        {children}
        {active === 'asc' ? <IconArrowUp size={12} /> : active === 'desc' ? <IconArrowDown size={12} /> : <IconChevronsUpDown size={12} style={{ opacity: 0.45 }} />}
      </button>
    </th>
  );
}

/** Two-line cell: a primary line and a quieter secondary line. */
export function CellText({ primary, secondary, mono }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
  return (
    <>
      <span className={cx('ds-table__primary', mono && 'ds-mono')}>{primary}</span>
      {secondary ? <span className="ds-table__secondary">{secondary}</span> : null}
    </>
  );
}

// ---------------------------------------------------------------- stats

export type StatItem = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  delta?: { value: ReactNode; direction: 'up' | 'down'; good?: boolean } | null;
  info?: ReactNode;
  attrs?: Record<string, string>;
};

export function Stats({ items, attrs }: { items: StatItem[]; attrs?: Record<string, string> }) {
  return (
    <div className="ds-stats" style={{ ['--stat-cols' as string]: items.length } as CSSProperties} {...attrs}>
      {items.map((s, i) => (
        <div key={i} className="ds-stat" {...s.attrs}>
          <span className="ds-stat__label">
            {s.label}
            {s.info}
          </span>
          <span className="ds-stat__value">
            {s.value}
            {s.unit ? <span className="ds-stat__unit">{s.unit}</span> : null}
          </span>
          {s.sub || s.delta ? (
            <span className="ds-stat__sub">
              {s.delta ? (
                <span className={(s.delta.good ?? s.delta.direction === 'up') ? 'ds-stat__delta--up' : 'ds-stat__delta--down'}>
                  {s.delta.direction === 'up' ? '+' : '−'}
                  {s.delta.value}
                </span>
              ) : null}
              {s.delta && s.sub ? ' ' : null}
              {s.sub}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- key/value

export function KeyValue({ items, stacked, className }: { items: { label: ReactNode; value: ReactNode }[]; stacked?: boolean; className?: string }) {
  if (stacked) {
    return (
      <dl className={cx('ds-kv', 'ds-kv--stacked', className)}>
        {items.map((it, i) => (
          <div key={i}>
            <dt>{it.label}</dt>
            <dd>{it.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cx('ds-kv', className)}>
      {items.map((it, i) => (
        <KVRow key={i} label={it.label} value={it.value} />
      ))}
    </dl>
  );
}
function KVRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

// ---------------------------------------------------------------- meter

export function Meter({ value, max = 1, tone, label, className }: { value: number; max?: number; tone?: 'accent' | 'warning' | 'danger'; label: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('ds-meter', tone && tone !== 'accent' && `ds-meter--${tone}`, className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className="ds-meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- quote

/** The customer's own words. The one distinctive treatment in the product: always this shape. */
export function Quote({ children, cite, size, variant, attrs }: { children: ReactNode; cite?: ReactNode; size?: 'md' | 'lg'; variant?: 'default' | 'muted' | 'failed'; attrs?: Record<string, string> }) {
  return (
    <blockquote className={cx('ds-quote', size === 'lg' && 'ds-quote--lg', variant && variant !== 'default' && `ds-quote--${variant}`)} {...attrs}>
      {children}
      {cite ? <cite className="ds-quote__cite">{cite}</cite> : null}
    </blockquote>
  );
}

// ---------------------------------------------------------------- callout

const CALLOUT_ICON: Record<Exclude<Tone, 'accent'>, ReactNode> = {
  neutral: <IconInfo />,
  info: <IconInfo />,
  success: <IconCheckCircle />,
  warning: <IconAlertTriangle />,
  danger: <IconAlertCircle />,
};

export function Callout({ tone = 'neutral', title, children, actions, icon, attrs }: { tone?: Exclude<Tone, 'accent'>; title?: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: ReactNode; attrs?: Record<string, string> }) {
  return (
    <div className={cx('ds-callout', tone !== 'neutral' && `ds-callout--${tone}`)} role={tone === 'danger' ? 'alert' : undefined} {...attrs}>
      {icon ?? CALLOUT_ICON[tone]}
      <div className="ds-callout__body">
        {title ? <div className="ds-callout__title">{title}</div> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {actions ? <div className="ds-callout__actions">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- empty state

export function EmptyState({ icon, title, description, actions, compact, attrs }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; compact?: boolean; attrs?: Record<string, string> }) {
  return (
    <div className={cx('ds-empty', compact && 'ds-empty--compact')} {...attrs}>
      {icon ? <span className="ds-empty__icon">{icon}</span> : null}
      <p className="ds-empty__title">{title}</p>
      {description ? <p className="ds-empty__description">{description}</p> : null}
      {actions ? <div className="ds-empty__actions">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- skeleton

export function Skeleton({ width, height = 12, radius, style }: { width?: number | string; height?: number; radius?: number; style?: CSSProperties }) {
  return <span className="ds-skel" style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

/** Placeholder shaped like a card with a table inside; used while a page's first load runs. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="ds-card" aria-busy="true" aria-label="Loading">
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', borderRadius: '8px 8px 0 0' }}>
        <Skeleton width="30%" height={10} />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${cols - 1}, 1fr)`, gap: 24, padding: '16px 20px', borderBottom: r < rows - 1 ? '1px solid var(--border-row)' : 0 }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} width={c === 0 ? '70%' : '50%'} height={10} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="ds-page" aria-busy="true" aria-label="Loading page">
      <div className="ds-stack" style={{ gap: 10 }}>
        <Skeleton width={220} height={24} />
        <Skeleton width={360} height={12} />
      </div>
      <TableSkeleton />
    </div>
  );
}
