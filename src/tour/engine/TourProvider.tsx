/**
 * The walkthrough engine: a step machine over STEPS, driven by product events
 * (src/shared/events.ts), predicates over live API state, and the presenter.
 *
 * State lives in the URL (?tour=<stepId>&path=<branch>[&beat=n]) plus sessionStorage, so a
 * refresh or a deep link lands exactly where you were.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listen, type SignalEvent } from '../../shared/events';
import type { Budget, RunDetail } from '../../shared/contracts';
import { PLATFORM_API_BASE, SIGNAL_LOOP_AGENT_ID, type OverviewReport, type AgentRecord, type AgentImpact, type UsageReport, type LogEntry } from '../../shared/platform-contracts';
import { STEPS, STEP_BY_ID, FIRST_STEP, MAIN_ORDER } from '../script/steps';
import { tourApi } from '../api';
import { TourPaceContext, type TourPace } from '../pace';
import { freshPersisted, isPath, readStored, writeStored } from './storage';
import type { CheckpointData, EvalsData, OpsData, Persisted, PresenterMsg, Step, TourApi, TourCtx, TourPath, TourStatus } from './types';

export const PRESENTER_CHANNEL = 'signal-loop-presenter';

type CheckpointShow = { data: CheckpointData; key: number };

export type TourValue = {
  status: TourStatus;
  step: Step;
  beat: number;
  ctx: TourCtx;
  /** 0..1 along the main path. */
  progress: number;
  presenting: boolean;
  finished: boolean;
  startedAt: number | null;
  chapterEnteredAt: number | null;
  checkpoint: CheckpointShow | null;
  menuOpen: boolean;
  railOpen: boolean;
  canGoBack: boolean;
  isReady: boolean;
  setMenuOpen: (v: boolean) => void;
  setRailOpen: (v: boolean) => void;
  dismissCheckpoint: () => void;
  start: (stepId?: string) => void;
  exit: () => void;
  resume: () => void;
  restart: () => void;
  finish: () => void;
  /** Advance if allowed (scene beat, or a 'next' step that is ready). */
  next: () => boolean;
  /** Advance unconditionally (fallback "Continue", skip). */
  skip: () => void;
  back: () => void;
  goto: TourApi['goto'];
  setCtx: TourApi['setCtx'];
};

const TourContext = createContext<TourValue | null>(null);

export function useTour(): TourValue {
  const v = useContext(TourContext);
  if (!v) throw new Error('useTour outside TourProvider');
  return v;
}

export const resolveCopy = <T,>(c: T | ((ctx: TourCtx) => T), ctx: TourCtx): T => (typeof c === 'function' ? (c as (x: TourCtx) => T)(ctx) : c);

function initial(): Persisted {
  const stored = readStored();
  const params = new URLSearchParams(window.location.search);
  const urlStep = params.get('tour');
  const urlPath = params.get('path');
  const base = stored ?? freshPersisted(FIRST_STEP);
  if (urlStep && STEP_BY_ID[urlStep]) {
    const beat = Number(params.get('beat') ?? '0') || 0;
    return {
      ...base,
      status: 'active',
      stepId: urlStep,
      beat,
      startedAt: base.startedAt ?? Date.now(),
      chapterEnteredAt: base.stepId && STEP_BY_ID[base.stepId]?.chapter === STEP_BY_ID[urlStep]?.chapter ? base.chapterEnteredAt : Date.now(),
      ctx: { ...base.ctx, path: isPath(urlPath) ? urlPath : base.ctx.path, runId: params.get('run') ?? base.ctx.runId },
    };
  }
  if (!STEP_BY_ID[base.stepId]) return freshPersisted(FIRST_STEP);
  return base;
}

const stripBase = (p: string) => p.replace(/^\/repo\/invoca/, '') || '/';

function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  const t = n.tagName.toLowerCase();
  return t === 'input' || t === 'textarea' || t === 'select' || n.isContentEditable;
}

async function platformGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PLATFORM_API_BASE}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { data?: T } | T;
  return body && typeof body === 'object' && 'data' in (body as object) ? ((body as { data: T }).data) : (body as T);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<Persisted>(initial);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [evals, setEvals] = useState<EvalsData | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [ops, setOps] = useState<OpsData | null>(null);
  const [lastEvent, setLastEvent] = useState<SignalEvent | null>(null);
  const [checkpoint, setCheckpoint] = useState<CheckpointShow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [stepEnteredAt, setStepEnteredAt] = useState(() => Date.now());
  const [graceTick, setGraceTick] = useState(0);
  const [presenting, setPresenting] = useState(() => {
    try {
      return sessionStorage.getItem('sl-presenting') === '1' || new URLSearchParams(window.location.search).get('presenter') === '1';
    } catch {
      return false;
    }
  });

  const pathname = stripBase(location.pathname);
  const step = STEP_BY_ID[state.stepId] ?? STEPS[0]!;
  const ctx: TourCtx = useMemo(
    () => ({ ...state.ctx, run, evals, budget, ops, pathname, lastEvent }),
    [state.ctx, run, evals, budget, ops, pathname, lastEvent],
  );

  const ref = useRef({ state, step, ctx });
  ref.current = { state, step, ctx };

  // ------------------------------------------------------------------ persistence
  useEffect(() => writeStored(state), [state]);

  // ------------------------------------------------------------------ core transitions
  const goto = useCallback<TourApi['goto']>((stepId, opts) => {
    const target = STEP_BY_ID[stepId];
    if (!target) return;
    const { state: s, step: cur, ctx: c } = ref.current;
    if (cur.chapter !== target.chapter && cur.checkpoint && s.status === 'active') {
      const data = cur.checkpoint(c);
      if (data) setCheckpoint({ data, key: Date.now() });
    }
    setMenuOpen(false);
    setState((prev) => ({
      ...prev,
      status: 'active',
      stepId,
      beat: opts?.beat ?? 0,
      history: opts?.replace ? prev.history : [...prev.history, prev.stepId].slice(-80),
      startedAt: prev.startedAt ?? Date.now(),
      chapterEnteredAt: STEP_BY_ID[prev.stepId]?.chapter === target.chapter && prev.status === 'active' ? prev.chapterEnteredAt : Date.now(),
    }));
  }, []);

  const setCtx = useCallback<TourApi['setCtx']>((patch) => {
    setState((prev) => {
      const { run: _r, evals: _e, budget: _b, ops: _o, pathname: _p, lastEvent: _l, ...rest } = patch as Partial<TourCtx>;
      return { ...prev, ctx: { ...prev.ctx, ...rest } };
    });
  }, []);

  const resolveNext = useCallback((s: Step, c: TourCtx) => (typeof s.next === 'function' ? s.next(c) : s.next), []);

  const skip = useCallback(() => {
    const { step: s, ctx: c, state: st } = ref.current;
    if (s.kind === 'scene' && st.beat < (s.beats ?? 1) - 1) {
      setState((prev) => ({ ...prev, beat: prev.beat + 1 }));
      return;
    }
    const n = resolveNext(s, c);
    if (n === s.id) return;
    goto(n);
  }, [goto, resolveNext]);

  /** A step whose live data never arrives must not dead-end: after a grace period it can continue. */
  const READY_GRACE_MS = 9000;
  const enteredRef = useRef(stepEnteredAt);
  enteredRef.current = stepEnteredAt;
  const isReadyFn = (s: Step, c: TourCtx) => !s.ready || s.ready(c) || Date.now() - enteredRef.current > READY_GRACE_MS;

  const next = useCallback((): boolean => {
    const { step: s, ctx: c, state: st } = ref.current;
    if (st.status !== 'active') return false;
    if (s.kind === 'scene') {
      skip();
      return true;
    }
    if (s.waitFor && s.waitFor !== 'next') return false;
    if (s.actions?.length) return false; // a choice: pick one
    if (!isReadyFn(s, c)) return false;
    skip();
    return true;
  }, [skip]);

  const back = useCallback(() => {
    const { step: s, state: st } = ref.current;
    if (s.kind === 'scene' && st.beat > 0) {
      setState((prev) => ({ ...prev, beat: prev.beat - 1 }));
      return;
    }
    setState((prev) => {
      const history = [...prev.history];
      let prevId = history.pop();
      // skip transient steps that auto-advance
      while (prevId === 'ch1.open') prevId = history.pop();
      if (!prevId || !STEP_BY_ID[prevId]) return prev;
      const ps = STEP_BY_ID[prevId]!;
      return { ...prev, stepId: prevId, history, beat: ps.kind === 'scene' ? Math.max(0, (ps.beats ?? 1) - 1) : 0, chapterEnteredAt: ps.chapter === STEP_BY_ID[prev.stepId]?.chapter ? prev.chapterEnteredAt : Date.now() };
    });
  }, []);

  const start = useCallback((stepId?: string) => {
    const id = stepId && STEP_BY_ID[stepId] ? stepId : FIRST_STEP;
    setRun(null);
    setState((prev) => ({ ...freshPersisted(id), status: 'active', stepId: id, startedAt: Date.now(), chapterEnteredAt: Date.now(), ctx: { ...freshPersisted(id).ctx, explored: prev.ctx.explored } }));
  }, []);
  const exit = useCallback(() => {
    setMenuOpen(false);
    setRailOpen(false);
    setState((prev) => ({ ...prev, status: 'explore' }));
  }, []);
  const resume = useCallback(() => setState((prev) => ({ ...prev, status: 'active', chapterEnteredAt: Date.now() })), []);
  const restart = useCallback(() => {
    setRun(null);
    setEvals(null);
    setOps(null);
    setState({ ...freshPersisted(FIRST_STEP), status: 'active', startedAt: Date.now(), chapterEnteredAt: Date.now() });
  }, []);
  const finish = useCallback(() => setState((prev) => ({ ...prev, status: 'explore', finished: true })), []);

  // ------------------------------------------------------------------ product events
  useEffect(
    () =>
      listen((e) => {
        setLastEvent(e);
        setState((prev) => {
          const c = { ...prev.ctx, counters: { ...prev.ctx.counters } };
          switch (e.name) {
            case 'file.selected': {
              const p: TourPath = isPath(e.tourPath) ? e.tourPath : 'main';
              c.fileId = e.fileId;
              c.path = p;
              if (!c.explored.includes(p)) c.explored = [...c.explored, p];
              break;
            }
            case 'run.started':
              c.runId = e.runId;
              if (e.fileId) c.fileId = e.fileId;
              break;
            case 'review.action':
              if (e.action === 'approve') c.counters.approvals += 1;
              else if (e.action === 'edit') c.counters.edits += 1;
              else c.counters.rejects += 1;
              break;
            case 'rule.changed':
              c.counters.rulesChanged += 1;
              break;
            case 'ticket.state':
              if (e.state === 'shipped') c.counters.shipped += 1;
              break;
            case 'eval.promote_attempted':
              c.counters.promoteAttempts += 1;
              c.counters.promoted = e.promoted;
              break;
            case 'redaction.toggled':
              c.counters.redactionToggled = true;
              break;
            case 'delivery.opened':
              c.counters.deliveriesOpened += 1;
              break;
            case 'theme.opened':
              c.themeId = e.themeId;
              break;
            default:
              break;
          }
          return { ...prev, ctx: c };
        });
        if (e.name === 'run.started') setRun(null);
        // advance if the current step was waiting on this event
        queueMicrotask(() => {
          const { step: s, state: st, ctx: cNow } = ref.current;
          if (st.status !== 'active' || !s.waitFor || s.waitFor === 'next' || !('event' in s.waitFor)) return;
          if (s.waitFor.event !== e.name) return;
          if (s.waitFor.where && !s.waitFor.where(e, cNow)) return;
          skip();
        });
      }),
    [skip],
  );

  // ------------------------------------------------------------------ predicate waits
  useEffect(() => {
    if (state.status !== 'active') return;
    const w = step.waitFor;
    if (w && w !== 'next' && 'predicate' in w && w.predicate(ctx)) skip();
  }, [ctx, step, state.status, skip]);

  // ------------------------------------------------------------------ run detail polling
  const runId = state.ctx.runId;
  const pollChapters = step.chapter === 'ch1' || step.chapter === 'ch2' || step.chapter === 'ch3';
  useEffect(() => {
    if (!runId || state.status !== 'active' || !pollChapters) return;
    let stop = false;
    let timer = 0;
    const ac = new AbortController();
    const tick = async () => {
      try {
        const d = await tourApi.run(runId, ac.signal);
        if (stop) return;
        setRun(d);
        if (['completed', 'failed', 'awaiting_review'].includes(d.run.status)) return;
      } catch {
        /* keep polling quietly; the step falls back if data never arrives */
      }
      if (!stop) timer = window.setTimeout(tick, 1200);
    };
    tick();
    const off = listen((e) => {
      if ((e.name === 'run.step' || e.name === 'run.finished') && e.runId === runId) {
        window.clearTimeout(timer);
        tick();
      }
    });
    return () => {
      stop = true;
      ac.abort();
      window.clearTimeout(timer);
      off();
    };
  }, [runId, state.status, pollChapters]);

  // ------------------------------------------------------------------ lazy data per chapter
  useEffect(() => {
    if (state.status !== 'active') return;
    if (step.chapter === 'ch7' && !evals) tourApi.evals().then(setEvals).catch(() => undefined);
    if (step.chapter === 'ch7' && !budget)
      tourApi
        .health()
        .then((h) => setBudget(h.budget))
        .catch(() => tourApi.session().then((s) => setBudget(s.budget)).catch(() => undefined));
  }, [step.chapter, state.status, evals, budget]);

  useEffect(() => {
    if (state.status !== 'active' || step.chapter !== 'ch8' || ops) return;
    const out: OpsData = { overview: null, agent: null, live: null, traceId: null, logCount: null };
    setOps(out);
    const rid = state.ctx.runId;
    Promise.allSettled([
      platformGet<OverviewReport>('/overview').then((v) => (out.overview = v)),
      platformGet<{ agent: AgentRecord; impact: AgentImpact }>(`/agents/${SIGNAL_LOOP_AGENT_ID}`).then((v) => (out.agent = { ...v.agent, impact: v.impact })),
      platformGet<UsageReport>(`/usage?agentId=${SIGNAL_LOOP_AGENT_ID}&source=live`).then((v) => (out.live = v.live)),
      rid
        ? platformGet<{ rows: LogEntry[] }>(`/logs?runId=${encodeURIComponent(rid)}`).then((v) => {
            out.logCount = v.rows.length;
            out.traceId = v.rows[0]?.traceId ?? null;
          })
        : platformGet<{ rows: LogEntry[] }>(`/logs?agentId=${SIGNAL_LOOP_AGENT_ID}`).then((v) => {
            out.traceId = v.rows.find((r) => r.runId)?.traceId ?? v.rows[0]?.traceId ?? null;
          }),
    ]).then(() => setOps({ ...out }));
  }, [step.chapter, state.status, ops, state.ctx.runId]);

  // ------------------------------------------------------------------ onEnter
  const entered = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== 'active') {
      entered.current = null;
      return;
    }
    if (entered.current === step.id) return;
    entered.current = step.id;
    setStepEnteredAt(Date.now());
    step.onEnter?.(ref.current.ctx, { next: skip, back, goto, setCtx });
  }, [step, state.status, skip, back, goto, setCtx]);

  // ------------------------------------------------------------------ route + URL sync
  const routeTarget = state.status === 'active' && step.route ? (typeof step.route === 'function' ? step.route(ctx) : step.route) : null;
  const enforced = useRef<string>('');
  useEffect(() => {
    if (state.status !== 'active') {
      enforced.current = '';
      // live location: an exit is usually followed by a navigation in the same tick
      const sp = new URLSearchParams(window.location.search);
      if (sp.has('tour')) {
        sp.delete('tour');
        sp.delete('path');
        sp.delete('beat');
        navigate({ pathname: stripBase(window.location.pathname), search: sp.toString() ? `?${sp}` : '' }, { replace: true });
      }
      return;
    }
    const tourParams = (sp: URLSearchParams) => {
      sp.set('tour', step.id);
      sp.set('path', state.ctx.path);
      if (state.beat > 0) sp.set('beat', String(state.beat));
      else sp.delete('beat');
      return sp;
    };
    // 1) On entering a step (or when its route resolves), drive the app there once.
    const key = `${step.id}|${routeTarget ?? ''}`;
    if (key !== enforced.current) {
      enforced.current = key;
      if (routeTarget) {
        const [rPath, rQuery] = routeTarget.split('?');
        if (rPath !== stripBase(window.location.pathname)) {
          navigate({ pathname: rPath!, search: `?${tourParams(new URLSearchParams(rQuery ?? '')).toString()}` });
          return;
        }
      }
    }
    // 2) Otherwise keep the tour params in the current URL without moving. Read the live
    //    window location: the product may have navigated in the same tick as the event.
    const livePath = stripBase(window.location.pathname);
    const liveSearch = window.location.search;
    const search = `?${tourParams(new URLSearchParams(liveSearch)).toString()}`;
    if (search !== liveSearch) navigate({ pathname: livePath, search }, { replace: true });
  }, [routeTarget, step.id, state.status, state.beat, state.ctx.path, pathname, location.search, navigate]);

  // ------------------------------------------------------------------ presenter channel
  const chanRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(PRESENTER_CHANNEL);
    chanRef.current = ch;
    ch.onmessage = (ev: MessageEvent<PresenterMsg>) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'hello') {
        setPresenting(true);
        try {
          sessionStorage.setItem('sl-presenting', '1');
        } catch {
          /* ignore */
        }
        post();
      } else if (m.type === 'cmd') {
        if (ref.current.state.status !== 'active') {
          setState((p) => ({ ...p, status: 'active' }));
          return;
        }
        if (m.cmd === 'next') {
          if (!next()) skip();
        } else back();
      } else if (m.type === 'goto') goto(m.stepId);
      else if (m.type === 'backup') navigate(`/backup/${m.topic}`);
      else if (m.type === 'bye') setPresenting(false);
    };
    const post = () => {
      const { state: s } = ref.current;
      const msg: PresenterMsg = { type: 'state', stepId: s.stepId, beat: s.beat, status: s.status, path: s.ctx.path, explored: s.ctx.explored, startedAt: s.startedAt, chapterEnteredAt: s.chapterEnteredAt, sentAt: Date.now() };
      ch.postMessage(msg);
    };
    (ch as BroadcastChannel & { __post?: () => void }).__post = post;
    post();
    return () => {
      ch.close();
      chanRef.current = null;
    };
  }, [next, skip, back, goto, navigate]);
  useEffect(() => {
    const ch = chanRef.current as (BroadcastChannel & { __post?: () => void }) | null;
    ch?.__post?.();
  }, [state.stepId, state.beat, state.status, state.ctx.path, state.ctx.explored]);

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const { state: s, step: cur } = ref.current;
      if (s.status !== 'active') return;
      if (isTyping(e.target)) return;
      const inNarrative = !!(e.target as HTMLElement | null)?.closest?.('.sl-n, .sl-n-portal');
      const productDialogOpen = !!document.querySelector('[role="dialog"]:not([data-tour-ui])') && !inNarrative;
      if (e.key === 'Escape') {
        if (productDialogOpen) return;
        e.preventDefault();
        setMenuOpen((v) => !v);
        return;
      }
      if (menuOpen) return;
      const isScene = cur.kind === 'scene';
      // Enter / Space on a focused control belong to that control (persona cards, buttons, links).
      const onControl = !!(e.target as HTMLElement | null)?.closest?.('button, a[href], [role="button"], summary');
      if ((e.key === 'Enter' || e.key === ' ') && onControl) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (isScene && (e.key === ' ' || e.key === 'Enter')) || (!isScene && e.key === 'Enter' && inNarrative && (e.target as HTMLElement).tagName !== 'BUTTON')) {
        if (cur.kind === 'scene' && cur.id === 'scorecard') return;
        if (next()) e.preventDefault();
        else if (!isScene) document.dispatchEvent(new CustomEvent('sl-tour-nudge'));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, menuOpen]);

  useEffect(() => {
    if (!step.ready || state.status !== 'active') return;
    const t = window.setTimeout(() => setGraceTick((n) => n + 1), READY_GRACE_MS + 50);
    return () => window.clearTimeout(t);
  }, [step.id, step.ready, state.status, stepEnteredAt]);
  void graceTick;

  // ------------------------------------------------------------------ derived
  const idx = MAIN_ORDER.indexOf(step.id);
  const progress = idx >= 0 ? (idx + (step.kind === 'scene' && (step.beats ?? 1) > 1 ? state.beat / (step.beats ?? 1) : 0)) / (MAIN_ORDER.length - 1) : 0;

  const pace: TourPace = useMemo(
    () => ({ active: state.status === 'active', slow: state.status === 'active' && step.pace === 'slow', stepRevealMs: state.status === 'active' && step.pace === 'slow' ? 900 : 0, stepId: state.status === 'active' ? step.id : null }),
    [state.status, step.pace, step.id],
  );

  const value: TourValue = {
    status: state.status,
    step,
    beat: state.beat,
    ctx,
    progress: Math.max(0, Math.min(1, progress)),
    presenting,
    finished: state.finished,
    startedAt: state.startedAt,
    chapterEnteredAt: state.chapterEnteredAt,
    checkpoint,
    menuOpen,
    railOpen,
    canGoBack: state.history.length > 0 || state.beat > 0,
    isReady: isReadyFn(step, ctx),
    setMenuOpen,
    setRailOpen,
    dismissCheckpoint: () => setCheckpoint(null),
    start,
    exit,
    resume,
    restart,
    finish,
    next,
    skip,
    back,
    goto,
    setCtx,
  };

  return (
    <TourContext.Provider value={value}>
      <TourPaceContext.Provider value={pace}>{children}</TourPaceContext.Provider>
    </TourContext.Provider>
  );
}
