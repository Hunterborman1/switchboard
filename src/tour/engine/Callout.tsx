import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Arrow, Button, KeyHint } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { chapterById, PRODUCT_CHAPTERS } from '../script/chapters';
import { resolveCopy, useTour } from './TourProvider';

type Props = {
  mode: 'anchored' | 'center' | 'sheet' | 'dock';
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
  const title = resolveCopy(step.title, ctx);
  const body = resolveCopy(step.body, ctx);
  const moreText = step.more ? resolveCopy(step.more, ctx) : null;
  const actions = typeof step.actions === 'function' ? step.actions(ctx) : step.actions;
  const waiting = step.waitFor && step.waitFor !== 'next';
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
        className={`t-callout__card n-glass ${shake ? 'n-shake' : ''}`}
        initial={calm ? false : { opacity: 0, y: 8, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="t-callout__head">
          <span className="t-callout__eyebrow">
            <span className="t-callout__num">{chapter.productIndex ? `Ch ${chapter.productIndex} / ${PRODUCT_CHAPTERS}` : `Part ${String(chapter.part).padStart(2, '0')}`}</span>
            <span className="t-callout__sep" aria-hidden="true" />
            {chapter.title}
          </span>
          <button className="t-icon-btn" onClick={() => tour.setMenuOpen(true)} aria-label="Pause menu (Esc)" title="Pause menu (Esc)">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <h2 id="t-callout-title" className="t-callout__title">{title}</h2>
        <p id="t-callout-body" className="t-callout__body">{body}</p>
        {missing && (
          <p className="t-callout__missing">
            {step.target ? 'That part of the screen isn’t showing right now. You can carry on; nothing is lost.' : ''}
          </p>
        )}
        {moreText && (
          <div className="t-callout__more">
            <button className="t-more-btn" onClick={() => setMore((v) => !v)} aria-expanded={more}>
              How this works <span aria-hidden="true" style={{ display: 'inline-block', transform: more ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }}>›</span>
            </button>
            <AnimatePresence initial={false}>
              {more && (
                <motion.p className="t-callout__moretext" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: calm ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
                  {moreText}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="t-callout__foot">
          {tour.canGoBack ? (
            <Button variant="quiet" size="sm" onClick={tour.back} aria-label="Back (←)">
              <Arrow dir="left" /> Back
            </Button>
          ) : (
            <span />
          )}
          <div className="t-callout__actions">
            {actions && actions.length > 0 ? (
              actions.map((a, i) => (
                <Button
                  key={a.label}
                  ref={i === actions.length - 1 ? primaryRef : undefined}
                  variant={a.variant ?? 'ghost'}
                  size="sm"
                  arrow={a.variant === 'primary'}
                  onClick={() => {
                    if (a.apply) tour.setCtx(a.apply(ctx));
                    tour.goto(typeof a.to === 'function' ? a.to(ctx) : a.to);
                  }}
                >
                  {a.label}
                </Button>
              ))
            ) : missing ? (
              <Button ref={primaryRef} size="sm" arrow onClick={tour.skip}>
                Continue
              </Button>
            ) : waiting ? (
              <>
                <span className="t-wait" role="status">
                  <span className="t-wait__dot" aria-hidden="true" />
                  {hint ?? 'Your move'}
                </span>
                <Button variant="quiet" size="sm" onClick={tour.skip} title="Skip this step">
                  Skip
                </Button>
              </>
            ) : ready ? (
              <>
                <span className="t-callout__key"><KeyHint keys={['→']} /></span>
                <Button ref={primaryRef} size="sm" arrow onClick={tour.skip}>
                  Continue
                </Button>
              </>
            ) : (
              <span className="t-wait" role="status">
                <span className="t-spinner" aria-hidden="true" />
                {readyLabel}
                <button className="t-more-btn" style={{ marginLeft: 6 }} onClick={tour.skip}>
                  Skip
                </button>
              </span>
            )}
          </div>
        </div>
      </motion.div>
      {arrow}
    </div>
  );
}
