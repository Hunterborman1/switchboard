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
 * Signal Loop hook: if data/backfill/ exists (real pipeline runs over synthetic transcripts,
 * produced by the backend), `loadBackfill()` is where those runs replace the simulated Signal
 * Loop runs. Rows stay source 'simulated' either way, because the users are synthetic. Only
 * telemetry that arrives through the SDK at runtime is 'live'.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRng, type Rng } from '../data/lib/rng.ts';
import { addDays, daysBetween, isoDay, weekdayIndex } from '../../src/worker/platform/math.ts';
import type { AgentRecord, Alert, ChangeEntry, LogEntry, Span, UsageEvent, UsageKind, WorkUnit } from '../../src/shared/platform-contracts.ts';
import type { AgentProfile } from '../../src/worker/platform/types.ts';

const ROOT = new URL('../../', import.meta.url);
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

export function loadPeople(): Person[] {
  const own = readJson<{ departmentMap: Record<string, string>; people: Person[]; worldUsers: string[] }>('data/platform/people.json');
  const world = readJson<{ id: string; name: string; role: string; title: string }[]>('data/world/people.json');
  const depts = readJson<{ personId: string; department: string }[]>('data/world/departments.json');
  const fromWorld: Person[] = own.worldUsers.flatMap((id) => {
    const w = world.find((p) => p.id === id);
    if (!w) return [];
    const d = depts.find((x) => x.personId === id)?.department ?? 'Operations';
    return [{ id: w.id, name: w.name, role: w.role, title: w.title, department: own.departmentMap[d] ?? d }];
  });
  return [...own.people, ...fromWorld];
}

/** Real Signal Loop runs from the backend's backfill, if present (hook; see file header). */
export function loadBackfill(): unknown[] | null {
  const dir = new URL('data/backfill/', ROOT);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.length ? files : null;
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

export function simulate(opts: { end?: string; seed?: string } = {}): SimOutput {
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
    generateAgent(rng.fork(r.id), r, profile, a.sim, days, shift, person, out, endMs);
    out.changelog.push(...changelogFor(r.id, shift));
  }
  for (const al of seed.alerts) out.alerts.push({ ...al, at: shiftDate(al.at, shift), resolvedAt: al.resolvedAt ? shiftDate(al.resolvedAt, shift) : null });
  out.events.sort((x, y) => x.at.localeCompare(y.at));
  out.logs.sort((x, y) => x.at.localeCompare(y.at));
  out.work.sort((x, y) => x.at.localeCompare(y.at));
  return out;
}

type RunCtx = { rng: Rng; agent: AgentRecord; sim: SimParams; out: SimOutput; incident: SimParams['incidents'][number] | null };

function generateAgent(rng: Rng, agent: AgentRecord, profile: AgentProfile, sim: SimParams, days: string[], shift: number, person: Map<string, Person>, out: SimOutput, endMs: number) {
  const short = agent.id.replace(/^agt_/, '').split('_').map((w) => w[0]).join('');
  let seq = 0;
  const adoptStart = Date.parse(shiftDate(sim.adoption.start, shift));
  const pilotUntil = sim.pilotUntil ? Date.parse(shiftDate(sim.pilotUntil, shift)) : 0;
  const incidents = sim.incidents.map((i) => ({ ...i, start: shiftDate(i.start, shift), end: shiftDate(i.end, shift) }));
  const users = sim.pool.ids.map((id, idx) => ({ id, adoptedAt: adoptStart + (sim.adoption.rampDays * 86_400_000 * idx) / Math.max(1, sim.pool.ids.length), engagement: 0.75 + rng.next() * 0.5 }));

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
  const sim = simulate({ end: endArg > 0 ? process.argv[endArg + 1] : undefined });
  const by = <T extends { agentId: string }>(rows: T[]) => Object.fromEntries(sim.agents.map((a) => [a.record.id, rows.filter((r) => r.agentId === a.record.id).length]));
  console.log(JSON.stringify({ window: sim.window, people: sim.people.length, events: by(sim.events), work: by(sim.work), logs: by(sim.logs), spans: by(sim.spans), changelog: sim.changelog.length, alerts: sim.alerts.length, backfill: loadBackfill() ? 'present' : 'absent (simulated Signal Loop runs)' }, null, 2));
}
