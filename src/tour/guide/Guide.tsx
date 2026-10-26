/**
 * The Guide: one persistent box on every Switchboard and Agent Ops page.
 *
 * - Presentation mode (the tour is on a product step): the chapter and its picker, the step's
 *   title and why, "How this works", a "Your turn" line when the step waits for the viewer (with
 *   "Show me"), Back / Next (or "Skip this step"), and "Explore on your own".
 * - Explore mode (after leaving the presentation, after the scorecard, or opening the product
 *   from the hub): a nudge for whatever page is open ("Try it: …"), "Show me", and "Resume
 *   presentation", which returns to the step they left (or starts from the beginning).
 *
 * It never blocks the product: no scrim. The step's target gets a calm ring and is scrolled into
 * the part of the page the Guide leaves free; the Guide then takes the first corner that covers
 * neither the target, an open dialog nor a page's sticky action bar (src/tour/guide/dock.ts),
 * folding to a compact bar or a pill when no corner is free. Desktop: bottom-right, 380px. Phones
 * (≤ 900px): a bottom sheet.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { bandFor, chooseDock, GUIDE_W, scrollDelta, sheetPlan, type Dock, type GuideSize, type Rect, type Viewport } from './dock';
import { nudgeFor } from './nudges';

const MIN_KEY = 'sl-guide-min';
const SHEET_QUERY = '(max-width: 900px)';
const SHEET_BAR_H = 52;
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
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    top,
    left: l > 0 && l < window.innerWidth / 2 ? l : 0,
  };
}

const rectOf = (el: Element, pad = 6): Rect => {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - pad,
    y: r.top - pad,
    w: r.width + pad * 2,
    h: r.height + pad * 2,
  };
};

/** Open product dialogs and drawers (never the Guide's own popovers). */
function openObstacles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(OBSTACLES)).filter((el) => {
    if (el.closest('[data-tour-ui]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** Bottom-sticky action bars on screen (the review's decision bar): the Guide never covers their controls. */
function stickyBars(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ds-card__footer')).filter((el) => {
    if (el.closest('[data-tour-ui]')) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' || cs.bottom === 'auto') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
}

/** Everything the Guide must leave uncovered besides its target. */
const avoidRects = (exclude?: HTMLElement | null): Rect[] => [
  ...openObstacles()
    .filter((o) => !exclude || !o.contains(exclude))
    .map((o) => rectOf(o, 0)),
  ...stickyBars().map((b) => rectOf(b, 0)),
];

/** Scroll `el` (in whatever scrolls it) so it sits inside the band, minimally. */
function scrollIntoBand(el: HTMLElement, band: { top: number; bottom: number }, smooth: boolean) {
  const prevT = el.style.scrollMarginTop;
  const prevB = el.style.scrollMarginBottom;
  const r = el.getBoundingClientRect();
  const tall = r.height + 12 > band.bottom - band.top;
  el.style.scrollMarginTop = `${Math.max(0, band.top + 6)}px`;
  el.style.scrollMarginBottom = `${Math.max(0, window.innerHeight - band.bottom + 6)}px`;
  el.scrollIntoView({
    block: tall ? 'start' : 'nearest',
    inline: 'nearest',
    behavior: smooth ? 'smooth' : 'auto',
  });
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

/** "Step 2 of 3" within the chapter, counted along the main path (a branch step counts as its neighbour). */
function stepOfChapter(step: Step): { n: number; of: number } {
  const main = chapterSteps(step.chapter);
  let i = main.indexOf(step.id);
  if (i < 0) {
    const order = STEPS.filter((s) => s.chapter === step.chapter).map((s) => s.id);
    i = Math.max(0, order.slice(0, Math.max(0, order.indexOf(step.id))).filter((id) => main.includes(id)).length - 1);
  }
  return { n: i + 1, of: Math.max(1, main.length) };
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

  // ------------------------------------------------------------------ where the Guide sits
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullH, setFullH] = useState(260);
  const fullHRef = useRef(fullH);
  fullHRef.current = fullH;
  const [dock, setDock] = useState<Dock>('br');
  const [autoSize, setAutoSize] = useState<GuideSize>('full');
  const [width, setWidth] = useState(GUIDE_W);
  const [sheetFold, setSheetFold] = useState(false);
  const size: GuideSize = userMin ? 'min' : autoSize;
  const elRef = useRef<HTMLElement | null>(null);
  elRef.current = anchor.el;

  /** Pick the corner (or the fold) from where everything is now. Never scrolls. */
  // The viewer opened the whole Guide on purpose: leave it open (and where it is) until the next step.
  const keptOpen = useRef(false);
  useEffect(() => {
    keptOpen.current = false;
  }, [anchorKey]);
  const placeGuide = useCallback(() => {
    const el = elRef.current;
    const vp = viewport();
    const obs = openObstacles();
    document.documentElement.style.setProperty('--sl-content-left', `${Math.round(vp.left)}px`);
    if (window.matchMedia(SHEET_QUERY).matches) {
      // Phones: a dialog over the page folds the sheet to its bar; so does a target taller than the space above it.
      const fold = !keptOpen.current && (obs.length > 0 || (!!el && sheetPlan(rectOf(el), fullHRef.current, SHEET_BAR_H, vp).fold));
      setSheetFold(fold);
      return;
    }
    if (keptOpen.current) return;
    const choice = chooseDock(el ? rectOf(el) : null, [...obs.map((o) => rectOf(o, 0)), ...stickyBars().map((b) => rectOf(b, 0))], fullHRef.current, vp);
    setDock(choice.dock);
    setAutoSize(choice.size);
    setWidth(choice.width);
  }, []);

  /** Bring the target into the part of the page the Guide leaves free, then place the Guide. */
  const bringIntoView = useCallback(
    (smooth: boolean) => {
      const el = elRef.current;
      if (!el) {
        placeGuide();
        return;
      }
      // Inside a dialog (the file picker): only its own list scrolls; bring the row fully into view there.
      if (el.closest(OBSTACLES)) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
        placeGuide();
        return;
      }
      const vp = viewport();
      const T = rectOf(el);
      const band = window.matchMedia(SHEET_QUERY).matches ? sheetPlan(T, fullHRef.current, SHEET_BAR_H, vp).band : bandFor(T, fullHRef.current, vp, avoidRects(el)).band;
      // A bottom-sticky target (the review's decision bar) sticks to the viewport's bottom edge,
      // under the Guide, until its container ends: scroll the container's end into the band instead.
      const sticky = stickyBottom(el);
      if (sticky?.parentElement) {
        const box = rectOf(sticky.parentElement, 0);
        if (box.y + box.h > band.bottom) scrollEndIntoBand(sticky.parentElement, band, smooth);
      } else if (scrollDelta(T, band) !== 0) scrollIntoBand(el, band, smooth);
      placeGuide();
    },
    [placeGuide],
  );

  // A new target (a new step, or "Show me"): bring it into view, then settle the Guide's corner.
  // Pages fill in as their data arrives, so the target can move: keep correcting for a moment,
  // unless the viewer has started scrolling themselves.
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

  // Keep the corner right as the page changes under it (dialogs opening, content growing, resizes).
  useEffect(() => {
    const t = window.setInterval(placeGuide, 700);
    window.addEventListener('resize', placeGuide);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', placeGuide);
    };
  }, [placeGuide]);

  // Measure the full-size panel; publish the Guide's footprint for page padding and toasts.
  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => {
      const h = Math.ceil(node.getBoundingClientRect().height);
      if (size === 'full' && !isSheet) setFullH((prev) => (Math.abs(prev - h) > 4 ? h : prev));
      if (isSheet && !sheetFold) setFullH((prev) => (Math.abs(prev - h) > 4 ? h : prev));
      root.style.setProperty('--sl-guide-h', `${h}px`);
      root.dataset.slGuide = isSheet ? 'sheet' : size === 'min' ? 'min' : dock;
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(node);
    return () => ro.disconnect();
  }, [size, dock, isSheet, sheetFold, step.id, present]);
  useEffect(
    () => () => {
      const root = document.documentElement;
      delete root.dataset.slGuide;
      root.style.removeProperty('--sl-guide-h');
      root.style.removeProperty('--sl-content-left');
    },
    [],
  );

  const showMe = useCallback(() => {
    if (!present) {
      if (nudge.show) setShowId(nudge.show);
    }
    setFlashKey((k) => k + 1);
    if (isSheet) setSheetFold(false);
    window.setTimeout(() => bringIntoView(!calm), present ? 0 : 60);
  }, [present, nudge.show, isSheet, bringIntoView, calm]);

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
  const sheetOpen = isSheet && !userMin && !sheetFold;
  const cls = [
    't-guide',
    'sl-n-portal',
    isSheet ? 't-guide--sheet' : `t-guide--${dock}`,
    isSheet ? (sheetOpen ? 'is-open' : 'is-folded') : `t-guide--${size}`,
    present ? 'is-present' : 'is-explore',
  ].join(' ');

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
        data-size={isSheet ? (sheetOpen ? 'sheet' : 'bar') : size}
        data-step={present ? step.id : undefined}
        role="region"
        aria-label={present ? 'Presentation' : 'Guide'}
        style={!isSheet && size !== 'min' && width < GUIDE_W ? { width } : undefined}
      >
        {isSheet ? (
          <SheetBar
            open={sheetOpen}
            present={present}
            waiting={waiting}
            onToggle={() => {
              if (sheetOpen) setMinimized(true);
              else {
                keptOpen.current = true;
                setMinimized(false);
                setSheetFold(false);
              }
            }}
            title={present ? (waiting && typeof step.waitFor === 'object' && step.waitFor.hint ? `Your turn: ${step.waitFor.hint}` : resolveCopy(step.title, ctx)) : nudge.title}
          />
        ) : null}
        {size === 'min' && !isSheet ? (
          <button
            type="button"
            className="t-guide__pill"
            onClick={() => {
              keptOpen.current = true;
              setMinimized(false);
              setAutoSize('full');
            }} data-testid="guide-pill" aria-label={present ? 'Show the presentation guide' : 'Show the guide'}>
            <span className="t-guide__dot" data-on={present ? 'true' : undefined} aria-hidden="true" />
            Guide
          </button>
        ) : (size === 'compact' || size === 'bar') && !isSheet ? (
          <Compact rich={size === 'compact'} present={present} waiting={waiting} onExpand={() => {
              keptOpen.current = true;
              setAutoSize('full');
            }} primaryRef={primaryRef} nudge={nudge} />
        ) : !isSheet || sheetOpen ? (
          present ? (
            <PresentBody
              step={step}
              ctx={ctx}
              waiting={waiting}
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

/**
 * When no corner has room for the whole Guide: compact (the title and the why, with the action)
 * or a one-line bar (what to do now). The expand button shows everything, over the page.
 */
function Compact({
  rich,
  present,
  waiting,
  onExpand,
  primaryRef,
  nudge,
}: {
  rich: boolean;
  present: boolean;
  waiting: boolean;
  onExpand: () => void;
  primaryRef: React.RefObject<HTMLButtonElement>;
  nudge: ReturnType<typeof nudgeFor>;
}) {
  const tour = useTour();
  const { step, ctx } = tour;
  const hint = waiting && typeof step.waitFor === 'object' ? step.waitFor.hint : undefined;
  const title = present ? resolveCopy(step.title, ctx) : nudge.title;
  const body = present ? resolveCopy(step.body, ctx) : nudge.body;
  return (
    <div className={`t-guide__compact${rich ? ' t-guide__compact--rich' : ''}`} data-testid="guide-compact">
      <span className="t-guide__compacttext">
        <span className="t-guide__eyebrow">{present ? (hint ? `Your turn: ${hint}` : chapterLabel(step.chapter)) : 'Try it'}</span>
        <span className="t-guide__compacttitle" data-testid="guide-title">
          {present && hint && !rich ? sentence(hint) : title}
        </span>
        {rich ? <span className="t-guide__compactbody">{body}</span> : null}
      </span>
      {present ? (
        waiting ? (
          <Button size="sm" variant="ghost" onClick={tour.skip}>
            Skip this step
          </Button>
        ) : (
          <Button ref={primaryRef} size="sm" variant="primary" onClick={() => tour.next() || tour.skip()} disabled={!tour.isReady}>
            Next
          </Button>
        )
      ) : (
        <ResumeButton size="sm" short />
      )}
      <IconButton size="sm" label="Show the whole guide" tooltip={false} title="Show the whole guide" icon={<IconChevronUp size={14} />} onClick={onExpand} />
    </div>
  );
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Head({ picker, onMinimize }: { picker: React.ReactNode; onMinimize: () => void }) {
  return (
    <div className="t-guide__head t-guide__head--row">
      {picker}
      <span className="t-guide__spacer" />
      <IconButton size="sm" label="Minimize" tooltip={false} title="Minimize" icon={<IconMinus size={14} />} onClick={onMinimize} data-testid="guide-minimize" />
    </div>
  );
}

function PresentBody({
  step,
  ctx,
  waiting,
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
  waiting: boolean;
  missing: boolean;
  onShowMe: () => void;
  canShow: boolean;
  onMinimize: () => void;
  primaryRef: React.RefObject<HTMLButtonElement>;
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
  const hint = waiting && typeof step.waitFor === 'object' ? step.waitFor.hint : undefined;
  const readyLabel = step.readyLabel ? resolveCopy(step.readyLabel, ctx) : 'Working…';
  const lastOfChapter = pos.n === pos.of;
  const cp = lastOfChapter && step.checkpoint ? step.checkpoint(ctx) : null;
  return (
    <>
      {sheet ? null : (
        <Head
          onMinimize={onMinimize}
          picker={
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
          }
        />
      )}
      <div className="t-guide__body">
        <motion.div key={step.id} initial={calm ? { opacity: 0 } : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}>
          <span className="t-guide__count">
            Step {pos.n} of {pos.of}
          </span>
          <h2 className="t-guide__title" data-testid="guide-title">
            {title}
          </h2>
          <p className="t-guide__text">{body}</p>
          {!tour.isReady && !waiting && !missing && !(actions && actions.length > 0) ? (
            <p className="t-guide__wait" role="status">
              <span className="ds-spinner" aria-hidden="true" />
              {readyLabel}
            </p>
          ) : null}
          {missing ? <p className="t-guide__missing">That part of the page isn’t on screen right now. Carry on when you’re ready.</p> : null}
          {hint ? (
            <p className="t-guide__turn" role="status" data-testid="guide-turn">
              <span className="t-guide__turnk">Your turn:</span> <span>{hint}</span>
              {canShow ? (
                <button type="button" className="t-guide__showme" onClick={onShowMe}>
                  Show me
                </button>
              ) : null}
            </p>
          ) : null}
          {moreText ? (
            <div className="t-guide__more">
              <button type="button" className="t-guide__morebtn" onClick={() => setMore((v) => !v)} aria-expanded={more}>
                <IconChevronRight size={14} className="t-guide__chev" data-open={more ? 'true' : 'false'} />
                How this works
              </button>
              <AnimatePresence initial={false}>
                {more ? (
                  <motion.p
                    className="t-guide__moretext"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      duration: calm ? 0 : 0.18,
                      ease: [0.2, 0, 0, 1],
                    }}
                  >
                    {moreText}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
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
      </div>
      <div className="t-guide__foot t-guide__foot--row">
        <Button variant="ghost" size="sm" className="t-guide__exitbtn" onClick={tour.exit} data-testid="guide-explore">
          Explore on your own
        </Button>
        <span className="t-guide__spacer" />
        {tour.canGoBack ? <IconButton size="sm" variant="ghost" label="Back" title="Back (←)" tooltip={false} icon={<IconArrowLeft size={14} />} onClick={tour.back} data-testid="guide-back" /> : null}
        {actions && actions.length > 0 && tour.isReady ? (
          actions.map((a, i) => (
            <Button
              key={a.label}
              ref={a.variant === 'primary' || i === actions.length - 1 ? primaryRef : undefined}
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
        ) : waiting || (!tour.isReady && !missing) ? (
          <Button variant="secondary" size="sm" onClick={tour.skip} data-testid="guide-skip">
            Skip this step
          </Button>
        ) : (
          <Button ref={primaryRef} variant="primary" size="sm" onClick={tour.skip} iconRight={<IconArrowRight size={14} />} title="Next (→)" data-testid="guide-next">
            Next
          </Button>
        )}
      </div>
    </>
  );
}

function ResumeButton({ size = 'md', block, short }: { size?: 'sm' | 'md'; block?: boolean; short?: boolean }) {
  const tour = useTour();
  const label = tour.status === 'idle' ? (short ? 'Start' : 'Start the presentation') : tour.finished ? (short ? 'Replay' : 'Replay the presentation') : short ? 'Resume' : 'Resume presentation';
  return (
    <Button
      variant="primary"
      size={size}
      block={block}
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
  return (
    <>
      {sheet ? null : (
        <div className="t-guide__head t-guide__head--row">
          <span className="t-guide__mode">Guide</span>
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
      <div className="t-guide__body">
        <span className="t-guide__try">Try it</span>
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
      <div className="t-guide__foot t-guide__foot--row">
        <ResumeButton size="sm" />
        <span className="t-guide__left">
          {left ? (
            <>
              You left at chapter {chapterById(left).part}: {chapterById(left).title}
            </>
          ) : tour.finished ? (
            'You finished it. Everything is unlocked.'
          ) : (
            `${CHAPTERS.length} chapters, about ${Math.round(CHAPTERS.reduce((a, c) => a + c.targetSec, 0) / 60)} minutes`
          )}
        </span>
      </div>
    </>
  );
}
