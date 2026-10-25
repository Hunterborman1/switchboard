import { describe, expect, it } from 'vitest';
import { arrBandOf, effectiveRules, previewFlows, routeInsight, ruleMatches, triageOwner } from '../../../src/pipeline/route.ts';
import type { RoutingRule } from '../../../src/shared/contracts.ts';
import { world } from '../../helpers/fixtures.ts';

const rules = effectiveRules(world.rules, []);
const s = (type: any, productArea: any, severity: any = 'medium', arrBand: any = '250k-1m') => ({ type, productArea, severity, arrBand });

describe('route', () => {
  it('ARR bands', () => {
    expect(arrBandOf(10_000)).toBe('<50k');
    expect(arrBandOf(50_000)).toBe('50k-250k');
    expect(arrBandOf(249_999)).toBe('50k-250k');
    expect(arrBandOf(250_000)).toBe('250k-1m');
    expect(arrBandOf(1_000_000)).toBe('>1m');
  });
  it('lowest priority number wins and disabled rules are skipped', () => {
    const d = routeInsight(s('churn_risk', 'platform'), rules, world.people);
    expect(d.ruleId).toBe('rule_churn'); // rule_disabled (priority 5) matches everything but is off
    expect(d.ownerId).toBe('ppl_renee');
    expect(d.reason).toContain('priority 10');
  });
  it('ARR band filters: small accounts skip the VP churn rule and fall to triage', () => {
    const d = routeInsight(s('churn_risk', 'platform', 'high', '<50k'), rules, world.people);
    expect(d.ruleId).toBeNull();
    expect(d.channel).toBe('triage');
    expect(d.ownerId).toBe('ppl_triage');
    expect(routeInsight(s('churn_risk', 'platform', 'high', null), rules, world.people).channel).toBe('triage');
  });
  it('type × area matching', () => {
    expect(routeInsight(s('bug', 'integrations'), rules, world.people).destination).toBe('INTG');
    expect(routeInsight(s('feature_request', 'signal_ai'), rules, world.people).channel).toBe('linear');
    expect(routeInsight(s('feature_request', 'presense'), rules, world.people).channel).toBe('triage');
  });
  it('minSeverity', () => {
    const r: RoutingRule = { ...world.rules[1]!, id: 'rule_sev', priority: 1, match: { types: null, areas: null, minSeverity: 'high', arrBands: null } };
    expect(ruleMatches(r, s('bug', 'platform', 'medium'))).toBe(false);
    expect(ruleMatches(r, s('bug', 'platform', 'high'))).toBe(true);
    expect(ruleMatches(r, s('bug', 'platform', 'critical'))).toBe(true);
  });
  it('workspace overrides replace by id and can add rules', () => {
    const override: RoutingRule = { ...world.rules.find((r) => r.id === 'rule_pricing')!, workspaceId: 'ws_a', ownerId: 'ppl_renee', priority: 1, match: { types: ['pricing_objection'], areas: null, minSeverity: null, arrBands: ['250k-1m', '>1m'] } };
    const added: RoutingRule = { ...override, id: 'rule_new', priority: 99, ownerId: 'ppl_cole' };
    const eff = effectiveRules(world.rules, [override, added]);
    expect(eff.length).toBe(world.rules.length + 1);
    expect(eff[0]!.id).toBe('rule_pricing');
    expect(routeInsight(s('pricing_objection', 'billing_pricing'), eff, world.people).ownerId).toBe('ppl_renee');
    expect(routeInsight(s('pricing_objection', 'billing_pricing', 'medium', '<50k'), eff, world.people).ownerId).toBe('ppl_triage'); // the override narrowed the seed rule
  });
  it('triage owner fallback chain', () => {
    expect(triageOwner(world.people)).toBe('ppl_triage');
    expect(triageOwner([])).toBe('ppl_triage');
  });
  it('preview flows aggregate type → area → owner', () => {
    const flows = previewFlows([s('bug', 'integrations'), s('bug', 'integrations'), s('praise', 'signal_ai')], rules, world.people);
    expect(flows[0]).toEqual({ type: 'bug', area: 'integrations', ownerId: 'ppl_priya', count: 2 });
    expect(flows).toHaveLength(2);
  });
});
