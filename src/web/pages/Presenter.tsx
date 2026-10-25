/**
 * /presenter — second-screen view. Synced with the main window over
 * BroadcastChannel('signal-loop-presenter'): current/next step, speaker notes, timers vs
 * the plan's per-part targets, a jump list, and remote next/back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Arrow, Backdrop, Button, Chip, KeyHint, Mark } from '../../narrative/components';
import { BACKUPS, CHAPTERS, GROUPS, TOTAL_TARGET_SEC, chapterById, targetOffsetSec } from '../../tour/script/chapters';
import { STEP_BY_ID, firstStepOf } from '../../tour/script/steps';
import { NOTES, STEP_NOTES } from '../../tour/script/notes';
import { PRESENTER_CHANNEL, resolveCopy } from '../../tour/engine/TourProvider';
import { EMPTY_COUNTERS } from '../../tour/engine/storage';
import { PATH_LABELS, type PresenterMsg, type TourCtx } from '../../tour/engine/types';
import { fmtClock, useNow } from '../../tour/hud/Hud';

type StateMsg = Extract<PresenterMsg, { type: 'state' }>;

function fakeCtx(s: StateMsg | null): TourCtx {
  return {
    path: s?.path ?? 'main', fileId: null, runId: null, themeId: null, explored: s?.explored ?? [], counters: { ...EMPTY_COUNTERS },
    run: null, evals: null, budget: null, ops: null, pathname: '/', lastEvent: null,
  };
}

const sign = (ms: number) => `${ms >= 0 ? '+' : '−'}${fmtClock(Math.abs(ms))}`;

export function Presenter() {
  const [state, setState] = useState<StateMsg | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const now = useNow(500);

  useEffect(() => {
    document.title = 'Presenter · Signal Loop';
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(PRESENTER_CHANNEL);
    chan.current = ch;
    ch.onmessage = (ev: MessageEvent<PresenterMsg>) => {
      if (ev.data?.type === 'state') {
        setState(ev.data);
        setLastSeen(Date.now());
      }
    };
    const hello = () => ch.postMessage({ type: 'hello' } satisfies PresenterMsg);
    hello();
    const t = window.setInterval(hello, 3000);
    const bye = () => ch.postMessage({ type: 'bye' } satisfies PresenterMsg);
    window.addEventListener('pagehide', bye);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', bye);
      ch.close();
    };
  }, []);

  const send = useCallback((m: PresenterMsg) => chan.current?.postMessage(m), []);
  const next = useCallback(() => send({ type: 'cmd', cmd: 'next' }), [send]);
  const back = useCallback(() => send({ type: 'cmd', cmd: 'back' }), [send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back]);

  const connected = now - lastSeen < 7000 && !!state;
  const step = state ? STEP_BY_ID[state.stepId] : undefined;
  const ctx = fakeCtx(state);
  const nextId = step ? (typeof step.next === 'function' ? step.next(ctx) : step.next) : undefined;
  const nextStep = nextId && nextId !== step?.id ? STEP_BY_ID[nextId] : undefined;
  const ch = step ? chapterById(step.chapter) : CHAPTERS[0]!;
  const notes = NOTES[ch.id];
  const stepNote = step ? STEP_NOTES[step.id] ?? step.notes : undefined;

  const elapsed = state?.startedAt ? now - state.startedAt : 0;
  const inPart = state?.chapterEnteredAt ? now - state.chapterEnteredAt : 0;
  const targetMs = ch.targetSec * 1000;
  const partTone = inPart > targetMs * 1.25 ? 'red' : inPart > targetMs ? 'amber' : 'green';
  const expected = (targetOffsetSec(ch.id) * 1000) + Math.min(inPart, targetMs);
  const drift = elapsed - expected;
  const driftTone = drift > 90_000 ? 'red' : drift > 30_000 ? 'amber' : 'green';
  const totalTone = elapsed > TOTAL_TARGET_SEC * 1000 ? 'red' : elapsed > TOTAL_TARGET_SEC * 900 ? 'amber' : 'green';

  return (
    <main className="sl-n n-page pv" data-testid="presenter">
      <Backdrop grain={false} />
      <header className="pv__top">
        <Mark sub="presenter view" />
        <span className="pv__status" data-on={connected} data-testid="presenter-status">
          <i /> {connected ? 'Connected to the main window' : 'Waiting for the main window…'}
        </span>
        <span className="n-row">
          {state && <Chip tone="accent">{PATH_LABELS[state.path]} · explored {state.explored.length}/6</Chip>}
          {!connected && (
            <Link className="n-btn n-btn--ghost n-btn--sm" to="/walkthrough/cold-open" target="_blank" rel="noopener">
              Open the main window <Arrow />
            </Link>
          )}
        </span>
      </header>

      <section className="pv__main">
        <div className="pv__clocks">
          <div className="n-card pv__clock" data-tone={totalTone}>
            <span className="n-label">Total · target {fmtClock(TOTAL_TARGET_SEC * 1000)}</span>
            <b data-testid="pv-total">{fmtClock(elapsed)}</b>
          </div>
          <div className="n-card pv__clock" data-tone={partTone}>
            <span className="n-label">This part · target {fmtClock(targetMs)}</span>
            <b>{fmtClock(inPart)}</b>
          </div>
          <div className="n-card pv__clock" data-tone={driftTone}>
            <span className="n-label">Against schedule</span>
            <b>{state?.startedAt ? sign(drift) : '—'}</b>
          </div>
        </div>
        <div className="pv__now">
          <div className="n-card n-card--accent pv__card">
            <span className="n-label" style={{ color: 'var(--n-accent)' }}>
              Now · {ch.productIndex ? `Chapter ${ch.productIndex}` : `Part ${String(ch.part).padStart(2, '0')}`} · {ch.title}
              {step?.kind === 'scene' && step.beats && step.beats > 1 ? ` · beat ${(state?.beat ?? 0) + 1}/${step.beats}` : ''}
            </span>
            <h2 data-testid="pv-current">{step ? resolveCopy(step.title, ctx) : 'Not started'}</h2>
            {step && <p className="n-body">{resolveCopy(step.body, ctx)}</p>}
            <div className="pv__controls">
              <Button variant="ghost" onClick={back} aria-label="Back">
                <Arrow dir="left" /> Back
              </Button>
              <Button onClick={next} data-testid="pv-next">
                Next <Arrow />
              </Button>
              <KeyHint keys={['←', '→']} label="also work here" />
            </div>
          </div>
          <div className="n-card pv__card">
            <span className="n-label">Up next</span>
            <h3 data-testid="pv-next-title">{nextStep ? resolveCopy(nextStep.title, ctx) : step?.kind === 'scene' && (state?.beat ?? 0) < (step.beats ?? 1) - 1 ? 'Next beat of this scene' : '—'}</h3>
            {nextStep && <span className="pv__mono">{chapterById(nextStep.chapter).title}</span>}
            {step?.waitFor && step.waitFor !== 'next' && <Chip tone="amber">Waits for the viewer: {typeof step.waitFor === 'object' ? step.waitFor.hint ?? 'action' : ''}</Chip>}
          </div>
        </div>
        <div className="n-card pv__notes" data-testid="pv-notes">
          <span className="n-label">Speaker notes · {notes?.time ?? fmtClock(targetMs)}</span>
          {notes && (
            <ul>
              {notes.say.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {notes?.click && notes.click.length > 0 && (
            <>
              <span className="n-label" style={{ display: 'block', marginTop: 16 }}>Click</span>
              <ul className="pv__click">
                {notes.click.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {stepNote && (
            <>
              <span className="n-label" style={{ display: 'block', marginTop: 16 }}>This step</span>
              <p className="n-body" style={{ marginTop: 6, color: 'var(--n-mint)' }}>{stepNote}</p>
            </>
          )}
        </div>
      </section>

      <aside className="pv__side">
        <span className="n-label">Jump to</span>
        <nav className="n-card pv__jump" aria-label="Jump list">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <span className="n-label">{g.label}</span>
              <ol>
                {g.ids.map((id) => {
                  const c = chapterById(id);
                  return (
                    <li key={id}>
                      <button data-current={c.id === ch.id} onClick={() => send({ type: 'goto', stepId: firstStepOf(id) })}>
                        <span className="pv__mono">{c.productIndex ? `Ch ${c.productIndex}` : String(c.part).padStart(2, '0')}</span>
                        <span>{c.title}</span>
                        <span className="pv__mono">{fmtClock(c.targetSec * 1000)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          <span className="n-label">Q&amp;A backups</span>
          <ol>
            {BACKUPS.map((b) => (
              <li key={b.topic}>
                <button onClick={() => send({ type: 'backup', topic: b.topic })}>
                  <span className="pv__mono">Q&amp;A</span>
                  <span>{b.title}</span>
                  <span />
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </aside>
    </main>
  );
}

export default Presenter;
