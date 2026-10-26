/**
 * The Switchboard overview: what came in, what it was, where it came from, what went out to whom,
 * over a window of days, from the runs and deliveries this workspace can see (seed ∪ own).
 * Replays still revealing their timeline are counted once their rows are visible.
 */
import type { Delivery } from '../shared/contracts.ts';
import { CHANNEL_CONNECTOR, type ConnectorId, type DocKind, type PlatformOverview, type SourceId } from '../shared/platform.ts';
import { percentile } from '../pipeline/util.ts';
import { getConnectionStates } from './connections.ts';
import { j, queryInsights, rowToRun, SEED } from './db.ts';

type Row = Record<string, unknown>;

function tally<K extends string>(keys: K[]): { key: K; count: number }[] {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function platformOverview(db: D1Database, ws: string, days: number, nowMs = Date.now()): Promise<PlatformOverview> {
  const to = new Date(nowMs).toISOString();
  const from = new Date(nowMs - days * 86_400_000).toISOString();
  const prevFrom = new Date(nowMs - 2 * days * 86_400_000).toISOString();
  const [runRows, deliveryRows, pending, connections] = await Promise.all([
    db.prepare("SELECT * FROM runs WHERE workspace_id IN (?, ?) AND created_at >= ? AND created_at <= ? AND status != 'failed'").bind(SEED, ws, prevFrom, to).all<Row>(),
    db
      .prepare('SELECT d.data AS data, r.created_at AS run_at FROM deliveries d LEFT JOIN insights i ON i.id = d.insight_id LEFT JOIN runs r ON r.id = i.run_id WHERE d.workspace_id IN (?, ?) AND d.created_at >= ? AND d.created_at <= ?')
      .bind(SEED, ws, from, to)
      .all<Row>(),
    queryInsights(db, ws, "status = 'pending_review'"),
    getConnectionStates(db, ws),
  ]);
  const runs = runRows.results.map(rowToRun);
  const current = runs.filter((r) => r.createdAt >= from);
  const deliveries = deliveryRows.results.map((r) => ({ d: j<Delivery>(r.data, null as unknown as Delivery), runAt: r.run_at ? String(r.run_at) : null })).filter((x) => x.d);
  const tagged = new Set<string>();
  for (const { d } of deliveries) {
    if (d.mentions?.length) for (const m of d.mentions) tagged.add(m.personId);
    else tagged.add(d.ownerId);
  }
  const minutes = deliveries.filter((x) => x.runAt).map((x) => (Date.parse(x.d.createdAt) - Date.parse(x.runAt!)) / 60_000).filter((m) => Number.isFinite(m) && m >= 0);
  return {
    window: { from, to, days },
    conversations: current.length,
    conversationsPrev: runs.length - current.length,
    byKind: tally(current.map((r) => (r.docKind ?? 'other') as DocKind)).map(({ key, count }) => ({ kind: key, count })),
    bySource: tally(current.map((r) => (r.source ?? 'paste') as SourceId)).map(({ key, count }) => ({ source: key, count })),
    // Only built analyses run. Signal Loop extracts from every conversation triage marks actionable.
    analysesRun: [{ id: 'product_feedback' as const, count: current.filter((r) => r.actionable === true).length }],
    deliveries: deliveries.length,
    byConnector: tally(deliveries.map(({ d }) => (CHANNEL_CONNECTOR[d.channel] ?? 'triage') as ConnectorId | 'triage')).map(({ key, count }) => ({ connectorId: key, count })),
    peopleTagged: tagged.size,
    awaitingReview: pending.filter((i) => i.status === 'pending_review' && Date.parse(i.createdAt) <= nowMs).length,
    medianMinutesToOwner: minutes.length ? Math.round(percentile(minutes, 50) * 10) / 10 : null,
    connectedCount: connections.filter((c) => c.status === 'connected').length,
  };
}
