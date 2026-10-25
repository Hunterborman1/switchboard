import { Link, useNavigate } from 'react-router-dom';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import type { RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Spark } from '../ui/charts';
import { IconArrowUpRight } from '../ui/icons';
import { AgentDot, AgentStatus, Callout, ErrorState, PageHead, PageSkeleton, Panel, ReviewPill, Score, SourceChip, Table, type Col } from '../ui/kit';

export function Registry() {
  const reg = useApi<RegistryRow[]>('/agents', { pollMs: 30_000 });
  const navigate = useNavigate();
  if (reg.error && !reg.data) return <div className="ao-page"><ErrorState message={reg.error.message} onRetry={reg.reload} /></div>;
  if (!reg.data) return <PageSkeleton kpis={false} />;
  const rows = reg.data;

  const cols: Col<RegistryRow>[] = [
    {
      key: 'name',
      header: 'Agent',
      sort: (r) => r.name,
      render: (r) => (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 190 }}>
          <AgentDot color={f.seriesColor(r.profile.color)} />
          <div className="cell-title">
            <Link className="row-link" to={`/ops/agents/${r.id}`}>
              {r.name}
            </Link>
            <small style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {r.version} <SourceChip source={r.source === 'live' ? 'live' : 'simulated'} label={r.source === 'live' ? 'Live' : 'Simulated'} />
            </small>
          </div>
        </div>
      ),
    },
    { key: 'dept', mobileHide: true, wideHide: true, header: 'Team and tool', sort: (r) => r.department, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 400 }}>{r.department}</b><small>{r.builtWith === 'Code' ? 'Code (Workers + AI SDK)' : r.builtWith}</small></div> },
    { key: 'owner', mobileHide: true, header: 'Owners', sort: (r) => r.ownerName, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 400 }}>{r.ownerName}</b><small>{r.businessOwner.replace(/ \(.*/, '')}</small></div> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <AgentStatus value={r.status} /> },
    { key: 'review', header: 'Review', sort: (r) => r.nextReview, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap', justifyItems: 'start' }}><ReviewPill value={r.reviewStatus} /><small>Next {f.day(r.nextReview)}, every {r.reviewCadenceDays} days</small></div> },
    { key: 'std', header: 'Standard', help: 'How many of the nine agent standard checks this agent passes.', sort: (r) => r.standardScore.passed, render: (r) => <Score passed={r.standardScore.passed} total={r.standardScore.total} /> },
    { key: 'runs', mobileHide: true, wideHide: true, header: 'Runs, 30 days', num: true, sort: (r) => r.runs30d, render: (r) => f.int(r.runs30d) },
    { key: 'users', mobileHide: true, wideHide: true, header: 'People', num: true, sort: (r) => r.users30d, render: (r) => f.int(r.users30d) },
    { key: 'hours', mobileHide: true, header: 'Hours saved, 30 days', num: true, sort: (r) => r.hours30d, render: (r) => f.hours(r.hours30d) },
    { key: 'cost', mobileHide: true, wideHide: true, header: 'AI cost, 30 days', num: true, sort: (r) => r.cost30d, render: (r) => f.money(r.cost30d) },
    { key: 'trend', mobileHide: true, wideHide: true, header: 'Weekly trend', render: (r) => <Spark values={r.weeklyHours} color={f.seriesColor(r.profile.color)} label={`${r.name} weekly hours`} width={80} /> },
    {
      key: 'open',
      mobileHide: true,
      header: <span className="ao-sr">Open</span>,
      render: (r) =>
        r.href ? (
          <Link to={r.href} className="ao-btn sm" title="Open the agent itself">
            Open <IconArrowUpRight size={12} />
          </Link>
        ) : null,
    },
  ];

  const prod = rows.filter((r) => r.status === 'production').length;
  return (
    <div className="ao-page">
      <PageHead
        title="Agent registry"
        sub="Every agent in production or on its way there: who owns it, what it is for, when it is next reviewed, and how it scores against the agent standard."
        meta={<span>{rows.length} agents · {prod} in production · updated {f.ago(reg.dataAsOf)}</span>}
        actions={
          <Link to="/ops/standard/checklist" className="ao-btn">
            What a new agent needs
          </Link>
        }
      />
      <Panel title="All agents" sub="Select an agent for its purpose, owners, standard checklist, service targets and change history." flush attrs={tourAnchor('ops.registry')}>
        <Table
          className="ao-cards"
          caption="Agent registry"
          rows={rows}
          cols={cols}
          rowKey={(r) => r.id}
          onRow={(r) => navigate(`/ops/agents/${r.id}`)}
          rowAttrs={(r) => (r.id === SIGNAL_LOOP_AGENT_ID ? { ...tourAnchor('ops.registry.signal'), 'data-agent': r.id } : { 'data-agent': r.id })}
        />
      </Panel>
      <Callout title="Built where the work happens.">
        Agents are built in Claude, Gumloop (no-code flows) and Databricks, plus code where needed. Whatever the tool, each one reports its activity, usage and tasks to Agent Ops in the same way,
        and is reviewed against the same nine-point standard.
      </Callout>
    </div>
  );
}
