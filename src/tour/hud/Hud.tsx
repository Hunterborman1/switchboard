import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../ds';
import { IconChevronDown, IconMenu, IconPlay, IconX } from '../../ds/icons';
import { Stat } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { chapterById, CHAPTERS, GROUPS, PRODUCT_CHAPTERS, BACKUPS } from '../script/chapters';
import { firstStepOf } from '../script/steps';
import { resolveCopy, useTour } from '../engine/TourProvider';
import type { ChapterId } from '../engine/types';
import { usePillSlot } from './pillSlot';
import { useSceneToolsSlot } from './sceneSlot';

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
    <span className={`t-timer t-timer--${tone}`} title="Total time, and this part against its target">
      <span className="t-timer__total">{fmtClock(tour.startedAt ? now - tour.startedAt : 0)}</span>
      <span className="t-timer__part">
        {fmtClock(inPart)} of {fmtClock(ch.targetSec * 1000)}
      </span>
    </span>
  );
}

/**
 * Walkthrough controls. On scenes they sit in the scene's own top bar, after "4 of 18" (the
 * chapter menu, and the timer while presenting). On product steps the callout says what to do,
 * so the HUD is a small control in one fixed corner (bottom-right) that expands on click; it
 * fades out of the way (never jumps) when the spotlight sits underneath it. On phones it docks
 * into the product's top bar at the height of the "Live AI" control beside it.
 */
export function Hud() {
  const tour = useTour();
  const { step, ctx } = tour;
  const ref = useRef<HTMLDivElement>(null);
  const [faded, setFaded] = useState(false);
  // A product dialog (the file picker) is open: the pill steps aside so it never covers its footer (Open).
  const [away, setAway] = useState(false);
  // Phones: the pill sits over a space reserved in the sticky top bar's slot, never over the lockup.
  const slot = usePillSlot();
  const sceneSlot = useSceneToolsSlot();
  const [dock, setDock] = useState<{ top: number; right: number } | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const ch = chapterById(step.chapter);
  const product = step.kind === 'product';
  const scene = step.kind === 'scene';
  const presenting = tour.presenting;

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
      setAway(false);
      return;
    }
    const tick = () => {
      const dlg = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((d) => !d.closest('[data-tour-ui]') && d.getBoundingClientRect().width > 0);
      setAway(dlg);
      const ring = document.querySelector('.t-spot__ring');
      const hud = ref.current;
      if (!ring || !hud) return setFaded(false);
      const a = ring.getBoundingClientRect();
      const hb = hud.getBoundingClientRect();
      setFaded(!(a.right < hb.left || a.left > hb.right || a.bottom < hb.top || a.top > hb.bottom));
    };
    tick();
    const t = window.setInterval(tick, 400);
    return () => window.clearInterval(t);
  }, [product, step.id, productOpen]);

  // Phones: reserve the pill's width in the mobile bar slot and sit exactly on top of it, at the
  // 28px height of the "Live AI" control next to it.
  const barSlot = tour.status === 'active' && product && !productOpen && slot?.el.dataset.tourPillSlot === 'bar' ? slot.el : null;
  useEffect(() => {
    if (!barSlot) {
      setDock(null);
      return;
    }
    const H = 28;
    const place = () => {
      const hud = ref.current;
      if (!hud) return;
      barSlot.style.display = 'inline-flex';
      barSlot.style.width = `${Math.ceil(hud.offsetWidth)}px`;
      barSlot.style.height = `${H}px`;
      const r = barSlot.getBoundingClientRect();
      setDock((d) => {
        const next = { top: Math.round(r.top + (r.height - H) / 2), right: Math.round(window.innerWidth - r.right) };
        return d && d.top === next.top && d.right === next.right ? d : next;
      });
    };
    place();
    const t = window.setInterval(place, 400);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
      barSlot.style.display = '';
      barSlot.style.width = '';
      barSlot.style.height = '';
    };
  }, [barSlot]);

  if (tour.status !== 'active') return null;
  const objective = step.objective ? resolveCopy(step.objective, ctx) : ch.objective;
  const label = ch.productIndex ? `Chapter ${ch.productIndex} of ${PRODUCT_CHAPTERS}` : ch.layer === 'narrative' ? `Part ${CHAPTERS.findIndex((c) => c.id === ch.id) + 1} of ${CHAPTERS.length}` : 'Last part';
  const scenarios = `${ctx.explored.length} of 6 scenarios explored`;
  // Docked in the phone top bar there is only room for the count.
  const short = ch.productIndex ? `${ch.productIndex} of ${PRODUCT_CHAPTERS}` : label;

  // Over the product the HUD sits above every tooltip layer, so it uses the native title there.
  const chaptersBtn = (size: 'sm' | 'md' = 'sm', tip = false) => <IconButton label="Chapters" icon={<IconMenu size={16} />} size={size} tooltip={tip} title={tip ? undefined : 'All chapters'} onClick={() => tour.setRailOpen(true)} />;

  if (product && !productOpen) {
    return createPortal(
      <div
        ref={ref}
        className={`t-hud t-hud--pill sl-n-portal ${faded ? 't-hud--faded' : ''} ${away ? 't-hud--away' : ''} ${dock ? 't-hud--docked' : ''}`}
        style={dock ? { top: dock.top, right: dock.right } : undefined}
        data-tour-ui
        data-testid="tour-hud"
        role="region"
        aria-label="Walkthrough progress"
      >
        <button type="button" className="t-hud__pillbtn" onClick={() => setProductOpen(true)} aria-expanded={false} title={`${ch.title}: ${objective}`}>
          {barSlot ? null : <span className="t-hud__dot" aria-hidden="true" />}
          <span className="t-hud__chapter">{barSlot ? short : label}</span>
          <span className="n-sr">
            {ch.title}. Goal: {objective}. {scenarios}. Show details.
          </span>
        </button>
        {presenting && <Timer />}
        <span className="t-hud__sep" aria-hidden="true" />
        {chaptersBtn('sm')}
      </div>,
      document.body,
    );
  }

  if (scene) {
    // Docked in the scene's top bar; nothing to show until the bar has mounted its slot.
    if (!sceneSlot) return null;
    return createPortal(
      <div ref={ref} className="t-hud t-hud--scene" data-tour-ui data-testid="tour-hud" role="region" aria-label="Walkthrough controls">
        {presenting && <Timer />}
        {chaptersBtn('md', true)}
      </div>,
      sceneSlot,
    );
  }

  return createPortal(
    <div ref={ref} className={`t-hud t-hud--panel sl-n-portal ${product ? 't-hud--product' : ''}`} data-tour-ui data-testid="tour-hud" role="region" aria-label="Walkthrough progress">
      <div className="t-hud__row">
        <span className="t-hud__chapter">{label}</span>
        <span className="t-hud__spacer" />
        {presenting && <Timer />}
        {chaptersBtn()}
        <IconButton label="Collapse" icon={<IconChevronDown size={16} />} size="sm" tooltip={false} title="Collapse" onClick={() => setProductOpen(false)} aria-expanded />
      </div>
      <p className="t-hud__objective">
        <span className="t-hud__k">Goal</span>
        <span>{objective}</span>
      </p>
      <span className="t-hud__progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tour.progress * 100)}>
        <i style={{ width: `${Math.round(tour.progress * 1000) / 10}%` }} />
      </span>
      {(ch.layer === 'product' || ctx.explored.length > 0) && (
        <div className="t-hud__meta">
          <span>
            <b>{ctx.explored.length}</b> of 6 scenarios explored
          </span>
          <span className="t-hud__dots" aria-hidden="true">
            {['main', 'clean', 'messy', 'security', 'negative', 'privacy'].map((p) => (
              <i key={p} data-on={ctx.explored.includes(p as never)} title={p} />
            ))}
          </span>
        </div>
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
        <motion.div className="t-rail-scrim sl-n-portal" data-tour-ui initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.18 }} onClick={() => tour.setRailOpen(false)}>
          <motion.nav
            className="t-rail"
            aria-label="Chapters"
            initial={calm ? { opacity: 0 } : { x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: calm ? 0 : -8, opacity: 0, transition: { duration: calm ? 0 : 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: calm ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="chapter-rail"
          >
            <div className="t-rail__head">
              <span className="t-rail__h">Chapters</span>
              <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon" onClick={() => tour.setRailOpen(false)} aria-label="Close chapters" autoFocus>
                <IconX size={16} />
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
                          <button type="button" className="t-rail__item" data-state={state} onClick={() => jump(id)} aria-current={state === 'current' ? 'step' : undefined}>
                            <span className="t-rail__num">{i + 1}</span>
                            <span className="t-rail__title">{c.title}</span>
                            <span className="t-rail__time">{Math.round(c.targetSec / 6) / 10} min</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              <div className="t-rail__group">
                <span className="t-rail__glabel">Questions</span>
                <ol>
                  {BACKUPS.map((b) => (
                    <li key={b.topic}>
                      <button
                        type="button"
                        className="t-rail__item"
                        data-state="next"
                        onClick={() => {
                          tour.setRailOpen(false);
                          navigate(`/backup/${b.topic}`);
                        }}
                      >
                        <span className="t-rail__num">Q</span>
                        <span className="t-rail__title">{b.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="t-rail__foot">
              <Button variant="secondary" size="sm" onClick={tour.exit} data-testid="exit-explore">
                Exit to free explore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  tour.setRailOpen(false);
                  tour.exit();
                  navigate('/');
                }}
              >
                Back to the start
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
        <motion.div className="t-menu-scrim sl-n-portal" data-tour-ui initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.18 }} onClick={() => tour.setMenuOpen(false)}>
          <motion.div
            ref={dialogRef}
            className="t-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="t-menu-title"
            initial={calm ? { opacity: 0 } : { y: 4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="pause-menu"
          >
            <div className="t-menu__head">
              <span className="t-menu__k">Walkthrough paused</span>
              <h2 id="t-menu-title" className="t-menu__title">
                {chapterById(tour.step.chapter).title}
              </h2>
            </div>
            <div className="t-menu__list">
              <Button ref={first} variant="primary" icon={<IconPlay size={14} />} block onClick={() => tour.setMenuOpen(false)}>
                Resume
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => {
                  tour.setMenuOpen(false);
                  tour.setRailOpen(true);
                }}
              >
                Chapters
              </Button>
              <Button variant="secondary" block onClick={() => tour.goto(firstStepOf(tour.step.chapter))}>
                Restart this chapter
              </Button>
              <Button variant="secondary" block onClick={tour.exit}>
                Exit to free explore
              </Button>
              <Button
                variant="ghost"
                block
                onClick={() => {
                  tour.exit();
                  navigate('/');
                }}
              >
                Back to the start
              </Button>
            </div>
            <p className="t-menu__note">Esc closes this menu. The arrow keys move between steps. Your progress is saved.</p>
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
          type="button"
          className="t-checkpoint sl-n-portal"
          data-tour-ui
          data-testid="checkpoint"
          onClick={tour.dismissCheckpoint}
          initial={calm ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
          aria-live="polite"
        >
          <span className="t-checkpoint__tag">Chapter complete</span>
          <Stat value={cp.data.value} prefix={cp.data.prefix} suffix={cp.data.suffix} decimals={cp.data.decimals} label={cp.data.label} size="sm" />
          {cp.data.sub && <span className="t-checkpoint__sub">{cp.data.sub}</span>}
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Start/resume control in free explore. Docked into the product shell's chrome, never over page
 * content: a full-width secondary button in the sidebar footer ('rail'), or a 28px control in the
 * mobile top bar ('bar') that matches the "Live AI" control beside it.
 */
export function ResumePill() {
  const tour = useTour();
  const navigate = useNavigate();
  const slot = usePillSlot();
  if (tour.status === 'active' || !slot) return null;
  const label = tour.status === 'idle' ? 'Start the walkthrough' : tour.finished ? 'Replay the walkthrough' : 'Resume walkthrough';
  const placement = slot.el.dataset.tourPillSlot === 'bar' ? 'bar' : 'rail';
  const shortLabel = tour.status === 'idle' ? 'Tour' : tour.finished ? 'Replay' : 'Resume';
  const cls =
    placement === 'rail'
      ? `ds-btn ds-btn--secondary ${slot.compact ? 'ds-btn--icon' : 'ds-btn--block'} t-pill t-pill--rail${slot.compact ? ' is-compact' : ''}`
      : 't-pill t-pill--bar';
  return createPortal(
    <button
      type="button"
      className={cls}
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
      <IconPlay className="t-pill__icon" size={14} />
      {slot.compact ? null : (
        <span className="t-pill__label" aria-hidden="true">
          {placement === 'bar' ? shortLabel : label}
        </span>
      )}
    </button>,
    slot.el,
  );
}
