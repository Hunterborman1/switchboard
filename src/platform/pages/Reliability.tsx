/**
 * Reliability: whether each agent meets its service targets, how fast and error-free it is,
 * and which alerts need an owner. Signal Loop (the real agent) is the default lens.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Card, EmptyState, Page, PageHeader, Section, Segmented, Select, Table, Toolbar, useToast } from '../../ds';
import { IconCheckCircle } from '../../ds/icons';
import { SIGNAL_LOOP_AGENT_ID, type Alert, type Slo } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { ObservabilityX, RegistryRow } from '../../worker/platform/types';
import { acknowledgeAlert, useApi } from '../lib/api';
import * as f from '../lib/format';
import { Bars, ChartLegend, ChartSummary, Lines } from '../ui/charts';
import { IconTrace } from '../ui/icons';
import { InfoTip } from '../ui/InfoTip';
import { agentLabel, agentOptions, AlertBadge, BudgetBar, canOpenAgent, LoadError, ModelName, OpsSkeleton, SEVERITY, SloBadge, SortHead, SourceBadge, useOpsTitle, useSorted, VocabBadge } from '../ui/kit';
import { AREA_LABEL } from './Logs';
import { RunbookLink } from './RunbookLink';

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
  p95_latency: { label: 'Response time', help: 'How long requests take, at the 95th percentile: 95 of every 100 requests finish within this time.' },
  grounding: { label: 'Answers backed by a source', help: 'Share of quotes and answers that can be traced to the source material they came from.' },
  delivery_success: { label: 'Deliveries that succeed', help: 'Share of messages and updates delivered to their destination without failing.' },
  cost_per_unit: { label: 'Cost per task', help: 'Average AI cost of one task over the window.' },
};
export const sloLabel = (s: Slo) => SLO_COPY[s.key]?.label ?? s.label;

/** One tile per service target: status, value against target, and the error budget left. */
export function SloCards({ slos, names }: { slos: Slo[]; names?: Record<string, string> }) {
  if (!slos.length)
    return (
      <Card>
        <EmptyState compact title="No service targets defined" />
      </Card>
    );
  return (
    <div className="ao-slos" {...tourAnchor('ops.slos')}>
      {slos.map((s) => (
        <article key={`${s.agentId}-${s.key}`} className="ao-slo" data-slo={s.key} data-status={s.status}>
          <div className={`ao-slo__heading${names ? ' ao-slo__heading--agent' : ''}`}>
            {names ? (
              <span className="ao-slo__agent" title={names[s.agentId] ?? s.agentId}>
                {names[s.agentId] ?? s.agentId}
              </span>
            ) : null}
            <h3 className="ao-slo__title">
              {sloLabel(s).split(' ').slice(0, -1).join(' ')}{' '}
              {/* The last word and the info button never break apart. */}
              <span className="ao-nowrap">
                {sloLabel(s).split(' ').pop()}
                <InfoTip label={sloLabel(s)}>
                  {SLO_COPY[s.key]?.help ?? s.label} Objective: {s.objective}.
                </InfoTip>
              </span>
            </h3>
            <span className="ao-slo__target">Target {sloTarget(s)}</span>
          </div>
          <div className="ao-slo__value">
            <span className="ao-slo__number">{sloValue(s)}</span>
            <SloBadge value={s.status} />
          </div>
          <BudgetBar slo={s} />
          <span className="ao-slo__foot">
            {s.denominator != null ? (s.numerator != null ? `${f.int(s.numerator)} of ${f.int(s.denominator)} on target` : `Across ${f.int(s.denominator)} tasks`) : 'Nothing to measure in this window'}
          </span>
        </article>
      ))}
    </div>
  );
}

/**
 * Alerts with expected against actual, an owner, a runbook and the trace that tripped them.
 * An alert on an agent that cannot open (the simulated one) shows its facts and no actions.
 */
export function AlertList({ alerts, names, agents }: { alerts: Alert[]; names?: Record<string, string>; agents?: RegistryRow[] | null }) {
  const { timezone } = useTimezone();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, 'acknowledged'>>({});
  if (!alerts.length) return <EmptyState compact icon={<IconCheckCircle />} title="No alerts" description="No rule is firing and there were no incidents in this window." />;
  return (
    <div className="ao-alerts" {...tourAnchor('ops.alerts')} id="alerts">
      {alerts.map((a) => {
        const status = local[a.id] ?? a.status;
        const opens = canOpenAgent(a.agentId, agents);
        return (
          <article key={a.id} className="ao-alert" data-alert={a.id} data-status={status}>
            <div className="ao-alert__main">
              <div className="ao-alert__head">
                <AlertBadge value={status} />
                <VocabBadge vocab={SEVERITY} value={a.severity} dot={false} />
                <span className="ao-alert__title">{a.rule.replace(/^SLO breached/, 'Service target missed')}</span>
                {names ? <span className="ao-alert__agent">{names[a.agentId] ?? a.agentId}</span> : null}
              </div>
              <dl className="ao-alert__facts">
                <div className="ao-alert__fact">
                  <dt className="ao-alert__key">Expected</dt>
                  <dd className="ao-alert__val">{a.expected}</dd>
                </div>
                <div className="ao-alert__fact">
                  <dt className="ao-alert__key">Actual</dt>
                  <dd className="ao-alert__val">{a.actual}</dd>
                </div>
                <div className="ao-alert__fact">
                  <dt className="ao-alert__key">Owner</dt>
                  <dd className="ao-alert__val">{a.owner}</dd>
                </div>
                <div className="ao-alert__fact">
                  <dt className="ao-alert__key">{status === 'resolved' ? 'Fired' : 'Since'}</dt>
                  <dd className="ao-alert__val">{f.time(a.at, timezone)}</dd>
                </div>
              </dl>
            </div>
            <div className="ao-alert__actions">
              {opens ? (
                <>
                  {a.traceId ? (
                    <ButtonLink size="sm" to={`/ops/traces/${a.traceId}`} icon={<IconTrace size={14} />}>
                      View trace
                    </ButtonLink>
                  ) : null}
                  <RunbookLink url={a.runbook} />
                  {status === 'open' ? (
                    <Button
                      size="sm"
                      loading={busy === a.id}
                      title="Acknowledging says an owner is on it. The alert stays until its rule stops firing."
                      onClick={async () => {
                        setBusy(a.id);
                        try {
                          await acknowledgeAlert(a.id, null);
                          setLocal((l) => ({ ...l, [a.id]: 'acknowledged' }));
                        } catch (e) {
                          toast({ tone: 'danger', title: 'Couldn’t acknowledge the alert', body: e instanceof Error ? e.message : String(e) });
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Acknowledge
                    </Button>
                  ) : status === 'acknowledged' ? (
                    <span className="ao-alert__ack">Acknowledged in your workspace; resolves when the rule stops firing.</span>
                  ) : null}
                </>
              ) : (
                <span className="ao-alert__ack">Simulated agent, shown for comparison.</span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function Reliability() {
  useOpsTitle('Reliability');
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

  const toolbar = (
    <Toolbar
      start={
        <Select
          aria-label="Agent"
          value={agentId || 'all'}
          onChange={(e) => set('agentId', e.target.value === SIGNAL_LOOP_AGENT_ID ? '' : e.target.value)}
          options={agentOptions(reg.data, 'all')}
          style={{ width: 260, maxWidth: '100%' }}
        />
      }
      end={
        <Segmented
          label="Chart window"
          value={range}
          onChange={(v) => set('range', v === '6w' ? '' : v)}
          options={[
            { value: '6w', label: '6 weeks, daily' },
            { value: '7d', label: '7 days, hourly' },
          ]}
        />
      }
    />
  );
  const header = (
    <PageHeader
      title="Reliability"
      description="Service targets, speed and errors, and the alerts that need an owner."
      meta={
        <>
          <span>Targets measured over the last 28 days</span>
          {obs.data ? <span>Updated {f.ago(obs.dataAsOf)}</span> : null}
        </>
      }
    />
  );

  if (obs.error && !obs.data)
    return (
      <Page>
        {header}
        <LoadError error={obs.error} onRetry={obs.reload} what="reliability" />
      </Page>
    );
  if (!obs.data) return <OpsSkeleton />;
  const d = obs.data;
  const names = Object.fromEntries((reg.data ?? []).map((r) => [r.id, agentLabel(r.name, r.source)]));
  const shortNames = Object.fromEntries((reg.data ?? []).map((r) => [r.id, agentLabel(r.profile.shortName || r.name, r.source)]));
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
      return row && row.p95 != null ? { x: row.label, y: row.p95 } : null;
    })
    .filter((x): x is { x: string; y: number } => !!x);
  const errBreaches = d.breaches.filter((b) => b.kind === 'errors').length;
  const bucket = range === '6w' ? 'day' : 'hour';
  const totalReq = hourly.reduce((s, h) => s + h.requests, 0);
  const totalErr = hourly.reduce((s, h) => s + h.errors, 0);
  const p95s = hourly.map((h) => h.p95).filter((v): v is number => v != null);
  const worstP95 = p95s.length ? Math.max(...p95s) : null;

  return (
    <Page>
      {header}
      {toolbar}

      <Section
        title={
          <span className="ao-inline" style={{ gap: 4 }}>
            Service targets
            <InfoTip label="Service targets">The reliability promises each agent is held to (often called SLOs). The error budget is how many misses the target still allows in 28 days before it is broken.</InfoTip>
          </span>
        }
        description="“At risk” means less than a quarter of the allowance for misses is left."
      >
        <SloCards slos={d.slos} names={agentId ? undefined : shortNames} />
      </Section>

      <div className="ao-pair">
        <Card className="ao-fill" title={`Requests and errors per ${bucket}`} actions={<SourceBadge source="mixed" />}>
          <ChartLegend
            series={[
              { key: 'ok', label: 'Succeeded', color: 'var(--chart-2)' },
              { key: 'err', label: 'Errors', color: 'var(--danger)' },
            ]}
          />
          <Bars
            data={hourly}
            x="label"
            y="ok"
            errorKey="errors"
            color="var(--chart-2)"
            height={210}
            yFormat={(v) => f.int(v)}
            tipTitle={(r) => String(r.label)}
            tipRows={(r) => [
              { label: 'Requests', value: f.int(Number(r.requests)) },
              { label: 'Errors', value: f.int(Number(r.errors)), color: 'var(--danger)' },
              { label: 'AI calls', value: f.int(Number(r.aiCalls)) },
              { label: 'Used backup model', value: f.int(Number(r.fallbacks)) },
            ]}
            ariaLabel={`Requests and errors per ${bucket}`}
          />
          <ChartSummary>
            {f.int(totalReq)} requests, {f.int(totalErr)} error{totalErr === 1 ? '' : 's'} ({totalErr && totalReq && totalErr / totalReq < 0.001 ? 'under 0.1%' : f.pct(totalReq ? totalErr / totalReq : null, 1)}).{' '}
            {errBreaches ? `${errBreaches} ${bucket}${errBreaches === 1 ? '' : 's'} had more than 5% errors.` : `No ${bucket} had more than 5% errors.`}
          </ChartSummary>
        </Card>
        <Card
          className="ao-fill"
          title={
            <span className="ao-inline" style={{ gap: 4 }}>
              Response time per {bucket}
              <InfoTip label="Response time">Typical is the median request. Slowest 5% is the 95th percentile: 95 of every 100 requests finish within it.</InfoTip>
            </span>
          }
          actions={<SourceBadge source="mixed" />}
        >
          <ChartLegend
            series={[
              { key: 'p50', label: 'Typical', color: 'var(--chart-5)' },
              { key: 'p95', label: 'Slowest 5%', color: 'var(--chart-2)' },
            ]}
            marks={[...(d.p95TargetMs ? [{ kind: 'target' as const, label: `Target ${f.ms(d.p95TargetMs)}` }] : []), ...(breaches.length ? [{ kind: 'breach' as const, label: 'Missed target' }] : [])]}
          />
          <Lines
            data={hourly}
            x="label"
            series={[
              { key: 'p50', label: 'Typical', color: 'var(--chart-5)' },
              { key: 'p95', label: 'Slowest 5%', color: 'var(--chart-2)' },
            ]}
            height={210}
            yFormat={(v) => (v === 0 ? '0' : v >= 1000 ? `${Number.isInteger(v / 1000) ? v / 1000 : (v / 1000).toFixed(1)} s` : `${v} ms`)}
            tipTitle={(r) => String(r.label)}
            tipValue={(_, v) => f.ms(v)}
            target={d.p95TargetMs ?? null}
            breaches={breaches}
            ariaLabel={`Typical and slowest-5% response time per ${bucket}`}
          />
          <ChartSummary>
            {worstP95 != null ? `Slowest 5% peaked at ${f.ms(worstP95)}` : 'No requests in this window'}
            {d.p95TargetMs ? `, against a ${f.ms(d.p95TargetMs)} target; ${breaches.length ? `${breaches.length} ${bucket}${breaches.length === 1 ? '' : 's'} missed it` : 'never missed'}.` : '. Select one agent to see its target.'}
          </ChartSummary>
        </Card>
      </div>

      <Card title="Alerts" description="Acknowledged means an owner is on it; it resolves when the rule stops firing." flush>
        <AlertList alerts={d.alerts} names={agentId ? undefined : names} agents={reg.data} />
      </Card>

      <div className="ao-pair">
        <ModelsTable models={d.models} names={agentId ? undefined : shortNames} range={range} />
        <AreasTable components={d.components} agentId={agentId} />
      </div>
    </Page>
  );
}

function ModelsTable({ models, names, range }: { models: ObservabilityX['models']; names?: Record<string, string>; range: '6w' | '7d' }) {
  const { sorted, state, by } = useSorted(models, { model: (r) => r.model, calls: (r) => r.calls, fail: (r) => r.failures, p50: (r) => r.p50Ms, cost: (r) => r.costUsd }, { key: 'calls', dir: 'desc' });
  return (
    <Card className="ao-fill" title="Models" description={`AI calls in the ${range === '6w' ? '6-week' : '7-day'} window, by the model’s role.`} flush>
      {models.length ? (
        <Table label="Models" compact>
          <thead>
            <tr>
              <SortHead active={state('model')} onSort={() => by('model')}>
                Model
              </SortHead>
              <SortHead num active={state('calls')} onSort={() => by('calls', true)}>
                Calls
              </SortHead>
              <SortHead num className="ao-hide-sm" active={state('fail')} onSort={() => by('fail', true)}>
                Failures
              </SortHead>
              <SortHead num className="ao-hide-sm" active={state('p50')} onSort={() => by('p50', true)} help="Median time per call: half of calls are faster.">
                Typical time
              </SortHead>
              <SortHead num active={state('cost')} onSort={() => by('cost', true)}>
                Cost
              </SortHead>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.model}>
                <td className="ao-model-col">
                  <ModelName id={r.model} names={names} />
                </td>
                <td className="is-num">{f.int(r.calls)}</td>
                <td className="is-num ao-hide-sm" style={r.failures ? { color: 'var(--danger)' } : undefined}>
                  {f.int(r.failures)}
                </td>
                <td className="is-num ao-hide-sm">{f.ms(r.p50Ms)}</td>
                <td className="is-num">{f.money(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState compact title="No AI calls in this window" />
      )}
    </Card>
  );
}

function AreasTable({ components, agentId }: { components: ObservabilityX['components']; agentId: string }) {
  const { sorted, state, by } = useSorted(components, { c: (r) => AREA_LABEL[r.component] ?? r.component, events: (r) => r.events, errors: (r) => r.errors, p95: (r) => r.p95Ms }, { key: 'events', dir: 'desc' });
  return (
    <Card className="ao-fill" title="Areas" description="Log lines, errors and slowest-5% time by part of the system." flush>
      <Table label="Areas" compact>
        <thead>
          <tr>
            <SortHead active={state('c')} onSort={() => by('c')}>
              Area
            </SortHead>
            <SortHead num active={state('events')} onSort={() => by('events', true)}>
              Log lines
            </SortHead>
            <SortHead num className="ao-end-sm" active={state('errors')} onSort={() => by('errors', true)}>
              Errors
            </SortHead>
            <SortHead num className="ao-hide-sm" active={state('p95')} onSort={() => by('p95', true)} help="95 of every 100 log lines in this area finished within this time.">
              Slowest 5%
            </SortHead>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.component}>
              <td>
                <Link to={`/ops/logs?component=${r.component}${agentId ? `&agentId=${agentId}` : ''}`}>{AREA_LABEL[r.component] ?? r.component}</Link>
              </td>
              <td className="is-num">{f.int(r.events)}</td>
              <td className="is-num ao-end-sm" style={r.errors ? { color: 'var(--danger)' } : undefined}>
                {f.int(r.errors)}
              </td>
              <td className="is-num ao-hide-sm">{f.ms(r.p95Ms)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
