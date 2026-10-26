/**
 * Agent Ops overview: what the agents return (hours, value, AI cost, people), what needs an
 * owner, and the impact of each agent. The exec's first screen.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Callout, Card, Drawer, EmptyState, Field, Input, Page, PageHeader, Stats, Table } from '../../ds';
import { IconAlertTriangle, IconCalendar, IconCheckCircle, IconChevronRight, IconFileText, IconSettings, IconShield, IconActivity } from '../../ds/icons';
import { rewriteModelIds } from '../../shared/modelLabels';
import { tourAnchor } from '../../tour/anchors';
import type { AssumptionsView, OverviewX } from '../../worker/platform/types';
import { putAssumptions, useApi } from '../lib/api';
import * as f from '../lib/format';
import { ChartLegend, ChartSummary, Lines, Spark, StackedBars } from '../ui/charts';
import { InfoTip } from '../ui/InfoTip';
import { AgentCell, LoadError, OpsSkeleton, SortHead, useOpsTitle, useSorted } from '../ui/kit';

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
  useOpsTitle('Overview');
  const ov = useApi<OverviewX>('/overview', { pollMs: 30_000 });
  const [params, setParams] = useSearchParams();
  const stage = (params.get('stage') as Stage | null) ?? null;
  const [assumptionsOpen, setAssumptionsOpen] = useState(params.get('assumptions') === '1');

  if (ov.error && !ov.data)
    return (
      <Page>
        <LoadError error={ov.error} onRetry={ov.reload} what="the overview" />
      </Page>
    );
  if (!ov.data) return <OpsSkeleton />;
  const d = ov.data;
  const t = d.totals;
  const setStage = (s: Stage | null) => {
    const next = new URLSearchParams(params);
    if (s) next.set('stage', s);
    else next.delete('stage');
    setParams(next, { replace: true });
  };
  const wauDelta = d.wau.prior ? Math.round(((d.wau.current - d.wau.prior) / d.wau.prior) * 100) : null;

  return (
    <Page>
      <PageHeader
        title="What our AI agents return"
        description="Hours given back to teams, what that time is worth and what the AI costs."
        meta={
          <>
            <span>{f.range(d.range.from, d.range.to)}</span>
            <span>Updated {f.ago(ov.dataAsOf)}</span>
          </>
        }
        actions={
          <>
            <Button icon={<IconSettings />} onClick={() => setAssumptionsOpen(true)}>
              Assumptions
            </Button>
            <ButtonLink to="/ops/summary" variant="primary" icon={<IconFileText />}>
              Executive summary
            </ButtonLink>
          </>
        }
      />

      <div className="ao-kpis5">
        <Stats
          attrs={tourAnchor('ops.overview.kpis')}
          items={[
            {
              label: 'Hours saved',
              value: f.int(t.hoursReturned),
              unit: 'h',
              sub: `${f.int(d.lastWeek.hoursReturned)} h in the latest week`,
              info: <InfoTip label="Hours saved">Time people would have spent on these tasks by hand, minus the time they spent reviewing the agent’s work. Rejected and failed work counts against it.</InfoTip>,
            },
            {
              label: 'Estimated value',
              value: f.compactMoney(t.valueUsd),
              sub: (
                <>
                  At ${d.assumptions.loadedHourlyUsd}/h.{' '}
                  <button type="button" className="ds-link-button" onClick={() => setAssumptionsOpen(true)}>
                    Edit
                  </button>
                </>
              ),
              info: (
                <InfoTip label="Estimated value">
                  Hours saved times a loaded hourly cost of ${d.assumptions.loadedHourlyUsd} (salary, benefits and overhead). Build time and seat licences are not included.
                </InfoTip>
              ),
            },
            {
              label: 'AI cost',
              value: f.money(t.aiCostUsd),
              sub: 'Metered model usage',
              info: <InfoTip label="AI cost">What each AI call reported in token usage, priced per model. Not an invoice; excludes build time and seat licences.</InfoTip>,
            },
            {
              label: 'Agents in production',
              value: t.agentsInProduction,
              sub: `${d.agentRows.length} in the registry`,
            },
            {
              label: 'Weekly active users',
              value: d.wau.current,
              unit: `of ${t.activeUsers}`,
              delta: wauDelta == null || wauDelta === 0 ? null : { value: `${Math.abs(wauDelta)}%`, direction: wauDelta > 0 ? 'up' : 'down' },
              sub: d.wau.prior ? `vs ${d.wau.prior} the week before` : 'First week of data',
              info: <InfoTip label="Weekly active users">People who used at least one agent in the latest week, out of everyone who used one in the period.</InfoTip>,
            },
          ]}
        />
      </div>

      <Callout
        title="Estimates, not billing data."
        actions={
          <Button size="sm" variant="ghost" onClick={() => setAssumptionsOpen(true)}>
            Edit assumptions
          </Button>
        }
      >
        Six weeks of history are simulated; Signal Loop’s runs and the people using this demo are live.
      </Callout>

      <div className="ao-split ao-split--stretch">
        <HoursChart d={d} />
        <Attention d={d} />
      </div>

      <div className="ao-pair">
        <WauChart d={d} />
        <Funnel d={d} stage={stage} onStage={setStage} />
      </div>

      <ImpactTable d={d} stage={stage} onClear={() => setStage(null)} />

      <AssumptionsDrawer open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} overview={d} onSaved={ov.reload} />
    </Page>
  );
}

// ---------------------------------------------------------------- hours chart

function HoursChart({ d }: { d: OverviewX }) {
  const weeks = d.weekly.map((w) => w.week);
  const firstLiveWeek = weeks.find((w) => w > d.simulatedTo) ?? null;
  const hasSimBefore = weeks.some((w) => w <= d.simulatedTo);
  const boundary = firstLiveWeek && hasSimBefore ? f.day(firstLiveWeek) : null;
  const rows = d.weekly.map((w, i) => {
    const row: Record<string, unknown> = { week: f.day(w.week), total: w.hoursReturned, partial: i === d.weekly.length - 1 };
    for (const a of d.agentRows) row[a.agentId] = a.weeklyHours[i] ?? null;
    return row;
  });
  const series = d.agentRows.map((a, i) => ({ key: a.agentId, label: a.name, color: f.seriesColor(a.color, i) }));
  const ranked = [...d.agentRows].sort((a, b) => b.hoursReturned - a.hoursReturned);
  const top = ranked[0];
  const latest = d.weekly[d.weekly.length - 1];
  return (
    <Card
      className="ao-fill"
      title={
        <span className="ao-inline" style={{ gap: 4 }}>
          Hours saved per week
          <InfoTip label="Hours saved per week">For each task: the minutes it takes by hand, minus the minutes a person spent reviewing, added up per week and converted to hours.</InfoTip>
        </span>
      }
      description="By agent. A missing bar means no data that week, not zero."
      attrs={tourAnchor('ops.overview.chart')}
      footer={
        <>
          <span>The latest week is still in progress.</span>
          <Link to="/ops/agents">View agents</Link>
        </>
      }
    >
      <ChartLegend series={series} marks={boundary ? [{ kind: 'boundary', label: 'Simulated history ends' }] : []} />
      <StackedBars
        data={rows}
        x="week"
        series={series}
        height={280}
        yFormat={(v) => `${v} h`}
        ariaLabel={`Hours saved per week by agent, ${weeks.length} weeks`}
        tipTitle={(r) => `Week of ${String(r.week)}${r.partial ? ' (in progress)' : ''}`}
        tipValue={(v) => (v == null ? 'No data' : `${f.num(v, 1)} h`)}
        tipNote={(r) => `Total ${f.num(Number(r.total), 1)} h`}
        boundary={boundary}
      />
      <ChartSummary>
        {f.int(d.totals.hoursReturned)} hours saved over {weeks.length} weeks
        {top ? `; ${top.name} saved the most, ${f.hours(top.hoursReturned)}` : ''}. {latest ? `${f.num(latest.hoursReturned, 1)} h so far this week.` : ''}
      </ChartSummary>
    </Card>
  );
}

// ---------------------------------------------------------------- needs attention

type AttItem = { key: string; tone: 'warning' | 'danger' | 'info'; icon: JSX.Element; title: string; detail: string; href: string };

function buildAttention(d: OverviewX): AttItem[] {
  const out: AttItem[] = [];
  const name = (id: string) => d.agentRows.find((a) => a.agentId === id)?.name ?? id;
  for (const a of d.attention) {
    if (a.kind === 'standard_gap') {
      const [head, ...rest] = a.message.split('. ');
      const gap = head!.replace(/^.*standard gap: /, '');
      out.push({ key: `std-${a.agentId}-${gap}`, tone: 'warning', icon: <IconShield size={15} />, title: `${name(a.agentId)}: ${gap.charAt(0).toLowerCase()}${gap.slice(1)}`, detail: rest.join('. '), href: `/ops/agents/${a.agentId}#standard` });
    } else if (a.kind === 'slo_breached') {
      out.push({ key: `slo-${a.message}`, tone: 'danger', icon: <IconActivity size={15} />, title: a.message.replace(/\.$/, ''), detail: 'The allowance for misses in its 28-day window is used up.', href: `/ops/reliability?agentId=${a.agentId}` });
    } else if (a.kind === 'review_overdue') {
      out.push({ key: `rev-${a.agentId}`, tone: 'danger', icon: <IconCalendar size={15} />, title: `${name(a.agentId)}: review overdue`, detail: a.message, href: '/ops/standard/reviews' });
    } else {
      out.push({
        key: `${a.kind}-${a.agentId}`,
        tone: 'warning',
        icon: <IconAlertTriangle size={15} />,
        title: a.message,
        detail: a.kind === 'cost_spike' ? 'AI cost this week compared with last week.' : 'Weekly active users compared with the week before.',
        href: a.kind === 'cost_spike' ? '/ops/cost' : '/ops/usage',
      });
    }
  }
  for (const al of d.openAlerts) {
    if (al.rule.startsWith('SLO breached')) continue;
    out.push({
      key: al.id,
      tone: al.severity === 'critical' ? 'danger' : 'warning',
      icon: <IconAlertTriangle size={15} />,
      title: `${name(al.agentId)}: ${al.rule.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`,
      detail: `Expected ${al.expected}, actual ${al.actual}. Owner: ${al.owner}${al.status === 'acknowledged' ? ' (acknowledged)' : ''}.`,
      href: `/ops/reliability?agentId=${al.agentId}#alerts`,
    });
  }
  for (const r of d.reviewsDue) {
    if (r.reviewStatus !== 'due_soon') continue;
    out.push({ key: `due-${r.agentId}`, tone: 'info', icon: <IconCalendar size={15} />, title: `${r.name}: review due ${f.day(r.nextReview)}`, detail: `Owner: ${r.owner}. Scheduled within the next 14 days.`, href: '/ops/standard/reviews' });
  }
  return out;
}

function Attention({ d }: { d: OverviewX }) {
  const items = buildAttention(d);
  return (
    <Card className="ao-fill" title="Needs attention" description="Each item links to its evidence." flush attrs={tourAnchor('ops.overview.attention')}>
      {items.length ? (
        <ul className="ds-list">
          {items.map((a) => (
            <li key={a.key}>
              <Link to={a.href} className="ds-list__item ao-att">
                <span className={`ao-att-icon ao-att-icon--${a.tone}`} aria-hidden="true">
                  {a.icon}
                </span>
                <span className="ao-att__text">
                  <span className="ao-att__title">{rewriteModelIds(a.title)}</span>
                  {a.detail ? <span className="ao-att__detail">{rewriteModelIds(a.detail)}</span> : null}
                </span>
                <IconChevronRight size={14} className="ao-att__go" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<IconCheckCircle />} title="Nothing needs attention" description="No overdue reviews, missed service targets, standard gaps, cost spikes or drops in use." />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- weekly active users

function WauChart({ d }: { d: OverviewX }) {
  const vals = d.weekly.map((w) => w.activeUsers);
  const earlier = vals.slice(0, -1);
  const last = vals[vals.length - 1] ?? 0;
  const lastIsLive = (d.weekly[d.weekly.length - 1]?.week ?? '') > d.simulatedTo;
  return (
    <Card className="ao-fill" title="Weekly active users" description="People using any agent each week, counted once however many agents they use.">
      <Lines
        data={d.weekly.map((w) => ({ week: f.day(w.week), users: w.activeUsers }))}
        x="week"
        series={[{ key: 'users', label: 'Weekly active users', color: 'var(--chart-1)' }]}
        height={200}
        yFormat={(v) => String(v)}
        tipTitle={(r) => `Week of ${String(r.week)}`}
        tipValue={(_, v) => (v == null ? 'No data' : `${v} ${v === 1 ? 'person' : 'people'}`)}
        ariaLabel="Weekly active users"
      />
      <ChartSummary>
        {earlier.length ? `Between ${Math.min(...earlier)} and ${Math.max(...earlier)} people a week before this one; ` : ''}
        {last} so far this week{lastIsLive ? ', including live viewers of this demo' : ''}.
      </ChartSummary>
    </Card>
  );
}

// ---------------------------------------------------------------- funnel

function Funnel({ d, stage, onStage }: { d: OverviewX; stage: Stage | null; onStage: (s: Stage | null) => void }) {
  const funnel = d.funnel;
  const counts: Record<Stage, number> = { invoked: funnel.invoked, output: funnel.output, reviewed: funnel.accepted + funnel.edited, automatic: funnel.automatic };
  return (
    <Card className="ao-fill" title="What happens to agent work" description="Select a stage to compare agents in the table below.">
      <div className="ao-funnel" role="group" aria-label="Agent work funnel">
        {STAGES.map((s) => {
          const n = counts[s.key];
          const share = funnel.invoked ? n / funnel.invoked : null;
          return (
            <button key={s.key} type="button" className="ao-funnel__item" aria-pressed={stage === s.key} title={s.help} onClick={() => onStage(stage === s.key ? null : s.key)}>
              <span className="ao-funnel__label">{s.label}</span>
              <span className="ao-funnel__value">{f.int(n)}</span>
              <MeterBar value={share ?? 0} label={`${s.label}: ${f.pct(share)} of all tasks`} />
              <span className="ao-funnel__sub">{f.pct(share)} of all tasks</span>
            </button>
          );
        })}
      </div>
      <ChartSummary>
        Not kept: {f.int(funnel.rejected)} rejected by a reviewer and {f.int(funnel.failed)} failed. Rejected work counts against hours saved.
      </ChartSummary>
    </Card>
  );
}

/** A meter without the meter role (the button already names the number). */
function MeterBar({ value, label }: { value: number; label: string }) {
  return (
    <span className="ds-meter" aria-hidden="true" title={label}>
      <span className="ds-meter__fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

// ---------------------------------------------------------------- impact table

function ImpactTable({ d, stage, onClear }: { d: OverviewX; stage: Stage | null; onClear: () => void }) {
  const navigate = useNavigate();
  const t = d.totals;
  const rows = useMemo(() => d.agentRows.map((a, i) => ({ ...a, color: f.seriesColor(a.color, i) })), [d.agentRows]);
  type Row = (typeof rows)[number];
  const { sorted, state, by } = useSorted<Row>(
    rows,
    {
      name: (r) => r.name,
      stage: (r) => (stage ? stageCount(r.outcomes, stage) : null),
      units: (r) => r.workUnits,
      hours: (r) => r.hoursReturned,
      value: (r) => r.valueUsd,
      cost: (r) => r.aiCostUsd,
      acc: (r) => r.acceptanceRate,
      users: (r) => r.activeUsers,
    },
    { key: 'hours', dir: 'desc' },
  );
  const unitHelp = d.agentRows.map((a) => `${a.name}: one ${a.unitLabel}`).join('. ');
  const stageLabel = stage ? STAGES.find((s) => s.key === stage)!.label : null;
  return (
    <Card
      title="Impact by agent"
      description={`${f.range(d.range.from, d.range.to)}. Value is an estimate and leaves out build time and seat licences.`}
      actions={
        stage ? (
          <Button size="sm" onClick={onClear}>
            Clear stage filter
          </Button>
        ) : null
      }
      flush
    >
      <Table label="Impact by agent">
        <thead>
          <tr>
            <SortHead active={state('name')} onSort={() => by('name')}>
              Agent
            </SortHead>
            {stageLabel ? (
              <SortHead num active={state('stage')} onSort={() => by('stage', true)}>
                {stageLabel}
              </SortHead>
            ) : null}
            <SortHead num className="ao-hide-sm" active={state('units')} onSort={() => by('units', true)} help={`Units of work each agent completed. ${unitHelp}.`}>
              Tasks
            </SortHead>
            <SortHead num className="ao-end-sm" active={state('hours')} onSort={() => by('hours', true)}>
              Hours saved
            </SortHead>
            <SortHead num className="ao-hide-sm" active={state('value')} onSort={() => by('value', true)}>
              Estimated value
            </SortHead>
            <SortHead num className="ao-hide-sm ao-end-md" active={state('cost')} onSort={() => by('cost', true)}>
              AI cost
            </SortHead>
            <SortHead num className="ao-hide-md" active={state('acc')} onSort={() => by('acc', true)} help="Share of tasks whose output was kept: accepted by a reviewer or delivered automatically.">
              Accepted
            </SortHead>
            <SortHead num className="ao-hide-md" active={state('users')} onSort={() => by('users', true)}>
              People
            </SortHead>
            <th className="ao-hide-md">Weekly trend</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.agentId} className="is-clickable has-row-link" onClick={() => navigate(`/ops/agents/${r.agentId}`)}>
              <td className="ao-agent-col">
                <Link to={`/ops/agents/${r.agentId}`} className="ds-table__link" onClick={(e) => e.stopPropagation()}>
                  <AgentCell color={r.color} primary={r.name} secondary={`${r.department}, built with ${r.builtWith}`} />
                </Link>
              </td>
              {stage ? <td className="is-num">{f.int(stageCount(r.outcomes, stage))}</td> : null}
              <td className="is-num ao-hide-sm">{f.int(r.workUnits)}</td>
              <td className="is-num ao-end-sm">{f.hours(r.hoursReturned)}</td>
              <td className="is-num ao-hide-sm">{f.money(r.valueUsd)}</td>
              <td className="is-num ao-hide-sm ao-end-md">{f.money(r.aiCostUsd)}</td>
              <td className="is-num ao-hide-md">{f.pct(r.acceptanceRate)}</td>
              <td className="is-num ao-hide-md">{f.int(r.activeUsers)}</td>
              <td className="ao-hide-md">
                <Spark values={r.weeklyHours} color={r.color} label={`${r.name} hours saved per week`} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="ao-total">
            <td>All agents</td>
            {stage ? <td className="is-num">{f.int(stageTotal(d, stage))}</td> : null}
            <td className="is-num ao-hide-sm">{f.int(t.workUnits)}</td>
            <td className="is-num ao-end-sm">{f.hours(t.hoursReturned)}</td>
            <td className="is-num ao-hide-sm">{f.money(t.valueUsd)}</td>
            <td className="is-num ao-hide-sm ao-end-md">{f.money(t.aiCostUsd)}</td>
            <td className="is-num ao-hide-md">{f.pct(d.funnel.invoked ? (d.funnel.accepted + d.funnel.automatic) / d.funnel.invoked : null)}</td>
            <td className="is-num ao-hide-md">{f.int(t.activeUsers)}</td>
            <td className="ao-hide-md" />
          </tr>
        </tfoot>
      </Table>
    </Card>
  );
}

function stageTotal(d: OverviewX, s: Stage): number {
  const fu = d.funnel;
  return s === 'invoked' ? fu.invoked : s === 'output' ? fu.output : s === 'reviewed' ? fu.accepted + fu.edited : fu.automatic;
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
  const preview = valid ? overview.totals.hoursReturned * parsed : null;

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
      description="Changes apply to your workspace only. Other viewers keep the baseline."
      width={520}
      footer={
        <>
          {a.data?.isOverride ? (
            <Button variant="ghost" disabled={busy} onClick={() => save(null)} style={{ marginRight: 'auto' }}>
              Reset to $85 baseline
            </Button>
          ) : null}
          <Button variant="primary" disabled={!valid || busy || parsed === current} loading={busy} onClick={() => save(parsed)}>
            Save for my workspace
          </Button>
        </>
      }
    >
      <Field
        label="Loaded hourly cost (USD)"
        htmlFor="ao-rate"
        error={valid ? (err ?? undefined) : 'Enter a value between $20 and $500.'}
        hint={`Salary, benefits and overhead per working hour. At $${parsed}/h, ${f.int(overview.totals.hoursReturned)} hours saved is worth ${f.money(preview)}.`}
      >
        <Input id="ao-rate" type="number" inputMode="decimal" min={20} max={500} step={1} value={value} onChange={(e) => setDraft(e.target.value)} aria-invalid={!valid} style={{ maxWidth: 180 }} />
      </Field>
      {a.data?.isOverride ? (
        <Callout tone="success" title="Your workspace override is active.">
          Hours saved are unchanged; value uses your rate.
        </Callout>
      ) : null}

      <section>
        <h3 className="ao-subhead">How hours saved are counted</h3>
        <p className="ao-note">
          For each task whose output was accepted, edited or delivered automatically: the minutes it takes by hand, minus the minutes a person spent reviewing or editing. Rejected and failed work earns nothing, and its review time counts against the agent.
        </p>
      </section>

      <section>
        <h3 className="ao-subhead">Time by hand, per agent</h3>
        <div className="ds-card">
          <Table compact label="Minutes per task by hand">
            <thead>
              <tr>
                <th>Agent and task</th>
                <th className="is-num">By hand</th>
                <th className="is-num">Review time</th>
              </tr>
            </thead>
            <tbody>
              {overview.baselines.map((r) => (
                <tr key={r.agentId}>
                  <td>
                    <span className="ds-table__primary">{r.name}</span>
                    <span className="ds-table__secondary">Per {r.unitLabel}</span>
                  </td>
                  <td className="is-num">{r.baselineMinutes} min</td>
                  <td className="is-num">{r.humanMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="ao-note" style={{ marginTop: 8 }}>
          These are assumptions, to be confirmed with a 2-week time study of the people doing the work by hand.
        </p>
      </section>
      <Callout tone="info">{overview.assumptions.sourceNote}</Callout>
    </Drawer>
  );
}
