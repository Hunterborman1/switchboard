/**
 * Agent Ops reports: every payload the platform UI reads, computed with SQL over PLATFORM_DB
 * (live + seeded rows together, each tagged with its source) and finished in math.ts.
 */
import { SIGNAL_LOOP_AGENT_ID, STANDARD_CHECKS, type AgentImpact, type Alert, type ChangeEntry, type LogEntry, type Slo, type Span, type UsageEvent, type UsageKind } from '../../shared/platform-contracts';
import {
  acceptanceRate,
  addDays,
  costSlo,
  daysBetween,
  daysUntil,
  DEFAULT_LOADED_HOURLY_USD,
  emptyOutcomes,
  evaluateRules,
  hoursReturned,
  isoDay,
  latencySlo,
  percentile,
  ratioSlo,
  retentionCohorts,
  roiMultiple,
  valueUsd,
  weeksBetween,
  weekStart,
  type Outcomes,
} from './math';
import { all, calendar, displayName, effectiveStandard, first, lastLiveLogAt, loadAgents, loadMeta, parseJson, peopleMap, type AgentRow, type Calendar, type Db } from './store';
import type {
  AgentDetail,
  AssumptionsView,
  CostReport,
  LiveYou,
  LogsPage,
  ObservabilityX,
  OverviewX,
  PlatformMeta,
  RegistryRow,
  ReviewRow,
  StandardReport,
  TraceView,
  UsageReportX,
  YourLastRun,
} from './types';

export type Viewer = { workspace: string | null; sessionHints: string[] };
export type Ctx = { db: Db; now: Date; viewer: Viewer; budgetLimitUsd: number };

const ASSUMPTION_NOTE = 'Hours use each agent’s registered “manual way” minutes per unit. These baselines are assumptions to validate with a 2-week time study; dollar value = hours × loaded hourly cost. AI cost is metered model spend, not billing data, and excludes build time and tool seats.';

// ---------------------------------------------------------------- assumptions

export async function getAssumptions(ctx: Ctx): Promise<AssumptionsView> {
  const ws = ctx.viewer.workspace;
  const rows = await all<{ workspace: string; loaded_hourly_usd: number }>(ctx.db, "SELECT workspace, loaded_hourly_usd FROM assumptions WHERE workspace IN ('seed', ?)", ws ?? 'seed');
  const own = rows.find((r) => r.workspace === ws && ws !== 'seed');
  const seed = rows.find((r) => r.workspace === 'seed');
  return { loadedHourlyUsd: own?.loaded_hourly_usd ?? seed?.loaded_hourly_usd ?? DEFAULT_LOADED_HOURLY_USD, sourceNote: ASSUMPTION_NOTE, workspace: own ? ws! : 'seed', isOverride: !!own };
}

/** Viewer-owned writes need a real viewer workspace: never 'seed', never a loose id. */
const VIEWER_WS = /^ws_[a-f0-9]{16}$/;

export async function putAssumptions(ctx: Ctx, loadedHourlyUsd: number | null): Promise<AssumptionsView> {
  const ws = ctx.viewer.workspace;
  if (!ws || !VIEWER_WS.test(ws)) throw new Error('no viewer workspace');
  if (loadedHourlyUsd == null) await ctx.db.prepare('DELETE FROM assumptions WHERE workspace = ?').bind(ws).run();
  else
    await ctx.db
      .prepare('INSERT INTO assumptions (workspace, loaded_hourly_usd, updated_at) VALUES (?, ?, ?) ON CONFLICT(workspace) DO UPDATE SET loaded_hourly_usd = excluded.loaded_hourly_usd, updated_at = excluded.updated_at')
      .bind(ws, loadedHourlyUsd, ctx.now.toISOString())
      .run();
  return getAssumptions(ctx);
}

// ---------------------------------------------------------------- shared aggregates

type WorkRow = { agent_id: string; source: string; outcome: keyof Outcomes; day: string; n: number; ms: number; hm: number; c: number };
type ActorDay = { agent_id: string; actor_id: string; day: string; source: string };

async function workByDay(db: Db, from: string, to: string): Promise<WorkRow[]> {
  return all<WorkRow>(
    db,
    `SELECT agent_id, source, outcome, substr(at, 1, 10) AS day, count(*) AS n, sum(minutes_saved) AS ms, sum(human_minutes) AS hm, sum(ai_cost_usd) AS c
     FROM work_units WHERE at >= ? AND at <= ? GROUP BY agent_id, source, outcome, day`,
    from,
    to,
  );
}
async function actorDays(db: Db, from: string, to: string): Promise<ActorDay[]> {
  return all<ActorDay>(
    db,
    `SELECT agent_id, actor_id, substr(at, 1, 10) AS day, min(source) AS source FROM usage_events WHERE at >= ? AND at <= ? GROUP BY agent_id, actor_id, day
     UNION SELECT agent_id, actor_id, substr(at, 1, 10) AS day, min(source) AS source FROM work_units WHERE actor_id IS NOT NULL AND at >= ? AND at <= ? GROUP BY agent_id, actor_id, day`,
    from,
    to,
    from,
    to,
  );
}

type Sums = { units: number; ms: number; hm: number; cost: number; outcomes: Outcomes };
function sumWork(rows: WorkRow[], pred: (r: WorkRow) => boolean): Sums {
  const s: Sums = { units: 0, ms: 0, hm: 0, cost: 0, outcomes: emptyOutcomes() };
  for (const r of rows) {
    if (!pred(r)) continue;
    s.units += r.n;
    s.ms += r.ms;
    s.hm += r.hm;
    s.cost += r.c;
    s.outcomes[r.outcome] = (s.outcomes[r.outcome] ?? 0) + r.n;
  }
  return s;
}
function distinctActors(rows: ActorDay[], pred: (r: ActorDay) => boolean): number {
  const set = new Set<string>();
  for (const r of rows) if (pred(r)) set.add(r.actor_id);
  return set.size;
}
function impactOf(a: AgentRow, s: Sums, users: number, rate: number): AgentImpact {
  const hours = hoursReturned({ minutesSaved: s.ms, humanMinutes: s.hm });
  const value = valueUsd(hours, rate);
  return { agentId: a.record.id, name: a.record.name, source: a.record.source, workUnits: s.units, hoursReturned: hours, valueUsd: value, aiCostUsd: s.cost, roiMultiple: roiMultiple(value, s.cost), activeUsers: users, acceptanceRate: acceptanceRate(s.outcomes) };
}
const inRange = (day: string, from: string, to: string) => day >= from.slice(0, 10) && day <= to.slice(0, 10);

/** Weekly hours for one agent; null for weeks outside the agent's data coverage (a gap, not zero). */
function weeklyHoursFor(a: AgentRow, work: WorkRow[], weeks: string[], cal: Calendar): (number | null)[] {
  const launched = a.record.launchedAt.slice(0, 10);
  const liveDays = work.filter((r) => r.agent_id === a.record.id && r.source === 'live').map((r) => r.day);
  const coverageEnd = a.record.source === 'live' && liveDays.length ? cal.to.slice(0, 10) : cal.simTo;
  const retired = a.profile.retiredAt?.slice(0, 10) ?? null;
  return weeks.map((w) => {
    const wEnd = isoDay(addDays(w, 6));
    if (w > coverageEnd || wEnd < launched || (retired && w > retired)) return null;
    const s = sumWork(work, (r) => r.agent_id === a.record.id && r.day >= w && r.day <= wEnd);
    return Math.round(hoursReturned({ minutesSaved: s.ms, humanMinutes: s.hm }) * 10) / 10;
  });
}

// ---------------------------------------------------------------- SLOs + alerts

export const SLO_WINDOW_DAYS = 28;

type HttpRow = { at: string; duration_ms: number | null; level: string; status: number | null };

async function sloFor(db: Db, a: AgentRow, cal: Calendar): Promise<Slo[]> {
  const to = cal.ref;
  const from = addDays(to, -SLO_WINDOW_DAYS);
  const id = a.record.id;
  const window = `${SLO_WINDOW_DAYS} days`;
  const t = a.profile.slo;
  const [work, http, ground, deliv] = await Promise.all([
    first<{ n: number; failed: number; cost: number }>(db, "SELECT count(*) AS n, sum(outcome = 'failed') AS failed, sum(ai_cost_usd) AS cost FROM work_units WHERE agent_id = ? AND at > ? AND at <= ?", id, from, to),
    all<{ duration_ms: number }>(db, "SELECT duration_ms FROM logs WHERE agent_id = ? AND event = 'http.request' AND duration_ms IS NOT NULL AND at > ? AND at <= ?", id, from, to),
    first<{ passed: number | null; total: number | null }>(
      db,
      `SELECT sum(coalesce(json_extract(fields, '$.passed'), json_extract(fields, '$.grounded'))) AS passed, sum(json_extract(fields, '$.total')) AS total
       FROM logs WHERE agent_id = ? AND at > ? AND at <= ? AND (event = 'grounding.checked' OR (event IN ('step.finished', 'step') AND json_extract(fields, '$.step') = 'ground' AND json_extract(fields, '$.total') IS NOT NULL))`,
      id,
      from,
      to,
    ),
    first<{ ok: number; bad: number }>(
      db,
      `SELECT sum(event IN ('delivery.sent', 'delivery.ok', 'delivery.delivered')) AS ok, sum(event IN ('delivery.failed', 'delivery.error', 'delivery.dead_letter')) AS bad
       FROM logs WHERE agent_id = ? AND event LIKE 'delivery.%' AND at > ? AND at <= ?`,
      id,
      from,
      to,
    ),
  ]);
  const base = (key: string, label: string, objective: string) => ({ agentId: id, key, label, objective, window });
  const n = work?.n ?? 0;
  const durations = http.map((h) => h.duration_ms);
  const p95 = percentile(durations, 95);
  const over = durations.filter((d) => d > t.p95Ms).length;
  const out: Slo[] = [
    ratioSlo(base('run_success', 'Run success', `≥ ${(t.runSuccess * 100).toFixed(1)}% of runs finish`), n - (work?.failed ?? 0), n, t.runSuccess),
    latencySlo(base('p95_latency', 'p95 latency', `p95 ≤ ${t.p95Ms >= 10_000 ? `${Math.round(t.p95Ms / 1000)} s` : `${t.p95Ms} ms`} per request`), p95, over, durations.length, t.p95Ms),
  ];
  if (t.grounding != null) out.push(ratioSlo(base('grounding', 'Grounding rate', `≥ ${(t.grounding * 100).toFixed(0)}% of quotes/answers grounded in source`), ground?.passed ?? 0, ground?.total ?? 0, t.grounding));
  if (t.delivery != null) out.push(ratioSlo(base('delivery_success', 'Delivery success', `≥ ${(t.delivery * 100).toFixed(1)}% of deliveries succeed`), deliv?.ok ?? 0, (deliv?.ok ?? 0) + (deliv?.bad ?? 0), t.delivery));
  out.push(costSlo(base('cost_per_unit', 'Cost per unit', `≤ $${t.costPerUnitUsd.toFixed(3)} per ${a.record.unitLabel}`), work?.cost ?? 0, n, t.costPerUnitUsd));
  return out;
}

async function alertsFor(ctx: Ctx, agents: AgentRow[], cal: Calendar, slosByAgent: Map<string, Slo[]>): Promise<Alert[]> {
  const { db } = ctx;
  const to = cal.ref;
  const d7 = addDays(to, -7);
  const d14 = addDays(to, -14);
  const d1 = addDays(to, -1);
  const [hourly, costs, users, seeded, acks, budget] = await Promise.all([
    all<{ agent_id: string; hour: string; requests: number; errors: number }>(
      db,
      `SELECT agent_id, substr(at, 1, 13) AS hour, sum(event = 'http.request') AS requests, sum(event = 'http.request' AND (level = 'error' OR coalesce(json_extract(fields, '$.status'), 0) >= 500)) AS errors
       FROM logs WHERE at > ? AND at <= ? GROUP BY agent_id, hour`,
      d1,
      to,
    ),
    all<{ agent_id: string; recent: number; prior: number }>(db, 'SELECT agent_id, sum(CASE WHEN at > ? THEN ai_cost_usd ELSE 0 END) AS recent, sum(CASE WHEN at <= ? THEN ai_cost_usd ELSE 0 END) AS prior FROM work_units WHERE at > ? AND at <= ? GROUP BY agent_id', d7, d7, d14, to),
    all<{ agent_id: string; recent: number; prior: number }>(
      db,
      'SELECT agent_id, count(DISTINCT CASE WHEN at > ? THEN actor_id END) AS recent, count(DISTINCT CASE WHEN at <= ? THEN actor_id END) AS prior FROM usage_events WHERE at > ? AND at <= ? GROUP BY agent_id',
      d7,
      d7,
      d14,
      to,
    ),
    all<{ id: string; agent_id: string; at: string; severity: Alert['severity']; rule: string; expected: string; actual: string; status: Alert['status']; owner: string; runbook: string; trace_id: string | null }>(
      db,
      'SELECT id, agent_id, at, severity, rule, expected, actual, status, owner, runbook, trace_id FROM alerts ORDER BY at DESC LIMIT 50',
    ),
    all<{ alert_id: string; at: string }>(db, 'SELECT alert_id, at FROM alert_acks WHERE workspace = ?', ctx.viewer.workspace ?? '-'),
    liveBudget(ctx),
  ]);
  const ackSet = new Set(acks.map((a) => a.alert_id));
  const out: Alert[] = [];
  for (const a of agents) {
    const id = a.record.id;
    const cost = costs.find((c) => c.agent_id === id);
    const u = users.find((c) => c.agent_id === id);
    const gaps = a.record.standard.filter((c) => !c.passed).map((c) => c.key);
    out.push(
      ...evaluateRules({
        agentId: id,
        agentName: a.record.name,
        owner: a.record.ownerName,
        runbook: a.profile.runbookUrl,
        windowEnd: to,
        slos: slosByAgent.get(id) ?? [],
        hourlyErrorRate: hourly.filter((h) => h.agent_id === id).map((h) => ({ hour: `${h.hour}:00:00.000Z`, requests: h.requests, errors: h.errors })),
        cost7d: cost?.recent ?? 0,
        costPrior7d: cost?.prior ?? 0,
        wau: u?.recent ?? 0,
        priorWau: u?.prior ?? 0,
        reviewStatus: a.reviewStatus,
        nextReview: a.record.nextReview,
        standardGaps: gaps,
        budget: id === SIGNAL_LOOP_AGENT_ID ? { limitUsd: budget.limitUsd, spentUsd: budget.spentUsd } : undefined,
        status: a.record.status,
      }),
    );
  }
  for (const s of seeded) out.push({ id: s.id, agentId: s.agent_id, at: s.at, severity: s.severity, rule: s.rule, expected: s.expected, actual: s.actual, status: s.status, owner: s.owner, runbook: s.runbook, traceId: s.trace_id });
  for (const a of out) if (a.status === 'open' && ackSet.has(a.id)) a.status = 'acknowledged';
  const rank = { open: 0, acknowledged: 1, resolved: 2 } as const;
  const sev = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((x, y) => rank[x.status] - rank[y.status] || sev[x.severity] - sev[y.severity] || y.at.localeCompare(x.at));
}

export async function acknowledgeAlert(ctx: Ctx, alertId: string, note: string | null): Promise<void> {
  if (!ctx.viewer.workspace || !VIEWER_WS.test(ctx.viewer.workspace)) throw new Error('no viewer workspace');
  await ctx.db.prepare('INSERT OR REPLACE INTO alert_acks (alert_id, workspace, at, note) VALUES (?, ?, ?, ?)').bind(alertId.slice(0, 120), ctx.viewer.workspace, ctx.now.toISOString(), note?.slice(0, 280) ?? null).run();
}

// ---------------------------------------------------------------- overview

export async function overview(ctx: Ctx): Promise<OverviewX> {
  const { db, now } = ctx;
  const meta = await loadMeta(db);
  const cal = calendar(meta, now);
  const [agents, work, actors, assumptions] = await Promise.all([loadAgents(db, now), workByDay(db, cal.from, cal.to), actorDays(db, cal.from, cal.to), getAssumptions(ctx)]);
  const rate = assumptions.loadedHourlyUsd;
  const weeks = weeksBetween(cal.from, cal.to);
  const ref = cal.ref;
  const last7From = isoDay(addDays(ref, -6));
  const prior7From = isoDay(addDays(ref, -13));
  const prior7To = isoDay(addDays(ref, -7));
  const refDay = isoDay(ref);

  const live = await Promise.all(agents.map((a) => (a.record.source === 'live' ? lastLiveLogAt(db, a.record.id) : Promise.resolve(null))));
  const slos = new Map<string, Slo[]>();
  await Promise.all(agents.map(async (a) => slos.set(a.record.id, await sloFor(db, a, cal))));
  const alerts = await alertsFor(ctx, agents, cal, slos);

  const agentRows = agents.map((a, i) => {
    const s = sumWork(work, (r) => r.agent_id === a.record.id);
    const users = distinctActors(actors, (r) => r.agent_id === a.record.id);
    return { ...impactOf(a, s, users, rate), color: a.profile.color, status: a.record.status, weeklyHours: weeklyHoursFor(a, work, weeks, cal), department: a.record.department, builtWith: a.record.builtWith, outcomes: s.outcomes, unitLabel: a.record.unitLabel, _live: live[i] };
  });
  const total = sumWork(work, () => true);
  const totalHours = hoursReturned({ minutesSaved: total.ms, humanMinutes: total.hm });
  const totalValue = valueUsd(totalHours, rate);
  const lastWeek = sumWork(work, (r) => r.day >= last7From && r.day <= refDay);
  const priorWeek = sumWork(work, (r) => r.day >= prior7From && r.day <= prior7To);
  const wau = distinctActors(actors, (r) => r.day >= last7From && r.day <= refDay);
  const priorWau = distinctActors(actors, (r) => r.day >= prior7From && r.day <= prior7To);

  const weekly = weeks.map((w) => {
    const wEnd = isoDay(addDays(w, 6));
    const byAgent: Record<string, number> = {};
    agentRows.forEach((r) => {
      const v = r.weeklyHours[weeks.indexOf(w)];
      if (v != null) byAgent[r.agentId] = v;
    });
    const s = sumWork(work, (r) => r.day >= w && r.day <= wEnd);
    return { week: w, byAgent, hoursReturned: hoursReturned({ minutesSaved: s.ms, humanMinutes: s.hm }), aiCostUsd: s.cost, activeUsers: distinctActors(actors, (r) => r.day >= w && r.day <= wEnd) };
  });

  type Att = OverviewX['attention'][number];
  const attention: Att[] = [];
  for (const a of agents) {
    if (a.record.status === 'retired') continue;
    if (a.reviewStatus === 'overdue') attention.push({ agentId: a.record.id, kind: 'review_overdue', message: `${a.record.name}: review overdue since ${a.record.nextReview} (owner ${a.record.ownerName}).` });
    for (const s of slos.get(a.record.id) ?? []) if (s.status === 'breached') attention.push({ agentId: a.record.id, kind: 'slo_breached', message: `${a.record.name}: ${s.label} SLO breached over ${s.window}.` });
    const std = effectiveStandard(a, live[agents.indexOf(a)] ?? null, now);
    for (const c of std.filter((c) => !c.passed && c.key !== 'review_cadence')) attention.push({ agentId: a.record.id, kind: 'standard_gap', message: `${a.record.name}: standard gap: ${c.label}. ${c.evidence}` });
    for (const al of alerts.filter((x) => x.agentId === a.record.id && x.status !== 'resolved')) {
      if (al.rule.startsWith('AI cost up')) attention.push({ agentId: a.record.id, kind: 'cost_spike', message: `${a.record.name}: AI cost ${al.actual} vs ${al.expected}.` });
      if (al.rule.startsWith('Weekly active users')) attention.push({ agentId: a.record.id, kind: 'adoption_drop', message: `${a.record.name}: weekly active users ${al.actual}.` });
    }
  }

  return {
    range: { from: cal.from, to: cal.to },
    assumptions: { loadedHourlyUsd: rate, sourceNote: assumptions.sourceNote },
    totals: {
      agentsInProduction: agents.filter((a) => a.record.status === 'production').length,
      hoursReturned: totalHours,
      valueUsd: totalValue,
      aiCostUsd: total.cost,
      roiMultiple: roiMultiple(totalValue, total.cost),
      activeUsers: distinctActors(actors, () => true),
      workUnits: total.units,
    },
    weekly,
    agents: agentRows.map(({ _live, color, status, weeklyHours, department, builtWith, outcomes, unitLabel, ...impact }) => impact),
    attention,
    funnel: {
      invoked: total.units,
      output: total.units - total.outcomes.failed,
      accepted: total.outcomes.accepted,
      edited: total.outcomes.edited,
      rejected: total.outcomes.rejected,
      automatic: total.outcomes.automatic,
      failed: total.outcomes.failed,
    },
    prior: { hoursReturned: hoursReturned({ minutesSaved: priorWeek.ms, humanMinutes: priorWeek.hm }), activeUsers: priorWau, aiCostUsd: priorWeek.cost },
    wau: { current: wau, prior: priorWau },
    weeklyAgents: agents.map((a) => ({ agentId: a.record.id, name: a.record.name, color: a.profile.color })),
    agentRows: agentRows.map(({ _live, ...r }) => r),
    simulatedTo: cal.simTo,
    openAlerts: alerts.filter((x) => x.status !== 'resolved'),
    reviewsDue: agents.filter((x) => x.reviewStatus !== 'current' && x.record.status !== 'retired').map((x) => ({ agentId: x.record.id, name: x.record.name, nextReview: x.record.nextReview, reviewStatus: x.reviewStatus, owner: x.record.ownerName })),
    baselines: agents.map((a) => ({ agentId: a.record.id, name: a.record.name, unitLabel: a.record.unitLabel, baselineMinutes: a.record.baselineMinutesPerUnit, humanMinutes: a.profile.humanMinutesPerUnit })),
    lastWeek: { hoursReturned: hoursReturned({ minutesSaved: lastWeek.ms, humanMinutes: lastWeek.hm }), aiCostUsd: lastWeek.cost, from: last7From, to: refDay },
  };
}

// ---------------------------------------------------------------- registry

export async function registry(ctx: Ctx): Promise<RegistryRow[]> {
  const { db, now } = ctx;
  const cal = calendar(await loadMeta(db), now);
  const [agents, work, actors, assumptions] = await Promise.all([loadAgents(db, now), workByDay(db, cal.from, cal.to), actorDays(db, cal.from, cal.to), getAssumptions(ctx)]);
  const weeks = weeksBetween(cal.from, cal.to);
  const d30 = isoDay(addDays(cal.ref, -29));
  const refDay = isoDay(cal.ref);
  return Promise.all(
    agents.map(async (a) => {
      const id = a.record.id;
      const s = sumWork(work, (r) => r.agent_id === id);
      const s30 = sumWork(work, (r) => r.agent_id === id && r.day >= d30 && r.day <= refDay);
      const std = effectiveStandard(a, a.record.source === 'live' ? await lastLiveLogAt(db, id) : null, now);
      return {
        ...a.record,
        standard: std,
        profile: a.profile,
        impact: impactOf(a, s, distinctActors(actors, (r) => r.agent_id === id), assumptions.loadedHourlyUsd),
        reviewStatus: a.reviewStatus,
        standardScore: { passed: std.filter((c) => c.passed).length, total: std.length },
        runs30d: s30.units,
        users30d: distinctActors(actors, (r) => r.agent_id === id && r.day >= d30 && r.day <= refDay),
        hours30d: hoursReturned({ minutesSaved: s30.ms, humanMinutes: s30.hm }),
        cost30d: s30.cost,
        weeklyHours: weeklyHoursFor(a, work, weeks, cal),
      };
    }),
  );
}

export async function agentDetail(ctx: Ctx, agentId: string): Promise<AgentDetail | null> {
  const { db, now } = ctx;
  const cal = calendar(await loadMeta(db), now);
  const agents = await loadAgents(db, now);
  const a = agents.find((x) => x.record.id === agentId);
  if (!a) return null;
  const [work, actors, assumptions, changes, people, sessions, liveAt, topUsersRows] = await Promise.all([
    workByDay(db, cal.from, cal.to),
    actorDays(db, cal.from, cal.to),
    getAssumptions(ctx),
    all<{ id: string; agent_id: string; at: string; kind: ChangeEntry['kind']; title: string; detail: string; actor: string; ref: string | null }>(db, 'SELECT id, agent_id, at, kind, title, detail, actor, ref FROM changelog WHERE agent_id = ? ORDER BY at DESC', agentId),
    peopleMap(db),
    all<{ day: string; sessions: number; users: number }>(db, 'SELECT substr(at, 1, 10) AS day, count(DISTINCT session_id) AS sessions, count(DISTINCT actor_id) AS users FROM usage_events WHERE agent_id = ? AND at >= ? AND at <= ? GROUP BY day', agentId, cal.from, cal.to),
    lastLiveLogAt(db, agentId),
    all<{ actor_id: string; n: number }>(db, 'SELECT actor_id, count(*) AS n FROM work_units WHERE agent_id = ? AND actor_id IS NOT NULL AND at >= ? AND at <= ? GROUP BY actor_id ORDER BY n DESC LIMIT 3', agentId, cal.from, cal.to),
  ]);
  const slos = await sloFor(db, a, cal);
  const alerts = (await alertsFor(ctx, [a], cal, new Map([[agentId, slos]]))).filter((x) => x.agentId === agentId);
  const s = sumWork(work, (r) => r.agent_id === agentId);
  const days = daysBetween(cal.from, cal.to);
  const hasLive = work.some((r) => r.agent_id === agentId && r.source === 'live');
  return {
    agent: { ...a.record, standard: effectiveStandard(a, liveAt, now) },
    profile: a.profile,
    impact: impactOf(a, s, distinctActors(actors, (r) => r.agent_id === agentId), assumptions.loadedHourlyUsd),
    reviewStatus: a.reviewStatus,
    slos,
    alerts,
    changelog: changes.map((c) => ({ id: c.id, agentId: c.agent_id, at: c.at, kind: c.kind, title: c.title, detail: c.detail, actor: c.actor, ref: c.ref })),
    usage: days.map((d) => {
      const u = sessions.find((x) => x.day === d);
      return { day: d, users: u?.users ?? 0, sessions: u?.sessions ?? 0, workUnits: sumWork(work, (r) => r.agent_id === agentId && r.day === d).units };
    }),
    outcomes: s.outcomes,
    cost: days.map((d) => ({ day: d, costUsd: d > cal.simTo && !(a.record.source === 'live' && hasLive) ? null : Math.round(sumWork(work, (r) => r.agent_id === agentId && r.day === d).cost * 1e4) / 1e4 })),
    topUsers: topUsersRows.map((r) => ({ actorId: r.actor_id, name: displayName(r.actor_id, people), role: people.get(r.actor_id)?.title ?? (r.actor_id.startsWith('viewer:') ? 'Demo viewer (live)' : '—'), workUnits: r.n })),
  };
}

export async function reviews(ctx: Ctx): Promise<ReviewRow[]> {
  const agents = await loadAgents(ctx.db, ctx.now);
  return agents
    .map((a) => ({ agentId: a.record.id, name: a.record.name, owner: a.record.ownerName, status: a.record.status, lastReview: a.record.lastReview, nextReview: a.record.nextReview, cadenceDays: a.record.reviewCadenceDays, reviewStatus: a.reviewStatus, daysUntil: daysUntil(a.record.nextReview, ctx.now) }))
    .sort((x, y) => x.nextReview.localeCompare(y.nextReview));
}

export async function standard(ctx: Ctx): Promise<StandardReport> {
  const agents = await loadAgents(ctx.db, ctx.now);
  const matrix = await Promise.all(
    agents.map(async (a) => ({ agentId: a.record.id, name: a.record.name, status: a.record.status, owner: a.record.ownerName, checks: effectiveStandard(a, a.record.source === 'live' ? await lastLiveLogAt(ctx.db, a.record.id) : null, ctx.now) })),
  );
  return { checks: STANDARD_CHECKS.map((c) => ({ key: c.key, label: c.label })), matrix };
}

export async function changelog(ctx: Ctx, agentId: string | null): Promise<ChangeEntry[]> {
  const rows = await all<{ id: string; agent_id: string; at: string; kind: ChangeEntry['kind']; title: string; detail: string; actor: string; ref: string | null }>(
    ctx.db,
    `SELECT id, agent_id, at, kind, title, detail, actor, ref FROM changelog ${agentId ? 'WHERE agent_id = ?' : ''} ORDER BY at DESC LIMIT 200`,
    ...(agentId ? [agentId] : []),
  );
  return rows.map((c) => ({ id: c.id, agentId: c.agent_id, at: c.at, kind: c.kind, title: c.title, detail: c.detail, actor: c.actor, ref: c.ref }));
}

// ---------------------------------------------------------------- usage

type EventRow = { id: string; agent_id: string; source: 'live' | 'simulated'; session_id: string; actor_id: string; actor_role: string; kind: UsageKind; path: string | null; props: string; at: string; duration_ms: number | null };
const toEvent = (r: EventRow): UsageEvent => ({ id: r.id, agentId: r.agent_id, source: r.source, sessionId: r.session_id, actorId: r.actor_id, actorRole: r.actor_role, kind: r.kind, path: r.path, props: parseJson(r.props, {}), at: r.at, durationMs: r.duration_ms });

/** Is this live actor/session the current viewer? */
export function isYou(viewer: Viewer, actorId: string, sessionId: string, props?: Record<string, unknown>): boolean {
  if (viewer.sessionHints.includes(sessionId)) return true;
  const ws = viewer.workspace;
  if (!ws) return false;
  if (props && (props.workspaceId === ws || props.ws === ws)) return true;
  if (sessionId === ws) return true;
  const a = actorId.replace(/^viewer:/, '');
  const bare = ws.replace(/^ws_/, '');
  return a.length >= 6 && (a === ws || a === bare || bare.startsWith(a));
}

export async function usage(ctx: Ctx, agentId: string | null, source: 'live' | 'simulated' | 'all'): Promise<UsageReportX> {
  const { db, now } = ctx;
  const cal = calendar(await loadMeta(db), now);
  const where: string[] = ['at >= ?', 'at <= ?'];
  const binds: unknown[] = [cal.from, cal.to];
  if (agentId) {
    where.push('agent_id = ?');
    binds.push(agentId);
  }
  if (source !== 'all') {
    where.push('source = ?');
    binds.push(source);
  }
  const W = where.join(' AND ');
  const nowMs = now.getTime();
  const fiveAgo = new Date(nowMs - 5 * 60_000).toISOString();
  const dayAgo = new Date(nowMs - 86_400_000).toISOString();
  const halfHour = new Date(nowMs - 30 * 60_000).toISOString();
  const agentLive = agentId ? 'AND agent_id = ?' : '';
  const aBind = agentId ? [agentId] : [];
  const [daily, byRole, heat, feats, actorWeeks, top, people, liveNow, liveDay, recent, liveSess, deptRows] = await Promise.all([
    all<{ day: string; users: number; sessions: number; events: number }>(db, `SELECT substr(at, 1, 10) AS day, count(DISTINCT actor_id) AS users, count(DISTINCT session_id) AS sessions, count(*) AS events FROM usage_events WHERE ${W} GROUP BY day ORDER BY day`, ...binds),
    all<{ role: string; users: number; events: number }>(db, `SELECT actor_role AS role, count(DISTINCT actor_id) AS users, count(*) AS events FROM usage_events WHERE ${W} GROUP BY actor_role ORDER BY events DESC`, ...binds),
    all<{ dow: string; hour: string; events: number }>(db, `SELECT strftime('%w', at) AS dow, strftime('%H', at) AS hour, count(*) AS events FROM usage_events WHERE ${W} GROUP BY dow, hour`, ...binds),
    all<{ kind: UsageKind; events: number; users: number }>(db, `SELECT kind, count(*) AS events, count(DISTINCT actor_id) AS users FROM usage_events WHERE ${W} GROUP BY kind ORDER BY events DESC`, ...binds),
    all<{ actor_id: string; day: string }>(db, `SELECT actor_id, substr(at, 1, 10) AS day FROM usage_events WHERE ${W} GROUP BY actor_id, day`, ...binds),
    all<{ actor_id: string; role: string; last_seen: string; sessions: number }>(db, `SELECT actor_id, max(actor_role) AS role, max(at) AS last_seen, count(DISTINCT session_id) AS sessions FROM usage_events WHERE ${W} GROUP BY actor_id ORDER BY sessions DESC LIMIT 20`, ...binds),
    peopleMap(db),
    first<{ n: number }>(db, `SELECT count(DISTINCT session_id) AS n FROM usage_events WHERE source = 'live' AND at >= ? ${agentLive}`, fiveAgo, ...aBind),
    first<{ sessions: number; tourStarts: number; tourCompletions: number }>(
      db,
      `SELECT count(DISTINCT session_id) AS sessions, count(DISTINCT CASE WHEN kind = 'tour_step' THEN session_id END) AS tourStarts, count(DISTINCT CASE WHEN kind = 'tour_complete' THEN session_id END) AS tourCompletions FROM usage_events WHERE source = 'live' AND at >= ? ${agentLive}`,
      dayAgo,
      ...aBind,
    ),
    all<EventRow>(db, `SELECT * FROM usage_events WHERE source = 'live' ${agentLive} ORDER BY at DESC LIMIT 30`, ...aBind),
    all<{ session_id: string; actor_id: string; first_at: string; last_at: string; events: number; last_path: string | null; props: string }>(
      db,
      `SELECT session_id, max(actor_id) AS actor_id, min(at) AS first_at, max(at) AS last_at, count(*) AS events,
              (SELECT path FROM usage_events u2 WHERE u2.session_id = u.session_id AND u2.path IS NOT NULL ORDER BY at DESC LIMIT 1) AS last_path, max(props) AS props
       FROM usage_events u WHERE source = 'live' AND at >= ? ${agentLive} GROUP BY session_id ORDER BY last_at DESC LIMIT 12`,
      halfHour,
      ...aBind,
    ),
    all<{ actor_id: string; n: number }>(db, `SELECT actor_id, count(*) AS n FROM work_units WHERE actor_id IS NOT NULL AND at >= ? AND at <= ? ${agentId ? 'AND agent_id = ?' : ''} ${source !== 'all' ? 'AND source = ?' : ''} GROUP BY actor_id`, cal.from, cal.to, ...aBind, ...(source !== 'all' ? [source] : [])),
  ]);

  const weeks = weeksBetween(cal.from, cal.to);
  const activity = new Map<string, Set<number>>();
  for (const r of actorWeeks) {
    const wi = weeks.indexOf(weekStart(r.day));
    if (wi < 0) continue;
    if (!activity.has(r.actor_id)) activity.set(r.actor_id, new Set());
    activity.get(r.actor_id)!.add(wi);
  }
  const workBy = new Map(deptRows.map((r) => [r.actor_id, r.n]));
  const deptAgg = new Map<string, { users: Set<string>; work: number }>();
  for (const r of top.length ? actorWeeks : []) {
    const d = people.get(r.actor_id)?.department ?? (r.actor_id.startsWith('viewer:') ? 'Demo viewers (live)' : 'Unknown');
    if (!deptAgg.has(d)) deptAgg.set(d, { users: new Set(), work: 0 });
    deptAgg.get(d)!.users.add(r.actor_id);
  }
  for (const [actor, n] of workBy) {
    const d = people.get(actor)?.department ?? (actor.startsWith('viewer:') ? 'Demo viewers (live)' : 'Unknown');
    if (deptAgg.has(d)) deptAgg.get(d)!.work += n;
  }

  const days = daysBetween(cal.from, cal.to);
  const dailyFull = days.map((d) => daily.find((x) => x.day === d) ?? { day: d, users: 0, sessions: 0, events: 0 });
  const refDay = isoDay(cal.ref);
  const l7 = isoDay(addDays(cal.ref, -6));
  const p7a = isoDay(addDays(cal.ref, -13));
  const p7b = isoDay(addDays(cal.ref, -7));
  const users = (from: string, to: string) => new Set(actorWeeks.filter((r) => r.day >= from && r.day <= to).map((r) => r.actor_id)).size;
  const sessionsLive = liveSess.map((s) => ({ sessionId: s.session_id, actorId: s.actor_id, firstAt: s.first_at, lastAt: s.last_at, events: s.events, lastPath: s.last_path, isYou: isYou(ctx.viewer, s.actor_id, s.session_id, parseJson(s.props, {})) }));
  const recentEvents = recent.map(toEvent);
  const you: LiveYou = {
    sessionIds: [...new Set([...sessionsLive.filter((s) => s.isYou).map((s) => s.sessionId), ...recentEvents.filter((e) => isYou(ctx.viewer, e.actorId, e.sessionId, e.props)).map((e) => e.sessionId)])],
    actorId: recentEvents.find((e) => isYou(ctx.viewer, e.actorId, e.sessionId, e.props))?.actorId ?? null,
  };

  return {
    agentId,
    source,
    daily: dailyFull,
    byRole: byRole.map((r) => ({ role: r.role, users: r.users, events: r.events })),
    byDepartment: [...deptAgg.entries()].map(([department, v]) => ({ department, users: v.users.size, workUnits: v.work })).sort((a, b) => b.users - a.users),
    heatmap: heat.map((h) => ({ weekday: (Number(h.dow) + 6) % 7, hour: Number(h.hour), events: h.events })),
    features: feats.map((f) => ({ kind: f.kind, events: f.events, users: f.users })),
    retention: retentionCohorts(activity, weeks),
    topUsers: top
      .map((t) => ({ actorId: t.actor_id, name: displayName(t.actor_id, people), role: people.get(t.actor_id)?.title ?? (t.actor_id.startsWith('viewer:') ? 'Demo viewer (live)' : t.role), lastSeen: t.last_seen, sessions: t.sessions, workUnits: workBy.get(t.actor_id) ?? 0 }))
      .sort((a, b) => b.workUnits + b.sessions - (a.workUnits + a.sessions))
      .slice(0, 3),
    live: { activeNow: liveNow?.n ?? 0, sessionsToday: liveDay?.sessions ?? 0, tourStarts: liveDay?.tourStarts ?? 0, tourCompletions: liveDay?.tourCompletions ?? 0, recent: recentEvents },
    you,
    totals: { users: activity.size, sessions: dailyFull.reduce((s, d) => s + d.sessions, 0), events: dailyFull.reduce((s, d) => s + d.events, 0), priorUsers: 0, wau: users(l7, refDay), priorWau: users(p7a, p7b) },
    liveSessions: sessionsLive,
  };
}

// ---------------------------------------------------------------- logs & traces

type LogRow = { id: string; agent_id: string; source: 'live' | 'simulated'; at: string; level: LogEntry['level']; component: string; event: string; message: string; trace_id: string; span_id: string | null; run_id: string | null; workspace_id: string | null; duration_ms: number | null; fields: string };
const toLog = (r: LogRow): LogEntry => ({ id: r.id, agentId: r.agent_id, source: r.source, at: r.at, level: r.level, component: r.component, event: r.event, message: r.message, traceId: r.trace_id, spanId: r.span_id, runId: r.run_id, workspaceId: r.workspace_id, durationMs: r.duration_ms, fields: parseJson(r.fields, {}) });

export type LogFilter = { agentId?: string | null; level?: string | null; component?: string | null; traceId?: string | null; runId?: string | null; q?: string | null; source?: string | null; cursor?: string | null; limit?: number };

export async function logs(ctx: Ctx, f: LogFilter): Promise<LogsPage> {
  const where: string[] = [];
  const binds: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    where.push(sql);
    binds.push(v);
  };
  if (f.agentId) add('agent_id = ?', f.agentId);
  if (f.level) {
    const levels = f.level.split(',').filter((l) => ['debug', 'info', 'warn', 'error'].includes(l));
    if (levels.length) {
      where.push(`level IN (${levels.map(() => '?').join(',')})`);
      binds.push(...levels);
    }
  }
  if (f.component) add('component = ?', f.component);
  if (f.traceId) add('trace_id = ?', f.traceId);
  if (f.runId) add('run_id = ?', f.runId);
  if (f.source === 'live' || f.source === 'simulated') add('source = ?', f.source);
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, '').slice(0, 80)}%`;
    // Message text is searchable only where it is shown in full: simulated history, the seed,
    // and the viewer's own workspace (other viewers' live messages are redacted in the API).
    where.push("((message LIKE ? AND (source = 'simulated' OR workspace_id IS NULL OR workspace_id IN ('seed', ?))) OR event LIKE ? OR trace_id LIKE ? OR run_id LIKE ?)");
    binds.push(like, ctx.viewer.workspace ?? 'seed', like, like, like);
  }
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
  let pageWhere = base;
  const pageBinds = [...binds];
  if (f.cursor) {
    const [at, id] = f.cursor.split('|');
    if (at && id) {
      pageWhere = `${base ? `${base} AND` : 'WHERE'} (at < ? OR (at = ? AND id < ?))`;
      pageBinds.push(at, at, id);
    }
  }
  const [rows, count] = await Promise.all([
    all<LogRow>(ctx.db, `SELECT * FROM logs ${pageWhere} ORDER BY at DESC, id DESC LIMIT ?`, ...pageBinds, limit + 1),
    first<{ n: number }>(ctx.db, `SELECT count(*) AS n FROM logs ${base}`, ...binds),
  ]);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page.map(toLog), nextCursor: more && last ? `${last.at}|${last.id}` : null, total: count?.n ?? null };
}

export async function yourLastRun(ctx: Ctx): Promise<(NonNullable<YourLastRun> & { isYours: boolean }) | null> {
  const ws = ctx.viewer.workspace;
  if (ws) {
    const mine = await first<{ trace_id: string; run_id: string | null; at: string }>(ctx.db, "SELECT trace_id, run_id, at FROM logs WHERE agent_id = ? AND source = 'live' AND workspace_id = ? AND run_id IS NOT NULL ORDER BY at DESC LIMIT 1", SIGNAL_LOOP_AGENT_ID, ws);
    if (mine) return { traceId: mine.trace_id, runId: mine.run_id, at: mine.at, isYours: true };
  }
  const any = await first<{ trace_id: string; run_id: string | null; at: string }>(ctx.db, "SELECT trace_id, run_id, at FROM logs WHERE agent_id = ? AND source = 'live' AND run_id IS NOT NULL ORDER BY at DESC LIMIT 1", SIGNAL_LOOP_AGENT_ID);
  return any ? { traceId: any.trace_id, runId: any.run_id, at: any.at, isYours: false } : null;
}

type SpanRow = { trace_id: string; span_id: string; parent_id: string | null; agent_id: string; source: 'live' | 'simulated'; name: string; start: string; duration_ms: number; status: 'ok' | 'error'; attrs: string };

export async function trace(ctx: Ctx, traceId: string): Promise<TraceView> {
  const { db } = ctx;
  const direct = await all<LogRow>(db, 'SELECT * FROM logs WHERE trace_id = ? ORDER BY at, id LIMIT 500', traceId);
  // A live run can span several request traces (POST /runs, then the Workflow): join on run id.
  const runIds = [...new Set(direct.map((l) => l.run_id).filter((x): x is string => !!x))].slice(0, 3);
  let logsRows = direct;
  let traceIds = [traceId];
  if (runIds.length) {
    const byRun = await all<LogRow>(db, `SELECT * FROM logs WHERE run_id IN (${runIds.map(() => '?').join(',')}) ORDER BY at, id LIMIT 800`, ...runIds);
    const seen = new Set(direct.map((l) => l.id));
    logsRows = [...direct, ...byRun.filter((l) => !seen.has(l.id))].sort((a, b) => a.at.localeCompare(b.at));
    traceIds = [...new Set([traceId, ...byRun.map((l) => l.trace_id)])].slice(0, 12);
  }
  const spans = await all<SpanRow>(db, `SELECT * FROM spans WHERE trace_id IN (${traceIds.map(() => '?').join(',')}) ORDER BY start, span_id LIMIT 500`, ...traceIds);
  const outSpans: Span[] = spans.map((s) => ({ traceId: s.trace_id, spanId: s.span_id, parentId: s.parent_id, agentId: s.agent_id, name: s.name, start: s.start, durationMs: s.duration_ms, status: s.status, attrs: parseJson(s.attrs, {}) }));
  const agentId = spans[0]?.agent_id ?? logsRows[0]?.agent_id ?? null;
  const source = spans[0]?.source ?? logsRows[0]?.source ?? null;
  return { spans: outSpans, logs: logsRows.map(toLog), agentId, source };
}

// ---------------------------------------------------------------- observability

export async function observability(ctx: Ctx, agentId: string | null, range: '7d' | '6w'): Promise<ObservabilityX> {
  const { db, now } = ctx;
  const cal = calendar(await loadMeta(db), now);
  const agents = (await loadAgents(db, now)).filter((a) => !agentId || a.record.id === agentId);
  const to = range === '6w' ? cal.to : cal.ref;
  const from = range === '6w' ? cal.from : addDays(cal.ref, -7);
  const bucketLen = range === '6w' ? 10 : 13; // day or hour
  const aw = agentId ? 'AND agent_id = ?' : '';
  const ab = agentId ? [agentId] : [];
  const [http, ai, comps, compDur] = await Promise.all([
    all<HttpRow & { event: string }>(db, `SELECT at, duration_ms, level, json_extract(fields, '$.status') AS status, event FROM logs WHERE event IN ('http.request', 'run.finished') AND at > ? AND at <= ? ${aw}`, from, to, ...ab),
    all<{ at: string; model: string | null; ok: number | null; fallback: number | null; cost: number | null; duration_ms: number | null }>(
      db,
      `SELECT at, json_extract(fields, '$.model') AS model, json_extract(fields, '$.ok') AS ok, coalesce(json_extract(fields, '$.fallback'), json_extract(fields, '$.fallbackUsed')) AS fallback, json_extract(fields, '$.costUsd') AS cost, duration_ms FROM logs WHERE event = 'ai.call' AND at > ? AND at <= ? ${aw}`,
      from,
      to,
      ...ab,
    ),
    all<{ component: string; events: number; errors: number }>(db, `SELECT component, count(*) AS events, sum(level = 'error') AS errors FROM logs WHERE at > ? AND at <= ? ${aw} GROUP BY component ORDER BY events DESC`, from, to, ...ab),
    all<{ component: string; duration_ms: number }>(db, `SELECT component, duration_ms FROM logs WHERE duration_ms IS NOT NULL AND at > ? AND at <= ? ${aw}`, from, to, ...ab),
  ]);
  // Buckets: every hour (7d) or day (6w) in the window, so empty buckets are explicit.
  const buckets: string[] = [];
  const step = range === '6w' ? 86_400_000 : 3_600_000;
  for (let t = Math.floor(Date.parse(from) / step) * step + step; t <= Date.parse(to); t += step) buckets.push(new Date(t).toISOString().slice(0, bucketLen));
  const hourly = buckets.map((b) => {
    const rs = http.filter((h) => h.at.startsWith(b));
    const reqRows = rs.filter((h) => h.event === 'http.request');
    const durs = reqRows.map((h) => h.duration_ms).filter((d): d is number => d != null);
    const calls = ai.filter((x) => x.at.startsWith(b));
    return {
      hour: range === '6w' ? `${b}T00:00:00.000Z` : `${b}:00:00.000Z`,
      requests: reqRows.length,
      errors: rs.filter((h) => h.level === 'error' || (h.event === 'http.request' && (h.status ?? 0) >= 500)).length,
      p50Ms: percentile(durs, 50) ?? (null as unknown as number),
      p95Ms: percentile(durs, 95) ?? (null as unknown as number),
      aiCalls: calls.length,
      fallbacks: calls.filter((c) => c.fallback === 1 || (c.fallback as unknown) === true).length,
      costUsd: Math.round(calls.reduce((s, c) => s + (c.cost ?? 0), 0) * 1e5) / 1e5,
    };
  });
  const p95Target = agents.length === 1 ? agents[0]!.profile.slo.p95Ms : null;
  const breaches: ObservabilityX['breaches'] = [];
  for (const h of hourly) {
    if (h.requests >= 3 && h.errors / h.requests > 0.05) breaches.push({ hour: h.hour, kind: 'errors' });
    if (p95Target && h.p95Ms != null && h.p95Ms > p95Target) breaches.push({ hour: h.hour, kind: 'latency' });
  }
  const modelMap = new Map<string, { calls: number; failures: number; durs: number[]; cost: number }>();
  for (const c of ai) {
    const m = c.model ?? 'unknown';
    if (!modelMap.has(m)) modelMap.set(m, { calls: 0, failures: 0, durs: [], cost: 0 });
    const e = modelMap.get(m)!;
    e.calls++;
    if (c.ok === 0) e.failures++;
    if (c.duration_ms != null) e.durs.push(c.duration_ms);
    e.cost += c.cost ?? 0;
  }
  const totalCalls = ai.length || 1;
  const slosByAgent = new Map<string, Slo[]>();
  await Promise.all(agents.map(async (a) => slosByAgent.set(a.record.id, await sloFor(db, a, cal))));
  const alerts = await alertsFor(ctx, agents, cal, slosByAgent);
  return {
    agentId,
    slos: agents.flatMap((a) => slosByAgent.get(a.record.id) ?? []),
    alerts,
    hourly,
    components: comps.map((c) => ({ component: c.component, events: c.events, errors: c.errors, p95Ms: percentile(compDur.filter((d) => d.component === c.component).map((d) => d.duration_ms), 95) ?? 0 })),
    models: [...modelMap.entries()].map(([model, v]) => ({ model, calls: v.calls, share: v.calls / totalCalls, failures: v.failures, p50Ms: percentile(v.durs, 50) ?? 0, costUsd: v.cost })).sort((a, b) => b.calls - a.calls),
    hourlyByAgent: !!agentId,
    breaches,
    p95TargetMs: p95Target,
    window: { from, to },
  };
}

// ---------------------------------------------------------------- cost

export async function liveBudget(ctx: Ctx): Promise<CostReport['liveBudget']> {
  const r = await first<{ spent: number | null; calls: number; last: string | null }>(
    ctx.db,
    "SELECT sum(coalesce(json_extract(fields, '$.costUsd'), 0)) AS spent, count(*) AS calls, max(at) AS last FROM logs WHERE agent_id = ? AND source = 'live' AND event = 'ai.call'",
    SIGNAL_LOOP_AGENT_ID,
  );
  const ledger = await first<{ spent: number | null }>(
    ctx.db,
    "SELECT json_extract(fields, '$.spentUsd') AS spent FROM logs WHERE agent_id = ? AND source = 'live' AND event LIKE 'budget.%' AND json_extract(fields, '$.spentUsd') IS NOT NULL ORDER BY at DESC LIMIT 1",
    SIGNAL_LOOP_AGENT_ID,
  );
  return { limitUsd: ctx.budgetLimitUsd, spentUsd: Math.max(ledger?.spent ?? 0, r?.spent ?? 0), liveCalls: r?.calls ?? 0, lastCallAt: r?.last ?? null, source: 'live' };
}

export async function cost(ctx: Ctx): Promise<CostReport> {
  const { db, now } = ctx;
  const cal = calendar(await loadMeta(db), now);
  const [agents, work, assumptions, models, budget] = await Promise.all([
    loadAgents(db, now),
    workByDay(db, cal.from, cal.to),
    getAssumptions(ctx),
    all<{ model: string | null; calls: number; cost: number }>(db, "SELECT json_extract(fields, '$.model') AS model, count(*) AS calls, sum(coalesce(json_extract(fields, '$.costUsd'), 0)) AS cost FROM logs WHERE event = 'ai.call' AND at >= ? AND at <= ? GROUP BY model ORDER BY cost DESC", cal.from, cal.to),
    liveBudget(ctx),
  ]);
  const days = daysBetween(cal.from, cal.to);
  const monthStart = `${cal.ref.slice(0, 7)}-01`;
  const refDay = isoDay(cal.ref);
  const rows = agents.map((a) => {
    const id = a.record.id;
    const s = sumWork(work, (r) => r.agent_id === id);
    const mtd = sumWork(work, (r) => r.agent_id === id && r.day >= monthStart && r.day <= refDay);
    const hasLive = work.some((r) => r.agent_id === id && r.source === 'live');
    const hours = hoursReturned({ minutesSaved: s.ms, humanMinutes: s.hm });
    return {
      agentId: id,
      name: a.record.name,
      source: a.record.source,
      builtWith: a.record.builtWith,
      status: a.record.status,
      workUnits: s.units,
      unitLabel: a.record.unitLabel,
      costUsd: s.cost,
      costPerUnitUsd: s.units ? s.cost / s.units : null,
      targetPerUnitUsd: a.profile.slo.costPerUnitUsd,
      monthlyBudgetUsd: a.profile.monthlyBudgetUsd,
      monthToDateUsd: id === SIGNAL_LOOP_AGENT_ID ? mtd.cost : mtd.cost,
      perRunCapUsd: a.profile.perRunCapUsd,
      valueUsd: valueUsd(hours, assumptions.loadedHourlyUsd),
      daily: days.map((d) => (d < a.record.launchedAt.slice(0, 10) || (d > cal.simTo && !(a.record.source === 'live' && hasLive)) ? null : Math.round(sumWork(work, (r) => r.agent_id === id && r.day === d).cost * 1e4) / 1e4)),
    };
  });
  const tot = sumWork(work, () => true);
  return {
    range: { from: cal.from, to: cal.to },
    days,
    totals: { costUsd: tot.cost, workUnits: tot.units, valueUsd: rows.reduce((s, r) => s + r.valueUsd, 0), monthToDateUsd: rows.reduce((s, r) => s + r.monthToDateUsd, 0), monthlyBudgetUsd: rows.reduce((s, r) => s + r.monthlyBudgetUsd, 0) },
    agents: rows,
    byModel: models.map((m) => ({ model: m.model ?? 'unknown', calls: m.calls, costUsd: m.cost })),
    liveBudget: budget,
  };
}

// ---------------------------------------------------------------- meta

export async function platformMeta(ctx: Ctx): Promise<PlatformMeta> {
  const m = await loadMeta(ctx.db);
  return { simulatedFrom: m.simFrom, simulatedTo: m.simTo, seededAt: m.seededAt, rolledForwardDays: m.rolledDays, workspaceId: ctx.viewer.workspace, viewerActorId: null, now: ctx.now.toISOString() };
}

