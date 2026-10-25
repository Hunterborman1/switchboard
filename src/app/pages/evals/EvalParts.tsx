import type { EvalRun } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';
import { RateWithDenominator } from '../../../uis/RateWithDenominator';
import { StatusChip } from '../../../uis/StatusChip';
import { Hint } from '../../components/Hint';
import { TYPE_COLOR, TYPE_LABEL } from '../../lib/labels';
import { LEVELS, metric, passed, thresholdLabel, unitFor, type Metric } from './evalModel';
import styles from './Evals.module.css';

export function PassChip({ m }: { m: Metric | null }) {
  const p = passed(m);
  if (p == null) {
    return (
      <StatusChip tone="neutral" size="sm">
        no threshold
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={p ? 'success' : 'danger'} size="sm">
      {p ? 'pass' : 'below threshold'}
    </StatusChip>
  );
}

/** One horizontal bar 0–100% with the threshold tick drawn on it. */
function Bar({ m, series }: { m: Metric | null; series: 'precision' | 'recall' }) {
  const v = m?.value ?? null;
  const t = m?.threshold ?? null;
  const fail = passed(m) === false;
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>{series === 'precision' ? 'Precision' : 'Recall'}</span>
      <div className={styles.barTrack} role="img" aria-label={`${series} ${v == null ? 'not measured' : `${(v * 100).toFixed(1)}%`}, threshold ${t == null ? 'none' : `${(t * 100).toFixed(0)}%`}`}>
        {v != null ? <span className={`${styles.barFill} ${series === 'recall' ? styles.barRecall : ''} ${fail ? styles.barFail : ''}`} style={{ width: `${(v * 100).toFixed(1)}%` }} /> : null}
        {t != null ? <span className={styles.barThreshold} style={{ left: `${(t * 100).toFixed(1)}%` }} title={`threshold ${(t * 100).toFixed(0)}%`} /> : null}
      </div>
      <span className={`${styles.barValue} ${fail ? styles.textFail : ''}`}>
        {m ? <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" variant="split" /> : '—'}
      </span>
    </div>
  );
}

export function TypeBars({ run }: { run: EvalRun }) {
  return (
    <div className={styles.typeBars}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.legendP} /> Precision (≥ 85%)
        </span>
        <span>
          <i className={styles.legendR} /> Recall (≥ 80%)
        </span>
        <span>
          <i className={styles.legendT} /> Threshold
        </span>
      </div>
      {INSIGHT_TYPES.map((t) => {
        const p = metric(run, `precision.${t}`);
        const r = metric(run, `recall.${t}`);
        return (
          <div key={t} className={styles.typeBlock}>
            <span className="sl-type">
              <i style={{ background: TYPE_COLOR[t] }} aria-hidden="true" />
              {TYPE_LABEL[t]}
            </span>
            <Bar m={p} series="precision" />
            <Bar m={r} series="recall" />
          </div>
        );
      })}
    </div>
  );
}

export function LevelHeatmap({ run }: { run: EvalRun }) {
  return (
    <div className="sl-scroll-x">
      <table className={styles.heat}>
        <caption className="sl-sr-only">Precision and recall per mess level</caption>
        <thead>
          <tr>
            <th scope="col" />
            {LEVELS.map((l) => (
              <th key={l.n} scope="col">
                <Hint label={l.hint}>
                  <span tabIndex={0} className={styles.heatHead}>
                    <span className="sl-mono">L{l.n}</span>
                    <span>{l.label}</span>
                  </span>
                </Hint>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['precision', 'recall'] as const).map((kind) => (
            <tr key={kind}>
              <th scope="row">{kind === 'precision' ? 'Precision' : 'Recall'}</th>
              {LEVELS.map((l) => {
                const m = metric(run, `${kind}.level${l.n}`);
                const p = passed(m);
                return (
                  <td key={l.n} className={p === false ? styles.cellFail : p ? styles.cellPass : ''}>
                    <span className={styles.cellPct}>{m?.value == null ? '—' : `${(m.value * 100).toFixed(1)}%`}</span>
                    <span className={styles.cellDen}>{m?.numerator != null ? `${m.numerator} / ${m.denominator}` : 'no data'}</span>
                    <span className={styles.cellBar} aria-hidden="true">
                      <span style={{ width: `${((m?.value ?? 0) * 100).toFixed(1)}%` }} />
                    </span>
                    {p === false ? <span className="sl-sr-only">below threshold</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sl-caption" style={{ marginTop: 8 }}>
        Tinted cells are the only colour on this grid: green passes its threshold (precision ≥ 85%, recall ≥ 80%), red does not. Each level has 8 golden files with planted insights.
      </p>
    </div>
  );
}

export function MetricCard({ m, title, note }: { m: Metric | null; title: string; note: string }) {
  const lower = m ? ['negative_fp_rate', 'phi_leakage'].includes(m.key) : false;
  return (
    <div className={`${styles.metricCard} ${passed(m) === false ? styles.metricFail : ''}`}>
      <span className="sl-eyebrow">{title}</span>
      <span className={styles.metricTop}>
        <span className={styles.metricBig}>{m?.value == null ? '—' : `${(m.value * 100).toFixed(m.value === 0 || m.value === 1 ? 0 : 1)}%`}</span>
        <PassChip m={m} />
      </span>
      <span className="sl-meta">
        {m ? <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit={unitFor(m.key)} /> : 'not measured'}
      </span>
      <span className="sl-caption">
        {m ? `${thresholdLabel(m)}${lower ? ' (lower is better)' : ''}` : ''} · {note}
      </span>
    </div>
  );
}
