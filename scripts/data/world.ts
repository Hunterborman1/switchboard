/**
 * The fictional Invoca-shaped world: accounts, people, seed routing rules and the taxonomy.
 * Run directly to write data/world/*.json:
 *   node --env-file=.env scripts/data/world.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Account,
  ARR_BANDS,
  Person,
  RoutingRule,
  type ArrBand,
  type InsightType,
  type ProductArea,
  type Severity,
} from '../../src/shared/contracts.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT, 'data');

export function arrBandFor(arrUsd: number): ArrBand {
  if (arrUsd < 50_000) return '<50k';
  if (arrUsd < 250_000) return '50k-250k';
  if (arrUsd <= 1_000_000) return '250k-1m';
  return '>1m';
}

type AccountSeed = Omit<Account, 'arrBand'>;

const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    id: 'acct_brightline', name: 'Brightline Home Services', vertical: 'home_services', tier: 'Enterprise',
    arrUsd: 310_000, seats: 85, products: ['call_tracking', 'signal_ai', 'presense', 'integrations'],
    renewalDate: '2027-01-15', health: 'watch', csmId: 'ppl_marcus', hq: 'Charlotte, NC',
    notes: 'HVAC, plumbing and electrical across 14 branches; bids on Google Ads Smart Bidding from Invoca offline conversions; PreSense added mid-term.',
  },
  {
    id: 'acct_meridian', name: 'Meridian Health Partners', vertical: 'healthcare', tier: 'Elite',
    arrUsd: 1_240_000, seats: 340, products: ['call_tracking', 'signal_ai', 'presense', 'integrations', 'quality_management'],
    renewalDate: '2027-06-30', health: 'healthy', csmId: 'ppl_priya', hq: 'Nashville, TN',
    notes: '38-clinic health system; central scheduling on Genesys; BAA in place and redaction is a standing agenda item.',
  },
  {
    id: 'acct_atlas', name: 'Atlas Auto Group', vertical: 'automotive', tier: 'Enterprise',
    arrUsd: 455_000, seats: 160, products: ['call_tracking', 'signal_ai', 'integrations'],
    renewalDate: '2026-12-01', health: 'at_risk', csmId: 'ppl_diego', hq: 'Phoenix, AZ',
    notes: '22 rooftops across AZ and NV; Marchex is quoting a lower per-rooftop price ahead of the December renewal.',
  },
  {
    id: 'acct_keystone', name: 'Keystone Mutual', vertical: 'insurance', tier: 'Elite',
    arrUsd: 1_580_000, seats: 420, products: ['call_tracking', 'signal_ai', 'presense', 'integrations', 'quality_management', 'ai_agents'],
    renewalDate: '2027-09-30', health: 'healthy', csmId: 'ppl_rachel', hq: 'Columbus, OH',
    notes: 'Auto and home carrier; Genesys contact center with 300+ licensed agents; piloting AI Voice Agent on after-hours claims intake.',
  },
  {
    id: 'acct_northwind', name: 'Northwind Telecom', vertical: 'telecom', tier: 'Elite',
    arrUsd: 920_000, seats: 280, products: ['call_tracking', 'signal_ai', 'presense', 'integrations', 'ai_agents'],
    renewalDate: '2027-03-31', health: 'watch', csmId: 'ppl_tom', hq: 'Denver, CO',
    notes: 'Regional fiber and wireless provider; PreSense screen pops into Genesys for sales; transfer issues raised twice this quarter.',
  },
  {
    id: 'acct_harbor', name: 'Harbor Federal Credit Union', vertical: 'financial_services', tier: 'Enterprise',
    arrUsd: 142_000, seats: 45, products: ['call_tracking', 'signal_ai', 'integrations', 'quality_management'],
    renewalDate: '2027-02-28', health: 'healthy', csmId: 'ppl_aisha', hq: 'Tacoma, WA',
    notes: '210k members; Salesforce Financial Services Cloud; compliance team reviews every QM scorecard change.',
  },
  {
    id: 'acct_sunpeak', name: 'SunPeak Solar', vertical: 'solar', tier: 'Enterprise',
    arrUsd: 268_000, seats: 70, products: ['call_tracking', 'signal_ai', 'integrations', 'ai_agents'],
    renewalDate: '2026-11-30', health: 'watch', csmId: 'ppl_diego', hq: 'Austin, TX',
    notes: 'Residential solar installer in TX, AZ and FL; bilingual sales floor; heavy Google Ads and Meta lead gen.',
  },
  {
    id: 'acct_cedarridge', name: 'Cedar Ridge Dental Group', vertical: 'healthcare', tier: 'Pro',
    arrUsd: 64_000, seats: 22, products: ['call_tracking', 'signal_ai', 'integrations'],
    renewalDate: '2027-04-15', health: 'healthy', csmId: 'ppl_priya', hq: 'Boise, ID',
    notes: '19 dental practices; new-patient calls drive Google Ads bidding; practice managers read call summaries daily.',
  },
  {
    id: 'acct_evergreen', name: 'Evergreen Pest & Lawn', vertical: 'home_services', tier: 'Pro',
    arrUsd: 38_000, seats: 12, products: ['call_tracking', 'signal_ai', 'integrations'],
    renewalDate: '2027-05-01', health: 'healthy', csmId: 'ppl_marcus', hq: 'Raleigh, NC',
    notes: 'Owner-operated, 6 locations; one marketing manager runs everything; price-sensitive and gets CallRail outreach.',
  },
  {
    id: 'acct_coastal', name: 'Coastal Comfort Mattress', vertical: 'retail', tier: 'Enterprise',
    arrUsd: 176_000, seats: 55, products: ['call_tracking', 'presense', 'integrations', 'ai_agents'],
    renewalDate: '2027-08-15', health: 'healthy', csmId: 'ppl_tom', hq: 'Tampa, FL',
    notes: '64 showrooms in the Southeast; Amazon Connect call center; launched AI Voice Agent for store-hours and order-status calls.',
  },
  {
    id: 'acct_ridgeway', name: 'Ridgeway Motor Group', vertical: 'automotive', tier: 'Pro',
    arrUsd: 92_000, seats: 30, products: ['call_tracking', 'signal_ai', 'integrations'],
    renewalDate: '2027-01-31', health: 'at_risk', csmId: 'ppl_diego', hq: 'Tulsa, OK',
    notes: 'Seven-rooftop dealer group; new GM since August is comparing Marchex; BDC relies on Google Ads call conversions.',
  },
  {
    id: 'acct_bluewater', name: 'Bluewater Insurance Partners', vertical: 'insurance', tier: 'Enterprise',
    arrUsd: 395_000, seats: 130, products: ['call_tracking', 'signal_ai', 'presense', 'integrations', 'quality_management'],
    renewalDate: '2027-07-31', health: 'watch', csmId: 'ppl_rachel', hq: 'Hartford, CT',
    notes: 'Independent agency network selling Medicare Advantage and P&C; Genesys plus Salesforce; QM rollout behind plan.',
  },
  {
    id: 'acct_prairielink', name: 'Prairie Link Broadband', vertical: 'telecom', tier: 'Enterprise',
    arrUsd: 214_000, seats: 60, products: ['call_tracking', 'integrations', 'ai_agents'],
    renewalDate: '2027-10-31', health: 'healthy', csmId: 'ppl_tom', hq: 'Sioux Falls, SD',
    notes: 'Rural fiber provider in five states; rebuilt its order flow as a single-page app in September; AI Voice Agent handles outage calls.',
  },
  {
    id: 'acct_frontier', name: 'Frontier Home Lending', vertical: 'financial_services', tier: 'Elite',
    arrUsd: 735_000, seats: 210, products: ['call_tracking', 'signal_ai', 'presense', 'integrations', 'quality_management'],
    renewalDate: '2027-04-30', health: 'healthy', csmId: 'ppl_aisha', hq: 'Dallas, TX',
    notes: 'Mortgage lender with a Five9 call center of 180 loan officers; Salesforce custom objects for loan applications.',
  },
];

export const ACCOUNTS: Account[] = ACCOUNT_SEEDS.map((a) => Account.parse({ ...a, arrBand: arrBandFor(a.arrUsd) }));

export const PEOPLE: Person[] = [
  // CSMs
  { id: 'ppl_marcus', name: 'Marcus Bell', role: 'csm', title: 'Senior Customer Success Manager', productArea: null, slackHandle: '@marcus.bell', email: 'marcus.bell@invoca.example', initials: 'MB' },
  { id: 'ppl_priya', name: 'Priya Raman', role: 'csm', title: 'Customer Success Manager, Healthcare', productArea: null, slackHandle: '@priya.raman', email: 'priya.raman@invoca.example', initials: 'PR' },
  { id: 'ppl_diego', name: 'Diego Alvarez', role: 'csm', title: 'Customer Success Manager', productArea: null, slackHandle: '@diego.alvarez', email: 'diego.alvarez@invoca.example', initials: 'DA' },
  { id: 'ppl_rachel', name: 'Rachel Okafor', role: 'csm', title: 'Principal Customer Success Manager', productArea: null, slackHandle: '@rachel.okafor', email: 'rachel.okafor@invoca.example', initials: 'RO' },
  { id: 'ppl_tom', name: 'Tom Lindqvist', role: 'csm', title: 'Senior Customer Success Manager', productArea: null, slackHandle: '@tom.lindqvist', email: 'tom.lindqvist@invoca.example', initials: 'TL' },
  { id: 'ppl_aisha', name: 'Aisha Coleman', role: 'csm', title: 'Customer Success Manager, Financial Services', productArea: null, slackHandle: '@aisha.coleman', email: 'aisha.coleman@invoca.example', initials: 'AC' },
  // CS leadership (owns churn escalations; holds no book of accounts)
  { id: 'ppl_renee', name: 'Renee Adams', role: 'csm', title: 'VP, Customer Success', productArea: null, slackHandle: '@renee.adams', email: 'renee.adams@invoca.example', initials: 'RA' },
  // Product managers, one per product area
  { id: 'ppl_nina', name: 'Nina Patel', role: 'pm', title: 'Senior PM, Call Tracking & Attribution', productArea: 'call_tracking', slackHandle: '@nina.patel', email: 'nina.patel@invoca.example', initials: 'NP' },
  { id: 'ppl_omar', name: 'Omar Haddad', role: 'pm', title: 'Group PM, Signal AI', productArea: 'signal_ai', slackHandle: '@omar.haddad', email: 'omar.haddad@invoca.example', initials: 'OH' },
  { id: 'ppl_lena', name: 'Lena Brooks', role: 'pm', title: 'PM, PreSense', productArea: 'presense', slackHandle: '@lena.brooks', email: 'lena.brooks@invoca.example', initials: 'LB' },
  { id: 'ppl_sam', name: 'Sam Whitaker', role: 'pm', title: 'Senior PM, Integrations', productArea: 'integrations', slackHandle: '@sam.whitaker', email: 'sam.whitaker@invoca.example', initials: 'SW' },
  { id: 'ppl_grace', name: 'Grace Liu', role: 'pm', title: 'PM, AI-Powered Quality Management', productArea: 'quality_management', slackHandle: '@grace.liu', email: 'grace.liu@invoca.example', initials: 'GL' },
  { id: 'ppl_ben', name: 'Ben Adeyemi', role: 'pm', title: 'PM, AI Agents', productArea: 'ai_agents', slackHandle: '@ben.adeyemi', email: 'ben.adeyemi@invoca.example', initials: 'BA' },
  { id: 'ppl_alex', name: 'Alex Romero', role: 'pm', title: 'PM, Platform & Reporting', productArea: 'platform', slackHandle: '@alex.romero', email: 'alex.romero@invoca.example', initials: 'AR' },
  // Leaders and specialists
  { id: 'ppl_elena', name: 'Elena Vasquez', role: 'vp_product', title: 'VP, Product', productArea: null, slackHandle: '@elena.vasquez', email: 'elena.vasquez@invoca.example', initials: 'EV' },
  { id: 'ppl_jordan', name: 'Jordan Reyes', role: 'competitive_intel', title: 'Competitive Intelligence Lead', productArea: null, slackHandle: '@jordan.reyes', email: 'jordan.reyes@invoca.example', initials: 'JR' },
  { id: 'ppl_kate', name: 'Kate Morrison', role: 'pricing', title: 'Director, Pricing & Packaging', productArea: 'billing_pricing', slackHandle: '@kate.morrison', email: 'kate.morrison@invoca.example', initials: 'KM' },
  { id: 'ppl_derek', name: 'Derek Shaw', role: 'support_escalation', title: 'Support Escalations Lead', productArea: null, slackHandle: '@derek.shaw', email: 'derek.shaw@invoca.example', initials: 'DS' },
  { id: 'ppl_mei', name: 'Mei Tanaka', role: 'eng_manager', title: 'Engineering Manager, Integrations', productArea: 'integrations', slackHandle: '@mei.tanaka', email: 'mei.tanaka@invoca.example', initials: 'MT' },
  { id: 'ppl_chris', name: 'Chris Donovan', role: 'sales_lead', title: 'RVP, Enterprise Sales', productArea: null, slackHandle: '@chris.donovan', email: 'chris.donovan@invoca.example', initials: 'CD' },
  { id: 'ppl_jamie', name: 'Jamie Fowler', role: 'triage', title: 'Product Operations (feedback triage)', productArea: null, slackHandle: '@jamie.fowler', email: 'jamie.fowler@invoca.example', initials: 'JF' },
].map((p) => Person.parse(p));

type RuleSeed = Omit<RoutingRule, 'workspaceId' | 'enabled'> & { enabled?: boolean };
const rule = (r: RuleSeed): RoutingRule => RoutingRule.parse({ workspaceId: 'seed', enabled: true, ...r });
const any = { types: null, areas: null, minSeverity: null, arrBands: null } as const;

export const ROUTING: RoutingRule[] = [
  rule({ id: 'rule_churn_exec', priority: 10, name: 'Churn risk on $250k+ accounts → CS leadership', match: { ...any, types: ['churn_risk'], arrBands: ['250k-1m', '>1m'] }, ownerId: 'ppl_renee', channel: 'slack', destination: '#cs-leadership' }),
  rule({ id: 'rule_churn_digest', priority: 15, name: 'Other churn risk → VP Product digest', match: { ...any, types: ['churn_risk'] }, ownerId: 'ppl_elena', channel: 'email_digest', destination: 'VP Product weekly digest' }),
  rule({ id: 'rule_pricing', priority: 20, name: 'Pricing objections → Pricing & Packaging', match: { ...any, types: ['pricing_objection'] }, ownerId: 'ppl_kate', channel: 'slack', destination: '#pricing-feedback' }),
  rule({ id: 'rule_competitor', priority: 30, name: 'Competitor mentions → Competitive Intel', match: { ...any, types: ['competitor_mention'] }, ownerId: 'ppl_jordan', channel: 'slack', destination: '#compete' }),
  rule({ id: 'rule_bug_critical', priority: 40, name: 'Critical bugs → Support escalations', match: { ...any, types: ['bug'], minSeverity: 'critical' }, ownerId: 'ppl_derek', channel: 'jira', destination: 'ESC' }),
  rule({ id: 'rule_bug_integrations', priority: 50, name: 'Integration bugs → Integrations engineering', match: { ...any, types: ['bug'], areas: ['integrations'] }, ownerId: 'ppl_mei', channel: 'jira', destination: 'INTG' }),
  rule({ id: 'rule_bug_signal_ai', priority: 51, name: 'Signal AI bugs → Signal AI team', match: { ...any, types: ['bug'], areas: ['signal_ai'] }, ownerId: 'ppl_omar', channel: 'jira', destination: 'SAI' }),
  rule({ id: 'rule_bug_presense', priority: 52, name: 'PreSense bugs → PreSense team', match: { ...any, types: ['bug'], areas: ['presense'] }, ownerId: 'ppl_lena', channel: 'jira', destination: 'PRES' }),
  rule({ id: 'rule_bug_other', priority: 59, name: 'All other bugs → Platform', match: { ...any, types: ['bug'] }, ownerId: 'ppl_alex', channel: 'jira', destination: 'PLAT' }),
  rule({ id: 'rule_feature_integrations', priority: 60, name: 'Integration requests → Integrations PM', match: { ...any, types: ['feature_request'], areas: ['integrations'] }, ownerId: 'ppl_sam', channel: 'linear', destination: 'Integrations' }),
  rule({ id: 'rule_feature_ai', priority: 61, name: 'AI requests (Signal AI, QM, Agents) → Signal AI PM', match: { ...any, types: ['feature_request'], areas: ['signal_ai', 'quality_management', 'ai_agents'] }, ownerId: 'ppl_omar', channel: 'linear', destination: 'Conversation AI' }),
  rule({ id: 'rule_feature_core', priority: 62, name: 'Other feature requests → Core product', match: { ...any, types: ['feature_request'] }, ownerId: 'ppl_nina', channel: 'linear', destination: 'Core Product' }),
  rule({ id: 'rule_praise', priority: 70, name: 'Praise → weekly wins digest', match: { ...any, types: ['praise'] }, ownerId: 'ppl_elena', channel: 'email_digest', destination: 'Weekly wins digest' }),
  rule({ id: 'rule_fallback', priority: 999, name: 'Fallback → Product Ops triage', match: { ...any }, ownerId: 'ppl_jamie', channel: 'triage', destination: 'Product Ops triage' }),
];

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** First-match routing (lowest priority wins), mirroring the pipeline's Route step. */
export function resolveRoute(
  rules: readonly RoutingRule[],
  insight: { type: InsightType; productArea: ProductArea; severity: Severity },
  arrBand: ArrBand | null,
): RoutingRule {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    const m = r.match;
    if (m.types && !m.types.includes(insight.type)) continue;
    if (m.areas && !m.areas.includes(insight.productArea)) continue;
    if (m.minSeverity && SEVERITY_RANK[insight.severity] < SEVERITY_RANK[m.minSeverity]) continue;
    if (m.arrBands && (!arrBand || !m.arrBands.includes(arrBand))) continue;
    return r;
  }
  throw new Error('no routing rule matched (fallback missing)');
}

export type TaxonomyEntry = { id: string; label: string; definition: string; examples: string[]; counterExamples: string[] };

export const TAXONOMY: {
  insightTypes: TaxonomyEntry[];
  productAreas: TaxonomyEntry[];
  severities: { id: Severity; label: string; definition: string }[];
} = {
  insightTypes: [
    {
      id: 'feature_request', label: 'Feature request',
      definition: 'The customer asks for a capability Invoca does not have today, or for an existing one to work differently.',
      examples: ['"Can we build our own QM scorecard criteria for disclosure language?"', '"We need to push dashboards into Looker without a CSV step."'],
      counterExamples: ['Something that should already work but is broken is a bug.', 'A request for training or a how-to answer is not a feature request.'],
    },
    {
      id: 'bug', label: 'Bug / defect',
      definition: 'An Invoca product or integration behaves incorrectly, loses data, is late, or contradicts its documented behaviour.',
      examples: ['"Offline conversions land in Google Ads two to three days late."', '"PreSense data disappears when Genesys transfers the call."'],
      counterExamples: ['A complaint about a rep, a slow support reply or a missed meeting is not a product bug.', 'Problems in the customer\'s own systems with no Invoca component are not bugs.'],
    },
    {
      id: 'pricing_objection', label: 'Pricing objection',
      definition: 'Pushback on price, packaging, add-ons, contract terms or perceived value for money.',
      examples: ['"Finance wants to know why PreSense is an add-on. It feels like paying twice."'],
      counterExamples: ['A competitor quoting a lower price is a competitor mention; log both only if the customer also objects to Invoca\'s price.', 'A billing error (wrong invoice) is a bug in billing, not an objection.'],
    },
    {
      id: 'competitor_mention', label: 'Competitor mention',
      definition: 'A named competitor is being evaluated, is pitching, or is used as a comparison (CallRail, Marchex, CallTrackingMetrics, WhatConverts, Gong).',
      examples: ['"CallRail is telling Jeff they sync conversions the same day."'],
      counterExamples: ['Mentioning a partner Invoca integrates with (Salesforce, Genesys, Five9) is not a competitor mention.'],
    },
    {
      id: 'churn_risk', label: 'Churn risk',
      definition: 'Signals that the customer may not renew, may reduce scope, or is actively considering leaving. Hedged threats count.',
      examples: ['"If this isn\'t fixed by renewal we\'ll have to look around."'],
      counterExamples: ['Routine budget planning with no threat to the relationship is not churn risk.', 'Frustration about one bug, with no link to renewal or scope, is the bug alone.'],
    },
    {
      id: 'praise', label: 'Praise',
      definition: 'Specific positive feedback about an Invoca capability or outcome that a product team would want to hear.',
      examples: ['"Our dispatchers love the AI call summaries."'],
      counterExamples: ['Politeness ("thanks, great call") is not praise.', 'Praise for the CSM personally, with no product angle, is not routed.'],
    },
  ],
  productAreas: [
    {
      id: 'call_tracking', label: 'Call Tracking & Attribution',
      definition: 'Tracking numbers, dynamic number insertion (DNI), the Invoca tag, call flows, campaign and keyword attribution, Advanced IVR.',
      examples: ['DNI numbers not swapping on a single-page checkout.', 'Calls attributed to the wrong campaign.'],
      counterExamples: ['Conversions arriving late in Google Ads are integrations, not attribution.'],
    },
    {
      id: 'signal_ai', label: 'Signal AI',
      definition: 'Signal AI Studio and Discovery: call classification, custom signals, spam detection, transcription, summaries, redaction.',
      examples: ['After-hours callers tagged as spam.', 'Transcripts not redacting a spoken date of birth.'],
      counterExamples: ['Scorecards for agent coaching belong to Quality Management.'],
    },
    {
      id: 'presense', label: 'PreSense',
      definition: 'Passing a caller\'s digital journey to contact-center agents and routing before the call is answered.',
      examples: ['Screen pop arrives blank after a Genesys transfer.'],
      counterExamples: ['The Genesys connector failing for all call data is integrations.'],
    },
    {
      id: 'integrations', label: 'Integrations',
      definition: 'Data flowing between Invoca and partner platforms: Google Ads, Meta, Adobe Analytics, Marketo, Salesforce, Five9, Genesys, NICE, Amazon Connect.',
      examples: ['Offline conversions late to Google Ads.', 'Salesforce field mapping breaking on custom objects.'],
      counterExamples: ['A missing PreSense field on transfer is PreSense, even when the platform is Genesys.'],
    },
    {
      id: 'quality_management', label: 'Quality Management',
      definition: 'AI-Powered Quality Management: automated scorecards, agent evaluation, coaching and compliance checks on 100% of calls.',
      examples: ['Custom scorecard criteria for required disclosures.'],
      counterExamples: ['A spam label on a call is Signal AI.'],
    },
    {
      id: 'ai_agents', label: 'AI Agents',
      definition: 'AI Voice Agent and AI Messaging Agent: automated answering, intake, SMS follow-up and handoff to live agents.',
      examples: ['Voice Agent transfers to a live agent without the caller\'s context.'],
      counterExamples: ['Human agents\' call handling quality is Quality Management.'],
    },
    {
      id: 'billing_pricing', label: 'Billing & Pricing',
      definition: 'Contracts, packaging, add-ons, seat and usage pricing, invoices and renewal terms.',
      examples: ['PreSense sold as an add-on at renewal.', 'Per-rooftop pricing versus a competitor.'],
      counterExamples: ['A reporting export limitation is platform even when raised in a renewal call.'],
    },
    {
      id: 'platform', label: 'Platform & Reporting',
      definition: 'Reporting, dashboards, exports, UI, permissions, user management and anything not covered elsewhere.',
      examples: ['Exporting dashboards to Looker or Google Sheets on a schedule.'],
      counterExamples: ['Problems inside a partner integration belong to integrations.'],
    },
  ],
  severities: [
    { id: 'low', label: 'Low', definition: 'Nice to have, cosmetic, or a single user\'s preference. No revenue impact.' },
    { id: 'medium', label: 'Medium', definition: 'A real workflow cost or a recurring annoyance; a workaround exists.' },
    { id: 'high', label: 'High', definition: 'Material business impact (spend, bidding, compliance, renewal) or no workaround.' },
    { id: 'critical', label: 'Critical', definition: 'Outage, data loss, a compliance exposure in progress, or an immediate threat to the account.' },
  ],
};

export function writeWorld(): void {
  const dir = join(DATA_DIR, 'world');
  mkdirSync(dir, { recursive: true });
  const ids = new Set(PEOPLE.map((p) => p.id));
  for (const a of ACCOUNTS) if (!ids.has(a.csmId)) throw new Error(`account ${a.id} has unknown CSM ${a.csmId}`);
  for (const r of ROUTING) if (!ids.has(r.ownerId)) throw new Error(`rule ${r.id} has unknown owner ${r.ownerId}`);
  if (!ARR_BANDS.length) throw new Error('unreachable');
  writeFileSync(join(dir, 'accounts.json'), JSON.stringify(ACCOUNTS, null, 2) + '\n');
  writeFileSync(join(dir, 'people.json'), JSON.stringify(PEOPLE, null, 2) + '\n');
  writeFileSync(join(dir, 'routing.json'), JSON.stringify(ROUTING, null, 2) + '\n');
  writeFileSync(join(dir, 'taxonomy.json'), JSON.stringify(TAXONOMY, null, 2) + '\n');
  console.log(`world: ${ACCOUNTS.length} accounts, ${PEOPLE.length} people, ${ROUTING.length} rules`);
}

export function accountById(id: string): Account {
  const a = ACCOUNTS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown account ${id}`);
  return a;
}

export function personById(id: string): Person {
  const p = PEOPLE.find((x) => x.id === id);
  if (!p) throw new Error(`unknown person ${id}`);
  return p;
}

if (import.meta.main) writeWorld();
