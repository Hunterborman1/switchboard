/**
 * Agent Ops API client: typed GETs with a small stale-while-revalidate cache (so moving
 * between pages is instant), optional polling, and writes for the two viewer-owned settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PLATFORM_API_BASE } from '../../shared/platform-contracts';
import type { Envelope } from '../../worker/platform/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The product's telemetry session id (sessionStorage), so the API can mark "that's you". */
function sessionHint(): string {
  try {
    return window.sessionStorage.getItem('sl_tel_session') ?? '';
  } catch {
    return '';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  const hint = sessionHint();
  if (hint) headers.set('x-ao-sessions', hint);
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(`${PLATFORM_API_BASE}${path}`, { credentials: 'same-origin', ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`);
  }
  return body as Envelope<T>;
}

const cache = new Map<string, Envelope<unknown>>();
const listeners = new Map<string, Set<() => void>>();

export function invalidate(prefix: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const [k, set] of listeners) if (k.startsWith(prefix)) set.forEach((fn) => fn());
}

export type ApiState<T> = { data: T | null; dataAsOf: string | null; error: ApiError | null; loading: boolean; reload: () => void };

export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}): ApiState<T> {
  const cached = path ? (cache.get(path) as Envelope<T> | undefined) : undefined;
  const [state, setState] = useState<{ data: T | null; dataAsOf: string | null; error: ApiError | null; loading: boolean }>({
    data: cached?.data ?? null,
    dataAsOf: cached?.dataAsOf ?? null,
    error: null,
    loading: !cached,
  });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: s.data == null }));
    try {
      const env = await request<T>(path);
      cache.set(path, env as Envelope<unknown>);
      if (my === seq.current) setState({ data: env.data, dataAsOf: env.dataAsOf, error: null, loading: false });
    } catch (err) {
      if (my === seq.current) setState((s) => ({ ...s, error: err instanceof ApiError ? err : new ApiError(0, 'network', 'Could not reach Agent Ops'), loading: false }));
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const c = cache.get(path) as Envelope<T> | undefined;
    setState({ data: c?.data ?? null, dataAsOf: c?.dataAsOf ?? null, error: null, loading: !c });
    void load();
    if (!listeners.has(path)) listeners.set(path, new Set());
    const set = listeners.get(path)!;
    const fn = () => void load();
    set.add(fn);
    let timer: number | null = null;
    if (opts.pollMs) {
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void load();
      }, opts.pollMs);
    }
    return () => {
      set.delete(fn);
      if (timer) window.clearInterval(timer);
    };
  }, [path, load, opts.pollMs]);

  return { ...state, reload: () => void load() };
}

export async function putAssumptions(loadedHourlyUsd: number | null) {
  const r = await request<{ loadedHourlyUsd: number; isOverride: boolean }>('/assumptions', { method: 'PUT', body: JSON.stringify({ loadedHourlyUsd }) });
  invalidate('/');
  return r.data;
}

export async function acknowledgeAlert(id: string, note: string | null) {
  const r = await request<{ id: string; status: 'acknowledged' }>(`/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST', body: JSON.stringify({ note }) });
  invalidate('/');
  return r.data;
}
