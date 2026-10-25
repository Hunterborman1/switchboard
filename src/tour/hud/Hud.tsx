import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button, Progress, Stat } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { chapterById, CHAPTERS, GROUPS, PRODUCT_CHAPTERS, BACKUPS } from '../script/chapters';
import { firstStepOf } from '../script/steps';
import { resolveCopy, useTour } from '../engine/TourProvider';
import type { ChapterId } from '../engine/types';
import { usePillSlot } from './pillSlot';

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

function Timer() {
  const tour = useTour();
  const now = useNow();
  const ch = chapterById(tour.step.chapter);
  const inPart = tour.chapterEnteredAt ? now - tour.chapterEnteredAt : 0;
  const tone = inPart > ch.targetSec * 1000 * 1.25 ? 'red' : inPart > ch.targetSec * 1000 ? 'amber' : 'green';
  return (
    <span className={`t-timer t-timer--${tone}`} title="Elapsed (total · this part / target)">
      {fmtClock(tour.startedAt ? now - tour.startedAt : 0)}
      <span className="t-timer__part">
        {fmtClock(inPart)} / {fmtClock(ch.targetSec * 1000)}
      </span>
    </span>
  );
}

/**
 * Objective HUD. On scenes: a slim card top-right (scenes carry their own eyebrow, so it
 * starts collapsed). On product steps the callout already says what to do, so the HUD is a
 * 40 px pill in one fixed corner (bottom-right) that expands on click; it fades out of the
 * way (never jumps) when the spotlight sits underneath it.
 */
export function Hud() {
  const tour = useTour();
  const { step, ctx } = tour;
  const ref = useRef<HTMLDivElement>(null);
  const [faded, setFaded] = useState(false);
  const [collapsedPref, setCollapsed] = useState<boolean | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const ch = chapterById(step.chapter);
  const product = step.kind === 'product';
  // Scenes carry their own eyebrow: keep the HUD to one line there unless the viewer opens it.
  const collapsed = collapsedPref ?? step.kind === 'scene';

  // Each new product step starts with the pill, so the HUD never covers the page while a callout is open.
  useEffect(() => setProductOpen(false), [step.id]);

  // Product pages get bottom padding while the tour runs, so the pill never hides the last row.
  useEffect(() => {
    if (tour.status !== 'active' || !product) return;
    const root = document.documentElement;
    root.dataset.slTour = 'product';
    return () => {
      delete root.dataset.slTour;
    };
  }, [tour.status, product]);

  useEffect(() => {
    if (!product) {
      setFaded(false);
      return;
    }
    const t = window.setInterval(() => {
      const ring = document.querySelector('.t-spot__ring');
      const hud = ref.current;
      if (!ring || !hud) return setFaded(false);
      const a = ring.getBoundingClientRect();
      const hb = hud.getBoundingClientRect();
      setFaded(!(a.right < hb.left || a.left > hb.right || a.bottom < hb.top || a.top > hb.bottom));
    }, 400);
    return () => window.clearInterval(t);
  }, [product, step.id, productOpen]);

  if (tour.status !== 'active') return null;
  const objective = step.objective ? resolveCopy(step.objective, ctx) : ch.objective;
  const label = ch.productIndex ? `Chapter ${ch.productIndex} / ${PRODUCT_CHAPTERS}` : ch.layer === 'narrative' ? `Part ${String(ch.part).padStart(2, '0')}` : 'Finale';
  const short = ch.productIndex ? `Ch ${ch.productIndex} / ${PRODUCT_CHAPTERS}` : label;
  const scenarios = `Scenarios explored ${ctx.explored.length}/6`;

  const chaptersBtn = (
    <button className="t-icon-btn" onClick={() => tour.setRailOpen(true)} aria-label="Chapters" title="Chapters">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );

  if (product && !productOpen) {
    return createPortal(
      <div ref={ref} className={`t-hud t-hud--pill sl-n-portal ${faded ? 't-hud--faded' : ''}`} data-tour-ui data-testid="tour-hud" role="region" aria-label="Walkthrough progress">
        <button className="t-hud__pillbtn" onClick={() => setProductOpen(true)} aria-expanded={false} title={`${ch.title} · ${objective}`}>
          <span className="t-pill__dot" aria-hidden="true" />
          <span className="t-hud__chapter">{short}</span>
          <span className="n-sr">
            {ch.title}. Objective: {objective}. {scenarios}. Show details.
          </span>
        </button>
        {tour.presenting && <Timer />}
        {chaptersBtn}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div ref={ref} className={`t-hud sl-n-portal ${product ? 't-hud--product' : ''} ${collapsed && !product ? 't-hud--collapsed' : ''} ${step.kind === 'scene' ? 't-hud--scene' : ''}`} data-tour-ui data-testid="tour-hud" role="region" aria-label="Walkthrough progress">
      <div className="t-hud__row">
        <span className="t-hud__chapter">{label}</span>
        {/* On product steps the objective is the useful line; the chapter title is in the callout. */}
        {!product && <span className="t-hud__title" title={ch.title}>{ch.title}</span>}
        <span className="t-hud__spacer" />
        {tour.presenting && <Timer />}
        {chaptersBtn}
        {product ? (
          <button className="t-icon-btn" onClick={() => setProductOpen(false)} aria-label="Collapse" title="Collapse" aria-expanded>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        ) : (
          <button className="t-icon-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand' : 'Collapse'} title={collapsed ? 'Expand' : 'Collapse'} aria-expanded={!collapsed}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}>
              <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        )}
      </div>
      {(product || !collapsed) && (
        <>
          <p className="t-hud__objective">
            <span className="t-hud__k">Objective</span> {objective}
          </p>
          <Progress value={tour.progress} label="Walkthrough progress" />
          {(ch.layer === 'product' || ctx.explored.length > 0) && (
            <div className="t-hud__meta">
              <span>
                Scenarios explored <b>{ctx.explored.length}</b>/6
              </span>
              <span className="t-hud__dots" aria-hidden="true">
                {['main', 'clean', 'messy', 'security', 'negative', 'privacy'].map((p) => (
                  <i key={p} data-on={ctx.explored.includes(p as never)} title={p} />
                ))}
              </span>
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

/** Left drawer: jump to any chapter, backups, exit to free explore. */
export function ChapterRail() {
  const tour = useTour();
  const navigate = useNavigate();
  const calm = useCalm();
  const open = tour.railOpen;
  const cur = CHAPTERS.findIndex((c) => c.id === tour.step.chapter);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        tour.setRailOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, tour]);
  const jump = (id: ChapterId) => {
    tour.setRailOpen(false);
    tour.goto(firstStepOf(id));
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="t-rail-scrim sl-n-portal" data-tour-ui initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.2 }} onClick={() => tour.setRailOpen(false)}>
          <motion.nav
            className="t-rail n-glass"
            aria-label="Chapters"
            initial={calm ? false : { x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: calm ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="chapter-rail"
          >
            <div className="t-rail__head">
              <span className="n-label">Chapters</span>
              <button className="t-icon-btn" onClick={() => tour.setRailOpen(false)} aria-label="Close chapters" autoFocus>
                ✕
              </button>
            </div>
            <div className="t-rail__scroll">
              {GROUPS.map((g) => (
                <div key={g.label} className="t-rail__group">
                  <span className="t-rail__glabel">{g.label}</span>
                  <ol>
                    {g.ids.map((id) => {
                      const c = chapterById(id);
                      const i = CHAPTERS.findIndex((x) => x.id === id);
                      const state = tour.status === 'active' && i === cur ? 'current' : i < cur ? 'done' : 'next';
                      return (
                        <li key={id}>
                          <button className="t-rail__item" data-state={state} onClick={() => jump(id)} aria-current={state === 'current' ? 'step' : undefined}>
                            <span className="t-rail__num">{c.productIndex ? `Ch ${c.productIndex}` : String(c.part).padStart(2, '0')}</span>
                            <span className="t-rail__title">{c.title}</span>
                            <span className="t-rail__time">{Math.round(c.targetSec / 6) / 10}m</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              <div className="t-rail__group">
                <span className="t-rail__glabel">Q&amp;A backup</span>
                <ol>
                  {BACKUPS.map((b) => (
                    <li key={b.topic}>
                      <button
                        className="t-rail__item"
                        data-state="next"
                        onClick={() => {
                          tour.setRailOpen(false);
                          navigate(`/backup/${b.topic}`);
                        }}
                      >
                        <span className="t-rail__num">Q&amp;A</span>
                        <span className="t-rail__title">{b.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="t-rail__foot">
              <Button variant="ghost" size="sm" onClick={tour.exit} data-testid="exit-explore">
                Exit to free explore
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  tour.setRailOpen(false);
                  tour.exit();
                  navigate('/');
                }}
              >
                Hub
              </Button>
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Esc: pause menu. */
export function PauseMenu() {
  const tour = useTour();
  const navigate = useNavigate();
  const calm = useCalm();
  const first = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = tour.menuOpen && tour.status === 'active';
  // Modal for real: everything behind the menu is inert, Tab cycles inside it, and focus
  // goes back where it was when the menu closes.
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const marked: HTMLElement[] = [];
    const t = window.setTimeout(() => {
      const dlg = dialogRef.current;
      if (dlg) {
        for (const el of Array.from(document.body.children) as HTMLElement[]) {
          if (el.contains(dlg) || el.inert) continue;
          el.inert = true;
          marked.push(el);
        }
      }
      first.current?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dlg = dialogRef.current;
      if (!dlg) return;
      const items = Array.from(dlg.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const a = items[0]!;
      const z = items[items.length - 1]!;
      const inside = dlg.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === a || !inside)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && (document.activeElement === z || !inside)) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      marked.forEach((el) => (el.inert = false));
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
    };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="t-menu-scrim sl-n-portal" data-tour-ui initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.2 }} onClick={() => tour.setMenuOpen(false)}>
          <motion.div
            ref={dialogRef}
            className="t-menu n-glass"
            role="dialog"
            aria-modal="true"
            aria-label="Walkthrough paused"
            initial={calm ? false : { y: 10, opacity: 0, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: 6, opacity: 0 }}
            transition={{ duration: calm ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="pause-menu"
          >
            <span className="n-label">Paused</span>
            <h2 className="n-display n-display--sm" style={{ margin: '6px 0 18px' }}>
              {chapterById(tour.step.chapter).title}
            </h2>
            <div className="t-menu__list">
              <Button ref={first} onClick={() => tour.setMenuOpen(false)} arrow>
                Resume
              </Button>
              <Button variant="ghost" onClick={() => { tour.setMenuOpen(false); tour.setRailOpen(true); }}>
                Chapters
              </Button>
              <Button variant="ghost" onClick={() => tour.goto(firstStepOf(tour.step.chapter))}>
                Restart this chapter
              </Button>
              <Button variant="ghost" onClick={tour.exit}>
                Exit to free explore
              </Button>
              <Button variant="quiet" onClick={() => { tour.exit(); navigate('/'); }}>
                Back to the hub
              </Button>
            </div>
            <p className="n-note" style={{ marginTop: 16 }}>
              Esc to close · ← → to move · progress is saved
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Chapter-end beat: the metric that changed. ≤ 1.2 s, click or key to skip. */
export function Checkpoint() {
  const tour = useTour();
  const cp = tour.checkpoint;
  const calm = useCalm();
  const dismissRef = useRef(tour.dismissCheckpoint);
  dismissRef.current = tour.dismissCheckpoint;
  useEffect(() => {
    if (!cp) return;
    const t = window.setTimeout(() => dismissRef.current(), calm ? 900 : 1200);
    const skip = () => dismissRef.current();
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [cp, calm]);
  return createPortal(
    <AnimatePresence>
      {cp && (
        <motion.button
          key={cp.key}
          className="t-checkpoint n-glass sl-n-portal"
          data-tour-ui
          data-testid="checkpoint"
          onClick={tour.dismissCheckpoint}
          initial={calm ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.98, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={calm ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(6px)' }}
          transition={{ duration: calm ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          aria-live="polite"
        >
          <span className="t-checkpoint__tag">Checkpoint</span>
          <Stat value={cp.data.value} prefix={cp.data.prefix} suffix={cp.data.suffix} decimals={cp.data.decimals} label={cp.data.label} tone="accent" size="sm" />
          {cp.data.sub && <span className="n-note">{cp.data.sub}</span>}
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Start/resume pill in free explore. Docked into the product shell's chrome (sidebar
 * footer on desktop, mobile launch bar on phones) so it never floats over page content.
 */
export function ResumePill() {
  const tour = useTour();
  const navigate = useNavigate();
  const slot = usePillSlot();
  if (tour.status === 'active' || !slot) return null;
  const label = tour.status === 'idle' ? 'Start the walkthrough' : tour.finished ? 'Replay the walkthrough' : 'Resume walkthrough';
  const placement = slot.el.dataset.tourPillSlot === 'bar' ? 'bar' : 'rail';
  const shortLabel = tour.status === 'idle' ? 'Walkthrough' : tour.finished ? 'Replay tour' : 'Resume tour';
  return createPortal(
    <button
      type="button"
      className={`t-pill t-pill--docked t-pill--${placement}${slot.compact ? ' is-compact' : ''} sl-n-portal`}
      data-tour-ui
      data-testid="resume-pill"
      aria-label={label}
      title={slot.compact ? label : undefined}
      onClick={() => {
        if (tour.status === 'idle') {
          tour.start();
          navigate('/walkthrough/cold-open');
        } else if (tour.finished) {
          tour.restart();
        } else tour.resume();
      }}
    >
      <span className="t-pill__dot" aria-hidden="true" />
      {slot.compact ? null : <span className="t-pill__label" aria-hidden="true">{placement === 'bar' ? shortLabel : label}</span>}
    </button>,
    slot.el,
  );
}
