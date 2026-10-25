import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import { rewriteModelIds } from '../../shared/modelLabels';
import type { AssumptionsView, OverviewX } from '../../worker/platform/types';
import { putAssumptions, useApi } from '../lib/api';
import * as f from '../lib/format';
import { Legend, Lines, Spark, StackedBars } from '../ui/charts';
import { IconAlert, IconArrowRight, IconCalendar, IconDoc, IconPulse, IconShield, IconSliders } from '../ui/icons';
import { AboutNote, AgentDot, Callout, Delta, Drawer, ErrorState, PageHead, PageSkeleton, Panel, Table, type Col } from '../ui/kit';

type Stage = 'invoked' | 'output' | 'reviewed' | 'automatic';
const STAGES: { key: Stage; label: string; help: string }[] = [
  { key: 'invoked', label: 'Requested', help: 'Every task an agent was asked to do.' },
  { key: 'output', label: 'Output produced', help: 'Tasks that finished with an output (did not fail).' },
  { key: 'reviewed', label: 'Accepted or edited', help: 'A person kept the output, as it was or after editing.' },
  { key: 'automatic', label: 'Ran automatically', help: 'Confident enough to deliver with no human step.' },
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
  const series = d.agentRows.map((a, i) => ({ key: a.agentId, label: a.name, color: f.seriesColor(a.color, i) }));

  const funnel = d.funnel;
  const fCounts: Record<Stage, number> = { invoked: funnel.invoked, output: funnel.output, reviewed: funnel.accepted + funnel.edited, automatic: funnel.automatic };

  const attention = buildAttention(d);
  const hoursShare = d.agentRows.map((a, i) => ({ ...a, color: f.seriesColor(a.color, i), share: t.hoursReturned > 0 ? a.hoursReturned / t.hoursReturned : 0 }));
  const unitHelp = d.agentRows.map((a) => `${a.name}: one ${a.unitLabel}`).join('. ');
  const nonProd = d.agentRows.filter((a) => a.status !== 'production').length;

  const cols: Col<(typeof hoursShare)[number]>[] = [
    {
      key: 'name',
      header: 'Agent',
      sort: (r) => r.name,
      render: (r) => (
        <div className="cell-title" style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 'min(240px, 52vw)' }}>
          <AgentDot color={r.color} />
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <Link className="row-link" to={`/ops/agents/${r.agentId}`}>
              {r.name}
            </Link>
            <small className="ao-muted" style={{ fontSize: 13 }}>
              {r.department} · built with {r.builtWith}
            </small>
          </span>
        </div>
      ),
    },
    ...(stage ? [{ key: 'stage', header: STAGES.find((s) => s.key === stage)!.label, num: true, sort: (r: (typeof hoursShare)[number]) => stageCount(r.outcomes, stage), render: (r: (typeof hoursShare)[number]) => <b style={{ fontWeight: 600 }}>{f.int(stageCount(r.outcomes, stage))}</b> } as Col<(typeof hoursShare)[number]>] : []),
    { key: 'units', mobileHide: true, header: 'Tasks', help: `Units of work each agent completed. ${unitHelp}.`, num: true, sort: (r) => r.workUnits, render: (r) => f.int(r.workUnits) },
    { key: 'hours', header: 'Hours saved', num: true, sort: (r) => r.hoursReturned, render: (r) => f.hours(r.hoursReturned) },
    { key: 'value', mobileHide: true, header: 'Estimated value', num: true, sort: (r) => r.valueUsd, render: (r) => f.money(r.valueUsd) },
    { key: 'cost', mobileHide: true, header: 'AI cost', num: true, sort: (r) => r.aiCostUsd, render: (r) => f.money(r.aiCostUsd) },
    { key: 'acc', mobileHide: true, wideHide: true, header: 'Accepted', help: 'Share of tasks whose output was kept: accepted by a reviewer or delivered automatically.', num: true, sort: (r) => r.acceptanceRate, render: (r) => f.pct(r.acceptanceRate) },
    { key: 'users', mobileHide: true, wideHide: true, header: 'People', num: true, sort: (r) => r.activeUsers, render: (r) => f.int(r.activeUsers) },
    { key: 'trend', mobileHide: true, wideHide: true, header: 'Weekly trend', render: (r) => <Spark values={r.weeklyHours} color={r.color} label={`${r.name} hours saved per week`} width={84} /> },
  ];

  return (
    <div className="ao-page">
      <PageHead
        title="What our AI agents return"
        sub="Hours given back to teams, what that time is worth, what the AI costs, and who uses each agent."
        meta={<span>{f.range(d.range.from, d.range.to)} · updated {f.ago(ov.dataAsOf)}</span>}
        actions={
          <>
            <button type="button" className="ao-btn" onClick={() => setAssumptionsOpen(true)}>
              <IconSliders /> Assumptions
            </button>
            <Link to="/ops/summary" className="ao-btn primary">
              <IconDoc /> Executive summary
            </Link>
          </>
        }
      />

      <div className="ao-kpis5" {...tourAnchor('ops.overview.kpis')}>
        <MetricStrip
          size="lg"
          label="Headline metrics"
          items={[
            {
              label: 'Hours saved',
              value: f.int(t.hoursReturned),
              unit: 'h',
              sub: `${f.int(d.lastWeek.hoursReturned)} h in the latest week`,
              help: 'Time people would have spent doing these tasks by hand, minus the time they spent reviewing the agent’s work. Rejected and failed work counts against it.',
            },
            {
              label: 'Estimated value',
              value: f.compactMoney(t.valueUsd),
              sub: (
                <span>
                  At ${d.assumptions.loadedHourlyUsd}/h ·{' '}
                  <button type="button" className="ao-link" onClick={() => setAssumptionsOpen(true)}>
                    Edit
                  </button>
                </span>
              ),
              help: (
                <>
                  Hours saved × a loaded hourly cost of ${d.assumptions.loadedHourlyUsd} (salary, benefits and overhead).
                  {t.roiMultiple == null ? null : ` That is about ${f.int(t.roiMultiple)} times the AI cost; build time and seat licences are not included.`}
                </>
              ),
            },
            { label: 'AI cost', value: f.money(t.aiCostUsd), sub: 'Metered model usage', help: 'The sum of what each AI call reported in token usage, priced per model. Not an invoice; excludes build time and seat licences.' },
            { label: 'Agents in production', value: t.agentsInProduction, sub: `${d.agentRows.length} in the registry${nonProd ? `, ${nonProd} in pilot or review` : ''}` },
            {
              label: 'Weekly active users',
              value: d.wau.current,
              unit: `of ${t.activeUsers}`,
              sub: (
                <>
                  <Delta value={d.wau.prior ? (d.wau.current - d.wau.prior) / d.wau.prior : null} /> vs {d.wau.prior} the week before
                </>
              ),
              help: 'People who used at least one agent in the latest week, out of everyone who used one in the period.',
            },
          ]}
        />
      </div>

      <AboutNote onAssumptions={() => setAssumptionsOpen(true)} />

      <div className="ao-grid g-main">
        <Panel
          title="Hours saved per week"
          sub="By agent, Monday to Sunday. A missing bar means no data for that agent that week, not zero."
          help="For each task: the minutes it takes by hand, minus the minutes a person spent reviewing, added up per week and converted to hours."
          attrs={tourAnchor('ops.overview.chart')}
          foot={
            <>
              <span>The latest week is still in progress.</span>
              <Link to="/ops/agents">View agents →</Link>
            </>
          }
        >
          <Legend series={series} />
          <StackedBars
            data={chartRows}
            x="week"
            series={series}
            height={300}
            yFormat={(v) => `${v} h`}
            ariaLabel={`Hours saved per week by agent, ${weeks.length} weeks`}
            tipTitle={(r) => `Week of ${String(r.week)}${r.partial ? ' (in progress)' : ''}`}
            tipValue={(v) => (v == null ? 'No data' : `${f.num(v, 1)} h`)}
            tipNote={(r) => `Total ${f.num(Number(r.total), 1)} h`}
            marker={hasLiveWeeksAfter && simEndWeek ? { x: f.day(simEndWeek), label: 'Simulated history ends' } : null}
          />
        </Panel>

        <Panel title="Needs attention" sub="Each item links to its evidence." attrs={tourAnchor('ops.overview.attention')} flush>
          {attention.length ? (
            <ul className="ao-att">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link to={a.href}>
                    <span className={`ao-att-icon ${a.tone}`} aria-hidden="true">
                      {a.icon}
                    </span>
                    <span>
                      <b>{rewriteModelIds(a.title)}</b>
                      <small>{rewriteModelIds(a.detail)}</small>
                    </span>
                    <span className="go" aria-hidden="true">
                      <IconArrowRight size={14} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: 20 }}>
              <Callout tone="live">Nothing needs attention: no overdue reviews, missed service targets, standard gaps, cost spikes or drops in use.</Callout>
            </div>
          )}
        </Panel>
      </div>

      <div className="ao-grid g-2">
        <Panel className="ao-hide-sm" title="Weekly active users" sub="People using any agent each week. Each person counts once, however many agents they use.">
          <Lines
            data={d.weekly.map((w) => ({ week: f.day(w.week), users: w.activeUsers }))}
            x="week"
            series={[{ key: 'users', label: 'Weekly active users', color: '#008463' }]}
            height={210}
            yFormat={(v) => String(v)}
            tipTitle={(r) => `Week of ${String(r.week)}`}
            tipValue={(_, v) => (v == null ? 'No data' : `${v} people`)}
            ariaLabel="Weekly active users"
          />
        </Panel>
        <Panel title="What happens to agent work" sub="Select a stage to compare agents in the table below.">
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
                  <span className="sub">{f.pct(funnel.invoked ? n / funnel.invoked : null)} of all tasks</span>
                </button>
              );
            })}
          </div>
          <p className="ao-muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
            Not kept: {f.int(funnel.rejected)} rejected by a reviewer and {f.int(funnel.failed)} failed. Rejected work counts against hours saved, because the review time was spent for nothing.
          </p>
        </Panel>
      </div>

      <Panel
        title="Impact by agent"
        sub={`${f.range(d.range.from, d.range.to)}. Value is an estimate and leaves out build time and seat licences.`}
        actions={stage ? <button type="button" className="ao-btn sm" onClick={() => { const n = new URLSearchParams(params); n.delete('stage'); setParams(n, { replace: true }); }}>Clear stage filter</button> : null}
        flush
      >
        <Table
          caption="Impact by agent"
          className="ao-fit"
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
              <td className="num ao-hide-sm">{f.money(t.valueUsd)}</td>
              <td className="num ao-hide-sm">{f.money(t.aiCostUsd)}</td>
              <td className="num ao-hide-sm ao-hide-md">{f.pct(funnel.invoked ? (funnel.accepted + funnel.automatic) / funnel.invoked : null)}</td>
              <td className="num ao-hide-sm ao-hide-md">{f.int(t.activeUsers)}</td>
              <td className="ao-hide-sm ao-hide-md" />
            </tr>
          }
        />
      </Panel>

      {!hasLive ? null : (
        <p className="ao-muted ao-hide-sm" style={{ fontSize: 13, margin: 0 }}>
          Signal Loop’s rows combine its live runs with simulated history. Every line in Logs and traces says which it is.
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
      out.push({ key: `slo-${a.message}`, tone: 'danger', icon: <IconPulse size={15} />, title: a.message.replace(/\.$/, ''), detail: 'The allowance for misses in its 28-day window is used up.', href: `/ops/reliability?agentId=${a.agentId}` });
    } else if (a.kind === 'review_overdue') {
      out.push({ key: `rev-${a.agentId}`, tone: 'danger', icon: <IconCalendar size={15} />, title: `${name(a.agentId)}: review overdue`, detail: a.message, href: '/ops/standard/reviews' });
    } else {
      out.push({ key: `${a.kind}-${a.agentId}`, tone: 'warning', icon: <IconAlert size={15} />, title: a.message, detail: a.kind === 'cost_spike' ? 'AI cost this week compared with last week.' : 'Weekly active users compared with the week before.', href: a.kind === 'cost_spike' ? '/ops/cost' : '/ops/usage' });
    }
  }
  for (const al of d.openAlerts) {
    if (al.rule.startsWith('SLO breached')) continue;
    out.push({ key: al.id, tone: al.severity === 'critical' ? 'danger' : 'warning', icon: <IconAlert size={15} />, title: `${name(al.agentId)}: ${al.rule.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`, detail: `Expected ${al.expected}, actual ${al.actual}. Owner: ${al.owner}${al.status === 'acknowledged' ? ' (acknowledged)' : ''}.`, href: `/ops/reliability?agentId=${al.agentId}#alerts` });
  }
  for (const r of d.reviewsDue) {
    if (r.reviewStatus !== 'due_soon') continue;
    out.push({ key: `due-${r.agentId}`, tone: 'info', icon: <IconCalendar size={15} />, title: `${r.name}: review due ${f.day(r.nextReview)}`, detail: `Owner: ${r.owner}. Scheduled within the next 14 days.`, href: '/ops/standard/reviews' });
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
      sub="Changes apply to your workspace only. Other viewers keep the baseline."
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
        <small id="ao-rate-help" className="ao-muted" style={{ fontSize: 13 }}>
          {valid ? `Salary, benefits and overhead per working hour. At $${parsed}/h, ${f.int(overview.totals.hoursReturned)} hours saved is worth ${f.money(preview)}.` : 'Enter a value between $20 and $500.'}
        </small>
        {a.data?.isOverride ? <small style={{ color: 'var(--ao-accent-text)', fontSize: 13, fontWeight: 500 }}>Your workspace override is active.</small> : null}
        {err ? <small style={{ color: 'var(--ao-danger)', fontSize: 13 }}>{err}</small> : null}
      </label>

      <div>
        <h3>How hours saved are counted</h3>
        <p>
          For each task whose output was accepted, edited or delivered automatically: the minutes it takes by hand, minus the minutes a person actually spent reviewing or editing. Rejected and failed work earns nothing, and its review time counts against the agent.
        </p>
      </div>

      <div>
        <h3>Time by hand, per agent</h3>
        <Table
          caption="Minutes per task by hand"
          compact
          rows={overview.baselines}
          rowKey={(r) => r.agentId}
          cols={[
            { key: 'a', header: 'Agent and task', render: (r) => <div className="cell-title"><b>{r.name}</b><small>per {r.unitLabel}</small></div> },
            { key: 'b', header: 'By hand', num: true, render: (r) => `${r.baselineMinutes} min` },
            { key: 'h', header: 'Review time', num: true, render: (r) => `${r.humanMinutes} min` },
          ]}
        />
        <p style={{ fontSize: 13, marginTop: 8 }}>
          These are assumptions, to be confirmed with a 2-week time study: shadow the people doing the work by hand, then replace these numbers.
        </p>
      </div>
      <Callout tone="indigo">{overview.assumptions.sourceNote}</Callout>
    </Drawer>
  );
}
