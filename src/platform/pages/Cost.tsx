import { Link } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { CostReport, RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Legend, Lines } from '../ui/charts';
import { AgentDot, Callout, ErrorState, PageHead, PageSkeleton, Panel, SourceChip, Table } from '../ui/kit';

function Meter({ value, max, warnAt = 0.8, label }: { value: number; max: number; warnAt?: number; label: string }) {
  const r = max > 0 ? value / max : 0;
  const color = r >= 1 ? 'var(--cn-danger)' : r >= warnAt ? '#B45309' : 'var(--ao-indigo)';
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 120 }}>
      <div className="ao-budget-track" role="img" aria-label={`${label}: ${Math.round(r * 100)}%`}>
        <span style={{ width: `${Math.min(1, r) * 100}%`, background: color }} />
      </div>
      <span className="ao-muted ao-num" style={{ fontSize: 'var(--fs-micro)' }}>
        {f.money(value)} of {f.money(max)} · {f.pct(r)}
      </span>
    </div>
  );
}

export function Cost() {
  const c = useApi<CostReport>('/cost', { pollMs: 30_000 });
  const reg = useApi<RegistryRow[]>('/agents');
  const { timezone } = useTimezone();
  if (c.error && !c.data) return <div className="ao-page"><ErrorState message={c.error.message} onRetry={c.reload} /></div>;
  if (!c.data) return <PageSkeleton />;
  const d = c.data;
  const colors = Object.fromEntries((reg.data ?? []).map((r) => [r.id, r.profile.color]));
  const lb = d.liveBudget;
  const lr = lb.limitUsd > 0 ? lb.spentUsd / lb.limitUsd : 0;
  const series = d.agents.map((a) => ({ key: a.agentId, label: a.name, color: colors[a.agentId] ?? '#5E74E3' }));
  const trend = d.days.map((day, i) => {
    const row: Record<string, unknown> = { label: f.day(day), day };
    for (const a of d.agents) row[a.agentId] = a.daily[i] ?? null;
    return row;
  });
  const roi = d.totals.costUsd > 0 ? d.totals.valueUsd / d.totals.costUsd : null;

  return (
    <div className="ao-page">
      <PageHead
        eyebrow="Agent Ops · Observe"
        title="Cost"
        sub="AI spend per agent and per unit of work, against each agent’s budget cap, with Signal Loop’s real $15 demo cap read from live telemetry."
        meta={<span>{f.range(d.range.from, d.range.to)} · data as of {f.ago(c.dataAsOf)}</span>}
      />

      <Callout tone="warning" title="Estimates, not billing data.">
        Cost is metered per AI call from provider token usage (what the SDK reports), not an invoice. Simulated agents’ spend is simulated; Signal Loop’s live spend is real.
      </Callout>

      <MetricStrip
        minItemWidth={150}
        label="Cost totals"
        items={[
          { label: 'AI cost', value: f.money(d.totals.costUsd), sub: 'period, all agents' },
          { label: 'Month to date', value: f.money(d.totals.monthToDateUsd), sub: `of ${f.money(d.totals.monthlyBudgetUsd)} in monthly caps` },
          { label: 'Work units', value: f.int(d.totals.workUnits), sub: d.totals.workUnits ? `${f.money(d.totals.costUsd / d.totals.workUnits, { precise: true })} per unit, blended` : '—' },
          { label: 'Value per $1', value: <><span className="ao-est">~</span>{roi == null ? '—' : f.money(roi)}</>, sub: 'estimated value ÷ AI cost' },
        ]}
      />

      <div className="ao-grid g-main-r">
        <Panel title="Signal Loop live-AI budget" source="live" sub="The hard cap on real model spend by everyone using this demo. At the cap, live AI switches off and runs replay recorded results.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 'var(--fs-metric-xl)', fontWeight: 300, lineHeight: 1 }} className="ao-num" data-testid="live-budget-spent">
                {f.money(lb.spentUsd, { precise: lb.spentUsd < 10 })}
              </b>
              <span className="ao-muted">of {f.money(lb.limitUsd)} used</span>
            </div>
            <div style={{ position: 'relative' }}>
              <div className="ao-budget-track" style={{ height: 14, borderRadius: 7 }} role="img" aria-label={`Live AI budget ${Math.round(lr * 100)}% used`}>
                <span style={{ width: `${Math.min(1, lr) * 100}%`, background: lr >= 1 ? 'var(--cn-danger)' : lr >= 0.8 ? '#B45309' : 'var(--ao-series-sl)', borderRadius: 7 }} />
              </div>
              {[0.5, 0.8].map((m) => (
                <span key={m} aria-hidden="true" style={{ position: 'absolute', left: `${m * 100}%`, top: -3, height: 20, width: 2, background: '#102A56', borderRadius: 1, opacity: 0.55 }} />
              ))}
              <div className="ao-budget-lbl" style={{ marginTop: 6 }}>
                <span>$0</span>
                <span>alert at 80% ({f.money(lb.limitUsd * 0.8)})</span>
                <span>{f.money(lb.limitUsd)} cap</span>
              </div>
            </div>
            <dl className="ao-kv">
              <dt>Live AI calls</dt>
              <dd className="ao-num">{f.int(lb.liveCalls)}</dd>
              <dt>Last call</dt>
              <dd>{lb.lastCallAt ? `${f.time(lb.lastCallAt, timezone)} (${f.ago(lb.lastCallAt)})` : 'No live AI calls yet'}</dd>
              <dt>Enforced by</dt>
              <dd>A D1 ledger checked before each run, plus the provider-side key limit as a backstop.</dd>
            </dl>
            <Link to="/app/health" className="ao-link" style={{ fontSize: 'var(--fs-body-sm)' }}>
              Signal Loop’s own budget ledger →
            </Link>
          </div>
        </Panel>

        <Panel title="Daily AI spend by agent" source="mixed" sub="Gaps are days with no data for that agent (before launch or beyond its history), never drawn as $0.">
          <Legend series={series} />
          <Lines
            data={trend}
            x="label"
            series={series}
            height={240}
            yFormat={(v) => `$${v < 10 ? v.toFixed(v < 1 ? 2 : 1) : Math.round(v)}`}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => (v == null ? 'no data' : f.money(v, { precise: v < 1 }))}
            ariaLabel="Daily AI spend by agent"
          />
        </Panel>
      </div>

      <Panel title="Cost per agent and per unit" source="mixed" sub="Cost per unit against each agent’s SLO ceiling, and month-to-date spend against its cap." flush attrs={tourAnchor('ops.cost')}>
        <Table
          caption="Cost per agent"
          rows={d.agents}
          rowKey={(r) => r.agentId}
          defaultSort={{ key: 'cost', dir: 'desc' }}
          cols={[
            {
              key: 'name',
              header: 'Agent',
              sort: (r) => r.name,
              render: (r) => (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <AgentDot color={colors[r.agentId] ?? '#5E74E3'} />
                  <div className="cell-title">
                    <Link className="row-link" to={`/ops/agents/${r.agentId}`}>
                      {r.name}
                    </Link>
                    <small>
                      {r.builtWith} · per {r.unitLabel}
                    </small>
                  </div>
                </div>
              ),
            },
            { key: 'src', mobileHide: true, header: 'Data', render: (r) => <SourceChip source={r.source === 'live' ? 'mixed' : 'simulated'} label={r.source === 'live' ? 'Live + history' : 'Simulated'} /> },
            { key: 'units', mobileHide: true, header: 'Units', num: true, sort: (r) => r.workUnits, render: (r) => f.int(r.workUnits) },
            { key: 'cost', header: 'AI cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd) },
            {
              key: 'cpu',
              header: 'Per unit (target)',
              num: true,
              sort: (r) => r.costPerUnitUsd,
              render: (r) => (
                <span title={`Ceiling ${f.money(r.targetPerUnitUsd, { precise: true })}`}>
                  <b style={{ fontWeight: 500, color: r.costPerUnitUsd != null && r.costPerUnitUsd > r.targetPerUnitUsd ? 'var(--cn-danger-txt)' : undefined }}>{f.money(r.costPerUnitUsd, { precise: true })}</b>{' '}
                  <span className="ao-muted">({f.money(r.targetPerUnitUsd, { precise: true })})</span>
                </span>
              ),
            },
            { key: 'mtd', mobileHide: true, header: 'Month to date vs cap', sort: (r) => r.monthToDateUsd / (r.monthlyBudgetUsd || 1), render: (r) => <Meter value={r.monthToDateUsd} max={r.monthlyBudgetUsd} label={`${r.name} month to date`} /> },
            { key: 'cap', mobileHide: true, header: 'Per-run cap', num: true, sort: (r) => r.perRunCapUsd, render: (r) => f.money(r.perRunCapUsd) },
            { key: 'value', mobileHide: true, header: 'Value', num: true, sort: (r) => r.valueUsd, render: (r) => f.money(r.valueUsd, { est: true }) },
          ]}
        />
      </Panel>

      <Panel title="Spend by model" source="mixed" sub="Model ids as reported on each AI call." flush>
        <Table
          caption="Spend by model"
          compact
          rows={d.byModel}
          rowKey={(r) => r.model}
          defaultSort={{ key: 'cost', dir: 'desc' }}
          cols={[
            { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => <span className="ao-mono">{r.model}</span> },
            { key: 'calls', mobileHide: true, header: 'Calls', num: true, sort: (r) => r.calls, render: (r) => f.int(r.calls) },
            { key: 'cost', header: 'Cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd, { precise: r.costUsd < 1 }) },
            { key: 'per', header: 'Per call', num: true, sort: (r) => (r.calls ? r.costUsd / r.calls : 0), render: (r) => f.money(r.calls ? r.costUsd / r.calls : null, { precise: true }) },
          ]}
        />
      </Panel>
    </div>
  );
}
