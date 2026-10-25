import type { EvalRun } from '../../shared/contracts';
import { tourAnchor } from '../../tour/anchors';
import { MetricStrip } from '../../system/components/blocks/MetricStrip.jsx';
import { Badge } from '../../system/components/primitives/Badge.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { EmptyState } from '../../uis/EmptyState';
import { RateWithDenominator } from '../../uis/RateWithDenominator';
import { RelativeTime } from '../../uis/RelativeTime';
import { Sparkline } from '../../uis/Sparkline';
import { CardSkeleton, PageHeaderSkeleton, SkeletonSurface, TilesSkeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { useEvals } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel } from '../components/ui';
import { money, ms } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { LevelHeatmap, MetricCard, TypeBars } from './evals/EvalParts';
import { PromotionGate } from './evals/PromotionGate';
import { LOWER_IS_BETTER, f1, metric, pooled } from './evals/evalModel';
import styles from './evals/Evals.module.css';

function pctOrDash(v: number | null | undefined, d = 1) {
  return v == null ? '—' : `${(v * 100).toFixed(d)}%`;
}

function CandidateCompare({ candidate, current }: { candidate: EvalRun; current: EvalRun }) {
  const rows = candidate.metrics
    .map((m) => {
      const base = metric(current, m.key);
      const delta = m.value != null && base?.value != null ? (m.value - base.value) * 100 : null;
      const better = delta == null ? null : LOWER_IS_BETTER.has(m.key) ? delta < 0 : delta > 0;
      return { m, base, delta, better };
    })
    .filter((r) => r.delta != null && Math.abs(r.delta) >= 0.05)
    .sort((a, b) => Number(a.better) - Number(b.better) || Math.abs(b.delta!) - Math.abs(a.delta!));
  const regressions = rows.filter((r) => r.better === false).length;
  const costDelta = current.costUsd ? ((candidate.costUsd - current.costUsd) / current.costUsd) * 100 : 0;
  const p95Delta = current.p95Ms ? ((candidate.p95Ms - current.p95Ms) / current.p95Ms) * 100 : 0;
  return (
    <div className="sl-stack">
      <div className={styles.compareStrip}>
        <div>
          <span className="sl-eyebrow">F1 (pooled)</span>
          <span className={styles.compareBig}>
            {pctOrDash(f1(current))} → {pctOrDash(f1(candidate))}
          </span>
        </div>
        <div>
          <span className="sl-eyebrow">p95 latency</span>
          <span className={`${styles.compareBig} ${p95Delta < 0 ? styles.textGood : styles.textFail}`}>
            {ms(current.p95Ms)} → {ms(candidate.p95Ms)}
          </span>
        </div>
        <div>
          <span className="sl-eyebrow">Eval cost ({candidate.files} files)</span>
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
                <th scope="row">{m.label}</th>
                <td>{base ? <RateWithDenominator rate={base.value} numerator={base.numerator} denominator={base.denominator} unit="" /> : '—'}</td>
                <td>
                  <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" />
                </td>
                <td>
                  <StatusChip tone={better ? 'success' : 'danger'} size="sm">
                    {delta! > 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1)} pts
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sl-caption">
        {rows.length} metric{rows.length === 1 ? '' : 's'} moved · {regressions} regression{regressions === 1 ? '' : 's'} (listed first).
      </p>
    </div>
  );
}

export default function EvalsPage() {
  const evals = useEvals();
  const { label: modelLabel } = useModelLabels();

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

  const histCols: DataTableColumn<EvalRun>[] = [
    {
      key: 'v',
      header: 'Prompt',
      render: (r) => (
        <span className="sl-row-nowrap">
          <span className="sl-mono sl-strong">{r.promptVersion}</span>
          {r.id === latest.id ? (
            <Badge tone="brand" size="sm">
              production
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'date', header: 'Run', sortable: true, sortValue: (r) => r.createdAt, render: (r) => <RelativeTime value={r.createdAt} /> },
    { key: 'p', header: 'Precision (pooled)', render: (r) => <RateWithDenominator {...pooled(r, 'precision')} rate={pooled(r, 'precision').value} unit="" /> },
    { key: 'r', header: 'Recall (pooled)', render: (r) => <RateWithDenominator {...pooled(r, 'recall')} rate={pooled(r, 'recall').value} unit="" /> },
    {
      key: 'l5',
      header: 'Recall · level 5',
      render: (r) => {
        const m = metric(r, 'recall.level5');
        return m ? <RateWithDenominator rate={m.value} numerator={m.numerator} denominator={m.denominator} unit="" /> : '—';
      },
    },
    { key: 'p95', header: 'p95', render: (r) => <span className="sl-mono">{ms(r.p95Ms)}</span> },
    { key: 'cost', header: 'Cost', render: (r) => <span className="sl-mono">{money(r.costUsd, { precise: true })}</span> },
    {
      key: 'status',
      header: 'Gate',
      render: (r) => (
        <StatusChip tone={r.promoted ? 'success' : 'danger'} size="sm">
          {r.promoted ? 'promoted' : 'blocked'}
        </StatusChip>
      ),
    },
  ];

  return (
    <div className="sl-page">
      <AppPageHeader title="Evals" dataAsOf={evals.dataAsOf} />

      <section className={styles.runHead} aria-label="Latest eval run">
        <div>
          <span className="sl-eyebrow">Production prompt</span>
          <p className={styles.runTitle}>
            <span className="sl-mono">{latest.promptVersion}</span> on {latest.files} golden files
          </p>
          <p className="sl-meta">
            Model <span className="sl-strong">{modelLabel(latest.model)}</span> · judge <span className="sl-strong">{modelLabel(latest.judgeModel) ?? '—'}</span> (a different model family) · run <RelativeTime value={latest.createdAt} />
          </p>
        </div>
        <div className={styles.trend}>
          <span className="sl-eyebrow">Pooled recall by version</span>
          <Sparkline values={hist.map((h) => Math.round((pooled(h, 'recall').value ?? 0) * 1000) / 10)} bucketLabels={hist.map((h) => h.promptVersion)} width={140} height={30} label="Pooled recall by prompt version" />
          <span className="sl-caption sl-mono">
            {hist[0]?.promptVersion} {pctOrDash(hist[0] ? pooled(hist[0], 'recall').value : null)} → {latest.promptVersion} {pctOrDash(R.value)}
          </span>
        </div>
      </section>

      <div className={styles.kpis}>
        <MetricStrip
          minItemWidth={170}
          aria-label="Headline eval metrics"
          items={[
            { label: 'Precision', value: pctOrDash(P.value), sub: `${P.numerator} / ${P.denominator} extracted were right` },
            { label: 'Recall', value: pctOrDash(R.value), sub: `${R.numerator} / ${R.denominator} planted were found` },
            { label: 'F1', value: pctOrDash(f1(latest)), sub: 'pooled across 6 types' },
            { label: 'Latency', value: (latest.p50Ms / 1000).toFixed(2), unit: 's p50', sub: `p95 ${(latest.p95Ms / 1000).toFixed(2)} s per file` },
            { label: 'Eval cost', value: money(latest.costUsd, { precise: true }), sub: `~${money(latest.costUsd / Math.max(latest.files, 1), { precise: true })} per file` },
          ]}
        />
      </div>

      <div className={styles.mainGrid}>
        <Panel title="Precision and recall per insight type" sub="Every bar shows its count; the tick is the threshold the type must clear." anchor={tourAnchor('evals.metrics')}>
          <TypeBars run={latest} />
        </Panel>
        <div className="sl-stack-lg">
          <Panel title="Per mess level" sub="From clean notes (L1) to chaos (L5). Real calls live at L3–L5." anchor={tourAnchor('evals.levels')}>
            <LevelHeatmap run={latest} />
          </Panel>
        </div>
      </div>

      <Panel title="Safety and honesty" sub="The failure modes that matter more than accuracy: inventing quotes, inventing work, obeying injected instructions, leaking PHI.">
        <div className={styles.metricGrid}>
          <MetricCard m={metric(latest, 'grounding_rate')} title="Grounding" note="kept quotes found verbatim or fuzzy ≥ 0.90" />
          <MetricCard m={metric(latest, 'hallucination_caught')} title="Hallucinations caught" note="planted fake quotes dropped by code" />
          <MetricCard m={metric(latest, 'negative_fp_rate')} title="Negative false positives" note="insights invented on nothing-actionable calls" />
          <MetricCard m={metric(latest, 'injection_resistance')} title="Injection resistance" note="output schema unchanged by embedded instructions" />
          <MetricCard m={metric(latest, 'phi_leakage')} title="PHI leakage" note="PHI tokens that reached a model" />
          <MetricCard m={metric(latest, 'routing_accuracy')} title="Routing accuracy" note="routed to the expected owner" />
        </div>
      </Panel>

      {candidate ? (
        <Panel
          title={
            <span className="sl-row-nowrap">
              Candidate prompt <span className="sl-mono">{candidate.promptVersion}</span>
              <Badge tone="warning" size="sm">
                candidate
              </Badge>
            </span>
          }
          sub={`Evaluated on the same ${candidate.files} golden files, judged by ${modelLabel(candidate.judgeModel) ?? 'the secondary model'}.`}
          anchor={tourAnchor('evals.candidate')}
        >
          <div className={styles.candidateGrid}>
            <CandidateCompare candidate={candidate} current={latest} />
            <PromotionGate candidate={candidate} current={latest} />
          </div>
        </Panel>
      ) : (
        <Panel title="Candidate prompt" anchor={tourAnchor('evals.candidate')}>
          <EmptyState variant="no-data" title="No candidate waiting" description="A new prompt version appears here after its eval run, with the promotion gate." />
        </Panel>
      )}

      <Panel title="Prompt version history" sub="Each version ran the full golden set before it could ship." flush>
        <DataTable<EvalRun>
          columns={histCols}
          rows={[...hist].reverse()}
          getRowKey={(r) => r.id}
          pagination="when-needed"
          caption="Prompt version history"
          empty={<EmptyState variant="not-yet-collected" title="No eval history" />}
        />
      </Panel>
    </div>
  );
}
