/**
 * Quality page parts: accuracy by insight type, the mess-level heat table, the safety checks
 * and the candidate comparison. Every rate shows its counts ("125 of 141").
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { EvalRun } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';
import { metricPct, ptsText, rateOf } from '../../../shared/format';
import { Badge, Button, DotLabel, Table, Tooltip, type Tone } from '../../../ds';
import { IconAlertTriangle, IconCheck, IconX } from '../../../ds/icons';
import { TypeLabel } from '../../components/domain';
import { money, ms } from '../../lib/labels';
import { LEVELS, LOWER_IS_BETTER, metric, metricLabel, passed, pooledMetric, thresholdLabel, unitFor, ver, type Metric } from './evalModel';
import styles from './Evals.module.css';

const counts = (m: Metric | null) => (m?.numerator != null && m.denominator != null ? `${m.numerator} of ${m.denominator}` : null);

/** A rate as a bar with the reference target as a tick, the percent and its counts. */
function RateBar({ m, target, series, name }: { m: Metric | null; target: number | null; series: 'precision' | 'recall'; name: string }) {
  const v = rateOf(m);
  const under = v != null && target != null && v < target;
  return (
    <div className={styles.rate} data-testid="rate">
      <span
        className={styles.rateTrack}
        role="img"
        aria-label={`${name}: ${v == null ? 'not measured' : `${metricPct(m)}, ${counts(m) ?? ''}`}${target != null ? `. Reference target ${(target * 100).toFixed(0)}%${under ? ', below it' : ''}` : ''}`}
      >
        {v != null ? <span className={`${styles.rateFill} ${series === 'recall' ? styles.rateFillRecall : styles.rateFillPrecision}`} style={{ width: `${(v * 100).toFixed(1)}%` }} /> : null}
        {target != null ? <span className={styles.rateTarget} style={{ left: `${(target * 100).toFixed(1)}%` }} /> : null}
      </span>
      <span className={styles.rateNumbers}>
        <span className={styles.rateValue}>
          {under ? <IconAlertTriangle size={12} className={styles.rateWarn} aria-hidden="true" /> : null}
          {v == null ? '—' : metricPct(m)}
        </span>
        <span className={styles.rateCount}>{counts(m) ?? 'No data'}</span>
      </span>
    </div>
  );
}

export function TypeTable({ run }: { run: EvalRun }) {
  // The gate applies to pooled precision and recall; per type, those levels are only a reference.
  const pT = metric(run, 'precision')?.threshold ?? 0.85;
  const rT = metric(run, 'recall')?.threshold ?? 0.8;
  return (
    <>
      <Table label="Precision and recall by insight type" minWidth={340}>
        <thead>
          <tr>
            <th>Insight type</th>
            <th>Precision</th>
            <th>Recall</th>
          </tr>
        </thead>
        <tbody>
          {INSIGHT_TYPES.map((t) => (
            <tr key={t}>
              <td className="is-nowrap">
                <TypeLabel type={t} />
              </td>
              <td className={styles.rateCell}>
                <RateBar m={metric(run, `precision.${t}`)} target={pT} series="precision" name="Precision" />
              </td>
              <td className={styles.rateCell}>
                <RateBar m={metric(run, `recall.${t}`)} target={rT} series="recall" name="Recall" />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className={styles.tableNote}>
        <span className={styles.legendRow}>
          <DotLabel color="var(--chart-1)">Precision</DotLabel>
          <DotLabel color="var(--chart-2)">Recall</DotLabel>
          <span className={styles.legendTick}>
            <span className={styles.legendTickMark} aria-hidden="true" />
            Overall target
          </span>
        </span>
        <span>
          The gate checks all types together ({(pT * 100).toFixed(0)}% precision, {(rT * 100).toFixed(0)}% recall). Each type is shown against that line, not gated.
        </span>
      </div>
    </>
  );
}

const HEAT_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
/** Sequential, one hue: from a whisper of the accent at 50% or lower to a clear tint at 100%. */
const heat = (v: number | null) => (v == null ? 'var(--bg-subtle)' : `color-mix(in srgb, var(--accent) ${(4 + Math.max(0, Math.min(1, (v - 0.5) / 0.5)) * 30).toFixed(0)}%, var(--bg))`);

export function LevelHeat({ run }: { run: EvalRun }) {
  // A run recorded before per-level precision existed shows recall only, not a row of gaps.
  const kinds = (['precision', 'recall'] as const).filter((kind) => LEVELS.some((l) => metric(run, `${kind}.level${l.n}`)?.denominator != null));
  const gated = kinds.some((k) => LEVELS.some((l) => metric(run, `${k}.level${l.n}`)?.threshold != null));
  return (
    <>
      <div className={styles.heatWrap}>
        <table className={styles.heat}>
          <caption className="ds-sr-only">Precision and recall by how messy the file is</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.heatCorner}>
                <span className="ds-sr-only">Measure</span>
              </th>
              {LEVELS.map((l) => (
                <th key={l.n} scope="col" className={styles.heatHead}>
                  <Tooltip label={l.hint}>
                    <span tabIndex={0} className={styles.heatHeadText}>
                      <span className={styles.heatLevel}>Level {l.n}</span>
                      <span className={styles.heatName}>{l.label}</span>
                    </span>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => (
              <tr key={kind}>
                <th scope="row" className={styles.heatRow}>
                  {kind === 'precision' ? 'Precision' : 'Recall'}
                </th>
                {LEVELS.map((l) => {
                  const m = metric(run, `${kind}.level${l.n}`);
                  const p = passed(m);
                  const v = rateOf(m);
                  return (
                    <td key={l.n} className={styles.heatCell} style={{ '--heat': heat(v) } as CSSProperties}>
                      <span className={styles.heatValue}>
                        {v == null ? '—' : metricPct(m)}
                        {p != null && m?.threshold != null ? (
                          <span className={p ? styles.heatPass : styles.heatFail} title={`Go-live rule: ${thresholdLabel(m)}`}>
                            {p ? <IconCheck size={12} /> : <IconX size={12} />}
                            <span className="ds-sr-only">{p ? `passes its go-live rule, ${thresholdLabel(m)}` : `below its go-live rule, ${thresholdLabel(m)}`}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.heatCount}>{counts(m) ?? 'No data'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.tableNote}>
        <span className={styles.scale} aria-hidden="true">
          <span className={styles.scaleEnd}>50%</span>
          {HEAT_STEPS.map((s) => (
            <span key={s} className={styles.scaleStep} style={{ background: heat(s) }} />
          ))}
          <span className={styles.scaleEnd}>100%</span>
        </span>
        <span>
          Darker is better. Each level has its own labelled files.
          {gated ? ' A tick marks a cell with its own go-live rule.' : ''}
        </span>
      </div>
    </>
  );
}

/** Pass, below target, or reported only (no rule). */
function CheckBadge({ m }: { m: Metric | null }) {
  const p = passed(m);
  if (p == null) return <Badge>Reported</Badge>;
  return (
    <Badge tone={p ? 'success' : 'danger'} dot>
      {p ? 'Pass' : 'Below target'}
    </Badge>
  );
}

const SAFETY: { keys: string[]; title: string; note: string }[] = [
  {
    keys: ['grounding_rate'],
    title: 'Quotes found in the conversation',
    note: 'Word for word or a close match',
  },
  {
    keys: ['hallucinations_caught', 'hallucination_caught'],
    title: 'Made-up quotes caught',
    note: 'The insight was dropped',
  },
  {
    keys: ['negative_fp_rate'],
    title: 'Insights invented from nothing',
    note: 'On test calls with nothing actionable',
  },
  {
    keys: ['injection_flagged', 'injection_resistance'],
    title: 'Manipulation attempts caught',
    note: 'Hidden instructions in a file changed nothing',
  },
  {
    keys: ['phi_leakage'],
    title: 'Health information reaching the AI',
    note: 'Files where any of it got through redaction',
  },
  {
    keys: ['routing_accuracy'],
    title: 'Sent to the expected owner',
    note: 'Routing on the labelled files',
  },
  {
    keys: ['run_failures'],
    title: 'Test files that failed to run',
    note: 'Every file must run to completion',
  },
];

export function SafetyTable({ run }: { run: EvalRun }) {
  const rows = SAFETY.map((s) => ({
    ...s,
    m: s.keys.map((k) => metric(run, k)).find(Boolean) ?? null,
  })).filter((r) => r.m);
  return (
    <Table label="Safety and routing checks" minWidth={640}>
      <thead>
        <tr>
          <th>Check</th>
          <th className="is-num">Result</th>
          <th className="is-num">Counts</th>
          <th className="is-num">Target</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ title, note, m }) => {
          const countOnly = m!.denominator == null;
          return (
            <tr key={m!.key}>
              <td>
                <span className={styles.checkTitle}>{title}</span>
                <span className={styles.checkNote}>{note}</span>
              </td>
              <td className="is-num">{countOnly ? (m!.numerator ?? '—') : metricPct(m, m!.value === 0 || m!.value === 1 ? 0 : 1)}</td>
              <td className="is-num ds-muted">{countOnly ? `${m!.numerator ?? 0} ${unitFor(m!.key)}` : counts(m)}</td>
              <td className="is-num ds-muted">{m!.threshold != null ? thresholdLabel(m!) : 'None'}</td>
              <td className="is-nowrap">
                <CheckBadge m={m} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

type Diff = {
  key: string;
  label: string;
  before: ReactNode;
  after: ReactNode;
  change: string;
  better: boolean | null;
};

const rateCell = (m: Metric | null) =>
  m ? (
    <span className={styles.diffValue}>
      {metricPct(m)}
      {counts(m) ? <span className={styles.diffCount}>{counts(m)}</span> : null}
    </span>
  ) : (
    '—'
  );

function rateDiff(label: string, key: string, current: EvalRun, candidate: EvalRun, alt?: () => Metric | null, altCur?: () => Metric | null): Diff | null {
  const a = metric(current, key) ?? altCur?.() ?? null;
  const b = metric(candidate, key) ?? alt?.() ?? null;
  const av = rateOf(a);
  const bv = rateOf(b);
  if (av == null || bv == null) return null;
  const d = bv - av;
  const better = Math.abs(d) < 0.0005 ? null : LOWER_IS_BETTER.has(key) ? d < 0 : d > 0;
  return {
    key,
    label,
    before: rateCell(a),
    after: rateCell(b),
    change: Math.abs(d) < 0.0005 ? 'No change' : ptsText(d),
    better,
  };
}

function relDiff(key: string, label: string, a: number, b: number, fmt: (v: number) => string): Diff {
  const d = a ? (b - a) / a : 0;
  return {
    key,
    label,
    before: fmt(a),
    after: fmt(b),
    change: Math.abs(d) < 0.005 ? 'No change' : `${d > 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(0)}%`,
    better: Math.abs(d) < 0.005 ? null : d < 0,
  };
}

/** The headline differences between the live prompt and the candidate, then every changed rate on request. */
export function CandidateCompare({ candidate, current }: { candidate: EvalRun; current: EvalRun }) {
  const [all, setAll] = useState(false);
  const key: Diff[] = [
    rateDiff(
      'Precision',
      'precision',
      current,
      candidate,
      () => pooledMetric(candidate, 'precision'),
      () => pooledMetric(current, 'precision'),
    ),
    rateDiff(
      'Recall',
      'recall',
      current,
      candidate,
      () => pooledMetric(candidate, 'recall'),
      () => pooledMetric(current, 'recall'),
    ),
    rateDiff('Recall on the messiest files', 'recall.level5', current, candidate),
    rateDiff('Quotes grounded', 'grounding_rate', current, candidate),
    relDiff('cost', `Test cost (${candidate.files} files)`, current.costUsd, candidate.costUsd, (v) => money(v, { precise: true })),
    relDiff('p95', 'Slowest 5% of files', current.p95Ms, candidate.p95Ms, (v) => ms(v)),
  ].filter((d): d is Diff => !!d);
  const shown = new Set(key.map((d) => d.key));
  const rest = candidate.metrics
    // Count-only metrics (no denominator) and the gate's own regression rows don't belong in a rate diff.
    .filter((m) => m.denominator != null && !m.key.startsWith('regression.') && !shown.has(m.key))
    .map((m) => rateDiff(metricLabel(m), m.key, current, candidate))
    .filter((d): d is Diff => !!d && d.better != null && d.change !== 'No change')
    .sort((a, b) => Number(a.better) - Number(b.better));
  const rows = all ? [...key, ...rest] : key;
  const tone = (d: Diff): Tone => (d.better == null ? 'neutral' : d.better ? 'success' : 'danger');
  return (
    <div className={styles.compare}>
      <Table label={`${ver(current.promptVersion)} compared with ${ver(candidate.promptVersion)}`} minWidth={520}>
        <thead>
          <tr>
            <th>Measure</th>
            <th className="is-num">{ver(current.promptVersion)} (live)</th>
            <th className="is-num">{ver(candidate.promptVersion)}</th>
            <th className="is-num">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key}>
              <td className={styles.compareLabel}>{d.label}</td>
              <td className="is-num ds-muted">{d.before}</td>
              <td className="is-num">{d.after}</td>
              <td className="is-num">
                <Badge tone={tone(d)}>{d.change}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rest.length ? (
        <div className={styles.compareMore}>
          <span>
            {all ? `Every measure that changed, worse first.` : `${rest.length} more measure${rest.length === 1 ? '' : 's'} changed, ${rest.filter((d) => d.better === false).length} for the worse.`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'Show fewer' : 'Show all changes'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
