/**
 * Simulated connectors, per workspace. A connection is a row in `connections` (absent: the seed
 * default, SEED_CONNECTED connected with the connector's default account). Connecting one makes
 * its channels deliverable; disconnecting one sends the rules that use it to triage. Activity is
 * read from where it already lives: deliveries through the connector's channels and conversations
 * imported from it (runs by source), plus test sends (`connection_activity`). Nothing leaves the
 * Worker.
 */
import type { Delivery, Person } from '../shared/contracts.ts';
import {
  CHANNEL_CONNECTOR, CONNECTORS, connectorById, DOC_KIND_LABEL, SEED_CONNECTED, type Connection, type ConnectionActivity, type ConnectionTestResult, type ConnectorDef, type ConnectorId,
  type DocKind, type UpdateConnection,
} from '../shared/platform.ts';
import { TYPE_LABEL } from '../pipeline/deliver.ts';
import type { ConnectionState } from '../pipeline/types.ts';
import { fnv1a, randomId } from '../pipeline/util.ts';
import { audit, getAccounts, j, nowIso, rowToRun, SEED } from './db.ts';

type Row = Record<string, unknown>;
type Stored = Omit<Connection, 'lastActivityAt' | 'activityCount'>;

/** When the seed workspace's connectors were connected (the start of the seeded history). */
export const SEED_CONNECTED_AT = '2026-09-01T16:00:00.000Z';

export function seedConnection(def: ConnectorDef): Stored {
  const on = SEED_CONNECTED.includes(def.id);
  return { id: def.id, status: on ? 'connected' : 'disconnected', account: on ? def.defaultAccount : null, config: {}, connectedAt: on ? SEED_CONNECTED_AT : null, connectedBy: null };
}

/** Every catalog connector's state in this workspace (one query; no activity). */
export async function getConnectionStates(db: D1Database, ws: string): Promise<Stored[]> {
  const rows = ws === SEED ? [] : (await db.prepare('SELECT id, data FROM connections WHERE workspace_id = ?').bind(ws).all<Row>()).results;
  const own = new Map(rows.map((r) => [String(r.id), j<Stored | null>(r.data, null)]));
  return CONNECTORS.map((def) => {
    const o = own.get(def.id);
    return o ? { ...seedConnection(def), ...o, id: def.id } : seedConnection(def);
  });
}

/** What the pipeline needs to route and deliver. */
export function connectionStates(list: Stored[]): ConnectionState[] {
  return list.map((c) => ({ id: c.id, status: c.status, account: c.account, config: c.config }));
}

const channelsOf = (id: ConnectorId) => (Object.entries(CHANNEL_CONNECTOR) as [string, ConnectorId | null][]).filter(([, c]) => c === id).map(([ch]) => ch);

type RunLite = { id: string; source: string; createdAt: string; filename: string; docKind: string | null; accountId: string | null; status: string };

async function visibleRuns(db: D1Database, ws: string, now: string): Promise<RunLite[]> {
  const { results } = await db
    .prepare('SELECT id, workspace_id, file_id, filename, format, source, screen, account_id, status, mode, created_at, sha256, prompt_version FROM runs WHERE workspace_id IN (?, ?) AND created_at <= ? ORDER BY created_at DESC')
    .bind(SEED, ws, now)
    .all<Row>();
  return results.map((r) => {
    const run = rowToRun(r);
    return { id: run.id, source: run.source ?? 'paste', createdAt: run.createdAt, filename: run.filename, docKind: run.docKind ?? null, accountId: run.accountId, status: run.status };
  });
}

/** Every connector with its workspace state and activity counts. */
export async function listConnections(db: D1Database, ws: string, now = nowIso()): Promise<Connection[]> {
  const [states, deliveries, runs, tests] = await Promise.all([
    getConnectionStates(db, ws),
    db.prepare('SELECT channel, COUNT(*) AS n, MAX(created_at) AS last FROM deliveries WHERE workspace_id IN (?, ?) AND created_at <= ? GROUP BY channel').bind(SEED, ws, now).all<Row>(),
    visibleRuns(db, ws, now),
    db.prepare('SELECT connector_id, MAX(created_at) AS last FROM connection_activity WHERE workspace_id = ? GROUP BY connector_id').bind(ws).all<Row>(),
  ]);
  const count = new Map<string, number>();
  const last = new Map<string, string>();
  const bump = (id: string | null, n: number, at: string | null) => {
    if (!id) return;
    count.set(id, (count.get(id) ?? 0) + n);
    if (at && at > (last.get(id) ?? '')) last.set(id, at);
  };
  for (const r of deliveries.results) bump(CHANNEL_CONNECTOR[String(r.channel) as keyof typeof CHANNEL_CONNECTOR] ?? null, Number(r.n), r.last ? String(r.last) : null);
  for (const r of runs) if (connectorById(r.source)) bump(r.source, 1, r.createdAt);
  for (const r of tests.results) {
    const id = String(r.connector_id);
    const at = r.last ? String(r.last) : null;
    if (at && at > (last.get(id) ?? '')) last.set(id, at);
  }
  return states.map((s) => ({ ...s, lastActivityAt: last.get(s.id) ?? null, activityCount: count.get(s.id) ?? 0 }));
}

/** Recent activity through one connector: deliveries out, imports in, and test sends. */
export async function connectionActivity(db: D1Database, ws: string, id: ConnectorId, people: Person[], limit = 50, now = nowIso()): Promise<ConnectionActivity[]> {
  const channels = channelsOf(id);
  const [dRows, runs, tRows, accounts] = await Promise.all([
    channels.length
      ? db.prepare(`SELECT data FROM deliveries WHERE workspace_id IN (?, ?) AND channel IN (${channels.map(() => '?').join(',')}) AND created_at <= ? ORDER BY created_at DESC LIMIT ?`).bind(SEED, ws, ...channels, now, limit).all<Row>()
      : Promise.resolve({ results: [] as Row[] }),
    visibleRuns(db, ws, now),
    db.prepare('SELECT data FROM connection_activity WHERE workspace_id = ? AND connector_id = ? ORDER BY created_at DESC LIMIT ?').bind(ws, id, limit).all<Row>(),
    getAccounts(db),
  ]);
  const deliveries = dRows.results.map((r) => j<Delivery>(r.data, null as unknown as Delivery)).filter(Boolean);
  const runOf = new Map<string, string>();
  const ids = deliveries.map((d) => d.insightId);
  for (let k = 0; k < ids.length; k += 80) {
    const chunk = ids.slice(k, k + 80);
    const { results } = await db.prepare(`SELECT id, run_id FROM insights WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Row>();
    for (const r of results) runOf.set(String(r.id), String(r.run_id));
  }
  const name = new Map(people.map((p) => [p.id, p.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const out: ConnectionActivity[] = [];
  for (const d of deliveries) {
    const p = (d.payload ?? {}) as Record<string, unknown>;
    const what = typeof p.summary === 'string' ? p.summary : typeof p.title === 'string' ? p.title : 'Insight';
    const type = typeof p.type === 'string' && p.type in TYPE_LABEL ? `${TYPE_LABEL[p.type as keyof typeof TYPE_LABEL]}: ` : '';
    const tagged = d.mentions?.length ? ` · tagged ${d.mentions.map((m) => name.get(m.personId) ?? m.handle).join(', ')}` : '';
    out.push({
      id: d.id, connectorId: id, direction: 'out', at: d.createdAt, title: `${d.receipt ?? 'Sent'} · ${type}${what}`, detail: `${d.destination} · ${name.get(d.ownerId) ?? d.ownerId}${tagged}`,
      runId: runOf.get(d.insightId) ?? null, insightId: d.insightId, status: d.status === 'failed' ? 'failed' : d.attempts.length > 1 ? 'retried' : 'ok',
    });
  }
  for (const r of runs.filter((x) => x.source === id).slice(0, limit)) {
    const kind = r.docKind && r.docKind in DOC_KIND_LABEL ? DOC_KIND_LABEL[r.docKind as DocKind] : 'Conversation';
    out.push({
      id: `imp_${r.id}`, connectorId: id, direction: 'in', at: r.createdAt, title: r.filename, detail: `${kind}${r.accountId && accountName.get(r.accountId) ? ` · ${accountName.get(r.accountId)}` : ''}`,
      runId: r.id, insightId: null, status: r.status === 'failed' ? 'failed' : 'ok',
    });
  }
  for (const r of tRows.results) out.push(j<ConnectionActivity>(r.data, null as unknown as ConnectionActivity));
  return out.filter(Boolean).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, limit);
}

export type ConnectionError = { ok: false; status: 404 | 409; code: string; message: string };

/** Connect, configure or disconnect. Config keys are the connector's own fields. */
export async function updateConnection(db: D1Database, ws: string, id: string, body: UpdateConnection, actor: { personId: string; name: string }): Promise<{ ok: true } | ConnectionError> {
  const def = connectorById(id);
  if (!def) return { ok: false, status: 404, code: 'not_found', message: 'No such connector' };
  const before = (await getConnectionStates(db, ws)).find((c) => c.id === id)!;
  const keys = new Set(def.configFields.map((f) => f.key));
  const clean = (cfg: Record<string, string> | undefined) => Object.fromEntries(Object.entries(cfg ?? {}).filter(([k]) => keys.has(k)).map(([k, v]) => [k, v.trim()]));
  let after: Stored;
  if (body.action === 'connect') {
    after = { ...before, status: 'connected', account: body.account?.trim() || before.account || def.defaultAccount, config: { ...before.config, ...clean(body.config) }, connectedAt: nowIso(), connectedBy: actor.personId };
  } else if (body.action === 'configure') {
    if (before.status !== 'connected') return { ok: false, status: 409, code: 'not_connected', message: `${def.name} isn't connected. Connect it first.` };
    after = { ...before, config: { ...before.config, ...clean(body.config) } };
  } else {
    // The settings are kept, so reconnecting restores them.
    after = { ...before, status: 'disconnected', account: null, connectedAt: null, connectedBy: null };
  }
  await db.prepare('INSERT INTO connections (workspace_id, id, data, updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').bind(ws, id, JSON.stringify(after), nowIso()).run();
  await audit(db, { workspaceId: ws, actor: actor.name, action: `connection.${body.action}`, target: id, before, after });
  return { ok: true };
}

/** A simulated test send (destinations) or read (sources), recorded as a 'test' activity row. */
export async function testConnection(db: D1Database, ws: string, id: string, actor: { personId: string; name: string }, now = Date.now()): Promise<{ ok: true; result: ConnectionTestResult } | ConnectionError> {
  const def = connectorById(id);
  if (!def) return { ok: false, status: 404, code: 'not_found', message: 'No such connector' };
  const state = (await getConnectionStates(db, ws)).find((c) => c.id === id)!;
  if (state.status !== 'connected') return { ok: true, result: { ok: false, ms: 0, receipt: null, message: `${def.name} isn't connected. Connect it first.` } };
  const h = fnv1a(`${ws}:${id}:${now}`);
  const ms = 80 + (h % 320);
  const cfg = state.config;
  const receipt =
    def.category === 'chat' ? `${Math.floor(now / 1000)}.${String(h % 1_000_000).padStart(6, '0')}`
      : def.id === 'jira' ? `${cfg.defaultProject || 'FEED'}-${1 + (h % 900)}`
        : def.id === 'linear' ? `${(cfg.defaultTeam || 'Core Product').split(/\s+/).map((w) => w[0]!.toUpperCase()).join('').slice(0, 3)}-${1 + (h % 400)}`
          : def.category === 'crm' ? `00T5f00000${h.toString(36).slice(0, 5).padStart(5, '0')}`
            : def.category === 'email' ? `<test.${h.toString(16)}@${state.account?.split('@')[1] ?? 'invoca.example'}>`
              : def.direction === 'source' ? null
                : `rev ${100 + (h % 900)}`;
  const where = cfg.defaultChannel || cfg.defaultProject || cfg.defaultTeam || cfg.folder || state.account || def.defaultAccount;
  const message = def.direction === 'source'
    ? `Read the latest ${def.category === 'recorder' ? 'transcripts' : 'items'} from ${state.account ?? def.defaultAccount}. Nothing was imported.`
    : `Sent a test ${def.category === 'tracker' ? 'issue' : def.category === 'crm' ? 'task' : def.category === 'docs' ? 'entry' : 'message'} to ${where}${receipt ? ` (${receipt})` : ''}.`;
  const row: ConnectionActivity = {
    id: randomId('cact'), connectorId: def.id, direction: def.direction === 'source' ? 'in' : 'out', at: new Date(now).toISOString(), title: `Test by ${actor.name}`, detail: message,
    runId: null, insightId: null, status: 'test',
  };
  await db.prepare('INSERT INTO connection_activity (id, workspace_id, connector_id, data, created_at) VALUES (?,?,?,?,?)').bind(row.id, ws, def.id, JSON.stringify(row), row.at).run();
  return { ok: true, result: { ok: true, ms, receipt, message } };
}
