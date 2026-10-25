/**
 * Typed client for every Signal Loop endpoint (src/shared/contracts.ts → "API surface").
 * - base `/repo/invoca/api`, cookies included (the gate is a cookie)
 * - unwraps `Envelope<T>` and keeps the server's `dataAsOf`
 * - non-2xx → typed `ApiError` with the server's code/message
 * - 401 → redirect to the login page with `?next=` the current location
 *
 * Dev only: with VITE_FIXTURES=1 the same calls are answered by ./fixtures (a simulated
 * workspace whose runs progress over time) so the UI can be built before the Worker is up.
 */
import type {
  Budget,
  CreateRun,
  Delivery,
  Insight,
  LibraryFile,
  Notification,
  RoutingRule,
  Run,
  Session,
  Theme,
} from '../../shared/contracts';
import type { TelemetryBatch } from '../../shared/platform-contracts';
import type {
  CreateRunResult,
  EvalsData,
  HealthData,
  InsightDetail,
  InsightFilters,
  LibraryFileDetail,
  ReviewPostBody,
  ReviewResult,
  RoutingPreview,
  RunDetail,
  ThemeDetail,
  TicketResult,
  World,
} from './types';

export const API_BASE = '/repo/invoca/api';
export const LOGIN_PATH = '/repo/invoca/login';

export type Fetched<T> = { data: T; dataAsOf: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const FIXTURES_ENABLED: boolean = import.meta.env.DEV && import.meta.env.VITE_FIXTURES === '1';

type Method = 'GET' | 'POST' | 'PUT';

async function viaFixtures<T>(method: Method, path: string, body: unknown): Promise<Fetched<T>> {
  const { fixtureRequest } = await import('./fixtures');
  return fixtureRequest<T>(method, path, body);
}

function redirectToLogin(): void {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`${LOGIN_PATH}?next=${encodeURIComponent(next)}`);
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<Fetched<T>> {
  if (FIXTURES_ENABLED) return viaFixtures<T>(method, path, body);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? `Network error: ${err.message}` : 'Network error');
  }

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'unauthenticated', 'Your session has ended. Redirecting to sign in…');
  }

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'bad_json', `The server answered ${res.status} with a body that is not JSON.`);
    }
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? `Request failed with ${res.status}`);
  }

  const env = json as { data?: T; dataAsOf?: string } | null;
  if (!env || !('data' in env)) {
    throw new ApiError(res.status, 'bad_envelope', 'The server response is missing its data envelope.');
  }
  return { data: env.data as T, dataAsOf: env.dataAsOf ?? new Date().toISOString() };
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  session: () => request<Session>('GET', '/session'),
  world: () => request<World>('GET', '/world'),
  library: () => request<LibraryFile[]>('GET', '/library'),
  libraryFile: (id: string) => request<LibraryFileDetail>('GET', `/library/${encodeURIComponent(id)}`),
  createRun: (body: CreateRun) => request<CreateRunResult>('POST', '/runs', body),
  runs: (limit = 50, cursor?: string) => request<Run[]>('GET', `/runs${qs({ limit, cursor })}`),
  run: (id: string) => request<RunDetail>('GET', `/runs/${encodeURIComponent(id)}`),
  insights: (f: InsightFilters = {}) =>
    request<Insight[]>('GET', `/insights${qs({ type: f.type, area: f.area, status: f.status, account: f.account, q: f.q })}`),
  insight: (id: string) => request<InsightDetail>('GET', `/insights/${encodeURIComponent(id)}`),
  review: () => request<Insight[]>('GET', '/review'),
  reviewAction: (insightId: string, body: ReviewPostBody) =>
    request<ReviewResult>('POST', `/review/${encodeURIComponent(insightId)}`, body),
  themes: () => request<Theme[]>('GET', '/themes'),
  theme: (id: string) => request<ThemeDetail>('GET', `/themes/${encodeURIComponent(id)}`),
  rules: () => request<RoutingRule[]>('GET', '/routing/rules'),
  putRule: (rule: RoutingRule) => request<RoutingRule>('PUT', `/routing/rules/${encodeURIComponent(rule.id)}`, rule),
  routingPreview: (rules: RoutingRule[]) => request<RoutingPreview>('POST', '/routing/preview', rules),
  deliveries: (channel?: string | null) => request<Delivery[]>('GET', `/deliveries${qs({ channel })}`),
  ticket: (deliveryId: string, state: NonNullable<Delivery['ticketState']>) =>
    request<TicketResult>('POST', `/deliveries/${encodeURIComponent(deliveryId)}/ticket`, { state }),
  notifications: (csmId?: string | null) => request<Notification[]>('GET', `/notifications${qs({ csmId })}`),
  evals: () => request<EvalsData>('GET', '/evals'),
  health: () => request<HealthData>('GET', '/health'),
  resetWorkspace: () => request<Record<string, never>>('POST', '/workspace/reset', {}),
};

/** Fire-and-forget telemetry; never throws (see ../telemetry.ts). */
export async function postTelemetry(batch: TelemetryBatch, useBeacon: boolean): Promise<void> {
  if (FIXTURES_ENABLED) return;
  const url = `${API_BASE}/telemetry`;
  const payload = JSON.stringify(batch);
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      return;
    }
    await fetch(url, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'content-type': 'application/json' }, body: payload });
  } catch {
    /* telemetry must never affect the product */
  }
}

export type { Budget };
