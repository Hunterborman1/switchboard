import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton, Kbd } from '../../ds';
import { IconArrowRight, IconChevronRight, IconPause } from '../../ds/icons';
import { useCalm } from '../../narrative/hooks';
import { chapterById } from '../script/chapters';
import { MAIN_ORDER, STEPS } from '../script/steps';
import { resolveCopy, useTour } from './TourProvider';
import { awaitingUser } from './types';

/** "Step 2 of 4" within the chapter, counted along the main path (branch steps count as their neighbour). */
function stepOfChapter(stepId: string, chapter: string): { n: number; of: number } {
  const main = MAIN_ORDER.filter((id) => STEPS.find((s) => s.id === id)?.chapter === chapter);
  let i = main.indexOf(stepId);
  if (i < 0) {
    const order = STEPS.filter((s) => s.chapter === chapter).map((s) => s.id);
    const before = order.slice(0, Math.max(0, order.indexOf(stepId))).filter((id) => main.includes(id));
    i = Math.max(0, before.length - 1);
  }
  return { n: i + 1, of: Math.max(1, main.length) };
}

type Props = {
  mode: 'anchored' | 'center' | 'sheet' | 'float';
  missing: boolean;
  floatingRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  shakeKey: number;
  arrow?: React.ReactNode;
};

export function TourCallout({ mode, missing, floatingRef, style, shakeKey, arrow }: Props) {
  const tour = useTour();
  const { step, ctx } = tour;
  const calm = useCalm();
  const [more, setMore] = useState(false);
  const [shake, setShake] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMore(false), [step.id]);
  useEffect(() => {
    if (!shakeKey) return;
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 380);
    return () => window.clearTimeout(t);
  }, [shakeKey]);

  const chapter = chapterById(step.chapter);
  const pos = stepOfChapter(step.id, step.chapter);
  const title = resolveCopy(step.title, ctx);
  const body = resolveCopy(step.body, ctx);
  const moreText = step.more ? resolveCopy(step.more, ctx) : null;
  const actions = typeof step.actions === 'function' ? step.actions(ctx) : step.actions;
  const waiting = awaitingUser(step, ctx);
  const hint = waiting && typeof step.waitFor === 'object' ? step.waitFor.hint : undefined;
  const ready = tour.isReady;
  const readyLabel = step.readyLabel ? resolveCopy(step.readyLabel, ctx) : 'Working…';

  // focus the primary control for 'next' steps (keyboard flow); event steps leave focus to the product
  useEffect(() => {
    if (waiting && !missing) return;
    const t = window.setTimeout(() => (primaryRef.current ?? boxRef.current)?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [step.id, waiting, missing, ready]);

  const setRefs = (node: HTMLDivElement | null) => {
    (boxRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (typeof floatingRef === 'function') floatingRef(node);
    else if (floatingRef && typeof floatingRef === 'object') (floatingRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div
      ref={setRefs}
      className={`t-callout t-callout--${mode} sl-n-portal`}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-labelledby="t-callout-title"
      aria-describedby="t-callout-body"
      tabIndex={-1}
      data-tour-ui
      data-testid="tour-callout"
      data-step={step.id}
    >
      <motion.div
        key={step.id}
        className={`t-callout__card ${shake ? 'n-shake' : ''}`}
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
      >
        <div className="t-callout__head">
          <span className="t-callout__eyebrow">
            <span className="t-callout__num">
              Step {pos.n} of {pos.of}
            </span>
            <span className="t-callout__chapter">{chapter.title}</span>
          </span>
          <IconButton label="Pause menu (Esc)" icon={<IconPause size={14} />} size="sm" tooltip={false} title="Pause menu (Esc)" className="t-callout__pause" onClick={() => tour.setMenuOpen(true)} />
        </div>
        <h2 id="t-callout-title" className="t-callout__title">{title}</h2>
        <p id="t-callout-body" className="t-callout__body">{body}</p>
        {missing && <p className="t-callout__missing">This part of the page isn’t on screen right now. Carry on when you’re ready.</p>}
        {moreText && (
          <div className="t-callout__more">
            <button type="button" className="t-more-btn" onClick={() => setMore((v) => !v)} aria-expanded={more}>
              <IconChevronRight size={14} className="t-more-btn__chev" data-open={more ? 'true' : 'false'} />
              How this works
            </button>
            <AnimatePresence initial={false}>
              {more && (
                <motion.p className="t-callout__moretext" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}>
                  {moreText}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="t-callout__foot">
          {tour.canGoBack ? (
            <Button variant="ghost" size="sm" className="t-callout__back" onClick={tour.back} aria-label="Back (←)">
              Back
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="t-callout__actions">
            {actions && actions.length > 0 ? (
              actions.map((a, i) => (
                <Button
                  key={a.label}
                  ref={i === actions.length - 1 ? primaryRef : undefined}
                  variant={a.variant === 'primary' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    if (a.apply) tour.setCtx(a.apply(ctx));
                    tour.goto(typeof a.to === 'function' ? a.to(ctx) : a.to);
                  }}
                >
                  {a.label}
                </Button>
              ))
            ) : missing ? (
              <Button ref={primaryRef} variant="primary" size="sm" onClick={tour.skip}>
                Next
              </Button>
            ) : waiting ? (
              <>
                <span className="t-wait" role="status">
                  <span className="t-wait__dot" aria-hidden="true" />
                  {hint ?? 'Your move'}
                </span>
                <Button variant="ghost" size="sm" onClick={tour.skip} title="Skip this step">
                  Skip
                </Button>
              </>
            ) : ready ? (
              <>
                <span className="t-callout__key" aria-hidden="true">
                  <Kbd>
                    <IconArrowRight size={12} />
                  </Kbd>
                </span>
                <Button ref={primaryRef} variant="primary" size="sm" onClick={tour.skip}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <span className="t-wait" role="status">
                  <span className="ds-spinner t-wait__spin" aria-hidden="true" />
                  {readyLabel}
                </span>
                <Button variant="ghost" size="sm" onClick={tour.skip} title="Skip this step">
                  Skip
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
      {arrow}
    </div>
  );
}
