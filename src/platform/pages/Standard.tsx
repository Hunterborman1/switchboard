/**
 * The agent standard: every agent against the nine checks (with evidence), the review
 * calendar, and the checklist a new agent follows before production.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Callout, Card, EmptyState, Page, PageHeader, TabLinks, Table, useCrumbs } from '../../ds';
import { IconCheck, IconCheckCircle, IconChevronRight, IconX } from '../../ds/icons';
import type { RegistryRow, ReviewRow, StandardReport } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { agentSource, AgentSourceBadge, AgentStatus, LoadError, OpsSkeleton, ReviewBadge, Score, SortHead, useOpsTitle, useSorted } from '../ui/kit';

const TAB_LABEL = { matrix: 'Standard matrix', reviews: 'Review calendar', checklist: 'New agent checklist' } as const;

export function Standard() {
  const { pathname } = useLocation();
  const tab = pathname.endsWith('/reviews') ? 'reviews' : pathname.endsWith('/checklist') ? 'checklist' : 'matrix';
  useOpsTitle(TAB_LABEL[tab]);
  useCrumbs(tab === 'matrix' ? null : [{ label: TAB_LABEL[tab] }], [tab]);
  return (
    <Page>
      <PageHeader title="Agent standard and reviews" description="Nine checks every agent is held to, whoever built it, each with evidence." />
      <TabLinks
        label="Standard and reviews sections"
        items={[
          {
            to: '/ops/standard',
            end: true,
            label: (
              <>
                <span className="ao-tab-long">Standard matrix</span>
                <span className="ao-tab-short">Matrix</span>
              </>
            ),
          },
          {
            to: '/ops/standard/reviews',
            label: (
              <>
                <span className="ao-tab-long">Review calendar</span>
                <span className="ao-tab-short">Reviews</span>
              </>
            ),
          },
          {
            to: '/ops/standard/checklist',
            label: (
              <>
                <span className="ao-tab-long">New agent checklist</span>
                <span className="ao-tab-short">New agent</span>
              </>
            ),
          },
        ]}
      />
      {tab === 'matrix' ? <Matrix /> : tab === 'reviews' ? <Reviews /> : <Checklist />}
    </Page>
  );
}

const SHORT: Record<string, string> = {
  owner: 'Owners',
  purpose: 'Purpose and metric',
  data_review: 'Security review',
  evals: 'Tested before release',
  logging: 'Logs and traces',
  cost_cap: 'Spend cap',
  human_review: 'Human review',
  rollback: 'Rollback plan',
  review_cadence: 'Review schedule',
};

function Matrix() {
  const s = useApi<StandardReport>('/standard');
  const reg = useApi<RegistryRow[]>('/agents');
  const [sel, setSel] = useState<{ agentId: string; key: string } | null>(null);
  if (s.error && !s.data) return <LoadError error={s.error} onRetry={s.reload} what="the standard" />;
  if (!s.data) return <OpsSkeleton stats={false} />;
  const { checks, matrix } = s.data;
  const selRow = sel ? matrix.find((m) => m.agentId === sel.agentId) : null;
  const selCheck = selRow?.checks.find((c) => c.key === sel?.key);
  const gaps = matrix.flatMap((m) => m.checks.filter((c) => !c.passed).map((c) => ({ agent: m.name, agentId: m.agentId, ...c })));
  return (
    <>
      <Card
        title="Every agent against every check"
        description="Select a cell to see its evidence. A gap is a reason to act, not to hide the agent."
        flush
        footer={
          <div className="ao-evidence" aria-live="polite">
            {selRow && selCheck ? (
              <>
                <span className={`ao-check__icon${selCheck.passed ? '' : ' ao-check__icon--fail'}`} aria-hidden="true">
                  {selCheck.passed ? <IconCheck size={12} /> : <IconX size={12} />}
                </span>
                <span>
                  <strong>
                    {selRow.name}, {selCheck.label.charAt(0).toLowerCase() + selCheck.label.slice(1)}:
                  </strong>{' '}
                  {selCheck.evidence}
                </span>
              </>
            ) : (
              <span>Select any cell to see its evidence.</span>
            )}
          </div>
        }
      >
        <div className="ao-matrix-wrap">
          <table className="ao-matrix" aria-label="Agent standard matrix">
            <thead>
              <tr>
                <th scope="col" className="ao-matrix__head ao-matrix__head--agent">
                  Agent
                </th>
                {checks.map((c) => (
                  <th key={c.key} scope="col" className="ao-matrix__head" title={c.label}>
                    <span aria-hidden="true">{SHORT[c.key] ?? c.label}</span>
                    <span className="ds-sr-only">{c.label}</span>
                  </th>
                ))}
                <th scope="col" className="ao-matrix__head ao-matrix__head--score">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => {
                const passed = m.checks.filter((c) => c.passed).length;
                return (
                  <tr key={m.agentId} data-agent={m.agentId}>
                    <th scope="row" className="ao-matrix__agent">
                      <span className="ao-agent__name">
                        <Link to={`/ops/agents/${m.agentId}#standard`} className="ds-table__primary">
                          {m.name}
                        </Link>
                        <AgentSourceBadge source={agentSource(m.agentId, reg.data)} />
                      </span>
                      <span className="ds-table__secondary">{m.owner}</span>
                    </th>
                    {checks.map((c) => {
                      const r = m.checks.find((x) => x.key === c.key);
                      const pressed = sel?.agentId === m.agentId && sel.key === c.key;
                      return (
                        <td key={c.key} className="ao-matrix__cell">
                          <button
                            type="button"
                            className={`ao-mcell${r?.passed ? '' : ' ao-mcell--fail'}`}
                            aria-pressed={pressed}
                            aria-label={`${m.name}: ${c.label}: ${r?.passed ? 'passes' : 'gap'}. Show evidence`}
                            onClick={() => setSel(pressed ? null : { agentId: m.agentId, key: c.key })}
                          >
                            {r?.passed ? <IconCheck size={14} /> : <IconX size={14} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="ao-matrix__score">
                      <Score passed={passed} total={m.checks.length} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Open gaps" description="What it would take to close each one." flush>
        {gaps.length ? (
          <ul className="ds-list">
            {gaps.map((g) => (
              <li key={`${g.agentId}-${g.key}`}>
                <Link to={`/ops/agents/${g.agentId}#standard`} className="ds-list__item ao-att">
                  <span className="ao-att-icon ao-att-icon--warning" aria-hidden="true">
                    <IconX size={14} />
                  </span>
                  <span className="ao-att__text">
                    <span className="ao-att__title">
                      {g.agent}: {g.label.charAt(0).toLowerCase() + g.label.slice(1)}
                      {agentSource(g.agentId, reg.data) === 'simulated' ? (
                        <>
                          {' '}
                          <AgentSourceBadge source="simulated" />
                        </>
                      ) : null}
                    </span>
                    <span className="ao-att__detail">{g.evidence}</span>
                  </span>
                  <IconChevronRight size={14} className="ao-att__go" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<IconCheckCircle />} title="No open gaps" description="Every agent passes every check." />
        )}
      </Card>
    </>
  );
}

function Reviews() {
  const r = useApi<ReviewRow[]>('/reviews');
  const reg = useApi<RegistryRow[]>('/agents');
  const { sorted, state, by } = useSorted<ReviewRow>(
    r.data ?? [],
    { name: (x) => x.name, owner: (x) => x.owner, last: (x) => x.lastReview, cad: (x) => x.cadenceDays, next: (x) => x.nextReview, rs: (x) => x.daysUntil },
    { key: 'next', dir: 'asc' },
  );
  if (r.error && !r.data) return <LoadError error={r.error} onRetry={r.reload} what="reviews" />;
  if (!r.data) return <OpsSkeleton stats={false} />;
  const rows = r.data;
  const today = Date.now();
  const from = today - 60 * 86_400_000;
  const to = today + 60 * 86_400_000;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100));
  const months: { label: string; at: number }[] = [];
  const d0 = new Date(from);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() < to; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push({ label: f.day(m.toISOString()).replace(/ 1$/, ''), at: m.getTime() });
  const due = rows.filter((x) => x.reviewStatus !== 'current').length;
  return (
    <>
      <Card title="Review calendar" description="Sixty days either side of today, marked by the line. Dot: the last review. Ring: the next one, coloured by status.">
        <div className="ao-cal-scroll">
          <div className="ao-cal">
            <div className="ao-cal__row ao-cal__head">
              <span className="ao-cal__spacer" />
              <div className="ao-cal__months" aria-hidden="true">
                {months.map((m) => (
                  <span key={m.at} className="ao-cal__month" style={{ left: `${pct(m.at)}%` }}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((row) => {
              const last = Date.parse(row.lastReview);
              const next = Date.parse(row.nextReview);
              return (
                <div className="ao-cal__row" key={row.agentId}>
                  <span className="ds-stack">
                    <span className="ao-agent__name">
                      <Link to={`/ops/agents/${row.agentId}`} className="ao-cal__name">
                        {row.name}
                      </Link>
                      <AgentSourceBadge source={agentSource(row.agentId, reg.data)} />
                    </span>
                    <span className="ds-table__secondary">
                      {row.owner}, every {row.cadenceDays} days
                    </span>
                  </span>
                  <div className="ao-cal__lane" role="img" aria-label={`${row.name}: last review ${f.dayYear(row.lastReview)}, next review ${f.dayYear(row.nextReview)}, ${row.reviewStatus.replace('_', ' ')}`}>
                    <span className="ao-cal__window" style={{ left: `${pct(last)}%`, width: `${pct(next) - pct(last)}%` }} />
                    <span className="ao-cal__today" style={{ left: `${pct(today)}%` }} />
                    <span className="ao-cal__point ao-cal__point--last" style={{ left: `${pct(last)}%` }} title={`Last review ${f.dayYear(row.lastReview)}`} />
                    <span className={`ao-cal__point ao-cal__point--${row.reviewStatus}`} style={{ left: `${pct(next)}%` }} title={`Next review ${f.dayYear(row.nextReview)}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="ao-chart-summary">{due ? `${due} of ${rows.length} agents have a review due within 14 days or overdue.` : `Every agent’s next review is more than 14 days away.`}</p>
      </Card>

      <Card title="Scheduled reviews" flush>
        <Table label="Scheduled reviews">
          <thead>
            <tr>
              <SortHead active={state('name')} onSort={() => by('name')}>
                Agent
              </SortHead>
              <SortHead className="ao-hide-sm" active={state('owner')} onSort={() => by('owner')}>
                Owner
              </SortHead>
              <th className="ao-hide-sm ao-hide-md">Agent status</th>
              <SortHead className="ao-hide-sm ao-hide-md" active={state('last')} onSort={() => by('last')}>
                Last review
              </SortHead>
              <SortHead num className="ao-hide-sm" active={state('cad')} onSort={() => by('cad', true)}>
                Every
              </SortHead>
              <SortHead className="ao-hide-sm" active={state('next')} onSort={() => by('next')}>
                Next review
              </SortHead>
              <SortHead active={state('rs')} onSort={() => by('rs', true)}>
                Status
              </SortHead>
            </tr>
          </thead>
          <tbody>
            {sorted.map((x) => (
              <tr key={x.agentId}>
                <td className="ao-agent-col">
                  <span className="ao-agent__name">
                    <Link to={`/ops/agents/${x.agentId}`} className="ds-table__primary">
                      {x.name}
                    </Link>
                    <AgentSourceBadge source={agentSource(x.agentId, reg.data)} />
                  </span>
                </td>
                <td className="ao-hide-sm is-nowrap">{x.owner}</td>
                <td className="ao-hide-sm ao-hide-md is-nowrap">
                  <AgentStatus value={x.status} />
                </td>
                <td className="ao-hide-sm ao-hide-md is-nowrap">{f.dayYear(x.lastReview)}</td>
                <td className="is-num ao-hide-sm">{x.cadenceDays} days</td>
                <td className="is-nowrap ao-hide-sm">
                  <span className="ds-table__primary">{f.dayYear(x.nextReview)}</span>
                  <span className="ds-table__secondary">{x.daysUntil >= 0 ? `In ${x.daysUntil} day${x.daysUntil === 1 ? '' : 's'}` : `${-x.daysUntil} days ago`}</span>
                </td>
                <td className="is-nowrap">
                  <ReviewBadge value={x.reviewStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Callout title="What a review covers.">
        The owners walk through the agent’s numbers since the last review, re-check the nine standard items, and record a decision in the change history: keep, change, expand or retire.
      </Callout>
    </>
  );
}

const STEPS: { title: string; body: string; who: string }[] = [
  { title: 'Name an owner and a business owner', body: 'The owner builds and runs it; the business owner is accountable for whether it is worth running. No owner, no production.', who: 'Requester and AI Operations' },
  { title: 'Write the purpose, the unit of work and the success metric', body: 'One paragraph. What is one unit of work, and how long does it take by hand today? That baseline is an assumption until a 2-week time study replaces it.', who: 'Business owner' },
  { title: 'Pass the security and data review', body: 'List every data source and destination, the classification, the provider’s retention terms, and what never goes to a model. Restricted data needs approval before any pilot user touches it.', who: 'Security and GRC' },
  { title: 'Build a test set and a release check', body: 'Twenty to fifty real examples with expected outputs, scored on every prompt, model or flow change. A change that lowers quality does not ship.', who: 'Owner' },
  { title: 'Report to Agent Ops', body: 'Logs and timed steps for every run, usage, and a record per task (minutes saved, review minutes, cost, outcome). Gumloop and Databricks agents send theirs by webhook.', who: 'Owner and AI Operations' },
  { title: 'Set a spend cap and a per-run budget', body: 'A monthly cap at the provider or workspace, and a per-run ceiling in code, so one runaway input cannot spend the month.', who: 'Owner' },
  { title: 'Keep a person on high-stakes output', body: 'Decide which outputs need review before they reach a customer, a contract or a system of record, and make that the default path.', who: 'Business owner' },
  { title: 'Document rollback and a runbook', body: 'How to switch it off, how to restore the previous version, who gets paged, and what users see when it is down.', who: 'Owner' },
  { title: 'Book the first review and a schedule', body: 'A readiness review after the pilot, then every 30 to 90 days depending on risk. An overdue review fails the standard automatically.', who: 'AI Operations' },
];

const ROLLOUT: { title: string; body: string }[] = [
  { title: 'Shadow, 1 to 2 weeks', body: 'Runs on real work but delivers nothing; compare with what people did by hand.' },
  { title: 'Champions, 3 to 6 weeks', body: 'Two or three volunteers, a weekly look at misses and noise, accuracy shared openly.' },
  { title: 'Team', body: 'Confident outputs go out automatically, the rest go to a review queue; use and hours saved are tracked here.' },
  { title: 'Improve or retire', body: 'Every review decides to keep, change, expand or retire the agent, recorded in its change history.' },
];

function Checklist() {
  return (
    <>
      <Callout tone="info" title="Before an agent goes to production.">
        Each step maps to one of the nine standard checks, so passing the checklist is passing the review. A pilot can start once steps 1 to 3 are done.
      </Callout>
      <Card title="New agent checklist" flush>
        <ol className="ao-steps">
          {STEPS.map((s) => (
            <li key={s.title} className="ao-step">
              <div className="ao-step__body">
                <span className="ao-step__title">{s.title}</span>
                <p className="ao-step__text">{s.body}</p>
                <span className="ao-step__who">Who: {s.who}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Rollout after launch" description="How a new agent earns trust and adoption." flush>
        <ol className="ao-rollout">
          {ROLLOUT.map((s) => (
            <li key={s.title} className="ao-step">
              <div className="ao-step__body">
                <span className="ao-step__title">{s.title}</span>
                <p className="ao-step__text">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
