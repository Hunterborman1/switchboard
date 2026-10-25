/**
 * Theme read model. Aggregates (counts, ARR, weekly trend, status) are computed at read time
 * from the insights the viewer can see (seed ∪ own), so one viewer's runs and ticket moves
 * change only their own view.
 */
import type { Account, Delivery, Insight, Theme } from '../shared/contracts.ts';
import { isoWeek } from '../pipeline/util.ts';
import { getAccounts, queryDeliveries, queryInsights, SEED } from './db.ts';

type ThemeRow = { id: string; workspace_id: string; name: string; summary: string; type: string; product_area: string; status: string; owner_id: string | null; created_at: string };

export function lastWeeks(now: number, n = 8): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoWeek(new Date(now - i * 7 * 86_400_000).toISOString()));
  return [...new Set(out)];
}

export function buildTheme(row: ThemeRow, members: Insight[], accounts: Map<string, Account>, deliveries: Delivery[], now: number): Theme {
  const accountIds = [...new Set(members.map((m) => m.accountId).filter((a): a is string => !!a))];
  const arr = accountIds.reduce((s, id) => s + (accounts.get(id)?.arrUsd ?? 0), 0);
  const weeks = lastWeeks(now);
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const m of members) {
    const w = isoWeek(m.createdAt);
    if (counts.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const owners = new Map<string, number>();
  for (const m of members) if (m.ownerId) owners.set(m.ownerId, (owners.get(m.ownerId) ?? 0) + 1);
  const ownerId = [...owners.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? row.owner_id;
  const states = new Set(deliveries.map((d) => d.ticketState));
  const status: Theme['status'] = states.has('shipped') ? 'shipped' : states.has('in_progress') ? 'on_roadmap' : members.length >= 3 || accountIds.length >= 2 ? 'active' : (row.status as Theme['status']) === 'candidate' ? 'candidate' : 'active';
  const sorted = [...members].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const topQuotes = [...members]
    .sort((a, b) => b.confidenceFinal - a.confidenceFinal || b.createdAt.localeCompare(a.createdAt))
    .filter((m, i, all) => all.findIndex((x) => x.accountId === m.accountId) === i || all.length <= 3)
    .slice(0, 3)
    .map((m) => ({ insightId: m.id, accountId: m.accountId, quote: m.evidence.find((e) => e.method !== 'failed')?.matchedText ?? m.evidence[0]?.quote ?? '' }));
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    type: row.type as Theme['type'],
    productArea: row.product_area as Theme['productArea'],
    status,
    insightCount: members.length,
    accountCount: accountIds.length,
    arrUsd: Math.round(arr),
    firstSeen: sorted[0]?.createdAt ?? row.created_at,
    lastSeen: sorted[sorted.length - 1]?.createdAt ?? row.created_at,
    weekly: weeks.map((w) => ({ week: w, count: counts.get(w) ?? 0 })),
    ownerId,
    topQuotes,
  };
}

export async function themesView(db: D1Database, ws: string, now = Date.now(), onlyId?: string): Promise<{ themes: Theme[]; members: Map<string, Insight[]>; accounts: Account[] }> {
  const { results } = await db
    .prepare(`SELECT id, workspace_id, name, summary, type, product_area, status, owner_id, created_at FROM themes WHERE workspace_id IN (?, ?)${onlyId ? ' AND id = ?' : ''}`)
    .bind(SEED, ws, ...(onlyId ? [onlyId] : []))
    .all<ThemeRow>();
  const visibleNow = (i: { createdAt: string }) => Date.parse(i.createdAt) <= now;
  const insights = (await queryInsights(db, ws, onlyId ? 'theme_id = ?' : 'theme_id IS NOT NULL', onlyId ? [onlyId] : [])).filter(
    (i) => i.themeId && visibleNow(i) && i.status !== 'rejected' && i.status !== 'dropped_ungrounded' && (!onlyId || i.themeId === onlyId),
  );
  const accounts = await getAccounts(db);
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const deliveries = (await queryDeliveries(db, ws)).filter(visibleNow);
  const byInsight = new Map<string, Delivery[]>();
  for (const d of deliveries) byInsight.set(d.insightId, [...(byInsight.get(d.insightId) ?? []), d]);
  const members = new Map<string, Insight[]>();
  for (const i of insights) members.set(i.themeId!, [...(members.get(i.themeId!) ?? []), i]);
  const themes = results
    .map((row) => buildTheme(row, members.get(row.id) ?? [], accMap, (members.get(row.id) ?? []).flatMap((m) => byInsight.get(m.id) ?? []), now))
    .filter((t) => t.insightCount > 0 || onlyId)
    .sort((a, b) => b.insightCount - a.insightCount || b.arrUsd - a.arrUsd || a.name.localeCompare(b.name));
  return { themes, members, accounts };
}
