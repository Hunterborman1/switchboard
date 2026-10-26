/**
 * The people directory and the acting user, per workspace. The directory is the seed `people`
 * table with this workspace's edits applied (copy-on-write by id in `workspace_people`), plus the
 * people added here. Deactivated people stay resolvable by id, so history still shows their
 * name; routing and tagging skip them, and the rules they owned move to the triage owner as
 * workspace rule overrides. Who the viewer acts as is a workspace preference.
 */
import type { Person, RoutingRule } from '../shared/contracts.ts';
import { actorFor, DEFAULT_ACTOR_ID, isAdminPerson, type Actor, type PersonInput, type PersonUpdate } from '../shared/platform.ts';
import { effectiveRules, triageOwner } from '../pipeline/route.ts';
import { randomId } from '../pipeline/util.ts';
import { audit, getPeople, getRules, j, nowIso, SEED } from './db.ts';

type Row = Record<string, unknown>;

/** Identities every person has from their base fields (a stored identity overrides). */
function withDefaults(p: Person): Person {
  return { ...p, identities: { email: p.email, slack: p.slackHandle, ...(p.identities ?? {}) }, active: p.active !== false, custom: p.custom === true };
}

export async function getEffectivePeople(db: D1Database, ws: string): Promise<Person[]> {
  const [seed, own] = await Promise.all([
    getPeople(db),
    ws === SEED ? Promise.resolve([] as Row[]) : db.prepare('SELECT data FROM workspace_people WHERE workspace_id = ?').bind(ws).all<Row>().then((r) => r.results),
  ]);
  const byId = new Map(seed.map((p) => [p.id, withDefaults(p)]));
  const added: Person[] = [];
  for (const r of own) {
    const p = withDefaults(j<Person>(r.data, null as unknown as Person));
    if (!p?.id) continue;
    if (byId.has(p.id)) byId.set(p.id, p);
    else added.push(p);
  }
  return [...byId.values(), ...added.sort((a, b) => a.name.localeCompare(b.name))];
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const pick = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;
  return pick.map((w) => w[0]!.toUpperCase()).join('').slice(0, 3) || '?';
}

const handle = (h: string) => `@${h.trim().replace(/^@/, '')}`;

function personStatement(db: D1Database, ws: string, p: Person): D1PreparedStatement {
  return db
    .prepare('INSERT INTO workspace_people (workspace_id, id, data, updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
    .bind(ws, p.id, JSON.stringify(p), nowIso());
}

export type DirectoryError = { ok: false; status: 404 | 409; code: string; message: string };

export async function createPerson(db: D1Database, ws: string, input: PersonInput, actor: string): Promise<{ ok: true; person: Person } | DirectoryError> {
  const people = await getEffectivePeople(db, ws);
  const email = input.email.trim().toLowerCase();
  const clash = people.find((p) => p.active !== false && p.email.toLowerCase() === email);
  if (clash) return { ok: false, status: 409, code: 'duplicate_person', message: `${clash.name} already uses ${input.email}` };
  const slack = input.identities?.slack?.trim() || email.split('@')[0]!;
  const person = withDefaults({
    id: randomId('ppl').slice(0, 16), name: input.name.trim(), role: input.role, title: input.title.trim(), productArea: input.productArea ?? null,
    slackHandle: handle(slack), email, initials: initialsOf(input.name), identities: { ...(input.identities ?? {}), email, slack: handle(slack) }, active: true, custom: true,
  });
  await db.batch([personStatement(db, ws, person)]);
  await audit(db, { workspaceId: ws, actor, action: 'person.create', target: person.id, after: person });
  return { ok: true, person };
}

export async function updatePerson(db: D1Database, ws: string, id: string, patch: PersonUpdate, actor: string): Promise<{ ok: true; person: Person; reassignedRules: string[] } | DirectoryError> {
  if (patch.active === false) {
    const r = await deactivatePerson(db, ws, id, actor, patch);
    return r.ok ? { ok: true, person: r.person, reassignedRules: r.reassignedRules } : r;
  }
  const people = await getEffectivePeople(db, ws);
  const before = people.find((p) => p.id === id);
  if (!before) return { ok: false, status: 404, code: 'not_found', message: 'No such person' };
  const email = patch.email?.trim().toLowerCase();
  if (email && email !== before.email.toLowerCase()) {
    const clash = people.find((p) => p.id !== id && p.active !== false && p.email.toLowerCase() === email);
    if (clash) return { ok: false, status: 409, code: 'duplicate_person', message: `${clash.name} already uses ${patch.email}` };
  }
  const identities = { ...(before.identities ?? {}), ...(patch.identities ?? {}), ...(email && !patch.identities?.email ? { email } : {}) };
  const slack = patch.identities?.slack?.trim();
  const person = withDefaults({
    ...before,
    ...(patch.name ? { name: patch.name.trim(), initials: initialsOf(patch.name) } : {}),
    ...(patch.title ? { title: patch.title.trim() } : {}),
    ...(patch.role ? { role: patch.role } : {}),
    ...(patch.productArea !== undefined ? { productArea: patch.productArea } : {}),
    ...(email ? { email } : {}),
    ...(slack ? { slackHandle: handle(slack) } : {}),
    identities: slack ? { ...identities, slack: handle(slack) } : identities,
    active: patch.active ?? before.active,
  });
  await db.batch([personStatement(db, ws, person)]);
  await audit(db, { workspaceId: ws, actor, action: patch.active === true && before.active === false ? 'person.reactivate' : 'person.update', target: id, before, after: person });
  return { ok: true, person, reassignedRules: [] };
}

/**
 * Remove someone from the workspace directory: they are kept (inactive) so history still
 * resolves their name, and every effective rule they own is overridden in this workspace to
 * the triage owner. The last person who can own triage cannot be removed.
 */
export async function deactivatePerson(db: D1Database, ws: string, id: string, actor: string, patch: PersonUpdate = {}): Promise<{ ok: true; person: Person; reassignedRules: string[] } | DirectoryError> {
  const people = await getEffectivePeople(db, ws);
  const before = people.find((p) => p.id === id);
  if (!before) return { ok: false, status: 404, code: 'not_found', message: 'No such person' };
  if (before.active === false) return { ok: true, person: before, reassignedRules: [] };
  const rest = people.map((p) => (p.id === id ? { ...p, active: false } : p));
  const triage = triageOwner(rest);
  if (!rest.some((p) => p.id === triage && p.active !== false)) {
    return { ok: false, status: 409, code: 'last_triage_owner', message: `${before.name} is the last person who can own triage. Add or reactivate someone in Product ops or Support first.` };
  }
  const { active: _a, ...edits } = patch;
  const person: Person = { ...before, ...(edits.title ? { title: edits.title } : {}), active: false };
  const r = await getRules(db, ws);
  const owned = effectiveRules(r.seed, r.own).filter((x) => x.ownerId === id);
  const stmts: D1PreparedStatement[] = [personStatement(db, ws, person)];
  for (const rule of owned) {
    const moved: RoutingRule = { ...rule, workspaceId: ws, ownerId: triage };
    stmts.push(
      db.prepare('INSERT INTO routing_rules (workspace_id, id, priority, data, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id, id) DO UPDATE SET priority=excluded.priority, data=excluded.data, updated_at=excluded.updated_at').bind(ws, rule.id, moved.priority, JSON.stringify(moved), nowIso()),
    );
  }
  // Whoever was acting as them now acts as the default persona.
  stmts.push(db.prepare("DELETE FROM workspace_prefs WHERE workspace_id = ? AND key = 'actor' AND value = ?").bind(ws, JSON.stringify(id)));
  await db.batch(stmts);
  await audit(db, { workspaceId: ws, actor, action: 'person.deactivate', target: id, before: { active: true }, after: { active: false, reassignedRules: owned.map((x) => x.id), to: triage } });
  return { ok: true, person, reassignedRules: owned.map((x) => x.id) };
}

// ------------------------------------------------------------------ preferences and the actor

export async function getPref<T>(db: D1Database, ws: string, key: string, fallback: T): Promise<T> {
  const r = await db.prepare('SELECT value FROM workspace_prefs WHERE workspace_id = ? AND key = ?').bind(ws, key).first<Row>();
  return r ? j<T>(r.value, fallback) : fallback;
}

export function prefStatement(db: D1Database, ws: string, key: string, value: unknown): D1PreparedStatement {
  return db
    .prepare('INSERT INTO workspace_prefs (workspace_id, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .bind(ws, key, JSON.stringify(value), nowIso());
}

/** Fallback when the directory is empty (never in practice). */
const NOBODY: Actor = { personId: 'ppl_admin', name: 'Workspace admin', title: 'Administrator', initials: 'WA', isAdmin: true };

/**
 * Who the viewer is acting as: their chosen person while that person is active, else the VP
 * Product (DEFAULT_ACTOR_ID), else the first active admin.
 */
export function resolveActor(people: Person[], chosen: string | null): Actor {
  const active = people.filter((p) => p.active !== false);
  const p = active.find((x) => x.id === chosen) ?? active.find((x) => x.id === DEFAULT_ACTOR_ID) ?? active.find(isAdminPerson) ?? active[0];
  return p ? actorFor(p) : NOBODY;
}

export async function getActor(db: D1Database, ws: string, people?: Person[]): Promise<Actor> {
  const [dir, chosen] = await Promise.all([people ? Promise.resolve(people) : getEffectivePeople(db, ws), getPref<string | null>(db, ws, 'actor', null)]);
  return resolveActor(dir, chosen);
}

export async function setActor(db: D1Database, ws: string, personId: string, auditActor: string): Promise<{ ok: true; actor: Actor } | DirectoryError> {
  const people = await getEffectivePeople(db, ws);
  const p = people.find((x) => x.id === personId);
  if (!p) return { ok: false, status: 404, code: 'not_found', message: 'No such person' };
  if (p.active === false) return { ok: false, status: 409, code: 'inactive_person', message: `${p.name} is no longer in the directory` };
  await db.batch([prefStatement(db, ws, 'actor', personId)]);
  await audit(db, { workspaceId: ws, actor: auditActor, action: 'actor.set', target: personId });
  return { ok: true, actor: actorFor(p) };
}
