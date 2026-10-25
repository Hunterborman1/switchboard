import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SIGNAL_LOOP_AGENT_ID, type Alert, type Slo } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { ObservabilityX, RegistryRow } from '../../worker/platform/types';
import { acknowledgeAlert, useApi } from '../lib/api';
import * as f from '../lib/format';
import { Bars, Legend, Lines } from '../ui/charts';
import { IconTrace } from '../ui/icons';
import { RunbookLink } from './RunbookLink';
import { AboutNote, AlertPill, BudgetBar, Empty, ErrorState, ModelName, PageHead, PageSkeleton, Panel, Seg, SloPill, Table } from '../ui/kit';
import { InfoTip } from '../ui/InfoTip';
import { AREA_LABEL } from './Logs';

function sloValue(s: Slo): string {
  if (s.actual == null) return '—';
  if (s.key === 'p95_latency') return f.ms(s.actual);
  if (s.key === 'cost_per_unit') return f.money(s.actual, { precise: true });
  return f.pct(s.actual, 2);
}
function sloTarget(s: Slo): string {
  if (s.key === 'p95_latency') return `${f.ms(s.target)} or less`;
  if (s.key === 'cost_per_unit') return `${f.money(s.target, { precise: true })} or less`;
  return `${f.pct(s.target, s.target >= 0.99 ? 1 : 0)} or more`;
}

/** Plain names for each service target; the precise objective stays one hover away. */
const SLO_COPY: Record<string, { label: string; help: string }> = {
  run_success: { label: 'Runs that finish', help: 'Share of runs that finished with an output instead of failing.' },
  p95_latency: { label: 'Response time', help: 'How long requests take. Measured at the 95th percentile: 95 of every 100 requests finish within this time.' },
  grounding: { label: 'Answers backed by a source', help: 'Share of quotes and answers that can be traced to the source material they came from.' },
  delivery_success: { label: 'Deliveries that succeed', help: 'Share of messages and updates delivered to their destination without failing.' },
  cost_per_unit: { label: 'Cost per task', help: 'Average AI cost of one task over the window.' },
};
export const sloLabel = (s: Slo) => SLO_COPY[s.key]?.label ?? s.label;
function windowText(w: string): string {
  const m = /^(\d+)\s*d(ays?)?$/.exec(w.trim());
  return m ? `last ${m[1]} days` : w;
}

export function SloCards({ slos, names }: { slos: Slo[]; names?: Record<string, string> }) {
  if (!slos.length) return <Empty title="No service targets defined" />;
  return (
    <div className="ao-slos" {...tourAnchor('ops.slos')}>
      {slos.map((s) => (
        <article key={`${s.agentId}-${s.key}`} className={`ao-slo ${s.status}`} data-slo={s.key} data-status={s.status}>
          <div className="ao-slo-top">
            <div>
              <h3>
                {sloLabel(s)}
                <InfoTip label={sloLabel(s)}>
                  {SLO_COPY[s.key]?.help ?? s.label} Objective: {s.objective}.
                </InfoTip>
              </h3>
              <small>
                {names ? `${names[s.agentId] ?? s.agentId} · ` : ''}Target {sloTarget(s)}
              </small>
            </div>
            <SloPill value={s.status} />
          </div>
          <div className="ao-slo-val">
            <b>{sloValue(s)}</b>
            <span>{windowText(String(s.window))}</span>
          </div>
          <BudgetBar slo={s} />
          <small className="ao-muted" style={{ fontSize: 12 }}>
            {s.denominator != null ? (s.numerator != null ? `${f.int(s.numerator)} of ${f.int(s.denominator)} on target` : `Across ${f.int(s.denominator)} tasks`) : 'Nothing to measure in this window'}
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
  if (!alerts.length) return <div style={{ padding: 20 }}><Empty title="No alerts">No rule is firing and there were no incidents in this window.</Empty></div>;
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
                <b>{a.rule.replace(/^SLO breached/, 'Service target missed')}</b>
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
                  <IconTrace /> View trace
                </Link>
              ) : null}
              <RunbookLink url={a.runbook} />
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
                <span className="ao-muted" style={{ fontSize: 13, maxWidth: 200 }}>
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
  // Signal Loop (the real agent) is the default lens; "all" compares every agent.
  const agentParam = params.get('agentId') ?? SIGNAL_LOOP_AGENT_ID;
  const agentId = agentParam === 'all' ? '' : agentParam;
  const range = params.get('range') === '7d' ? '7d' : '6w';
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
      return row && row.p95 != null ? { x: row.label, y: row.p95, label: 'Over target' } : null;
    })
    .filter((x): x is { x: string; y: number; label: string } => !!x);
  const errBreaches = d.breaches.filter((b) => b.kind === 'errors').length;
  const anyLive = (reg.data ?? []).some((r) => r.source === 'live' && (!agentId || r.id === agentId));
  const src = agentId && !anyLive ? 'simulated' : 'mixed';
  const bucket = range === '6w' ? 'day' : 'hour';

  return (
    <div className="ao-page">
      <PageHead
        title="Reliability"
        sub="Whether each agent is meeting its service targets, how fast and error-free it is, and which alerts need an owner."
        meta={<span>Updated {f.ago(obs.dataAsOf)} · targets measured over the last 28 days</span>}
        actions={
          <>
            <select className="ao-select" aria-label="Agent" value={agentId || 'all'} onChange={(e) => set('agentId', e.target.value === SIGNAL_LOOP_AGENT_ID ? '' : e.target.value)}>
              <option value="all">All agents</option>
              {(reg.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Seg label="Chart window" value={range} onChange={(v) => set('range', v === '6w' ? '' : v)} options={[{ value: '6w', label: '6 weeks, daily' }, { value: '7d', label: '7 days, hourly' }]} />
          </>
        }
      />

      <Panel
        title="Service targets"
        source={src}
        sub="Each target allows a small share of misses over 28 days (its error budget). “At risk” means less than a quarter of that allowance is left."
        help="Service targets are the reliability promises each agent is held to (often called SLOs). The error budget is how many misses the target still allows before it is broken."
      >
        <SloCards slos={d.slos} names={agentId ? undefined : names} />
      </Panel>

      <div className="ao-grid g-2">
        <Panel title={`Requests and errors per ${bucket}`} source={src} sub={errBreaches ? `${errBreaches} ${bucket}${errBreaches === 1 ? '' : 's'} had more than 5% errors.` : `No ${bucket} had more than 5% errors.`}>
          <Legend
            series={[
              { key: 'ok', label: 'Succeeded', color: '#2F5DB8' },
              { key: 'err', label: 'Errors', color: '#B42318' },
            ]}
          />
          <Bars
            data={hourly}
            x="label"
            y="ok"
            errorKey="errors"
            color="#2F5DB8"
            height={210}
            yFormat={(v) => String(v)}
            tipTitle={(r) => String(r.label)}
            tipRows={(r) => [
              { label: 'Requests', value: f.int(Number(r.requests)) },
              { label: 'Errors', value: f.int(Number(r.errors)), color: '#B42318' },
              { label: 'AI calls', value: f.int(Number(r.aiCalls)) },
              { label: 'Used backup model', value: f.int(Number(r.fallbacks)) },
            ]}
            ariaLabel={`Requests and errors per ${bucket}`}
          />
        </Panel>
        <Panel
          title={`Response time per ${bucket}`}
          source={src}
          sub={d.p95TargetMs ? `Dashed red line: the ${f.ms(d.p95TargetMs)} target. Red dots: ${bucket}s that missed it.` : 'Select one agent to see its target. A gap means no requests, not zero.'}
          help="Typical is the median request. Slowest 5% is the 95th percentile: 95 of every 100 requests finish within it."
        >
          <Legend
            series={[
              { key: 'p50', label: 'Typical', color: '#3E8E9E' },
              { key: 'p95', label: 'Slowest 5%', color: '#2F5DB8' },
            ]}
          />
          <Lines
            data={hourly}
            x="label"
            series={[
              { key: 'p50', label: 'Typical', color: '#3E8E9E' },
              { key: 'p95', label: 'Slowest 5%', color: '#2F5DB8' },
            ]}
            height={210}
            yFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)}s` : `${v}ms`)}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => f.ms(v)}
            target={d.p95TargetMs ? { value: d.p95TargetMs, label: `Target ${f.ms(d.p95TargetMs)}` } : null}
            breaches={breaches}
            ariaLabel={`Typical and slowest-5% response time per ${bucket}`}
          />
        </Panel>
      </div>

      <Panel title="Alerts" sub="Open, then acknowledged when an owner is on it, then resolved when the rule stops firing. Acknowledging is not resolving." flush>
        <AlertList alerts={d.alerts} names={agentId ? undefined : names} />
      </Panel>

      <div className="ao-grid g-2w">
        <Panel title="Models" source={src} sub={`AI calls in the ${range === '6w' ? '6-week' : '7-day'} window.`} flush>
          {d.models.length ? (
            <Table
              caption="Models"
              compact
              className="ao-fit-wide"
              rows={d.models}
              rowKey={(r) => r.model}
              defaultSort={{ key: 'calls', dir: 'desc' }}
              cols={[
                { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => <span style={{ whiteSpace: 'nowrap' }}><ModelName id={r.model} names={agentId ? undefined : names} /></span> },
                { key: 'calls', header: 'Calls', num: true, sort: (r) => r.calls, render: (r) => f.int(r.calls) },
                { key: 'share', mobileHide: true, wideHide: true, header: 'Share', num: true, sort: (r) => r.share, render: (r) => f.pct(r.share) },
                { key: 'fail', mobileHide: true, header: 'Failures', num: true, sort: (r) => r.failures, render: (r) => <span style={{ color: r.failures ? 'var(--ao-danger)' : undefined }}>{f.int(r.failures)}</span> },
                { key: 'p50', mobileHide: true, wideHide: true, header: 'Typical time', help: 'Median time per call: half of calls are faster.', num: true, sort: (r) => r.p50Ms, render: (r) => f.ms(r.p50Ms) },
                { key: 'cost', header: 'Cost', num: true, sort: (r) => r.costUsd, render: (r) => f.money(r.costUsd) },
              ]}
            />
          ) : (
            <div style={{ padding: 20 }}>
              <Empty title="No AI calls in this window" />
            </div>
          )}
        </Panel>
        <Panel title="Areas" source={src} sub="Log lines, errors and slowest-5% time by part of the system." flush>
          <Table
            caption="Areas"
            compact
            rows={d.components}
            rowKey={(r) => r.component}
            defaultSort={{ key: 'events', dir: 'desc' }}
            cols={[
              { key: 'c', header: 'Area', sort: (r) => r.component, render: (r) => <Link className="row-link" to={`/ops/logs?component=${r.component}${agentId ? `&agentId=${agentId}` : ''}`}>{AREA_LABEL[r.component] ?? r.component}</Link> },
              { key: 'events', header: 'Log lines', num: true, sort: (r) => r.events, render: (r) => f.int(r.events) },
              { key: 'errors', header: 'Errors', num: true, sort: (r) => r.errors, render: (r) => <span style={{ color: r.errors ? 'var(--ao-danger)' : undefined }}>{f.int(r.errors)}</span> },
              { key: 'p95', header: 'Slowest 5%', help: '95 of every 100 log lines in this area finished within this time.', num: true, sort: (r) => r.p95Ms, render: (r) => f.ms(r.p95Ms) },
            ]}
          />
        </Panel>
      </div>
      <AboutNote>
        Signal Loop’s numbers are live from this demo; everything else is the simulated six-week history. In production the same events would also go to the team’s tracing tool, with Agent Ops keeping the per-agent summaries.
      </AboutNote>
    </div>
  );
}
