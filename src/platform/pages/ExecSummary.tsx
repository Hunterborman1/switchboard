/**
 * One-click, print-friendly summary for leadership. The sentences are templated from the
 * numbers (no AI model writes them).
 */
import { Button, ButtonLink, Card, Page, Stats, Table, useCrumbs } from '../../ds';
import { IconArrowLeft } from '../../ds/icons';
import { executiveSummary } from '../../worker/platform/math';
import type { OverviewX } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { IconPrint } from '../ui/icons';
import { AgentStatus, LoadError, OpsSkeleton, useOpsTitle } from '../ui/kit';

export function ExecSummary() {
  useOpsTitle('Executive summary');
  useCrumbs([{ label: 'Executive summary' }]);
  const ov = useApi<OverviewX>('/overview');
  if (ov.error && !ov.data)
    return (
      <Page>
        <LoadError error={ov.error} onRetry={ov.reload} what="the summary" />
      </Page>
    );
  if (!ov.data) return <OpsSkeleton stats={false} />;
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
    <Page width="narrow">
      <div className="ds-toolbar ao-noprint">
        <div className="ds-toolbar__group">
          <ButtonLink to="/ops" variant="ghost" size="sm" icon={<IconArrowLeft size={14} />}>
            Overview
          </ButtonLink>
        </div>
        <div className="ds-toolbar__group">
          <ButtonLink to="/ops/agents" size="sm">
            Agent registry
          </ButtonLink>
          <Button variant="primary" size="sm" icon={<IconPrint size={14} />} onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>
      </div>

      <article className="ao-exec" aria-labelledby="exec-title">
        <header className="ds-stack" style={{ gap: 8 }}>
          <span className="ao-exec__eyebrow">AI Operations update</span>
          <h1 id="exec-title" className="ao-exec__title">
            AI agents: what they returned this period
          </h1>
          <div className="ds-page-header__meta">
            <span>{f.range(d.range.from, d.range.to)}</span>
            <span>Prepared {f.dayYear(ov.dataAsOf)}</span>
          </div>
        </header>

        <div className="ao-exec__lede" data-testid="exec-summary">
          {sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>

        <Stats
          items={[
            { label: 'Hours saved', value: f.int(t.hoursReturned), unit: 'h' },
            { label: 'Estimated value', value: f.compactMoney(t.valueUsd) },
            { label: 'AI cost', value: f.money(t.aiCostUsd) },
            { label: 'Weekly active users', value: d.wau.current, unit: `of ${t.activeUsers}` },
          ]}
        />

        <Card title="By agent" flush>
          <Table label="Per agent">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th className="is-num ao-hide-sm">Tasks</th>
                <th className="is-num ao-end-sm">Hours saved</th>
                <th className="is-num ao-hide-sm">AI cost</th>
                <th className="is-num ao-hide-sm">People</th>
              </tr>
            </thead>
            <tbody>
              {d.agentRows.map((a) => (
                <tr key={a.agentId}>
                  <td>
                    <span className="ds-table__primary">{a.name}</span>
                  </td>
                  <td className="is-nowrap">
                    <AgentStatus value={a.status} />
                  </td>
                  <td className="is-num ao-hide-sm">{f.int(a.workUnits)}</td>
                  <td className="is-num ao-end-sm">{f.hours(a.hoursReturned)}</td>
                  <td className="is-num ao-hide-sm">{f.money(a.aiCostUsd)}</td>
                  <td className="is-num ao-hide-sm">{f.int(a.activeUsers)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <p className="ao-exec__foot">
          Estimates, not billing data. Hours saved use the registered time each task takes by hand (assumptions until a 2-week time study); value uses a loaded cost of ${d.assumptions.loadedHourlyUsd} an hour. Six weeks of history are simulated for this demo;
          Signal Loop’s runs and the people using the demo are live. These sentences are generated from the numbers by a template, not written by an AI model.
        </p>
      </article>
    </Page>
  );
}
