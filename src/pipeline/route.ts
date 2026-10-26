/**
 * Route: an editable rules table (type × area × severity × ARR band → owner + channel).
 * Routing is never decided by the prompt. Effective rules = seed baseline with the viewer's
 * workspace overrides applied by id. Lowest priority number wins; nothing matches → triage.
 * A matching rule still goes to triage, with the reason, when its channel's connector is not
 * connected in the workspace, or its owner has been removed from the directory.
 */
import type { ArrBand, Channel, InsightType, Person, ProductArea, RoutingRule, Severity } from '../shared/contracts.ts';
import { CHANNEL_CONNECTOR, connectorById } from '../shared/platform.ts';
import { SEVERITY_RANK } from '../shared/scoring.ts';

export function arrBandOf(arrUsd: number): ArrBand {
  if (arrUsd < 50_000) return '<50k';
  if (arrUsd < 250_000) return '50k-250k';
  if (arrUsd < 1_000_000) return '250k-1m';
  return '>1m';
}

/** Seed rules with overrides (same id replaces, new id adds), sorted by priority then id. */
export function effectiveRules(seed: RoutingRule[], overrides: RoutingRule[]): RoutingRule[] {
  const byId = new Map<string, RoutingRule>();
  for (const r of seed) byId.set(r.id, r);
  for (const r of overrides) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export type RouteSubject = { type: InsightType; productArea: ProductArea; severity: Severity; arrBand: ArrBand | null };

export function ruleMatches(rule: RoutingRule, s: RouteSubject): boolean {
  if (!rule.enabled) return false;
  const m = rule.match;
  if (m.types && m.types.length && !m.types.includes(s.type)) return false;
  if (m.areas && m.areas.length && !m.areas.includes(s.productArea)) return false;
  if (m.minSeverity && SEVERITY_RANK[s.severity] < SEVERITY_RANK[m.minSeverity]) return false;
  if (m.arrBands && m.arrBands.length && (!s.arrBand || !m.arrBands.includes(s.arrBand))) return false;
  return true;
}

export type RouteDecision = {
  ruleId: string | null;
  ruleName: string;
  ownerId: string;
  channel: Channel;
  destination: string;
  reason: string;
  /** Set when a matching rule was diverted to triage: where it would have gone, and why not. */
  diverted?: { channel: Channel; ownerId: string; destination: string; why: 'not_connected' | 'owner_inactive' };
};

export const TRIAGE_OWNER_FALLBACK = 'ppl_triage';

const isActive = (p: Person) => p.active !== false;

export function triageOwner(people: Person[]): string {
  const active = people.filter(isActive);
  return active.find((p) => p.role === 'triage')?.id ?? active.find((p) => p.role === 'support_escalation')?.id ?? TRIAGE_OWNER_FALLBACK;
}

/**
 * Connector state the router needs. Omitted (scripts, evals, seeded history) means every
 * connector is available, which is how the history was generated.
 */
export type RouteOptions = { connected?: ReadonlySet<string> | null };

/** Whether a channel can deliver: triage always can; others need their connector connected. */
export function channelAvailable(channel: Channel, connected: ReadonlySet<string> | null | undefined): boolean {
  const c = CHANNEL_CONNECTOR[channel];
  return c === null || !connected || connected.has(c);
}

export function routeInsight(s: RouteSubject, rules: RoutingRule[], people: Person[], opts: RouteOptions = {}): RouteDecision {
  for (const r of rules) {
    if (!ruleMatches(r, s)) continue;
    const matched = `matched rule "${r.name}" (priority ${r.priority})`;
    const owner = people.find((p) => p.id === r.ownerId);
    const triage = { ruleId: r.id, ruleName: r.name, ownerId: triageOwner(people), channel: 'triage' as const, destination: 'Triage queue' };
    if (!channelAvailable(r.channel, opts.connected)) {
      const name = connectorById(CHANNEL_CONNECTOR[r.channel] ?? '')?.name ?? r.channel;
      return { ...triage, reason: `${name} isn't connected, so this went to triage (${matched})`, diverted: { channel: r.channel, ownerId: r.ownerId, destination: r.destination, why: 'not_connected' } };
    }
    if (owner && !isActive(owner)) {
      return { ...triage, reason: `${owner.name} is no longer in the directory, so this went to triage (${matched})`, diverted: { channel: r.channel, ownerId: r.ownerId, destination: r.destination, why: 'owner_inactive' } };
    }
    return { ruleId: r.id, ruleName: r.name, ownerId: r.ownerId, channel: r.channel, destination: r.destination, reason: matched };
  }
  return { ruleId: null, ruleName: 'Fallback triage', ownerId: triageOwner(people), channel: 'triage', destination: 'Triage queue', reason: 'no rule matched; sent to triage' };
}

/** Sankey flows for the routing preview: type → area → owner, counted. */
export function previewFlows(subjects: RouteSubject[], rules: RoutingRule[], people: Person[], opts: RouteOptions = {}): { type: InsightType; area: ProductArea; ownerId: string; count: number }[] {
  const counts = new Map<string, { type: InsightType; area: ProductArea; ownerId: string; count: number }>();
  for (const s of subjects) {
    const d = routeInsight(s, rules, people, opts);
    const key = `${s.type}|${s.productArea}|${d.ownerId}`;
    const row = counts.get(key) ?? { type: s.type, area: s.productArea, ownerId: d.ownerId, count: 0 };
    row.count++;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.area.localeCompare(b.area));
}
