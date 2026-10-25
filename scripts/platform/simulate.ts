/**
 * Agent Ops simulator: six weeks of believable history for the registry's agents, from a
 * seeded RNG (same seed + same end date ⇒ byte-identical output).
 *
 *   node scripts/platform/simulate.ts               summary of what would be seeded
 *   node scripts/platform/simulate.ts --end 2026-10-31
 *
 * Patterns it plants on purpose: weekday peaks 9–11am and 1–3pm Pacific, an adoption ramp
 * after launch, the RFP agent's pilot → production step, a primary-model incident on Signal
 * Loop (fallback to the secondary model, then recovery), Gumloop's slower latency profile.
 *
 * Signal Loop from real runs: when data/backfill/runs.json exists (real pipeline executions
 * over synthetic transcripts; history.json adds the ground step's quote counts and each
 * delivery's attempts), `loadBackfill()` validates it and Signal Loop's history is derived
 * from it instead of the RNG: one work unit and one trace per real run, at the real time
 * (moved with --end like everything else), with the real step order and durations, one
 * ai.call per model step (real model, tokens, cost), grounding.checked {passed, total,
 * dropped}, real delivery channels and retries, real insight/gate counts, and the work unit's
 * cost = the run's costUsd. Outcome comes from what happened: reviewed → edited / accepted /
 * rejected from the real review actions, auto-routed or nothing to route → automatic, still
 * awaiting review → drawn from the agent's outcome mix. Runs keep their real CSM when that
 * person is in the agent's user pool; the others go to pool users by the adoption ramp. The
 * RNG still supplies what the pipeline does not record: sessions and page views around each
 * run, request latency, ids, office-hours timing for overnight reviews, and the incident
 * overlay (real runs inside its window get primary-model 503s and fallbacks; one extra run
 * fails after retries at no cost). Without the backfill, Signal Loop runs are fully simulated.
 *
 * Rows stay source 'simulated' either way, because the users are synthetic. Only telemetry
 * that arrives through the SDK at runtime is 'live'.
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { createRng, type Rng } from '../data/lib/rng.ts';
import { addDays, daysBetween, isoDay, weekdayIndex } from '../../src/worker/platform/math.ts';
import type { AgentRecord, Alert, ChangeEntry, LogEntry, Span, UsageEvent, UsageKind, WorkUnit } from '../../src/shared/platform-contracts.ts';
import type { AgentProfile } from '../../src/worker/platform/types.ts';

const ROOT = new URL('../../', import.meta.url);
const SIGNAL_LOOP_ID = 'agt_signal_loop';
const CANONICAL_END = '2026-10-24';
const WINDOW_DAYS = 41; // 2026-09-14 … 2026-10-24 inclusive

type Outcome = WorkUnit['outcome'];
type SimParams = {
  pool: { ids: string[] };
  adoption: { start: string; rampDays: number; finalShare: number };
  activeDayProb: number;
  sessionsPerActiveDay: number;
  unitsPerSession: number;
  outcomes: Record<Outcome, number>;
  humanMinutes: Record<Outcome, number>;
  costPerUnit: number;
  costJitter: number;
  latencyMs: number;
  latencySigma: number;
  models: [string, number][];
  components: string[];
  steps: string[];
  grounding: boolean;
  delivery: string[] | null;
  features: Partial<Record<UsageKind, number>>;
  incidents: { start: string; end: string; errorRate: number; latencyMult: number; fallbackRate: number; note: string }[];
  pilotUntil?: string;
};
type AgentSeed = { record: AgentRecord; profile: AgentProfile & { promotedAt?: string }; sim: SimParams };
type SeedAlert = Alert & { resolvedAt: string | null };
export type Person = { id: string; name: string; role: string; department: string; title: string };

export type SimOutput = {
  window: { from: string; to: string };
  agents: { record: AgentRecord; profile: AgentProfile }[];
  people: Person[];
  changelog: ChangeEntry[];
  alerts: SeedAlert[];
  events: UsageEvent[];
  logs: LogEntry[];
  spans: (Span & { source: 'simulated' })[];
  work: WorkUnit[];
};

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8')) as T;
}

/** Shift every YYYY-MM-DD / ISO date in the registry seed by `days`. */
function shiftDate(v: string, days: number): string {
  if (!days) return v;
  return v.length <= 10 ? isoDay(addDays(v, days)) : addDays(v, days);
}

function loadWorldPeople(): { id: string; name: string; role: string; title: string }[] {
  return readJson<{ id: string; name: string; role: string; title: string }[]>('data/world/people.json');
}

export function loadPeople(): Person[] {
  const own = readJson<{ departmentMap: Record<string, string>; people: Person[]; worldUsers: string[] }>('data/platform/people.json');
  const world = loadWorldPeople();
  const depts = readJson<{ personId: string; department: string }[]>('data/world/departments.json');
  const fromWorld: Person[] = own.worldUsers.flatMap((id) => {
    const w = world.find((p) => p.id === id);
    if (!w) return [];
    const d = depts.find((x) => x.personId === id)?.department ?? 'Operations';
    return [{ id: w.id, name: w.name, role: w.role, title: w.title, department: own.departmentMap[d] ?? d }];
  });
  return [...own.people, ...fromWorld];
}

// ---------------------------------------------------------------- real Signal Loop backfill

const BackfillStep = z.object({
  key: z.string(),
  status: z.string(), // passed | warned | skipped | failed
  startedAt: z.string(),
  durationMs: z.number(),
  model: z.string().nullable(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  costUsd: z.number().nullable(),
});
const BackfillRunRow = z.object({
  runId: z.string(),
  fileId: z.string(),
  accountId: z.string(),
  csmId: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  costUsd: z.number(),
  status: z.string(), // completed | awaiting_review | failed
  promptVersion: z.string(),
  steps: z.array(BackfillStep),
  insights: z.object({ total: z.number(), autoRoute: z.number(), review: z.number(), held: z.number(), dropped: z.number() }),
  reviews: z.array(z.object({ action: z.string(), reviewer: z.string(), at: z.string() })),
  deliveries: z.array(z.object({ channel: z.string(), attempts: z.number(), at: z.string() })),
  fallbacks: z.number(),
  models: z.array(z.string()),
});
const BackfillHistory = z.object({
  steps: z.array(z.object({ runId: z.string(), key: z.string(), detail: z.record(z.string(), z.unknown()).nullable().optional() })),
  insights: z.array(z.object({ id: z.string(), runId: z.string() })),
  deliveries: z.array(
    z.object({
      insightId: z.string(),
      channel: z.string(),
      destination: z.string().nullable().optional(),
      status: z.string(),
      receipt: z.string().nullable().optional(),
      createdAt: z.string(),
      attempts: z.array(z.object({ at: z.string(), ok: z.boolean(), ms: z.number(), note: z.string().nullable().optional() })),
    }),
  ),
});

export type BackfillGrounding = { passed: number; total: number; dropped: number };
export type BackfillDelivery = { channel: string; destination: string | null; at: string; receipt: string | null; attempts: { at: string; ok: boolean; ms: number | null; note: string | null }[] };
export type BackfillRun = z.infer<typeof BackfillRunRow> & { grounding: BackfillGrounding | null; deliveryDetail: BackfillDelivery[] };
export type Backfill = { runs: BackfillRun[]; generatedAt: string | null };

/**
 * Real Signal Loop runs from data/backfill/ (runs.json, plus history.json for the ground step's
 * quote counts and each delivery's attempts), or null when the backfill is absent. Validated, then
 * joined per run; nothing here is random.
 */
export function loadBackfill(): Backfill | null {
  const runsUrl = new URL('data/backfill/runs.json', ROOT);
  if (!existsSync(runsUrl)) return null;
  const runs = z.array(BackfillRunRow).parse(JSON.parse(readFileSync(runsUrl, 'utf8')));
  if (!runs.length) return null;
  const histUrl = new URL('data/backfill/history.json', ROOT);
  const raw: unknown = existsSync(histUrl) ? JSON.parse(readFileSync(histUrl, 'utf8')) : null;
  const hist = raw ? BackfillHistory.safeParse(raw) : null;
  const history = hist?.success ? hist.data : null;
  const generatedAt = raw && typeof raw === 'object' && 'generatedAt' in raw && typeof raw.generatedAt === 'string' ? raw.generatedAt : null;

  const groundByRun = new Map<string, BackfillGrounding>();
  for (const s of history?.steps ?? []) {
    if (s.key !== 'ground' || !s.detail) continue;
    const { quotes, grounded, droppedInsights } = s.detail;
    if (typeof quotes === 'number' && typeof grounded === 'number') groundByRun.set(s.runId, { passed: grounded, total: quotes, dropped: typeof droppedInsights === 'number' ? droppedInsights : 0 });
  }
  const runOfInsight = new Map((history?.insights ?? []).map((i) => [i.id, i.runId]));
  const deliveriesByRun = new Map<string, BackfillDelivery[]>();
  for (const d of history?.deliveries ?? []) {
    const runId = runOfInsight.get(d.insightId);
    if (!runId) continue;
    const list = deliveriesByRun.get(runId) ?? [];
    list.push({ channel: d.channel, destination: d.destination ?? null, at: d.createdAt, receipt: d.receipt ?? null, attempts: d.attempts.map((a) => ({ at: a.at, ok: a.ok, ms: a.ms, note: a.note ?? null })) });
    deliveriesByRun.set(runId, list);
  }

  return {
    generatedAt,
    runs: runs.map((r) => {
      const groundStep = r.steps.find((s) => s.key === 'ground');
      const grounding = groundByRun.get(r.runId) ?? (groundStep && groundStep.status !== 'skipped' ? { passed: r.insights.total, total: r.insights.total + r.insights.dropped, dropped: r.insights.dropped } : null);
      // Prefer history's per-attempt detail; fall back to runs.json's summary (attempt latency unknown).
      const deliveryDetail =
        deliveriesByRun.get(r.runId)?.sort((a, b) => a.at.localeCompare(b.at)) ??
        r.deliveries.map((d) => ({ channel: d.channel, destination: null, at: d.at, receipt: null, attempts: Array.from({ length: Math.max(1, d.attempts) }, (_, i) => ({ at: d.at, ok: i === d.attempts - 1, ms: null, note: null })) }));
      return { ...r, grounding, deliveryDetail };
    }),
  };
}

// ---------------------------------------------------------------- helpers

const PT_OFFSET_H = -7; // PDT through the window
const HOUR_WEIGHTS_PT = [0, 0, 0, 0, 0, 0, 0.05, 0.3, 0.9, 1.7, 1.8, 1.3, 0.6, 1.4, 1.6, 1.1, 0.6, 0.3, 0.15, 0.08, 0.04, 0.02, 0, 0];
const WEEKDAY_FACTOR = [1, 1.05, 1.05, 1, 0.8, 0.06, 0.03];

function hex(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(rng.next() * 16).toString(16);
  return s;
}
function lognormal(rng: Rng, median: number, sigma: number): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}
function poisson(rng: Rng, mean: number): number {
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l);
  return k - 1;
}
function sessionStart(rng: Rng, day: string): number {
  const hourPt = rng.weighted(HOUR_WEIGHTS_PT.map((_, i) => i), HOUR_WEIGHTS_PT);
  const base = Date.parse(`${day}T00:00:00.000Z`);
  return base + (hourPt - PT_OFFSET_H) * 3_600_000 + Math.floor(rng.next() * 3_600_000);
}
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------- generator

export function simulate(opts: { end?: string; seed?: string; backfill?: Backfill | null } = {}): SimOutput {
  const end = opts.end ?? CANONICAL_END;
  const shift = Math.round((Date.parse(end) - Date.parse(CANONICAL_END)) / 86_400_000);
  const from = isoDay(addDays(end, -(WINDOW_DAYS - 1)));
  const rng = createRng(opts.seed ?? 'agent-ops-v2');
  const seed = readJson<{ agents: AgentSeed[]; alerts: SeedAlert[] }>('data/platform/agents.json');
  const people = loadPeople();
  const person = new Map(people.map((p) => [p.id, p]));
  const out: SimOutput = { window: { from, to: end }, agents: [], people, changelog: [], alerts: [], events: [], logs: [], spans: [], work: [] };
  const days = daysBetween(from, end);
  const endMs = Date.parse(`${end}T23:59:59.000Z`);
  const backfill = opts.backfill === undefined ? loadBackfill() : opts.backfill;

  for (const a of seed.agents) {
    const r = { ...a.record };
    r.lastReview = shiftDate(r.lastReview, shift);
    r.nextReview = shiftDate(r.nextReview, shift);
    r.launchedAt = shiftDate(r.launchedAt, shift);
    const profile: AgentProfile = {
      ...a.profile,
      securityReview: { ...a.profile.securityReview, date: shiftDate(a.profile.securityReview.date, shift) },
      promotedAt: a.profile.promotedAt ? shiftDate(a.profile.promotedAt, shift) : null,
      retiredAt: a.profile.retiredAt ? shiftDate(a.profile.retiredAt, shift) : null,
    };
    out.agents.push({ record: r, profile });
    generateAgent(rng.fork(r.id), r, profile, a.sim, days, shift, person, out, endMs, r.id === SIGNAL_LOOP_ID ? backfill : null);
    out.changelog.push(...changelogFor(r.id, shift));
  }
  for (const al of seed.alerts) out.alerts.push({ ...al, at: shiftDate(al.at, shift), resolvedAt: al.resolvedAt ? shiftDate(al.resolvedAt, shift) : null });
  out.events.sort((x, y) => x.at.localeCompare(y.at));
  out.logs.sort((x, y) => x.at.localeCompare(y.at));
  out.work.sort((x, y) => x.at.localeCompare(y.at));
  return out;
}

type RunCtx = { rng: Rng; agent: AgentRecord; sim: SimParams; out: SimOutput; incident: SimParams['incidents'][number] | null };

function generateAgent(rng: Rng, agent: AgentRecord, profile: AgentProfile, sim: SimParams, days: string[], shift: number, person: Map<string, Person>, out: SimOutput, endMs: number, backfill: Backfill | null) {
  const short = agent.id.replace(/^agt_/, '').split('_').map((w) => w[0]).join('');
  let seq = 0;
  const adoptStart = Date.parse(shiftDate(sim.adoption.start, shift));
  const pilotUntil = sim.pilotUntil ? Date.parse(shiftDate(sim.pilotUntil, shift)) : 0;
  const incidents = sim.incidents.map((i) => ({ ...i, start: shiftDate(i.start, shift), end: shiftDate(i.end, shift) }));
  const users = sim.pool.ids.map((id, idx) => ({ id, adoptedAt: adoptStart + (sim.adoption.rampDays * 86_400_000 * idx) / Math.max(1, sim.pool.ids.length), engagement: 0.75 + rng.next() * 0.5 }));
  if (backfill) {
    generateFromBackfill({ rng, agent, profile, sim, shift, person, out, endMs, startMs: Date.parse(`${days[0]}T00:00:00.000Z`), short, users, incidents }, backfill);
    return;
  }

  const runs: { at: number; actor: string; session: string; forceFail?: boolean }[] = [];
  for (const day of days) {
    const wd = weekdayIndex(day);
    const dayMs = Date.parse(`${day}T00:00:00.000Z`);
    for (const u of users) {
      if (dayMs + 86_400_000 < u.adoptedAt) continue;
      // Pilot: only the first user, at half intensity, until promotion.
      if (pilotUntil && dayMs < pilotUntil && u !== users[0]) continue;
      const p = sim.activeDayProb * WEEKDAY_FACTOR[wd]! * u.engagement * (pilotUntil && dayMs < pilotUntil ? 0.6 : 1);
      if (!rng.chance(Math.min(0.95, p))) continue;
      const sessions = 1 + (rng.chance(sim.sessionsPerActiveDay - 1) ? 1 : 0);
      for (let s = 0; s < sessions; s++) {
        let t = sessionStart(rng, day);
        if (t > endMs) continue;
        const sessionId = `ses_${short}_${hex(rng, 10)}`;
        const actor = person.get(u.id);
        const role = actor?.role ?? 'unknown';
        const ev = (kind: UsageKind, path: string | null, props: Record<string, unknown> = {}, durationMs: number | null = null) => {
          out.events.push({ id: `evt_${short}_${hex(rng, 12)}`, agentId: agent.id, source: 'simulated', sessionId, actorId: u.id, actorRole: role, kind, path, props, at: iso(t), durationMs });
          t += 15_000 + Math.floor(rng.next() * 90_000);
        };
        ev('session_start', null);
        const nUnits = Math.max(sim.unitsPerSession > 0 ? (rng.chance(0.8) ? 1 : 0) : 0, poisson(rng, sim.unitsPerSession));
        const features = Object.entries(sim.features) as [UsageKind, number][];
        const nFeatures = 2 + poisson(rng, 2);
        for (let f = 0; f < nFeatures; f++) {
          const kind = rng.weighted(features.map(([k]) => k), features.map(([, w]) => w));
          const path = agent.id === 'agt_signal_loop' ? pathFor(kind) : null;
          ev(kind, path, {}, kind === 'page_view' ? 8_000 + Math.floor(rng.next() * 70_000) : null);
          if (kind === 'page_view' && agent.id === 'agt_signal_loop') apiRequest({ rng, agent, sim, out, incident: null }, t - 500, path ?? '/app', sessionId);
        }
        for (let k = 0; k < nUnits; k++) {
          runs.push({ at: t, actor: u.id, session: sessionId });
          ev(agent.id === 'agt_signal_loop' ? 'run_created' : 'agent_invoked', agent.id === 'agt_signal_loop' ? '/app/new' : null);
          t += 60_000;
        }
      }
    }
  }
  // Make each incident visible: a handful of runs inside its window.
  for (const inc of incidents) {
    const a = Date.parse(inc.start);
    const b = Date.parse(inc.end);
    for (let k = 0; k < 7; k++) runs.push({ at: a + Math.floor(((k + 0.5) / 7) * (b - a)), actor: rng.pick(users).id, session: `ses_${short}_${hex(rng, 10)}`, forceFail: k === 3 });
  }
  runs.sort((x, y) => x.at - y.at);

  for (const run of runs) {
    seq++;
    const incident = incidents.find((i) => run.at >= Date.parse(i.start) && run.at <= Date.parse(i.end)) ?? null;
    const ctx: RunCtx = { rng, agent, sim, out, incident };
    const outcome = run.forceFail ? 'failed' : pickOutcome(rng, sim, null);
    const runId = `run_${short}_${String(seq).padStart(4, '0')}`;
    const traceId = hex(rng, 32);
    const cost = traceRun(ctx, run.at, runId, traceId, outcome, run.session, profile);
    const human = outcome === 'failed' ? 0 : sim.humanMinutes[outcome] * (0.7 + rng.next() * 0.6);
    out.work.push({
      id: `wu_${short}_${String(seq).padStart(4, '0')}`,
      agentId: agent.id,
      source: 'simulated',
      at: iso(run.at),
      kind: agent.unitLabel.replace(/\s+/g, '_'),
      actorId: run.actor,
      minutesSavedEstimate: outcome === 'accepted' || outcome === 'edited' || outcome === 'automatic' ? agent.baselineMinutesPerUnit : 0,
      humanMinutesSpent: Math.round(human * 10) / 10,
      aiCostUsd: Math.round(cost * 1e6) / 1e6,
      outcome,
    });
    if (outcome !== 'failed') {
      const kind: UsageKind = outcome === 'accepted' || outcome === 'automatic' ? 'output_accepted' : outcome === 'edited' ? 'output_edited' : 'output_rejected';
      const role = person.get(run.actor)?.role ?? 'unknown';
      out.events.push({ id: `evt_${short}_${hex(rng, 12)}`, agentId: agent.id, source: 'simulated', sessionId: run.session, actorId: run.actor, actorRole: role, kind: agent.id === 'agt_signal_loop' ? 'review_action' : kind, path: agent.id === 'agt_signal_loop' ? '/app/review' : null, props: { runId, outcome }, at: iso(run.at + 120_000 + Math.floor(rng.next() * 600_000)), durationMs: Math.floor(20_000 + rng.next() * 180_000) });
    }
  }
}

function pathFor(kind: UsageKind): string {
  const map: Partial<Record<UsageKind, string>> = { page_view: '/app', run_viewed: '/app/runs', review_action: '/app/review', insight_opened: '/app/insights', theme_opened: '/app/themes', rule_changed: '/app/routing', notification_opened: '/app/loop', digest_opened: '/app/loop', search: '/app/insights' };
  return map[kind] ?? '/app';
}

function pickOutcome(rng: Rng, sim: SimParams, incident: RunCtx['incident']): Outcome {
  if (incident && rng.chance(incident.errorRate)) return 'failed';
  const entries = Object.entries(sim.outcomes) as [Outcome, number][];
  return rng.weighted(entries.map(([k]) => k), entries.map(([, w]) => w));
}

function log(ctx: RunCtx, at: number, level: LogEntry['level'], component: string, event: string, message: string, traceId: string, spanId: string | null, runId: string | null, durationMs: number | null, fields: Record<string, unknown>) {
  ctx.out.logs.push({ id: `log_${hex(ctx.rng, 16)}`, agentId: ctx.agent.id, source: 'simulated', at: iso(at), level, component, event, message, traceId, spanId, runId, workspaceId: null, durationMs, fields });
}
function span(ctx: RunCtx, traceId: string, spanId: string, parentId: string | null, name: string, start: number, durationMs: number, status: 'ok' | 'error', attrs: Record<string, unknown>) {
  ctx.out.spans.push({ traceId, spanId, parentId, agentId: ctx.agent.id, source: 'simulated', name, start: iso(start), durationMs: Math.max(1, Math.round(durationMs)), status, attrs });
}

/** A page's API read on Signal Loop (no run): one http.request log, one span. */
function apiRequest(ctx: RunCtx, at: number, path: string, sessionId: string) {
  const traceId = hex(ctx.rng, 32);
  const spanId = hex(ctx.rng, 16);
  const route = `GET /api${path.replace('/app', '') || '/session'}`;
  const ms = Math.round(lognormal(ctx.rng, ctx.sim.latencyMs * 0.45, ctx.sim.latencySigma));
  span(ctx, traceId, spanId, null, route, at, ms, 'ok', { 'http.status': 200, 'http.route': route });
  log(ctx, at + ms, 'info', 'api', 'http.request', `${route} 200`, traceId, spanId, null, ms, { method: 'GET', route, status: 200, session: sessionId });
}

const MODEL_PRICE: Record<string, [number, number]> = {
  'deepseek/deepseek-v4.1-flash': [0.27, 1.1],
  'anthropic/claude-haiku-5.5': [0.1, 0.5],
  'anthropic/claude-sonnet-5.5': [3, 15],
  'openai/gpt-5.4-mini': [0.25, 2],
};

function aiCall(ctx: RunCtx, parent: string, traceId: string, runId: string, at: number, label: string, tokensIn: number, tokensOut: number, ms: number): { cost: number; ms: number; ok: boolean } {
  const { rng, sim, incident } = ctx;
  const primary = sim.models[0]![0];
  const secondary = sim.models[1]?.[0] ?? primary;
  const fallback = incident ? rng.chance(incident.fallbackRate) : rng.chance(sim.models[1]?.[1] ?? 0);
  let t = at;
  let total = 0;
  if (fallback && secondary !== primary) {
    const failMs = incident ? 2_000 + rng.next() * 6_000 : 900 + rng.next() * 2_500;
    const sid = hex(rng, 16);
    span(ctx, traceId, sid, parent, `ai.generate ${primary}`, t, failMs, 'error', { model: primary, step: label, error: incident ? '503 Service Unavailable' : 'timeout', retry: 0 });
    log(ctx, t + failMs, 'warn', 'ai', 'ai.call', `${label}: ${primary} failed (${incident ? '503' : 'timeout'}); falling back to ${secondary}`, traceId, sid, runId, Math.round(failMs), { model: primary, ok: false, fallback: false, step: label, tokensIn: 0, tokensOut: 0, costUsd: 0 });
    t += failMs;
    total += failMs;
  }
  const model = fallback ? secondary : primary;
  const price = MODEL_PRICE[model] ?? [1, 4];
  const inT = Math.round(tokensIn * (0.8 + rng.next() * 0.4));
  const outT = Math.round(tokensOut * (0.7 + rng.next() * 0.6));
  const cost = (inT * price[0] + outT * price[1]) / 1e6;
  const sid = hex(rng, 16);
  span(ctx, traceId, sid, parent, `ai.generate ${model}`, t, ms, 'ok', { model, step: label, tokensIn: inT, tokensOut: outT, costUsd: Math.round(cost * 1e6) / 1e6, fallback });
  log(ctx, t + ms, 'info', 'ai', 'ai.call', `${label}: ${model} ${inT}→${outT} tokens`, traceId, sid, runId, Math.round(ms), { model, ok: true, fallback, step: label, tokensIn: inT, tokensOut: outT, costUsd: Math.round(cost * 1e6) / 1e6 });
  return { cost, ms: total + ms, ok: true };
}

/** One run's full trace: request → workflow steps → AI calls → deliveries. Returns AI cost. */
function traceRun(ctx: RunCtx, at: number, runId: string, traceId: string, outcome: Outcome, sessionId: string, profile: AgentProfile): number {
  const { rng, agent, sim, incident } = ctx;
  const isSL = agent.id === 'agt_signal_loop';
  const mult = incident ? incident.latencyMult : 1;
  const root = hex(rng, 16);
  let t = at;
  let cost = 0;
  const failAt = outcome === 'failed' ? rng.int(Math.floor(sim.steps.length / 2), sim.steps.length - 1) : -1;

  // 1. The request that starts the run.
  const reqName = isSL ? 'POST /api/runs' : 'POST gumloop/flows/rfp-responder/run';
  const reqId = hex(rng, 16);
  const reqMs = isSL ? lognormal(rng, sim.latencyMs, sim.latencySigma) * mult : 180 + rng.next() * 300;
  span(ctx, traceId, reqId, root, reqName, t, reqMs, 'ok', { 'http.status': 202, runId });
  t += reqMs;
  // Signal Loop answers 202 and runs the Workflow async; a Gumloop flow run is one synchronous call (logged at the end).
  if (isSL) log(ctx, t, 'info', 'api', 'http.request', `${reqName} 202`, traceId, reqId, runId, Math.round(reqMs), { method: 'POST', route: reqName, status: 202, session: sessionId });

  // 2. Workflow steps.
  const wfId = hex(rng, 16);
  const wfStart = t;
  let failed = false;
  for (let i = 0; i < sim.steps.length; i++) {
    const step = sim.steps[i]!;
    const sid = hex(rng, 16);
    const stepStart = t;
    let stepMs = (isSL ? 20 + rng.next() * 60 : 400 + rng.next() * 1_800) * mult;
    const isAi = isSL ? step === 'screen' || step === 'extract' : step === 'draft' || step === 'retrieve_answers' || step === 'cite';
    if (isAi) {
      const tok = isSL ? (step === 'extract' ? [3_800, 900] : [2_400, 120]) : step === 'draft' ? [170_000, 42_000] : [48_000, 5_000];
      const callMs = (isSL ? (step === 'extract' ? 3_200 : 1_100) : step === 'draft' ? 58_000 : 12_000) * (0.7 + rng.next() * 0.6) * mult;
      const r = aiCall(ctx, sid, traceId, runId, t + 5, step, tok[0]!, tok[1]!, callMs);
      cost += r.cost;
      stepMs = r.ms + 15;
    }
    if (step === 'theme') stepMs += 250 + rng.next() * 200;
    const stepFails = i === failAt;
    span(ctx, traceId, sid, wfId, `step.${step}`, stepStart, stepMs, stepFails ? 'error' : 'ok', { step, attempt: stepFails ? 3 : 1 });
    t += stepMs;
    if (stepFails) {
      log(ctx, t, 'error', isSL ? 'workflow' : 'gumloop', 'step.failed', `${step} failed after 3 attempts${incident ? ` (${incident.note})` : ''}`, traceId, sid, runId, Math.round(stepMs), { step, attempts: 3 });
      failed = true;
      break;
    }
    log(ctx, t, 'debug', isSL ? 'workflow' : 'gumloop', 'step.finished', `${step} ok`, traceId, sid, runId, Math.round(stepMs), { step });
    if (sim.grounding && (step === 'ground' || step === 'cite')) {
      const total = isSL ? rng.int(2, 6) : rng.int(40, 140);
      const misses = rng.chance(isSL ? 0.14 : 0.5) ? rng.int(1, isSL ? 1 : 4) : 0;
      log(ctx, t, misses ? 'warn' : 'info', isSL ? 'workflow' : 'gumloop', 'grounding.checked', `${total - misses} of ${total} ${isSL ? 'quotes' : 'answers'} grounded${misses ? `; ${misses} dropped` : ''}`, traceId, sid, runId, null, { passed: total - misses, total });
    }
    if (step === 'deliver' && sim.delivery && outcome !== 'rejected') {
      const targets = outcome === 'automatic' ? sim.delivery.slice(0, 2) : [rng.pick(sim.delivery)];
      for (const d of targets) {
        const did = hex(rng, 16);
        const ms = 150 + rng.next() * 500;
        const retry = rng.chance(0.04);
        span(ctx, traceId, did, sid, `delivery.${d}`, t, ms + (retry ? 1_200 : 0), 'ok', { channel: d, retry: retry ? 1 : 0, 'http.status': 201 });
        if (retry) log(ctx, t + ms, 'warn', 'delivery', 'delivery.retry', `${d}: 502 from mock destination; retrying`, traceId, did, runId, Math.round(ms), { channel: d, attempt: 1 });
        log(ctx, t + ms + (retry ? 1_200 : 0), 'info', 'delivery', 'delivery.sent', `${d}: delivered`, traceId, did, runId, Math.round(ms), { channel: d, ok: true });
      }
    }
  }
  span(ctx, traceId, wfId, root, isSL ? 'workflow signal-loop-pipeline' : 'gumloop flow', wfStart, t - wfStart, failed ? 'error' : 'ok', { runId, steps: sim.steps.length });
  if (isSL && !failed) log(ctx, t, 'debug', 'budget', 'budget.check', `run cost $${cost.toFixed(4)} within per-run cap $${profile.perRunCapUsd.toFixed(2)}`, traceId, wfId, runId, null, { costUsd: Math.round(cost * 1e6) / 1e6, capUsd: profile.perRunCapUsd });
  if (!isSL) log(ctx, t, failed ? 'error' : 'info', 'gumloop', 'http.request', `${reqName} ${failed ? 500 : 200}`, traceId, reqId, runId, Math.round(t - at), { method: 'POST', route: reqName, status: failed ? 500 : 200, session: sessionId });
  span(ctx, traceId, root, null, `run ${runId}`, at, t - at, failed ? 'error' : 'ok', { runId, outcome, costUsd: Math.round(cost * 1e6) / 1e6 });
  log(ctx, t, failed ? 'error' : 'info', isSL ? 'workflow' : 'gumloop', 'run.finished', `${runId} ${failed ? 'failed' : outcome}`, traceId, root, runId, Math.round(t - at), { outcome, costUsd: Math.round(cost * 1e6) / 1e6, ok: !failed });
  return cost;
}

// ---------------------------------------------------------------- Signal Loop from real runs

type PoolUser = { id: string; adoptedAt: number; engagement: number };
type Incident = SimParams['incidents'][number];
type BackfillCtx = { rng: Rng; agent: AgentRecord; profile: AgentProfile; sim: SimParams; shift: number; person: Map<string, Person>; out: SimOutput; endMs: number; startMs: number; short: string; users: PoolUser[]; incidents: Incident[] };
type Clock = (isoTime: string) => number;

const SESSION_GAP_MS = 90 * 60_000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Work-unit outcome from what really happened to the run's insights. */
function backfillOutcome(rng: Rng, sim: SimParams, run: BackfillRun): Outcome {
  if (run.status === 'failed') return 'failed';
  const actions = run.reviews.map((r) => r.action);
  if (actions.includes('edit')) return 'edited';
  if (actions.includes('approve')) return 'accepted';
  if (run.insights.autoRoute > 0 || run.insights.total === 0) return 'automatic'; // routed (or nothing to route) without a person
  if (actions.length) return 'rejected';
  // Still waiting for review when the backfill ended: draw from the agent's reviewed-outcome mix.
  const mix = (['accepted', 'edited', 'rejected'] as const).map((k) => [k, sim.outcomes[k]] as const);
  return rng.weighted(mix.map(([k]) => k), mix.map(([, w]) => w));
}

/**
 * Signal Loop's history from the real backfill: one work unit and one trace per real run, at
 * its real (window-shifted) time, with its real steps, model calls, cost, grounding, gate counts
 * and deliveries. The planted incident overlays the real runs inside its window (primary 503s →
 * fallback) and adds the single run that failed after retries. Synthetic users wrap the runs in
 * sessions; review actions and the deliveries they trigger keep their real times, except that
 * off-hours reviews move to the reviewer's next working slot.
 */
function generateFromBackfill(c: BackfillCtx, backfill: Backfill) {
  const { rng, agent, sim, out, users, person } = c;
  const shiftMs = c.shift * 86_400_000;
  const T: Clock = (t) => Date.parse(t) + shiftMs;
  const pool = new Set(sim.pool.ids);
  const byName = new Map(loadWorldPeople().map((p) => [p.name, p.id]));
  const runs = backfill.runs.filter((r) => T(r.createdAt) >= c.startMs && T(r.finishedAt) <= c.endMs).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // The backfill stamps reviews at a fixed lag after the run, often overnight. Synthetic reviewers
  // keep office hours: an off-hours review (and the delivery it triggers) moves to the next
  // weekday working slot, unless that falls past the window.
  const reviewShift = new Map<string, number>();
  const reviewAt = (t: string) => {
    const real = T(t);
    if (!reviewShift.has(t)) {
      const pt = new Date(real + PT_OFFSET_H * 3_600_000);
      const ptHour = pt.getUTCHours();
      const weekend = pt.getUTCDay() === 0 || pt.getUTCDay() === 6;
      let moved = real;
      if (weekend || ptHour < 7 || ptHour >= 18) {
        let day = isoDay(pt.toISOString());
        if (weekend || ptHour >= 18) day = isoDay(addDays(day, 1));
        while ([0, 6].includes(new Date(`${day}T12:00:00.000Z`).getUTCDay())) day = isoDay(addDays(day, 1));
        moved = Math.max(real + 60_000, sessionStart(rng, day));
      }
      reviewShift.set(t, moved <= c.endMs ? moved - real : 0);
    }
    return real + (reviewShift.get(t) ?? 0);
  };

  const adopted = (at: number) => {
    const ok = users.filter((u) => u.adoptedAt <= at);
    const from = ok.length ? ok : users.slice(0, 1);
    return rng.weighted(from.map((u) => u.id), from.map((u) => u.engagement));
  };

  // 1. Activities in time order: each real run, each real review, plus the incident's failed run.
  type RunAct = { at: number; actor: string; kind: 'run'; run: BackfillRun | null; runId: string; incident: Incident | null };
  type ReviewAct = { at: number; actor: string; kind: 'review'; runId: string; action: string; outcome: Outcome };
  const acts: (RunAct | ReviewAct)[] = [];
  const incidentOf = (at: number) => c.incidents.find((i) => at >= Date.parse(i.start) && at <= Date.parse(i.end)) ?? null;
  const outcomes = new Map<string, Outcome>();
  for (const run of runs) {
    const at = T(run.createdAt);
    const actor = run.csmId && pool.has(run.csmId) ? run.csmId : adopted(at);
    const outcome = backfillOutcome(rng, sim, run);
    outcomes.set(run.runId, outcome);
    acts.push({ at, actor, kind: 'run', run, runId: run.runId, incident: incidentOf(at) });
    for (const rv of run.reviews) {
      const rat = reviewAt(rv.at);
      if (rat > c.endMs) continue;
      const reviewer = byName.get(rv.reviewer);
      acts.push({ at: rat, actor: reviewer && pool.has(reviewer) ? reviewer : actor, kind: 'review', runId: run.runId, action: rv.action, outcome });
    }
  }
  c.incidents.forEach((inc, k) => {
    const at = Date.parse(inc.start) + Math.floor(0.55 * (Date.parse(inc.end) - Date.parse(inc.start)));
    if (at < c.startMs || at > c.endMs) return;
    const runId = `run_${c.short}_incident_${String(k + 1).padStart(2, '0')}`;
    outcomes.set(runId, 'failed');
    acts.push({ at, actor: adopted(at), kind: 'run', run: null, runId, incident: inc });
  });
  acts.sort((a, b) => a.at - b.at || a.runId.localeCompare(b.runId));

  // 2. Sessions (synthetic users) around the real activity, then each run's trace and work unit.
  const open = new Map<string, { id: string; last: number }>();
  const ctxFor = (incident: Incident | null): RunCtx => ({ rng, agent, sim, out, incident });
  const features = (Object.entries(sim.features) as [UsageKind, number][]).filter(([k]) => k !== 'review_action');
  const ev = (sessionId: string, actor: string, kind: UsageKind, at: number, path: string | null, props: Record<string, unknown> = {}, durationMs: number | null = null) =>
    out.events.push({ id: `evt_${c.short}_${hex(rng, 12)}`, agentId: agent.id, source: 'simulated', sessionId, actorId: actor, actorRole: person.get(actor)?.role ?? 'unknown', kind, path, props, at: iso(at), durationMs });
  const session = (actor: string, at: number, reviewing: boolean) => {
    const cur = open.get(actor);
    if (cur && cur.last <= at && at - cur.last < SESSION_GAP_MS) return cur;
    const s = { id: `ses_${c.short}_${hex(rng, 10)}`, last: at };
    open.set(actor, s);
    const n = reviewing ? 1 : 1 + (rng.chance(0.45) ? 1 : 0);
    let t = Math.max(c.startMs, at - (n + 1) * (40_000 + Math.floor(rng.next() * 50_000)));
    ev(s.id, actor, 'session_start', t, null);
    for (let i = 0; i < n; i++) {
      t = Math.min(t + 20_000 + Math.floor(rng.next() * 25_000), at - 1_000);
      const kind: UsageKind = reviewing || i === 0 ? 'page_view' : rng.weighted(features.map(([k]) => k), features.map(([, w]) => w));
      const path = reviewing ? '/app/review' : pathFor(kind);
      ev(s.id, actor, kind, t, path, {}, kind === 'page_view' ? 8_000 + Math.floor(rng.next() * 40_000) : null);
      if (kind === 'page_view') apiRequest(ctxFor(null), t - 500, path, s.id);
    }
    return s;
  };

  let seq = 0;
  for (const a of acts) {
    const s = session(a.actor, a.at, a.kind === 'review');
    if (a.kind === 'review') {
      ev(s.id, a.actor, 'review_action', a.at, '/app/review', { runId: a.runId, action: a.action, outcome: a.outcome }, Math.floor(20_000 + rng.next() * 150_000));
      s.last = Math.max(s.last, a.at);
      continue;
    }
    seq++;
    const outcome = outcomes.get(a.runId) ?? 'failed';
    ev(s.id, a.actor, 'run_created', a.at, '/app/new', { runId: a.runId });
    const ctx = ctxFor(a.incident);
    const { cost, endAt } = a.run ? traceBackfillRun(ctx, c, a.run, outcome, s.id, T, reviewShift) : traceIncidentFailure(ctx, c.profile, a.at, a.runId, s.id);
    s.last = Math.max(s.last, endAt);
    if (a.run && endAt + 60_000 <= c.endMs && rng.chance(0.5)) {
      ev(s.id, a.actor, 'run_viewed', endAt + 20_000 + Math.floor(rng.next() * 40_000), '/app/runs', { runId: a.runId }, 10_000 + Math.floor(rng.next() * 50_000));
      s.last = Math.max(s.last, endAt + 60_000);
    }
    const reviews = a.run?.reviews.length ?? 0;
    const human = outcome === 'failed' || outcome === 'automatic' ? 0 : sim.humanMinutes[outcome] * Math.max(1, reviews) * (0.7 + rng.next() * 0.6);
    out.work.push({
      id: a.run ? `wu_${a.runId.replace(/^run_/, '')}` : `wu_${c.short}_${String(seq).padStart(4, '0')}`,
      agentId: agent.id,
      source: 'simulated',
      at: iso(a.at),
      kind: agent.unitLabel.replace(/\s+/g, '_'),
      actorId: a.actor,
      minutesSavedEstimate: outcome === 'accepted' || outcome === 'edited' || outcome === 'automatic' ? agent.baselineMinutesPerUnit : 0,
      humanMinutesSpent: Math.round(human * 10) / 10,
      aiCostUsd: round6(cost),
      outcome,
    });
  }
}

/** One real run's trace: request → real workflow steps → real model calls → grounding → deliveries. */
function traceBackfillRun(ctx: RunCtx, c: BackfillCtx, run: BackfillRun, outcome: Outcome, sessionId: string, T: Clock, reviewShift: Map<string, number>): { cost: number; endAt: number } {
  const { rng, sim, incident } = ctx;
  const runId = run.runId;
  const traceId = hex(rng, 32);
  const root = hex(rng, 16);
  const at = T(run.createdAt);
  const primary = sim.models[0]![0];
  const secondary = sim.models[1]?.[0] ?? primary;

  const reqId = hex(rng, 16);
  const reqMs = lognormal(rng, sim.latencyMs, sim.latencySigma) * (incident ? incident.latencyMult : 1);
  span(ctx, traceId, reqId, root, 'POST /api/runs', at, reqMs, 'ok', { 'http.status': 202, runId, fileId: run.fileId });
  log(ctx, at + reqMs, 'info', 'api', 'http.request', 'POST /api/runs 202', traceId, reqId, runId, Math.round(reqMs), { method: 'POST', route: 'POST /api/runs', status: 202, session: sessionId });

  const wfId = hex(rng, 16);
  const wfStart = T(run.steps[0]?.startedAt ?? run.createdAt);
  const finished = T(run.finishedAt);
  let offset = 0; // incident overlay: failed primary attempts push the later steps back
  let end = finished;
  const failed = run.status === 'failed';
  for (const step of run.steps) {
    const sid = hex(rng, 16);
    const start = T(step.startedAt) + offset;
    if (step.status === 'skipped') {
      span(ctx, traceId, sid, wfId, `step.${step.key}`, start, 1, 'ok', { step: step.key, status: 'skipped' });
      continue;
    }
    let extra = 0;
    if (step.model) {
      const fellBack = incident !== null && secondary !== primary && rng.chance(incident.fallbackRate);
      let t = start + 2;
      if (fellBack) {
        const failMs = Math.round(2_000 + rng.next() * 6_000);
        const fid = hex(rng, 16);
        span(ctx, traceId, fid, sid, `ai.generate ${step.model}`, t, failMs, 'error', { model: step.model, step: step.key, error: '503 Service Unavailable', retry: 0 });
        log(ctx, t + failMs, 'warn', 'ai', 'ai.call', `${step.key}: ${step.model} failed (503); falling back to ${secondary}`, traceId, fid, runId, failMs, { model: step.model, ok: false, fallback: false, step: step.key, tokensIn: 0, tokensOut: 0, costUsd: 0 });
        t += failMs;
        extra = failMs;
      }
      const model = fellBack ? secondary : step.model;
      const callMs = Math.max(1, step.durationMs - 4);
      const fields = { model, ok: true, fallback: fellBack, step: step.key, tokensIn: step.tokensIn ?? 0, tokensOut: step.tokensOut ?? 0, costUsd: round6(step.costUsd ?? 0), promptVersion: run.promptVersion };
      const aid = hex(rng, 16);
      span(ctx, traceId, aid, sid, `ai.generate ${model}`, t, callMs, 'ok', fields);
      log(ctx, t + callMs, 'info', 'ai', 'ai.call', `${step.key}: ${model} ${fields.tokensIn}→${fields.tokensOut} tokens`, traceId, aid, runId, callMs, fields);
    }
    const stepMs = Math.max(1, step.durationMs + extra);
    const stepFailed = step.status === 'failed';
    span(ctx, traceId, sid, wfId, `step.${step.key}`, start, stepMs, stepFailed ? 'error' : 'ok', { step: step.key, attempt: 1, status: step.status });
    offset += extra;
    const done = start + stepMs;
    if (stepFailed) {
      log(ctx, done, 'error', 'workflow', 'step.failed', `${step.key} failed`, traceId, sid, runId, stepMs, { step: step.key });
      break;
    }
    log(ctx, done, step.status === 'warned' ? 'warn' : 'debug', 'workflow', 'step.finished', `${step.key} ${step.status === 'warned' ? 'finished with warnings' : 'ok'}`, traceId, sid, runId, stepMs, { step: step.key, status: step.status });
    if (step.key === 'ground' && run.grounding) {
      const g = run.grounding;
      const level = g.total > g.passed || g.dropped ? 'warn' : 'info';
      log(ctx, done, level, 'workflow', 'grounding.checked', `${g.passed} of ${g.total} quotes grounded${g.dropped ? `; ${g.dropped} insight${g.dropped === 1 ? '' : 's'} dropped` : ''}`, traceId, sid, runId, null, { passed: g.passed, total: g.total, dropped: g.dropped });
    }
    if (step.key === 'deliver') {
      for (const d of run.deliveryDetail) if (T(d.at) <= finished + 1_000) end = Math.max(end, deliverySpans(ctx, traceId, sid, runId, d, T, offset));
    }
  }
  const wfEnd = finished + offset;
  span(ctx, traceId, wfId, root, 'workflow signal-loop-pipeline', wfStart, wfEnd - wfStart, failed ? 'error' : 'ok', { runId, steps: run.steps.length, promptVersion: run.promptVersion });
  if (!failed) log(ctx, wfEnd, 'debug', 'budget', 'budget.check', `run cost $${run.costUsd.toFixed(4)} within per-run cap $${c.profile.perRunCapUsd.toFixed(2)}`, traceId, wfId, runId, null, { costUsd: round6(run.costUsd), capUsd: c.profile.perRunCapUsd });
  end = Math.max(end, wfEnd);
  const ins = run.insights;
  span(ctx, traceId, root, null, `run ${runId}`, at, end - at, failed ? 'error' : 'ok', { runId, outcome, costUsd: round6(run.costUsd), insights: ins.total });
  log(ctx, end, failed ? 'error' : 'info', 'workflow', 'run.finished', `${runId} ${failed ? 'failed' : outcome} · ${ins.total} insight${ins.total === 1 ? '' : 's'}`, traceId, root, runId, Math.round(end - at), { outcome, costUsd: round6(run.costUsd), ok: !failed, status: run.status, insights: ins.total, autoRoute: ins.autoRoute, review: ins.review, held: ins.held, dropped: ins.dropped });

  // Deliveries a reviewer's approval triggered later: their own short trace, when the review happened.
  const groups = new Map<string, BackfillDelivery[]>();
  for (const d of run.deliveryDetail) if (T(d.at) > finished + 1_000 && T(d.at) + (reviewShift.get(d.at) ?? 0) <= c.endMs) groups.set(d.at, [...(groups.get(d.at) ?? []), d]);
  for (const [atIso, ds] of groups) {
    const moved = reviewShift.get(atIso) ?? 0;
    const tId = hex(rng, 32);
    const rId = hex(rng, 16);
    const start = T(atIso) + moved - 40;
    let last = start + lognormal(rng, sim.latencyMs * 0.6, sim.latencySigma);
    for (const d of ds) last = Math.max(last, deliverySpans(ctx, tId, rId, runId, d, T, moved));
    span(ctx, tId, rId, null, 'POST /api/insights/review', start, last - start, 'ok', { 'http.status': 200, runId, deliveries: ds.length });
    log(ctx, last, 'info', 'api', 'http.request', 'POST /api/insights/review 200', tId, rId, runId, Math.round(last - start), { method: 'POST', route: 'POST /api/insights/review', status: 200 });
  }
  return { cost: run.costUsd, endAt: end };
}

/** One real delivery: a span per attempt, retry warnings, one delivery.sent (or .failed). Returns its end time. */
function deliverySpans(ctx: RunCtx, traceId: string, parent: string, runId: string, d: BackfillDelivery, T: Clock, offset: number): number {
  let end = T(d.at) + offset;
  d.attempts.forEach((a, i) => {
    const sid = hex(ctx.rng, 16);
    const start = T(a.at) + offset;
    const ms = a.ms ?? 150 + Math.round(ctx.rng.next() * 400);
    span(ctx, traceId, sid, parent, `delivery.${d.channel}`, start, ms, a.ok ? 'ok' : 'error', { channel: d.channel, destination: d.destination, attempt: i + 1, 'http.status': a.ok ? 201 : 503 });
    end = Math.max(end, start + ms);
    if (i < d.attempts.length - 1) {
      if (!a.ok) log(ctx, start + ms, 'warn', 'delivery', 'delivery.retry', `${d.channel}: ${a.note ?? 'attempt failed'}`, traceId, sid, runId, ms, { channel: d.channel, attempt: i + 1 });
      return;
    }
    const msg = a.ok ? `${d.channel}: delivered${d.receipt ? ` (${d.receipt})` : ''}` : `${d.channel}: ${a.note ?? 'failed'}`;
    log(ctx, start + ms, a.ok ? 'info' : 'error', 'delivery', a.ok ? 'delivery.sent' : 'delivery.failed', msg, traceId, sid, runId, ms, { channel: d.channel, ok: a.ok, attempts: d.attempts.length, destination: d.destination, receipt: d.receipt });
  });
  return end;
}

/** The planted incident's one failed run: primary 503s, the fallback times out, screen gives up. No spend. */
function traceIncidentFailure(ctx: RunCtx, profile: AgentProfile, at: number, runId: string, sessionId: string): { cost: number; endAt: number } {
  const { rng, sim, incident } = ctx;
  const primary = sim.models[0]![0];
  const secondary = sim.models[1]?.[0] ?? primary;
  const traceId = hex(rng, 32);
  const root = hex(rng, 16);
  const reqId = hex(rng, 16);
  const reqMs = lognormal(rng, sim.latencyMs, sim.latencySigma) * (incident?.latencyMult ?? 1);
  span(ctx, traceId, reqId, root, 'POST /api/runs', at, reqMs, 'ok', { 'http.status': 202, runId });
  log(ctx, at + reqMs, 'info', 'api', 'http.request', 'POST /api/runs 202', traceId, reqId, runId, Math.round(reqMs), { method: 'POST', route: 'POST /api/runs', status: 202, session: sessionId });
  const wfId = hex(rng, 16);
  let t = at + 5;
  for (const key of ['ingest', 'normalize', 'redact']) {
    const sid = hex(rng, 16);
    const ms = 1 + Math.round(rng.next() * 8);
    span(ctx, traceId, sid, wfId, `step.${key}`, t, ms, 'ok', { step: key, attempt: 1, status: 'passed' });
    log(ctx, t + ms, 'debug', 'workflow', 'step.finished', `${key} ok`, traceId, sid, runId, ms, { step: key, status: 'passed' });
    t += ms;
  }
  const sid = hex(rng, 16);
  const stepStart = t;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const model = attempt === 1 ? primary : secondary;
    const ms = Math.round(2_000 + rng.next() * 6_000);
    const aid = hex(rng, 16);
    span(ctx, traceId, aid, sid, `ai.generate ${model}`, t, ms, 'error', { model, step: 'screen', error: attempt === 1 ? '503 Service Unavailable' : 'timeout', retry: attempt - 1 });
    log(ctx, t + ms, 'warn', 'ai', 'ai.call', `screen: ${model} ${attempt === 1 ? `failed (503); falling back to ${secondary}` : 'timed out'}`, traceId, aid, runId, ms, { model, ok: false, fallback: attempt > 1, step: 'screen', tokensIn: 0, tokensOut: 0, costUsd: 0 });
    t += ms + 2_000;
  }
  span(ctx, traceId, sid, wfId, 'step.screen', stepStart, t - stepStart, 'error', { step: 'screen', attempt: 3, status: 'failed' });
  log(ctx, t, 'error', 'workflow', 'step.failed', `screen failed after 3 attempts (${incident?.note ?? 'provider errors'})`, traceId, sid, runId, Math.round(t - stepStart), { step: 'screen', attempts: 3 });
  span(ctx, traceId, wfId, root, 'workflow signal-loop-pipeline', at + 5, t - at - 5, 'error', { runId, steps: 10 });
  span(ctx, traceId, root, null, `run ${runId}`, at, t - at, 'error', { runId, outcome: 'failed', costUsd: 0 });
  log(ctx, t, 'error', 'workflow', 'run.finished', `${runId} failed`, traceId, root, runId, Math.round(t - at), { outcome: 'failed', costUsd: 0, ok: false, capUsd: profile.perRunCapUsd });
  return { cost: 0, endAt: t };
}

// ---------------------------------------------------------------- changelog

function changelogFor(agentId: string, shift: number): ChangeEntry[] {
  const at = (d: string) => shiftDate(d, shift);
  const rows: Omit<ChangeEntry, 'agentId'>[] =
    agentId === 'agt_signal_loop'
      ? [
          { id: 'chg_sl_01', at: at('2026-09-10T18:00:00.000Z'), kind: 'review', title: 'Security & data review approved', detail: 'Redaction before any model call; provider data collection denied; gate and signed-link access reviewed.', actor: 'Sofia Marino', ref: 'SEC-2026-031' },
          { id: 'chg_sl_02', at: at('2026-09-14T16:00:00.000Z'), kind: 'deploy', title: 'Shadow mode: 2 CSMs', detail: 'Runs on every call; nothing routes automatically. CSMs compare with their own notes.', actor: 'Hunter Borman', ref: 'v0.9.0' },
          { id: 'chg_sl_03', at: at('2026-09-21T17:30:00.000Z'), kind: 'prompt', title: 'Extract prompt v3 promoted', detail: 'Added counter-examples (a rep complaint is not a bug). Precision 0.89 → 0.93 on the golden set; recall unchanged.', actor: 'Hunter Borman', ref: 'eval_2026-09-21' },
          { id: 'chg_sl_04', at: at('2026-09-28T16:00:00.000Z'), kind: 'deploy', title: 'Champions rollout: 4 CSMs, 2 PMs', detail: 'Auto-routing on above 0.80 confidence; review queue for the rest.', actor: 'Hunter Borman', ref: 'v1.0.0' },
          { id: 'chg_sl_05', at: at('2026-10-05T20:10:00.000Z'), kind: 'threshold', title: 'Review threshold 0.60 → 0.55', detail: 'Weekly calibration: too many correct insights were held. Held-item precision 0.81 supported the change.', actor: 'Hunter Borman', ref: 'calib-w3' },
          { id: 'chg_sl_06', at: at('2026-10-12T17:00:00.000Z'), kind: 'review', title: 'Monthly agent review', detail: 'Standard 9/9. Actions: publish precision weekly to the CS channel; add Linear as a destination.', actor: 'Elena Vasquez', ref: null },
          { id: 'chg_sl_07', at: at('2026-10-13T18:40:00.000Z'), kind: 'incident', title: 'Primary model 503s; automatic fallback', detail: '16:05–18:30 UTC the primary provider returned 503s; 61% of calls fell back to the secondary model. Runs stayed within budget; 1 run failed after retries.', actor: 'Hunter Borman', ref: 'INC-0142' },
          { id: 'chg_sl_08', at: at('2026-10-15T19:00:00.000Z'), kind: 'rule', title: 'Routing: pricing objections > $250k ARR → VP Product', detail: 'Requested by Elena Vasquez after the Brightline renewal.', actor: 'Nina Patel', ref: 'rule_pricing_vp' },
          { id: 'chg_sl_09', at: at('2026-10-21T16:30:00.000Z'), kind: 'model', title: 'Primary model: deepseek/deepseek-v4.1-flash', detail: 'Speed test on 10 golden files: fastest at equal F1. Secondary stays anthropic/claude-haiku-5.5 (fallback + eval judge).', actor: 'Hunter Borman', ref: 'speed-test-2026-10-21' },
          { id: 'chg_sl_10', at: at('2026-10-22T15:00:00.000Z'), kind: 'prompt', title: 'Prompt v5 blocked by promotion gate', detail: 'Recall on level-5 (chaos) files fell 0.82 → 0.71. v4 stays in production.', actor: 'Eval gate', ref: 'eval_2026-10-22' },
        ]
      : [
          { id: 'chg_rfp_01', at: at('2026-08-12T17:00:00.000Z'), kind: 'review', title: 'Security & data review approved with conditions', detail: 'SOC 2 report read-only; no customer data in prompts; answers cite their source document.', actor: 'Sofia Marino', ref: 'SEC-2026-027' },
          { id: 'chg_rfp_02', at: at('2026-08-17T16:00:00.000Z'), kind: 'deploy', title: 'Pilot with the proposal manager', detail: 'One user, every draft reviewed line by line.', actor: 'Malik Johnson', ref: 'flow v9' },
          { id: 'chg_rfp_03', at: at('2026-09-19T18:00:00.000Z'), kind: 'review', title: 'Production readiness review: pilot → production', detail: '14 questionnaires in pilot; median first-draft time 3.5 days → 4 hours. Approved for the proposal team and solutions consultants.', actor: 'Chris Donovan', ref: 'flow v11' },
          { id: 'chg_rfp_04', at: at('2026-09-19T18:30:00.000Z'), kind: 'access', title: 'Access: proposal team + 2 solutions consultants', detail: 'Gumloop workspace role "runner"; Drive answer library read-only.', actor: 'Malik Johnson', ref: null },
          { id: 'chg_rfp_05', at: at('2026-10-01T17:00:00.000Z'), kind: 'prompt', title: 'Citation step added', detail: 'Every answer now links its source paragraph; uncited answers are flagged for the reviewer.', actor: 'Malik Johnson', ref: 'flow v12' },
          { id: 'chg_rfp_06', at: at('2026-10-22T13:05:00.000Z'), kind: 'incident', title: 'Answer library sync stale', detail: 'Drive connector token expired on 2026-10-13; drafts still cite the last good snapshot. Owner re-authorising.', actor: 'Malik Johnson', ref: 'alr_hist_rfp_library' },
        ];
  return rows.map((r) => ({ ...r, agentId }));
}

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/platform/simulate.ts');
if (isMain) {
  const endArg = process.argv.indexOf('--end');
  const backfill = loadBackfill();
  const sim = simulate({ end: endArg > 0 ? process.argv[endArg + 1] : undefined, backfill });
  const ids = sim.agents.map((a) => a.record.id);
  const by = <T extends { agentId: string }>(rows: T[]) => Object.fromEntries(ids.map((id) => [id, rows.filter((r) => r.agentId === id).length]));
  const sum = (id: string, f: (w: WorkUnit) => number) => sim.work.filter((w) => w.agentId === id).reduce((s, w) => s + f(w), 0);
  const impact = Object.fromEntries(
    ids.map((id) => {
      const outcomes: Record<string, number> = {};
      for (const w of sim.work) if (w.agentId === id) outcomes[w.outcome] = (outcomes[w.outcome] ?? 0) + 1;
      return [id, { aiCostUsd: round6(sum(id, (w) => w.aiCostUsd)), minutesSaved: sum(id, (w) => w.minutesSavedEstimate), humanMinutes: Math.round(sum(id, (w) => w.humanMinutesSpent) * 10) / 10, outcomes }];
    }),
  );
  const backfillSummary = backfill
    ? { runs: backfill.runs.length, costUsd: round6(backfill.runs.reduce((s, r) => s + r.costUsd, 0)), generatedAt: backfill.generatedAt, firstRun: backfill.runs[0]?.createdAt ?? null }
    : 'absent (simulated Signal Loop runs)';
  console.log(JSON.stringify({ window: sim.window, people: sim.people.length, events: by(sim.events), work: by(sim.work), logs: by(sim.logs), spans: by(sim.spans), impact, changelog: sim.changelog.length, alerts: sim.alerts.length, backfill: backfillSummary }, null, 2));
}
