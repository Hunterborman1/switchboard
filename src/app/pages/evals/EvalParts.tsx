import type { EvalRun } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';
import { RateWithDenominator } from '../../../uis/RateWithDenominator';
import { StatusChip } from '../../../uis/StatusChip';
import { Hint } from '../../components/Hint';
import { TYPE_COLOR, TYPE_LABEL } from '../../lib/labels';
import { metricPct } from '../../../shared/format';
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

/**
 * One horizontal bar 0–100%. Per-type metrics carry no gate threshold of their own: the
 * dashed tick is the pooled promotion-gate level, drawn as a reference target. A bar under it
 * is tinted amber ("under target"), never red, because nothing per type is gated.
 */
function Bar({ m, series, target }: { m: Metric | null; series: 'precision' | 'recall'; target: number | null }) {
  const v = m?.value ?? null;
  const t = m?.threshold ?? null;
  const fail = passed(m) === false;
  const under = !fail && t == null && target != null && v != null && v < target;
  const word = series === 'precision' ? 'Precision' : 'Recall';
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>{word}</span>
      <div
        className={styles.barTrack}
        role="img"
        aria-label={`${word} ${v == null ? 'not measured' : metricPct(m)}${t != null ? `, gate threshold ${(t * 100).toFixed(0)}%` : target != null ? `, reference target ${(target * 100).toFixed(0)}% (not gated)${under ? ', under target' : ''}` : ''}`}
      >
        {v != null ? <span className={`${styles.barFill} ${series === 'recall' ? styles.barRecall : ''} ${fail ? styles.barFail : under ? styles.barUnder : ''}`} style={{ width: `${(v * 100).toFixed(1)}%` }} /> : null}
        {t != null ? <span className={styles.barThreshold} style={{ left: `${(t * 100).toFixed(1)}%` }} title={`gate threshold ${(t * 100).toFixed(0)}%`} /> : null}
        {t == null && target != null ? <span className={styles.barTarget} style={{ left: `${(target * 100).toFixed(1)}%` }} title={`reference: the pooled gate is ${(target * 100).toFixed(0)}%. Per-type values are reported, not gated.`} /> : null}
      </div>
      <span className={`${styles.barValue} ${fail ? styles.textFail : under ? styles.textUnder : ''}`}>
        {m ? <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" variant="split" /> : '—'}
      </span>
    </div>
  );
}

export function TypeBars({ run }: { run: EvalRun }) {
  // The gate applies to pooled precision and recall; per type, those levels are only a reference.
  const pT = metric(run, 'precision')?.threshold ?? 0.85;
  const rT = metric(run, 'recall')?.threshold ?? 0.8;
  const under = INSIGHT_TYPES.filter((t) => {
    const p = metric(run, `precision.${t}`);
    return p?.value != null && p.threshold == null && p.value < pT;
  });
  return (
    <div className={styles.typeBars}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.legendP} /> Precision
        </span>
        <span>
          <i className={styles.legendR} /> Recall
        </span>
        <span>
          <i className={styles.legendU} /> Under target
        </span>
        <span>
          <i className={styles.legendTarget} /> Pooled gate level ({(pT * 100).toFixed(0)}% / {(rT * 100).toFixed(0)}%), reference only
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
            <Bar m={p} series="precision" target={pT} />
            <Bar m={r} series="recall" target={rT} />
          </div>
        );
      })}
      <p className="sl-caption" data-testid="type-gate-note">
        The promotion gate checks pooled precision (≥ {(pT * 100).toFixed(0)}%) and recall (≥ {(rT * 100).toFixed(0)}%) across all types, not each type. Per-type numbers are reported against those levels as targets.
        {under.length
          ? ` Under target today: ${under.map((t) => TYPE_LABEL[t].toLowerCase()).join(', ')}. Churn risk is always human-reviewed; next is per-type auto-route thresholds and more labelled examples for these types.`
          : ''}
      </p>
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
          {(['precision', 'recall'] as const)
            // A run recorded before per-level precision existed shows recall only, not a row of gaps.
            .filter((kind) => LEVELS.some((l) => metric(run, `${kind}.level${l.n}`)?.denominator != null))
            .map((kind) => (
            <tr key={kind}>
              <th scope="row">{kind === 'precision' ? 'Precision' : 'Recall'}</th>
              {LEVELS.map((l) => {
                const m = metric(run, `${kind}.level${l.n}`);
                const p = passed(m);
                return (
                  <td key={l.n} className={p === false ? styles.cellFail : p ? styles.cellPass : ''}>
                    <span className={styles.cellPct}>{m?.value == null ? '—' : metricPct(m)}</span>
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
        Precision is matched insights over everything extracted at that level; recall is planted insights found. Only level-5 recall has its own gate rule, so only it is tinted (green passes, red does not). Each level has 8 golden files.
      </p>
    </div>
  );
}

export function MetricCard({ m, title, note }: { m: Metric | null; title: string; note: string }) {
  const lower = m ? ['negative_fp_rate', 'phi_leakage'].includes(m.key) : false;
  if (m && m.denominator == null && m.numerator != null) {
    // A count with no denominator (quotes dropped by grounding): show the count, never a %.
    return (
      <div className={styles.metricCard}>
        <span className="sl-eyebrow">{title}</span>
        <span className={styles.metricTop}>
          <span className={styles.metricBig}>{m.numerator}</span>
          <PassChip m={m} />
        </span>
        <span className="sl-meta">
          {m.numerator} {unitFor(m.key)} across the golden set
        </span>
        <span className="sl-caption">{note}</span>
      </div>
    );
  }
  return (
    <div className={`${styles.metricCard} ${passed(m) === false ? styles.metricFail : ''}`}>
      <span className="sl-eyebrow">{title}</span>
      <span className={styles.metricTop}>
        <span className={styles.metricBig}>{m?.value == null ? '—' : metricPct(m, m.value === 0 || m.value === 1 ? 0 : 1)}</span>
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
