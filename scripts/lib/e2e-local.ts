/**
 * End-to-end smoke against a running `wrangler dev` (default http://127.0.0.1:8797), with the
 * password cookie: live run on C-1042 → poll to completion → approve a review item → ship the
 * ticket → see the CSM notification; plus a replay run, themes, evals, health.
 *   node scripts/lib/e2e-local.ts [baseUrl]
 */
import { passwordToken, signWorkspace } from '../../src/worker/gate.ts';
import { loadEnv } from '../env.ts';

const env = loadEnv();
const base = `${process.argv[2] ?? 'http://127.0.0.1:8797'}/repo/invoca/api`;
const ws = `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const cookie = `hb_invoca=${await passwordToken(env.INVOCA_PASSWORD!)}; sl_ws=${await signWorkspace(ws, env.LINK_SIGNING_SECRET)}`;

async function call(path: string, init: { method?: string; json?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { method: init.method ?? 'GET', headers: { cookie, 'x-signal-loop': '1', ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) }, body: init.json === undefined ? undefined : JSON.stringify(init.json) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}
async function poll(runId: string, until: (d: any) => boolean, timeoutMs = 40_000): Promise<any> {
  const t0 = Date.now();
  for (;;) {
    const r = await call(`/runs/${runId}`);
    if (r.status === 200 && until(r.body.data)) return r.body.data;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${runId}: ${JSON.stringify(r.body?.data?.run)}`);
    await new Promise((res) => setTimeout(res, 400));
  }
}

const session = await call('/session');
check(session.status === 200 && session.body.data.workspaceId === ws, `session for ${ws}`);
const lib = await call('/library');
check(lib.body.data.length === 48, `library lists ${lib.body.data.length} featured files`);
const themes0 = await call('/themes');
check(themes0.body.data.length > 10, `${themes0.body.data.length} seeded themes; top: "${themes0.body.data[0].name}" (${themes0.body.data[0].insightCount} insights, ${themes0.body.data[0].accountCount} accounts)`);
const evals = await call('/evals');
check(evals.status === 200 && evals.body.data.candidate.promoted === false, `evals: ${evals.body.data.latest.promptVersion} promoted, candidate ${evals.body.data.candidate.promptVersion} blocked (${evals.body.data.candidate.blockedReasons[0]})`);

// Live run
const t0 = Date.now();
const created = await call('/runs', { method: 'POST', json: { fileId: 'file_c1042' } });
check(created.status === 201, `POST /runs → ${created.body.data.mode} ${created.body.data.runId}`);
const d = await poll(created.body.data.runId, (x) => !['queued', 'running'].includes(x.run.status));
check(d.run.mode === 'live' || d.run.modeReason === 'live_failed', `run finished ${d.run.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s (mode ${d.run.mode})`);
for (const s of d.steps) console.log(`   ${s.key.padEnd(10)} ${s.status.padEnd(8)} ${String(s.durationMs).padStart(5)}ms  ${s.summary}`);
check(d.steps.length === 10 && d.steps.every((s: any) => s.status !== 'failed'), 'all 10 steps without failure');
console.log(`   insights: ${d.insights.map((i: any) => `${i.type}/${i.gate}${i.themeId ? '+theme' : ''}`).join(', ')}`);

const pending = (await call('/review')).body.data.filter((i: any) => i.runId === d.run.id);
check(pending.length > 0, `${pending.length} item(s) waiting for review`);
const rev = await call(`/review/${pending[0].id}`, { method: 'POST', json: { idempotencyKey: crypto.randomUUID(), action: 'approve', dwellMs: 20000 } });
check(rev.status === 200 && rev.body.data.delivery, `approved → ${rev.body.data.delivery.channel} ${rev.body.data.delivery.receipt}`);
const ticket = (await call('/deliveries')).body.data.find((x: any) => x.workspaceId === ws && x.ticketState === 'open');
if (ticket) {
  const shipped = await call(`/deliveries/${ticket.id}/ticket`, { method: 'POST', json: { state: 'shipped' } });
  check(shipped.status === 200 && shipped.body.data.notification?.kind === 'shipped', `ticket ${ticket.receipt} shipped → CSM notified: "${shipped.body.data.notification.title}"`);
} else {
  console.log('   (no Jira/Linear ticket in this run to ship)');
}
const notes = await call('/notifications');
check(notes.body.data.some((n: any) => n.workspaceId === ws), `${notes.body.data.filter((n: any) => n.workspaceId === ws).length} notification(s) in this workspace`);

// Replay run (explicit) reveals progressively
const rep = await call('/runs', { method: 'POST', json: { fileId: 'file_meridian_phi_call', mode: 'replay' } });
const early = (await call(`/runs/${rep.body.data.runId}`)).body.data;
check(early.run.status === 'running', `replay ${rep.body.data.runId} starts as running (${early.steps.filter((s: any) => s.status === 'pending').length} steps pending)`);
const done = await poll(rep.body.data.runId, (x) => x.run.status !== 'running');
check(done.steps.every((s: any) => s.finishedAt), `replay completed: ${done.run.status}, ${done.insights.length} insights, redactions ${done.redactions.map((r: any) => r.token).join(' ')}`);
const dup = await call('/runs', { method: 'POST', json: { fileId: 'file_c1042_duplicate' } });
check(dup.body.data.duplicate === true && dup.body.data.runId === d.run.id, 'duplicate upload returns the existing run');
const health = await call('/health');
check(health.body.data.budget.spentUsd > 0, `health: spent $${health.body.data.budget.spentUsd} of $${health.body.data.budget.limitUsd}; ${health.body.data.ledger.length} days in ledger`);
await call('/workspace/reset', { method: 'POST', json: {} });
console.log('e2e ok');
