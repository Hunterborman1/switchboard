/**
 * Route: an editable rules table (type × area × severity × ARR band → owner + channel).
 * Routing is never decided by the prompt. Effective rules = seed baseline with the viewer's
 * workspace overrides applied by id. Lowest priority number wins; nothing matches → triage.
 */
import type { ArrBand, Channel, InsightType, Person, ProductArea, RoutingRule, Severity } from '../shared/contracts.ts';
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
};

export const TRIAGE_OWNER_FALLBACK = 'ppl_triage';

export function triageOwner(people: Person[]): string {
  return people.find((p) => p.role === 'triage')?.id ?? people.find((p) => p.role === 'support_escalation')?.id ?? TRIAGE_OWNER_FALLBACK;
}

export function routeInsight(s: RouteSubject, rules: RoutingRule[], people: Person[]): RouteDecision {
  for (const r of rules) {
    if (ruleMatches(r, s)) {
      return { ruleId: r.id, ruleName: r.name, ownerId: r.ownerId, channel: r.channel, destination: r.destination, reason: `matched rule "${r.name}" (priority ${r.priority})` };
    }
  }
  return { ruleId: null, ruleName: 'Fallback triage', ownerId: triageOwner(people), channel: 'triage', destination: 'Triage queue', reason: 'no rule matched; sent to triage' };
}

/** Sankey flows for the routing preview: type → area → owner, counted. */
export function previewFlows(subjects: RouteSubject[], rules: RoutingRule[], people: Person[]): { type: InsightType; area: ProductArea; ownerId: string; count: number }[] {
  const counts = new Map<string, { type: InsightType; area: ProductArea; ownerId: string; count: number }>();
  for (const s of subjects) {
    const d = routeInsight(s, rules, people);
    const key = `${s.type}|${s.productArea}|${d.ownerId}`;
    const row = counts.get(key) ?? { type: s.type, area: s.productArea, ownerId: d.ownerId, count: 0 };
    row.count++;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.area.localeCompare(b.area));
}
