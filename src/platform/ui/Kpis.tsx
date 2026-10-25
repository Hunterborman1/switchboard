/**
 * KPI strip for Agent Ops: one bordered card, N metrics separated by hairlines. Sentence-case
 * labels, Inter tabular numbers, an optional plain-English definition behind an info button.
 */
import type { CSSProperties, ReactNode } from 'react';
import { InfoTip } from './InfoTip';

export type Metric = {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  /** Precise definition, shown in a tooltip next to the label. */
  help?: ReactNode;
  accent?: string;
};

export function MetricStrip({ items, label, size, minItemWidth, columns }: { items: Metric[]; label: string; size?: 'lg'; minItemWidth?: number; columns?: number }) {
  const style = { '--n': columns ?? items.length, '--min': `${minItemWidth ?? 160}px` } as CSSProperties;
  return (
    <div className={`ao-kpis${size === 'lg' ? ' lg' : ''}${minItemWidth ? ' wrap' : ''}`} role="group" aria-label={label} style={style}>
      {items.map((it) => (
        <div className="ao-kpi" key={it.label}>
          <span className="ao-kpi-label">
            <span>{it.label}</span>
            {it.help ? <InfoTip label={it.label}>{it.help}</InfoTip> : null}
          </span>
          <span className="ao-kpi-value" style={it.accent ? { color: it.accent } : undefined}>
            {it.value}
            {it.unit ? <span className="ao-kpi-unit">{it.unit}</span> : null}
          </span>
          {it.sub ? <span className="ao-kpi-sub">{it.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}
