/**
 * Backfill: run the ~220 non-featured library files through the real pipeline (build key) in
 * date order, so seeded history — runs, insights, themes (named by the theme prompt),
 * deliveries, notifications, AI ledger — all comes from real runs. Then simulate the human side
 * deterministically: older review items get approved / edited / rejected by their CSM, and some
 * tickets move to in progress or shipped (closing the loop with a CSM notification).
 *
 *   node --env-file=.env scripts/backfill.ts [--limit 20] [--concurrency 6]
 *
 * Writes data/backfill/history.json (seed payload) and data/backfill/runs.json (compact run
 * history for the Agent Ops platform).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Delivery, Insight, Notification, ReviewRecord, RunStep } from '../src/shared/contracts.ts';
import { PROMPT_VERSION } from '../src/shared/prompts/extract.ts';
import { deliverInsight, routedNotification, shippedNotification } from '../src/pipeline/deliver.ts';
import { runPatch } from '../src/pipeline/run.ts';
import { routeInsight } from '../src/pipeline/route.ts';
import type { LlmCallRow, NewTheme } from '../src/pipeline/types.ts';
import { fnv1a, randomId } from '../src/pipeline/util.ts';
import { loadEnv } from './env.ts';
import { pool, runFile, themeIndex, type FileRun } from './lib/core.ts';
import { DATA, dataReady, loadLibrary, loadWorld } from './lib/data.ts';
import { cloudflareEmbedder } from './lib/embed.ts';
import { buildLlm, buildSpend } from './lib/llm.ts';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = loadEnv();
const world = loadWorld();
let files = loadLibrary().filter((f) => !f.featured).sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt) || a.id.localeCompare(b.id));
if (arg('--limit')) files = files.slice(0, Number(arg('--limit')));
console.log(`[backfill] ${files.length} files · data READY=${dataReady()} · world=${world.source}`);
if (!files.length) {
  console.log('[backfill] nothing to do (no non-featured library files)');
  process.exit(0);
}

const calls: LlmCallRow[] = [];
const llm = buildLlm({ tag: 'backfill', onCall: (r) => void calls.push(r) });
const embed = cloudflareEmbedder(env, { allowFallback: false });
const index = themeIndex();
const spend0 = buildSpend();
let done = 0;

const runs: FileRun[] = await pool(files, Number(arg('--concurrency') ?? 6), async (file) => {
  // Calls happen during working hours on the file's date.
  const start = Date.parse(file.modifiedAt);
  const r = await runFile({ file, world, llm, embed, index, addThemesToIndex: true, workspaceId: 'seed', promptVersion: PROMPT_VERSION, startAt: start });
  done++;
  if (done % 10 === 0 || r.result.status === 'failed') console.log(`[backfill] ${done}/${files.length} · ${file.id} ${r.result.status}${r.result.error ? ` (${r.result.error})` : ''} · $${(buildSpend() - spend0).toFixed(4)}`);
  return r;
});

// ------------------------------------------------------------------ collect
const latest = Math.max(...runs.map((r) => Date.parse(r.result.steps[r.result.steps.length - 1]?.finishedAt ?? r.file.modifiedAt)));
const insights = new Map<string, Insight>();
const deliveries: Delivery[] = [];
const notifications: Notification[] = [];
const reviews: ReviewRecord[] = [];
const steps: RunStep[] = [];
const runRows: Record<string, unknown>[] = [];
const transcripts: { runId: string; format: string; turns: unknown; redactions: unknown }[] = [];
const offsetByRun = new Map(runs.map((r) => [r.runId, r.offsetMs]));

for (const r of runs) {
  for (const i of r.result.insights) insights.set(i.id, i);
  deliveries.push(...r.result.deliveries);
  notifications.push(...r.result.notifications);
  steps.push(...r.result.steps);
  const t = r.state.transcripts.get(r.runId);
  if (t) transcripts.push({ runId: r.runId, format: t.format, turns: t.doc.turns, redactions: t.doc.redactions });
  const first = r.result.steps[0]?.startedAt ?? r.file.modifiedAt;
  const last = r.result.steps[r.result.steps.length - 1]?.finishedAt ?? first;
  runRows.push({
    id: r.runId, workspaceId: 'seed', fileId: r.file.id, filename: r.file.filename, accountId: r.file.accountId, callId: r.file.callId, mode: 'live', modeReason: 'seed',
    sha256: r.result.sha256, createdAt: first, promptVersion: PROMPT_VERSION, format: r.result.format, screen: r.result.screen, ...runPatch(r.result, last),
  });
}

// ------------------------------------------------------------------ simulate the humans
const person = (id: string | null) => world.people.find((p) => p.id === id) ?? null;
const accountOf = (id: string | null) => world.accounts.find((a) => a.id === id) ?? null;
const DAY = 86_400_000;
const pendingRecent: string[] = [];
for (const ins of [...insights.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
  if (ins.status !== 'pending_review') continue;
  const age = latest - Date.parse(ins.createdAt);
  if (age < 2 * DAY) {
    pendingRecent.push(ins.id);
    continue;
  }
  const h = fnv1a(`review:${ins.id}`);
  const reviewedAt = Date.parse(ins.createdAt) + (2 + (h % 26)) * 3_600_000;
  const reviewer = person(ins.csmId)?.name ?? 'CSM';
  const before = { type: ins.type, summary: ins.summary, productArea: ins.productArea, severity: ins.severity, status: ins.status, ownerId: ins.ownerId, channel: ins.channel };
  const action: ReviewRecord['action'] = h % 10 === 0 ? 'reject' : h % 10 === 1 ? 'edit' : 'approve';
  let updated: Insight = { ...ins };
  if (action === 'reject') {
    updated = { ...updated, status: 'rejected', gateReasons: [...ins.gateReasons, 'rejected by reviewer: not actionable'] };
  } else {
    if (action === 'edit') updated = { ...updated, severity: ins.severity === 'low' ? 'medium' : ins.severity === 'medium' ? 'high' : ins.severity };
    const acct = accountOf(ins.accountId);
    const d = routeInsight({ type: updated.type, productArea: updated.productArea, severity: updated.severity, arrBand: acct?.arrBand ?? null }, world.rules, world.people);
    updated = { ...updated, status: 'routed', ownerId: d.ownerId, channel: d.channel, ruleId: d.ruleId, gateReasons: [...ins.gateReasons, action === 'edit' ? 'edited and approved by reviewer' : 'approved by reviewer'] };
    const ctx = { account: acct, owner: person(d.ownerId), csm: person(updated.csmId), now: reviewedAt, ids: randomId };
    const dl = deliverInsight(updated, d, ctx);
    deliveries.push(dl);
    const n = routedNotification(updated, dl, ctx);
    if (n) notifications.push({ ...n, read: true });
  }
  insights.set(ins.id, updated);
  reviews.push({ id: randomId('rev'), workspaceId: 'seed', insightId: ins.id, action, before, after: { type: updated.type, summary: updated.summary, productArea: updated.productArea, severity: updated.severity, status: updated.status, ownerId: updated.ownerId, channel: updated.channel }, reason: action === 'reject' ? 'not actionable' : null, reviewer, createdAt: new Date(reviewedAt).toISOString() });
}
// Keep only a handful of recent items pending so the viewer's queue stays focused.
for (const id of pendingRecent.slice(0, Math.max(0, pendingRecent.length - 4))) {
  const ins = insights.get(id)!;
  insights.set(id, { ...ins, status: 'held', gateReasons: [...ins.gateReasons, 'parked by reviewer for next calibration'] });
}
// Ticket lifecycle.
for (const d of deliveries) {
  if (d.ticketState === null) continue;
  const age = latest - Date.parse(d.createdAt);
  const h = fnv1a(`ticket:${d.id}`);
  if (age > 18 * DAY && h % 4 === 0) {
    d.ticketState = 'shipped';
    const ins = insights.get(d.insightId);
    if (ins) {
      const at = Date.parse(d.createdAt) + (9 + (h % 8)) * DAY;
      const n = shippedNotification(ins, d, { account: accountOf(ins.accountId), csm: person(ins.csmId), owner: person(d.ownerId), now: Math.min(at, latest), ids: randomId });
      if (n) notifications.push({ ...n, read: h % 3 === 0 });
    }
  } else if (age > 6 * DAY && h % 3 === 0) {
    d.ticketState = 'in_progress';
  } else if (age > 10 * DAY && h % 11 === 0) {
    d.ticketState = 'wont_do';
  }
}
// Mark older routed notifications read.
for (const n of notifications) if (latest - Date.parse(n.createdAt) > 3 * DAY && n.kind === 'routed') n.read = true;
// Run review counts after the simulation.
for (const row of runRows) {
  const mine = [...insights.values()].filter((i) => i.runId === row.id);
  const pending = mine.filter((i) => i.status === 'pending_review').length;
  row.reviewCount = pending;
  if (row.status === 'awaiting_review' && !pending) row.status = 'completed';
}

// AI ledger, shifted to each run's simulated time.
const aiCalls = calls.map((c) => ({ ...c, createdAt: new Date(Date.parse(c.createdAt) + (c.runId ? offsetByRun.get(c.runId) ?? 0 : 0)).toISOString() }));
const themes: NewTheme[] = [...index.themes.values()].map((t) => ({ ...t, vector: t.vector.map((x) => Math.round(x * 1e5) / 1e5) }));

const outDir = join(DATA, 'backfill');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'history.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, runs: runRows, steps, transcripts, insights: [...insights.values()], themes, deliveries, notifications, reviews, aiCalls }),
);
// Compact run history for the Agent Ops platform (derived from these real runs).
writeFileSync(
  join(outDir, 'runs.json'),
  JSON.stringify(
    runRows.map((row) => {
      const id = String(row.id);
      const mine = [...insights.values()].filter((i) => i.runId === id);
      const myCalls = aiCalls.filter((c) => c.runId === id);
      return {
        runId: id, fileId: row.fileId, accountId: row.accountId, csmId: accountOf(row.accountId as string | null)?.csmId ?? null, createdAt: row.createdAt, finishedAt: row.finishedAt,
        durationMs: row.durationMs, costUsd: row.costUsd, status: row.status, promptVersion: PROMPT_VERSION,
        steps: steps.filter((s) => s.runId === id).map((s) => ({ key: s.key, status: s.status, startedAt: s.startedAt, durationMs: s.durationMs, model: s.model, tokensIn: s.tokensIn, tokensOut: s.tokensOut, costUsd: s.costUsd })),
        insights: { total: mine.length, autoRoute: mine.filter((i) => i.gate === 'auto_route').length, review: mine.filter((i) => i.gate === 'review').length, held: mine.filter((i) => i.gate === 'held').length, dropped: mine.filter((i) => i.gate === 'dropped').length, byType: Object.fromEntries([...new Set(mine.map((i) => i.type))].map((t) => [t, mine.filter((i) => i.type === t).length])) },
        reviews: reviews.filter((rv) => mine.some((i) => i.id === rv.insightId)).map((rv) => ({ action: rv.action, reviewer: rv.reviewer, at: rv.createdAt })),
        deliveries: deliveries.filter((d) => mine.some((i) => i.id === d.insightId)).map((d) => ({ channel: d.channel, ticketState: d.ticketState, attempts: d.attempts.length, at: d.createdAt })),
        aiCalls: myCalls.length, fallbacks: myCalls.filter((c) => c.fallback).length, schemaRetries: myCalls.filter((c) => c.schemaRetry).length,
        models: [...new Set(myCalls.map((c) => c.model))],
      };
    }),
  ),
);
const failed = runRows.filter((r) => r.status === 'failed').length;
console.log(`[backfill] wrote data/backfill/{history,runs}.json · ${runRows.length} runs (${failed} failed) · ${insights.size} insights · ${themes.length} themes · ${deliveries.length} deliveries · ${reviews.length} reviews · spend $${(buildSpend() - spend0).toFixed(4)} · build total $${buildSpend().toFixed(4)}`);
