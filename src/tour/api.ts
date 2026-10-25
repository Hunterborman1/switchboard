/** Tiny read-only API client for the walkthrough (the product owns writes). */
import { API_BASE, type Envelope, type Run, type RunDetail, type Insight, type Session, type Budget, type Theme } from '../shared/contracts';
import type { EvalsData } from './engine/types';

type ProductRequest = <T>(method: 'GET', path: string) => Promise<{ data: T }>;
/** Use the product's client when it exists (so fixture mode and 401 handling match the app). */
const productClient = import.meta.glob<{ request?: ProductRequest }>('../app/api/client.ts', { eager: true });
const productRequest: ProductRequest | undefined = Object.values(productClient)[0]?.request;

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const devHarness = typeof window !== 'undefined' && (window as unknown as { __slDevFetch?: boolean }).__slDevFetch;
  if (productRequest && !devHarness) return (await productRequest<T>('GET', path)).data;
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const body = (await res.json()) as Envelope<T> | T;
  return body && typeof body === 'object' && 'data' in (body as object) ? (body as Envelope<T>).data : (body as T);
}

export const tourApi = {
  run: (id: string, signal?: AbortSignal) => get<RunDetail>(`/runs/${encodeURIComponent(id)}`, signal),
  runs: (limit = 100) => get<Run[]>(`/runs?limit=${limit}`),
  insights: (q = '') => get<Insight[]>(`/insights${q}`),
  session: () => get<Session>('/session'),
  evals: () => get<EvalsData>('/evals'),
  themes: () => get<Theme[]>('/themes'),
  health: () => get<{ budget: Budget; ledger: Array<{ day: string; calls: number; costUsd: number; p50Ms: number; p95Ms: number; failures: number }> }>('/health'),
};

export type Scoreboard = {
  runs: number;
  insights: number;
  routed: number;
  dropped: number;
  injections: number;
  costUsd: number;
  reviewed: number;
  liveRuns: number;
  replayRuns: number;
  runIds: string[];
  ok: boolean;
};

/** Real numbers from the viewer's own workspace. */
export async function loadScoreboard(): Promise<Scoreboard> {
  try {
    const [session, runs, insights] = await Promise.all([tourApi.session(), tourApi.runs(200), tourApi.insights('').catch(() => [] as Insight[])]);
    const ws = session.workspaceId;
    const mine = runs.filter((r) => r.workspaceId === ws);
    const myIns = insights.filter((i) => i.workspaceId === ws);
    return {
      runs: mine.length,
      insights: mine.reduce((a, r) => a + r.insightCount, 0),
      routed: myIns.filter((i) => i.status === 'routed').length,
      dropped: mine.reduce((a, r) => a + r.droppedCount, 0),
      injections: mine.filter((r) => r.injectionFlagged).length,
      costUsd: mine.reduce((a, r) => a + (r.costUsd || 0), 0),
      reviewed: myIns.filter((i) => i.status !== 'pending_review').length,
      liveRuns: mine.filter((r) => r.mode === 'live').length,
      replayRuns: mine.filter((r) => r.mode === 'replay').length,
      runIds: mine.map((r) => r.id),
      ok: true,
    };
  } catch {
    return { runs: 0, insights: 0, routed: 0, dropped: 0, injections: 0, costUsd: 0, reviewed: 0, liveRuns: 0, replayRuns: 0, runIds: [], ok: false };
  }
}
