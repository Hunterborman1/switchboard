/**
 * The Guide: one persistent bar on every Switchboard and Agent Ops page.
 *
 * - Presentation mode (the tour is on a product step): the chapter and its picker, the step's
 *   title and why, "How this works", a "Your turn" line when the step waits for the viewer (with
 *   "Show me"), Back / Next (or "Skip this step"), "Explore on your own", and the presentation's
 *   progress along its top edge, like the scenes' bottom bar.
 * - Explore mode (after leaving the presentation, after the scorecard, or opening the product
 *   from the hub): a nudge for whatever page is open ("Try it: …"), "Show me", and "Resume
 *   presentation", which returns to the step they left (or starts from the beginning).
 *
 * It covers nothing. Desktop: a dock along the bottom of the content column; the page reserves
 * its height, and dialogs, drawers, toasts and sticky action bars sit above it (tour.css). It
 * folds to a one-line strip when minimized or while a dialog is open. Phones (≤ 900px): a bottom
 * sheet that folds to its bar. The step's target gets a calm ring and is scrolled into the band
 * the dock leaves free (src/tour/guide/dock.ts).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton, Popover } from '../../ds';
import { IconArrowLeft, IconArrowRight, IconChevronDown, IconChevronRight, IconChevronUp, IconMenu, IconMinus, IconPlay } from '../../ds/icons';
import { useCalm, useMediaQuery } from '../../narrative/hooks';
import { CHAPTERS, chapterById, chapterLabel } from '../script/chapters';
import { chapterSteps, firstStepOf, STEPS } from '../script/steps';
import { resolveCopy, resolveTarget, useTour } from '../engine/TourProvider';
import { awaitingUser, type ChapterId, type Step, type TourCtx } from '../engine/types';
import { findAnchor, useAnchor, useRect } from '../engine/useAnchor';
import type { AnchorId } from '../anchors';
import { ChapterList } from '../hud/ChapterList';
import { dockBand, scrollDelta, sheetPlan, type Rect, type Viewport } from './dock';
import { nudgeFor } from './nudges';

const MIN_KEY = 'sl-guide-min';
const SHEET_QUERY = '(max-width: 900px)';
const OBSTACLES = '.ds-dialog, .ds-drawer, .ds-sidebar-drawer';

/** The viewer's own choice, or null when they haven't made one. */
const readMin = (): boolean | null => {
  try {
    const v = sessionStorage.getItem(MIN_KEY);
    return v == null ? null : v === '1';
  } catch {
    return null;
  }
};
const writeMin = (v: boolean) => {
  try {
    sessionStorage.setItem(MIN_KEY, v ? '1' : '0');
  } catch {
    /* private mode: the state just isn't remembered */
  }
};

function viewport(): Viewport {
  const bar = document.querySelector('.ds-topbar');
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 52;
  const main = document.getElementById('main-content');
  const l = main ? main.getBoundingClientRect().left : 0;
  return { vw: window.innerWidth, vh: window.innerHeight, top, left: l > 0 && l < window.innerWidth / 2 ? l : 0 };
}

const rectOf = (el: Element, pad = 6): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
};

/** Open product dialogs and drawers (never the Guide's own popovers). */
function openObstacles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(OBSTACLES)).filter((el) => {
    if (el.closest('[data-tour-ui]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** Scroll `el` (in whatever scrolls it) so it sits inside the band, minimally. */
function scrollIntoBand(el: HTMLElement, band: { top: number; bottom: number }, smooth: boolean) {
  const prevT = el.style.scrollMarginTop;
  const prevB = el.style.scrollMarginBottom;
  const r = el.getBoundingClientRect();
  const tall = r.height + 12 > band.bottom - band.top;
  el.style.scrollMarginTop = `${Math.max(0, band.top + 6)}px`;
  el.style.scrollMarginBottom = `${Math.max(0, window.innerHeight - band.bottom + 6)}px`;
  el.scrollIntoView({ block: tall ? 'start' : 'nearest', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  el.style.scrollMarginTop = prevT;
  el.style.scrollMarginBottom = prevB;
}

/** The element itself or a close ancestor that sticks to the bottom of the viewport, if any. */
function stickyBottom(el: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = el;
  for (let i = 0; n && i < 5; i++, n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.position === 'sticky' && cs.bottom !== 'auto') return n;
  }
  return null;
}

/** Scroll so the end of `el` sits at the bottom of the band. */
function scrollEndIntoBand(el: HTMLElement, band: { top: number; bottom: number }, smooth: boolean) {
  const prev = el.style.scrollMarginBottom;
  el.style.scrollMarginBottom = `${Math.max(0, window.innerHeight - band.bottom + 6)}px`;
  el.scrollIntoView({ block: 'end', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  el.style.scrollMarginBottom = prev;
}

const isProduct = (id: string) => STEPS.find((s) => s.id === id)?.kind === 'product';

/**
 * "Step 2 of 3" within the chapter: product steps on the main path only (a chapter's opening scene
 * isn't counted; a branch step counts as its neighbour).
 */
function stepOfChapter(step: Step): { n: number; of: number } {
  const main = chapterSteps(step.chapter).filter(isProduct);
  let i = main.indexOf(step.id);
  if (i < 0) {
    const order = STEPS.filter((s) => s.chapter === step.chapter && s.kind === 'product').map((s) => s.id);
    i = Math.max(0, order.slice(0, Math.max(0, order.indexOf(step.id))).filter((id) => main.includes(id)).length - 1);
  }
  return { n: i + 1, of: Math.max(1, main.length) };
}

/** How far through the presentation this step is, 0–1, for the progress line. */
function progressOf(step: Step): number {
  const ch = chapterById(step.chapter);
  const pos = stepOfChapter(step);
  return Math.min(1, (ch.part - 1 + pos.n / (pos.of + 1)) / CHAPTERS.length);
}

/** Elements for a list of anchor ids, re-checked while the page settles. */
function useElements(ids: AnchorId[] | undefined, key: string): HTMLElement[] {
  const [els, setEls] = useState<HTMLElement[]>([]);
  useEffect(() => {
    if (!ids?.length) {
      setEls([]);
      return;
    }
    const find = () => {
      const next = ids.map((id) => findAnchor(id)).filter((e): e is HTMLElement => !!e);
      setEls((prev) => (prev.length === next.length && prev.every((e, i) => e === next[i]) ? prev : next));
    };
    find();
    const t = window.setInterval(find, 500);
    return () => window.clearInterval(t);
  }, [ids, key]);
  return els;
}

/** A calm 2px accent ring with a flat accent-subtle halo around the target. Never blocks a click. */
function Ring({ el, soft, flashKey }: { el: HTMLElement | null; soft?: boolean; flashKey?: number }) {
  const box = useRect(el, soft ? 3 : 4);
  const [flash, setFlash] = useState(false);
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!flashKey) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(t);
  }, [flashKey]);
  // A product dialog that doesn't hold the target sits over it: no ring floating on the dialog.
  useEffect(() => {
    if (!el) return;
    const check = () => setCovered(openObstacles().some((o) => !o.contains(el)));
    check();
    const t = window.setInterval(check, 300);
    return () => window.clearInterval(t);
  }, [el]);
  if (!el || !box || covered) return null;
  return (
    <div
      className={`t-ring${soft ? ' t-ring--soft' : ''}${flash ? ' is-flash' : ''}${el.closest(OBSTACLES) ? ' t-ring--top' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      aria-hidden="true"
      data-tour-ui
      data-testid={soft ? undefined : 'guide-ring'}
    />
  );
}

export function Guide() {
  const tour = useTour();
  const location = useLocation();
  const inProduct = /^\/(app|ops)(\/|$)/.test(location.pathname);
  // While the presentation is on a scene, the route effect is taking us there: nothing to show.
  if (!inProduct || (tour.status === 'active' && tour.step.kind !== 'product')) return null;
  return createPortal(<GuideInner />, document.body);
}

function GuideInner() {
  const tour = useTour();
  const { step, ctx } = tour;
  const location = useLocation();
  const calm = useCalm();
  const isSheet = useMediaQuery(SHEET_QUERY);
  const present = tour.status === 'active' && step.kind === 'product';
  const nudge = nudgeFor(ctx.pathname);

  // Phones start folded while exploring (a nudge, not an instruction) until the viewer chooses.
  const [userMin, setUserMin] = useState(() => readMin() ?? (!present && window.matchMedia(SHEET_QUERY).matches));
  const setMinimized = useCallback((v: boolean) => {
    setUserMin(v);
    writeMin(v);
  }, []);
  // Presentation: every new step opens the Guide again (it carries the instruction).
  useEffect(() => {
    if (present) setUserMin(false);
  }, [present, step.id]);

  // ------------------------------------------------------------------ what to point at
  const [showId, setShowId] = useState<AnchorId | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => setShowId(null), [location.pathname, present]);
  const targets: AnchorId[] = present ? resolveTarget(step, ctx) : showId ? [showId] : [];
  const anchorKey = present ? step.id : `${location.pathname}|${showId ?? ''}`;
  const anchor = useAnchor(targets, step.anchorTimeoutMs ?? 6000, anchorKey);
  const highlights = useElements(present ? step.highlight : undefined, anchorKey);
  // Explore: the "Show me" ring fades after a few seconds; the page belongs to the viewer.
  useEffect(() => {
    if (present || !showId) return;
    const t = window.setTimeout(() => setShowId(null), 5000);
    return () => window.clearTimeout(t);
  }, [present, showId, flashKey]);
  const [nudgeAnchor, setNudgeAnchor] = useState(false);
  useEffect(() => {
    if (present || !nudge.show) {
      setNudgeAnchor(false);
      return;
    }
    const id = nudge.show;
    const check = () => setNudgeAnchor(!!findAnchor(id));
    check();
    const t = window.setInterval(check, 600);
    return () => window.clearInterval(t);
  }, [present, nudge.show, location.pathname]);

  // ------------------------------------------------------------------ folding
  const panelRef = useRef<HTMLDivElement>(null);
  /** Height of the open Guide, for the phone sheet's fold decision. */
  const openH = useRef(260);
  const [autoFold, setAutoFold] = useState(false);
  const folded = userMin || autoFold;
  const elRef = useRef<HTMLElement | null>(null);
  elRef.current = anchor.el;

  // The viewer opened the Guide on purpose: leave it open until the next step.
  const keptOpen = useRef(false);
  useEffect(() => {
    keptOpen.current = false;
  }, [anchorKey]);

  /** Fold while a dialog or drawer is open (it gets the room); on phones also for a tall target. */
  const placeGuide = useCallback(() => {
    const vp = viewport();
    document.documentElement.style.setProperty('--sl-content-left', `${Math.round(vp.left)}px`);
    if (keptOpen.current) {
      setAutoFold(false);
      return;
    }
    const el = elRef.current;
    const dialogOpen = openObstacles().length > 0;
    const tall = window.matchMedia(SHEET_QUERY).matches && !!el && sheetPlan(rectOf(el), openH.current, vp).fold;
    setAutoFold(dialogOpen || tall);
  }, []);

  /** Bring the target into the band between the top bar and the Guide. */
  const bringIntoView = useCallback(
    (smooth: boolean) => {
      const el = elRef.current;
      placeGuide();
      if (!el) return;
      // Inside a dialog (the file picker): only its own list scrolls; bring the row fully into view there.
      if (el.closest(OBSTACLES)) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
        return;
      }
      const h = panelRef.current?.getBoundingClientRect().height ?? 0;
      const band = dockBand(viewport(), h);
      // A bottom-sticky target (the review's decision bar) rides just above the Guide until its
      // container ends: scroll the container's end into the band instead.
      const sticky = stickyBottom(el);
      if (sticky?.parentElement) {
        const box = rectOf(sticky.parentElement, 0);
        if (box.y + box.h > band.bottom) scrollEndIntoBand(sticky.parentElement, band, smooth);
      } else if (scrollDelta(rectOf(el), band) !== 0) scrollIntoBand(el, band, smooth);
    },
    [placeGuide],
  );

  // A new target (a new step, or "Show me"): bring it into view. Pages fill in as their data
  // arrives, so the target can move: keep correcting for a moment, unless the viewer has started
  // scrolling themselves.
  const viewerMoved = useRef(false);
  useEffect(() => {
    viewerMoved.current = false;
    const mark = () => {
      viewerMoved.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) mark();
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchorKey]);
  useEffect(() => {
    if (!anchor.el) {
      placeGuide();
      return;
    }
    const raf = requestAnimationFrame(() => bringIntoView(!calm));
    const timers = [450, 1100, 2000].map((ms) => window.setTimeout(() => (viewerMoved.current ? placeGuide() : bringIntoView(false)), ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [anchor.el, anchorKey, calm, bringIntoView, placeGuide]);

  // Dialogs open and close under it: keep the fold right.
  useEffect(() => {
    const t = window.setInterval(placeGuide, 500);
    window.addEventListener('resize', placeGuide);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', placeGuide);
    };
  }, [placeGuide]);

  // Publish the Guide's height: the page, dialogs, drawers, toasts and sticky bars keep clear of it.
  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => {
      const h = Math.ceil(node.getBoundingClientRect().height);
      if (!folded) openH.current = h;
      root.style.setProperty('--sl-guide-h', `${h}px`);
      root.dataset.slGuide = isSheet ? 'sheet' : 'dock';
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(node);
    return () => ro.disconnect();
  }, [folded, isSheet, step.id, present]);
  useEffect(
    () => () => {
      const root = document.documentElement;
      delete root.dataset.slGuide;
      root.style.removeProperty('--sl-guide-h');
      root.style.removeProperty('--sl-content-left');
    },
    [],
  );

  const open = useCallback(() => {
    keptOpen.current = true;
    setMinimized(false);
    setAutoFold(false);
  }, [setMinimized]);

  const showMe = useCallback(() => {
    if (!present && nudge.show) setShowId(nudge.show);
    setFlashKey((k) => k + 1);
    window.setTimeout(() => bringIntoView(!calm), present ? 0 : 60);
  }, [present, nudge.show, bringIntoView, calm]);

  // → while the step waits for the viewer: point at what to do instead of moving on.
  useEffect(() => {
    const onNudge = () => showMe();
    document.addEventListener('sl-tour-nudge', onNudge);
    return () => document.removeEventListener('sl-tour-nudge', onNudge);
  }, [showMe]);

  // ------------------------------------------------------------------ focus for the keyboard path
  const primaryRef = useRef<HTMLButtonElement>(null);
  const waiting = present && awaitingUser(step, ctx);
  useEffect(() => {
    if (!present) return;
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && a !== document.body && !a.closest('[data-tour-ui]') && /^(input|textarea|select)$/i.test(a.tagName);
    };
    const t = window.setTimeout(() => {
      if (busy()) return;
      if (waiting && anchor.el) {
        const el = anchor.el;
        const f = el.matches('button, a[href], input, select, textarea, [tabindex]') ? el : el.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        f?.focus({ preventScroll: true });
      } else if (!waiting) primaryRef.current?.focus({ preventScroll: true });
    }, 90);
    return () => window.clearTimeout(t);
  }, [present, step.id, waiting, anchor.el, tour.isReady]);

  // ------------------------------------------------------------------ render
  const layout = isSheet ? 'sheet' : 'dock';
  const cls = ['t-guide', 'sl-n-portal', `t-guide--${layout}`, folded ? 'is-folded' : 'is-open', present ? 'is-present' : 'is-explore'].join(' ');
  const hint = waiting && typeof step.waitFor === 'object' ? step.waitFor.hint : undefined;

  return (
    <>
      {present ? highlights.map((h, i) => <Ring key={i} el={h} soft />) : null}
      <Ring el={anchor.el} flashKey={flashKey} />
      <div
        ref={panelRef}
        className={cls}
        data-tour-ui
        data-testid="guide"
        data-mode={present ? 'present' : 'explore'}
        data-size={folded ? 'folded' : 'open'}
        data-step={present ? step.id : undefined}
        role="region"
        aria-label={present ? 'Presentation' : 'Guide'}
      >
        {present ? (
          <div className="t-guide__progress" aria-hidden="true">
            <i style={{ width: `${Math.round(progressOf(step) * 1000) / 10}%` }} />
          </div>
        ) : null}
        {isSheet ? (
          <SheetBar
            open={!folded}
            present={present}
            waiting={waiting}
            onToggle={() => (folded ? open() : setMinimized(true))}
            title={present ? (hint ? `Your turn: ${hint}` : resolveCopy(step.title, ctx)) : nudge.title}
          />
        ) : null}
        {!isSheet && folded ? (
          <Strip present={present} waiting={waiting} hint={hint} onOpen={open} primaryRef={primaryRef} nudge={nudge} />
        ) : !folded ? (
          present ? (
            <PresentBody
              step={step}
              ctx={ctx}
              hint={hint}
              missing={targets.length > 0 && anchor.status === 'missing'}
              onShowMe={showMe}
              canShow={!!anchor.el}
              onMinimize={() => setMinimized(true)}
              primaryRef={primaryRef}
              sheet={isSheet}
              calm={calm}
            />
          ) : (
            <ExploreBody nudge={nudge} canShow={nudgeAnchor} onShowMe={showMe} onMinimize={() => setMinimized(true)} sheet={isSheet} />
          )
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- pieces

function ChapterPicker({ current, trigger }: { current: ChapterId | null; trigger: React.ReactElement }) {
  const tour = useTour();
  return (
    <Popover trigger={trigger} placement="top-start" width={340}>
      {(close) => (
        <div className="t-guide__picker" data-testid="chapter-picker">
          <ChapterList
            current={current}
            dense
            label="All chapters"
            onPick={(id) => {
              close();
              tour.goto(firstStepOf(id));
            }}
          />
        </div>
      )}
    </Popover>
  );
}

/** Phones: the sheet's bar. Open, it names the chapter (with the picker); folded, it says what to do. */
function SheetBar({ open, present, onToggle, title, waiting }: { open: boolean; present: boolean; onToggle: () => void; title: string; waiting: boolean }) {
  const tour = useTour();
  const ch = present ? chapterById(tour.step.chapter) : null;
  const left = tour.status === 'explore' && !tour.finished ? tour.step.chapter : null;
  return (
    <div className="t-guide__bar">
      <button type="button" className="t-guide__bartoggle" onClick={onToggle} aria-expanded={open} data-testid="guide-bar">
        <span className="t-guide__barlabel">
          <span className="t-guide__eyebrow">{present ? `Presentation, ${chapterLabel(tour.step.chapter).toLowerCase()}` : open ? 'Guide' : 'Try it'}</span>
          <span className="t-guide__bartitle">{open ? (ch ? ch.title : nudgeFor(tour.ctx.pathname).page) : title}</span>
        </span>
        <span className="n-sr">{open ? 'Fold the guide' : 'Open the guide'}</span>
      </button>
      {!open && present ? (
        waiting ? (
          <Button size="sm" variant="ghost" onClick={tour.skip} data-testid="guide-skip">
            Skip
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => tour.next() || tour.skip()} disabled={!tour.isReady} data-testid="guide-next">
            Next
          </Button>
        )
      ) : null}
      {open ? (
        <ChapterPicker
          current={present ? tour.step.chapter : left}
          trigger={<IconButton size="sm" label="All chapters" tooltip={false} title="All chapters" icon={<IconMenu size={16} />} data-testid="guide-chapters" />}
        />
      ) : null}
      <IconButton size="sm" label={open ? 'Fold the guide' : 'Open the guide'} tooltip={false} icon={open ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />} onClick={onToggle} />
    </div>
  );
}

/** Desktop, folded: one line that says where the presentation is (or what to try) and the next action. */
function Strip({
  present,
  waiting,
  hint,
  onOpen,
  primaryRef,
  nudge,
}: {
  present: boolean;
  waiting: boolean;
  hint: string | undefined;
  onOpen: () => void;
  primaryRef: RefObject<HTMLButtonElement>;
  nudge: ReturnType<typeof nudgeFor>;
}) {
  const tour = useTour();
  const { step, ctx } = tour;
  const ch = chapterById(step.chapter);
  return (
    <div className="t-guide__strip" data-testid="guide-strip">
      <span className="t-guide__dot" data-on={present ? 'true' : undefined} aria-hidden="true" />
      <span className="t-guide__striptext">
        <span className="t-guide__stripk">{present ? `${chapterLabel(step.chapter)}, ${ch.title}` : 'Try it'}</span>
        <span className="t-guide__stripv" data-testid="guide-title">
          {present ? (hint ? `Your turn: ${hint}` : resolveCopy(step.title, ctx)) : nudge.title}
        </span>
      </span>
      {present ? (
        waiting ? (
          <Button size="sm" variant="secondary" onClick={tour.skip}>
            Skip this step
          </Button>
        ) : (
          <Button ref={primaryRef} size="sm" variant="primary" onClick={() => tour.next() || tour.skip()} disabled={!tour.isReady} iconRight={<IconArrowRight size={14} />}>
            Next
          </Button>
        )
      ) : (
        <ResumeButton size="sm" />
      )}
      <IconButton size="sm" label="Show the guide" tooltip={false} title="Show the guide" icon={<IconChevronUp size={16} />} onClick={onOpen} data-testid="guide-expand" />
    </div>
  );
}

function PresentBody({
  step,
  ctx,
  hint,
  missing,
  onShowMe,
  canShow,
  onMinimize,
  primaryRef,
  sheet,
  calm,
}: {
  step: Step;
  ctx: TourCtx;
  hint: string | undefined;
  missing: boolean;
  onShowMe: () => void;
  canShow: boolean;
  onMinimize: () => void;
  primaryRef: RefObject<HTMLButtonElement>;
  sheet: boolean;
  calm: boolean;
}) {
  const tour = useTour();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [step.id]);
  const ch = chapterById(step.chapter);
  const pos = stepOfChapter(step);
  const title = resolveCopy(step.title, ctx);
  const body = resolveCopy(step.body, ctx);
  const moreText = step.more ? resolveCopy(step.more, ctx) : null;
  const actions = typeof step.actions === 'function' ? step.actions(ctx) : step.actions;
  const readyLabel = step.readyLabel ? resolveCopy(step.readyLabel, ctx) : 'Working…';
  const cp = step.checkpoint ? step.checkpoint(ctx) : null;
  // The dock's Back / Next match the scenes' bottom bar; the phone sheet uses small buttons.
  const size = sheet ? 'sm' : 'md';
  const explore = (
    <Button variant="ghost" size="sm" className="t-guide__exitbtn" onClick={tour.exit} data-testid="guide-explore">
      Explore on your own
    </Button>
  );
  return (
    <div className="t-guide__grid">
      {sheet ? null : (
        <div className="t-guide__meta">
          <ChapterPicker
            current={step.chapter}
            trigger={
              <button type="button" className="t-guide__chapter" data-testid="guide-chapters" aria-label={`${chapterLabel(step.chapter)}: ${ch.title}. All chapters`}>
                <span className="t-guide__chapternum">{chapterLabel(step.chapter)}</span>
                <span className="t-guide__chaptertitle">{ch.title}</span>
                <IconChevronDown size={14} className="t-guide__chev" />
              </button>
            }
          />
          <span className="t-guide__count">
            Step {pos.n} of {pos.of}
          </span>
          <span className="t-guide__spacer" />
          {explore}
          <IconButton size="sm" label="Minimize" tooltip={false} title="Minimize" icon={<IconMinus size={14} />} onClick={onMinimize} data-testid="guide-minimize" />
        </div>
      )}
      <motion.div
        key={step.id}
        className="t-guide__main"
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
      >
        <h2 className="t-guide__title" data-testid="guide-title">
          {title}
        </h2>
        <p className="t-guide__text">
          {body}
          {moreText ? (
            <>
              {' '}
              <button type="button" className="t-guide__morebtn" onClick={() => setMore((v) => !v)} aria-expanded={more}>
                How this works
                <IconChevronRight size={14} className="t-guide__chev" data-open={more ? 'true' : 'false'} />
              </button>
            </>
          ) : null}
        </p>
        <AnimatePresence initial={false}>
          {more && moreText ? (
            <motion.p
              className="t-guide__moretext"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
            >
              {moreText}
            </motion.p>
          ) : null}
        </AnimatePresence>
        {!tour.isReady && !hint && !missing && !(actions && actions.length > 0) ? (
          <p className="t-guide__wait" role="status">
            <span className="ds-spinner" aria-hidden="true" />
            {readyLabel}
          </p>
        ) : null}
        {missing ? <p className="t-guide__missing">That part of the page isn’t on screen right now. Carry on when you’re ready.</p> : null}
        {cp ? (
          <p className="t-guide__checkpoint" data-testid="guide-checkpoint">
            <span className="t-guide__cpvalue">
              {cp.prefix ?? ''}
              {cp.decimals ? cp.value.toFixed(cp.decimals) : cp.value.toLocaleString('en-US')}
              {cp.suffix ?? ''}
            </span>{' '}
            <span>{cp.label}</span>
            {cp.sub ? <span className="t-guide__cpsub">{cp.sub}</span> : null}
          </p>
        ) : null}
      </motion.div>
      {hint ? (
        <p className="t-guide__turn" role="status" data-testid="guide-turn">
          <span>
            <span className="t-guide__turnk">Your turn:</span> {hint}
          </span>
          {canShow ? (
            <button type="button" className="t-guide__showme" onClick={onShowMe}>
              Show me
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="t-guide__nav">
        {sheet ? explore : null}
        {tour.canGoBack ? (
          <Button variant="ghost" size={size} icon={<IconArrowLeft size={16} />} onClick={tour.back} title="Back (←)" data-testid="guide-back">
            Back
          </Button>
        ) : null}
        {actions && actions.length > 0 && tour.isReady ? (
          actions.map((a, i) => (
            <Button
              key={a.label}
              ref={a.variant === 'primary' || i === actions.length - 1 ? primaryRef : undefined}
              variant={a.variant === 'primary' ? 'primary' : 'secondary'}
              size={size}
              onClick={() => {
                if (a.apply) tour.setCtx(a.apply(ctx));
                tour.goto(typeof a.to === 'function' ? a.to(ctx) : a.to);
              }}
            >
              {a.label}
            </Button>
          ))
        ) : hint || (!tour.isReady && !missing) ? (
          <Button variant="secondary" size={size} onClick={tour.skip} data-testid="guide-skip">
            Skip this step
          </Button>
        ) : (
          <Button ref={primaryRef} variant="primary" size={size} onClick={tour.skip} iconRight={<IconArrowRight size={16} />} title="Next (→)" data-testid="guide-next">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function ResumeButton({ size = 'md', short }: { size?: 'sm' | 'md'; short?: boolean }) {
  const tour = useTour();
  const label = tour.status === 'idle' ? (short ? 'Start' : 'Start the presentation') : tour.finished ? (short ? 'Replay' : 'Replay the presentation') : short ? 'Resume' : 'Resume presentation';
  return (
    <Button
      variant="primary"
      size={size}
      icon={<IconPlay size={14} />}
      data-testid="guide-resume"
      onClick={() => {
        if (tour.status === 'idle') tour.start();
        else if (tour.finished) tour.restart();
        else tour.resume();
      }}
    >
      {label}
    </Button>
  );
}

function ExploreBody({ nudge, canShow, onShowMe, onMinimize, sheet }: { nudge: ReturnType<typeof nudgeFor>; canShow: boolean; onShowMe: () => void; onMinimize: () => void; sheet: boolean }) {
  const tour = useTour();
  const left = tour.status === 'explore' && !tour.finished ? tour.step.chapter : null;
  const where: ReactNode = left ? (
    <>
      You left at chapter {chapterById(left).part}: {chapterById(left).title}
    </>
  ) : tour.finished ? (
    'You finished it. Everything is unlocked.'
  ) : (
    `${CHAPTERS.length} chapters, about ${Math.round(CHAPTERS.reduce((a, c) => a + c.targetSec, 0) / 60)} minutes`
  );
  return (
    <div className="t-guide__grid">
      {sheet ? null : (
        <div className="t-guide__meta">
          <span className="t-guide__mode">Try it</span>
          <span className="t-guide__count">{where}</span>
          <span className="t-guide__spacer" />
          <ChapterPicker
            current={left}
            trigger={
              <Button variant="ghost" size="sm" icon={<IconMenu size={14} />} data-testid="guide-chapters" aria-label={`All ${CHAPTERS.length} chapters of the presentation`}>
                Chapters
              </Button>
            }
          />
          <IconButton size="sm" label="Minimize" tooltip={false} title="Minimize" icon={<IconMinus size={14} />} onClick={onMinimize} data-testid="guide-minimize" />
        </div>
      )}
      <div className="t-guide__main">
        {sheet ? <span className="t-guide__try">Try it</span> : null}
        <h2 className="t-guide__title t-guide__title--sm" data-testid="guide-title">
          {nudge.title}
        </h2>
        <p className="t-guide__text" data-testid="guide-nudge">
          {nudge.body}
          {canShow ? (
            <>
              {' '}
              <button type="button" className="t-guide__showme t-guide__showme--inline" onClick={onShowMe} data-testid="guide-showme">
                Show me
              </button>
            </>
          ) : null}
        </p>
      </div>
      <div className="t-guide__nav">
        {sheet ? <span className="t-guide__left">{where}</span> : null}
        <ResumeButton size={sheet ? 'sm' : 'md'} />
      </div>
    </div>
  );
}
