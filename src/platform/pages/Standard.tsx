import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { ReviewRow, StandardReport } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { IconCheck, IconX } from '../ui/icons';
import { AgentStatus, Callout, ErrorState, PageHead, PageSkeleton, Panel, ReviewPill, Score, Table } from '../ui/kit';

function Tabs() {
  return (
    <nav className="ao-tabs" aria-label="Standard & reviews sections">
      <NavLink to="/ops/standard" end>
        Standard matrix
      </NavLink>
      <NavLink to="/ops/standard/reviews">Review calendar</NavLink>
      <NavLink to="/ops/standard/checklist">New agent checklist</NavLink>
    </nav>
  );
}

export function Standard() {
  const { pathname } = useLocation();
  const tab = pathname.endsWith('/reviews') ? 'reviews' : pathname.endsWith('/checklist') ? 'checklist' : 'matrix';
  return (
    <div className="ao-page">
      <PageHead
        eyebrow="Agent Ops · Govern"
        title="Agent standard & reviews"
        sub="One standard every agent is reviewed against, whoever built it and in whatever tool. Nine checks, each with evidence; two of them (review cadence and live logging) are measured, not self-reported."
      />
      <Tabs />
      {tab === 'matrix' ? <Matrix /> : tab === 'reviews' ? <Reviews /> : <Checklist />}
    </div>
  );
}

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
      <Panel title="Agents × checks" sub="Select a cell for its evidence. A gap is a reason to act, not a reason to hide the agent." flush>
        <div className="ao-table-wrap">
          <table className="ao-table ao-matrix">
            <caption className="ao-sr">Agent standard matrix</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                {checks.map((c) => (
                  <th key={c.key} scope="col" className="chk" title={c.label}>
                    {c.label}
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
                    <th scope="row" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 'var(--fs-body)', color: 'var(--cn-off-black)', background: 'transparent', position: 'static', borderBottom: '1px solid var(--cn-border-row)' }}>
                      <div className="cell-title">
                        <Link className="row-link" to={`/ops/agents/${m.agentId}#standard`}>
                          {m.name}
                        </Link>
                        <small style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
          <div className="ao-panel-foot" style={{ justifyContent: 'flex-start', color: 'var(--cn-off-black)' }} aria-live="polite">
            <span className={`ao-mcell ${selCheck.passed ? 'pass' : 'fail'}`} style={{ width: 24, height: 24 }} aria-hidden="true">
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
            <span>Select any cell to read its evidence.</span>
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
                  <span className="go">Agent →</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ padding: 18 }}>
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
  const color = (s: ReviewRow['reviewStatus']) => (s === 'overdue' ? 'var(--cn-danger)' : s === 'due_soon' ? '#B45309' : 'var(--cn-success)');
  return (
    <>
      <Panel title="Review calendar" sub="Sixty days either side of today. Green dot: last review held. Ring: next review, coloured by status. The bar is the cadence window.">
        <div className="ao-cal">
          <div className="ao-cal-row">
            <span />
            <div className="ao-cal-months" aria-hidden="true">
              {months.map((m) => (
                <span key={m.at} style={{ left: x(m.at) }}>
                  {m.label}
                </span>
              ))}
              <span style={{ left: x(today), color: 'var(--ao-navy)', fontWeight: 500, transform: 'translateX(-50%)' }}>Today</span>
            </div>
          </div>
          {rows.map((row) => {
            const last = Date.parse(row.lastReview);
            const next = Date.parse(row.nextReview);
            return (
              <div className="ao-cal-row" key={row.agentId}>
                <div className="cell-title" style={{ display: 'grid', gap: 2 }}>
                  <Link className="row-link ao-link" style={{ color: 'var(--cn-off-black)', fontWeight: 500 }} to={`/ops/agents/${row.agentId}`}>
                    {row.name}
                  </Link>
                  <small className="ao-muted" style={{ fontSize: 'var(--fs-caption)' }}>
                    {row.owner} · every {row.cadenceDays} days
                  </small>
                </div>
                <div className="ao-cal-lane" role="img" aria-label={`${row.name}: last review ${row.lastReview}, next review ${row.nextReview}, ${row.reviewStatus.replace('_', ' ')}`}>
                  <span className="win" style={{ left: x(last), width: `calc(${x(next)} - ${x(last)})`, background: 'color-mix(in srgb, var(--ao-indigo) 16%, transparent)' }} />
                  <span className="today" style={{ left: x(today) }} />
                  <span className="pt" style={{ left: x(last), background: 'var(--cn-success)' }} title={`Last review ${row.lastReview}`}>
                    <IconCheck size={11} color="#fff" />
                  </span>
                  <span className="pt" style={{ left: x(next), background: '#fff', borderColor: color(row.reviewStatus), borderWidth: 3 }} title={`Next review ${row.nextReview}`} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Scheduled reviews" flush>
        <Table
          caption="Scheduled reviews"
          rows={rows}
          rowKey={(x) => x.agentId}
          defaultSort={{ key: 'next', dir: 'asc' }}
          cols={[
            { key: 'name', header: 'Agent', sort: (x) => x.name, render: (x) => <Link className="row-link" to={`/ops/agents/${x.agentId}`}>{x.name}</Link> },
            { key: 'owner', header: 'Owner', sort: (x) => x.owner, render: (x) => x.owner },
            { key: 'status', header: 'Agent status', render: (x) => <AgentStatus value={x.status} /> },
            { key: 'last', header: 'Last review', sort: (x) => x.lastReview, render: (x) => f.dayYear(x.lastReview) },
            { key: 'cad', header: 'Cadence', num: true, sort: (x) => x.cadenceDays, render: (x) => `${x.cadenceDays} days` },
            { key: 'next', header: 'Next review', sort: (x) => x.nextReview, render: (x) => <span>{f.dayYear(x.nextReview)} <span className="ao-muted">({x.daysUntil >= 0 ? `in ${x.daysUntil}d` : `${-x.daysUntil}d ago`})</span></span> },
            { key: 'rs', header: 'Review', sort: (x) => x.daysUntil, render: (x) => <ReviewPill value={x.reviewStatus} /> },
          ]}
        />
      </Panel>
      <Callout tone="indigo" title="What a review covers.">
        The owner and business owner walk through the agent’s numbers on this platform (adoption, hours, cost, SLOs, alerts since the last review), re-check the nine standard items, and record decisions in the changelog: keep, change, expand or retire.
      </Callout>
    </>
  );
}

const STEPS: { title: string; body: string; who: string }[] = [
  { title: 'Name an owner and a business owner', body: 'The owner builds and runs it; the business owner is accountable for whether it is worth running. No owner, no production.', who: 'Requester + AI Operations' },
  { title: 'Write the purpose, the unit of work and the success metric', body: 'One paragraph. What is a “unit” (a questionnaire drafted, a call processed)? How long does it take the manual way today? That baseline is an assumption until a 2-week time study replaces it.', who: 'Business owner' },
  { title: 'Pass the security & data review', body: 'List every data source and destination, the classification, the provider’s retention terms, and what never goes to a model. Restricted data needs approval before any pilot user touches it.', who: 'Security & GRC' },
  { title: 'Build an eval set and a promotion gate', body: 'Twenty to fifty real examples with expected outputs, scored on every prompt, model or flow change. A change that drops quality does not ship.', who: 'Owner' },
  { title: 'Report to Agent Ops through the SDK', body: 'Structured logs and spans for every run, usage events and a work unit per task (minutes saved, review minutes, cost, outcome). Gumloop and Databricks agents forward theirs by webhook.', who: 'Owner + AI Operations' },
  { title: 'Set a spend cap and a per-run budget', body: 'A monthly cap at the provider or workspace, and a per-run ceiling in code, so one runaway input cannot spend the month.', who: 'Owner' },
  { title: 'Keep a person on high-stakes output', body: 'Decide which outputs need review before they reach a customer, a contract or a system of record, and make that the default path.', who: 'Business owner' },
  { title: 'Document rollback and a runbook', body: 'How to switch it off, how to restore the previous version, who gets paged, and what users see when it is down.', who: 'Owner' },
  { title: 'Book the first review and a cadence', body: 'A production-readiness review after the pilot, then every 30–90 days depending on risk. Overdue reviews fail the standard automatically.', who: 'AI Operations' },
];

function Checklist() {
  return (
    <>
      <Callout tone="indigo" title="Before an agent goes to production.">
        Practical and short: each step maps to one of the nine standard checks, so passing the checklist is passing the review. Pilots can start once steps 1–3 are done.
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
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 'var(--fs-body-sm)', color: 'var(--cn-ink-2)', lineHeight: 1.55 }}>
          <li>
            <b style={{ fontWeight: 500, color: 'var(--cn-off-black)' }}>Shadow (1–2 weeks):</b> runs on real work, nothing is delivered; compare with what people did by hand.
          </li>
          <li>
            <b style={{ fontWeight: 500, color: 'var(--cn-off-black)' }}>Champions (3–6 weeks):</b> 2–3 volunteers, weekly calibration on misses and noise, publish accuracy.
          </li>
          <li>
            <b style={{ fontWeight: 500, color: 'var(--cn-off-black)' }}>Team:</b> automatic above the confidence gate, review queue for the rest; adoption and hours tracked here.
          </li>
          <li>
            <b style={{ fontWeight: 500, color: 'var(--cn-off-black)' }}>Iterate or retire:</b> every review decides keep, change, expand or retire, recorded in the changelog.
          </li>
        </ol>
      </Panel>
    </>
  );
}
