/**
 * Human in the loop: approve / edit / reject a pending insight, synchronously. Approve and edit
 * route and deliver right away; every action is stored as a ReviewRecord with a before/after
 * diff (labelled data for evals) and is idempotent by idempotencyKey. Ticket state changes close
 * the loop back to the CSM.
 */
import type { Delivery, Insight, Notification, ReviewAction, ReviewRecord } from '../shared/contracts.ts';
import { deliverInsight, routedNotification, shippedNotification } from '../pipeline/deliver.ts';
import { routeInsight } from '../pipeline/route.ts';
import { randomId } from '../pipeline/util.ts';
import { audit, getInsight, getRunRow, j, notificationStatement, nowIso, queryDeliveries, queryInsights, writeDelivery, writeInsight } from './db.ts';
import type { Env } from './env.ts';
import { loadContext } from './runs.ts';
import { deliveryTelemetry, type TraceCtx } from './telemetry.ts';

export type ReviewResult = { ok: true; body: { insight: Insight; delivery: Delivery | null }; replayed: boolean; outcome: 'accepted' | 'edited' | 'rejected' } | { ok: false; status: 404 | 409; code: string; message: string };

const pick = (i: Insight) => ({ type: i.type, summary: i.summary, productArea: i.productArea, severity: i.severity, status: i.status, ownerId: i.ownerId, channel: i.channel });

export async function applyReview(env: Env, ws: string, insightId: string, action: ReviewAction, reviewer: string, trace: TraceCtx): Promise<ReviewResult> {
  const db = env.DB;
  const prior = await db.prepare('SELECT response FROM reviews WHERE workspace_id = ? AND idempotency_key = ?').bind(ws, action.idempotencyKey).first<{ response: string | null }>();
  if (prior?.response) {
    const body = j<{ insight: Insight; delivery: Delivery | null }>(prior.response, { insight: null as unknown as Insight, delivery: null });
    return { ok: true, body, replayed: true, outcome: action.action === 'approve' ? 'accepted' : action.action === 'edit' ? 'edited' : 'rejected' };
  }
  const insight = await getInsight(db, ws, insightId);
  if (!insight || Date.parse(insight.createdAt) > Date.now()) return { ok: false, status: 404, code: 'not_found', message: 'No such insight' };
  if (insight.status !== 'pending_review') return { ok: false, status: 409, code: 'not_pending', message: `This insight is ${insight.status.replace('_', ' ')}, not waiting for review` };

  const now = Date.now();
  const before = pick(insight);
  let updated: Insight = { ...insight };
  let delivery: Delivery | null = null;
  let notification: Notification | null = null;

  if (action.action === 'reject') {
    updated = { ...updated, status: 'rejected', gateReasons: [...insight.gateReasons, `rejected by reviewer${action.reason ? `: ${action.reason}` : ''}`] };
  } else {
    if (action.action === 'edit' && action.edits) {
      updated = { ...updated, ...Object.fromEntries(Object.entries(action.edits).filter(([, v]) => v !== undefined)) } as Insight;
    }
    const ctx = await loadContext(env, ws, insight.accountId);
    const decision = routeInsight({ type: updated.type, productArea: updated.productArea, severity: updated.severity, arrBand: ctx.account?.arrBand ?? null }, ctx.rules, ctx.people);
    updated = {
      ...updated,
      status: 'routed',
      ownerId: decision.ownerId,
      channel: decision.channel,
      ruleId: decision.ruleId,
      gateReasons: [...insight.gateReasons, action.action === 'edit' ? 'edited and approved by reviewer' : 'approved by reviewer'],
    };
    const dctx = { account: ctx.account, owner: ctx.people.find((p) => p.id === decision.ownerId) ?? null, csm: ctx.people.find((p) => p.id === updated.csmId) ?? null, now, ids: randomId };
    // Deliveries created by a review belong to the reviewer's workspace.
    delivery = deliverInsight({ ...updated, workspaceId: ws }, decision, dctx);
    const n = routedNotification({ ...updated, workspaceId: ws }, delivery, dctx);
    notification = n;
    deliveryTelemetry(trace, delivery);
  }

  const record: ReviewRecord = {
    id: randomId('rev'), workspaceId: ws, insightId, action: action.action, before, after: pick(updated), reason: action.reason ?? null, reviewer, createdAt: new Date(now).toISOString(),
  };
  const body = { insight: updated, delivery };
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO reviews (id, workspace_id, insight_id, idempotency_key, created_at, data, response) VALUES (?,?,?,?,?,?,?)').bind(record.id, ws, insightId, action.idempotencyKey, record.createdAt, JSON.stringify(record), JSON.stringify(body)),
    writeInsight(db, ws, updated),
  ];
  if (delivery) stmts.push(writeDelivery(db, ws, delivery));
  if (notification) stmts.push(notificationStatement(db, notification));
  try {
    await db.batch(stmts);
  } catch (err) {
    // A concurrent request with the same idempotency key won the race: return its response.
    if (/UNIQUE/i.test(String(err))) return applyReview(env, ws, insightId, action, reviewer, trace);
    throw err;
  }
  await audit(db, { workspaceId: ws, actor: reviewer, action: `review.${action.action}`, target: insightId, before, after: pick(updated) });

  // Close out the run when nothing is left to review (own runs only).
  const run = await getRunRow(db, insight.runId);
  if (run && run.workspaceId === ws) {
    const rest = (await queryInsights(db, ws, 'run_id = ?', [run.id])).filter((i) => i.runId === run.id);
    const pending = rest.filter((i) => i.status === 'pending_review').length;
    await db.prepare('UPDATE runs SET review_count = ?, status = CASE WHEN ? = 0 AND status = \'awaiting_review\' THEN \'completed\' ELSE status END WHERE id = ?').bind(pending, pending, run.id).run();
  }
  return { ok: true, body, replayed: false, outcome: action.action === 'approve' ? 'accepted' : action.action === 'edit' ? 'edited' : 'rejected' };
}

export type TicketState = NonNullable<Delivery['ticketState']>;

export async function changeTicket(env: Env, ws: string, deliveryId: string, state: TicketState, actor: string): Promise<{ ok: true; delivery: Delivery; notification: Notification | null } | { ok: false; status: 404 | 409; code: string; message: string }> {
  const db = env.DB;
  const found = (await queryDeliveries(db, ws, 'id = ?', [deliveryId]))[0];
  if (!found || Date.parse(found.createdAt) > Date.now()) return { ok: false, status: 404, code: 'not_found', message: 'No such delivery' };
  if (found.ticketState === null) return { ok: false, status: 409, code: 'not_a_ticket', message: `${found.channel} deliveries have no ticket lifecycle` };
  if (found.ticketState === state) return { ok: true, delivery: found, notification: null };
  const updated: Delivery = { ...found, ticketState: state, attempts: [...found.attempts] };
  let notification: Notification | null = null;
  const insight = await getInsight(db, ws, found.insightId);
  if (insight && (state === 'shipped' || state === 'in_progress')) {
    const ctx = await loadContext(env, ws, insight.accountId);
    const owner = ctx.people.find((p) => p.id === found.ownerId) ?? null;
    const csm = ctx.people.find((p) => p.id === insight.csmId) ?? null;
    if (state === 'shipped') {
      notification = shippedNotification({ ...insight, workspaceId: ws }, { ...updated, workspaceId: ws }, { account: ctx.account, csm, owner, now: Date.now(), ids: randomId });
    } else if (insight.csmId) {
      notification = {
        id: randomId('ntf'), workspaceId: ws, csmId: insight.csmId, insightId: insight.id, kind: 'acknowledged',
        title: `${owner?.name ?? 'The owner'} started work on your ${ctx.account?.name ?? 'customer'} feedback`,
        body: `${found.receipt ?? 'The ticket'} "${insight.summary}" moved to In progress.`, draftCustomerNote: null, read: false, createdAt: nowIso(),
      };
    }
  }
  const stmts = [writeDelivery(db, ws, updated)];
  if (notification) stmts.push(notificationStatement(db, notification));
  await db.batch(stmts);
  await audit(db, { workspaceId: ws, actor, action: 'ticket.state', target: deliveryId, before: { ticketState: found.ticketState }, after: { ticketState: state } });
  return { ok: true, delivery: updated, notification };
}
