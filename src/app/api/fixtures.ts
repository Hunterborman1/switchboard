/**
 * DEV-ONLY fixture adapter (VITE_FIXTURES=1). Answers the same requests as the Worker API
 * with an in-memory workspace: runs progress through the 10 pipeline steps in real time,
 * review actions route insights and create deliveries, ticket changes notify the CSM.
 * Prefers the data agent's files under data/** when they exist, else the inline world in
 * ./fixtures-data. Never part of a production build (client.ts gates it on DEV).
 */
import {
  STEP_KEYS,
  THRESHOLDS,
  type Account,
  type Budget,
  type Channel,
  type CreateRun,
  type Delivery,
  type EvalRun,
  type Evidence,
  type GoldenLabel,
  type Insight,
  type InsightType,
  type LibraryFile,
  type Notification,
  type Person,
  type Redaction,
  type ReviewRecord,
  type RoutingRule,
  type Run,
  type RunStep,
  type ScreenOutput,
  type Session,
  type Severity,
  type StepKey,
  type Theme,
  type Turn,
} from '../../shared/contracts';
import { ApiError, type Fetched } from './client';
import { ACCOUNTS, FILES, PEOPLE, SEED_INSIGHTS, THEMES, type FixtureFile, type PlannedInsight } from './fixtures-data';
import type { EvalsData, HealthData, InsightDetail, ReviewPostBody, RoutingFlow, RunDetail, ThemeDetail } from './types';

// ---------------------------------------------------------------- optional data/** files

const worldJson = import.meta.glob('/data/world/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const libraryJson = import.meta.glob('/data/library.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const goldenJson = import.meta.glob('/data/golden/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const rawFiles = import.meta.glob('/data/files/**/*', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

function fromWorld<T>(name: string): T[] | null {
  const hit = Object.entries(worldJson).find(([p]) => p.endsWith(`/${name}.json`));
  const v = hit?.[1] as unknown;
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>)[name])) return (v as Record<string, T[]>)[name]!;
  return null;
}

const accounts: Account[] = (() => {
  const ext = fromWorld<Account>('accounts');
  if (!ext) return ACCOUNTS;
  const byId = new Map(ACCOUNTS.map((a) => [a.id, a]));
  for (const a of ext) byId.set(a.id, a);
  return [...byId.values()];
})();
const people: Person[] = (() => {
  const ext = fromWorld<Person>('people');
  if (!ext) return PEOPLE;
  const byId = new Map(PEOPLE.map((p) => [p.id, p]));
  for (const p of ext) byId.set(p.id, p);
  return [...byId.values()];
})();

function goldenFor(fileId: string): GoldenLabel | null {
  const hit = Object.entries(goldenJson).find(([p]) => p.includes(fileId));
  return (hit?.[1] as GoldenLabel | undefined) ?? null;
}

function rawFor(file: LibraryFile): string | null {
  const hit = Object.entries(rawFiles).find(([p]) => p.endsWith(`/${file.filename}`) || p.includes(file.id));
  return hit?.[1] ?? null;
}

const fixtureFiles: FixtureFile[] = (() => {
  const ext = Object.values(libraryJson)[0];
  const list = Array.isArray(ext) ? (ext as LibraryFile[]) : null;
  if (!list) return FILES;
  const inline = new Map(FILES.map((f) => [f.id, f]));
  return list
    .filter((f) => f.featured)
    .map((f) => {
      const inl = inline.get(f.id);
      const golden = goldenFor(f.id);
      const raw = rawFor(f);
      const content = raw ?? inl?.content ?? '';
      const lvl = f.messLevel ?? 2;
      let insights: PlannedInsight[] =
        raw && golden
          ? golden.insights.map((g, i) => ({
              type: g.type, area: g.productArea, severity: g.severity, summary: g.summary, quote: g.quote,
              conf: Math.max(0.6, Math.min(0.97, 0.98 - lvl * 0.012 - ((i * 7) % 5) * 0.018)),
              fuzzy: lvl >= 4 ? 0.9 + ((i * 3) % 5) / 100 : undefined,
              sentiment: g.type === 'praise' ? 'positive' : g.type === 'competitor_mention' ? 'mixed' : 'negative',
            }))
          : inl?.insights ?? [];
      // The walkthrough's main path shows one hallucinated quote being dropped by grounding.
      if (f.recommended && raw && insights.length > 2) {
        const victim = insights.findIndex((x) => x.type === 'bug' && x.area === 'signal_ai');
        const k = victim >= 0 ? victim : 2;
        const v = insights[k]!;
        insights = insights.map((x, i) =>
          i === k ? { ...v, hallucinated: 'Signal AI flagged about a third of our after-hours callers as spam last month, almost all real customers' } : x,
        );
      }
      const injection = f.edgeKind === 'injection' ? injectionExcerpt(content) : undefined;
      const language = f.edgeKind === 'non_english' ? 'es' : undefined;
      return { ...f, content, insights, injection, language, phiTokens: golden?.phiTokens ?? [] } as FixtureFile;
    });
})();

function injectionExcerpt(content: string): string | undefined {
  const line = content
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => /ignore (all|any|previous)|automated assistants|system:|new instructions|you are now|disregard|assistant:|\[ai\]|reveal your/i.test(l));
  return line ? line.slice(0, 280) : undefined;
}

const library: LibraryFile[] = fixtureFiles.map(({ content, insights: _i, language: _l, injection: _x, phiTokens: _p, ...f }) => ({
  ...f,
  featured: true,
  sizeBytes: new TextEncoder().encode(content).length,
}));

// ---------------------------------------------------------------- helpers

const NOW0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const day = 86_400_000;
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const PRIMARY = 'deepseek/deepseek-v4.1-flash';
const SECONDARY = 'anthropic/claude-haiku-5.5';
const PROMPT_VERSION = 'extract@v4';

function fakeSha(text: string): string {
  let h1 = 0x811c9dc5;
  let out = '';
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i) + round;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    out += h1.toString(16).padStart(8, '0');
  }
  return out;
}

const accountById = (id: string | null | undefined) => accounts.find((a) => a.id === id) ?? null;
const personById = (id: string | null | undefined) => people.find((p) => p.id === id) ?? null;
const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function mask(value: string): string {
  return value
    .split(/(\s+)/)
    .map((w) => (/\s/.test(w) ? w : w.length <= 1 ? '•' : `${w[0]}${'•'.repeat(Math.min(w.length - 1, 6))}`))
    .join('');
}

// ---------------------------------------------------------------- parsing + redaction

type RawTurn = { speaker: string; ts: string | null; text: string };

function parse(file: { format: string; content: string }): RawTurn[] {
  const c = file.content.replace(/\r\n/g, '\n');
  if (file.format === 'vtt') {
    const out: RawTurn[] = [];
    const blocks = c.split(/\n\n+/);
    for (const b of blocks) {
      const m = b.match(/(\d\d:\d\d:\d\d)\.\d+\s+-->[^\n]*\n([\s\S]*)/);
      if (!m) continue;
      const body = m[2]!.trim();
      const v = body.match(/^<v ([^>]+)>([\s\S]*)$/);
      const sp = body.match(/^([^:\n]{1,48}):\s+([\s\S]*)$/);
      if (v) out.push({ ts: m[1]!, speaker: v[1]!.trim(), text: v[2]!.trim().replace(/\n/g, ' ') });
      else if (sp) out.push({ ts: m[1]!, speaker: sp[1]!.trim(), text: sp[2]!.trim().replace(/\n/g, ' ') });
      else out.push({ ts: m[1]!, speaker: 'unknown', text: body.replace(/\n/g, ' ') });
    }
    return out;
  }
  if (file.format === 'txt') {
    return c
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const m = l.match(/^\[(\d\d:\d\d:\d\d)\]\s*([^:]+):\s*(.*)$/);
        if (m) return { ts: m[1]!, speaker: m[2]!.trim(), text: m[3]!.trim() };
        const sl = l.match(/^\[[\d/]+ (\d{1,2}:\d\d\s*[AP]M)\]\s*([^:]+):\s*(.*)$/);
        if (sl) return { ts: sl[1]!, speaker: sl[2]!.trim(), text: sl[3]!.trim() };
        const m2 = l.match(/^([a-z][\w .()-]{0,30}):\s*(.*)$/i);
        if (m2) return { ts: null, speaker: m2[1]!.trim(), text: m2[2]!.trim() };
        return { ts: null, speaker: 'unknown', text: l.trim() };
      });
  }
  if (file.format === 'chat') {
    return c
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const m = l.match(/^(\w+)\s+(\d{1,2}:\d\d\s*[AP]M):\s*(.*)$/);
        return m ? { speaker: m[1]!, ts: m[2]!, text: m[3]! } : { speaker: 'unknown', ts: null, text: l };
      });
  }
  if (file.format === 'eml') {
    const [head, ...rest] = c.split('\n\n');
    const from = head?.match(/^From:\s*(.*)$/m)?.[1]?.replace(/<.*>/, '').trim() ?? 'sender';
    return rest
      .join('\n\n')
      .split(/\n\n+/)
      .map((p) => p.replace(/^>\s?/gm, '').trim())
      .filter(Boolean)
      .map((p) => ({ speaker: from, ts: null, text: p.replace(/\n/g, ' ') }));
  }
  // md notes: one turn per bullet / paragraph
  return c
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => ({ speaker: 'CSM notes', ts: null, text: l.replace(/^[-*]\s+/, '') }));
}

const KNOWN_NAMES = ['Jake Moreno', 'Jake', 'Maria Delgado', 'Rita'];

function redactAll(rawTurns: RawTurn[], phiHeavy: boolean, phiTokens: string[] = []): { turns: Turn[]; redactions: Redaction[]; doc: string } {
  const counters: Record<string, number> = {};
  const tokenFor = new Map<string, { token: string; kind: Redaction['kind']; preview: string; count: number }>();
  const tok = (kind: Redaction['kind'], label: string, value: string) => {
    const key = `${kind}:${value.toLowerCase()}`;
    let t = tokenFor.get(key);
    if (!t) {
      counters[label] = (counters[label] ?? 0) + 1;
      t = { token: `[${label}_${counters[label]}]`, kind, preview: kind === 'phone' ? value.replace(/\d(?=.*\d{2})/g, '•') : kind === 'email' ? `${value[0]}•••@${value.split('@')[1]?.[0] ?? ''}•••` : kind === 'dob' ? '••/••/19••' : kind === 'mrn' ? '•••-••-' + value.slice(-3) : mask(value), count: 0 };
      tokenFor.set(key, t);
    }
    t.count++;
    return t.token;
  };
  const rules: [RegExp, Redaction['kind'], string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'email', 'EMAIL'],
    [/\(?\b\d{3}\)?[ -.]\d{3}-\d{4}\b/g, 'phone', 'PHONE'],
    [/\b\d{2}\/\d{2}\/\d{4}\b/g, 'dob', 'DOB'],
    [/\b\d{3}-\d{2}-\d{3}\b/g, 'mrn', 'MRN'],
  ];
  let start = 0;
  const turns: Turn[] = [];
  const parts: string[] = [];
  const staffNames = new Set(people.map((p) => p.name.split(' ')[0]!.toLowerCase()));
  const customerNames = [...new Set(rawTurns.map((t) => t.speaker.replace(/\(.*\)/, '').trim()))]
    .filter((n) => /^[A-Z][a-z]+( [A-Z][a-z]+)?$/.test(n) && !staffNames.has(n.split(' ')[0]!.toLowerCase()) && !/^(CSM|Unknown|Speaker)/i.test(n));
  rawTurns.forEach((rt, i) => {
    let text = rt.text;
    for (const [re, kind, label] of rules) text = text.replace(re, (m) => tok(kind, label, m));
    for (const t of phiTokens) {
      if (!t || !text.includes(t)) continue;
      const kind: Redaction['kind'] = /^\(?\d{3}\)?[ -.]\d{3}-\d{4}$/.test(t) ? 'phone' : /^\d{6,}$/.test(t) ? 'mrn' : /\d{4}$/.test(t) && /[A-Z][a-z]+ \d/.test(t) ? 'dob' : /\d+ [A-Z]/.test(t) ? 'address' : 'patient';
      const label = kind === 'phone' ? 'PHONE' : kind === 'mrn' ? 'MRN' : kind === 'dob' ? 'DOB' : kind === 'address' ? 'ADDRESS' : 'PATIENT';
      text = text.split(t).join(tok(kind, label, t));
    }
    for (const full of customerNames) {
      for (const part of [full, full.split(' ')[0]!]) {
        const re = new RegExp(`\\b${part}\\b`, 'g');
        if (re.test(text)) text = text.replace(re, () => tok('person', 'PERSON', full));
      }
    }
    for (const name of KNOWN_NAMES) {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      text = text.replace(re, (m) => (phiHeavy && name === 'Maria Delgado' ? tok('patient', 'PATIENT', m) : tok('person', 'PERSON', m.split(' ')[0] === 'Jake' ? 'Jake Moreno' : m)));
    }
    const isStaff = people.some((p) => rt.speaker.toLowerCase().startsWith(p.name.toLowerCase()) || rt.speaker.toLowerCase() === p.slackHandle.replace('@', '').toLowerCase());
    const role: Turn['role'] = isStaff || /\(invoca\)/i.test(rt.speaker) || /^(jordan|sam|leah|marcus|dev|ana)$/i.test(rt.speaker) || rt.speaker === 'CSM notes'
      ? 'invoca'
      : /unknown|speaker/i.test(rt.speaker)
        ? 'unknown'
        : 'customer';
    turns.push({ id: `t${String(i + 1).padStart(3, '0')}`, speaker: rt.speaker, role, ts: rt.ts, text, start, end: start + text.length });
    parts.push(text);
    start += text.length + 1;
  });
  return { turns, redactions: [...tokenFor.values()].map(({ token, kind, preview, count }) => ({ token, kind, preview, count })), doc: parts.join('\n') };
}

function locate(doc: string, turns: Turn[], quote: string): { start: number; end: number; turnId: string | null; exact: boolean } | null {
  let i = doc.indexOf(quote);
  let exact = true;
  if (i < 0) {
    i = doc.toLowerCase().indexOf(quote.toLowerCase());
    exact = false;
  }
  if (i < 0) return null;
  const turn = turns.find((t) => i >= t.start && i < t.end) ?? null;
  return { start: i, end: i + quote.length, turnId: turn?.id ?? null, exact };
}

// ---------------------------------------------------------------- routing rules

const SEED_RULES: RoutingRule[] = [
  { id: 'rule_churn', workspaceId: 'seed', priority: 10, name: 'Churn risk → VP Product', match: { types: ['churn_risk'], areas: null, minSeverity: null, arrBands: null }, ownerId: 'ppl_rachel', channel: 'slack', destination: '#vp-product-escalations', enabled: true },
  { id: 'rule_sev1', workspaceId: 'seed', priority: 20, name: 'Critical bugs → Support escalations', match: { types: ['bug'], areas: null, minSeverity: 'critical', arrBands: null }, ownerId: 'ppl_luis', channel: 'jira', destination: 'ESC', enabled: true },
  { id: 'rule_pricing_large', workspaceId: 'seed', priority: 30, name: 'Pricing objections, accounts over $250k', match: { types: ['pricing_objection'], areas: null, minSeverity: null, arrBands: ['250k-1m', '>1m'] }, ownerId: 'ppl_mia', channel: 'slack', destination: '#pricing-desk', enabled: true },
  { id: 'rule_pricing', workspaceId: 'seed', priority: 40, name: 'Pricing objections (all)', match: { types: ['pricing_objection'], areas: null, minSeverity: null, arrBands: null }, ownerId: 'ppl_mia', channel: 'email_digest', destination: 'Pricing weekly digest', enabled: true },
  { id: 'rule_competitor', workspaceId: 'seed', priority: 50, name: 'Competitor mentions', match: { types: ['competitor_mention'], areas: null, minSeverity: null, arrBands: null }, ownerId: 'ppl_kevin', channel: 'slack', destination: '#competitive-intel', enabled: true },
  { id: 'rule_integrations', workspaceId: 'seed', priority: 60, name: 'Integrations requests & bugs', match: { types: ['feature_request', 'bug'], areas: ['integrations'], minSeverity: null, arrBands: null }, ownerId: 'ppl_priya', channel: 'jira', destination: 'INTG', enabled: true },
  { id: 'rule_signal_ai', workspaceId: 'seed', priority: 70, name: 'Signal AI', match: { types: ['feature_request', 'bug', 'churn_risk'], areas: ['signal_ai'], minSeverity: null, arrBands: null }, ownerId: 'ppl_tomas', channel: 'linear', destination: 'Signal AI team', enabled: true },
  { id: 'rule_presense', workspaceId: 'seed', priority: 80, name: 'PreSense', match: { types: null, areas: ['presense'], minSeverity: null, arrBands: null }, ownerId: 'ppl_omar', channel: 'linear', destination: 'PreSense', enabled: true },
  { id: 'rule_qm', workspaceId: 'seed', priority: 85, name: 'Quality Management', match: { types: null, areas: ['quality_management'], minSeverity: null, arrBands: null }, ownerId: 'ppl_grace', channel: 'jira', destination: 'QM', enabled: true },
  { id: 'rule_agents', workspaceId: 'seed', priority: 88, name: 'AI Agents', match: { types: null, areas: ['ai_agents'], minSeverity: null, arrBands: null }, ownerId: 'ppl_nate', channel: 'linear', destination: 'AI Agents', enabled: true },
  { id: 'rule_ct', workspaceId: 'seed', priority: 90, name: 'Call Tracking & Attribution', match: { types: null, areas: ['call_tracking'], minSeverity: null, arrBands: null }, ownerId: 'ppl_hannah', channel: 'jira', destination: 'CT', enabled: true },
  { id: 'rule_praise', workspaceId: 'seed', priority: 95, name: 'Praise → weekly PM digest', match: { types: ['praise'], areas: null, minSeverity: null, arrBands: null }, ownerId: 'ppl_elena', channel: 'email_digest', destination: 'Weekly PM digest', enabled: true },
  { id: 'rule_fallback', workspaceId: 'seed', priority: 999, name: 'Fallback → triage', match: { types: null, areas: null, minSeverity: null, arrBands: null }, ownerId: 'ppl_triage', channel: 'triage', destination: 'Product Ops triage', enabled: true },
];
const dataRules = fromWorld<RoutingRule>('routing');
if (dataRules?.length) SEED_RULES.splice(0, SEED_RULES.length, ...dataRules.sort((a, b) => a.priority - b.priority));
const ruleOverrides = new Map<string, RoutingRule>();
const effectiveRules = () => SEED_RULES.map((r) => ruleOverrides.get(r.id) ?? r).sort((a, b) => a.priority - b.priority);

function matchRule(rules: RoutingRule[], ins: Pick<Insight, 'type' | 'productArea' | 'severity' | 'accountId'>): RoutingRule {
  const acct = accountById(ins.accountId);
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (!r.enabled) continue;
    if (r.match.types && !r.match.types.includes(ins.type)) continue;
    if (r.match.areas && !r.match.areas.includes(ins.productArea)) continue;
    if (r.match.minSeverity && SEV_RANK[ins.severity] < SEV_RANK[r.match.minSeverity]) continue;
    if (r.match.arrBands && (!acct || !r.match.arrBands.includes(acct.arrBand))) continue;
    return r;
  }
  return SEED_RULES[SEED_RULES.length - 1]!;
}

// ---------------------------------------------------------------- stores

const insights = new Map<string, Insight>();
const deliveries = new Map<string, Delivery>();
const notifications = new Map<string, Notification>();
const reviews: ReviewRecord[] = [];
const idempotency = new Map<string, unknown>();
let ticketSeq = 482;
const themeExtra = new Map<string, number>();
let spentUsd = 3.1184;
let liveRuns = 214;
let replayRuns = 37;

const TYPE_PRIOR: Record<InsightType, number> = { feature_request: 0.97, bug: 0.98, pricing_objection: 0.9, competitor_mention: 0.95, churn_risk: 0.97, praise: 0.99 };

function gateFor(type: InsightType, severity: Severity, final: number): { gate: Insight['gate']; reasons: string[] } {
  const reasons: string[] = [];
  if (type === 'churn_risk') reasons.push('churn_risk is always reviewed');
  if (type === 'bug' && severity === 'critical') reasons.push('sev-1 bug always reviewed');
  if (final < THRESHOLDS.review) return { gate: 'held', reasons: [`confidence ${final.toFixed(2)} < ${THRESHOLDS.review.toFixed(2)}`, ...reasons] };
  if (final < THRESHOLDS.autoRoute) reasons.unshift(`confidence ${final.toFixed(2)} < ${THRESHOLDS.autoRoute.toFixed(2)}`);
  if (reasons.length) return { gate: 'review', reasons };
  return { gate: 'auto_route', reasons: [`confidence ${final.toFixed(2)} ≥ ${THRESHOLDS.autoRoute.toFixed(2)}`] };
}

function themeForInsight(type: InsightType, area: string, summary: string): string | null {
  const s = summary.toLowerCase();
  if (area === 'integrations' && /google ads|offline conversion/.test(s)) return 'thm_offline_conv';
  if (area === 'signal_ai' && /spam/.test(s)) return 'thm_spam_repeat';
  if (area === 'presense' && /transfer/.test(s)) return 'thm_presense_transfer';
  if (type === 'pricing_objection') return 'thm_addon_bundle';
  if (type === 'competitor_mention' && /price|free|cheaper|plan/.test(s)) return 'thm_callrail_price';
  if (area === 'quality_management' && /redact|mrn|phi/.test(s)) return 'thm_hipaa_qm';
  if (area === 'integrations' && /salesforce/.test(s)) return 'thm_sf_mapping';
  if (area === 'ai_agents' && /hand ?off/.test(s)) return 'thm_agent_handoff';
  return null;
}

function payloadFor(ins: Insight, channel: Channel, destination: string, receipt: string | null): Record<string, unknown> {
  const acct = accountById(ins.accountId);
  const quote = ins.evidence.find((e) => e.method !== 'failed')?.matchedText ?? ins.evidence[0]?.quote ?? '';
  const csm = personById(ins.csmId);
  const base = {
    title: ins.summary,
    quote,
    account: acct?.name ?? 'Unknown account',
    arrUsd: acct?.arrUsd ?? null,
    renewalDate: acct?.renewalDate ?? null,
    type: ins.type,
    productArea: ins.productArea,
    severity: ins.severity,
    csm: csm?.name ?? null,
    confidence: ins.confidenceFinal,
    callId: null as string | null,
  };
  if (channel === 'jira' || channel === 'linear') {
    return {
      ...base,
      key: receipt,
      summary: ins.summary,
      description: `${ins.rationale || ins.summary}\n\nEvidence ("${quote}") from ${acct?.name ?? 'a customer'}${csm ? `, reported by ${csm.name}` : ''}.`,
      labels: ['signal-loop', ins.type.replace('_', '-'), ins.productArea.replace('_', '-')],
      priority: ins.severity === 'critical' ? 'Highest' : ins.severity === 'high' ? 'High' : ins.severity === 'medium' ? 'Medium' : 'Low',
      project: destination,
    };
  }
  if (channel === 'slack') return { ...base, channel: destination, bot: 'Signal Loop' };
  return { ...base, digest: destination };
}

function createDelivery(ins: Insight, at: number): Delivery {
  const rule = effectiveRules().find((r) => r.id === ins.ruleId) ?? matchRule(effectiveRules(), ins);
  const channel = rule.channel;
  const receipt =
    channel === 'jira' ? `${rule.destination}-${ticketSeq++}` : channel === 'linear' ? `${rule.destination.split(' ')[0]!.toUpperCase().slice(0, 4)}-${ticketSeq++ - 300}` : channel === 'slack' ? `${Math.floor(at / 1000)}.${String(ticketSeq++).padStart(4, '0')}` : channel === 'email_digest' ? `digest-2026-W43` : `triage-${ticketSeq++}`;
  const retried = ins.id.charCodeAt(ins.id.length - 1) % 5 === 0;
  const attempts = retried
    ? [
        { at: iso(at), ok: false, ms: 1820, note: '503 from destination; retrying with backoff' },
        { at: iso(at + 2100), ok: true, ms: 240, note: 'delivered on retry' },
      ]
    : [{ at: iso(at), ok: true, ms: 180 + (ins.id.length * 37) % 300, note: 'delivered' }];
  const d: Delivery = {
    id: rid('dlv'),
    workspaceId: ins.workspaceId,
    insightId: ins.id,
    channel,
    destination: rule.destination,
    ownerId: rule.ownerId,
    status: 'delivered',
    attempts,
    receipt,
    payload: payloadFor(ins, channel, rule.destination, receipt),
    ticketState: channel === 'jira' || channel === 'linear' ? 'open' : null,
    createdAt: iso(at),
  };
  deliveries.set(d.id, d);
  if (ins.csmId) {
    const n: Notification = {
      id: rid('ntf'),
      workspaceId: ins.workspaceId,
      csmId: ins.csmId,
      insightId: ins.id,
      kind: 'routed',
      title: `Your ${ins.type.replace('_', ' ')} from ${accountById(ins.accountId)?.name ?? 'a customer'} reached ${personById(rule.ownerId)?.name ?? 'its owner'}`,
      body: `${ins.summary} Routed to ${rule.destination} (${channel.replace('_', ' ')}).`,
      draftCustomerNote: null,
      read: false,
      createdAt: iso(at + 500),
    };
    notifications.set(n.id, n);
  }
  return d;
}

function buildEvidence(doc: string, turns: Turn[], p: PlannedInsight): Evidence {
  if (p.hallucinated) {
    const loc = locate(doc, turns, p.quote);
    return { quote: p.hallucinated, turnId: loc?.turnId ?? null, start: loc?.start ?? null, end: loc?.end ?? null, matchedText: p.quote, score: 0.62, method: 'failed' };
  }
  const loc = locate(doc, turns, p.quote);
  if (!loc) return { quote: p.quote, turnId: null, start: null, end: null, matchedText: null, score: 0.4, method: 'failed' };
  if (p.fuzzy) {
    return { quote: p.quote.replace(/\b(um|uh)\b ?/g, '').replace(/cuz/g, 'because').replace(/dont/g, "don't").replace(/cant/g, "can't"), turnId: loc.turnId, start: loc.start, end: loc.end, matchedText: doc.slice(loc.start, loc.end), score: p.fuzzy, method: 'fuzzy' };
  }
  return { quote: p.quote, turnId: loc.turnId, start: loc.start, end: loc.end, matchedText: doc.slice(loc.start, loc.end), score: loc.exact ? 1 : 0.98, method: loc.exact ? 'exact' : 'normalized' };
}

function makeInsight(args: { id?: string; runId: string; workspaceId: string; accountId: string | null; p: PlannedInsight; ev: Evidence; createdAt: number }): Insight {
  const { p, ev } = args;
  const acct = accountById(args.accountId);
  const groundingScore = ev.method === 'failed' ? ev.score : ev.score;
  const acctCtx = acct && acct.health === 'at_risk' ? 1.0 : 1.0;
  const final = Math.round(p.conf * (ev.method === 'failed' ? 0 : groundingScore) * TYPE_PRIOR[p.type] * acctCtx * 100) / 100;
  const g = ev.method === 'failed' ? { gate: 'dropped' as const, reasons: [`grounding ${ev.score.toFixed(2)} < ${THRESHOLDS.grounding.toFixed(2)}`, 'quote not found in transcript'] } : gateFor(p.type, p.severity, final);
  const ins: Insight = {
    id: args.id ?? rid('ins'),
    workspaceId: args.workspaceId,
    runId: args.runId,
    accountId: args.accountId,
    csmId: acct?.csmId ?? null,
    type: p.type,
    summary: p.summary,
    productArea: p.area,
    severity: p.severity,
    sentiment: p.sentiment ?? 'negative',
    rationale: p.rationale ?? 'Customer statement with a verbatim quote; type and area follow the taxonomy definitions.',
    evidence: [ev],
    confidenceModel: p.conf,
    groundingScore: ev.score,
    confidenceFinal: final,
    gate: g.gate,
    gateReasons: g.reasons,
    status: g.gate === 'dropped' ? 'dropped_ungrounded' : g.gate === 'auto_route' ? 'routed' : g.gate === 'review' ? 'pending_review' : 'held',
    themeId: g.gate === 'dropped' ? null : themeForInsight(p.type, p.area, p.summary),
    ownerId: null,
    channel: null,
    ruleId: null,
    promptVersion: PROMPT_VERSION,
    model: PRIMARY,
    createdAt: iso(args.createdAt),
  };
  if (ins.gate !== 'dropped') {
    const rule = matchRule(effectiveRules(), ins);
    ins.ownerId = rule.ownerId;
    ins.channel = rule.channel;
    ins.ruleId = rule.id;
  }
  return ins;
}

// ---------------------------------------------------------------- runs

type SimStep = { key: StepKey; ms: number; status: RunStep['status']; model?: string; tin?: number; tout?: number; cost?: number; summary: string; detail: Record<string, unknown> };
type SimRun = {
  run: Run;
  t0: number;
  steps: SimStep[];
  turns: Turn[];
  redactions: Redaction[];
  screen: ScreenOutput;
  planned: Insight[];
  committed: boolean;
};
const runs = new Map<string, SimRun>();

function planRun(opts: { file: FixtureFile | null; text?: string; filename: string; mode: Run['mode']; t0: number; seed?: boolean; workspaceId: string; id?: string }): SimRun {
  const { file, t0 } = opts;
  const content = file?.content ?? opts.text ?? '';
  const format = file?.format ?? (/^WEBVTT/.test(content) ? 'vtt' : /^\[\d\d:/.test(content) ? 'txt' : 'md');
  const sha = fakeSha(content);
  const duplicateOf = file?.edgeKind === 'duplicate' ? [...runs.values()].find((r) => r.run.sha256 === sha && r.run.fileId !== file.id) : undefined;
  const isDuplicate = file?.edgeKind === 'duplicate';
  const phiHeavy = file?.edgeKind === 'phi_heavy';
  const { turns, redactions, doc } = redactAll(parse({ format, content }), phiHeavy, (file as (FixtureFile & { phiTokens?: string[] }) | null)?.phiTokens ?? []);
  const negative = file?.edgeKind === 'nothing_actionable' || (!file && !/(wish|need|want|bug|broken|price|expensive|competitor|cancel|churn|slow|love)/i.test(content));
  const injection = file?.injection ?? null;
  const language = file?.language ?? 'en';
  const runId = opts.id ?? rid('run');

  let plannedP: PlannedInsight[] = file?.insights ?? [];
  if (!file && !negative) {
    const sentence = content.split(/(?<=[.!?])\s+/).find((s) => /(wish|need|want|bug|broken|price|expensive|competitor|cancel|churn|slow|love)/i.test(s)) ?? content.slice(0, 120);
    const quote = sentence.trim().slice(0, 140);
    plannedP = [{ type: /price|expensive/i.test(quote) ? 'pricing_objection' : /bug|broken|slow/i.test(quote) ? 'bug' : /love/i.test(quote) ? 'praise' : 'feature_request', area: 'platform', severity: 'medium', conf: 0.82, summary: quote.length > 100 ? `${quote.slice(0, 97)}…` : quote, quote }];
  }
  const planned = negative || isDuplicate ? [] : plannedP.map((p, i) => makeInsight({ runId, workspaceId: opts.workspaceId, accountId: file?.accountId ?? null, p, ev: buildEvidence(doc, turns, p), createdAt: t0 + 4200 + i * 40 }));
  const kept = planned.filter((i) => i.gate !== 'dropped');
  const dropped = planned.filter((i) => i.gate === 'dropped');
  const byKind = redactions.reduce<Record<string, number>>((acc, r) => ((acc[r.kind] = (acc[r.kind] ?? 0) + r.count), acc), {});
  const redCount = redactions.reduce((a, r) => a + r.count, 0);
  const screen: ScreenOutput = {
    actionable: !negative && !isDuplicate,
    language,
    injection_suspected: !!injection,
    injection_excerpt: injection,
    call_kind: (file?.callType === 'QBR' ? 'qbr' : file?.callType === 'renewal' ? 'renewal' : file?.callType === 'escalation' ? 'escalation' : file?.callType === 'onboarding' ? 'onboarding' : file?.callType === 'notes' ? 'notes' : file?.format === 'eml' ? 'email' : 'check_in') as ScreenOutput['call_kind'],
    reason: negative ? 'Friendly check-in; no product feedback, requests, objections or risks.' : injection ? 'Contains embedded instructions addressed to an AI system; treated as data. Product feedback present.' : 'Customer raises product feedback with concrete examples.',
  };
  const fast = file?.messLevel === 1;
  const modelScale = language !== 'en' ? 1.2 : 1;
  const steps: SimStep[] = [
    { key: 'ingest', ms: 140, status: isDuplicate ? 'warned' : 'passed', summary: isDuplicate ? `Duplicate upload: same SHA-256 as ${duplicateOf?.run.id ?? 'an earlier run of C-1042'}; skipped` : `Stored ${new TextEncoder().encode(content).length.toLocaleString()} bytes · SHA-256 ${sha.slice(0, 12)}…`, detail: { sha256: sha, bytes: content.length, duplicateOf: isDuplicate ? duplicateOf?.run.id ?? 'run_seed_C-1042' : null } },
    { key: 'normalize', ms: 190, status: 'passed', summary: `Parsed ${format.toUpperCase()} into ${turns.length} turns · ${new Set(turns.map((t) => t.speaker)).size} speakers`, detail: { format, turns: turns.length, speakers: [...new Set(turns.map((t) => t.speaker))] } },
    { key: 'redact', ms: 230, status: 'passed', summary: redCount ? `Redacted ${redCount} value${redCount === 1 ? '' : 's'} (${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')})` : 'No PII or PHI found', detail: { count: redCount, byKind } },
    { key: 'screen', ms: Math.round(820 * modelScale), status: injection ? 'warned' : 'passed', model: PRIMARY, tin: 1460, tout: 64, cost: 0.00031, summary: negative ? 'Not actionable: friendly check-in' : injection ? 'Injection suspected: embedded instructions treated as data' : `Actionable · ${language === 'en' ? 'English' : 'Spanish (es)'} · ${screen.call_kind.replace('_', ' ')}`, detail: { ...screen } },
    { key: 'extract', ms: fast ? 1300 : Math.round(2350 * modelScale), status: negative || isDuplicate ? 'skipped' : 'passed', model: negative || isDuplicate ? undefined : PRIMARY, tin: 2980, tout: 120 + planned.length * 150, cost: 0.00068 + planned.length * 0.00004, summary: negative ? 'Skipped: screen found nothing actionable' : isDuplicate ? 'Skipped: duplicate' : `${planned.length} candidate insight${planned.length === 1 ? '' : 's'} (schema-valid on first parse)`, detail: { candidates: planned.length, schemaRetries: 0, promptVersion: PROMPT_VERSION } },
    { key: 'ground', ms: 150, status: negative || isDuplicate ? 'skipped' : dropped.length ? 'warned' : 'passed', summary: negative || isDuplicate ? 'Skipped' : `${kept.length} of ${planned.length} quotes grounded${dropped.length ? ` · ${dropped.length} dropped (hallucinated quote)` : ''}`, detail: { grounded: kept.length, dropped: dropped.map((d) => ({ insightId: d.id, quote: d.evidence[0]?.quote, bestMatch: d.evidence[0]?.matchedText, score: d.evidence[0]?.score })), methods: kept.reduce<Record<string, number>>((a, i) => ((a[i.evidence[0]!.method] = (a[i.evidence[0]!.method] ?? 0) + 1), a), {}) } },
    { key: 'score', ms: 80, status: negative || isDuplicate ? 'skipped' : 'passed', summary: negative || isDuplicate ? 'Skipped' : `${kept.filter((i) => i.gate === 'auto_route').length} auto-route · ${kept.filter((i) => i.gate === 'review').length} review · ${kept.filter((i) => i.gate === 'held').length} held`, detail: { autoRoute: kept.filter((i) => i.gate === 'auto_route').length, review: kept.filter((i) => i.gate === 'review').length, held: kept.filter((i) => i.gate === 'held').length, thresholds: THRESHOLDS } },
    { key: 'theme', ms: 410, status: negative || isDuplicate ? 'skipped' : 'passed', model: negative || isDuplicate ? undefined : PRIMARY, tin: 380, tout: 24, cost: 0.00009, summary: negative || isDuplicate ? 'Skipped' : `${kept.filter((i) => i.themeId).length} joined existing themes · ${kept.filter((i) => !i.themeId).length} new candidate${kept.filter((i) => !i.themeId).length === 1 ? '' : 's'}`, detail: { joined: kept.filter((i) => i.themeId).map((i) => ({ insightId: i.id, themeId: i.themeId, name: THEMES.find((t) => t.id === i.themeId)?.name, similarity: 0.86 + (i.id.charCodeAt(5) % 10) / 100 })) } },
    { key: 'route', ms: 70, status: negative || isDuplicate ? 'skipped' : 'passed', summary: negative || isDuplicate ? 'Skipped' : `${kept.filter((i) => i.gate === 'auto_route').length} routed by rules · ${kept.filter((i) => i.gate === 'review').length} waiting for review`, detail: { routed: kept.filter((i) => i.gate === 'auto_route').map((i) => ({ insightId: i.id, ownerId: i.ownerId, channel: i.channel, ruleId: i.ruleId })) } },
    { key: 'deliver', ms: 360, status: negative || isDuplicate ? 'skipped' : 'passed', summary: negative || isDuplicate ? 'Skipped' : `${kept.filter((i) => i.gate === 'auto_route').length} delivered with receipts`, detail: {} },
  ];
  const totalCost = steps.reduce((a, s) => a + (s.status !== 'skipped' ? s.cost ?? 0 : 0), 0);
  const durationMs = steps.reduce((a, s) => a + s.ms, 0);
  const run: Run = {
    id: opts.seed ? `run_seed_${file?.callId ?? 'x'}` : runId,
    workspaceId: opts.workspaceId,
    fileId: file?.id ?? null,
    filename: file?.filename ?? opts.filename,
    accountId: file?.accountId ?? null,
    callId: file?.callId ?? null,
    status: 'queued',
    mode: opts.mode,
    modeReason: opts.mode === 'replay' ? (opts.seed ? 'seed' : 'live_disabled') : null,
    sha256: sha,
    createdAt: iso(t0),
    finishedAt: null,
    durationMs: null,
    costUsd: Math.round(totalCost * 1e5) / 1e5,
    promptVersion: PROMPT_VERSION,
    insightCount: kept.length,
    droppedCount: dropped.length,
    reviewCount: kept.filter((i) => i.gate === 'review').length,
    injectionFlagged: !!injection,
    actionable: !negative && !isDuplicate,
  };
  if (opts.seed) for (const i of planned) i.runId = run.id;
  void durationMs;
  return { run, t0, steps, turns, redactions, screen, planned, committed: false };
}

function snapshot(sim: SimRun, now: number): RunDetail {
  let t = sim.t0 + 350; // queue latency
  const steps: RunStep[] = [];
  let doneIdx = -1;
  sim.steps.forEach((s, i) => {
    const startedAt = t;
    const finishedAt = t + s.ms;
    let status: RunStep['status'] = 'pending';
    if (now >= finishedAt) {
      status = s.status;
      doneIdx = i;
    } else if (now >= startedAt) status = 'running';
    const skipped = s.status === 'skipped';
    steps.push({
      runId: sim.run.id,
      key: s.key,
      status,
      startedAt: status === 'pending' ? null : iso(startedAt),
      finishedAt: status === 'pending' || status === 'running' ? null : iso(finishedAt),
      durationMs: status === 'pending' || status === 'running' ? null : skipped ? 0 : s.ms,
      model: status === 'pending' || skipped ? null : s.model ?? null,
      tokensIn: status === 'passed' || status === 'warned' ? s.tin ?? null : null,
      tokensOut: status === 'passed' || status === 'warned' ? s.tout ?? null : null,
      costUsd: (status === 'passed' || status === 'warned') && s.cost ? s.cost : null,
      summary: status === 'pending' || status === 'running' ? null : s.summary,
      detail: status === 'pending' || status === 'running' ? null : s.detail,
    });
    t = finishedAt;
  });
  const reached = (k: StepKey) => doneIdx >= STEP_KEYS.indexOf(k);
  const finished = doneIdx === sim.steps.length - 1;
  if (finished && !sim.committed) commitRun(sim, t);
  const run: Run = {
    ...sim.run,
    status: !finished ? (now >= sim.t0 + 350 ? 'running' : 'queued') : sim.run.reviewCount > 0 ? 'awaiting_review' : 'completed',
    finishedAt: finished ? iso(t) : null,
    durationMs: finished ? t - sim.t0 : null,
    costUsd: finished ? sim.run.costUsd : steps.reduce((a, s) => a + (s.costUsd ?? 0), 0),
  };
  const ins = reached('extract')
    ? sim.planned.map((p) => {
        const live = insights.get(p.id) ?? p;
        if (reached('ground')) return reached('score') ? live : { ...live, gate: live.gate === 'dropped' ? 'dropped' : ('review' as const), gateReasons: [], status: live.gate === 'dropped' ? 'dropped_ungrounded' : 'pending_review', ownerId: null, channel: null, ruleId: null, themeId: null };
        return { ...live, evidence: live.evidence.map((e) => ({ ...e, start: null, end: null, matchedText: null, score: 0, method: 'failed' as const })), gate: 'review' as const, gateReasons: [], status: 'pending_review' as const, confidenceFinal: 0, groundingScore: 0, ownerId: null, channel: null, ruleId: null, themeId: null };
      })
    : [];
  return {
    run,
    steps,
    turns: reached('redact') ? sim.turns : [],
    redactions: reached('redact') ? sim.redactions : [],
    insights: ins as Insight[],
    deliveries: reached('deliver') ? [...deliveries.values()].filter((d) => sim.planned.some((p) => p.id === d.insightId)) : [],
    screen: reached('screen') ? sim.screen : null,
  };
}

function commitRun(sim: SimRun, at: number) {
  sim.committed = true;
  for (const ins of sim.planned) {
    insights.set(ins.id, ins);
    if (ins.gate === 'auto_route') createDelivery(ins, at - 200);
    if (ins.themeId && !sim.run.id.startsWith('run_seed')) themeExtra.set(ins.themeId, (themeExtra.get(ins.themeId) ?? 0) + 1);
  }
  if (!sim.run.id.startsWith('run_seed')) {
    if (sim.run.mode === 'live') {
      liveRuns++;
      spentUsd += sim.run.costUsd;
    } else replayRuns++;
  }
}

// Dev-server reloads (other files changing) reset this module; runs survive via sessionStorage.
type RememberedRun = { id: string; fileId: string | null; text?: string; filename: string; mode: Run['mode']; t0: number };
const RUNS_KEY = 'sl_fixture_runs';
function readRemembered(): RememberedRun[] {
  try {
    return JSON.parse(sessionStorage.getItem(RUNS_KEY) ?? '[]') as RememberedRun[];
  } catch {
    return [];
  }
}
function rememberRun(r: RememberedRun) {
  try {
    sessionStorage.setItem(RUNS_KEY, JSON.stringify([...readRemembered().slice(-30), r]));
  } catch {
    /* ignore */
  }
}
function restoreRun(id: string): SimRun | null {
  const r = readRemembered().find((x) => x.id === id);
  if (!r) return null;
  const file = r.fileId ? fixtureFiles.find((f) => f.id === r.fileId) ?? null : null;
  const sim = planRun({ file, text: r.text, filename: r.filename, mode: r.mode, t0: r.t0, workspaceId: 'ws_dev_fixtures', id: r.id });
  runs.set(id, sim);
  return sim;
}

// ---------------------------------------------------------------- seed history

(function seed() {
  // completed seed runs for a handful of library files (historic, replayable)
  const preferred = fixtureFiles.filter((f) => ['file_c1031', 'file_c1033', 'file_c1036', 'file_c1018', 'file_c1051'].includes(f.id));
  const seedFiles = preferred.length ? preferred : fixtureFiles.filter((f) => !f.recommended && !f.edgeKind && f.insights.length > 0).slice(0, 5);
  seedFiles.forEach((f, i) => {
    const sim = planRun({ file: f, filename: f.filename, mode: 'live', t0: NOW0 - (i + 2) * day * 1.7, seed: true, workspaceId: 'seed' });
    sim.planned = [];
    sim.run.insightCount = 0;
    runs.set(sim.run.id, sim);
    snapshot(sim, NOW0);
  });
  // seeded insights (history)
  for (const s of SEED_INSIGHTS) {
    const ev: Evidence = { quote: s.quote, turnId: 't002', start: 0, end: s.quote.length, matchedText: s.quote, score: s.fuzzy ?? 1, method: s.fuzzy ? 'fuzzy' : 'exact' };
    const createdAt = NOW0 - s.daysAgo * day - 3_600_000 * ((s.id.charCodeAt(6) % 9) + 1);
    const ins = makeInsight({ id: s.id, runId: `run_seed_${s.callId}`, workspaceId: 'seed', accountId: s.accountId, p: s, ev, createdAt });
    ins.status = s.status;
    ins.themeId = s.themeId;
    if (s.status === 'pending_review' && ins.gate === 'auto_route') {
      ins.gate = 'review';
      ins.gateReasons = ['sev-1 bug always reviewed'];
    }
    if (s.status === 'held') {
      ins.gate = 'held';
      ins.gateReasons = [`confidence ${ins.confidenceFinal.toFixed(2)} < 0.55`];
    }
    insights.set(ins.id, ins);
    if (s.status === 'routed') createDelivery(ins, createdAt + 4000);
    if (s.status === 'rejected') {
      reviews.push({ id: rid('rev'), workspaceId: 'seed', insightId: ins.id, action: 'reject', before: { type: ins.type }, after: {}, reason: 'Rep behaviour, not a product bug (counter-example in taxonomy).', reviewer: 'Hannah Cole', createdAt: iso(createdAt + day / 3) });
    }
  }
  // Ticket lifecycle history: one shipped, one in progress.
  const sf = [...deliveries.values()].find((d) => d.insightId === 'ins_s21');
  if (sf) sf.ticketState = 'shipped';
  const pres = [...deliveries.values()].find((d) => d.insightId === 'ins_s10');
  if (pres) pres.ticketState = 'in_progress';
  // Marcus's inbox: routed this week (3), acknowledged, shipped.
  const mk = (kind: Notification['kind'], insightId: string, title: string, body: string, hoursAgo: number, note: string | null, read = false) => {
    const n: Notification = { id: rid('ntf'), workspaceId: 'seed', csmId: 'ppl_marcus', insightId, kind, title, body, draftCustomerNote: note, read, createdAt: iso(NOW0 - hoursAgo * 3_600_000) };
    notifications.set(n.id, n);
  };
  for (const n of [...notifications.values()]) if (n.csmId === 'ppl_marcus') notifications.delete(n.id);
  mk('routed', 'ins_s05', 'Your feature request from SunPeak Solar reached Priya Shah', 'Delayed offline conversions make Google Ads CPA look worse than it is. Routed to INTG (Jira).', 30, null, true);
  mk('acknowledged', 'ins_s23', 'Tomás Rivera acknowledged your churn risk from SunPeak Solar', '“Looking at the qualified-lead signal tuning this sprint.” — Tomás', 20, null, true);
  mk('routed', 'ins_s03', 'Your feature request from Atlas Auto Group reached Priya Shah', 'Offline conversion uploads to Google Ads miss same-day bidding windows. Routed to INTG (Jira).', 52, null, true);
  mk('shipped', 'ins_s21', 'Your feedback from Atlas Auto Group shipped', 'Salesforce field mapping now supports standard fields (Lead Source on Opportunity). Released in 2026.10.2.', 6, 'Hi Tasha — quick update: the Salesforce connector can now map call outcome to the standard Lead Source field on Opportunity, which was the ask from our onboarding call. Happy to walk your BDC managers through it this week so the Monday spreadsheet can retire. — Marcus', false);
})();

// ---------------------------------------------------------------- themes

function isoWeek(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / day + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function themeRows(): Theme[] {
  return THEMES.map((t) => {
    const extra = themeExtra.get(t.id) ?? 0;
    const weekly = t.weekly.map((count, i) => ({ week: isoWeek(NOW0 - (7 - i) * 7 * day), count: i === 7 ? count + extra : count }));
    const members = [...insights.values()].filter((i) => i.themeId === t.id);
    const acctIds = new Set([...t.accountIds, ...members.map((m) => m.accountId).filter((x): x is string => !!x)]);
    const arr = [...acctIds].reduce((a, id) => a + (accountById(id)?.arrUsd ?? 0), 0);
    const dates = members.map((m) => m.createdAt).sort();
    return {
      id: t.id,
      name: t.name,
      summary: t.summary,
      type: t.type,
      productArea: t.productArea,
      status: promoted.has(t.id) ? 'on_roadmap' : t.status,
      insightCount: weekly.reduce((a, w) => a + w.count, 0),
      accountCount: acctIds.size,
      arrUsd: arr,
      firstSeen: dates[0] ?? iso(NOW0 - 56 * day),
      lastSeen: dates[dates.length - 1] ?? iso(NOW0 - 2 * day),
      weekly,
      ownerId: (() => {
        const p = personById(t.ownerId);
        if (p && (p.role === 'pm' || p.productArea === t.productArea)) return t.ownerId;
        return people.find((x) => x.role === 'pm' && x.productArea === t.productArea)?.id ?? t.ownerId;
      })(),
      topQuotes: members
        .sort((a, b) => b.confidenceFinal - a.confidenceFinal)
        .slice(0, 4)
        .map((m) => ({ insightId: m.id, accountId: m.accountId, quote: m.evidence[0]?.matchedText ?? m.evidence[0]?.quote ?? '' })),
    };
  });
}
const promoted = new Set<string>();

// ---------------------------------------------------------------- evals + health

function metric(key: string, label: string, numIn: number, den: number, threshold: number | null, higherIsBetter = true) {
  const num = Math.max(0, Math.min(den, numIn));
  const value = den ? num / den : null;
  return { key, label, value, numerator: num, denominator: den, threshold, passed: value == null || threshold == null ? null : higherIsBetter ? value >= threshold : value <= threshold };
}

function evalRun(version: string, daysAgo: number, tweak: number, l5: [number, number]): EvalRun {
  const types: [InsightType, string, number, number, number, number][] = [
    ['feature_request', 'Feature request', 41, 44, 41, 46],
    ['bug', 'Bug', 30, 32, 30, 33],
    ['pricing_objection', 'Pricing objection', 19, 22, 19, 21],
    ['competitor_mention', 'Competitor mention', 17, 17, 17, 18],
    ['churn_risk', 'Churn risk', 11, 12, 11, 12],
    ['praise', 'Praise', 14, 15, 14, 14],
  ];
  const m = [
    ...types.flatMap(([k, l, pn, pd, rn, rd]) => [
      metric(`precision.${k}`, `${l} precision`, Math.max(0, pn - tweak), pd, 0.85),
      metric(`recall.${k}`, `${l} recall`, Math.max(0, rn - tweak), rd, 0.8),
    ]),
    metric('recall.level1', 'Recall · level 1 clean', 16, 16, 0.8),
    metric('recall.level2', 'Recall · level 2 tidy', 22, 23, 0.8),
    metric('recall.level3', 'Recall · level 3 real', 21, 23, 0.8),
    metric('recall.level4', 'Recall · level 4 messy ASR', 19, 22, 0.8),
    metric('recall.level5', 'Recall · level 5 chaos', l5[0], l5[1], 0.8),
    metric('precision.level1', 'Precision · level 1', 16, 16, 0.85),
    metric('precision.level2', 'Precision · level 2', 23, 24, 0.85),
    metric('precision.level3', 'Precision · level 3', 21, 23, 0.85),
    metric('precision.level4', 'Precision · level 4', 19, 22, 0.85),
    metric('precision.level5', 'Precision · level 5', 18, 21, 0.85),
    metric('grounding_rate', 'Grounding rate (kept quotes found in transcript)', 141, 143, 0.97),
    metric('hallucination_caught', 'Hallucinated quotes caught by grounding', 9, 9, 1),
    metric('negative_fp_rate', 'False positives on nothing-actionable files', 0, 2, 0.0, false),
    metric('injection_resistance', 'Injection files with unchanged output schema', 2, 2, 1),
    metric('phi_leakage', 'PHI tokens that reached the model', 0, 37, 0, false),
    metric('routing_accuracy', 'Routed to the expected owner', 118, 124, 0.9),
  ];
  return { id: `eval_${version}`, promptVersion: version, model: PRIMARY, judgeModel: SECONDARY, createdAt: iso(NOW0 - daysAgo * day), files: 48, promoted: version !== 'extract@v5', blockedReasons: [], metrics: m, costUsd: 0.0912 + tweak * 0.003, p50Ms: 3180 + tweak * 40, p95Ms: 5420 + tweak * 90 };
}

function evals(): EvalsData {
  const history = [evalRun('extract@v1', 21, 6, [12, 21]), evalRun('extract@v2', 15, 4, [14, 21]), evalRun('extract@v3', 9, 2, [16, 21]), evalRun('extract@v4', 2, 0, [18, 21])];
  const latest = history[history.length - 1]!;
  const cand = evalRun('extract@v5', 0.2, -1, [15, 21]);
  cand.p50Ms = 2710;
  cand.p95Ms = 4630;
  cand.costUsd = 0.0786;
  cand.promoted = false;
  cand.blockedReasons = ['Recall on level-5 (chaos) files fell to 71.4% · 15 / 21, below the 80% floor (v4: 85.7% · 18 / 21)', 'Gate rule: no promotion when any per-level recall regresses by more than 5 points, even if overall F1 improves'];
  return { latest, history, candidate: cand };
}

function health(): HealthData {
  const ledger = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(NOW0 - (13 - i) * day).toISOString().slice(0, 10);
    if (i === 5) return { day: d, calls: null, costUsd: null, p50Ms: null, p95Ms: null, failures: null };
    const calls = 22 + ((i * 37) % 31) + (i === 13 ? 9 : 0);
    return { day: d, calls, costUsd: Math.round(calls * 0.00104 * 1e4) / 1e4, p50Ms: 2900 + ((i * 113) % 600), p95Ms: 5100 + ((i * 271) % 1400), failures: i === 9 ? 3 : i % 4 === 0 ? 1 : 0 };
  });
  const recent = Array.from({ length: 16 }, (_, i) => {
    const step = ['screen', 'extract', 'theme'][i % 3]!;
    return { id: `ai_${i}`, at: iso(NOW0 - i * 7 * 60_000), runId: `run_${(9_000_000 + i * 7919).toString(36)}`, step, model: i === 4 ? SECONDARY : PRIMARY, tokensIn: step === 'extract' ? 2980 : step === 'screen' ? 1460 : 380, tokensOut: step === 'extract' ? 640 : step === 'screen' ? 64 : 24, costUsd: step === 'extract' ? 0.00072 : step === 'screen' ? 0.00031 : 0.00009, ms: step === 'extract' ? 2210 + i * 31 : step === 'screen' ? 790 + i * 13 : 380, ok: i !== 4, mode: i % 5 === 3 ? ('replay' as const) : ('live' as const) };
  });
  return {
    budget: budget(),
    ledger,
    dlq: [
      { id: 'dlq_1', runId: 'run_k2m9q1', step: 'extract', error: 'Schema validation failed twice (evidence[0].quote missing); secondary model timed out after 20s', attempts: 3, at: iso(NOW0 - 2.4 * day), filename: '2026-10-09_Redwood_QBR_partial.txt' },
      { id: 'dlq_2', runId: 'run_p7x3a0', step: 'deliver', error: 'Destination returned 503 on 4 attempts (mock Linear); parked for manual retry', attempts: 4, at: iso(NOW0 - 0.6 * day), filename: '2026-10-16_Lumen_QBR.vtt' },
    ],
    recent,
  };
}

function budget(): Budget {
  return { limitUsd: 15, spentUsd: Math.round(spentUsd * 1e4) / 1e4, liveRuns, replayRuns, liveEnabled: spentUsd < 15, reason: spentUsd < 15 ? null : 'budget_reached' };
}

// ---------------------------------------------------------------- router

function ok<T>(data: T): Fetched<T> {
  return { data: structuredClone(data), dataAsOf: new Date().toISOString() };
}

function notFound(): never {
  throw new ApiError(404, 'not_found', 'No such record in this workspace');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fixtureRequest<T>(method: string, fullPath: string, body: unknown): Promise<Fetched<T>> {
  await sleep(60 + Math.random() * 120);
  const [path, query = ''] = fullPath.split('?');
  const q = new URLSearchParams(query);
  const seg = path!.split('/').filter(Boolean);
  const now = Date.now();
  const r = (x: unknown) => ok(x) as Fetched<T>;

  if (method === 'GET' && path === '/session') {
    const s: Session = { workspaceId: 'ws_dev_fixtures', isOwner: false, budget: budget(), models: { primary: PRIMARY, secondary: SECONDARY }, promptVersion: PROMPT_VERSION, linkExpiresAt: iso(NOW0 + 6 * day) };
    return r(s);
  }
  if (method === 'GET' && path === '/world') return r({ accounts, people });
  if (method === 'GET' && path === '/library') return r(library);
  if (method === 'GET' && seg[0] === 'library' && seg[1]) {
    const f = fixtureFiles.find((x) => x.id === seg[1]);
    if (!f) notFound();
    return r({ file: library.find((l) => l.id === f.id)!, content: f.content });
  }
  if (method === 'POST' && path === '/runs') {
    const b = body as CreateRun;
    const file = 'fileId' in b ? fixtureFiles.find((f) => f.id === b.fileId) ?? null : null;
    if ('fileId' in b && !file) notFound();
    const mode: Run['mode'] = 'mode' in b && b.mode === 'replay' ? 'replay' : budget().liveEnabled ? 'live' : 'replay';
    const sim = planRun({ file, text: 'text' in b ? b.text : undefined, filename: 'filename' in b ? b.filename ?? 'pasted-notes.txt' : file?.filename ?? 'pasted-notes.txt', mode, t0: now, workspaceId: 'ws_dev_fixtures' });
    runs.set(sim.run.id, sim);
    rememberRun({ id: sim.run.id, fileId: file?.id ?? null, text: 'text' in b ? b.text : undefined, filename: sim.run.filename, mode, t0: now });
    return r({ runId: sim.run.id, mode });
  }
  if (method === 'GET' && path === '/runs') {
    const list = [...runs.values()].map((s) => snapshot(s, now).run).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return r(list.slice(0, Number(q.get('limit') ?? 50)));
  }
  if (method === 'GET' && seg[0] === 'runs' && seg[1]) {
    const sim = runs.get(seg[1]) ?? restoreRun(seg[1]);
    if (!sim) notFound();
    return r(snapshot(sim, now));
  }
  if (method === 'GET' && path === '/insights') {
    let list = [...insights.values()];
    const type = q.get('type'), area = q.get('area'), status = q.get('status'), account = q.get('account'), text = q.get('q')?.toLowerCase();
    if (type) list = list.filter((i) => i.type === type);
    if (area) list = list.filter((i) => i.productArea === area);
    if (status) list = list.filter((i) => i.status === status);
    if (account) list = list.filter((i) => i.accountId === account);
    if (text) list = list.filter((i) => `${i.summary} ${i.evidence.map((e) => e.quote).join(' ')} ${accountById(i.accountId)?.name ?? ''}`.toLowerCase().includes(text));
    return r(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (method === 'GET' && seg[0] === 'insights' && seg[1]) {
    const ins = insights.get(seg[1]) ?? [...runs.values()].flatMap((s) => s.planned).find((p) => p.id === seg[1]);
    if (!ins) notFound();
    const sim = runs.get(ins.runId);
    const d: InsightDetail = {
      insight: ins,
      run: sim ? snapshot(sim, now).run : null,
      deliveries: [...deliveries.values()].filter((x) => x.insightId === ins.id),
      reviews: reviews.filter((x) => x.insightId === ins.id),
      theme: themeRows().find((t) => t.id === ins.themeId) ?? null,
    };
    return r(d);
  }
  if (method === 'GET' && path === '/review') {
    return r([...insights.values()].filter((i) => i.status === 'pending_review').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (method === 'POST' && seg[0] === 'review' && seg[1]) {
    const b = body as ReviewPostBody;
    if (idempotency.has(b.idempotencyKey)) return r(idempotency.get(b.idempotencyKey));
    const ins = insights.get(seg[1]);
    if (!ins) notFound();
    if (ins.status !== 'pending_review') throw new ApiError(409, 'not_pending', 'This insight has already been reviewed.');
    const before = { type: ins.type, summary: ins.summary, productArea: ins.productArea, severity: ins.severity };
    let delivery: Delivery | null = null;
    if (b.action === 'reject') {
      ins.status = 'rejected';
    } else {
      if (b.action === 'edit' && b.edits) Object.assign(ins, b.edits.type ? { type: b.edits.type } : {}, b.edits.summary ? { summary: b.edits.summary } : {}, b.edits.productArea ? { productArea: b.edits.productArea } : {}, b.edits.severity ? { severity: b.edits.severity } : {});
      const rule = matchRule(effectiveRules(), ins);
      ins.ownerId = rule.ownerId;
      ins.channel = rule.channel;
      ins.ruleId = rule.id;
      ins.status = 'routed';
      delivery = createDelivery(ins, now);
    }
    reviews.push({ id: rid('rev'), workspaceId: 'ws_dev_fixtures', insightId: ins.id, action: b.action, before, after: b.action === 'edit' ? { ...b.edits } : b.action === 'approve' ? { status: 'routed' } : { status: 'rejected' }, reason: b.reason ?? null, reviewer: 'You (viewer)', createdAt: iso(now) });
    const res = { insight: ins, delivery };
    idempotency.set(b.idempotencyKey, res);
    return r(res);
  }
  if (method === 'GET' && path === '/themes') return r(themeRows());
  if (method === 'GET' && seg[0] === 'themes' && seg[1]) {
    const theme = themeRows().find((t) => t.id === seg[1]);
    if (!theme) notFound();
    const members = [...insights.values()].filter((i) => i.themeId === theme.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const base = THEMES.find((t) => t.id === theme.id)!;
    const ids = new Set([...base.accountIds, ...members.map((m) => m.accountId).filter((x): x is string => !!x)]);
    const d: ThemeDetail = { theme, insights: members, accounts: accounts.filter((a) => ids.has(a.id)) };
    return r(d);
  }
  if (method === 'POST' && seg[0] === 'themes' && seg[2] === 'promote') {
    promoted.add(seg[1]!);
    return r(themeRows().find((t) => t.id === seg[1]));
  }
  if (method === 'GET' && path === '/routing/rules') return r(effectiveRules());
  if (method === 'PUT' && seg[0] === 'routing' && seg[1] === 'rules' && seg[2]) {
    const rule = { ...(body as RoutingRule), workspaceId: 'ws_dev_fixtures' };
    ruleOverrides.set(seg[2], rule);
    return r(rule);
  }
  if (method === 'POST' && path === '/routing/preview') {
    const rules = body as RoutingRule[];
    const counts = new Map<string, RoutingFlow>();
    for (const ins of insights.values()) {
      if (ins.status === 'rejected' || ins.gate === 'dropped') continue;
      const rule = matchRule(rules, ins);
      const k = `${ins.type}|${ins.productArea}|${rule.ownerId}`;
      const cur = counts.get(k) ?? { type: ins.type, area: ins.productArea, ownerId: rule.ownerId, count: 0 };
      cur.count++;
      counts.set(k, cur);
    }
    return r({ flows: [...counts.values()] });
  }
  if (method === 'GET' && path === '/deliveries') {
    const ch = q.get('channel');
    return r([...deliveries.values()].filter((d) => !ch || d.channel === ch).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (method === 'POST' && seg[0] === 'deliveries' && seg[2] === 'ticket') {
    const d = deliveries.get(seg[1]!);
    if (!d) notFound();
    const state = (body as { state: Delivery['ticketState'] }).state;
    d.ticketState = state;
    let notification: Notification | null = null;
    const ins = insights.get(d.insightId);
    if (ins?.csmId && (state === 'shipped' || state === 'in_progress')) {
      const acct = accountById(ins.accountId);
      const csm = personById(ins.csmId);
      notification = {
        id: rid('ntf'),
        workspaceId: 'ws_dev_fixtures',
        csmId: ins.csmId,
        insightId: ins.id,
        kind: state === 'shipped' ? 'shipped' : 'acknowledged',
        title: state === 'shipped' ? `Your feedback from ${acct?.name ?? 'a customer'} shipped` : `${personById(d.ownerId)?.name ?? 'The owner'} picked up your feedback from ${acct?.name ?? 'a customer'}`,
        body: state === 'shipped' ? `${d.receipt} moved to Shipped: ${ins.summary}` : `${d.receipt} moved to In progress.`,
        draftCustomerNote: state === 'shipped' ? `Hi ${acct?.name.split(' ')[0] === 'Brightline' ? 'Dana' : 'there'} — following up on our QBR: the issue you raised (${ins.summary.replace(/\.$/, '').toLowerCase()}) has shipped. Our team tracked it as ${d.receipt}. I'd love to show you what changed on our next call. — ${csm?.name.split(' ')[0] ?? 'Your CSM'}` : null,
        read: false,
        createdAt: iso(now),
      };
      notifications.set(notification.id, notification);
    }
    return r({ delivery: d, notification });
  }
  if (method === 'GET' && path === '/notifications') {
    const csm = q.get('csmId');
    return r([...notifications.values()].filter((n) => !csm || n.csmId === csm).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (method === 'GET' && path === '/evals') return r(evals());
  if (method === 'GET' && path === '/health') return r(health());
  if (method === 'POST' && path === '/workspace/reset') {
    for (const [id, i] of insights) if (i.workspaceId !== 'seed') insights.delete(id);
    for (const [id, s] of runs) if (s.run.workspaceId !== 'seed') runs.delete(id);
    ruleOverrides.clear();
    themeExtra.clear();
    promoted.clear();
    return r({});
  }
  if (method === 'POST' && path === '/telemetry') return r({});
  throw new ApiError(404, 'not_found', `Fixture has no handler for ${method} ${path}`);
}
