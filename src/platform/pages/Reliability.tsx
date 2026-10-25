import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Alert, Slo } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { ObservabilityX, RegistryRow } from '../../worker/platform/types';
import { acknowledgeAlert, useApi } from '../lib/api';
import * as f from '../lib/format';
import { Bars, Legend, Lines } from '../ui/charts';
import { IconBook, IconTrace } from '../ui/icons';
import { AlertPill, BudgetBar, Callout, Empty, ErrorState, PageHead, PageSkeleton, Panel, Seg, SloPill, SourceChip, Table } from '../ui/kit';

function sloValue(s: Slo): string {
  if (s.actual == null) return '—';
  if (s.key === 'p95_latency') return f.ms(s.actual);
  if (s.key === 'cost_per_unit') return f.money(s.actual, { precise: true });
  return f.pct(s.actual, 2);
}
function sloTarget(s: Slo): string {
  if (s.key === 'p95_latency') return `≤ ${f.ms(s.target)}`;
  if (s.key === 'cost_per_unit') return `≤ ${f.money(s.target, { precise: true })}`;
  return `≥ ${f.pct(s.target, s.target >= 0.99 ? 1 : 0)}`;
}

export function SloCards({ slos, names }: { slos: Slo[]; names?: Record<string, string> }) {
  if (!slos.length) return <Empty title="No SLOs defined" />;
  return (
    <div className="ao-slos" {...tourAnchor('ops.slos')}>
      {slos.map((s) => (
        <article key={`${s.agentId}-${s.key}`} className={`ao-slo ${s.status}`} data-slo={s.key} data-status={s.status}>
          <div className="ao-slo-top">
            <div>
              <h3>{s.label}</h3>
              <small>
                {names ? `${names[s.agentId] ?? s.agentId} · ` : ''}
                {s.objective}
              </small>
            </div>
            <SloPill value={s.status} />
          </div>
          <div className="ao-slo-val">
            <b>{sloValue(s)}</b>
            <span>
              target {sloTarget(s)} · {s.window}
            </span>
          </div>
          <BudgetBar slo={s} />
          <small className="ao-muted" style={{ fontSize: 'var(--fs-micro)' }}>
            {s.denominator != null ? (s.numerator != null ? `${f.int(s.numerator)} of ${f.int(s.denominator)} good` : `over ${f.int(s.denominator)} units`) : 'No events in the window'}
          </small>
        </article>
      ))}
    </div>
  );
}

export function AlertList({ alerts, names }: { alerts: Alert[]; names?: Record<string, string> }) {
  const { timezone } = useTimezone();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, 'acknowledged'>>({});
  if (!alerts.length) return <div style={{ padding: 18 }}><Empty title="No alerts">No rule is firing and there are no past incidents in the window.</Empty></div>;
  return (
    <div className="ao-alerts" {...tourAnchor('ops.alerts')} id="alerts">
      {alerts.map((a) => {
        const status = local[a.id] ?? a.status;
        return (
          <article key={a.id} className={`ao-alert ${status}`} data-alert={a.id} data-status={status}>
            <span className={`sev ${a.severity}`} aria-hidden="true" />
            <div className="ao-alert-main">
              <div className="ao-alert-title">
                <AlertPill value={status} />
                <span className="ao-tag" style={{ textTransform: 'capitalize' }}>
                  {a.severity}
                </span>
                <b>{a.rule}</b>
                {names ? <span className="ao-muted">· {names[a.agentId] ?? a.agentId}</span> : null}
              </div>
              <div className="ao-alert-kv">
                <div>
                  <span>Expected</span>
                  <b>{a.expected}</b>
                </div>
                <div>
                  <span>Actual</span>
                  <b>{a.actual}</b>
                </div>
                <div>
                  <span>Owner</span>
                  <b>{a.owner}</b>
                </div>
                <div>
                  <span>{status === 'resolved' ? 'Fired' : 'Since'}</span>
                  <b>{f.time(a.at, timezone)}</b>
                </div>
              </div>
            </div>
            <div className="ao-alert-act">
              {a.traceId ? (
                <Link className="ao-btn sm" to={`/ops/traces/${a.traceId}`}>
                  <IconTrace /> Trace
                </Link>
              ) : null}
              <a className="ao-btn sm" href={a.runbook} target="_blank" rel="noreferrer noopener">
                <IconBook /> Runbook
              </a>
              {status === 'open' ? (
                <button
                  type="button"
                  className="ao-btn sm"
                  disabled={busy === a.id}
                  title="Acknowledging says an owner is on it. The alert stays until its rule stops firing."
                  onClick={async () => {
                    setBusy(a.id);
                    try {
                      await acknowledgeAlert(a.id, null);
                      setLocal((l) => ({ ...l, [a.id]: 'acknowledged' }));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === a.id ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              ) : status === 'acknowledged' ? (
                <span className="ao-muted" style={{ fontSize: 'var(--fs-caption)', maxWidth: 180 }}>
                  Acknowledged in your workspace; resolves when the rule stops firing.
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function Reliability() {
  const [params, setParams] = useSearchParams();
  const agentId = params.get('agentId') ?? '';
  const range = params.get('range') === '6w' ? '6w' : '7d';
  const obs = useApi<ObservabilityX>(`/observability?range=${range}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`, { pollMs: 30_000 });
  const reg = useApi<RegistryRow[]>('/agents');
  const { timezone } = useTimezone();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  if (obs.error && !obs.data) return <div className="ao-page"><ErrorState message={obs.error.message} onRetry={obs.reload} /></div>;
  if (!obs.data) return <PageSkeleton />;
  const d = obs.data;
  const names = Object.fromEntries((reg.data ?? []).map((r) => [r.id, r.name]));
  const hourly = d.hourly.map((h) => ({
    ...h,
    label: range === '6w' ? f.day(h.hour) : f.time(h.hour, timezone).replace(/ (UTC|PT)$/, ''),
    ok: Math.max(0, h.requests - h.errors),
    p50: h.p50Ms ?? null,
    p95: h.p95Ms ?? null,
  }));
  const breaches = d.breaches
    .filter((b) => b.kind === 'latency')
    .map((b) => {
      const row = hourly.find((h) => h.hour === b.hour);
      return row && row.p95 != null ? { x: row.label, y: row.p95, label: 'p95 over target' } : null;
    })
    .filter((x): x is { x: string; y: number; label: string } => !!x);
  const errBreaches = d.breaches.filter((b) => b.kind === 'errors').length;
  const anyLive = (reg.data ?? []).some((r) => r.source === 'live' && (!agentId || r.id === agentId));
  const src = agentId && !anyLive ? 'simulated' : 'mixed';
  const bucket = range === '6w' ? 'day' : 'hour';

  return (
    <div className="ao-page">
      <PageHead
        eyebrow="Agent Ops · Observe"
        title="Reliability"
        sub="SLOs with error budgets, request and latency trends with breach markers, model and component health, and the alert list. Acknowledging an alert is not resolving it."
        meta={<span>Data as of {f.ago(obs.dataAsOf)} · SLO window 28 days</span>}
        actions={
          <>
            <select className="ao-select" aria-label="Agent" value={agentId} onChange={(e) => set('agentId', e.target.value)}>
              <option value="">All agents</option>
              {(reg.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Seg label="Chart window" value={range} onChange={(v) => set('range', v === '7d' ? '' : v)} options={[{ value: '7d', label: '7 days · hourly' }, { value: '6w', label: '6 weeks · daily' }]} />
          </>
        }
      />

      <Panel title="Service level objectives" source={src} sub="Error budget = the share of the window allowed to miss the objective. “At risk” means under 25% of it is left.">
        <SloCards slos={d.slos} names={agentId ? undefined : names} />
      </Panel>

      <div className="ao-grid g-2">
        <Panel title={`Requests and errors per ${bucket}`} source={src} sub={errBreaches ? `${errBreaches} ${bucket}${errBreaches === 1 ? '' : 's'} above the 5% error-rate rule.` : 'Errors in red. No bucket above the 5% error-rate rule.'}>
          <Legend
            series={[
              { key: 'ok', label: 'Requests OK', color: 'var(--ao-indigo)' },
              { key: 'err', label: 'Errors', color: '#CF2519' },
            ]}
          />
          <Bars
            data={hourly}
            x="label"
            y="ok"
            errorKey="errors"
            color="#5E74E3"
            height={210}
            yFormat={(v) => String(v)}
            tipTitle={(r) => String(r.label)}
            tipRows={(r) => [
              { label: 'Requests', value: f.int(Number(r.requests)) },
              { label: 'Errors', value: f.int(Number(r.errors)), color: '#CF2519' },
              { label: 'AI calls', value: f.int(Number(r.aiCalls)) },
              { label: 'Fallbacks', value: f.int(Number(r.fallbacks)) },
            ]}
            ariaLabel={`Requests and errors per ${bucket}`}
          />
        </Panel>
        <Panel
          title={`Latency per ${bucket}`}
          source={src}
          sub={d.p95TargetMs ? `Red line: the ${f.ms(d.p95TargetMs)} p95 objective. Red dots: ${bucket}s over it. Empty ${bucket}s are gaps.` : 'Select one agent to see its p95 objective and breach markers. Empty buckets are gaps, not zero.'}
        >
          <Legend
            series={[
              { key: 'p50', label: 'p50', color: '#8C9BE8' },
              { key: 'p95', label: 'p95', color: '#102A56' },
            ]}
          />
          <Lines
            data={hourly}
            x="label"
            series={[
              { key: 'p50', label: 'p50', color: '#8C9BE8' },
              { key: 'p95', label: 'p95', color: '#102A56' },
            ]}
            height={210}
            yFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)}s` : `${v}ms`)}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => f.ms(v)}
            target={d.p95TargetMs ? { value: d.p95TargetMs, label: `p95 target ${f.ms(d.p95TargetMs)}` } : null}
            breaches={breaches}
            ariaLabel={`p50 and p95 latency per ${bucket}`}
          />
        </Panel>
      </div>

      <Panel title="Alerts" sub="Rule, expected versus actual, owner and runbook. Open → acknowledged (someone is on it) → resolved (the rule stopped firing)." flush>
        <AlertList alerts={d.alerts} names={agentId ? undefined : names} />
      </Panel>

      <div className="ao-grid g-2">
        <Panel title="Models" source={src} sub={`AI calls in the ${range === '6w' ? '6-week' : '7-day'} window.`} flush>
          {d.models.length ? (
            <Table
              caption="Models"
              compact
              rows={d.models}
              rowKey={(r) => r.model}
              defaultSort={{ key: 'calls', dir: 'desc' }}
              cols={[
                { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => <span className="ao-mono">{r.model}</span> },
                { key: 'calls', header: 'Calls', num: true, sort: (r) => r.calls, render: (r) => f.int(r.calls) },
                { key: 'share', header: 'Share', num: true, sort: (r) => r.share, render: (r) => f.pct(r.share) },
                { key: 'fail', header: 'Failures', num: true, sort: (r) => r.failures, render: (r) => <span style={{ color: r.failures ? 'var(--cn-danger-txt)' : undefined }}>{f.int(r.failures)}</span> },
                { key: 'p50', header: 'p50', num: true, sort: (r) => r.p50Ms, render: (r) => f.ms(r.p50Ms) },
                { key: 'cost', header: 'Cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd) },
              ]}
            />
          ) : (
            <div style={{ padding: 18 }}>
              <Empty title="No AI calls in this window" />
            </div>
          )}
        </Panel>
        <Panel title="Components" source={src} sub="Log events, errors and p95 duration by component." flush>
          <Table
            caption="Components"
            compact
            rows={d.components}
            rowKey={(r) => r.component}
            defaultSort={{ key: 'events', dir: 'desc' }}
            cols={[
              { key: 'c', header: 'Component', sort: (r) => r.component, render: (r) => <Link className="row-link" to={`/ops/logs?component=${r.component}${agentId ? `&agentId=${agentId}` : ''}`}>{r.component}</Link> },
              { key: 'events', header: 'Events', num: true, sort: (r) => r.events, render: (r) => f.int(r.events) },
              { key: 'errors', header: 'Errors', num: true, sort: (r) => r.errors, render: (r) => <span style={{ color: r.errors ? 'var(--cn-danger-txt)' : undefined }}>{f.int(r.errors)}</span> },
              { key: 'p95', header: 'p95', num: true, sort: (r) => r.p95Ms, render: (r) => f.ms(r.p95Ms) },
            ]}
          />
        </Panel>
      </div>
      <Callout tone="indigo">
        <SourceChip source="live" /> rows come from Signal Loop as it runs here; everything else is the simulated six-week history. Production would ship the same events over OTLP to the team’s tracing backend; Agent Ops keeps the agent-level rollups.
      </Callout>
    </div>
  );
}
