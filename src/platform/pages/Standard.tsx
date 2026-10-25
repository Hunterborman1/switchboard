import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { ReviewRow, StandardReport } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { IconCheck, IconX } from '../ui/icons';
import { AgentStatus, Callout, ErrorState, PageHead, PageSkeleton, Panel, ReviewPill, Score, Table } from '../ui/kit';

function Tabs() {
  return (
    <nav className="ao-tabs" aria-label="Standard and reviews sections">
      {/* Phones get short labels so all three tabs fit without clipping. */}
      <NavLink to="/ops/standard" end>
        <span className="ao-tab-long">Standard matrix</span>
        <span className="ao-tab-short">Matrix</span>
      </NavLink>
      <NavLink to="/ops/standard/reviews">
        <span className="ao-tab-long">Review calendar</span>
        <span className="ao-tab-short">Reviews</span>
      </NavLink>
      <NavLink to="/ops/standard/checklist">
        <span className="ao-tab-long">New agent checklist</span>
        <span className="ao-tab-short">New agent</span>
      </NavLink>
    </nav>
  );
}

export function Standard() {
  const { pathname } = useLocation();
  const tab = pathname.endsWith('/reviews') ? 'reviews' : pathname.endsWith('/checklist') ? 'checklist' : 'matrix';
  return (
    <div className="ao-page">
      <PageHead
        title="Agent standard and reviews"
        sub="One standard every agent is reviewed against, whoever built it and in whatever tool. Nine checks, each with evidence. Two of them, the review schedule and live logging, are measured from data rather than self-reported."
      />
      <Tabs />
      {tab === 'matrix' ? <Matrix /> : tab === 'reviews' ? <Reviews /> : <Checklist />}
    </div>
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
  const [sel, setSel] = useState<{ agentId: string; key: string } | null>(null);
  if (s.error && !s.data) return <ErrorState message={s.error.message} onRetry={s.reload} />;
  if (!s.data) return <PageSkeleton kpis={false} />;
  const { checks, matrix } = s.data;
  const selRow = sel ? matrix.find((m) => m.agentId === sel.agentId) : null;
  const selCheck = selRow?.checks.find((c) => c.key === sel?.key);
  const gaps = matrix.flatMap((m) => m.checks.filter((c) => !c.passed).map((c) => ({ agent: m.name, agentId: m.agentId, ...c })));
  return (
    <>
      <Panel title="Every agent against every check" sub="Select a cell to see its evidence. A gap is a reason to act, not a reason to hide the agent." flush>
        <div className="ao-table-wrap">
          <table className="ao-table ao-matrix">
            <caption className="ao-sr">Agent standard matrix</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                {checks.map((c) => (
                  <th key={c.key} scope="col" className="chk" title={c.label}>
                    <span aria-hidden="true">{SHORT[c.key] ?? c.label}</span>
                    <span className="ao-sr">{c.label}</span>
                  </th>
                ))}
                <th scope="col" className="num">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => {
                const passed = m.checks.filter((c) => c.passed).length;
                return (
                  <tr key={m.agentId} data-agent={m.agentId}>
                    <th scope="row" style={{ fontWeight: 400, fontSize: 14, color: 'var(--ao-text)', background: 'transparent', position: 'static', paddingTop: 10, paddingBottom: 10 }}>
                      <div className="cell-title" style={{ minWidth: 180, maxWidth: 240, whiteSpace: 'normal' }}>
                        <Link className="row-link" to={`/ops/agents/${m.agentId}#standard`}>
                          {m.name}
                        </Link>
                        <small style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <AgentStatus value={m.status} /> {m.owner}
                        </small>
                      </div>
                    </th>
                    {checks.map((c) => {
                      const r = m.checks.find((x) => x.key === c.key);
                      const pressed = sel?.agentId === m.agentId && sel.key === c.key;
                      return (
                        <td key={c.key} className="chk">
                          <button
                            type="button"
                            className={`ao-mcell ${r?.passed ? 'pass' : 'fail'}`}
                            aria-pressed={pressed}
                            aria-label={`${m.name}: ${c.label}: ${r?.passed ? 'passes' : 'gap'}. Show evidence`}
                            onClick={() => setSel(pressed ? null : { agentId: m.agentId, key: c.key })}
                          >
                            {r?.passed ? <IconCheck size={14} /> : <IconX size={14} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="num">
                      <Score passed={passed} total={m.checks.length} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selRow && selCheck ? (
          <div className="ao-panel-foot" style={{ justifyContent: 'flex-start', color: 'var(--ao-text)', flexWrap: 'nowrap', alignItems: 'flex-start' }} aria-live="polite">
            <span className={`ao-mcell ${selCheck.passed ? 'pass' : 'fail'}`} style={{ width: 22, height: 22, flex: 'none', cursor: 'default', boxShadow: 'none' }} aria-hidden="true">
              {selCheck.passed ? <IconCheck size={12} /> : <IconX size={12} />}
            </span>
            <span>
              <b style={{ fontWeight: 500 }}>
                {selRow.name} · {selCheck.label}:
              </b>{' '}
              {selCheck.evidence}
            </span>
          </div>
        ) : (
          <div className="ao-panel-foot">
            <span>Select any cell to see its evidence.</span>
          </div>
        )}
      </Panel>
      <Panel title="Open gaps" sub="What it would take to close each one." flush>
        {gaps.length ? (
          <ul className="ao-att">
            {gaps.map((g) => (
              <li key={`${g.agentId}-${g.key}`}>
                <Link to={`/ops/agents/${g.agentId}#standard`}>
                  <span className="ao-att-icon warning" aria-hidden="true">
                    <IconX size={14} />
                  </span>
                  <span>
                    <b>
                      {g.agent}: {g.label}
                    </b>
                    <small>{g.evidence}</small>
                  </span>
                  <span className="go" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ padding: 20 }}>
            <Callout tone="live">Every agent passes every check.</Callout>
          </div>
        )}
      </Panel>
    </>
  );
}

function Reviews() {
  const r = useApi<ReviewRow[]>('/reviews');
  if (r.error && !r.data) return <ErrorState message={r.error.message} onRetry={r.reload} />;
  if (!r.data) return <PageSkeleton kpis={false} />;
  const rows = r.data;
  const today = Date.now();
  const from = today - 60 * 86_400_000;
  const to = today + 60 * 86_400_000;
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100))}%`;
  const months: { label: string; at: number }[] = [];
  const d0 = new Date(from);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() < to; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push({ label: f.day(m.toISOString()).replace(/ 1$/, ''), at: m.getTime() });
  const color = (s: ReviewRow['reviewStatus']) => (s === 'overdue' ? 'var(--ao-danger)' : s === 'due_soon' ? 'var(--ao-warning-mark)' : 'var(--ao-success)');
  return (
    <>
      <Panel title="Review calendar" sub="Sixty days either side of today. Filled dot: the last review. Ring: the next one, coloured by status. The bar spans the time between them.">
        <div className="ao-cal">
          <div className="ao-cal-row">
            <span />
            <div className="ao-cal-months" aria-hidden="true">
              {months.map((m) => (
                <span key={m.at} style={{ left: x(m.at) }}>
                  {m.label}
                </span>
              ))}
              <span style={{ left: x(today), color: 'var(--ao-text)', fontWeight: 500, transform: 'translateX(-50%)' }}>Today</span>
            </div>
          </div>
          {rows.map((row) => {
            const last = Date.parse(row.lastReview);
            const next = Date.parse(row.nextReview);
            return (
              <div className="ao-cal-row" key={row.agentId}>
                <div className="cell-title" style={{ display: 'grid', gap: 2 }}>
                  <Link className="row-link ao-link" style={{ color: 'var(--ao-text)', fontWeight: 500 }} to={`/ops/agents/${row.agentId}`}>
                    {row.name}
                  </Link>
                  <small className="ao-muted" style={{ fontSize: 13 }}>
                    {row.owner} · every {row.cadenceDays} days
                  </small>
                </div>
                <div className="ao-cal-lane" role="img" aria-label={`${row.name}: last review ${row.lastReview}, next review ${row.nextReview}, ${row.reviewStatus.replace('_', ' ')}`}>
                  <span className="win" style={{ left: x(last), width: `calc(${x(next)} - ${x(last)})`, background: 'var(--ao-accent-subtle)' }} />
                  <span className="today" style={{ left: x(today) }} />
                  <span className="pt" style={{ left: x(last), background: 'var(--ao-success)' }} title={`Last review ${f.dayYear(row.lastReview)}`}>
                    <IconCheck size={11} color="#fff" />
                  </span>
                  <span className="pt" style={{ left: x(next), background: '#fff', borderColor: color(row.reviewStatus), borderWidth: 3 }} title={`Next review ${f.dayYear(row.nextReview)}`} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Scheduled reviews" flush>
        <Table
          className="ao-cards"
          caption="Scheduled reviews"
          rows={rows}
          rowKey={(x) => x.agentId}
          defaultSort={{ key: 'next', dir: 'asc' }}
          cols={[
            { key: 'name', header: 'Agent', sort: (x) => x.name, render: (x) => <Link className="row-link" to={`/ops/agents/${x.agentId}`}>{x.name}</Link> },
            { key: 'owner', mobileHide: true, header: 'Owner', sort: (x) => x.owner, render: (x) => x.owner },
            { key: 'status', mobileHide: true, header: 'Agent status', render: (x) => <AgentStatus value={x.status} /> },
            { key: 'last', mobileHide: true, header: 'Last review', sort: (x) => x.lastReview, render: (x) => f.dayYear(x.lastReview) },
            { key: 'cad', mobileHide: true, header: 'Every', num: true, sort: (x) => x.cadenceDays, render: (x) => `${x.cadenceDays} days` },
            { key: 'next', header: 'Next review', sort: (x) => x.nextReview, render: (x) => <span>{f.dayYear(x.nextReview)} <span className="ao-muted">({x.daysUntil >= 0 ? `in ${x.daysUntil} day${x.daysUntil === 1 ? '' : 's'}` : `${-x.daysUntil} days ago`})</span></span> },
            { key: 'rs', header: 'Status', sort: (x) => x.daysUntil, render: (x) => <ReviewPill value={x.reviewStatus} /> },
          ]}
        />
      </Panel>
      <Callout title="What a review covers.">
        The owner and business owner walk through the agent’s numbers here (use, hours saved, cost, service targets and alerts since the last review), re-check the nine standard items, and record a decision in the change history: keep, change, expand or retire.
      </Callout>
    </>
  );
}

const STEPS: { title: string; body: string; who: string }[] = [
  { title: 'Name an owner and a business owner', body: 'The owner builds and runs it; the business owner is accountable for whether it is worth running. No owner, no production.', who: 'Requester and AI Operations' },
  { title: 'Write the purpose, the unit of work and the success metric', body: 'One paragraph. What is a “unit” (a questionnaire drafted, a call processed)? How long does it take the manual way today? That baseline is an assumption until a 2-week time study replaces it.', who: 'Business owner' },
  { title: 'Pass the security and data review', body: 'List every data source and destination, the classification, the provider’s retention terms, and what never goes to a model. Restricted data needs approval before any pilot user touches it.', who: 'Security & GRC' },
  { title: 'Build a test set and a release check', body: 'Twenty to fifty real examples with expected outputs, scored on every prompt, model or flow change. A change that lowers quality does not ship.', who: 'Owner' },
  { title: 'Report to Agent Ops', body: 'Logs and timed steps for every run, usage, and a record per task (minutes saved, review minutes, cost, outcome). Gumloop and Databricks agents send theirs by webhook.', who: 'Owner and AI Operations' },
  { title: 'Set a spend cap and a per-run budget', body: 'A monthly cap at the provider or workspace, and a per-run ceiling in code, so one runaway input cannot spend the month.', who: 'Owner' },
  { title: 'Keep a person on high-stakes output', body: 'Decide which outputs need review before they reach a customer, a contract or a system of record, and make that the default path.', who: 'Business owner' },
  { title: 'Document rollback and a runbook', body: 'How to switch it off, how to restore the previous version, who gets paged, and what users see when it is down.', who: 'Owner' },
  { title: 'Book the first review and a schedule', body: 'A readiness review after the pilot, then every 30 to 90 days depending on risk. An overdue review fails the standard automatically.', who: 'AI Operations' },
];

function Checklist() {
  return (
    <>
      <Callout title="Before an agent goes to production.">
        Each step maps to one of the nine standard checks, so passing the checklist is passing the review. A pilot can start once steps 1 to 3 are done.
      </Callout>
      <ol className="ao-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <div>
              <b>{s.title}</b>
              <p>{s.body}</p>
              <div className="who">Who: {s.who}</div>
            </div>
          </li>
        ))}
      </ol>
      <Panel title="Rollout after launch" sub="How a new agent earns trust and adoption.">
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 14, color: 'var(--ao-text-2)', lineHeight: 1.55 }}>
          <li>
            <b style={{ fontWeight: 600, color: 'var(--ao-text)' }}>Shadow (1 to 2 weeks):</b> runs on real work but delivers nothing; compare with what people did by hand.
          </li>
          <li>
            <b style={{ fontWeight: 600, color: 'var(--ao-text)' }}>Champions (3 to 6 weeks):</b> two or three volunteers, a weekly look at misses and noise, accuracy shared openly.
          </li>
          <li>
            <b style={{ fontWeight: 600, color: 'var(--ao-text)' }}>Team:</b> confident outputs go out automatically, the rest go to a review queue; use and hours saved are tracked here.
          </li>
          <li>
            <b style={{ fontWeight: 600, color: 'var(--ao-text)' }}>Improve or retire:</b> every review decides to keep, change, expand or retire the agent, recorded in its change history.
          </li>
        </ol>
      </Panel>
    </>
  );
}
