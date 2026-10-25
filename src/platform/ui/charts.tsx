/**
 * Agent Ops charts (Recharts). Conventions: one y-axis, thin marks, 4px rounded data ends,
 * a 2px surface gap between stacked fills, recessive grid, tabular numbers, a hover tooltip
 * on every chart, and missing data drawn as a gap, never as zero. Colour follows the agent.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(window.location.search).get('motion') === 'reduced';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setR(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return r;
}

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const;
const GRID = <CartesianGrid vertical={false} stroke="rgba(27,31,30,0.08)" />;

type TipRow = { label: string; value: string; color?: string; dash?: boolean };
export function Tip({ title, rows, note }: { title: ReactNode; rows: TipRow[]; note?: ReactNode }) {
  return (
    <div className="ao-tip">
      <div className="ao-tip-title">{title}</div>
      {rows.map((r) => (
        <div className="ao-tip-row" key={r.label}>
          <span>
            {r.color ? <i className="ao-dot" style={{ background: r.color, width: 8, height: 8, borderRadius: 2 }} /> : null}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
      {note ? <div className="ao-tip-note">{note}</div> : null}
    </div>
  );
}

export type Series = { key: string; label: string; color: string };
type TipProps = { active?: boolean; payload?: readonly { payload?: Record<string, unknown> }[]; label?: string | number };

export function Legend({ series, extra }: { series: Series[]; extra?: ReactNode }) {
  return (
    <div className="ao-legend" aria-hidden="true">
      {series.map((s) => (
        <span key={s.key}>
          <i className="sw" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
      {extra}
    </div>
  );
}

/** Stacked bars, one stack per x bucket. Null values are absent (a gap), not zero. */
export function StackedBars({
  data,
  x,
  series,
  height = 260,
  yFormat,
  tipTitle,
  tipValue,
  tipNote,
  marker,
  ariaLabel,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: Series[];
  height?: number;
  yFormat: (v: number) => string;
  tipTitle: (row: Record<string, unknown>) => ReactNode;
  tipValue: (v: number | null) => string;
  tipNote?: (row: Record<string, unknown>) => ReactNode;
  marker?: { x: string; label: string } | null;
  ariaLabel: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...AXIS} width={44} tickFormatter={(v: number) => yFormat(v)} />
          <Tooltip
            cursor={{ fill: 'rgba(16,42,86,0.05)' }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return (
                <Tip
                  title={tipTitle(row)}
                  rows={series.map((s) => ({ label: s.label, value: tipValue((row[s.key] as number | null | undefined) ?? null), color: s.color }))}
                  note={tipNote?.(row)}
                />
              );
            }}
          />
          {marker ? <ReferenceLine x={marker.x} stroke="#102A56" strokeDasharray="3 3" label={{ value: marker.label, position: 'insideTopRight', fontSize: 10, fill: '#4E5653' }} /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={2} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} isAnimationActive={!reduced} maxBarSize={56} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Lines over time with gaps for nulls, an optional target line and breach markers. */
export function Lines({
  data,
  x,
  series,
  height = 220,
  yFormat,
  tipTitle,
  tipValue,
  target,
  breaches,
  shade,
  xFormat,
  ariaLabel,
  yDomain,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: (Series & { dash?: boolean })[];
  height?: number;
  yFormat: (v: number) => string;
  tipTitle: (row: Record<string, unknown>) => ReactNode;
  tipValue: (key: string, v: number | null) => string;
  target?: { value: number; label: string } | null;
  breaches?: { x: string; y: number; label: string }[];
  shade?: { x1: string; x2: string; label: string }[];
  xFormat?: (v: string) => string;
  ariaLabel: string;
  yDomain?: [number | 'auto', number | 'auto'];
}) {
  const reduced = useReducedMotion();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={28} tickFormatter={xFormat} />
          <YAxis {...AXIS} width={52} tickFormatter={(v: number) => yFormat(v)} domain={yDomain ?? [0, 'auto']} />
          {shade?.map((s) => <ReferenceArea key={s.x1} x1={s.x1} x2={s.x2} fill="rgba(207,37,25,0.07)" stroke="none" label={{ value: s.label, position: 'insideTop', fontSize: 10, fill: '#A81E14' }} />)}
          {target ? <ReferenceLine y={target.value} stroke="#A81E14" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: target.label, position: 'insideTopRight', fontSize: 10, fill: '#A81E14' }} /> : null}
          <Tooltip
            cursor={{ stroke: '#102A56', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return <Tip title={tipTitle(row)} rows={series.map((s) => ({ label: s.label, value: tipValue(s.key, (row[s.key] as number | null | undefined) ?? null), color: s.color }))} />;
            }}
          />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash ? '5 4' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} isAnimationActive={!reduced} />
          ))}
          {breaches?.map((b, i) => <ReferenceDot key={`${b.x}-${i}`} x={b.x} y={b.y} r={5} fill="#CF2519" stroke="#fff" strokeWidth={2} ifOverflow="extendDomain" />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple bars (one series) with nulls as gaps. */
export function Bars({
  data,
  x,
  y,
  color,
  height = 200,
  yFormat,
  tipTitle,
  tipRows,
  xFormat,
  ariaLabel,
  errorKey,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  color: string;
  height?: number;
  yFormat: (v: number) => string;
  tipTitle: (row: Record<string, unknown>) => ReactNode;
  tipRows: (row: Record<string, unknown>) => TipRow[];
  xFormat?: (v: string) => string;
  ariaLabel: string;
  errorKey?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={24} tickFormatter={xFormat} />
          <YAxis {...AXIS} width={44} tickFormatter={(v: number) => yFormat(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(16,42,86,0.05)' }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return <Tip title={tipTitle(row)} rows={tipRows(row)} />;
            }}
          />
          <Bar dataKey={y} stackId="s" fill={color} radius={errorKey ? [0, 0, 0, 0] : [3, 3, 0, 0]} isAnimationActive={!reduced} maxBarSize={22} stroke="#fff" strokeWidth={errorKey ? 1 : 0} />
          {errorKey ? <Bar dataKey={errorKey} stackId="s" fill="#CF2519" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} maxBarSize={22} stroke="#fff" strokeWidth={1} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekday × hour heatmap (single-hue sequential, light → dark indigo). */
export function Heatmap({ cells, tzLabel, rowLabels }: { cells: { weekday: number; hour: number; events: number }[]; tzLabel: string; rowLabels: string[] }) {
  const max = Math.max(1, ...cells.map((c) => c.events));
  const grid = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.events]));
  const shade = (v: number) => {
    if (!v) return '#F1F2F7';
    const t = 0.15 + 0.85 * Math.sqrt(v / max);
    // indigo ramp from #E3E7FB to #26357F
    const a = [227, 231, 251];
    const b = [38, 53, 127];
    const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="ao-heat" role="grid" aria-label={`Usage events by weekday and hour (${tzLabel})`}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hl" aria-hidden="true">
            {h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}
          </span>
        ))}
        {rowLabels.map((lbl, d) => (
          <RowCells key={lbl} label={lbl} d={d} grid={grid} shade={shade} tz={tzLabel} />
        ))}
      </div>
      <div className="ao-scale" style={{ marginTop: 10 }}>
        <span>Fewer</span>
        {[0, 0.1, 0.3, 0.55, 0.8, 1].map((t) => (
          <i key={t} style={{ background: t === 0 ? '#F1F2F7' : shade(Math.max(1, t * max)) }} />
        ))}
        <span>More events · hours in {tzLabel}</span>
      </div>
    </div>
  );
}
function RowCells({ label, d, grid, shade, tz }: { label: string; d: number; grid: Map<string, number>; shade: (v: number) => string; tz: string }) {
  return (
    <>
      <span className="rl" role="rowheader">
        {label}
      </span>
      {Array.from({ length: 24 }, (_, h) => {
        const v = grid.get(`${d}:${h}`) ?? 0;
        const hh = `${String(h).padStart(2, '0')}:00`;
        return <span key={h} className="c" role="gridcell" tabIndex={-1} style={{ background: shade(v) }} title={`${label} ${hh} ${tz}: ${v} event${v === 1 ? '' : 's'}`} aria-label={`${label} ${hh}: ${v} events`} />;
      })}
    </>
  );
}

export function BarList({ rows, color = 'var(--ao-indigo)', format }: { rows: { label: string; value: number; sub?: string }[]; color?: string; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="ao-barlist">
      {rows.map((r) => (
        <div className="ao-barlist-row" key={r.label}>
          <span className="l" title={r.label}>
            {r.label}
          </span>
          <span className="t" aria-hidden="true">
            <span style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="n">
            {format(r.value)}
            {r.sub ? <span className="ao-muted"> · {r.sub}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Inline line sparkline; nulls break the line (a gap, not a zero). */
export function Spark({ values, color, width = 96, height = 26, label }: { values: (number | null)[]; color: string; width?: number; height?: number; label: string }) {
  const nums = values.filter((v): v is number => v != null);
  const max = Math.max(1e-9, ...nums);
  const min = Math.min(0, ...nums);
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const segs: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v == null) {
      if (cur) segs.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${(2 + i * step).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}: ${values.map((v) => (v == null ? 'no data' : Math.round(v * 10) / 10)).join(', ')}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1="0" x2={width} y1={height - 3} y2={height - 3} stroke="rgba(27,31,30,0.1)" />
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {lastIdx != null ? <circle cx={2 + lastIdx * step} cy={y(values[lastIdx]!)} r={2.6} fill={color} stroke="#fff" strokeWidth={1.5} /> : null}
    </svg>
  );
}
