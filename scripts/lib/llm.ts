/**
 * Build-key LLM for scripts (seed history, replays, evals). Every call is appended to
 * .wrangler/build-spend.jsonl (gitignored) and a hard cap stops scripts before overspending.
 * Never uses the runtime or management keys.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLlm } from '../../src/worker/ai.ts';
import type { LlmCallRow, LlmClient } from '../../src/pipeline/types.ts';
import { ROOT } from './data.ts';

export const MODEL_PRIMARY = 'deepseek/deepseek-v4.1-flash';
export const MODEL_SECONDARY = 'anthropic/claude-haiku-5.5';
const LEDGER = join(ROOT, '.wrangler', 'build-spend.jsonl');
const CAP = Number(process.env.BUILD_SPEND_CAP_USD ?? 5);

export function buildSpend(): number {
  if (!existsSync(LEDGER)) return 0;
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).reduce((s, l) => {
    try {
      return s + Number(JSON.parse(l).costUsd ?? 0);
    } catch {
      return s;
    }
  }, 0);
}

export class SpendCapReached extends Error {}

export function buildLlm(opts: { tag: string; onCall?: (row: LlmCallRow) => void; primary?: string; secondary?: string }): LlmClient & { spent(): number } {
  const key = process.env.OPENROUTER_BUILD_KEY;
  if (!key) throw new Error('OPENROUTER_BUILD_KEY missing (run with node --env-file=.env)');
  mkdirSync(join(ROOT, '.wrangler'), { recursive: true });
  let spent = 0;
  const client = createLlm({
    apiKey: key,
    primary: opts.primary ?? MODEL_PRIMARY,
    secondary: opts.secondary ?? MODEL_SECONDARY,
    appName: 'Signal Loop (build)',
    primaryTimeoutMs: 30_000,
    secondaryTimeoutMs: 45_000,
    onCall: (row) => {
      spent += row.costUsd;
      appendFileSync(LEDGER, `${JSON.stringify({ at: row.createdAt, tag: opts.tag, model: row.model, purpose: row.purpose, costUsd: row.costUsd, ok: row.ok })}\n`);
      opts.onCall?.(row);
    },
  });
  return {
    spent: () => spent,
    async structured(req) {
      const total = buildSpend();
      if (total >= CAP) throw new SpendCapReached(`build spend cap reached: $${total.toFixed(4)} ≥ $${CAP}`);
      return client.structured(req);
    },
  };
}
