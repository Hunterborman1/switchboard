/**
 * Default taxonomy (definitions + counter-examples). data/world/taxonomy.json overrides this
 * when present: scripts load the file, the Worker reads the seeded copy from D1 settings.
 */
import type { Taxonomy } from '../../pipeline/types.ts';

export const DEFAULT_TAXONOMY: Taxonomy = {
  types: [
    {
      key: 'feature_request',
      label: 'Feature request',
      definition: 'The customer asks for a capability Invoca does not have, or an extension of an existing one.',
      counterExamples: ['A how-do-I question about an existing feature is support, not a feature request.', 'An existing feature that behaves wrongly is a bug.'],
    },
    {
      key: 'bug',
      label: 'Bug',
      definition: 'Existing product behaviour is wrong: incorrect or missing data, sync delays beyond what is promised, mislabelling, errors, outages.',
      counterExamples: ['A complaint about a rep or CSM being slow to respond is not a product bug.', 'Confusion caused by the customer\'s own configuration is not a bug unless the product is at fault.'],
    },
    {
      key: 'pricing_objection',
      label: 'Pricing objection',
      definition: 'Push-back on cost, packaging, add-on charges, overages or contract terms.',
      counterExamples: ['A neutral question about when an invoice arrives is not an objection.'],
    },
    {
      key: 'competitor_mention',
      label: 'Competitor mention',
      definition: 'A named competitor (CallRail, Marchex, CallTrackingMetrics, WhatConverts, Gong where it overlaps) is being compared, evaluated, or is pitching the customer.',
      counterExamples: ['Partners Invoca integrates with (Google Ads, Salesforce, Genesys, Five9, Adobe) are not competitors.'],
    },
    {
      key: 'churn_risk',
      label: 'Churn risk',
      definition: 'An explicit or strongly implied risk of non-renewal, downgrade, seat or budget cuts, or replacing Invoca.',
      counterExamples: ['General frustration with no renewal, budget or replacement signal is not churn risk on its own.'],
    },
    {
      key: 'praise',
      label: 'Praise',
      definition: 'Specific positive feedback about a product capability or outcome.',
      counterExamples: ['Pleasantries ("thanks for your time", "great to see you") are not praise.'],
    },
  ],
  areas: [
    { key: 'call_tracking', label: 'Call Tracking & Attribution', definition: 'numbers, DNI, attribution, call routing, reporting on call sources' },
    { key: 'signal_ai', label: 'Signal AI', definition: 'Signal AI Studio/Discovery, call scoring, classification, spam detection, summaries' },
    { key: 'presense', label: 'PreSense', definition: 'digital intent and journey data passed to contact-center agents' },
    { key: 'integrations', label: 'Integrations', definition: 'Salesforce, Google Ads, Meta, Adobe, Five9, Genesys, NICE and other connectors, offline conversion sync, field mapping' },
    { key: 'quality_management', label: 'Quality Management', definition: 'AI-powered QM, agent scorecards, compliance checks' },
    { key: 'ai_agents', label: 'AI Agents', definition: 'AI Voice Agent and AI Messaging Agent' },
    { key: 'billing_pricing', label: 'Billing & Pricing', definition: 'contracts, add-ons, invoices, packaging' },
    { key: 'platform', label: 'Platform', definition: 'UI, permissions, SSO, HIPAA/redaction controls, anything else' },
  ],
};

/** Accept data/world/taxonomy.json in a few plausible shapes; fall back to the default. */
export function coerceTaxonomy(raw: unknown): Taxonomy {
  if (!raw || typeof raw !== 'object') return DEFAULT_TAXONOMY;
  const r = raw as Record<string, unknown>;
  const typesRaw = Array.isArray(r.types) ? r.types : Array.isArray(r.insightTypes) ? r.insightTypes : null;
  const areasRaw = Array.isArray(r.areas) ? r.areas : Array.isArray(r.productAreas) ? r.productAreas : null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const types = typesRaw
    ? typesRaw.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        const key = str(o.key ?? o.id ?? o.type);
        const fallback = DEFAULT_TAXONOMY.types.find((d) => d.key === key);
        const ce = o.counterExamples ?? o.counter_examples ?? o.notExamples ?? o.not;
        return {
          key,
          label: str(o.label ?? o.name) || fallback?.label || key,
          definition: str(o.definition ?? o.description) || fallback?.definition || '',
          counterExamples: Array.isArray(ce) ? ce.map(str).filter(Boolean) : fallback?.counterExamples ?? [],
        };
      }).filter((t) => DEFAULT_TAXONOMY.types.some((d) => d.key === t.key))
    : DEFAULT_TAXONOMY.types;
  const areas = areasRaw
    ? areasRaw.map((a) => {
        const o = (a ?? {}) as Record<string, unknown>;
        const key = str(o.key ?? o.id ?? o.area);
        const fallback = DEFAULT_TAXONOMY.areas.find((d) => d.key === key);
        return { key, label: str(o.label ?? o.name) || fallback?.label || key, definition: str(o.definition ?? o.description) || fallback?.definition || '' };
      }).filter((a) => DEFAULT_TAXONOMY.areas.some((d) => d.key === a.key))
    : DEFAULT_TAXONOMY.areas;
  return { types: types.length === 6 ? types : DEFAULT_TAXONOMY.types, areas: areas.length ? areas : DEFAULT_TAXONOMY.areas };
}
