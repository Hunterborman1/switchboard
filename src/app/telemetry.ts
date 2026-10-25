/**
 * Usage telemetry → Agent Ops. Batches TelemetryBatch events (src/shared/platform-contracts.ts)
 * to POST /repo/invoca/api/telemetry every ~5s, and flushes with sendBeacon on
 * visibilitychange(hidden) / pagehide. The Worker stamps actor + workspace and forwards
 * through the platform SDK.
 *
 * Rules: never blocks the UI, swallows every error, keeps a per-tab sessionId in
 * sessionStorage, and is fully disabled with `?notrack=1` (remembered for the tab) so
 * tests and screenshots do not pollute the adoption numbers.
 */
import type { TelemetryBatch, UsageKind } from '../shared/platform-contracts';
import { postTelemetry } from './api/client';

type PendingEvent = TelemetryBatch['events'][number];

const SESSION_KEY = 'sl_tel_session';
const NOTRACK_KEY = 'sl_notrack';
const FLUSH_MS = 5000;
const MAX_BATCH = 50;

let queue: PendingEvent[] = [];
let timer: number | null = null;
let started = false;
let disabled = false;
let sessionId = '';

let currentPath: string | null = null;
let pathSince = 0;

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function init(): void {
  if (started) return;
  started = true;
  const ss = safeSession();
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notrack') === '1') ss?.setItem(NOTRACK_KEY, '1');
    if (params.get('notrack') === '0') ss?.removeItem(NOTRACK_KEY);
  } catch {
    /* ignore */
  }
  disabled = ss?.getItem(NOTRACK_KEY) === '1';
  const existing = ss?.getItem(SESSION_KEY);
  sessionId = existing ?? newId().slice(0, 64);
  const isNew = !existing;
  if (!existing) ss?.setItem(SESSION_KEY, sessionId);
  if (disabled) return;

  if (isNew) enqueue('session_start', { referrer: document.referrer ? new URL(document.referrer).pathname : null });
  timer = window.setInterval(() => flush(false), FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      endPageView();
      flush(true);
    } else if (currentPath) {
      pathSince = performance.now();
    }
  });
  window.addEventListener('pagehide', () => {
    endPageView();
    flush(true);
  });
}

function enqueue(kind: UsageKind, props: Record<string, unknown> = {}, durationMs: number | null = null, path: string | null = null): void {
  queue.push({
    kind,
    path: (path ?? window.location.pathname).slice(0, 200),
    props,
    at: new Date().toISOString(),
    durationMs: durationMs == null ? null : Math.max(0, Math.round(durationMs)),
  });
  if (queue.length >= MAX_BATCH) flush(false);
}

function flush(useBeacon: boolean): void {
  if (disabled || queue.length === 0) return;
  const events = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  void postTelemetry({ sessionId, events }, useBeacon).catch(() => {});
}

function endPageView(): void {
  if (!currentPath) return;
  const dwell = performance.now() - pathSince;
  enqueue('page_view', {}, dwell, currentPath);
  currentPath = null;
}

/** Call on every route change inside the product. Emits the PREVIOUS page's dwell. */
export function trackPage(path: string): void {
  try {
    init();
    if (disabled || path === currentPath) return;
    endPageView();
    currentPath = path;
    pathSince = performance.now();
  } catch {
    /* never affect the product */
  }
}

/** Record a product action. Never throws. */
export function track(kind: UsageKind, props: Record<string, unknown> = {}, durationMs: number | null = null): void {
  try {
    init();
    if (disabled) return;
    enqueue(kind, props, durationMs);
  } catch {
    /* never affect the product */
  }
}

export function telemetryDisabled(): boolean {
  init();
  return disabled;
}

/** For tests: drop anything queued. */
export function _resetTelemetry(): void {
  queue = [];
  if (timer) window.clearInterval(timer);
  timer = null;
  started = false;
}
