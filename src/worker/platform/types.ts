/**
 * Agent Ops types beyond the shared contract. Pure types (no runtime, no Worker globals), so
 * the platform UI imports them directly. Everything here extends — never replaces — the
 * shapes in src/shared/platform-contracts.ts.
 */
import type {
  AgentImpact,
  AgentRecord,
  Alert,
  ChangeEntry,
  DataSource,
  ImpactAssumptions,
  LogEntry,
  ObservabilityReport,
  OverviewReport,
  Slo,
  Span,
  StandardCheck,
  UsageReport,
} from '../../shared/platform-contracts.ts';

export type Envelope<T> = { data: T; dataAsOf: string };

export type SloTargets = {
  runSuccess: number; // 0.99
  p95Ms: number; // latency objective for the agent's main request
  grounding: number | null; // 0.95 where the agent cites sources
  delivery: number | null; // 0.995 where the agent delivers to another system
  costPerUnitUsd: number; // cost per work unit ceiling
};

export type SecurityReview = {
  date: string;
  reviewer: string;
  outcome: 'approved' | 'approved_with_conditions' | 'pending' | 'not_started';
  scope: string;
  conditions: string[];
};

/** Registry facts that AgentRecord does not carry. */
export type AgentProfile = {
  successMetric: string;
  runbookUrl: string;
  monthlyBudgetUsd: number;
  perRunCapUsd: number;
  slo: SloTargets;
  securityReview: SecurityReview;
  humanMinutesPerUnit: number; // registered review/edit time (assumption)
  integrations: string[];
  color: string; // categorical chart colour (fixed per agent; never by rank)
  shortName: string;
  promotedAt: string | null; // pilot → production
  retiredAt: string | null;
  retiredReason: string | null;
};

export type ReviewStatus = 'current' | 'due_soon' | 'overdue';

export type RegistryRow = AgentRecord & {
  profile: AgentProfile;
  impact: AgentImpact;
  reviewStatus: ReviewStatus;
  standardScore: { passed: number; total: number };
  runs30d: number;
  users30d: number;
  hours30d: number;
  cost30d: number;
  weeklyHours: (number | null)[];
};

export type AgentDetail = {
  agent: AgentRecord;
  profile: AgentProfile;
  impact: AgentImpact;
  reviewStatus: ReviewStatus;
  slos: Slo[];
  alerts: Alert[];
  changelog: ChangeEntry[];
  usage: { day: string; users: number; sessions: number; workUnits: number }[];
  outcomes: Record<'accepted' | 'edited' | 'rejected' | 'automatic' | 'failed', number>;
  cost: { day: string; costUsd: number | null }[];
  topUsers: { actorId: string; name: string; role: string; workUnits: number }[];
};

export type ReviewRow = {
  agentId: string;
  name: string;
  owner: string;
  status: AgentRecord['status'];
  lastReview: string;
  nextReview: string;
  cadenceDays: number;
  reviewStatus: ReviewStatus;
  daysUntil: number;
};

export type StandardReport = {
  checks: { key: string; label: string }[];
  matrix: { agentId: string; name: string; status: AgentRecord['status']; owner: string; checks: StandardCheck[] }[];
};

export type CostRow = {
  agentId: string;
  name: string;
  source: DataSource;
  builtWith: AgentRecord['builtWith'];
  status: AgentRecord['status'];
  workUnits: number;
  unitLabel: string;
  costUsd: number;
  costPerUnitUsd: number | null;
  targetPerUnitUsd: number;
  monthlyBudgetUsd: number;
  monthToDateUsd: number;
  perRunCapUsd: number;
  valueUsd: number;
  daily: (number | null)[];
};

export type CostReport = {
  range: { from: string; to: string };
  days: string[];
  totals: { costUsd: number; workUnits: number; valueUsd: number; monthToDateUsd: number; monthlyBudgetUsd: number };
  agents: CostRow[];
  byModel: { model: string; calls: number; costUsd: number }[];
  /** Signal Loop's real $15 live-AI budget, from live ai.call / budget logs. */
  liveBudget: { limitUsd: number; spentUsd: number; liveCalls: number; lastCallAt: string | null; source: 'live' };
};

export type PlatformMeta = {
  simulatedFrom: string;
  simulatedTo: string;
  seededAt: string | null;
  rolledForwardDays: number;
  workspaceId: string | null;
  viewerActorId: string | null;
  now: string;
};

export type LiveYou = { sessionIds: string[]; actorId: string | null };

export type UsageReportX = UsageReport & {
  you: LiveYou;
  totals: { users: number; sessions: number; events: number; priorUsers: number; wau: number; priorWau: number };
  liveSessions: { sessionId: string; actorId: string; firstAt: string; lastAt: string; events: number; lastPath: string | null; isYou: boolean }[];
};

export type LogsPage = { rows: LogEntry[]; nextCursor: string | null; total: number | null };
export type TraceView = { spans: Span[]; logs: LogEntry[]; agentId: string | null; source: DataSource | null };
export type YourLastRun = { traceId: string; runId: string | null; at: string } | null;

export type OverviewX = OverviewReport & {
  funnel: { invoked: number; output: number; accepted: number; edited: number; rejected: number; automatic: number; failed: number };
  prior: { hoursReturned: number; activeUsers: number; aiCostUsd: number };
  lastWeek: { hoursReturned: number; aiCostUsd: number; from: string; to: string };
  wau: { current: number; prior: number };
  weeklyAgents: { agentId: string; name: string; color: string }[];
  agentRows: (AgentImpact & { color: string; status: AgentRecord['status']; weeklyHours: (number | null)[]; department: string; builtWith: string; outcomes: Record<'accepted' | 'edited' | 'rejected' | 'automatic' | 'failed', number>; unitLabel: string })[];
  simulatedTo: string;
  openAlerts: Alert[];
  reviewsDue: { agentId: string; name: string; nextReview: string; reviewStatus: ReviewStatus; owner: string }[];
  baselines: { agentId: string; name: string; unitLabel: string; baselineMinutes: number; humanMinutes: number }[];
};

export type ObservabilityX = ObservabilityReport & {
  hourlyByAgent: boolean;
  breaches: { hour: string; kind: 'errors' | 'latency' }[];
  p95TargetMs: number | null;
  window: { from: string; to: string };
};

export type AssumptionsView = ImpactAssumptions & { workspace: string; isOverride: boolean };
