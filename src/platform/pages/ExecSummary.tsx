import { Link } from 'react-router-dom';
import { executiveSummary } from '../../worker/platform/math';
import type { OverviewX } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { IconArrowRight, IconPrint } from '../ui/icons';
import { AgentStatus, ErrorState, PageSkeleton } from '../ui/kit';

/** One-click, print-friendly summary for leadership. Sentences are templated from the numbers (no LLM). */
export function ExecSummary() {
  const ov = useApi<OverviewX>('/overview');
  if (ov.error && !ov.data) return <div className="ao-page"><ErrorState message={ov.error.message} onRetry={ov.reload} /></div>;
  if (!ov.data) return <PageSkeleton kpis={false} />;
  const d = ov.data;
  const t = d.totals;
  const top = [...d.agentRows].sort((a, b) => b.hoursReturned - a.hoursReturned)[0];
  const acc = d.funnel.invoked ? (d.funnel.accepted + d.funnel.automatic) / d.funnel.invoked : null;
  const attention = [
    ...d.attention.map((a) => ({ kind: a.kind, message: a.message })),
    ...d.openAlerts.filter((a) => !a.rule.startsWith('SLO breached')).map((a) => ({ kind: 'alert', message: a.rule })),
  ];
  const weeks = Math.max(1, Math.round((Date.parse(d.range.to) - Date.parse(d.range.from)) / (7 * 86_400_000)));
  const sentences = executiveSummary({
    periodLabel: `the last ${weeks} weeks (${f.range(d.range.from, d.range.to)})`,
    agentsInProduction: t.agentsInProduction,
    hoursReturned: t.hoursReturned,
    valueUsd: t.valueUsd,
    aiCostUsd: t.aiCostUsd,
    roiMultiple: t.roiMultiple,
    loadedHourlyUsd: d.assumptions.loadedHourlyUsd,
    activeUsers: t.activeUsers,
    wau: d.wau.current,
    priorWau: d.wau.prior,
    topAgent: top ? { name: top.name, hours: top.hoursReturned, share: t.hoursReturned ? top.hoursReturned / t.hoursReturned : 0 } : null,
    attention: attention.map((a) => ({ kind: a.kind === 'alert' ? 'standard_gap' : a.kind, message: a.message })),
    acceptanceRate: acc,
  });

  return (
    <div className="ao-page">
      <div className="ao-noprint" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link to="/ops" className="ao-link" style={{ fontWeight: 500 }}>
          ← Back to the overview
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/ops/agents" className="ao-btn">
            Agent registry <IconArrowRight size={13} />
          </Link>
          <button type="button" className="ao-btn primary" onClick={() => window.print()}>
            <IconPrint /> Print or save as PDF
          </button>
        </div>
      </div>
      <article className="ao-exec" aria-labelledby="exec-title">
        <header style={{ display: 'grid', gap: 8 }}>
          <span className="ao-eyebrow">Agent Ops · AI Operations update</span>
          <h1 id="exec-title">AI agents: what they returned this period</h1>
          <div className="ao-head-meta">
            <span>
              {f.range(d.range.from, d.range.to)} · prepared {f.dayYear(ov.dataAsOf)}
            </span>
          </div>
        </header>
        <div className="lede" data-testid="exec-summary">
          {sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        <div className="ao-exec-kpis">
          <div>
            <span>Hours saved</span>
            <b>{f.int(t.hoursReturned)} h</b>
          </div>
          <div>
            <span>Estimated value</span>
            <b>{f.compactMoney(t.valueUsd)}</b>
          </div>
          <div>
            <span>AI cost</span>
            <b>{f.money(t.aiCostUsd)}</b>
          </div>
          <div>
            <span>Weekly active users</span>
            <b>
              {d.wau.current} <small style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0, color: 'var(--ao-text-3)' }}>of {t.activeUsers}</small>
            </b>
          </div>
        </div>
        <div className="ao-table-wrap">
        <table className="ao-table compact">
          <caption className="ao-sr">Per agent</caption>
          <thead>
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Status</th>
              <th className="num ao-hide-sm" scope="col">Tasks</th>
              <th className="num" scope="col">Hours saved</th>
              <th className="num ao-hide-sm" scope="col">AI cost</th>
              <th className="num ao-hide-sm" scope="col">People</th>
            </tr>
          </thead>
          <tbody>
            {d.agentRows.map((a) => (
              <tr key={a.agentId}>
                <td>{a.name}</td>
                <td>
                  <AgentStatus value={a.status} />
                </td>
                <td className="num ao-hide-sm">{f.int(a.workUnits)}</td>
                <td className="num">{f.hours(a.hoursReturned)}</td>
                <td className="num ao-hide-sm">{f.money(a.aiCostUsd)}</td>
                <td className="num ao-hide-sm">{f.int(a.activeUsers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <footer>
          Estimates, not billing data. Hours saved use the registered time each task takes by hand (assumptions until a 2-week time study); value uses a loaded cost of ${d.assumptions.loadedHourlyUsd} an hour. Six weeks of
          history are simulated for this demo; Signal Loop’s runs and the people using the demo are live. These sentences are generated from the numbers by a template, not written by an AI model.
        </footer>
      </article>
    </div>
  );
}
