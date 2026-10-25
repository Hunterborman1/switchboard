import type { Access } from './gate';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Agent Ops platform store. Only src/worker/platform/** may touch it. */
  PLATFORM_DB: D1Database;
  KV: KVNamespace;
  VECTORS: VectorizeIndex;
  AI: Ai;
  PIPELINE: Workflow;
  RL_RUNS: RateLimit;

  MODEL_PRIMARY: string;
  MODEL_SECONDARY: string;
  BUDGET_LIMIT_USD: string;

  INVOCA_PASSWORD?: string;
  LINK_SIGNING_SECRET?: string;
  SITE_PASSWORD?: string;
  OPENROUTER_API_KEY?: string;

  /** Test/local overrides (never set in production). */
  OPENROUTER_BASE_URL?: string;
  /** 'hash' forces the deterministic local embedding (tests, offline dev). */
  EMBED_MODE?: string;
  /** 'd1' forces the D1 cosine scan instead of Vectorize (tests, local dev). */
  VECTOR_MODE?: string;
  /** Live runs slower than this fall back to replay (ms, default 25000). */
  LIVE_FALLBACK_MS?: string;
  /** Fast-path budget before the durable Workflow takes over (ms, default 18000). */
  FAST_PATH_BUDGET_MS?: string;
  /** A pasted-text run with no progress for this long restarts on the Workflow (ms, default 40000). */
  STALLED_AFTER_MS?: string;
}

/** Env as seen by API handlers: the gate's decision is attached. */
export type ApiEnv = Env & { ACCESS: Extract<Access, { ok: true }> };
