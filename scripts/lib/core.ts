/**
 * Run library files through the real pipeline core from Node (build key, real models).
 * The theme step is serialized across concurrent runs so the shared theme index grows
 * deterministically in processing order.
 */
import type { Account, Insight, RunStep } from '../../src/shared/contracts.ts';
import { PROMPT_VERSION } from '../../src/shared/prompts/extract.ts';
import { runPipeline } from '../../src/pipeline/run.ts';
import { cosine } from '../../src/pipeline/theme.ts';
import type { LlmCallRow, LlmClient, NewTheme, PipelineResult, ThemeCandidate } from '../../src/pipeline/types.ts';
import { randomId } from '../../src/pipeline/util.ts';
import type { LibraryEntry, World } from './data.ts';
import type { Embedder } from './embed.ts';
import { memStore, type MemState } from './memstore.ts';

export type ThemeIndex = { themes: Map<string, NewTheme> };

export function themeIndex(initial: NewTheme[] = []): ThemeIndex {
  return { themes: new Map(initial.map((t) => [t.id, t])) };
}

export function queryIndex(idx: ThemeIndex, vector: number[], visible: Set<string>, topK: number): ThemeCandidate[] {
  return [...idx.themes.values()]
    .filter((t) => visible.has(t.workspaceId) && t.vector.length)
    .map((t) => ({ themeId: t.id, score: cosine(vector, t.vector), type: t.type, productArea: t.productArea, name: t.name }))
    .sort((a, b) => b.score - a.score || a.themeId.localeCompare(b.themeId))
    .slice(0, topK);
}

class Mutex {
  private p: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.p;
    this.p = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
const themeLock = new Mutex();

export type FileRun = { file: LibraryEntry; runId: string; result: PipelineResult; state: MemState; calls: LlmCallRow[]; wallMs: number; offsetMs: number };

export async function runFile(o: {
  file: LibraryEntry;
  world: World;
  llm: LlmClient;
  calls?: LlmCallRow[];
  embed: Embedder;
  index: ThemeIndex | null; // null: no theme matching against history
  addThemesToIndex?: boolean;
  workspaceId?: string;
  promptVersion?: string;
  startAt?: number; // simulated wall clock start (ms) for history
  runId?: string;
}): Promise<FileRun> {
  const runId = o.runId ?? randomId('run');
  const ws = o.workspaceId ?? 'seed';
  const store = memStore();
  const account: Account | null = o.file.accountId ? o.world.accounts.find((a) => a.id === o.file.accountId) ?? null : null;
  const real0 = Date.now();
  const offset = o.startAt !== undefined ? o.startAt - real0 : 0;
  const t0 = Date.now();
  const result = await runPipeline(
    {
      runId, workspaceId: ws, fileId: o.file.id, filename: o.file.filename, content: o.file.content, formatHint: o.file.format, promptVersion: o.promptVersion ?? PROMPT_VERSION,
      account, people: o.world.people, accounts: o.world.accounts, rules: o.world.rules, taxonomy: o.world.taxonomy,
    },
    {
      llm: o.llm,
      embed: o.embed,
      vectorQuery: async (v, q) => (o.index ? queryIndex(o.index, v, new Set(['seed', q.workspaceId]), q.topK) : []),
      store: {
        ...store,
        async createThemes(themes) {
          await store.createThemes(themes);
          if (o.index && o.addThemesToIndex) for (const t of themes) o.index.themes.set(t.id, t);
        },
      },
      clock: { now: () => Date.now() + offset },
      runStep: async (key, fn) => (key === 'theme' && o.index && o.addThemesToIndex ? themeLock.run(fn) : fn()),
    },
  );
  return { file: o.file, runId, result, state: store.state, calls: o.calls ?? [], wallMs: Date.now() - t0, offsetMs: offset };
}

/** Run tasks with bounded concurrency, preserving result order. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

export function summarizeSteps(steps: RunStep[]): string {
  return steps.map((s) => `${s.key}:${s.status}`).join(' ');
}

export type { Insight };
