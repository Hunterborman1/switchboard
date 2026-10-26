/**
 * Cost: what each agent spends on AI, per task and against its monthly cap, and the real
 * spending cap on this demo's live AI.
 */
import { Link } from 'react-router-dom';
import { Callout, Card, KeyValue, Meter, Page, PageHeader, Stats, Table } from '../../ds';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { CostReport, RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { ChartLegend, ChartSummary, Lines } from '../ui/charts';
import { InfoTip } from '../ui/InfoTip';
import { AgentCell, LoadError, ModelName, OpsSkeleton, SortHead, SourceBadge, SpendMeter, useOpsTitle, useSorted } from '../ui/kit';

export function Cost() {
  useOpsTitle('Cost');
  const c = useApi<CostReport>('/cost', { pollMs: 30_000 });
  const reg = useApi<RegistryRow[]>('/agents');
  const { timezone } = useTimezone();
  if (c.error && !c.data)
    return (
      <Page>
        <LoadError error={c.error} onRetry={c.reload} what="cost" />
      </Page>
    );
  if (!c.data) return <OpsSkeleton />;
  const d = c.data;
  const agentNames = Object.fromEntries((reg.data ?? []).map((r) => [r.id, r.name]));
  const colors = Object.fromEntries((reg.data ?? []).map((r, i) => [r.id, f.seriesColor(r.profile.color, i)]));
  const lb = d.liveBudget;
  const lr = lb.limitUsd > 0 ? lb.spentUsd / lb.limitUsd : 0;
  const series = d.agents.map((a, i) => ({ key: a.agentId, label: a.name, color: colors[a.agentId] ?? f.seriesColor(null, i) }));
  const trend = d.days.map((day, i) => {
    const row: Record<string, unknown> = { label: f.day(day), day };
    for (const a of d.agents) row[a.agentId] = a.daily[i] ?? null;
    return row;
  });
  const roi = d.totals.costUsd > 0 ? d.totals.valueUsd / d.totals.costUsd : null;
  const topSpender = [...d.agents].sort((a, b) => b.costUsd - a.costUsd)[0];

  return (
    <Page>
      <PageHeader
        title="Cost"
        description="What each agent spends on AI, per task and against its monthly cap."
        meta={
          <>
            <span>{f.range(d.range.from, d.range.to)}</span>
            <span>Updated {f.ago(c.dataAsOf)}</span>
          </>
        }
      />

      <Callout title="Estimates, not billing data.">Cost adds up the token usage each AI call reports. The simulated agent’s spend is simulated; Signal Loop’s is real.</Callout>

      <Stats
        items={[
          { label: 'AI cost', value: f.money(d.totals.costUsd), sub: 'This period, all agents' },
          { label: 'Month to date', value: f.money(d.totals.monthToDateUsd), sub: `Of ${f.money(d.totals.monthlyBudgetUsd)} in monthly caps` },
          { label: 'Tasks', value: f.int(d.totals.workUnits), sub: d.totals.workUnits ? `${f.money(d.totals.costUsd / d.totals.workUnits, { precise: true })} per task on average` : 'No tasks yet' },
          {
            label: 'Value per $1 of AI',
            value: roi == null ? '—' : f.money(roi),
            sub: 'Estimated',
            info: <InfoTip label="Value per $1 of AI">Estimated value of hours saved divided by AI cost. Leaves out build time and seat licences.</InfoTip>,
          },
        ]}
      />

      <div className="ao-split ao-split--rev ao-split--stretch">
        <Card className="ao-fill" title="Signal Loop live-AI budget" description="The hard cap on real AI spend by everyone using this demo." actions={<SourceBadge source="live" />}>
          <div className="ao-stack">
            <div className="ao-inline" style={{ alignItems: 'baseline' }}>
              <span className="ao-bignum" data-testid="live-budget-spent">
                {f.money(lb.spentUsd, { precise: lb.spentUsd > 0 && lb.spentUsd < 10 })}
              </span>
              <span className="ao-note">of {f.money(lb.limitUsd)} used</span>
            </div>
            <div className="ao-budget">
              <Meter value={Math.min(lb.spentUsd, lb.limitUsd)} max={lb.limitUsd || 1} tone={lr >= 1 ? 'danger' : lr >= 0.8 ? 'warning' : 'accent'} label={`Live AI budget ${Math.round(lr * 100)}% used`} />
              <div className="ao-budget__row">
                <span>{Math.round(lr * 100)}% used</span>
                <span>Alert at 80% ({f.money(lb.limitUsd * 0.8)})</span>
              </div>
            </div>
            <KeyValue
              items={[
                { label: 'Live AI calls', value: f.int(lb.liveCalls) },
                { label: 'Last call', value: lb.lastCallAt ? `${f.time(lb.lastCallAt, timezone)}, ${f.ago(lb.lastCallAt)}` : 'No live AI calls yet' },
                { label: 'At the cap', value: 'Live AI switches off and runs replay recorded results.' },
                { label: 'Enforced by', value: 'A ledger checked before every run, with a limit on the provider key as a backstop.' },
              ]}
            />
            <Link to="/app/health" style={{ fontSize: 13, fontWeight: 500 }}>
              Open the budget ledger in Switchboard
            </Link>
          </div>
        </Card>

        <Card className="ao-fill" title="Daily AI spend by agent" description="A gap is a day with no data for that agent, not $0.">
          <ChartLegend series={series} />
          <Lines
            data={trend}
            x="label"
            series={series}
            height={240}
            yFormat={(v) => (Number.isInteger(v) ? `$${v}` : `$${v.toFixed(v < 1 ? 2 : 1)}`)}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => (v == null ? 'No data' : f.money(v, { precise: v < 1 }))}
            ariaLabel="Daily AI spend by agent"
          />
          <ChartSummary>
            {f.money(d.totals.costUsd)} over {d.days.length} days{topSpender ? `; ${topSpender.name} spent the most, ${f.money(topSpender.costUsd)}` : ''}.
          </ChartSummary>
        </Card>
      </div>

      <AgentCostTable d={d} colors={colors} />
      <ModelCostTable d={d} names={agentNames} />
    </Page>
  );
}

function AgentCostTable({ d, colors }: { d: CostReport; colors: Record<string, string> }) {
  const { sorted, state, by } = useSorted(
    d.agents,
    {
      name: (r) => r.name,
      units: (r) => r.workUnits,
      cost: (r) => r.costUsd,
      cpu: (r) => r.costPerUnitUsd,
      mtd: (r) => r.monthToDateUsd / (r.monthlyBudgetUsd || 1),
      cap: (r) => r.perRunCapUsd,
      value: (r) => r.valueUsd,
    },
    { key: 'cost', dir: 'desc' },
  );
  return (
    <Card title="Cost per agent and per task" description="Cost per task against each agent’s target, and this month’s spend against its cap." flush attrs={tourAnchor('ops.cost')}>
      <Table label="Cost per agent">
        <thead>
          <tr>
            <SortHead active={state('name')} onSort={() => by('name')}>
              Agent
            </SortHead>
            <th className="ao-hide-sm ao-hide-lg">Data</th>
            <SortHead num className="ao-hide-sm" active={state('units')} onSort={() => by('units', true)}>
              Tasks
            </SortHead>
            <SortHead num active={state('cost')} onSort={() => by('cost', true)}>
              AI cost
            </SortHead>
            <SortHead num className="ao-end-sm" active={state('cpu')} onSort={() => by('cpu', true)} help="Average AI cost of one task, with the agent’s target in brackets.">
              Per task
            </SortHead>
            <SortHead className="ao-hide-sm ao-end-md" active={state('mtd')} onSort={() => by('mtd', true)}>
              This month against cap
            </SortHead>
            <SortHead num className="ao-hide-sm ao-hide-md ao-end-lg" active={state('cap')} onSort={() => by('cap', true)}>
              Per-run cap
            </SortHead>
            <SortHead num className="ao-hide-sm ao-hide-lg" active={state('value')} onSort={() => by('value', true)}>
              Estimated value
            </SortHead>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const over = r.costPerUnitUsd != null && r.costPerUnitUsd > r.targetPerUnitUsd;
            return (
              <tr key={r.agentId}>
                <td className="ao-agent-col">
                  <Link to={`/ops/agents/${r.agentId}`} className="ds-table__link">
                    <AgentCell color={colors[r.agentId] ?? f.seriesColor(null, i)} primary={r.name} secondary={`${r.builtWith}, per ${r.unitLabel}`} />
                  </Link>
                </td>
                <td className="ao-hide-sm ao-hide-lg is-nowrap">
                  <SourceBadge source={r.source === 'live' ? 'mixed' : 'simulated'} />
                </td>
                <td className="is-num ao-hide-sm">{f.int(r.workUnits)}</td>
                <td className="is-num">{f.money(r.costUsd)}</td>
                <td className="is-num ao-end-sm" title={`Target ${f.money(r.targetPerUnitUsd, { precise: true })} or less`}>
                  <span style={over ? { color: 'var(--danger)', fontWeight: 500 } : undefined}>{f.money(r.costPerUnitUsd, { precise: true })}</span>{' '}
                  <span className="ds-subtle">({f.money(r.targetPerUnitUsd, { precise: true })})</span>
                </td>
                <td className="ao-hide-sm ao-end-md">
                  <SpendMeter value={r.monthToDateUsd} max={r.monthlyBudgetUsd} label={`${r.name} this month`} format={(v) => f.money(v)} />
                </td>
                <td className="is-num ao-hide-sm ao-hide-md ao-end-lg">{f.money(r.perRunCapUsd)}</td>
                <td className="is-num ao-hide-sm ao-hide-lg">{f.money(r.valueUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

function ModelCostTable({ d, names }: { d: CostReport; names: Record<string, string> }) {
  const { sorted, state, by } = useSorted(d.byModel, { model: (r) => r.model, calls: (r) => r.calls, cost: (r) => r.costUsd, per: (r) => (r.calls ? r.costUsd / r.calls : 0) }, { key: 'cost', dir: 'desc' });
  return (
    <Card title="Spend by model" description="By the model’s role, as reported on each AI call. Exact model names are in Switchboard settings." flush>
      <Table label="Spend by model" compact>
        <thead>
          <tr>
            <SortHead active={state('model')} onSort={() => by('model')}>
              Model
            </SortHead>
            <SortHead num className="ao-hide-sm" active={state('calls')} onSort={() => by('calls', true)}>
              Calls
            </SortHead>
            <SortHead num active={state('cost')} onSort={() => by('cost', true)}>
              Cost
            </SortHead>
            <SortHead num active={state('per')} onSort={() => by('per', true)}>
              Per call
            </SortHead>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.model}>
              <td>
                <ModelName id={r.model} names={names} />
              </td>
              <td className="is-num ao-hide-sm">{f.int(r.calls)}</td>
              <td className="is-num">{f.money(r.costUsd, { precise: r.costUsd < 1 })}</td>
              <td className="is-num">{f.money(r.calls ? r.costUsd / r.calls : null, { precise: true })}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
