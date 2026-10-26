/**
 * End-to-end smoke against a running `wrangler dev` (default http://127.0.0.1:8797), with the
 * password cookie: live run on C-1042 → poll to completion → approve a review item → ship the
 * ticket → see the CSM notification; plus a replay run, themes, evals, health. Then Switchboard:
 * a long pasted document (three library files) extracted in parallel parts; Jira disconnected
 * (its rules go to triage, with the reason) and reconnected; a person added, made a rule's
 * owner, and tagged on the delivery by their Jira identity. Live runs spend from the key in
 * .dev.vars (the build key locally).
 *   node scripts/lib/e2e-local.ts [baseUrl]
 */
import { existsSync, readFileSync } from 'node:fs';
import { passwordToken, signWorkspace } from '../../src/worker/gate.ts';
import { loadEnv } from '../env.ts';

// `wrangler dev` reads its secrets from .dev.vars, which may differ from .env (a worktree's own).
const devVarsPath = new URL('../../.dev.vars', import.meta.url);
const devVars = existsSync(devVarsPath) ? Object.fromEntries(readFileSync(devVarsPath, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1]!, m[2]!.trim()])) : {};
const env = { ...loadEnv(), ...devVars };
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
const sessionOk = session.status === 200 && session.body.data.workspaceId === ws;
// A different workspace back means the cookie's signature did not verify (check LINK_SIGNING_SECRET).
check(sessionOk, `session for ${ws}${sessionOk ? '' : ` (got ${session.status}, workspace ${session.body?.data?.workspaceId})`}`);
const spentStart = Number(session.body.data.budget.spentUsd);
check(!!session.body.data.models.decision && !!session.body.data.actor, `decision model ${session.body.data.models.decision}; acting as ${session.body.data.actor?.name}`);
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
const screen = d.steps.find((s: any) => s.key === 'screen');
const score = d.steps.find((s: any) => s.key === 'score');
check(screen.detail.tier === 'decision' && !!screen.detail.docKind, `triage on the ${screen.model === session.body.data.models.decision ? 'decision' : 'main (fallback)'} model: "${screen.summary}"`);
check(!!score.detail.secondOpinion, `score: "${score.summary}"`);

// ---- Switchboard: a long document is extracted in parallel parts
const parts = await Promise.all(['file_frontier_qbr_asr', 'file_c1042', 'file_prairielink_qbr'].map(async (id) => (await call(`/library/${id}`)).body.data.content as string));
const longText = parts.map((p, i) => `===== Document ${i + 1} =====\n${p}`).join('\n\n');
const t1 = Date.now();
const long = await call('/runs', { method: 'POST', json: { text: longText, filename: 'three-calls.txt', source: 'upload', sourceFormat: 'txt' } });
check(long.status === 201, `long document (${longText.length.toLocaleString()} chars) → ${long.body.data.runId}`);
const ld = await poll(long.body.data.runId, (x) => !['queued', 'running'].includes(x.run.status), 120_000);
const lx = ld.steps.find((s: any) => s.key === 'extract');
check(ld.run.status !== 'failed' && Number(lx.detail.chunks) > 1, `chunked extraction: ${lx.detail.chunks} parts, ${lx.detail.duplicatesMerged} repeat(s) merged, ${lx.detail.count} insights in ${((Date.now() - t1) / 1000).toFixed(1)}s ("${lx.summary}")`);
check(ld.insights.length > 0 && ld.insights.filter((i: any) => i.gate !== 'dropped').every((i: any) => i.evidence.some((e: any) => e.method !== 'failed')), `${ld.insights.length} insights, every kept one grounded in the full document`);

// ---- Switchboard: a disconnected connector sends its rules to triage
const BUG = (n: number) => `Call notes ${n} with Brightline Home Services (${crypto.randomUUID().slice(0, 8)}).\nDana (Brightline): Our offline conversions are landing in Google Ads three days late now, and Smart Bidding is going sideways. This used to upload the same day, so something broke in the Google Ads integration.\nMarcus (Invoca CSM): That is a bug on our side. I will get it to the integrations team today.`;
const off = await call('/connections/jira', { method: 'PUT', json: { action: 'disconnect' } });
check(off.status === 200 && off.body.data.status === 'disconnected', 'Jira disconnected');
const r1 = await call('/runs', { method: 'POST', json: { text: BUG(1), filename: 'jira-off.txt' } });
const d1 = await poll(r1.body.data.runId, (x) => !['queued', 'running'].includes(x.run.status), 60_000);
const rd1 = d1.steps.find((s: any) => s.key === 'route');
const toTriage = (rd1.detail.decisions ?? []).filter((x: any) => /^Jira isn't connected/.test(x.reason));
check(toTriage.length > 0 && toTriage.every((x: any) => x.channel === 'triage'), `with Jira off: ${toTriage.length} insight(s) to triage · "${toTriage[0]?.reason}"`);
const on = await call('/connections/jira', { method: 'PUT', json: { action: 'connect' } });
check(on.body.data.status === 'connected' && on.body.data.account === 'invoca.atlassian.net', 'Jira reconnected');

// ---- Switchboard: a new person owns a rule and is tagged by their Jira identity
const jo = await call('/people', { method: 'POST', json: { name: 'Jo Doe', title: 'Senior PM, Integrations', role: 'pm', productArea: 'integrations', email: `jo.doe.${ws.slice(3, 9)}@invoca.example`, identities: { jira: 'jdoe' } } });
check(jo.status === 201, `added ${jo.body.data.name} (${jo.body.data.id})`);
const rules = (await call('/routing/rules')).body.data;
// Every Jira bug rule, so whatever area and severity the model picks, Jo owns it.
const jiraRules = rules.filter((x: any) => x.enabled && x.channel === 'jira');
for (const r of jiraRules) await call(`/routing/rules/${r.id}`, { method: 'PUT', json: { ...r, ownerId: jo.body.data.id } });
check((await call('/routing/rules')).body.data.filter((x: any) => x.channel === 'jira').every((x: any) => x.ownerId === jo.body.data.id), `${jiraRules.length} Jira rules now owned by Jo Doe`);
const r2 = await call('/runs', { method: 'POST', json: { text: BUG(2), filename: 'jira-on.txt' } });
const d2 = await poll(r2.body.data.runId, (x) => !['queued', 'running'].includes(x.run.status), 60_000);
// High and critical bugs wait for a person: approve them, as a reviewer would.
for (const i of d2.insights.filter((x: any) => x.status === 'pending_review' && x.ownerId === jo.body.data.id)) await call(`/review/${i.id}`, { method: 'POST', json: { idempotencyKey: crypto.randomUUID(), action: 'approve' } });
const mine = (await call('/deliveries')).body.data.filter((x: any) => x.workspaceId === ws && x.ownerId === jo.body.data.id);
const tag = mine.flatMap((x: any) => x.mentions ?? []).find((m: any) => m.personId === jo.body.data.id);
check(!!tag && tag.handle === 'jdoe' && tag.role === 'owner', `delivered ${mine.map((x: any) => `${x.channel} ${x.receipt}`).join(', ')} · tagged ${mine[0]?.mentions?.map((m: any) => `${m.handle} (${m.role})`).join(', ')}`);
const ov = (await call('/overview?days=30')).body.data;
check(ov.conversations > 0 && ov.connectedCount === 6, `overview: ${ov.conversations} conversations, ${ov.deliveries} deliveries, ${ov.peopleTagged} people tagged, median ${ov.medianMinutesToOwner} min to owner`);
const spent = (await call('/session')).body.data.budget.spentUsd;
console.log(`   live AI spend in this e2e run: $${(Number(spent) - spentStart).toFixed(4)} (ledger total $${spent})`);
await call('/workspace/reset', { method: 'POST', json: {} });
console.log('e2e ok');
