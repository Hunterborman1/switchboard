/**
 * Agent Ops: the internal AI-operations platform. Signal Loop is ONE agent living inside
 * it. The platform is what executives and the AI team look at: the agent registry, the
 * agent standard and review cadence, adoption & usage, hours and dollars returned versus AI
 * cost, and observability (structured logs, traces, SLOs, alerts) across every agent.
 *
 * Data provenance, always labeled in the UI:
 *   source 'live'       real telemetry: Signal Loop's actual runs and the people using this demo
 *   source 'simulated'  seeded history: six weeks of org usage and the other example agents
 *
 * Boundary: agents report into the platform only through the SDK (`src/worker/platform/sdk.ts`
 * → `ingest()`), with the same IngestBatch payload a production HTTP/OTLP endpoint would take.
 * The platform has its own D1 database (binding PLATFORM_DB) — it never reads an agent's tables.
 */
import { z } from 'zod';
// No JIT: zod otherwise probes `new Function` on first parse, which a strict CSP (no
// 'unsafe-eval') reports as a violation in the browser. Parsing works the same without it.
z.config({ jitless: true });

export const DataSource = z.enum(['live', 'simulated']);
export type DataSource = z.infer<typeof DataSource>;

export const SIGNAL_LOOP_AGENT_ID = 'agt_signal_loop';

// ---------------------------------------------------------------- telemetry (what agents send)

export const USAGE_KINDS = [
  'session_start', 'page_view', 'run_created', 'run_viewed', 'review_action', 'insight_opened', 'rule_changed',
  'ticket_state', 'notification_opened', 'digest_opened', 'theme_opened', 'eval_promote', 'tour_step', 'tour_complete',
  'export', 'search', 'agent_invoked', 'output_accepted', 'output_edited', 'output_rejected',
] as const;
export const UsageKind = z.enum(USAGE_KINDS);
export type UsageKind = z.infer<typeof UsageKind>;

export const UsageEvent = z.object({
  id: z.string(),
  agentId: z.string(),
  source: DataSource,
  sessionId: z.string(),
  actorId: z.string(), // person id (simulated employees) or 'viewer:<short>' (live demo viewers)
  actorRole: z.string(), // csm | pm | vp_product | sales | … | viewer
  kind: UsageKind,
  path: z.string().nullable(),
  props: z.record(z.string(), z.unknown()),
  at: z.string(),
  durationMs: z.number().int().nullable(), // dwell for page_view, time-to-act for review_action
});
export type UsageEvent = z.infer<typeof UsageEvent>;

/** Browser → Signal Loop API (POST /telemetry); the Worker stamps actor/session and forwards via the SDK. */
export const TelemetryBatch = z.object({
  sessionId: z.string().max(64),
  events: z
    .array(
      z.object({
        kind: UsageKind,
        path: z.string().max(200).nullable(),
        props: z.record(z.string(), z.unknown()).default({}),
        at: z.string(),
        durationMs: z.number().int().nullable().default(null),
      }),
    )
    .max(50),
});
export type TelemetryBatch = z.infer<typeof TelemetryBatch>;

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;
export const LogEntry = z.object({
  id: z.string(),
  agentId: z.string(),
  source: DataSource,
  at: z.string(),
  level: LogLevel,
  component: z.string(), // api | workflow | ai | gate | delivery | budget | telemetry | gumloop | claude
  event: z.string(), // "ai.call", "step.finished", "delivery.retry", "budget.check", "http.request"
  message: z.string(),
  traceId: z.string(),
  spanId: z.string().nullable(),
  runId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  fields: z.record(z.string(), z.unknown()),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const Span = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentId: z.string().nullable(),
  agentId: z.string(),
  name: z.string(), // "POST /runs", "step.extract", "ai.generate deepseek…", "delivery.jira"
  start: z.string(),
  durationMs: z.number().int(),
  status: z.enum(['ok', 'error']),
  attrs: z.record(z.string(), z.unknown()), // model, tokens, costUsd, http.status, retry
});
export type Span = z.infer<typeof Span>;

/** A unit of business work the agent completed, with the inputs needed for impact math. */
export const WorkUnit = z.object({
  id: z.string(),
  agentId: z.string(),
  source: DataSource,
  at: z.string(),
  kind: z.string(), // "call_processed", "questionnaire_drafted", "account_summarized"
  actorId: z.string().nullable(),
  minutesSavedEstimate: z.number(), // from the agent's registered baseline × this unit
  humanMinutesSpent: z.number(), // review/edit time actually spent
  aiCostUsd: z.number(),
  outcome: z.enum(['accepted', 'edited', 'rejected', 'automatic', 'failed']),
});
export type WorkUnit = z.infer<typeof WorkUnit>;

export const IngestBatch = z.object({
  agentId: z.string(),
  events: z.array(UsageEvent).default([]),
  logs: z.array(LogEntry).default([]),
  spans: z.array(Span).default([]),
  work: z.array(WorkUnit).default([]),
});
export type IngestBatch = z.infer<typeof IngestBatch>;

// ---------------------------------------------------------------- registry & the agent standard

export const STANDARD_CHECKS = [
  { key: 'owner', label: 'Named owner and business owner' },
  { key: 'purpose', label: 'Documented purpose and success metric' },
  { key: 'data_review', label: 'Security & data review passed' },
  { key: 'evals', label: 'Eval suite with promotion gate' },
  { key: 'logging', label: 'Structured logs and traces reach Agent Ops' },
  { key: 'cost_cap', label: 'Spend cap and per-run budget' },
  { key: 'human_review', label: 'Human review on high-stakes output' },
  { key: 'rollback', label: 'Rollback path and runbook' },
  { key: 'review_cadence', label: 'Review cadence current' },
] as const;

export const StandardCheck = z.object({ key: z.string(), label: z.string(), passed: z.boolean(), evidence: z.string() });
export type StandardCheck = z.infer<typeof StandardCheck>;

export const AgentRecord = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  department: z.enum(['Customer Success', 'Sales', 'Marketing', 'Support', 'Finance', 'People', 'Product', 'Operations']),
  ownerId: z.string(),
  ownerName: z.string(),
  businessOwner: z.string(),
  builtWith: z.enum(['Claude', 'Gumloop', 'Code', 'Databricks']),
  status: z.enum(['production', 'pilot', 'in_review', 'retired']),
  dataAccess: z.array(z.string()),
  dataClassification: z.enum(['internal', 'confidential', 'restricted']),
  baselineMinutesPerUnit: z.number(), // registered "manual way" time per work unit (labeled assumption)
  unitLabel: z.string(), // "call processed"
  lastReview: z.string(),
  reviewCadenceDays: z.number().int(),
  nextReview: z.string(),
  version: z.string(),
  launchedAt: z.string(),
  standard: z.array(StandardCheck),
  source: DataSource, // 'live' only for Signal Loop
  href: z.string().nullable(), // link into the agent itself (Signal Loop → /app)
});
export type AgentRecord = z.infer<typeof AgentRecord>;

export const ChangeEntry = z.object({
  id: z.string(),
  agentId: z.string(),
  at: z.string(),
  kind: z.enum(['deploy', 'prompt', 'model', 'threshold', 'rule', 'incident', 'review', 'access']),
  title: z.string(),
  detail: z.string(),
  actor: z.string(),
  ref: z.string().nullable(), // eval run id, version, incident id
});
export type ChangeEntry = z.infer<typeof ChangeEntry>;

// ---------------------------------------------------------------- reports (what the platform shows)

export const ImpactAssumptions = z.object({
  loadedHourlyUsd: z.number(), // fully loaded employee cost per hour (baseline 85)
  sourceNote: z.string(), // "Baselines are assumptions until the 2-week time study"
});
export type ImpactAssumptions = z.infer<typeof ImpactAssumptions>;

export type AgentImpact = {
  agentId: string;
  name: string;
  source: DataSource;
  workUnits: number;
  hoursReturned: number; // Σ(minutesSavedEstimate − humanMinutesSpent) / 60
  valueUsd: number;
  aiCostUsd: number;
  roiMultiple: number | null;
  activeUsers: number;
  acceptanceRate: number | null; // accepted+automatic / all
};

export type OverviewReport = {
  range: { from: string; to: string };
  assumptions: ImpactAssumptions;
  totals: { agentsInProduction: number; hoursReturned: number; valueUsd: number; aiCostUsd: number; roiMultiple: number | null; activeUsers: number; workUnits: number };
  weekly: { week: string; byAgent: Record<string, number>; hoursReturned: number; aiCostUsd: number; activeUsers: number }[];
  agents: AgentImpact[];
  attention: { agentId: string; kind: 'review_overdue' | 'slo_breached' | 'standard_gap' | 'cost_spike' | 'adoption_drop'; message: string }[];
};

export type UsageReport = {
  agentId: string | null; // null = all agents
  source: DataSource | 'all';
  daily: { day: string; users: number; sessions: number; events: number }[];
  byRole: { role: string; users: number; events: number }[];
  byDepartment: { department: string; users: number; workUnits: number }[];
  heatmap: { weekday: number; hour: number; events: number }[]; // 0 = Monday, hour in UTC
  features: { kind: UsageKind; events: number; users: number }[];
  retention: { cohortWeek: string; size: number; weeks: number[] }[];
  topUsers: { actorId: string; name: string; role: string; lastSeen: string; sessions: number; workUnits: number }[];
  live: { activeNow: number; sessionsToday: number; tourStarts: number; tourCompletions: number; recent: UsageEvent[] };
};

export const Slo = z.object({
  agentId: z.string(),
  key: z.string(),
  label: z.string(),
  objective: z.string(),
  target: z.number(),
  actual: z.number().nullable(),
  numerator: z.number().int().nullable(),
  denominator: z.number().int().nullable(),
  window: z.string(),
  status: z.enum(['ok', 'at_risk', 'breached', 'no_data']),
  errorBudgetRemaining: z.number().nullable(),
});
export type Slo = z.infer<typeof Slo>;

export const Alert = z.object({
  id: z.string(),
  agentId: z.string(),
  at: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  rule: z.string(),
  expected: z.string(),
  actual: z.string(),
  status: z.enum(['open', 'acknowledged', 'resolved']),
  owner: z.string(),
  runbook: z.string(),
  traceId: z.string().nullable(),
});
export type Alert = z.infer<typeof Alert>;

export type ObservabilityReport = {
  agentId: string | null;
  slos: Slo[];
  alerts: Alert[];
  hourly: { hour: string; requests: number; errors: number; p50Ms: number; p95Ms: number; aiCalls: number; fallbacks: number; costUsd: number }[];
  components: { component: string; events: number; errors: number; p95Ms: number }[];
  models: { model: string; calls: number; share: number; failures: number; p50Ms: number; costUsd: number }[];
};

/**
 * Platform API (gated, under /repo/invoca/api/platform):
 *   GET  /overview?from&to              OverviewReport
 *   GET  /agents                        (AgentRecord & { impact: AgentImpact })[]
 *   GET  /agents/:id                    { agent; impact; slos; alerts; changelog: ChangeEntry[] }
 *   GET  /usage?agentId&source          UsageReport
 *   GET  /logs?agentId&level&component&traceId&runId&q&cursor   { rows: LogEntry[]; nextCursor: string|null }
 *   GET  /traces/:traceId               { spans: Span[]; logs: LogEntry[] }
 *   GET  /observability?agentId         ObservabilityReport
 *   GET  /standard                      { checks; matrix: { agentId; checks: StandardCheck[] }[] }
 *   GET  /reviews                       { agentId; name; lastReview; nextReview; status: 'current'|'due_soon'|'overdue' }[]
 *   GET  /changelog?agentId             ChangeEntry[]
 *   PUT  /assumptions                   ImpactAssumptions (viewer workspace override)
 * Internal (not HTTP-exposed to browsers): ingest(env, batch: IngestBatch).
 */
export const PLATFORM_API_BASE = '/repo/invoca/api/platform';
