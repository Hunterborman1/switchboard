/**
 * Worker implementations of the pipeline dependencies: OpenRouter (runtime key) with a D1
 * ledger, Workers AI embeddings, Vectorize (D1 cosine fallback), and a D1 store whose writes
 * stop the moment a run is no longer live (superseded by a replay fallback).
 */
import type { Delivery, FileFormat, Insight, Notification, RunStep, ScreenOutput } from '../shared/contracts.ts';
import type { DlqRow, LlmCallRow, NewTheme, PipelineDeps, PipelineStore, RedactedDoc, ThemeCandidate } from '../pipeline/types.ts';
import { cosine, hashEmbed } from '../pipeline/theme.ts';
import { createLlm } from './ai.ts';
import { aiCallStatement } from './budget.ts';
import { batch, deliveryStatement, insightStatement, j, notificationStatement, nowIso, SEED, stepStatement, updateRunRow } from './db.ts';
import type { Env } from './env.ts';
import { aiCallTelemetry, type TraceCtx } from './telemetry.ts';

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

export function d1Store(env: Env, runId: string, workspaceId: string, opts: { guardLive?: boolean } = {}): PipelineStore & { assertLive(): Promise<void> } {
  const db = env.DB;
  const assertLive = async () => {
    if (!opts.guardLive) return;
    const r = await db.prepare('SELECT mode FROM runs WHERE id = ?').bind(runId).first<{ mode: string }>();
    if (!r || r.mode !== 'live') throw new RunSuperseded(runId);
  };
  return {
    assertLive,
    async saveRawFile(f) {
      await db.prepare('INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?,?,?,?,?)').bind(f.sha256, f.filename, f.sizeBytes, f.content, nowIso()).run();
    },
    async saveTranscript(id: string, doc: RedactedDoc, format: FileFormat) {
      await assertLive();
      await db.batch([
        db.prepare('INSERT INTO transcripts (run_id, format, turns, redactions) VALUES (?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET format=excluded.format, turns=excluded.turns, redactions=excluded.redactions').bind(id, format, JSON.stringify(doc.turns), JSON.stringify(doc.redactions)),
        db.prepare('INSERT INTO redaction_vault (run_id, vault, created_at) VALUES (?,?,?) ON CONFLICT(run_id) DO UPDATE SET vault=excluded.vault').bind(id, JSON.stringify(doc.vault), nowIso()),
        db.prepare('UPDATE runs SET format = ? WHERE id = ?').bind(format, id),
      ]);
    },
    async saveScreen(id: string, screen: ScreenOutput) {
      await assertLive();
      await db.prepare('UPDATE runs SET screen = ?, injection_flagged = ?, actionable = ? WHERE id = ?').bind(JSON.stringify(screen), screen.injection_suspected ? 1 : 0, screen.actionable ? 1 : 0, id).run();
    },
    async saveInsights(insights: Insight[]) {
      await assertLive();
      await batch(db, insights.map((i) => insightStatement(db, i)));
    },
    async createThemes(themes: NewTheme[]) {
      await assertLive();
      await batch(
        db,
        themes.map((t) =>
          db
            .prepare('INSERT OR IGNORE INTO themes (id, workspace_id, name, summary, type, product_area, status, owner_id, created_at, vector) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .bind(t.id, t.workspaceId, t.name, t.summary, t.type, t.productArea, t.status, t.ownerId, t.createdAt, JSON.stringify(t.vector.map((x) => Math.round(x * 1e5) / 1e5))),
        ),
      );
      if (env.VECTOR_MODE !== 'd1') {
        try {
          await env.VECTORS.upsert(themes.map((t) => ({ id: t.id, values: t.vector, metadata: { workspaceId: t.workspaceId, type: t.type, productArea: t.productArea, name: t.name } })));
        } catch (err) {
          console.warn(JSON.stringify({ level: 'warn', event: 'vectorize.upsert_failed', msg: String(err).slice(0, 200) }));
        }
      }
    },
    async saveDeliveries(ds: Delivery[]) {
      await assertLive();
      await batch(db, ds.map((d) => deliveryStatement(db, d)));
    },
    async saveNotifications(ns: Notification[]) {
      await assertLive();
      await batch(db, ns.map((n) => notificationStatement(db, n)));
    },
    async updateRun(id: string, patch: Record<string, unknown>) {
      const changed = await updateRunRow(db, id, patch, { onlyIfLive: opts.guardLive });
      if (opts.guardLive && changed === 0) throw new RunSuperseded(id);
    },
    async recordDlq(row: DlqRow) {
      await db.prepare('INSERT INTO dlq (id, run_id, workspace_id, step, error, payload, created_at) VALUES (?,?,?,?,?,?,?)').bind(`dlq_${crypto.randomUUID().slice(0, 18)}`, row.runId, workspaceId, row.step, row.error.slice(0, 1000), JSON.stringify(row.payload).slice(0, 8000), nowIso()).run();
    },
  };
}

export function workerDeps(env: Env, o: { runId: string; workspaceId: string; trace: TraceCtx; guardLive?: boolean }): PipelineDeps {
  const db = env.DB;
  const aiTel = aiCallTelemetry(o.trace);
  const store = d1Store(env, o.runId, o.workspaceId, { guardLive: o.guardLive ?? true });
  const llm = createLlm({
    apiKey: env.OPENROUTER_API_KEY ?? '',
    primary: env.MODEL_PRIMARY,
    secondary: env.MODEL_SECONDARY,
    ...(env.OPENROUTER_BASE_URL ? { baseURL: env.OPENROUTER_BASE_URL } : {}),
    onCall: async (row: LlmCallRow) => {
      aiTel(row);
      await aiCallStatement(db, row, o.workspaceId, 'runtime').run();
    },
  });
  return {
    llm,
    embed: (texts) => embedTexts(env, texts),
    vectorQuery: (v, q) => vectorQuery(env, v, q),
    store,
    clock: { now: () => Date.now() },
    onStep: async (row: RunStep) => {
      await store.assertLive();
      await stepStatement(db, row).run();
    },
  };
}
