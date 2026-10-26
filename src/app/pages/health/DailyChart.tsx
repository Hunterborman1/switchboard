/**
 * Daily usage chart: one metric at a time on one axis (calls, AI cost or response time), built
 * from HTML columns so labels never clip. A day with nothing recorded is drawn as a gap band,
 * never as zero. Hover or focus a day for every number recorded that day.
 */
import { useState } from 'react';
import { DotLabel } from '../../../ds';
import styles from './Health.module.css';

export type DayPoint = {
  day: string;
  label: string;
  collected: boolean;
  calls: number | null;
  failures: number | null;
  cost: number | null;
  p50: number | null;
  p95: number | null;
};
export type ChartMetric = 'calls' | 'cost' | 'latency';

const seconds = (v: number, digits = 2) => `${(v / 1000).toFixed(digits)} s`;
const usd = (v: number) => (v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);

/** A clean axis: 0 to a round maximum in about four steps. */
function scale(max: number, integer: boolean): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: integer ? 4 : 1, ticks: integer ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { top, ticks };
}

function tickText(metric: ChartMetric, v: number, step: number): string {
  if (metric === 'calls') return v.toLocaleString('en-US');
  if (metric === 'cost') return v === 0 ? '$0' : `$${v.toFixed(step < 0.01 ? 3 : 2)}`;
  return v === 0 ? '0 s' : seconds(v, step < 1000 ? 1 : 0);
}

function peak(days: DayPoint[], metric: ChartMetric): number {
  const vals = days.flatMap((d) => (metric === 'calls' ? [d.calls] : metric === 'cost' ? [d.cost] : [d.p50, d.p95])).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : 0;
}

export function DailyChart({ days, metric, label }: { days: DayPoint[]; metric: ChartMetric; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const { top, ticks } = scale(peak(days, metric), metric === 'calls');
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : top;
  const y = (v: number) => (top > 0 ? (v / top) * 100 : 0);
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const x = (i: number) => ((i + 0.5) / n) * 100;

  // Lines break at gaps: one path segment per run of recorded days.
  const segments = (key: 'p50' | 'p95') => {
    const out: string[] = [];
    let cur: string[] = [];
    days.forEach((d, i) => {
      const v = d[key];
      if (v == null) {
        if (cur.length) out.push(cur.join(' '));
        cur = [];
        return;
      }
      cur.push(`${cur.length ? 'L' : 'M'} ${i + 0.5} ${100 - y(v)}`);
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  };
  /** A point with no recorded neighbour has no line through it: give it a dot so it shows. */
  const isolated = (i: number, key: 'p50' | 'p95') => days[i]![key] != null && days[i - 1]?.[key] == null && days[i + 1]?.[key] == null;

  const hovered = hover != null ? days[hover] : null;

  return (
    <div className={styles.chart} role="group" aria-label={label}>
      <div className={styles.chartArea}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className={styles.yTick} style={{ bottom: `${y(t)}%` }}>
              {tickText(metric, t, step)}
            </span>
          ))}
        </div>
        <div className={styles.plot} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <span key={t} className={styles.gridline} style={{ bottom: `${y(t)}%` }} aria-hidden="true" />
          ))}

          <div className={styles.columns} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {days.map((d, i) => {
              const ok = d.calls != null ? Math.max(0, d.calls - (d.failures ?? 0)) : null;
              const summary = d.collected
                ? `${d.label}: ${d.calls ?? 0} AI calls, ${d.failures ?? 0} failed, ${d.cost != null ? usd(d.cost) : 'cost not recorded'}${d.p50 != null ? `, typical call ${seconds(d.p50)}` : ''}${d.p95 != null ? `, slowest 5% ${seconds(d.p95)}` : ''}`
                : `${d.label}: nothing recorded. Shown as a gap, not $0.`;
              return (
                <div
                  key={d.day}
                  className={`${styles.column} ${d.collected ? (hover === i ? styles.columnActive : '') : hover === i ? styles.columnMissingActive : styles.columnMissing}`}
                  data-testid="daily-column"
                  data-state={d.collected ? 'collected' : 'missing'}
                  tabIndex={0}
                  aria-label={summary}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  {metric === 'calls' && d.collected && ok != null ? (
                    <span className={styles.stack} style={{ height: `${y(d.calls ?? 0)}%` }}>
                      {d.failures ? <span className={styles.segFailed} style={{ flexGrow: d.failures }} /> : null}
                      {ok ? <span className={styles.segOk} style={{ flexGrow: ok }} /> : null}
                    </span>
                  ) : null}
                  {metric === 'cost' && d.cost != null ? <span className={styles.bar} style={{ height: `${y(d.cost)}%` }} /> : null}
                </div>
              );
            })}
          </div>

          {metric === 'latency' ? (
            <>
              <svg className={styles.lines} viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
                {segments('p95').map((p) => (
                  <path key={`p95${p}`} d={p} className={styles.lineP95} vectorEffect="non-scaling-stroke" />
                ))}
                {segments('p50').map((p) => (
                  <path key={`p50${p}`} d={p} className={styles.lineP50} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {days.map((d, i) =>
                (['p95', 'p50'] as const).map((k) =>
                  d[k] != null && (hover === i || isolated(i, k)) ? (
                    <span
                      key={`${d.day}${k}`}
                      className={`${styles.marker} ${k === 'p50' ? styles.markerP50 : styles.markerP95}`}
                      style={{ left: `${x(i)}%`, bottom: `${y(d[k]!)}%` }}
                      aria-hidden="true"
                    />
                  ) : null,
                ),
              )}
            </>
          ) : null}

          {hovered && hover != null ? (
            <div className={`${styles.tip}${x(hover) < 22 ? ` ${styles.tipStart}` : x(hover) > 78 ? ` ${styles.tipEnd}` : ''}`} style={{ left: `${x(hover)}%` }} aria-hidden="true">
              <span className={styles.tipTitle}>{hovered.label}</span>
              {hovered.collected ? (
                <>
                  <TipRow color={metric === 'calls' ? 'var(--chart-1)' : null} name="AI calls" value={(hovered.calls ?? 0).toLocaleString('en-US')} />
                  <TipRow color={metric === 'calls' ? 'var(--danger)' : null} name="Failed" value={(hovered.failures ?? 0).toLocaleString('en-US')} />
                  <TipRow color={metric === 'cost' ? 'var(--chart-1)' : null} name="AI cost" value={hovered.cost != null ? usd(hovered.cost) : '—'} />
                  <TipRow color={metric === 'latency' ? 'var(--chart-1)' : null} name="Typical call" value={hovered.p50 != null ? seconds(hovered.p50) : '—'} />
                  <TipRow color={metric === 'latency' ? 'var(--chart-2)' : null} name="Slowest 5%" value={hovered.p95 != null ? seconds(hovered.p95) : '—'} />
                </>
              ) : (
                <span className={styles.tipNote}>Nothing recorded. A gap, not zero.</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.xAxis} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.day} className={`${styles.xTick}${i % (labelEvery * 2) === 0 ? '' : ` ${styles.xTickMinor}`}`}>
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>

      <div className={styles.legend}>
        {metric === 'calls' ? (
          <>
            <DotLabel color="var(--chart-1)">Succeeded</DotLabel>
            <DotLabel color="var(--danger)">Failed</DotLabel>
          </>
        ) : metric === 'cost' ? (
          <DotLabel color="var(--chart-1)">AI cost</DotLabel>
        ) : (
          <>
            <DotLabel color="var(--chart-1)">Typical call</DotLabel>
            <DotLabel color="var(--chart-2)">Slowest 5% of calls</DotLabel>
          </>
        )}
        {days.some((d) => !d.collected) ? (
          <span className={styles.gapKey}>
            <span className={styles.gapSwatch} aria-hidden="true" />
            Nothing recorded
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TipRow({ color, name, value }: { color: string | null; name: string; value: string }) {
  return (
    <span className={styles.tipRow}>
      <span className={styles.tipSwatch} style={color ? { background: color } : undefined} />
      <span className={styles.tipName}>{name}</span>
      <span className={styles.tipValue}>{value}</span>
    </span>
  );
}
