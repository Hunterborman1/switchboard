/**
 * Tiny stale-while-revalidate cache + polling hooks (no extra libraries).
 * - one module-level cache keyed by string, shared by every component on the page
 * - a cached value renders instantly while a revalidation runs in the background
 * - `pollMs` re-fetches on an interval while the tab is visible
 * - `invalidate(prefix)` re-fetches every mounted key under a prefix after a write
 * - `setCached(key, fn)` supports optimistic updates with rollback
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { ApiError, api, type Fetched } from './client';
import { themeNamingPending } from '../../shared/format';

type Entry = {
  data?: unknown;
  dataAsOf?: string;
  error?: Error;
  fetchedAt?: number;
  inflight?: Promise<void>;
  fetcher?: () => Promise<Fetched<unknown>>;
};

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: Entry = {};

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function load(key: string, fetcher: () => Promise<Fetched<unknown>>): Promise<void> {
  const entry = cache.get(key) ?? {};
  if (entry.inflight) return entry.inflight;
  const inflight = fetcher()
    .then((res) => {
      const cur = cache.get(key) ?? {};
      cache.set(key, { ...cur, data: res.data, dataAsOf: res.dataAsOf, error: undefined, fetchedAt: Date.now(), inflight: undefined });
    })
    .catch((err: unknown) => {
      const cur = cache.get(key) ?? {};
      cache.set(key, { ...cur, error: err instanceof Error ? err : new Error(String(err)), fetchedAt: Date.now(), inflight: undefined });
    })
    .finally(() => notify(key));
  cache.set(key, { ...entry, inflight, fetcher });
  notify(key);
  return inflight;
}

export type QueryState<T> = {
  data: T | undefined;
  dataAsOf: string | null;
  error: Error | null;
  /** First load with nothing cached yet: show a skeleton. */
  loading: boolean;
  /** A background revalidation is running over cached data. */
  refreshing: boolean;
  refresh: () => Promise<void>;
};

export type QueryOptions = {
  /** Poll interval in ms while visible; false/0 = no polling. */
  pollMs?: number | false;
  /** Cached data younger than this is not re-fetched on mount. @default 2000 */
  staleMs?: number;
};

export function useQuery<T>(key: string | null, fetcher: () => Promise<Fetched<T>>, opts: QueryOptions = {}): QueryState<T> {
  const { pollMs = false, staleMs = 2000 } = opts;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = useSyncExternalStore(
    useCallback((fn: () => void) => (key ? subscribe(key, fn) : () => {}), [key]),
    () => (key ? cache.get(key) ?? EMPTY : EMPTY),
  );

  const run = useCallback(() => {
    if (!key) return Promise.resolve();
    return load(key, () => fetcherRef.current() as Promise<Fetched<unknown>>);
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const cur = cache.get(key);
    if (!cur?.fetchedAt || Date.now() - cur.fetchedAt > staleMs || cur.error) void run();
  }, [key, run, staleMs]);

  useEffect(() => {
    if (!key || !pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void run();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [key, pollMs, run]);

  return {
    data: entry.data as T | undefined,
    dataAsOf: entry.dataAsOf ?? null,
    error: entry.data === undefined ? entry.error ?? null : entry.error ?? null,
    loading: entry.data === undefined && !entry.error,
    refreshing: entry.data !== undefined && !!entry.inflight,
    refresh: run,
  };
}

/** Re-fetch every cached key that starts with `prefix` (after a write). */
export function invalidate(...prefixes: string[]): void {
  for (const [key, entry] of cache) {
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    if (listeners.get(key)?.size && entry.fetcher) void load(key, entry.fetcher);
    else cache.set(key, { ...entry, fetchedAt: 0 });
  }
}

/** Optimistically replace a cached value; returns a rollback. */
export function setCached<T>(key: string, update: (prev: T | undefined) => T | undefined): () => void {
  const prev = cache.get(key);
  cache.set(key, { ...(prev ?? {}), data: update(prev?.data as T | undefined) });
  notify(key);
  return () => {
    cache.set(key, prev ?? {});
    notify(key);
  };
}

export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// ---------------------------------------------------------------- endpoint hooks

export const keys = {
  session: 'session',
  world: 'world',
  library: 'library',
  libraryFile: (id: string) => `library/${id}`,
  runs: 'runs',
  run: (id: string) => `runs/${id}`,
  insights: (q: string) => `insights?${q}`,
  insight: (id: string) => `insight/${id}`,
  review: 'review',
  themes: 'themes',
  theme: (id: string) => `themes/${id}`,
  rules: 'routing/rules',
  deliveries: (channel: string | null) => `deliveries?${channel ?? ''}`,
  notifications: (csmId: string | null) => `notifications?${csmId ?? ''}`,
  evals: 'evals',
  health: 'health',
};

export const useSession = () => useQuery(keys.session, api.session, { pollMs: 30_000, staleMs: 10_000 });
export const useWorld = () => useQuery(keys.world, api.world, { staleMs: 300_000 });
export const useLibrary = () => useQuery(keys.library, api.library, { staleMs: 60_000 });
export const useLibraryFile = (id: string | null) =>
  useQuery(id ? keys.libraryFile(id) : null, () => api.libraryFile(id!), { staleMs: 300_000 });
export const useRuns = () => useQuery(keys.runs, () => api.runs(50), { pollMs: 5000 });
export const useReviewQueue = (pollMs: number | false = 8000) => useQuery(keys.review, api.review, { pollMs });
export const useThemes = () => useQuery(keys.themes, api.themes, { staleMs: 10_000 });
export const useTheme = (id: string | null) => useQuery(id ? keys.theme(id) : null, () => api.theme(id!));
export const useRules = () => useQuery(keys.rules, api.rules);
export const useDeliveries = (channel: string | null = null) =>
  useQuery(keys.deliveries(channel), () => api.deliveries(channel), { pollMs: 10_000 });
export const useNotifications = (csmId: string | null) =>
  useQuery(keys.notifications(csmId), () => api.notifications(csmId), { pollMs: 8000 });
export const useEvals = () => useQuery(keys.evals, api.evals, { staleMs: 60_000 });
export const useHealth = () => useQuery(keys.health, api.health, { pollMs: 15_000 });
export const useInsightDetail = (id: string | null) => useQuery(id ? keys.insight(id) : null, () => api.insight(id!));

/** GET /runs/:id, polled every ~600ms while the run is still moving. */
export function useRun(runId: string | null) {
  const state = useQuery(runId ? keys.run(runId) : null, () => api.run(runId!), { pollMs: false, staleMs: 400 });
  const status = state.data?.run.status;
  // Also keep polling briefly after the run is final while deferred theme naming adds its cost,
  // so the Run view and the walkthrough settle on the same total.
  const moving = !state.data || status === 'queued' || status === 'running' || themeNamingPending(state.data);
  useEffect(() => {
    if (!runId || !moving || state.error) return;
    const id = window.setInterval(() => void state.refresh(), 600);
    return () => window.clearInterval(id);
  }, [runId, moving, state.error, state.refresh]);
  return state;
}
