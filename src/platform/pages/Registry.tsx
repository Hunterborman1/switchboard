/**
 * Agent registry: every agent in production or on its way there, its owner, its next review
 * and how it scores against the agent standard.
 */
import { Link, useNavigate } from 'react-router-dom';
import { ButtonLink, Callout, Card, Page, PageHeader, Table } from '../../ds';
import { IconExternal } from '../../ds/icons';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import type { RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { AgentCell, AgentStatus, canOpenAgent, GoCell, GoHead, LoadError, OpsSkeleton, ReviewBadge, Score, SortHead, useOpsTitle, useSorted } from '../ui/kit';

export function Registry() {
  useOpsTitle('Agent registry');
  const reg = useApi<RegistryRow[]>('/agents', { pollMs: 30_000 });
  const navigate = useNavigate();
  const { sorted, state, by } = useSorted<RegistryRow>(
    reg.data ?? [],
    {
      name: (r) => r.name,
      owner: (r) => r.ownerName,
      status: (r) => r.status,
      review: (r) => r.nextReview,
      std: (r) => r.standardScore.passed,
      hours: (r) => r.hours30d,
      cost: (r) => r.cost30d,
    },
    { key: 'name', dir: 'asc' },
  );

  if (reg.error && !reg.data)
    return (
      <Page>
        <LoadError error={reg.error} onRetry={reg.reload} what="the registry" />
      </Page>
    );
  if (!reg.data) return <OpsSkeleton stats={false} />;
  const rows = reg.data;
  const prod = rows.filter((r) => r.status === 'production').length;

  return (
    <Page>
      <PageHeader
        title="Agent registry"
        description="Every agent, its owners, its next review and its score against the standard."
        meta={
          <>
            <span>
              {rows.length} agents, {prod} in production
            </span>
            <span>Updated {f.ago(reg.dataAsOf)}</span>
          </>
        }
        actions={<ButtonLink to="/ops/standard/checklist">What a new agent needs</ButtonLink>}
      />

      <Card flush attrs={tourAnchor('ops.registry')}>
        <Table label="Agent registry">
          <thead>
            <tr>
              <SortHead active={state('name')} onSort={() => by('name')}>
                Agent
              </SortHead>
              <SortHead className="ao-hide-sm" active={state('owner')} onSort={() => by('owner')}>
                Owners
              </SortHead>
              <SortHead className="ao-hide-md" active={state('status')} onSort={() => by('status')}>
                Status
              </SortHead>
              <SortHead className="ao-hide-sm" active={state('review')} onSort={() => by('review')}>
                Next review
              </SortHead>
              <SortHead active={state('std')} onSort={() => by('std', true)} help="How many of the nine agent standard checks this agent passes.">
                Standard
              </SortHead>
              <SortHead num className="ao-hide-sm ao-hide-md" active={state('hours')} onSort={() => by('hours', true)}>
                Hours saved, 30 days
              </SortHead>
              <SortHead num className="ao-hide-sm ao-hide-lg" active={state('cost')} onSort={() => by('cost', true)}>
                AI cost, 30 days
              </SortHead>
              <th className="ao-hide-sm ao-hide-md">
                <span className="ds-sr-only">Open the agent</span>
              </th>
              <GoHead />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              // A simulated agent is a plain row: no link, hover or pointer (see canOpenAgent).
              const opens = canOpenAgent(r.id, rows);
              const cell = <AgentCell color={f.seriesColor(r.profile.color)} primary={r.name} secondary={`${r.department}, ${r.builtWith === 'Code' ? 'code' : r.builtWith}`} source={r.source} />;
              return (
                <tr
                  key={r.id}
                  className={opens ? 'is-clickable has-row-link' : undefined}
                  onClick={opens ? () => navigate(`/ops/agents/${r.id}`) : undefined}
                  data-agent={r.id}
                  data-opens={opens}
                  {...(r.id === SIGNAL_LOOP_AGENT_ID ? tourAnchor('ops.registry.signal') : {})}
                >
                  <td className="ao-agent-col">
                    {opens ? (
                      <Link to={`/ops/agents/${r.id}`} className="ds-table__link" onClick={(e) => e.stopPropagation()}>
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                  <td className="ao-hide-sm is-nowrap">
                    <span className="ds-table__primary">{r.ownerName}</span>
                    <span className="ds-table__secondary">{r.businessOwner.replace(/ \(.*/, '')}</span>
                  </td>
                  <td className="is-nowrap ao-hide-md">
                    <AgentStatus value={r.status} />
                  </td>
                  <td className="ao-hide-sm is-nowrap">
                    <ReviewBadge value={r.reviewStatus} />
                    <span className="ds-table__secondary">
                      {f.day(r.nextReview)}, every {r.reviewCadenceDays} days
                    </span>
                  </td>
                  <td className="is-nowrap">
                    <Score passed={r.standardScore.passed} total={r.standardScore.total} />
                  </td>
                  <td className="is-num ao-hide-sm ao-hide-md">{f.hours(r.hours30d)}</td>
                  <td className="is-num ao-hide-sm ao-hide-lg">{f.money(r.cost30d)}</td>
                  <td className="ao-hide-sm ao-hide-md is-shrink">
                    {opens && r.href ? (
                      <ButtonLink to={r.href} size="sm" variant="ghost" iconRight={<IconExternal size={13} />} onClick={(e) => e.stopPropagation()} title={`Open ${r.name} itself`}>
                        Open
                      </ButtonLink>
                    ) : null}
                  </td>
                  <GoCell opens={opens} />
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Callout title="Built where the work happens.">
        Agents are built in Claude, Gumloop and Databricks, or in code. Each reports to Agent Ops the same way and is reviewed against the same nine checks.
      </Callout>
    </Page>
  );
}
