/**
 * Internal types for the runtime-agnostic pipeline core. The same core runs inside the
 * Cloudflare Workflow and inside Node scripts; everything environment-specific comes in
 * through `PipelineDeps`.
 */
import type { z } from 'zod';
import type {
  Account, Delivery, FileFormat, Insight, Notification, Person, Redaction, RoutingRule, RunStep, ScreenOutput, StepKey, Turn,
} from '../shared/contracts.ts';

/** A parsed turn before redaction (original text; never leaves the server). */
export type RawTurn = {
  id: string;
  speaker: string;
  role: 'customer' | 'invoca' | 'unknown';
  ts: string | null;
  text: string;
};

export type ParsedDoc = {
  format: FileFormat;
  turns: RawTurn[];
  speakers: string[];
  warnings: string[];
  subject: string | null;
};

export type RedactedDoc = {
  /** Turn texts joined with "\n": the document every char offset refers to. */
  text: string;
  turns: Turn[];
  redactions: Redaction[];
  /** token → original value. Server-side only; never returned by the API. */
  vault: Record<string, string>;
};

export type LlmPurpose = 'screen' | 'extract' | 'theme_name' | 'judge';

export type LlmCallRow = {
  id: string;
  runId: string | null;
  purpose: LlmPurpose;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  ms: number;
  ok: boolean;
  error: string | null;
  attempt: number; // 1 = first try, 2 = schema retry, 3 = secondary
  fallback: boolean; // secondary model used
  schemaRetry: boolean;
  createdAt: string;
};

export type LlmMeta = {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  ms: number;
  attempts: number;
  fellBack: boolean;
  schemaRetried: boolean;
  errors: string[];
};

export type LlmRequest<T> = {
  purpose: LlmPurpose;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Strict JSON schema sent to the provider (response_format json_schema). */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
  runId: string | null;
  /** Light deterministic repair applied before Zod validation (e.g. truncating long strings). */
  repair?: (raw: unknown) => unknown;
};

export interface LlmClient {
  structured<T>(req: LlmRequest<T>): Promise<{ data: T; meta: LlmMeta }>;
}

export class LlmFailure extends Error {
  readonly meta: LlmMeta;
  constructor(message: string, meta: LlmMeta) {
    super(message);
    this.name = 'LlmFailure';
    this.meta = meta;
  }
}

export type ThemeCandidate = { themeId: string; score: number; type: string; productArea: string; name: string };

export type NewTheme = {
  id: string;
  workspaceId: string;
  name: string;
  summary: string;
  type: Insight['type'];
  productArea: Insight['productArea'];
  status: 'candidate';
  ownerId: string | null;
  vector: number[];
  createdAt: string;
};

export type DlqRow = { runId: string; step: StepKey; error: string; payload: Record<string, unknown> };

/** Persistence the pipeline needs. D1 in the Worker, memory in Node scripts. */
export interface PipelineStore {
  saveRawFile(f: { sha256: string; filename: string; content: string; sizeBytes: number }): Promise<void>;
  saveTranscript(runId: string, doc: RedactedDoc, format: FileFormat): Promise<void>;
  saveScreen(runId: string, screen: ScreenOutput): Promise<void>;
  saveInsights(insights: Insight[]): Promise<void>;
  createThemes(themes: NewTheme[]): Promise<void>;
  saveDeliveries(deliveries: Delivery[]): Promise<void>;
  saveNotifications(notifications: Notification[]): Promise<void>;
  updateRun(runId: string, patch: Record<string, unknown>): Promise<void>;
  recordDlq(row: DlqRow): Promise<void>;
}

/** Observability hooks (Agent Ops instrumentation in the Worker; console in scripts). */
export interface PipelineTelemetry {
  stepStarted?(key: StepKey, at: string): void;
  stepFinished?(row: RunStep): void;
  delivery?(d: Delivery): void;
}

export interface PipelineDeps {
  llm: LlmClient;
  embed(texts: string[]): Promise<{ vectors: number[][]; model: string }>;
  vectorQuery(vector: number[], opts: { topK: number; workspaceId: string }): Promise<ThemeCandidate[]>;
  store: PipelineStore;
  clock: { now(): number };
  /** Run-step row sink (D1 run_steps upsert in the Worker). */
  onStep?(row: RunStep): Promise<void> | void;
  /** Durable step wrapper (Workflow step.do). Defaults to calling fn directly. */
  runStep?<T>(key: StepKey, fn: () => Promise<T>): Promise<T>;
  ids?(prefix: string): string;
  telemetry?: PipelineTelemetry;
  /**
   * Fast path only: start the extract call alongside the screen call (same redacted input).
   * Extraction waits on screen's verdict before anything is used; a non-actionable verdict
   * discards it (its cost is still attributed to the run).
   */
  speculativeExtract?: boolean;
  /**
   * Fast path only: name new candidate themes after the run instead of inside the theme step.
   * Membership is unchanged; themes start with the deterministic fallback name and the sink
   * renames them with one batched LLM call once the run has finished.
   */
  deferThemeNaming?(job: ThemeNamingJob): void;
}

export type ThemeNamingJob = {
  runId: string;
  clusters: { key: string; themeId: string; type: string; productArea: string; summaries: string[]; vector: number[]; workspaceId: string }[];
};

export type Taxonomy = {
  types: { key: string; label: string; definition: string; counterExamples: string[] }[];
  areas: { key: string; label: string; definition: string }[];
};

export type PipelineInput = {
  runId: string;
  workspaceId: string;
  fileId: string | null;
  filename: string;
  content: string;
  formatHint?: FileFormat | null;
  promptVersion: string;
  account: Account | null;
  people: Person[];
  accounts: Account[];
  rules: RoutingRule[];
  taxonomy?: Taxonomy | null;
  /** Skip extraction when the screen says nothing is actionable (default true). */
  skipExtractWhenNotActionable?: boolean;
};

export type PipelineResult = {
  status: 'awaiting_review' | 'completed' | 'failed';
  error: string | null;
  sha256: string;
  format: FileFormat;
  steps: RunStep[];
  turns: Turn[];
  redactions: Redaction[];
  screen: ScreenOutput | null;
  insights: Insight[];
  deliveries: Delivery[];
  notifications: Notification[];
  newThemes: NewTheme[];
  costUsd: number;
  durationMs: number;
  injectionFlagged: boolean;
  actionable: boolean | null;
  /** Exactly the text sent to the model (for PHI-leak checks in evals). */
  modelInputs: string[];
};
