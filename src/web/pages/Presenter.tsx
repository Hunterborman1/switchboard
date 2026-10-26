/**
 * /presenter — second-screen view. Synced with the main window over
 * BroadcastChannel('signal-loop-presenter'): current/next step, speaker notes, timers vs
 * each chapter's target, a jump list in the same order and numbering as the chapter rail and the
 * Guide's picker, and remote next/back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, ButtonLink, Kbd } from '../../ds';
import { IconArrowLeft, IconArrowRight, IconExternal } from '../../ds/icons';
import { SiteBar } from '../../narrative/components';
import { BACKUPS, CHAPTERS, GROUPS, JUMPS, TOTAL_TARGET_SEC, chapterById, chapterLabel, targetOffsetSec } from '../../tour/script/chapters';
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
    run: null, evals: null, budget: null, ops: null, peek: null, theme: null, pathname: '/', lastEvent: null,
  };
}

const sign = (ms: number) => (Math.abs(ms) < 5000 ? 'on time' : `${fmtClock(Math.abs(ms))} ${ms > 0 ? 'behind' : 'ahead'}`);

export function Presenter() {
  const [state, setState] = useState<StateMsg | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const now = useNow(500);

  useEffect(() => {
    document.title = 'Presenter view · Switchboard';
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

  const where = chapterLabel(ch.id);
  const waits = step?.waitFor && step.waitFor !== 'next' && typeof step.waitFor === 'object' ? (step.waitFor.hint ?? 'an action') : null;

  return (
    <main className="ds-app sl-n n-page pv" data-testid="presenter">
      <SiteBar full context="Presenter view">
        <span className="pv__status" data-on={connected} data-testid="presenter-status">
          <i aria-hidden="true" />
          {connected ? 'Connected to the main window' : 'Waiting for the main window'}
        </span>
        {state && (
          <span className="pv__badges">
            <Badge outline>{PATH_LABELS[state.path]}</Badge>
            <Badge>{state.explored.length} of 6 scenarios explored</Badge>
          </span>
        )}
        {!connected && (
          <ButtonLink variant="secondary" size="sm" to="/walkthrough/signal" target="_blank" rel="noopener" iconRight={<IconExternal size={14} />}>
            Open the main window
          </ButtonLink>
        )}
      </SiteBar>

      <div className="pv__grid">
        <section className="pv__main" aria-label="Now">
          <div className="pv__clocks">
            <div className="pv__clock" data-tone={totalTone}>
              <span className="pv__k">Total, target {fmtClock(TOTAL_TARGET_SEC * 1000)}</span>
              <b data-testid="pv-total">{fmtClock(elapsed)}</b>
            </div>
            <div className="pv__clock" data-tone={partTone}>
              <span className="pv__k">This chapter, target {fmtClock(targetMs)}</span>
              <b>{fmtClock(inPart)}</b>
            </div>
            <div className="pv__clock" data-tone={driftTone}>
              <span className="pv__k">Against the plan</span>
              <b>{state?.startedAt ? sign(drift) : 'Not started'}</b>
            </div>
          </div>
          <div className="pv__now">
            <div className="pv__card pv__card--now">
              <div className="pv__where">
                <Badge tone="accent">{where}</Badge>
                <span className="pv__chapter">{ch.title}</span>
              </div>
              <h2 className="pv__title" data-testid="pv-current">
                {step ? resolveCopy(step.title, ctx) : 'Not started'}
              </h2>
              {step && <p className="pv__body">{resolveCopy(step.body, ctx)}</p>}
              <div className="pv__controls">
                <Button variant="secondary" icon={<IconArrowLeft size={16} />} onClick={back} aria-label="Back">
                  Back
                </Button>
                <Button variant="primary" iconRight={<IconArrowRight size={16} />} onClick={next} data-testid="pv-next">
                  Next
                </Button>
                <span className="pv__keys">
                  <Kbd>
                    <IconArrowLeft size={12} />
                  </Kbd>
                  <Kbd>
                    <IconArrowRight size={12} />
                  </Kbd>
                  work here too
                </span>
              </div>
            </div>
            <div className="pv__card">
              <span className="pv__k">Up next</span>
              <h3 className="pv__next" data-testid="pv-next-title">
                {nextStep ? resolveCopy(nextStep.title, ctx) : 'Nothing queued'}
              </h3>
              {nextStep && <span className="pv__meta">{chapterById(nextStep.chapter).title}</span>}
              {waits && (
                <span className="pv__wait">
                  <Badge tone="warning" dot>
                    Waits for the viewer: {waits}
                  </Badge>
                </span>
              )}
            </div>
          </div>
          <div className="pv__card pv__notes" data-testid="pv-notes">
            <div className="pv__noteshead">
              <h3>Speaker notes</h3>
              <span className="pv__meta">{notes?.time ?? fmtClock(targetMs)}</span>
            </div>
            {notes && (
              <ul className="pv__say">
                {notes.say.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
            {notes?.click && notes.click.length > 0 && (
              <div className="pv__block">
                <span className="pv__k">What to click</span>
                <ul className="pv__click">
                  {notes.click.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {stepNote && (
              <div className="pv__block">
                <span className="pv__k">This step</span>
                <p className="pv__stepnote">{stepNote}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="pv__side" aria-label="Jump to">
          <nav className="pv__jump" aria-label="Jump list">
            <div className="pv__group" data-testid="pv-jumps">
              <ol>
                {JUMPS.map((j) => {
                  const c = chapterById(j.chapter);
                  return (
                    <li key={j.chapter}>
                      <button type="button" onClick={() => send({ type: 'goto', stepId: firstStepOf(j.chapter) })}>
                        <span className="pv__num">{c.part}</span>
                        <span className="pv__jtitle">{j.label}</span>
                        <span />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            {GROUPS.map((g) => (
              <div key={g.label} className="pv__group">
                <span className="pv__glabel">{g.label}</span>
                <ol>
                  {g.ids.map((id) => {
                    const c = chapterById(id);
                    return (
                      <li key={id}>
                        <button type="button" data-current={c.id === ch.id} onClick={() => send({ type: 'goto', stepId: firstStepOf(id) })}>
                          <span className="pv__num">{c.part}</span>
                          <span className="pv__jtitle">{c.title}</span>
                          <span className="pv__num">{fmtClock(c.targetSec * 1000)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            <div className="pv__group">
              <span className="pv__glabel">Questions</span>
              <ol>
                {BACKUPS.map((b) => (
                  <li key={b.topic}>
                    <button type="button" onClick={() => send({ type: 'backup', topic: b.topic })}>
                      <span className="pv__num">Q</span>
                      <span className="pv__jtitle">{b.title}</span>
                      <span />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </aside>
      </div>
    </main>
  );
}

export default Presenter;
