/**
 * Response shapes for the Signal Loop API, derived from src/shared/contracts.ts (the
 * source of truth). The contract comment block at the bottom of contracts.ts lists the
 * endpoints; shapes it leaves loose (`/health` rows) are typed defensively here.
 */
import type {
  Account,
  Budget,
  Channel,
  Delivery,
  EvalRun,
  Insight,
  InsightType,
  LibraryFile,
  Notification,
  Person,
  ProductArea,
  ReviewRecord,
  RoutingRule,
  Run,
  RunDetail,
  Theme,
} from '../../shared/contracts';

export type { RunDetail };

export type World = { accounts: Account[]; people: Person[] };
export type LibraryFileDetail = { file: LibraryFile; content: string };
/** Fixture mode omits the duplicate fields; the Worker always sends them. */
export type CreateRunResult = { runId: string; mode: 'live' | 'replay'; modeReason?: string | null; duplicate?: boolean; duplicateScope?: 'workspace' | 'seed' | null; duplicateCreatedAt?: string | null };
export type InsightDetail = {
  insight: Insight;
  run: Run | null;
  deliveries: Delivery[];
  reviews: ReviewRecord[];
  theme: Theme | null;
};
export type ReviewResult = { insight: Insight; delivery: Delivery | null };
export type ThemeDetail = { theme: Theme; insights: Insight[]; accounts: Account[] };
export type RoutingFlow = { type: InsightType; area: ProductArea; ownerId: string; count: number };
export type RoutingPreview = { flows: RoutingFlow[] };
export type TicketResult = { delivery: Delivery; notification: Notification | null };
export type EvalsData = { latest: EvalRun; history: EvalRun[]; candidate: EvalRun | null };

export type LedgerDay = {
  day: string; // YYYY-MM-DD
  calls: number | null;
  costUsd: number | null; // null = nothing collected that day (a gap, never $0)
  p50Ms: number | null;
  p95Ms: number | null;
  failures: number | null;
};
export type DlqRow = {
  id: string;
  runId: string | null;
  step: string | null;
  error: string;
  attempts: number | null;
  at: string;
  filename?: string | null;
};
export type AiCallRow = {
  id: string;
  at: string;
  runId: string | null;
  step: string | null;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ms: number | null;
  ok: boolean;
  mode?: 'live' | 'replay' | null;
};
export type HealthData = { budget: Budget; ledger: LedgerDay[]; dlq: DlqRow[]; recent: AiCallRow[] };

export type InsightFilters = {
  type?: string | null;
  area?: string | null;
  status?: string | null;
  account?: string | null;
  q?: string | null;
};

export type ReviewPostBody = {
  idempotencyKey: string;
  action: 'approve' | 'edit' | 'reject';
  edits?: Partial<{ type: InsightType; summary: string; productArea: ProductArea; severity: Insight['severity'] }>;
  reason?: string;
  /** Time from the item being shown to the action (telemetry; Agent Ops). */
  dwellMs?: number;
};

export type DeliveryChannel = Channel;
