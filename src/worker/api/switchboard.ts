/**
 * Switchboard platform API (src/shared/platform.ts documents the surface): connections, the
 * people directory, who the viewer acts as, the analysis catalog and the overview. Mounted by the
 * gated API (`api.route('/', switchboardApi)`); same envelope, error shape and write guard. Every
 * write goes to the viewer's own workspace and records the acting person.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { ANALYSES, ConnectorId, PersonInput, PersonUpdate, UpdateConnection, type AnalysisSummary, type ConnectionDetail, type DeactivatePersonResult } from '../../shared/platform.ts';
import { connectionActivity, listConnections, testConnection, updateConnection } from '../connections.ts';
import { SEED } from '../db.ts';
import { createPerson, deactivatePerson, getActor, getEffectivePeople, setActor, updatePerson } from '../directory.ts';
import { platformOverview } from '../overview.ts';
import { body, fail, issues, ok, viewerOf, type AppEnv, type C } from './respond.ts';

export const switchboardApi = new Hono<AppEnv>();

/** "Elena Vasquez (viewer:1a2b3c)": who acted, as which viewer, for the audit log. */
async function auditActor(c: C): Promise<{ personId: string; name: string }> {
  const a = await getActor(c.env.DB, c.get('ws'));
  return { personId: a.personId, name: `${a.name} (${viewerOf(c)})` };
}

const seedGuard = (c: C) => (c.get('ws') === SEED ? fail(c, 403, 'forbidden', 'The seed workspace cannot be changed') : null);

// ------------------------------------------------------------------ connections

switchboardApi.get('/connections', async (c) => ok(c, await listConnections(c.env.DB, c.get('ws'))));

switchboardApi.get('/connections/:id', async (c) => {
  const id = ConnectorId.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 404, 'not_found', 'No such connector');
  const ws = c.get('ws');
  const [all, people] = await Promise.all([listConnections(c.env.DB, ws), getEffectivePeople(c.env.DB, ws)]);
  const out: ConnectionDetail = { connection: all.find((x) => x.id === id.data)!, activity: await connectionActivity(c.env.DB, ws, id.data, people) };
  return ok(c, out);
});

switchboardApi.put('/connections/:id', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const b = await body(c, UpdateConnection);
  if (!b.ok) return b.res;
  const ws = c.get('ws');
  const id = c.req.param('id');
  const r = await updateConnection(c.env.DB, ws, id, b.data, await auditActor(c));
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  return ok(c, (await listConnections(c.env.DB, ws)).find((x) => x.id === id)!);
});

switchboardApi.post('/connections/:id/test', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const b = await body(c, z.object({}).passthrough());
  if (!b.ok) return b.res;
  const r = await testConnection(c.env.DB, c.get('ws'), c.req.param('id'), await auditActor(c));
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  return ok(c, r.result);
});

// ------------------------------------------------------------------ people

switchboardApi.get('/people', async (c) => ok(c, await getEffectivePeople(c.env.DB, c.get('ws'))));

switchboardApi.post('/people', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const b = await body(c, PersonInput);
  if (!b.ok) return b.res;
  const r = await createPerson(c.env.DB, c.get('ws'), b.data, (await auditActor(c)).name);
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  return ok(c, r.person, 201);
});

switchboardApi.put('/people/:id', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const b = await body(c, PersonUpdate);
  if (!b.ok) return b.res;
  const r = await updatePerson(c.env.DB, c.get('ws'), c.req.param('id'), b.data, (await auditActor(c)).name);
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  return ok(c, r.person);
});

switchboardApi.delete('/people/:id', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const r = await deactivatePerson(c.env.DB, c.get('ws'), c.req.param('id'), (await auditActor(c)).name);
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  const out: DeactivatePersonResult = { person: r.person, reassignedRules: r.reassignedRules };
  return ok(c, out);
});

// ------------------------------------------------------------------ who the viewer acts as

switchboardApi.get('/me', async (c) => ok(c, await getActor(c.env.DB, c.get('ws'))));

switchboardApi.put('/me', async (c) => {
  const blocked = seedGuard(c);
  if (blocked) return blocked;
  const b = await body(c, z.object({ personId: z.string().min(1).max(40) }));
  if (!b.ok) return b.res;
  const r = await setActor(c.env.DB, c.get('ws'), b.data.personId, viewerOf(c));
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  return ok(c, r.actor);
});

// ------------------------------------------------------------------ analyses and the overview

switchboardApi.get('/analyses', async (c) => {
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE workspace_id IN (?, ?) AND status != 'failed' AND created_at <= ?").bind(SEED, c.get('ws'), new Date().toISOString()).first<{ n: number }>();
  const out: AnalysisSummary[] = ANALYSES.map((a) => (a.availability === 'built' ? { ...a, runs: Number(n?.n ?? 0) } : a));
  return ok(c, out);
});

const OverviewQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

switchboardApi.get('/overview', async (c) => {
  const q = OverviewQuery.safeParse(c.req.query());
  if (!q.success) return fail(c, 400, 'invalid_request', issues(q.error));
  return ok(c, await platformOverview(c.env.DB, c.get('ws'), q.data.days));
});
