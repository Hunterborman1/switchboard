/**
 * Worker implementations of the pipeline dependencies: OpenRouter (runtime key) with a D1
 * ledger, Workers AI embeddings, Vectorize (D1 cosine fallback), and a D1 store that writes
 * through the run's WriteQueue and stops the moment a run is no longer live (superseded by a
 * replay fallback).
 */
import type { Delivery, FileFormat, Insight, Notification, RunStep, ScreenOutput } from '../shared/contracts.ts';
import type { DlqRow, LlmCallRow, LlmClient, NewTheme, PipelineDeps, PipelineStore, RedactedDoc, ThemeCandidate } from '../pipeline/types.ts';
import { cosine, hashEmbed } from '../pipeline/theme.ts';
import { createLlm } from './ai.ts';
import { aiCallStatement } from './budget.ts';
import { deliveryStatement, insightStatement, j, notificationStatement, nowIso, SEED, stepStatement, updateRunStatement } from './db.ts';
import type { Env } from './env.ts';
import { aiCallTelemetry, type TraceCtx } from './telemetry.ts';
import type { WriteQueue } from './writeQueue.ts';

export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

export class RunSuperseded extends Error {
  constructor(runId: string) {
    super(`run ${runId} is no longer live (replaced by a replay)`);
    this.name = 'RunSuperseded';
  }
}

export async function embedTexts(env: Env, texts: string[]): Promise<{ vectors: number[][]; model: string }> {
  if (env.EMBED_MODE !== 'hash') {
    try {
      const out = (await env.AI.run(EMBED_MODEL as never, { text: texts } as never)) as { data?: number[][] };
      if (out?.data?.length === texts.length) return { vectors: out.data, model: EMBED_MODEL };
    } catch (err) {
      console.warn(JSON.stringify({ level: 'warn', event: 'embed.fallback', msg: String(err).slice(0, 200) }));
    }
  }
  return { vectors: texts.map((t) => hashEmbed(t)), model: 'hash-768 (fallback)' };
}

export async function vectorQuery(env: Env, vector: number[], opts: { topK: number; workspaceId: string }): Promise<ThemeCandidate[]> {
  const visible = new Set([SEED, opts.workspaceId]);
  if (env.VECTOR_MODE !== 'd1') {
    try {
      const res = await env.VECTORS.query(vector, { topK: Math.min(20, opts.topK * 4), returnMetadata: 'all' });
      const out = res.matches
        .filter((m) => visible.has(String(m.metadata?.workspaceId ?? '')))
        .map((m) => ({ themeId: m.id, score: m.score, type: String(m.metadata?.type ?? ''), productArea: String(m.metadata?.productArea ?? ''), name: String(m.metadata?.name ?? '') }));
      if (out.length) return out.slice(0, opts.topK);
    } catch (err) {
      console.warn(JSON.stringify({ level: 'warn', event: 'vectorize.fallback', msg: String(err).slice(0, 200) }));
    }
  }
  const { results } = await env.DB.prepare('SELECT id, name, type, product_area, vector FROM themes WHERE workspace_id IN (?, ?) AND vector IS NOT NULL').bind(SEED, opts.workspaceId).all<Record<string, unknown>>();
  return results
    .map((r) => ({ themeId: String(r.id), score: cosine(vector, j<number[]>(r.vector, [])), type: String(r.type), productArea: String(r.product_area), name: String(r.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topK);
}

/**
 * The D1 pipeline store. Every write goes through the run's WriteQueue (ordered, coalesced
 * into db.batch round trips); liveness is checked by the queue before each batch, and a
 * superseded run throws RunSuperseded at the next store call.
 */
export function d1Store(env: Env, runId: string, workspaceId: string, queue: WriteQueue): PipelineStore & { assertLive(): void } {
  const db = env.DB;
  const assertLive = () => {
    if (queue.superseded) throw new RunSuperseded(runId);
  };
  return {
    assertLive,
    async saveRawFile(f) {
      queue.push(db.prepare('INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?,?,?,?,?)').bind(f.sha256, f.filename, f.sizeBytes, f.content, nowIso()));
    },
    async saveTranscript(id: string, doc: RedactedDoc, format: FileFormat) {
      assertLive();
      queue.push(
        db.prepare('INSERT INTO transcripts (run_id, format, turns, redactions) VALUES (?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET format=excluded.format, turns=excluded.turns, redactions=excluded.redactions').bind(id, format, JSON.stringify(doc.turns), JSON.stringify(doc.redactions)),
        db.prepare('INSERT INTO redaction_vault (run_id, vault, created_at) VALUES (?,?,?) ON CONFLICT(run_id) DO UPDATE SET vault=excluded.vault').bind(id, JSON.stringify(doc.vault), nowIso()),
        db.prepare('UPDATE runs SET format = ? WHERE id = ?').bind(format, id),
      );
    },
    async saveScreen(id: string, screen: ScreenOutput) {
      assertLive();
      queue.push(db.prepare('UPDATE runs SET screen = ?, injection_flagged = ?, actionable = ? WHERE id = ?').bind(JSON.stringify(screen), screen.injection_suspected ? 1 : 0, screen.actionable ? 1 : 0, id));
    },
    async saveInsights(insights: Insight[]) {
      assertLive();
      queue.push(...insights.map((i) => insightStatement(db, i)));
    },
    async createThemes(themes: NewTheme[]) {
      assertLive();
      queue.push(
        ...themes.map((t) =>
          db
            .prepare('INSERT OR IGNORE INTO themes (id, workspace_id, name, summary, type, product_area, status, owner_id, created_at, vector) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .bind(t.id, t.workspaceId, t.name, t.summary, t.type, t.productArea, t.status, t.ownerId, t.createdAt, JSON.stringify(t.vector.map((x) => Math.round(x * 1e5) / 1e5))),
        ),
      );
      if (env.VECTOR_MODE !== 'd1') queue.track(upsertThemeVectors(env, themes));
    },
    async saveDeliveries(ds: Delivery[]) {
      assertLive();
      queue.push(...ds.map((d) => deliveryStatement(db, d)));
    },
    async saveNotifications(ns: Notification[]) {
      assertLive();
      queue.push(...ns.map((n) => notificationStatement(db, n)));
    },
    async updateRun(id: string, patch: Record<string, unknown>) {
      assertLive();
      queue.push(updateRunStatement(db, id, patch, { onlyIfLive: true }));
    },
    async recordDlq(row: DlqRow) {
      queue.push(db.prepare('INSERT INTO dlq (id, run_id, workspace_id, step, error, payload, created_at) VALUES (?,?,?,?,?,?,?)').bind(`dlq_${crypto.randomUUID().slice(0, 18)}`, row.runId, workspaceId, row.step, row.error.slice(0, 1000), JSON.stringify(row.payload).slice(0, 8000), nowIso()));
    },
  };
}

export async function upsertThemeVectors(env: Env, themes: Pick<NewTheme, 'id' | 'vector' | 'workspaceId' | 'type' | 'productArea' | 'name'>[]): Promise<void> {
  if (env.VECTOR_MODE === 'd1' || !themes.length) return;
  try {
    await env.VECTORS.upsert(themes.map((t) => ({ id: t.id, values: t.vector, metadata: { workspaceId: t.workspaceId, type: t.type, productArea: t.productArea, name: t.name } })));
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', event: 'vectorize.upsert_failed', msg: String(err).slice(0, 200) }));
  }
}

export function runLlm(env: Env, o: { workspaceId: string; trace: TraceCtx; queue: WriteQueue }): LlmClient {
  const aiTel = aiCallTelemetry(o.trace);
  return createLlm({
    apiKey: env.OPENROUTER_API_KEY ?? '',
    primary: env.MODEL_PRIMARY,
    secondary: env.MODEL_SECONDARY,
    ...(env.OPENROUTER_BASE_URL ? { baseURL: env.OPENROUTER_BASE_URL } : {}),
    onCall: (row: LlmCallRow) => {
      aiTel(row);
      // The budget ledger row rides the run's write queue (committed before the run settles).
      o.queue.push(aiCallStatement(env.DB, row, o.workspaceId, 'runtime'));
    },
  });
}

export function workerDeps(env: Env, o: { runId: string; workspaceId: string; trace: TraceCtx; queue: WriteQueue }): PipelineDeps & { store: ReturnType<typeof d1Store> } {
  const store = d1Store(env, o.runId, o.workspaceId, o.queue);
  return {
    llm: runLlm(env, o),
    embed: (texts) => embedTexts(env, texts),
    vectorQuery: (v, q) => vectorQuery(env, v, q),
    store,
    clock: { now: () => Date.now() },
    onStep: (row: RunStep) => {
      store.assertLive();
      o.queue.push(stepStatement(env.DB, row));
    },
  };
}
