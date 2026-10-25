/**
 * OpenRouter chat client for the data build: disk cache (reruns are free), cumulative cost
 * ledger, hard budget stop, retries with backoff.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../world.ts';

export const MODEL = 'deepseek/deepseek-v4.1-flash';
export const HARD_BUDGET_USD = 2.6; // stop well before the $3.00 allowance
const CACHE_DIR = join(DATA_DIR, '.cache', 'llm');
const LEDGER = join(DATA_DIR, '.cache', 'cost-ledger.json');

type Ledger = { totalUsd: number; calls: number; cachedHits: number; updatedAt: string };

function readLedger(): Ledger {
  if (!existsSync(LEDGER)) return { totalUsd: 0, calls: 0, cachedHits: 0, updatedAt: new Date().toISOString() };
  return JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
}
function writeLedger(l: Ledger): void {
  mkdirSync(join(DATA_DIR, '.cache'), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify({ ...l, updatedAt: new Date().toISOString() }, null, 2));
}

export function spentUsd(): number {
  return readLedger().totalUsd;
}

export type ChatResult = { content: string; costUsd: number; cached: boolean; ms: number; truncated: boolean };

export async function chatJson(opts: { system: string; user: string; maxTokens: number; temperature?: number; tag: string }): Promise<ChatResult> {
  const key = process.env.OPENROUTER_BUILD_KEY;
  const body = {
    model: MODEL,
    temperature: opts.temperature ?? 0.85,
    max_tokens: opts.maxTokens,
    usage: { include: true },
    reasoning: { enabled: false },
    provider: { data_collection: 'deny' },
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24);
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${opts.tag}.${hash}.json`);
  if (existsSync(cacheFile)) {
    const hit = JSON.parse(readFileSync(cacheFile, 'utf8')) as { content: string; finishReason?: string };
    const l = readLedger();
    l.cachedHits++;
    writeLedger(l);
    return { content: hit.content, costUsd: 0, cached: true, ms: 0, truncated: hit.finishReason === 'length' };
  }
  if (!key) throw new Error('OPENROUTER_BUILD_KEY missing (run with --env-file=.env)');
  if (readLedger().totalUsd >= HARD_BUDGET_USD) throw new Error(`budget stop: $${readLedger().totalUsd.toFixed(4)} spent`);

  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180_000);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'Signal Loop data build' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        lastErr = `${res.status} ${text.slice(0, 200)}`;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const j = JSON.parse(text) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { cost?: number } };
      const finishReason = j.choices?.[0]?.finish_reason ?? '';
      const content = j.choices?.[0]?.message?.content ?? '';
      const cost = j.usage?.cost ?? 0;
      const l = readLedger();
      l.totalUsd += cost;
      l.calls++;
      writeLedger(l);
      if (!content.trim()) {
        lastErr = 'empty content';
        continue;
      }
      writeFileSync(cacheFile, JSON.stringify({ tag: opts.tag, model: MODEL, costUsd: cost, finishReason, content }, null, 2));
      return { content, costUsd: cost, cached: false, ms: Math.round(performance.now() - t0), truncated: finishReason === 'length' };
    } catch (e) {
      lastErr = String(e);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`LLM call failed for ${opts.tag}: ${lastErr}`);
}

/** Run async jobs with a concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}
