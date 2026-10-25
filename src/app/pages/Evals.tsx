import type { EvalRun } from '../../shared/contracts';
import { tourAnchor } from '../../tour/anchors';
import { Badge } from '../../system/components/primitives/Badge.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { EmptyState } from '../../uis/EmptyState';
import { RateWithDenominator } from '../../uis/RateWithDenominator';
import { RelativeTime } from '../../uis/RelativeTime';
import { Sparkline } from '../../uis/Sparkline';
import { KpiStrip } from '../../uis/StatTile';
import { Hint } from '../components/Hint';
import { CardSkeleton, PageHeaderSkeleton, SkeletonSurface, TilesSkeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { useEvals } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel } from '../components/ui';
import { money, ms } from '../lib/labels';
import { pctText, rateOf } from '../../shared/format';
import { MODEL_ROLE_LABEL, useModelLabels } from '../lib/models';

/** Plain role names on the surface; exact model ids live only on Settings. */
function roleName(label: string | null | undefined): string {
  if (label === MODEL_ROLE_LABEL.primary) return 'Main model';
  if (label === MODEL_ROLE_LABEL.secondary) return 'Backup model';
  return label ?? 'Main model';
}
import { LevelHeatmap, MetricCard, TypeBars } from './evals/EvalParts';
import { PromotionGate } from './evals/PromotionGate';
import { LOWER_IS_BETTER, f1, metric, metricLabel, pooled } from './evals/evalModel';
import styles from './evals/Evals.module.css';

function pctOrDash(v: number | null | undefined, d = 1) {
  return pctText(v, d);
}

function CandidateCompare({ candidate, current }: { candidate: EvalRun; current: EvalRun }) {
  const rows = candidate.metrics
    .map((m) => {
      const base = metric(current, m.key);
      const mv = rateOf(m);
      const bv = rateOf(base);
      const delta = mv != null && bv != null ? (mv - bv) * 100 : null;
      const better = delta == null ? null : LOWER_IS_BETTER.has(m.key) ? delta < 0 : delta > 0;
      return { m, base, delta, better };
    })
    // Count-only metrics (no denominator) and the gate's own regression rows don't belong in a rate diff.
    .filter((r) => r.m.denominator != null && !r.m.key.startsWith('regression.'))
    .filter((r) => r.delta != null && Math.abs(r.delta) >= 0.05)
    .sort((a, b) => Number(a.better) - Number(b.better) || Math.abs(b.delta!) - Math.abs(a.delta!));
  const regressions = rows.filter((r) => r.better === false).length;
  const costDelta = current.costUsd ? ((candidate.costUsd - current.costUsd) / current.costUsd) * 100 : 0;
  const p95Delta = current.p95Ms ? ((candidate.p95Ms - current.p95Ms) / current.p95Ms) * 100 : 0;
  return (
    <div className="sl-stack">
      <div className={styles.compareStrip}>
        <div>
          <Hint label="F1: precision and recall combined, across all insight types.">
            <span className={styles.compareLabel} tabIndex={0}>Overall score</span>
          </Hint>
          <span className={styles.compareBig}>
            {pctOrDash(f1(current))} → {pctOrDash(f1(candidate))}
          </span>
        </div>
        <div>
          <Hint label="95th-percentile (p95) time per file.">
            <span className={styles.compareLabel} tabIndex={0}>Slowest 5% of files</span>
          </Hint>
          <span className={`${styles.compareBig} ${p95Delta < 0 ? styles.textGood : styles.textFail}`}>
            {ms(current.p95Ms)} → {ms(candidate.p95Ms)}
          </span>
        </div>
        <div>
          <span className={styles.compareLabel}>Test cost ({candidate.files} files)</span>
          <span className={`${styles.compareBig} ${costDelta < 0 ? styles.textGood : styles.textFail}`}>
            {money(current.costUsd, { precise: true })} → {money(candidate.costUsd, { precise: true })}
          </span>
        </div>
      </div>
      <div className="sl-scroll-x">
        <table className={styles.compare}>
          <caption className="sl-sr-only">Metrics that changed between versions</caption>
          <thead>
            <tr>
              <th scope="col">Metric that changed</th>
              <th scope="col">{current.promptVersion}</th>
              <th scope="col">{candidate.promptVersion}</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, base, delta, better }) => (
              <tr key={m.key} className={better === false ? styles.rowRegress : ''}>
                <th scope="row">{metricLabel(m)}</th>
                <td>{base ? <RateWithDenominator rate={base.value} numerator={base.numerator} denominator={base.denominator} unit="" /> : '—'}</td>
                <td>
                  <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" />
                </td>
                <td>
                  <StatusChip tone={better ? 'success' : 'danger'} size="sm">
                    {delta! > 0 ? '+' : '−'}{Math.abs(delta!).toFixed(1)} pts
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sl-caption">
        {rows.length} metric{rows.length === 1 ? '' : 's'} changed; {regressions} got worse (listed first).
      </p>
    </div>
  );
}

export default function EvalsPage() {
  const evals = useEvals();
  const { label: modelLabel, models } = useModelLabels();

  if (evals.loading) {
    return (
      <SkeletonSurface label="Loading evals">
        <PageHeaderSkeleton />
        <div className="sl-stack-lg">
          <TilesSkeleton count={5} />
          <div className="sl-grid-2">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={4} />
          </div>
        </div>
      </SkeletonSurface>
    );
  }
  if (evals.error && !evals.data) {
    return (
      <div className="sl-page">
        <AppPageHeader title="Evals" dataAsOf={null} />
        <ErrorState error={evals.error} onRetry={() => void evals.refresh()} what="evals" />
      </div>
    );
  }
  const { latest, history, candidate } = evals.data!;
  const P = pooled(latest, 'precision');
  const R = pooled(latest, 'recall');
  const hist = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // The judge is the secondary model. A run that never needed it records judgeModel null, so
  // fall back to the candidate run's judge, then the configured secondary.
  const judgeLabel = roleName(modelLabel(latest.judgeModel ?? candidate?.judgeModel ?? models?.secondary ?? null) ?? MODEL_ROLE_LABEL.secondary);

  const histCols: DataTableColumn<EvalRun>[] = [
    {
      key: 'v',
      header: 'Prompt',
      render: (r) => (
        <span className="sl-row-nowrap">
          <span className="sl-mono sl-strong">{r.promptVersion}</span>
          {r.id === latest.id ? (
            <Badge tone="brand" size="sm">
              Live
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'date', header: 'Run', sortable: true, sortValue: (r) => r.createdAt, render: (r) => <RelativeTime value={r.createdAt} /> },
    { key: 'p', header: 'Precision', render: (r) => <RateWithDenominator {...pooled(r, 'precision')} rate={pooled(r, 'precision').value} unit="" /> },
    { key: 'r', header: 'Recall', render: (r) => <RateWithDenominator {...pooled(r, 'recall')} rate={pooled(r, 'recall').value} unit="" /> },
    {
      key: 'l5',
      header: 'Recall, messiest files',
      render: (r) => {
        const m = metric(r, 'recall.level5');
        return m ? <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" /> : '—';
      },
    },
    { key: 'p95', header: 'Slowest 5%', render: (r) => <span className="sl-num">{ms(r.p95Ms)}</span> },
    { key: 'cost', header: 'Test cost', render: (r) => <span className="sl-num">{money(r.costUsd, { precise: true })}</span> },
    {
      key: 'status',
      header: 'Result',
      render: (r) => (
        <StatusChip tone={r.promoted ? 'success' : 'danger'} size="sm">
          {r.promoted ? 'Promoted' : 'Blocked'}
        </StatusChip>
      ),
    },
  ];

  return (
    <div className="sl-page">
      <AppPageHeader title="Evals" subtitle="How accurate the AI is, measured on hand-labelled test files" dataAsOf={evals.dataAsOf} />

      <section className={styles.runHead} aria-label="Latest eval run">
        <div>
          <span className={styles.runEyebrow}>Live prompt</span>
          <p className={styles.runTitle}>
            Version <span className="sl-mono">{latest.promptVersion}</span>, tested on {latest.files} labelled files
          </p>
          <p className="sl-meta">
            Runs on the <span className="sl-strong">{roleName(modelLabel(latest.model))}</span>. Graded by the <span className="sl-strong">{judgeLabel.toLowerCase()}</span>, a different AI family that only steps in when a match is unclear. Last run <RelativeTime value={latest.createdAt} />.
          </p>
        </div>
        {hist.length >= 2 ? (
          <div className={styles.trend}>
            <span className={styles.runEyebrow}>Recall by version</span>
            <Sparkline values={hist.map((h) => Math.round((pooled(h, 'recall').value ?? 0) * 1000) / 10)} bucketLabels={hist.map((h) => h.promptVersion)} width={140} height={30} label="Pooled recall by prompt version" />
            <span className="sl-caption sl-num">
              {hist[0]?.promptVersion} {pctOrDash(hist[0] ? pooled(hist[0], 'recall').value : null)} → {latest.promptVersion} {pctOrDash(R.value)}
            </span>
          </div>
        ) : null}
      </section>

      <div>
        <KpiStrip
          minItemWidth={170}
          label="Headline eval metrics"
          items={[
            { label: <Hint label="Of everything the AI pulled out, how much was right."><span tabIndex={0}>Precision</span></Hint>, value: pctOrDash(P.value), sub: `${P.numerator} of ${P.denominator} found were right` },
            { label: <Hint label="Of the insights planted in the test files, how many the AI found."><span tabIndex={0}>Recall</span></Hint>, value: pctOrDash(R.value), sub: `${R.numerator} of ${R.denominator} planted were found` },
            { label: <Hint label="F1: precision and recall combined, across all six insight types."><span tabIndex={0}>Overall score</span></Hint>, value: pctOrDash(f1(latest)), sub: 'Across all six insight types' },
            { label: <Hint label={`p50 ${(latest.p50Ms / 1000).toFixed(2)} s, p95 ${(latest.p95Ms / 1000).toFixed(2)} s per file`}><span tabIndex={0}>Time per file</span></Hint>, value: (latest.p50Ms / 1000).toFixed(1), unit: 'seconds', sub: `Typical. Slowest 5%: ${(latest.p95Ms / 1000).toFixed(1)} seconds` },
            { label: 'Test cost', value: money(latest.costUsd, { precise: true }), sub: `About ${money(latest.costUsd / Math.max(latest.files, 1), { precise: true })} per file` },
          ]}
        />
      </div>

      <div className={styles.mainGrid}>
        <Panel title="Accuracy by insight type" sub="Precision and recall for each type, with counts. The tick marks the overall target." anchor={tourAnchor('evals.metrics')}>
          <TypeBars run={latest} />
        </Panel>
        <div className="sl-stack-lg">
          <Panel title="Accuracy by how messy the file is" sub="From clean notes to chaotic forwarded threads. Real calls sit in the three messiest levels." anchor={tourAnchor('evals.levels')}>
            <LevelHeatmap run={latest} />
          </Panel>
        </div>
      </div>

      <Panel title="Safety and honesty" sub="The failures that matter more than accuracy: made-up quotes, made-up work, following hidden instructions, leaking health information.">
        <div className={styles.metricGrid}>
          <MetricCard m={metric(latest, 'grounding_rate')} title="Grounding" note="Kept quotes found in the conversation, word for word or near enough" />
          <MetricCard m={metric(latest, 'hallucinations_caught') ?? metric(latest, 'hallucination_caught')} title="Made-up quotes caught" note="Quotes not found in the conversation, so the insight was dropped" />
          <MetricCard m={metric(latest, 'negative_fp_rate')} title="Insights invented from nothing" note="Insights reported on calls with nothing actionable" />
          <MetricCard m={metric(latest, 'injection_flagged') ?? metric(latest, 'injection_resistance')} title="Manipulation attempts caught" note="Hidden instructions in a file did not change the output" />
          <MetricCard m={metric(latest, 'phi_leakage')} title="Health information leaked" note="Files with health information where any of it reached the AI" />
          <MetricCard m={metric(latest, 'routing_accuracy')} title="Routing accuracy" note="Sent to the expected owner" />
        </div>
      </Panel>

      {candidate ? (
        <Panel
          title={
            <span className="sl-row-nowrap">
              Candidate prompt <span className="sl-mono">{candidate.promptVersion}</span>
              <Badge tone="warning" size="sm">
                Candidate
              </Badge>
            </span>
          }
          sub={`Tested on the same ${candidate.files} labelled files and graded by the ${roleName(modelLabel(candidate.judgeModel) ?? MODEL_ROLE_LABEL.secondary).toLowerCase()}.`}
          anchor={tourAnchor('evals.candidate')}
        >
          <div className={styles.candidateGrid}>
            <CandidateCompare candidate={candidate} current={latest} />
            <PromotionGate candidate={candidate} current={latest} />
          </div>
        </Panel>
      ) : (
        <Panel title="Candidate prompt" anchor={tourAnchor('evals.candidate')}>
          <EmptyState variant="no-data" title="No candidate waiting" description="A new prompt version appears here after its test run, with the go-live check." />
        </Panel>
      )}

      <Panel title="Prompt version history" sub="Every version ran the full set of labelled files before it could go live." flush>
        <DataTable<EvalRun>
          columns={histCols}
          rows={[...hist].reverse()}
          getRowKey={(r) => r.id}
          pagination="when-needed"
          caption="Prompt version history"
          empty={<EmptyState variant="not-yet-collected" title="No test history yet" />}
        />
      </Panel>
    </div>
  );
}
