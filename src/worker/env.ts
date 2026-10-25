import type { Access } from './gate';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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
}

/** Env as seen by API handlers: the gate's decision is attached. */
export type ApiEnv = Env & { ACCESS: Extract<Access, { ok: true }> };
