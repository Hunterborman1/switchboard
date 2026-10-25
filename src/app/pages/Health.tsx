import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { MetricStrip } from '../../system/components/blocks/MetricStrip.jsx';
import { Callout } from '../../system/components/blocks/Callout.jsx';
import { LadderGauge } from '../../uis/costs/LadderGauge';
import { DailySpendField } from '../../uis/costs/SpendBars';
import { buildLadder, formatDayLabel, median, type AggregateDay } from '../../uis/costs/costs-model';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { EmptyState } from '../../uis/EmptyState';
import { MonoId } from '../../uis/MonoId';
import { RelativeTime } from '../../uis/RelativeTime';
import { CardSkeleton, PageHeaderSkeleton, SkeletonSurface, TableSkeleton, TilesSkeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { useHealth } from '../api/hooks';
import type { AiCallRow, DlqRow } from '../api/types';
import { AppPageHeader, ErrorState, Panel } from '../components/ui';
import { IconArrowUpRight } from '../components/icons';
import { int, money, ms } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import styles from './health/Health.module.css';

const RUNGS = [3.75, 7.5, 11.25, 15];
const LOGS = `/ops/logs?agentId=${SIGNAL_LOOP_AGENT_ID}`;
const traceHref = (runId: string) => `/ops/traces/${encodeURIComponent(runId)}`;
const runLogsHref = (runId: string) => `${LOGS}&runId=${encodeURIComponent(runId)}`;

function OpsLinks({ runId }: { runId: string | null }) {
  if (!runId) return <span className="sl-subtle">—</span>;
  return (
    <span className={styles.opsLinks}>
      <Link to={traceHref(runId)} className="sl-caption">
        Trace
      </Link>
      <Link to={runLogsHref(runId)} className="sl-caption">
        Logs
      </Link>
    </span>
  );
}

function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string; value?: number | null; color?: string }[]; label?: string; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tip}>
      <div className="sl-strong">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className={styles.tipRow}>
          <i style={{ background: p.color }} aria-hidden="true" />
          <span>{p.name}</span>
          <span className="sl-mono">{p.value == null ? 'not collected' : fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function HealthPage() {
  const health = useHealth();
  const { label: modelLabel, rewrite: rewriteModels } = useModelLabels();

  if (health.loading) {
    return (
      <SkeletonSurface label="Loading health and cost">
        <PageHeaderSkeleton />
        <div className="sl-stack-lg">
          <TilesSkeleton count={5} />
          <div className="sl-grid-2">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={4} />
          </div>
          <TableSkeleton rows={6} columns={7} />
        </div>
      </SkeletonSurface>
    );
  }
  if (health.error && !health.data) {
    return (
      <div className="sl-page">
        <AppPageHeader title="Health & cost" dataAsOf={null} />
        <ErrorState error={health.error} onRetry={() => void health.refresh()} what="health and cost" />
      </div>
    );
  }
  const h = health.data!;
  const b = h.budget;
  const ladder = buildLadder(b.spentUsd, RUNGS.map((r) => (r / 15) * b.limitUsd));
  const ledger = [...h.ledger].sort((a, b2) => a.day.localeCompare(b2.day));
  const collected = ledger.filter((d) => d.costUsd != null);
  const med = median(collected.map((d) => d.costUsd!));
  const days: AggregateDay[] = ledger.map((d) => ({
    day: d.day,
    cost: d.costUsd,
    state: d.costUsd == null ? 'missing' : 'collected',
    spike: d.costUsd != null && med != null && med > 0 && d.costUsd > med * 5,
  }));
  const calls = collected.reduce((a, d) => a + (d.calls ?? 0), 0);
  const failures = collected.reduce((a, d) => a + (d.failures ?? 0), 0);
  const cost14 = collected.reduce((a, d) => a + (d.costUsd ?? 0), 0);
  const missing = ledger.length - collected.length;
  const latest = [...collected].reverse().find((d) => d.p95Ms != null);
  const chartData = ledger.map((d) => ({ label: formatDayLabel(d.day), p50: d.p50Ms, p95: d.p95Ms, ok: d.calls == null ? null : Math.max(0, d.calls - (d.failures ?? 0)), failed: d.failures }));
  const pctUsed = b.limitUsd > 0 ? b.spentUsd / b.limitUsd : 0;

  const dlqCols: DataTableColumn<DlqRow>[] = [
    { key: 'at', header: 'Parked', sortable: true, sortValue: (r) => r.at, render: (r) => <RelativeTime value={r.at} /> },
    {
      key: 'run',
      header: 'Run',
      render: (r) => (
        <div>
          {r.runId ? <MonoId value={r.runId} keep={10} /> : <span className="sl-subtle">—</span>}
          {r.filename ? <div className="sl-cell-sub sl-ellipsis" style={{ maxWidth: 240 }}>{r.filename}</div> : null}
        </div>
      ),
    },
    { key: 'step', header: 'Step', render: (r) => <span className="sl-mono">{r.step ?? '—'}</span> },
    { key: 'error', header: 'Error', render: (r) => <span className={styles.error}>{r.error ? rewriteModels(r.error) : r.error}</span> },
    { key: 'attempts', header: 'Attempts', render: (r) => <span className="sl-mono">{r.attempts ?? '—'}</span> },
    { key: 'ops', header: 'Agent Ops', render: (r) => <OpsLinks runId={r.runId} /> },
  ];

  const recentCols: DataTableColumn<AiCallRow>[] = [
    { key: 'at', header: 'When', sortable: true, sortValue: (r) => r.at, render: (r) => <RelativeTime value={r.at} /> },
    { key: 'step', header: 'Step', render: (r) => <span className="sl-mono">{r.step ?? '—'}</span> },
    { key: 'model', header: 'Model', render: (r) => <span className="sl-ellipsis" style={{ display: 'inline-block', maxWidth: 260 }}>{modelLabel(r.model) ?? '—'}</span> },
    {
      key: 'tokens',
      header: 'Tokens in / out',
      sortable: true,
      sortValue: (r) => (r.tokensIn ?? 0) + (r.tokensOut ?? 0),
      render: (r) => (
        <span className="sl-mono">
          {int(r.tokensIn)} / {int(r.tokensOut)}
        </span>
      ),
    },
    { key: 'cost', header: 'Cost', sortable: true, sortValue: (r) => r.costUsd ?? -1, render: (r) => <span className="sl-mono">{money(r.costUsd, { precise: true })}</span> },
    { key: 'ms', header: 'Latency', sortable: true, sortValue: (r) => r.ms ?? -1, render: (r) => <span className="sl-mono">{ms(r.ms)}</span> },
    {
      key: 'ok',
      header: 'Result',
      render: (r) => (
        <span className="sl-row-nowrap">
          <StatusChip tone={r.ok ? 'success' : 'danger'} size="sm">
            {r.ok ? 'ok' : 'failed'}
          </StatusChip>
          {r.mode ? (
            <StatusChip tone={r.mode === 'live' ? 'neutral' : 'info'} size="sm" pulse={false}>
              {r.mode}
            </StatusChip>
          ) : null}
        </span>
      ),
    },
    { key: 'run', header: 'Run', render: (r) => (r.runId ? <MonoId value={r.runId} keep={8} /> : <span className="sl-subtle">—</span>) },
    { key: 'ops', header: 'Agent Ops', render: (r) => <OpsLinks runId={r.runId} /> },
  ];

  return (
    <div className="sl-page">
      <AppPageHeader
        title="Health & cost"
        dataAsOf={health.dataAsOf}
        actions={
          <Link to={LOGS} className={styles.opsButton}>
            View logs &amp; traces in Agent Ops
            <IconArrowUpRight size={14} />
          </Link>
        }
      />

      <div className={styles.kpis}>
        <MetricStrip
          minItemWidth={170}
          aria-label="Health KPIs"
          items={[
            { label: 'Live AI spend', value: money(b.spentUsd, { precise: true }), unit: `of ${money(b.limitUsd, { precise: true })}`, sub: `${(pctUsed * 100).toFixed(1)}% of the viewer cap` },
            { label: 'Live runs', value: int(b.liveRuns), unit: 'runs', sub: `${int(b.replayRuns)} replays did not spend` },
            { label: 'AI calls · 14d', value: int(calls), unit: 'calls', sub: missing ? `${collected.length} of ${ledger.length} days collected` : `${ledger.length} of ${ledger.length} days collected` },
            { label: 'p95 latency', value: latest?.p95Ms != null ? (latest.p95Ms / 1000).toFixed(2) : '—', unit: 's', sub: latest?.p50Ms != null ? `p50 ${(latest.p50Ms / 1000).toFixed(2)} s · latest day` : 'no latency collected' },
            { label: 'Failed calls', value: int(failures), unit: `of ${int(calls)}`, sub: `${calls ? ((failures / calls) * 100).toFixed(1) : '—'}% · ${h.dlq.length} parked in DLQ`, accent: failures ? 'var(--cn-danger-txt)' : undefined },
          ]}
        />
      </div>

      <div className={styles.topGrid}>
        <Panel
          title="Live AI budget"
          sub="One shared cap for every viewer of this demo. The provider key has the same hard limit as a backstop."
          anchor={tourAnchor('health.budget')}
        >
          <div className="sl-stack-lg">
            <p className={styles.budgetLine}>
              Live AI budget: <strong className="sl-mono">{money(b.spentUsd, { precise: true })}</strong> of{' '}
              <strong className="sl-mono">{money(b.limitUsd, { precise: true })}</strong> used · <span className="sl-num">{int(b.liveRuns)}</span> live runs
            </p>
            <LadderGauge
              ladder={ladder}
              currency="USD"
              configIsLive
              label="Live AI budget"
              copy={
                b.liveEnabled ? (
                  <>
                    Next rung at <span className="sl-mono sl-strong">{money(ladder.nextThreshold, { precise: true })}</span>. At{' '}
                    <span className="sl-mono">{money(b.limitUsd, { precise: true })}</span> live AI switches off atomically and every run replays a recorded live run at real speed,
                    labelled as a replay. Nothing breaks.
                  </>
                ) : (
                  <>Budget reached: runs now replay recorded live runs at real speed. Custom uploads are paused and say why.</>
                )
              }
            />
            <div className="sl-row">
              <StatusChip tone={b.liveEnabled ? 'success' : 'warning'} size="md" pulse={b.liveEnabled}>
                {b.liveEnabled ? 'Live AI on' : 'Replay mode'}
              </StatusChip>
              <span className="sl-meta">
                ~{money(b.liveRuns ? b.spentUsd / b.liveRuns : null, { precise: true })} per live run (estimate from spend ÷ runs) · ~{int(b.liveRuns ? Math.floor((b.limitUsd - b.spentUsd) / (b.spentUsd / b.liveRuns)) : null)} runs of headroom
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Daily AI spend"
          sub={`Last ${ledger.length} days · ${money(cost14, { precise: true })} collected · median ${money(med, { precise: true })} per day`}
          actions={
            <a href="#recent-calls" className="sl-caption">
              Calls behind this ›
            </a>
          }
        >
          {collected.length === 0 ? (
            <EmptyState variant="not-yet-collected" title="No spend collected yet" description="The ledger fills as soon as the first live run calls a model." />
          ) : (
            <div className="sl-stack">
              <DailySpendField days={days} median={null} pace={null} currency="USD" />
              {missing ? (
                <span className="sl-caption">
                  {missing} day{missing === 1 ? '' : 's'} with no ledger rows is drawn hatched: unknown, not $0.
                </span>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <div className="sl-grid-2">
        <Panel
          title="Latency per day"
          sub="End-to-end AI call latency, p50 and p95. Gaps are days with nothing collected."
          actions={
            <Link to={LOGS} className="sl-caption">
              Slow calls in Agent Ops ›
            </Link>
          }
        >
          <div className={styles.chart} role="img" aria-label="Latency per day: p50 and p95 in seconds">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--cn-grid)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={{ stroke: 'var(--cn-border)' }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`} width={44} />
                <Tooltip content={<ChartTooltip fmt={(v) => ms(v)} />} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="p50" name="p50" stroke="var(--cn-chart-1)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p95" name="p95" stroke="var(--cn-chart-3)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Calls and failures per day"
          sub="Failed calls retried with backoff, then fell back to the secondary model; anything still failing is parked in the DLQ."
          actions={
            <a href="#dlq" className="sl-caption">
              Dead-letter queue ›
            </a>
          }
        >
          <div className={styles.chart} role="img" aria-label="AI calls per day split into succeeded and failed">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--cn-grid)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={{ stroke: 'var(--cn-border)' }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                <Tooltip content={<ChartTooltip fmt={(v) => int(v)} />} cursor={{ fill: 'var(--cn-row-hover)' }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ok" name="Succeeded" stackId="a" fill="var(--cn-chart-1)" isAnimationActive={false} />
                <Bar dataKey="failed" name="Failed" stackId="a" fill="var(--cn-danger)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        id="dlq"
        title="Dead-letter queue"
        sub={`${h.dlq.length} item${h.dlq.length === 1 ? '' : 's'} parked after retries and model fallback. A partial failure reads as a failure.`}
        flush
      >
        <DataTable<DlqRow>
          columns={dlqCols}
          rows={h.dlq}
          getRowKey={(r) => r.id}
          pagination="when-needed"
          rowTone={() => 'red'}
          caption="Dead-letter queue"
          empty={<EmptyState variant="no-data" title="Nothing parked" description="Every step either succeeded or recovered on retry." />}
        />
      </Panel>

      <Panel
        id="recent-calls"
        title="Recent AI calls"
        sub={`Latest ${h.recent.length} model calls with tokens, cost and latency.`}
        actions={
          <Link to={LOGS} className="sl-caption">
            All calls in Agent Ops ›
          </Link>
        }
        flush
      >
        <DataTable<AiCallRow>
          columns={recentCols}
          rows={h.recent}
          getRowKey={(r) => r.id}
          pagination="when-needed"
          initialSort={{ key: 'at', direction: 'desc' }}
          rowTone={(r) => (r.ok ? null : 'red')}
          caption="Recent AI calls"
          empty={<EmptyState variant="not-yet-collected" title="No AI calls yet" description="Calls appear here as soon as a live run reaches the screen step." />}
        />
      </Panel>

      {missing ? (
        <Callout tone="neutral" title="Why some days are hatched">
          The ledger is written per model call. A day with no rows is shown as a gap, never as $0, because "nothing recorded" and "nothing spent" are different facts.
        </Callout>
      ) : null}
    </div>
  );
}

