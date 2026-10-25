import { Link } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { CostReport, RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Legend, Lines } from '../ui/charts';
import { AboutNote, AgentDot, ErrorState, ModelName, PageHead, PageSkeleton, Panel, SourceChip, Table } from '../ui/kit';

function Meter({ value, max, warnAt = 0.8, label }: { value: number; max: number; warnAt?: number; label: string }) {
  const r = max > 0 ? value / max : 0;
  const color = r >= 1 ? 'var(--ao-danger)' : r >= warnAt ? 'var(--ao-warning-mark)' : 'var(--ao-accent)';
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 150 }}>
      <div className="ao-budget-track" role="img" aria-label={`${label}: ${Math.round(r * 100)}%`}>
        <span style={{ width: `${Math.min(1, r) * 100}%`, background: color }} />
      </div>
      <span className="ao-muted ao-num" style={{ fontSize: 12 }}>
        {f.money(value)} of {f.money(max)}
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
  const agentNames = Object.fromEntries((reg.data ?? []).map((r) => [r.id, r.name]));
  const colors = Object.fromEntries((reg.data ?? []).map((r, i) => [r.id, f.seriesColor(r.profile.color, i)]));
  const lb = d.liveBudget;
  const lr = lb.limitUsd > 0 ? lb.spentUsd / lb.limitUsd : 0;
  const series = d.agents.map((a) => ({ key: a.agentId, label: a.name, color: colors[a.agentId] ?? '#2F5DB8' }));
  const trend = d.days.map((day, i) => {
    const row: Record<string, unknown> = { label: f.day(day), day };
    for (const a of d.agents) row[a.agentId] = a.daily[i] ?? null;
    return row;
  });
  const roi = d.totals.costUsd > 0 ? d.totals.valueUsd / d.totals.costUsd : null;

  return (
    <div className="ao-page">
      <PageHead
        title="Cost"
        sub="What each agent spends on AI, per task and against its monthly cap, including the real spending cap on this demo."
        meta={<span>{f.range(d.range.from, d.range.to)} · updated {f.ago(c.dataAsOf)}</span>}
      />

      <AboutNote>
        <b>Estimates, not billing data.</b> Cost adds up the token usage each AI call reports; it is not an invoice. The simulated agent’s spend is simulated; Signal Loop’s spend is real.
      </AboutNote>

      <MetricStrip
        minItemWidth={150}
        label="Cost totals"
        items={[
          { label: 'AI cost', value: f.money(d.totals.costUsd), sub: 'This period, all agents' },
          { label: 'Month to date', value: f.money(d.totals.monthToDateUsd), sub: `Of ${f.money(d.totals.monthlyBudgetUsd)} in monthly caps` },
          { label: 'Tasks', value: f.int(d.totals.workUnits), sub: d.totals.workUnits ? `${f.money(d.totals.costUsd / d.totals.workUnits, { precise: true })} per task on average` : '—' },
          { label: 'Value per $1 of AI', value: roi == null ? '—' : f.money(roi), sub: 'Estimated', help: 'Estimated value of hours saved divided by AI cost. Leaves out build time and seat licences.' },
        ]}
      />

      <div className="ao-grid g-main-r">
        <Panel title="Signal Loop live-AI budget" source="live" sub="The hard cap on real AI spend by everyone using this demo. At the cap, live AI switches off and runs replay recorded results.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }} className="ao-num" data-testid="live-budget-spent">
                {f.money(lb.spentUsd, { precise: lb.spentUsd > 0 && lb.spentUsd < 10 })}
              </b>
              <span className="ao-muted">of {f.money(lb.limitUsd)} used</span>
            </div>
            <div style={{ position: 'relative' }}>
              <div className="ao-budget-track" style={{ height: 8, borderRadius: 4 }} role="img" aria-label={`Live AI budget ${Math.round(lr * 100)}% used`}>
                <span style={{ width: `${Math.min(1, lr) * 100}%`, background: lr >= 1 ? 'var(--ao-danger)' : lr >= 0.8 ? 'var(--ao-warning-mark)' : 'var(--ao-accent)', borderRadius: 4 }} />
              </div>
              <span aria-hidden="true" style={{ position: 'absolute', left: '80%', top: -3, height: 14, width: 1, background: 'var(--ao-text-3)' }} />
              <div className="ao-budget-lbl" style={{ marginTop: 6 }}>
                <span>$0</span>
                <span>Alert at 80% ({f.money(lb.limitUsd * 0.8)})</span>
                <span>{f.money(lb.limitUsd)} cap</span>
              </div>
            </div>
            <dl className="ao-kv">
              <dt>Live AI calls</dt>
              <dd className="ao-num">{f.int(lb.liveCalls)}</dd>
              <dt>Last call</dt>
              <dd>{lb.lastCallAt ? `${f.time(lb.lastCallAt, timezone)} (${f.ago(lb.lastCallAt)})` : 'No live AI calls yet'}</dd>
              <dt>Enforced by</dt>
              <dd>A spending ledger checked before every run, with a limit on the provider key as a backstop.</dd>
            </dl>
            <Link to="/app/health" className="ao-link" style={{ fontSize: 13, fontWeight: 500 }}>
              Signal Loop’s own budget ledger →
            </Link>
          </div>
        </Panel>

        <Panel title="Daily AI spend by agent" sub="A gap is a day with no data for that agent, not $0.">
          <Legend series={series} />
          <Lines
            data={trend}
            x="label"
            series={series}
            height={240}
            yFormat={(v) => `$${v < 10 ? v.toFixed(v < 1 ? 2 : 1) : Math.round(v)}`}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => (v == null ? 'No data' : f.money(v, { precise: v < 1 }))}
            ariaLabel="Daily AI spend by agent"
          />
        </Panel>
      </div>

      <Panel title="Cost per agent and per task" sub="Cost per task against each agent’s target, and spend this month against its cap." flush attrs={tourAnchor('ops.cost')}>
        <Table
          caption="Cost per agent"
          className="ao-fit"
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
                  <AgentDot color={colors[r.agentId] ?? '#2F5DB8'} />
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
            { key: 'src', mobileHide: true, wideHide: true, header: 'Data', render: (r) => <SourceChip source={r.source === 'live' ? 'mixed' : 'simulated'} label={r.source === 'live' ? 'Live and simulated' : 'Simulated'} /> },
            { key: 'units', mobileHide: true, header: 'Tasks', num: true, sort: (r) => r.workUnits, render: (r) => f.int(r.workUnits) },
            { key: 'cost', header: 'AI cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd) },
            {
              key: 'cpu',
              header: 'Per task (target)',
              num: true,
              sort: (r) => r.costPerUnitUsd,
              render: (r) => (
                <span title={`Target ${f.money(r.targetPerUnitUsd, { precise: true })} or less`} style={{ whiteSpace: 'nowrap' }}>
                  <b style={{ fontWeight: 500, color: r.costPerUnitUsd != null && r.costPerUnitUsd > r.targetPerUnitUsd ? 'var(--ao-danger)' : undefined }}>{f.money(r.costPerUnitUsd, { precise: true })}</b>{' '}
                  <span className="ao-muted">({f.money(r.targetPerUnitUsd, { precise: true })})</span>
                </span>
              ),
            },
            { key: 'mtd', mobileHide: true, header: 'This month vs cap', sort: (r) => r.monthToDateUsd / (r.monthlyBudgetUsd || 1), render: (r) => <Meter value={r.monthToDateUsd} max={r.monthlyBudgetUsd} label={`${r.name} month to date`} /> },
            { key: 'cap', mobileHide: true, wideHide: true, header: 'Per-run cap', num: true, sort: (r) => r.perRunCapUsd, render: (r) => f.money(r.perRunCapUsd) },
            { key: 'value', mobileHide: true, wideHide: true, header: 'Estimated value', num: true, sort: (r) => r.valueUsd, render: (r) => f.money(r.valueUsd) },
          ]}
        />
      </Panel>

      <Panel title="Spend by model" sub="By the model’s role, as reported on each AI call. Exact model names are in Signal Loop settings." flush>
        <Table
          caption="Spend by model"
          compact
          rows={d.byModel}
          rowKey={(r) => r.model}
          defaultSort={{ key: 'cost', dir: 'desc' }}
          cols={[
            { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => <ModelName id={r.model} names={agentNames} /> },
            { key: 'calls', mobileHide: true, header: 'Calls', num: true, sort: (r) => r.calls, render: (r) => f.int(r.calls) },
            { key: 'cost', header: 'Cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd, { precise: r.costUsd < 1 }) },
            { key: 'per', header: 'Per call', num: true, sort: (r) => (r.calls ? r.costUsd / r.calls : 0), render: (r) => f.money(r.calls ? r.costUsd / r.calls : null, { precise: true }) },
          ]}
        />
      </Panel>
    </div>
  );
}
