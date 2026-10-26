/**
 * Presentation chrome around the scenes. Product pages have the Guide (src/tour/guide); scenes
 * have a persistent chapter navigator instead:
 *   - ChapterRailNav: the always-visible left rail on wide screens (≥ 1200px);
 *   - SceneTools: the scene top bar's tools (the chapter menu button on narrower screens, and the
 *     timer while presenting);
 *   - ChapterDrawer: that chapter menu, a drawer with the same list.
 * Every one renders ChapterList, so the order and labels match the Guide's picker exactly.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../ds';
import { IconMenu, IconX } from '../../ds/icons';
import { Brand } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { chapterById, CHAPTERS, fmtTarget, TOTAL_TARGET_SEC } from '../script/chapters';
import { firstStepOf } from '../script/steps';
import { useTour } from '../engine/TourProvider';
import type { ChapterId } from '../engine/types';
import { ChapterList } from './ChapterList';
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
    <span className={`t-timer t-timer--${tone}`} title="Total time, and this chapter against its target">
      <span className="t-timer__total">{fmtClock(tour.startedAt ? now - tour.startedAt : 0)}</span>
      <span className="t-timer__part">
        {fmtClock(inPart)} of {fmtClock(ch.targetSec * 1000)}
      </span>
    </span>
  );
}

/** Jump to a chapter's first step (narrative or product). */
function useJump() {
  const tour = useTour();
  return (id: ChapterId) => {
    tour.setRailOpen(false);
    tour.goto(firstStepOf(id));
  };
}

/** The scene's always-visible chapter rail (wide screens; CSS hides it below 1200px). */
export function ChapterRailNav() {
  const tour = useTour();
  const navigate = useNavigate();
  const jump = useJump();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Keep the current chapter in view inside the rail as the talk moves on.
  useEffect(() => {
    const cur = scrollRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!cur || !scrollRef.current) return;
    const box = scrollRef.current.getBoundingClientRect();
    const r = cur.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) scrollRef.current.scrollTop += r.top - box.top - box.height / 2 + r.height / 2;
  }, [tour.step.chapter]);
  return (
    <aside className="t-deckrail" aria-label="Presentation" data-testid="chapter-rail">
      <div className="t-deckrail__brand">
        <Brand href={import.meta.env.BASE_URL} />
      </div>
      <div className="t-deckrail__meta">
        <span className="t-deckrail__h">Presentation</span>
        <span className="t-deckrail__total">
          {CHAPTERS.length} chapters, {fmtTarget(TOTAL_TARGET_SEC)}
        </span>
      </div>
      <div className="t-deckrail__scroll" ref={scrollRef}>
        <ChapterList current={tour.step.chapter} onPick={jump} showTimes={false} />
      </div>
      <div className="t-deckrail__foot">
        <Button
          variant="secondary"
          size="sm"
          block
          data-testid="rail-explore"
          onClick={() => {
            tour.exit();
            navigate('/app/overview');
          }}
        >
          Explore on your own
        </Button>
      </div>
    </aside>
  );
}

/** In the scene's top bar: the chapter menu (narrow screens) and, while presenting, the timer. */
export function SceneTools() {
  const tour = useTour();
  const slot = useSceneToolsSlot();
  if (!slot || tour.status !== 'active' || tour.step.kind !== 'scene') return null;
  return createPortal(
    <span className="t-scenetools" data-tour-ui data-testid="scene-tools">
      {tour.presenting ? <Timer /> : null}
      <IconButton className="t-scenetools__menu" label="Chapters" icon={<IconMenu size={16} />} onClick={() => tour.setRailOpen(true)} data-testid="scene-chapters" />
    </span>,
    slot,
  );
}

/** The chapter menu on narrower screens: a drawer with the same list, and the way out. */
export function ChapterDrawer() {
  const tour = useTour();
  const navigate = useNavigate();
  const calm = useCalm();
  const jump = useJump();
  const open = tour.railOpen;
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
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="t-drawer-scrim sl-n-portal" data-tour-ui initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.18 }} onClick={() => tour.setRailOpen(false)}>
          <motion.div
            className="t-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Chapters"
            data-tour-rail-drawer=""
            initial={calm ? { opacity: 0 } : { x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: calm ? 0 : -8, opacity: 0, transition: { duration: calm ? 0 : 0.12, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: calm ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            data-testid="chapter-drawer"
          >
            <div className="t-drawer__head">
              <span className="t-drawer__h">Chapters</span>
              <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon" onClick={() => tour.setRailOpen(false)} aria-label="Close chapters" autoFocus>
                <IconX size={16} />
              </button>
            </div>
            <div className="t-drawer__scroll">
              <ChapterList current={tour.status === 'idle' ? null : tour.step.chapter} onPick={jump} />
            </div>
            <div className="t-drawer__foot">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  tour.exit();
                  navigate('/app/overview');
                }}
                data-testid="drawer-explore"
              >
                Explore on your own
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  tour.exit();
                  navigate('/');
                }}
              >
                Back to the start
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
