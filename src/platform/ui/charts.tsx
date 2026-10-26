/**
 * Agent Ops charts (Recharts and plain SVG) on the design system's tokens: flat fills from
 * --chart-1…6 (colour follows the agent, never its rank), a recessive --chart-grid, 12px axis
 * text in --text-tertiary, one y-axis, thin marks with a surface gap between stacked fills,
 * a hover tooltip on every chart and missing data drawn as a gap, never as zero. Legends are
 * DotLabels above the plot; nothing is labelled inside the plot, so nothing can overlap a
 * mark. Every chart sits next to a one-line text summary (ChartSummary).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DotLabel, Meter } from '../../ds';

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

const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: 'var(--text-tertiary)' } } as const;
const GRID = <CartesianGrid vertical={false} stroke="var(--chart-grid)" />;
const ANIM_MS = 400;

/** True for a moment after mount: charts reveal once, never on every poll. */
export function useAnimateOnce(): boolean {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(!reduced);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(false), ANIM_MS + 800);
    return () => window.clearTimeout(t);
  }, [on]);
  return on && !reduced;
}

// ---------------------------------------------------------------- tooltip, legend, summary

type TipRow = { label: string; value: string; color?: string };
export function ChartTip({ title, rows, note }: { title: ReactNode; rows: TipRow[]; note?: ReactNode }) {
  return (
    <div className="ao-chart-tip">
      <div className="ao-chart-tip__title">{title}</div>
      {rows.map((r) => (
        <div className="ao-chart-tip__row" key={r.label}>
          <span className="ao-chart-tip__label">
            {r.color ? <span className="ao-agent-dot" style={{ background: r.color }} aria-hidden="true" /> : null}
            {r.label}
          </span>
          <span className="ao-chart-tip__value">{r.value}</span>
        </div>
      ))}
      {note ? <div className="ao-chart-tip__note">{note}</div> : null}
    </div>
  );
}

export type Series = { key: string; label: string; color: string };
type TipProps = { active?: boolean; payload?: readonly { payload?: Record<string, unknown> }[]; label?: string | number };

/** Marks that are not series: a reference line, a target, a breach dot. */
export type LegendMark = { kind: 'boundary' | 'target' | 'breach'; label: string };

export function ChartLegend({ series, marks = [] }: { series: Series[]; marks?: LegendMark[] }) {
  return (
    <div className="ao-legend">
      {series.map((s) => (
        <DotLabel key={s.key} color={s.color} className="ao-legend__item">
          {s.label}
        </DotLabel>
      ))}
      {marks.map((m) => (
        <span key={m.label} className="ao-legend__item">
          <span className={m.kind === 'boundary' ? 'ao-legend__vline' : m.kind === 'target' ? 'ao-legend__line ao-legend__line--dashed' : 'ao-legend__ring'} aria-hidden="true" />
          {m.label}
        </span>
      ))}
    </div>
  );
}

/** The one-line reading of a chart, for everyone (and the screen-reader equivalent of the plot). */
export function ChartSummary({ children }: { children: ReactNode }) {
  return <p className="ao-chart-summary">{children}</p>;
}

// ---------------------------------------------------------------- stacked bars

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
  boundary,
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
  /** A dashed vertical line at the start of this x bucket (between bars, never through one). */
  boundary?: string | null;
  ariaLabel: string;
}) {
  const animate = useAnimateOnce();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={16} tickMargin={8} />
          <YAxis {...AXIS} width={48} tickFormatter={(v: number) => yFormat(v)} />
          <Tooltip
            cursor={{ fill: 'var(--bg-muted)', opacity: 0.6 }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return <ChartTip title={tipTitle(row)} rows={series.map((s) => ({ label: s.label, value: tipValue((row[s.key] as number | null | undefined) ?? null), color: s.color }))} note={tipNote?.(row)} />;
            }}
          />
          {boundary ? <ReferenceLine x={boundary} position="start" stroke="var(--text-tertiary)" strokeDasharray="3 3" strokeWidth={1} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={s.color}
              stroke="var(--bg)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              isAnimationActive={animate}
              animationDuration={ANIM_MS}
              animationEasing="ease-out"
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------- lines

/** Lines over time with gaps for nulls, an optional dashed target and breach markers. */
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
  ariaLabel,
  yDomain,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: Series[];
  height?: number;
  yFormat: (v: number) => string;
  tipTitle: (row: Record<string, unknown>) => ReactNode;
  tipValue: (key: string, v: number | null) => string;
  target?: number | null;
  breaches?: { x: string; y: number }[];
  ariaLabel: string;
  yDomain?: [number | 'auto', number | 'auto'];
}) {
  const animate = useAnimateOnce();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={32} tickMargin={8} padding={{ left: 8, right: 8 }} />
          <YAxis {...AXIS} width={52} tickFormatter={(v: number) => yFormat(v)} domain={yDomain ?? [0, 'auto']} />
          {target != null ? <ReferenceLine y={target} stroke="var(--text-secondary)" strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain" /> : null}
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return <ChartTip title={tipTitle(row)} rows={series.map((s) => ({ label: s.label, value: tipValue(s.key, (row[s.key] as number | null | undefined) ?? null), color: s.color }))} />;
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg)' }}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={ANIM_MS}
              animationEasing="ease-out"
            />
          ))}
          {breaches?.map((b, i) => <ReferenceDot key={`${b.x}-${i}`} x={b.x} y={b.y} r={4} fill="var(--danger)" stroke="var(--bg)" strokeWidth={2} ifOverflow="extendDomain" />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------- bars

/** One series of bars (optionally with an error segment stacked on top). Nulls are gaps. */
export function Bars({
  data,
  x,
  y,
  color,
  height = 200,
  yFormat,
  tipTitle,
  tipRows,
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
  ariaLabel: string;
  errorKey?: string;
}) {
  const animate = useAnimateOnce();
  return (
    <div className="ao-chart" role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          {GRID}
          <XAxis dataKey={x} {...AXIS} interval="preserveStartEnd" minTickGap={28} tickMargin={8} />
          <YAxis {...AXIS} width={44} tickFormatter={(v: number) => yFormat(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--bg-muted)', opacity: 0.6 }}
            content={(p: TipProps) => {
              const row = p.payload?.[0]?.payload;
              if (!p.active || !row) return null;
              return <ChartTip title={tipTitle(row)} rows={tipRows(row)} />;
            }}
          />
          <Bar dataKey={y} stackId="s" fill={color} radius={errorKey ? [0, 0, 0, 0] : [3, 3, 0, 0]} isAnimationActive={animate} animationDuration={ANIM_MS} animationEasing="ease-out" maxBarSize={20} stroke="var(--bg)" strokeWidth={errorKey ? 1 : 0} />
          {errorKey ? <Bar dataKey={errorKey} stackId="s" fill="var(--danger)" radius={[3, 3, 0, 0]} isAnimationActive={animate} animationDuration={ANIM_MS} animationEasing="ease-out" maxBarSize={20} stroke="var(--bg)" strokeWidth={1} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

/** Sequential single hue: the accent, light to dark, by the square root of the share of the busiest hour. */
function heatShade(v: number, max: number): string {
  if (!v) return 'var(--bg-muted)';
  const t = 0.14 + 0.86 * Math.sqrt(v / max);
  return `color-mix(in srgb, var(--accent-pressed) ${Math.round(t * 100)}%, var(--accent-subtle))`;
}
const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

/** Weekday × hour heatmap. Each cell names its count on hover and to screen readers. */
export function Heatmap({ cells, tzLabel, rowLabels }: { cells: { weekday: number; hour: number; events: number }[]; tzLabel: string; rowLabels: string[] }) {
  const max = Math.max(1, ...cells.map((c) => c.events));
  const grid = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.events]));
  return (
    <div className="ao-heat-wrap">
      <div className="ao-heat" role="grid" aria-label={`Activity by weekday and hour, ${tzLabel}`}>
        <div role="row" style={{ display: 'contents' }}>
          <span role="columnheader" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="ao-heat__hour" role="columnheader" aria-label={`${String(h).padStart(2, '0')}:00`}>
              {h % 3 === 0 ? hourLabel(h) : ''}
            </span>
          ))}
        </div>
        {rowLabels.map((lbl, d) => (
          <div key={lbl} role="row" style={{ display: 'contents' }}>
            <span className="ao-heat__day" role="rowheader">
              {lbl}
            </span>
            {Array.from({ length: 24 }, (_, h) => {
              const v = grid.get(`${d}:${h}`) ?? 0;
              const hh = `${String(h).padStart(2, '0')}:00`;
              return <span key={h} className="ao-heat__cell" role="gridcell" style={{ background: heatShade(v, max) }} title={`${lbl} ${hh}, ${tzLabel}: ${v} action${v === 1 ? '' : 's'}`} aria-label={`${lbl} ${hh}: ${v} action${v === 1 ? '' : 's'}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="ao-heat-scale" aria-hidden="true">
        <span>Fewer</span>
        {[0, 0.08, 0.25, 0.5, 0.75, 1].map((t) => (
          <span key={t} className="ao-heat-scale__swatch" style={{ background: heatShade(t === 0 ? 0 : t * max, max) }} />
        ))}
        <span>More actions</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bar list

/** Ranked horizontal bars: label, meter, value. */
export function BarList({ rows, format, label }: { rows: { label: string; value: number; sub?: string }[]; format: (v: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="ao-barlist" aria-label={label}>
      {rows.map((r) => (
        <li className="ao-barlist__row" key={r.label}>
          <span className="ao-barlist__label" title={r.label}>
            {r.label}
          </span>
          <Meter value={r.value} max={max} label={`${r.label}: ${format(r.value)}`} />
          <span className="ao-barlist__value">
            {format(r.value)}
            {r.sub ? <span className="ao-barlist__sub"> {r.sub}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- sparkline

/** Inline sparkline; nulls break the line (a gap, not a zero). */
export function Spark({ values, color, width = 88, height = 24, label }: { values: (number | null)[]; color: string; width?: number; height?: number; label: string }) {
  const nums = values.filter((v): v is number => v != null);
  const max = Math.max(1e-9, ...nums);
  const min = Math.min(0, ...nums);
  const step = values.length > 1 ? (width - 6) / (values.length - 1) : 0;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 7);
  const segs: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v == null) {
      if (cur) segs.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${(3 + i * step).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
  return (
    <svg className="ao-spark" width={width} height={height} role="img" aria-label={`${label}: ${values.map((v) => (v == null ? 'no data' : Math.round(v * 10) / 10)).join(', ')}`}>
      <line x1="0" x2={width} y1={height - 3} y2={height - 3} stroke="var(--border-row)" />
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {lastIdx != null ? <circle cx={3 + lastIdx * step} cy={y(values[lastIdx]!)} r={2.5} fill={color} stroke="var(--bg)" strokeWidth={1.5} /> : null}
    </svg>
  );
}
