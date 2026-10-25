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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 230 }}>
          <AgentDot color={r.profile.color} />
          <div className="cell-title">
            <Link className="row-link" to={`/ops/agents/${r.id}`}>
              {r.name}
            </Link>
            <small style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {r.version} <SourceChip source={r.source === 'live' ? 'live' : 'simulated'} label={r.source === 'live' ? 'Real · live' : 'Simulated'} />
            </small>
          </div>
        </div>
      ),
    },
    { key: 'dept', mobileHide: true, header: 'Department · built with', sort: (r) => r.department, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 400 }}>{r.department}</b><small>{r.builtWith === 'Code' ? 'Code (Workers + AI SDK)' : r.builtWith}</small></div> },
    { key: 'owner', mobileHide: true, header: 'Owner · business owner', sort: (r) => r.ownerName, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap' }}><b style={{ fontWeight: 400 }}>{r.ownerName}</b><small>{r.businessOwner.replace(/ \(.*/, '')}</small></div> },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <AgentStatus value={r.status} /> },
    { key: 'review', header: 'Review', sort: (r) => r.nextReview, render: (r) => <div className="cell-title" style={{ whiteSpace: 'nowrap', justifyItems: 'start' }}><ReviewPill value={r.reviewStatus} /><small>next {f.day(r.nextReview)} · every {r.reviewCadenceDays}d</small></div> },
    { key: 'std', header: 'Standard', sort: (r) => r.standardScore.passed, render: (r) => <Score passed={r.standardScore.passed} total={r.standardScore.total} /> },
    { key: 'runs', mobileHide: true, header: '30d runs', num: true, sort: (r) => r.runs30d, render: (r) => f.int(r.runs30d) },
    { key: 'users', mobileHide: true, header: 'Users', num: true, sort: (r) => r.users30d, render: (r) => f.int(r.users30d) },
    { key: 'hours', mobileHide: true, header: '30d hours', num: true, sort: (r) => r.hours30d, render: (r) => f.hours(r.hours30d) },
    { key: 'cost', mobileHide: true, header: '30d cost', num: true, sort: (r) => r.cost30d, render: (r) => f.money(r.cost30d) },
    { key: 'trend', mobileHide: true, header: 'Hours / wk', render: (r) => <Spark values={r.weeklyHours} color={r.profile.color} label={`${r.name} weekly hours`} width={80} /> },
    {
      key: 'open',
      mobileHide: true,
      header: <span className="ao-sr">Open</span>,
      render: (r) =>
        r.href ? (
          <Link to={r.href} className="ao-btn sm primary" title="Open the agent itself">
            Open <IconArrowUpRight size={12} />
          </Link>
        ) : null,
    },
  ];

  const prod = rows.filter((r) => r.status === 'production').length;
  return (
    <div className="ao-page">
      <PageHead
        eyebrow="Agent Ops · Registry"
        title="Agent registry"
        sub="Every agent in production or on its way there, with a named owner and business owner, a documented purpose and success metric, a review cadence, and its score against the agent standard."
        meta={
          <>
            <span>
              {rows.length} agents · {prod} in production · data as of {f.ago(reg.dataAsOf)}
            </span>
          </>
        }
        actions={
          <Link to="/ops/standard/checklist" className="ao-btn">
            What a new agent needs
          </Link>
        }
      />
      <Panel title="All agents" sub="30-day figures end at the latest data. Select a row for purpose, owners, the standard checklist, SLOs and the changelog." flush attrs={tourAnchor('ops.registry')}>
        <Table
          caption="Agent registry"
          rows={rows}
          cols={cols}
          rowKey={(r) => r.id}
          onRow={(r) => navigate(`/ops/agents/${r.id}`)}
          rowAttrs={(r) => (r.id === SIGNAL_LOOP_AGENT_ID ? { ...tourAnchor('ops.registry.signal'), 'data-agent': r.id } : { 'data-agent': r.id })}
        />
      </Panel>
      <Callout tone="indigo" title="Built where the work happens.">
        Agents here are built in Claude (projects and the API), Gumloop (no-code flows) and Databricks (customer-data agents), plus code where needed. Whatever they are built in, each one reports
        logs, traces, usage and work units to Agent Ops through the same SDK contract, and is reviewed against the same nine-point standard.
      </Callout>
    </div>
  );
}
