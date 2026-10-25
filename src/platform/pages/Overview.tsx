import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import type { AssumptionsView, OverviewX } from '../../worker/platform/types';
import { putAssumptions, useApi } from '../lib/api';
import * as f from '../lib/format';
import { Legend, Lines, Spark, StackedBars } from '../ui/charts';
import { IconAlert, IconArrowRight, IconCalendar, IconDoc, IconPulse, IconShield, IconSliders } from '../ui/icons';
import { AgentDot, AgentStatus, Callout, Delta, Drawer, ErrorState, PageHead, PageSkeleton, Panel, SourceChip, Table, type Col } from '../ui/kit';

type Stage = 'invoked' | 'output' | 'reviewed' | 'automatic';
const STAGES: { key: Stage; label: string; help: string }[] = [
  { key: 'invoked', label: 'Invoked', help: 'Every unit of work an agent was asked to do.' },
  { key: 'output', label: 'Output produced', help: 'Runs that finished with an output (not failed).' },
  { key: 'reviewed', label: 'Accepted or edited', help: 'A person kept the output, as-is or after editing.' },
  { key: 'automatic', label: 'Ran automatically', help: 'Above the confidence gate: delivered with no human step.' },
];

function stageCount(o: OverviewX['agentRows'][number]['outcomes'], s: Stage): number {
  const all = o.accepted + o.edited + o.rejected + o.automatic + o.failed;
  if (s === 'invoked') return all;
  if (s === 'output') return all - o.failed;
  if (s === 'reviewed') return o.accepted + o.edited;
  return o.automatic;
}

export function Overview() {
  const ov = useApi<OverviewX>('/overview', { pollMs: 30_000 });
  const [params, setParams] = useSearchParams();
  const stage = (params.get('stage') as Stage | null) ?? null;
  const [assumptionsOpen, setAssumptionsOpen] = useState(params.get('assumptions') === '1');
  const navigate = useNavigate();

  if (ov.error && !ov.data) return <div className="ao-page"><ErrorState message={ov.error.message} onRetry={ov.reload} /></div>;
  if (!ov.data) return <PageSkeleton />;
  const d = ov.data;
  const t = d.totals;
  const weeks = d.weekly.map((w) => w.week);
  const simEndWeek = weeks.filter((w) => w <= d.simulatedTo).pop() ?? null;
  const hasLiveWeeksAfter = weeks.some((w) => w > d.simulatedTo);
  const sl = d.agentRows.find((a) => a.source === 'live');
  const hasLive = !!sl && d.agentRows.some((a) => a.source === 'live');

  const chartRows = d.weekly.map((w, i) => {
    const row: Record<string, unknown> = { week: f.day(w.week), weekIso: w.week, total: w.hoursReturned, partial: i === d.weekly.length - 1 };
    for (const a of d.agentRows) row[a.agentId] = a.weeklyHours[i] ?? null;
    return row;
  });
  const series = d.agentRows.map((a) => ({ key: a.agentId, label: a.name, color: a.color }));

  const funnel = d.funnel;
  const fCounts: Record<Stage, number> = { invoked: funnel.invoked, output: funnel.output, reviewed: funnel.accepted + funnel.edited, automatic: funnel.automatic };

  const attention = buildAttention(d);
  const hoursShare = d.agentRows.map((a) => ({ ...a, share: t.hoursReturned > 0 ? a.hoursReturned / t.hoursReturned : 0 }));

  const cols: Col<(typeof hoursShare)[number]>[] = [
    {
      key: 'name',
      header: 'Agent',
      sort: (r) => r.name,
      render: (r) => (
        <div className="cell-title" style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 'min(260px, 52vw)' }}>
          <AgentDot color={r.color} />
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <Link className="row-link" to={`/ops/agents/${r.agentId}`}>
              {r.name}
            </Link>
            <small className="ao-muted" style={{ fontSize: 'var(--fs-caption)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {r.builtWith} · {r.department} <SourceChip source={r.source === 'live' ? 'mixed' : 'simulated'} label={r.source === 'live' ? 'Live + history' : 'Simulated'} />
            </small>
          </span>
        </div>
      ),
    },
    ...(stage ? [{ key: 'stage', header: STAGES.find((s) => s.key === stage)!.label, num: true, sort: (r: (typeof hoursShare)[number]) => stageCount(r.outcomes, stage), render: (r: (typeof hoursShare)[number]) => <b>{f.int(stageCount(r.outcomes, stage))}</b> } as Col<(typeof hoursShare)[number]>] : []),
    { key: 'units', mobileHide: true, header: 'Work units', num: true, sort: (r) => r.workUnits, render: (r) => <span title={r.unitLabel}>{f.int(r.workUnits)}</span> },
    { key: 'hours', header: 'Hours', num: true, sort: (r) => r.hoursReturned, render: (r) => f.hours(r.hoursReturned) },
    { key: 'value', mobileHide: true, header: 'Value', num: true, sort: (r) => r.valueUsd, render: (r) => f.money(r.valueUsd, { est: true }) },
    { key: 'cost', mobileHide: true, header: 'AI cost', num: true, sort: (r) => r.aiCostUsd, render: (r) => f.money(r.aiCostUsd) },
    { key: 'roi', mobileHide: true, header: 'ROI', num: true, sort: (r) => r.roiMultiple, render: (r) => (r.roiMultiple == null ? '—' : `~${f.multiple(r.roiMultiple)}`) },
    { key: 'acc', mobileHide: true, header: 'Accepted', num: true, sort: (r) => r.acceptanceRate, render: (r) => <span title="(accepted + automatic) ÷ all work units">{f.pct(r.acceptanceRate)}</span> },
    { key: 'users', mobileHide: true, header: 'Users', num: true, sort: (r) => r.activeUsers, render: (r) => f.int(r.activeUsers) },
    { key: 'trend', mobileHide: true, header: 'Weekly hours', render: (r) => <Spark values={r.weeklyHours} color={r.color} label={`${r.name} weekly hours`} width={84} /> },
  ];

  return (
    <div className="ao-page">
      <PageHead
        eyebrow="Agent Ops · Executive overview"
        title="What our AI agents return"
        sub="Hours given back to teams, what that is worth, what it costs, and who is using each agent. One place to see every production agent at Invoca."
        meta={
          <>
            <span>
              Period {f.range(d.range.from, d.range.to)} · data as of {f.ago(ov.dataAsOf)}
            </span>
            <SourceChip source="mixed" />
          </>
        }
        actions={
          <>
            <button type="button" className="ao-btn" onClick={() => setAssumptionsOpen(true)}>
              <IconSliders /> Assumptions
            </button>
            <Link to="/ops/summary" className="ao-btn indigo">
              <IconDoc /> Executive summary
            </Link>
          </>
        }
      />

      <div {...tourAnchor('ops.overview.kpis')}>
        <MetricStrip
          size="lg"
          minItemWidth={150}
          label="Headline metrics"
          items={[
            { label: 'In production', value: t.agentsInProduction, sub: `${d.agentRows.length} in registry · ${d.agentRows.filter((a) => a.status !== 'production').length} pilot or review` },
            { label: 'Hours returned', value: <><span className="ao-est">~</span>{f.int(t.hoursReturned)}</>, unit: 'h', sub: `~${f.int(d.lastWeek.hoursReturned)} h in the latest week` },
            { label: 'Value', value: <><span className="ao-est">~</span>{f.compactMoney(t.valueUsd)}</>, sub: <button type="button" className="ao-link" style={{ fontSize: 'inherit' }} onClick={() => setAssumptionsOpen(true)}>hours × ${d.assumptions.loadedHourlyUsd}/h loaded · assumptions</button> },
            { label: 'AI cost', value: f.money(t.aiCostUsd), sub: 'Metered model spend, not billing' },
            { label: 'ROI multiple', value: <><span className="ao-est">~</span>{t.roiMultiple == null ? '—' : f.multiple(t.roiMultiple)}</>, sub: 'Value ÷ AI cost (excludes seats & build)' },
            {
              label: 'Weekly active',
              value: d.wau.current,
              unit: `of ${t.activeUsers}`,
              sub: (
                <span className="ao-kpi-sub">
                  <Delta value={d.wau.prior ? (d.wau.current - d.wau.prior) / d.wau.prior : null} /> vs prior week ({d.wau.prior})
                </span>
              ),
            },
          ]}
        />
      </div>

      <Callout tone="warning" title="Estimates, not billing data.">
        Hours use each agent’s registered “manual way” baseline (an assumption until the 2-week time study). Value = hours × the loaded hourly cost you can change in{' '}
        <button type="button" className="ao-link" onClick={() => setAssumptionsOpen(true)}>
          Assumptions
        </button>
        . Six weeks of org history are simulated; Signal Loop’s own runs and the people using this demo are live.
      </Callout>

      <div className="ao-grid g-main">
        <Panel
          title="Hours returned per week, by agent"
          source="mixed"
          sub="Σ(baseline minutes − human review minutes) ÷ 60, per ISO week (Mon–Sun, UTC). A missing bar means no data for that agent that week, not zero."
          attrs={tourAnchor('ops.overview.chart')}
          foot={
            <>
              <span>Latest week is partial until Sunday.</span>
              <Link to="/ops/agents">Per-agent detail →</Link>
            </>
          }
        >
          <Legend series={series} />
          <StackedBars
            data={chartRows}
            x="week"
            series={series}
            height={330}
            yFormat={(v) => `${v}h`}
            ariaLabel={`Stacked weekly hours returned by agent, ${weeks.length} weeks`}
            tipTitle={(r) => `Week of ${String(r.week)}${r.partial ? ' (partial)' : ''}`}
            tipValue={(v) => (v == null ? 'no data' : `~${f.num(v, 1)} h`)}
            tipNote={(r) => `Total ~${f.num(Number(r.total), 1)} h`}
            marker={hasLiveWeeksAfter && simEndWeek ? { x: f.day(simEndWeek), label: 'simulated history ends' } : null}
          />
        </Panel>

        <Panel title="Needs attention" sub="Every item links to its evidence and names an owner." attrs={tourAnchor('ops.overview.attention')} flush>
          {attention.length ? (
            <ul className="ao-att">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link to={a.href}>
                    <span className={`ao-att-icon ${a.tone}`} aria-hidden="true">
                      {a.icon}
                    </span>
                    <span>
                      <b>{a.title}</b>
                      <small>{a.detail}</small>
                    </span>
                    <span className="go">
                      Evidence <IconArrowRight size={12} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: 18 }}>
              <Callout tone="live">Nothing needs attention: no overdue reviews, SLO breaches, standard gaps, cost spikes or adoption drops.</Callout>
            </div>
          )}
        </Panel>
      </div>

      <div className="ao-grid g-2">
        <Panel className="ao-hide-sm" title="Adoption" source="mixed" sub="Distinct people using any agent each week. A person counts once per week however many agents they use.">
          <Lines
            data={d.weekly.map((w) => ({ week: f.day(w.week), users: w.activeUsers }))}
            x="week"
            series={[{ key: 'users', label: 'Weekly active users', color: 'var(--ao-indigo)' }]}
            height={210}
            yFormat={(v) => String(v)}
            tipTitle={(r) => `Week of ${String(r.week)}`}
            tipValue={(_, v) => (v == null ? 'no data' : `${v} people`)}
            ariaLabel="Weekly active users"
          />
        </Panel>
        <Panel title="Where agent work ends up" source="mixed" sub="Select a stage to see it per agent in the table below.">
          <div className="ao-funnel" role="group" aria-label="Agent work funnel">
            {STAGES.map((s) => {
              const n = fCounts[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={stage === s.key}
                  title={s.help}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    if (stage === s.key) next.delete('stage');
                    else next.set('stage', s.key);
                    setParams(next, { replace: true });
                  }}
                >
                  <span className="lbl">{s.label}</span>
                  <span className="val">{f.int(n)}</span>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${funnel.invoked ? (n / funnel.invoked) * 100 : 0}%` }} />
                  </span>
                  <span className="sub">{f.pct(funnel.invoked ? n / funnel.invoked : null)} of invoked</span>
                </button>
              );
            })}
          </div>
          <p className="ao-muted" style={{ fontSize: 'var(--fs-caption)', margin: '12px 0 0' }}>
            Not kept: {f.int(funnel.rejected)} rejected by a reviewer, {f.int(funnel.failed)} failed runs. Rejected work counts against hours returned (the review time was spent for nothing).
          </p>
        </Panel>
      </div>

      <Panel
        title="Impact by agent"
        source="mixed"
        sub={`${f.range(d.range.from, d.range.to)}. Value and ROI are estimates (~). Acceptance = (accepted + automatic) ÷ all work units.`}
        actions={stage ? <button type="button" className="ao-btn sm" onClick={() => { const n = new URLSearchParams(params); n.delete('stage'); setParams(n, { replace: true }); }}>Clear stage filter</button> : null}
        flush
      >
        <Table
          caption="Impact by agent"
          rows={hoursShare}
          cols={cols}
          rowKey={(r) => r.agentId}
          onRow={(r) => navigate(`/ops/agents/${r.agentId}`)}
          defaultSort={{ key: 'hours', dir: 'desc' }}
          foot={
            <tr>
              <td>All agents</td>
              {stage ? <td className="num">{f.int(fCounts[stage])}</td> : null}
              <td className="num ao-hide-sm">{f.int(t.workUnits)}</td>
              <td className="num">{f.hours(t.hoursReturned)}</td>
              <td className="num ao-hide-sm">{f.money(t.valueUsd, { est: true })}</td>
              <td className="num ao-hide-sm">{f.money(t.aiCostUsd)}</td>
              <td className="num ao-hide-sm">{t.roiMultiple == null ? '—' : `~${f.multiple(t.roiMultiple)}`}</td>
              <td className="num ao-hide-sm">{f.pct(funnel.invoked ? (funnel.accepted + funnel.automatic) / funnel.invoked : null)}</td>
              <td className="num ao-hide-sm">{f.int(t.activeUsers)}</td>
              <td className="ao-hide-sm" />
            </tr>
          }
        />
      </Panel>

      {!hasLive ? null : (
        <p className="ao-muted ao-hide-sm" style={{ fontSize: 'var(--fs-caption)', margin: 0 }}>
          Signal Loop rows combine its live runs with simulated history; every row in Logs & traces says which is which.
        </p>
      )}

      <AssumptionsDrawer open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} overview={d} onSaved={ov.reload} />
    </div>
  );
}

// ---------------------------------------------------------------- needs attention

type AttItem = { key: string; tone: 'warning' | 'danger' | 'info' | 'neutral'; icon: JSX.Element; title: string; detail: string; href: string };

function buildAttention(d: OverviewX): AttItem[] {
  const out: AttItem[] = [];
  const name = (id: string) => d.agentRows.find((a) => a.agentId === id)?.name ?? id;
  for (const a of d.attention) {
    if (a.kind === 'standard_gap') {
      const [head, ...rest] = a.message.split('. ');
      const gap = head!.replace(/^.*standard gap: /, '');
      out.push({ key: `std-${a.agentId}-${gap}`, tone: 'warning', icon: <IconShield size={15} />, title: `${name(a.agentId)}: ${gap.charAt(0).toLowerCase()}${gap.slice(1)}`, detail: rest.join('. '), href: `/ops/agents/${a.agentId}#standard` });
    } else if (a.kind === 'slo_breached') {
      out.push({ key: `slo-${a.message}`, tone: 'danger', icon: <IconPulse size={15} />, title: a.message.replace(/\.$/, ''), detail: 'Error budget exhausted for the window.', href: `/ops/reliability?agentId=${a.agentId}` });
    } else if (a.kind === 'review_overdue') {
      out.push({ key: `rev-${a.agentId}`, tone: 'danger', icon: <IconCalendar size={15} />, title: `${name(a.agentId)}: review overdue`, detail: a.message, href: '/ops/standard/reviews' });
    } else {
      out.push({ key: `${a.kind}-${a.agentId}`, tone: 'warning', icon: <IconAlert size={15} />, title: a.message, detail: a.kind === 'cost_spike' ? 'Week-over-week AI cost.' : 'Weekly active users vs the week before.', href: a.kind === 'cost_spike' ? '/ops/cost' : '/ops/usage' });
    }
  }
  for (const al of d.openAlerts) {
    if (al.rule.startsWith('SLO breached')) continue;
    out.push({ key: al.id, tone: al.severity === 'critical' ? 'danger' : 'warning', icon: <IconAlert size={15} />, title: `${name(al.agentId)}: ${al.rule.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`, detail: `Expected ${al.expected}; actual ${al.actual}. Owner ${al.owner}${al.status === 'acknowledged' ? ' (acknowledged)' : ''}.`, href: `/ops/reliability?agentId=${al.agentId}#alerts` });
  }
  for (const r of d.reviewsDue) {
    if (r.reviewStatus !== 'due_soon') continue;
    out.push({ key: `due-${r.agentId}`, tone: 'info', icon: <IconCalendar size={15} />, title: `${r.name}: review due ${f.day(r.nextReview)}`, detail: `Owner ${r.owner}. Scheduled review within 14 days.`, href: '/ops/standard/reviews' });
  }
  return out;
}

// ---------------------------------------------------------------- assumptions drawer

function AssumptionsDrawer({ open, onClose, overview, onSaved }: { open: boolean; onClose: () => void; overview: OverviewX; onSaved: () => void }) {
  const a = useApi<AssumptionsView>(open ? '/assumptions' : null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = a.data?.loadedHourlyUsd ?? overview.assumptions.loadedHourlyUsd;
  const value = draft ?? String(current);
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 20 && parsed <= 500;
  const preview = useMemo(() => (valid ? overview.totals.hoursReturned * parsed : null), [valid, parsed, overview.totals.hoursReturned]);

  const save = async (v: number | null) => {
    setBusy(true);
    setErr(null);
    try {
      await putAssumptions(v);
      setDraft(null);
      a.reload();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Impact assumptions"
      sub="Changes apply to your workspace only; other viewers keep the baseline."
      foot={
        <>
          {a.data?.isOverride ? (
            <button type="button" className="ao-btn ghost" disabled={busy} onClick={() => save(null)}>
              Reset to $85 baseline
            </button>
          ) : null}
          <button type="button" className="ao-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="ao-btn primary" disabled={!valid || busy || parsed === current} onClick={() => save(parsed)} aria-disabled={!valid || parsed === current}>
            {busy ? 'Saving…' : 'Save for my workspace'}
          </button>
        </>
      }
    >
      <label className="ao-field">
        <span>Loaded hourly cost (USD)</span>
        <input className="ao-input" type="number" inputMode="decimal" min={20} max={500} step={1} value={value} onChange={(e) => setDraft(e.target.value)} aria-invalid={!valid} aria-describedby="ao-rate-help" style={{ maxWidth: 180 }} />
        <small id="ao-rate-help" className="ao-muted" style={{ fontSize: 'var(--fs-caption)' }}>
          {valid ? `Salary + benefits + overhead per working hour. At $${parsed}/h, ~${f.int(overview.totals.hoursReturned)} h is worth ~${f.money(preview)}.` : 'Enter a value between $20 and $500.'}
        </small>
        {a.data?.isOverride ? <small style={{ color: 'var(--ao-indigo-ink)', fontSize: 'var(--fs-caption)' }}>Your workspace override is active.</small> : null}
        {err ? <small style={{ color: 'var(--cn-danger-txt)' }}>{err}</small> : null}
      </label>

      <div>
        <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 500, marginBottom: 8 }}>How hours are counted</h3>
        <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--cn-ink-2)', margin: 0, lineHeight: 1.55 }}>
          For each unit of work: baseline minutes (the manual way) if the output was accepted, edited or ran automatically, minus the minutes a person actually spent reviewing or editing. Rejected and failed work earns nothing, and its review time counts against the agent.
        </p>
      </div>

      <div>
        <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 500, marginBottom: 8 }}>Baselines per agent</h3>
        <Table
          caption="Baseline minutes per unit"
          compact
          rows={overview.baselines}
          rowKey={(r) => r.agentId}
          cols={[
            { key: 'a', header: 'Agent · unit', render: (r) => <div className="cell-title"><b>{r.name}</b><small>per {r.unitLabel}</small></div> },
            { key: 'b', header: 'Manual way', num: true, render: (r) => `${r.baselineMinutes} min` },
            { key: 'h', header: 'Review time', num: true, render: (r) => `${r.humanMinutes} min` },
          ]}
        />
        <p className="ao-muted" style={{ fontSize: 'var(--fs-caption)', margin: '8px 0 0' }}>
          Labelled assumptions, to validate with a 2-week time study: shadow the people doing the work the manual way, then replace these numbers.
        </p>
      </div>
      <Callout tone="indigo">{overview.assumptions.sourceNote}</Callout>
    </Drawer>
  );
}
