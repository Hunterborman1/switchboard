/**
 * Signal Loop contracts: the single source of truth shared by the Worker API, the
 * pipeline, the LLM output schema, the product UI and the walkthrough.
 *
 * Every API response is an `Envelope<T>`: `{ data, dataAsOf }`. `dataAsOf` is stamped by
 * the server (ISO UTC) so every page can show "Data as of …" (UIS console rule).
 *
 * Workspaces: every viewer session gets its own workspace id (cookie `sl_ws`). Seeded
 * history lives in workspace `seed`. Reads return `seed ∪ <own workspace>`; writes go to
 * the viewer's own workspace only, so one panelist's walkthrough never changes another's.
 */
import { z } from 'zod';

// ---------------------------------------------------------------- vocabulary

export const INSIGHT_TYPES = ['feature_request', 'bug', 'pricing_objection', 'competitor_mention', 'churn_risk', 'praise'] as const;
export const InsightType = z.enum(INSIGHT_TYPES);
export type InsightType = z.infer<typeof InsightType>;

export const PRODUCT_AREAS = [
  'call_tracking', // Call Tracking & Attribution
  'signal_ai', // Signal AI Studio / Discovery, call scoring, spam detection
  'presense', // PreSense (digital intent to contact-center agents)
  'integrations', // Salesforce, Google Ads, Meta, Adobe, Five9, Genesys, NICE
  'quality_management', // AI-Powered QM
  'ai_agents', // AI Voice Agent, AI Messaging Agent
  'billing_pricing', // contracts, add-ons, invoices
  'platform', // reporting, UI, permissions, anything else
] as const;
export const ProductArea = z.enum(PRODUCT_AREAS);
export type ProductArea = z.infer<typeof ProductArea>;

export const Severity = z.enum(['low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof Severity>;
export const Sentiment = z.enum(['negative', 'mixed', 'neutral', 'positive']);
export type Sentiment = z.infer<typeof Sentiment>;

/** 1 clean notes · 2 tidy transcript · 3 real · 4 messy ASR · 5 chaos mixed. */
export const MessLevel = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type MessLevel = z.infer<typeof MessLevel>;
export const EdgeKind = z.enum(['nothing_actionable', 'injection', 'phi_heavy', 'non_english', 'duplicate']);
export type EdgeKind = z.infer<typeof EdgeKind>;
export const FileFormat = z.enum(['vtt', 'txt', 'md', 'eml', 'chat']);
export type FileFormat = z.infer<typeof FileFormat>;

export const Channel = z.enum(['slack', 'jira', 'linear', 'email_digest', 'triage']);
export type Channel = z.infer<typeof Channel>;

export const ARR_BANDS = ['<50k', '50k-250k', '250k-1m', '>1m'] as const;
export const ArrBand = z.enum(ARR_BANDS);
export type ArrBand = z.infer<typeof ArrBand>;

// ---------------------------------------------------------------- world

export const Account = z.object({
  id: z.string(), // acct_brightline
  name: z.string(),
  vertical: z.enum(['healthcare', 'home_services', 'automotive', 'insurance', 'financial_services', 'telecom', 'solar', 'retail']),
  tier: z.enum(['Pro', 'Enterprise', 'Elite']),
  arrUsd: z.number().int(),
  arrBand: ArrBand,
  seats: z.number().int(),
  products: z.array(ProductArea),
  renewalDate: z.string(), // YYYY-MM-DD
  health: z.enum(['healthy', 'watch', 'at_risk']),
  csmId: z.string(),
  hq: z.string(),
  notes: z.string(), // one-line account context
});
export type Account = z.infer<typeof Account>;

export const Person = z.object({
  id: z.string(), // ppl_marcus
  name: z.string(),
  role: z.enum(['csm', 'pm', 'vp_product', 'competitive_intel', 'pricing', 'support_escalation', 'eng_manager', 'sales_lead', 'triage']),
  title: z.string(),
  productArea: ProductArea.nullable(),
  slackHandle: z.string(),
  email: z.string(),
  initials: z.string(),
});
export type Person = z.infer<typeof Person>;

// ---------------------------------------------------------------- library (the file picker)

export const LibraryFile = z.object({
  id: z.string(), // file_c1042
  folder: z.string(), // "Calls/Week 43"
  filename: z.string(), // 2026-10-21_Brightline_QBR_transcript.vtt
  format: FileFormat,
  sizeBytes: z.number().int(),
  modifiedAt: z.string(), // ISO
  accountId: z.string().nullable(),
  callType: z.string(), // QBR, check-in, renewal, escalation, onboarding, notes
  messLevel: MessLevel.nullable(), // null for edge files
  edgeKind: EdgeKind.nullable(),
  featured: z.boolean(), // shown in the picker (48); backfill files are false
  /** Walkthrough branch this file leads to when picked in Chapter 1. */
  tourPath: z.enum(['main', 'clean', 'messy', 'security', 'negative', 'privacy']).nullable(),
  recommended: z.boolean(), // the one highlighted file (C-1042)
  callId: z.string(), // C-1042 (human-facing reference)
});
export type LibraryFile = z.infer<typeof LibraryFile>;

/** Ground truth for a golden file (from its scenario card). */
export const GoldenInsight = z.object({
  type: InsightType,
  productArea: ProductArea,
  severity: Severity,
  summary: z.string(),
  quote: z.string(), // must be locatable in the final file text
  owner: z.string().optional(), // expected routing owner person id
});
export const GoldenLabel = z.object({
  fileId: z.string(),
  expectActionable: z.boolean(),
  expectInjectionFlag: z.boolean(),
  insights: z.array(GoldenInsight),
  phiTokens: z.array(z.string()).default([]), // strings that MUST be redacted
});
export type GoldenLabel = z.infer<typeof GoldenLabel>;

// ---------------------------------------------------------------- transcripts

export const Turn = z.object({
  id: z.string(), // t001
  speaker: z.string(), // "Dana (Brightline)" | "CSM" | "unknown"
  role: z.enum(['customer', 'invoca', 'unknown']),
  ts: z.string().nullable(), // "00:01:12" when present
  text: z.string(), // redacted text (what the model saw)
  start: z.number().int(), // char offset in the normalized redacted document
  end: z.number().int(),
});
export type Turn = z.infer<typeof Turn>;

export const Redaction = z.object({
  token: z.string(), // [PERSON_1], [PHONE_1], [PATIENT_1], [DOB_1], [EMAIL_1], [CARD_1], [ADDRESS_1], [MRN_1]
  kind: z.enum(['person', 'phone', 'email', 'card', 'ssn', 'dob', 'patient', 'mrn', 'address']),
  // original value is never returned to the browser; only a masked preview
  preview: z.string(), // "J••• D••"
  count: z.number().int(),
});
export type Redaction = z.infer<typeof Redaction>;

// ---------------------------------------------------------------- runs

export const STEP_KEYS = ['ingest', 'normalize', 'redact', 'screen', 'extract', 'ground', 'score', 'theme', 'route', 'deliver'] as const;
export const StepKey = z.enum(STEP_KEYS);
export type StepKey = z.infer<typeof StepKey>;
export const STEP_LABELS: Record<StepKey, string> = {
  ingest: 'Ingest', normalize: 'Normalize', redact: 'Redact PII', screen: 'Screen', extract: 'Extract',
  ground: 'Ground', score: 'Score & gate', theme: 'Theme', route: 'Route', deliver: 'Deliver',
};

export const StepStatus = z.enum(['pending', 'running', 'passed', 'warned', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatus>;

export const RunStep = z.object({
  runId: z.string(),
  key: StepKey,
  status: StepStatus,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  model: z.string().nullable(),
  tokensIn: z.number().int().nullable(),
  tokensOut: z.number().int().nullable(),
  costUsd: z.number().nullable(),
  /** One-line human summary: "Redacted 6 values (2 people, 1 phone, 3 PHI)". */
  summary: z.string().nullable(),
  /** Step-specific structured detail (counts, flags, rejected quotes, …). */
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type RunStep = z.infer<typeof RunStep>;

export const RunStatus = z.enum(['queued', 'running', 'awaiting_review', 'completed', 'failed']);
export const RunMode = z.enum(['live', 'replay']);
export const Run = z.object({
  id: z.string(), // run_…
  workspaceId: z.string(),
  fileId: z.string().nullable(), // null for pasted/uploaded custom text
  filename: z.string(),
  accountId: z.string().nullable(),
  callId: z.string().nullable(),
  status: RunStatus,
  mode: RunMode,
  /** Why replay, when replay: "budget_reached" | "live_failed" | "live_disabled" | "seed". */
  modeReason: z.string().nullable(),
  sha256: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  costUsd: z.number(),
  promptVersion: z.string(),
  insightCount: z.number().int(),
  droppedCount: z.number().int(), // ungrounded
  reviewCount: z.number().int(),
  injectionFlagged: z.boolean(),
  actionable: z.boolean().nullable(),
});
export type Run = z.infer<typeof Run>;

// ---------------------------------------------------------------- insights

export const Evidence = z.object({
  quote: z.string(), // as the model returned it
  turnId: z.string().nullable(),
  start: z.number().int().nullable(), // char span of the matched text in the redacted doc
  end: z.number().int().nullable(),
  matchedText: z.string().nullable(), // the actual transcript span
  score: z.number(), // 0..1 grounding similarity
  method: z.enum(['exact', 'normalized', 'fuzzy', 'failed']),
});
export type Evidence = z.infer<typeof Evidence>;

export const Gate = z.enum(['auto_route', 'review', 'held', 'dropped']);
export type Gate = z.infer<typeof Gate>;
export const InsightStatus = z.enum(['pending_review', 'routed', 'rejected', 'held', 'dropped_ungrounded']);
export type InsightStatus = z.infer<typeof InsightStatus>;

export const Insight = z.object({
  id: z.string(), // ins_…
  workspaceId: z.string(),
  runId: z.string(),
  accountId: z.string().nullable(),
  csmId: z.string().nullable(),
  type: InsightType,
  summary: z.string(),
  productArea: ProductArea,
  severity: Severity,
  sentiment: Sentiment,
  rationale: z.string(),
  evidence: z.array(Evidence),
  confidenceModel: z.number(), // model self-report 0..1
  groundingScore: z.number(), // best evidence score 0..1
  confidenceFinal: z.number(), // gated value 0..1
  gate: Gate,
  /** Why it landed where it did: ["confidence 0.71 < 0.80", "sev-1 bug always reviewed"]. */
  gateReasons: z.array(z.string()),
  status: InsightStatus,
  themeId: z.string().nullable(),
  ownerId: z.string().nullable(),
  channel: Channel.nullable(),
  ruleId: z.string().nullable(),
  promptVersion: z.string(),
  model: z.string(),
  createdAt: z.string(),
});
export type Insight = z.infer<typeof Insight>;

/** The exact JSON the extraction model must return (validated with Zod after parse). */
export const ExtractionOutput = z.object({
  insights: z.array(
    z.object({
      type: InsightType,
      summary: z.string().min(8).max(240),
      product_area: ProductArea,
      severity: Severity,
      sentiment: Sentiment,
      evidence: z.array(z.object({ quote: z.string().min(4), turn_id: z.string().nullable() })).min(1).max(3),
      confidence: z.number().min(0).max(1),
      rationale: z.string().max(300),
    }),
  ),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const ScreenOutput = z.object({
  actionable: z.boolean(),
  language: z.string(), // ISO 639-1
  injection_suspected: z.boolean(),
  injection_excerpt: z.string().nullable(),
  call_kind: z.enum(['qbr', 'check_in', 'renewal', 'escalation', 'onboarding', 'notes', 'email', 'other']),
  reason: z.string().max(200),
});
export type ScreenOutput = z.infer<typeof ScreenOutput>;

// ---------------------------------------------------------------- themes

export const Theme = z.object({
  id: z.string(), // thm_…
  name: z.string(), // "Offline conversions lag in Google Ads"
  summary: z.string(),
  type: InsightType,
  productArea: ProductArea,
  status: z.enum(['candidate', 'active', 'on_roadmap', 'shipped']),
  insightCount: z.number().int(),
  accountCount: z.number().int(),
  arrUsd: z.number().int(), // sum of distinct accounts' ARR
  firstSeen: z.string(),
  lastSeen: z.string(),
  weekly: z.array(z.object({ week: z.string(), count: z.number().int() })), // last 8 ISO weeks
  ownerId: z.string().nullable(),
  topQuotes: z.array(z.object({ insightId: z.string(), accountId: z.string().nullable(), quote: z.string() })),
});
export type Theme = z.infer<typeof Theme>;

// ---------------------------------------------------------------- routing & delivery

export const RoutingRule = z.object({
  id: z.string(), // rule_…
  workspaceId: z.string(), // 'seed' baseline; a viewer's edit is an override row in their workspace
  priority: z.number().int(), // lower wins
  name: z.string(),
  match: z.object({
    types: z.array(InsightType).nullable(), // null = any
    areas: z.array(ProductArea).nullable(),
    minSeverity: Severity.nullable(),
    arrBands: z.array(ArrBand).nullable(),
  }),
  ownerId: z.string(),
  channel: Channel,
  destination: z.string(), // "#pm-integrations", "INTG", "Signal AI team", "VP digest"
  enabled: z.boolean(),
});
export type RoutingRule = z.infer<typeof RoutingRule>;

export const DeliveryStatus = z.enum(['queued', 'delivered', 'retrying', 'failed']);
export const Delivery = z.object({
  id: z.string(), // dlv_…
  workspaceId: z.string(),
  insightId: z.string(),
  channel: Channel,
  destination: z.string(),
  ownerId: z.string(),
  status: DeliveryStatus,
  attempts: z.array(z.object({ at: z.string(), ok: z.boolean(), ms: z.number().int(), note: z.string() })),
  receipt: z.string().nullable(), // "INTG-482", Slack ts "1729512345.0042"
  /** Rendered preview for the destination mock (Slack blocks-like / Jira fields). */
  payload: z.record(z.string(), z.unknown()),
  /** Ticket lifecycle for jira/linear: open → in_progress → shipped. */
  ticketState: z.enum(['open', 'in_progress', 'shipped', 'wont_do']).nullable(),
  createdAt: z.string(),
});
export type Delivery = z.infer<typeof Delivery>;

export const Notification = z.object({
  id: z.string(),
  workspaceId: z.string(),
  csmId: z.string(),
  insightId: z.string(),
  kind: z.enum(['routed', 'acknowledged', 'shipped']),
  title: z.string(),
  body: z.string(),
  draftCustomerNote: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof Notification>;

// ---------------------------------------------------------------- review

export const ReviewAction = z.object({
  idempotencyKey: z.string().uuid(),
  action: z.enum(['approve', 'edit', 'reject']),
  edits: z.object({ type: InsightType, summary: z.string(), productArea: ProductArea, severity: Severity }).partial().optional(),
  reason: z.string().max(300).optional(),
});
export type ReviewAction = z.infer<typeof ReviewAction>;

export const ReviewRecord = z.object({
  id: z.string(),
  workspaceId: z.string(),
  insightId: z.string(),
  action: z.enum(['approve', 'edit', 'reject']),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  reason: z.string().nullable(),
  reviewer: z.string(),
  createdAt: z.string(),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

// ---------------------------------------------------------------- evals, health, budget

export const EvalMetric = z.object({
  key: z.string(), // "precision.feature_request", "recall.level4", "grounding_rate", "negative_fp_rate"
  label: z.string(),
  value: z.number().nullable(),
  numerator: z.number().int().nullable(),
  denominator: z.number().int().nullable(),
  threshold: z.number().nullable(),
  passed: z.boolean().nullable(),
});
export const EvalRun = z.object({
  id: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  judgeModel: z.string().nullable(),
  createdAt: z.string(),
  files: z.number().int(),
  promoted: z.boolean(),
  blockedReasons: z.array(z.string()),
  metrics: z.array(EvalMetric),
  costUsd: z.number(),
  p50Ms: z.number().int(),
  p95Ms: z.number().int(),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const Budget = z.object({
  limitUsd: z.number(), // 15
  spentUsd: z.number(),
  liveRuns: z.number().int(),
  replayRuns: z.number().int(),
  liveEnabled: z.boolean(),
  reason: z.string().nullable(), // "budget_reached" | "disabled_by_owner" | null
});
export type Budget = z.infer<typeof Budget>;

export const Session = z.object({
  workspaceId: z.string(),
  isOwner: z.boolean(), // shared hb_auth cookie → Hunter
  budget: Budget,
  models: z.object({ primary: z.string(), secondary: z.string() }),
  promptVersion: z.string(),
  linkExpiresAt: z.string().nullable(), // when signed in via link
});
export type Session = z.infer<typeof Session>;

// ---------------------------------------------------------------- API

export type Envelope<T> = { data: T; dataAsOf: string };
export type ApiError = { error: { code: string; message: string } };

export const CreateRun = z.union([
  z.object({ fileId: z.string(), mode: z.enum(['auto', 'replay']).default('auto') }),
  z.object({ text: z.string().min(40).max(60_000), filename: z.string().max(120).default('pasted-notes.txt'), mode: z.literal('auto').default('auto') }),
]);
export type CreateRun = z.infer<typeof CreateRun>;

/** GET /api/runs/:id — everything the Run view and walkthrough need in one poll. */
export type RunDetail = {
  run: Run;
  steps: RunStep[];
  turns: Turn[];
  redactions: Redaction[];
  insights: Insight[];
  deliveries: Delivery[];
  screen: ScreenOutput | null;
};

/**
 * API surface (all under `/repo/invoca/api`, all gated, JSON):
 *   GET  /session                         Session
 *   GET  /world                           { accounts: Account[]; people: Person[] }
 *   GET  /library                         LibraryFile[] (featured only)
 *   GET  /library/:id                     { file: LibraryFile; content: string }
 *   POST /runs            CreateRun       { runId: string; mode: 'live'|'replay' }
 *   GET  /runs?limit&cursor               Run[]
 *   GET  /runs/:id                        RunDetail
 *   GET  /insights?type&area&status&account&q   Insight[]
 *   GET  /insights/:id                    { insight; run; deliveries; reviews: ReviewRecord[]; theme: Theme|null }
 *   GET  /review                          Insight[] (status pending_review)
 *   POST /review/:insightId  ReviewAction { insight: Insight; delivery: Delivery|null }
 *   GET  /themes                          Theme[]
 *   GET  /themes/:id                      { theme; insights: Insight[]; accounts: Account[] }
 *   GET  /routing/rules                   RoutingRule[] (effective: workspace overrides applied)
 *   PUT  /routing/rules/:id  RoutingRule  RoutingRule (writes an override in the viewer workspace)
 *   POST /routing/preview    RoutingRule[] { flows: {type; area; ownerId; count}[] } (Sankey)
 *   GET  /deliveries?channel              Delivery[]
 *   POST /deliveries/:id/ticket { state } { delivery; notification: Notification|null }
 *   GET  /notifications?csmId             Notification[]
 *   GET  /evals                           { latest: EvalRun; history: EvalRun[]; candidate: EvalRun|null }
 *   GET  /health                          { budget; ledger: {day; calls; costUsd; p50Ms; p95Ms; failures}[]; dlq: {...}[]; recent: {...}[] }
 *   POST /workspace/reset                 {} (clears the viewer's own workspace)
 */
export const API_BASE = '/repo/invoca/api';

export const THRESHOLDS = { autoRoute: 0.8, review: 0.55, grounding: 0.9 } as const;
export const BUDGET_LIMIT_USD = 15;
