/**
 * Product-layer overlay: spotlight + callout. Renders only on product steps while the tour
 * is active.
 *
 * Placement rule: the callout never sits on top of the thing it is pointing at. It tries the
 * step's preferred side, then below, above, right and left, and takes the first side with
 * room for the whole card. If no side has room (a full-width or very tall target), it floats
 * as a solid card in the corner of the content area that covers the least of the target,
 * never over the product's left rail. Phones get a bottom (or top) sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { arrow as arrowMw, autoUpdate, FloatingArrow, offset, shift, size, useFloating, type Placement } from '@floating-ui/react';
import { useMediaQuery } from '../../narrative/hooks';
import type { AnchorId } from '../anchors';
import { TourCallout } from './Callout';
import { Spotlight } from './Spotlight';
import { resolveTarget, useTour } from './TourProvider';
import { findAnchor, useAnchor, useRect, type Box } from './useAnchor';
import { floatPosition, GAP, HEADER, MARGIN, MAX_W, MIN_W, PILL_CLEAR, planPlacement, SIDE_MIN_W, sideOf } from './placement';
import { awaitingUser } from './types';

function useHighlights(ids: AnchorId[] | undefined): Box[] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!ids?.length) {
      setBoxes([]);
      return;
    }
    let raf = 0;
    let last = '';
    const loop = () => {
      const out: Box[] = [];
      for (const id of ids) {
        const el = findAnchor(id);
        if (el) {
          const r = el.getBoundingClientRect();
          out.push({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 });
        }
      }
      const k = out.map((b) => `${b.x | 0},${b.y | 0},${b.w | 0},${b.h | 0}`).join(';');
      if (k !== last) {
        last = k;
        setBoxes(out);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ids]);
  return boxes;
}

function useIdle(ms: number, key: string): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    let t = window.setTimeout(() => setIdle(true), ms);
    const reset = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('pointermove', reset, { passive: true });
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointermove', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [ms, key]);
  return idle;
}

/** Left edge of the product's content column (right of the app rail), or 0 inside a dialog. */
function contentLeft(target: HTMLElement | null): number {
  if (target?.closest('[role="dialog"], dialog')) return 0;
  const main = document.getElementById('main-content');
  if (!main) return 0;
  const l = main.getBoundingClientRect().left;
  return l > 0 && l < window.innerWidth / 2 ? l : 0;
}

export function TourOverlay() {
  const tour = useTour();
  const { step, status } = tour;
  const active = status === 'active' && step.kind === 'product' && !tour.menuOpen;
  if (!active) return null;
  return createPortal(<OverlayInner />, document.body);
}

function OverlayInner() {
  const tour = useTour();
  const { step, ctx } = tour;
  const isSheet = useMediaQuery('(max-width: 720px)');
  const targets = resolveTarget(step, ctx);
  const anchor = useAnchor(targets, step.anchorTimeoutMs ?? 6000, step.id);
  const liveBox = useRect(anchor.el, 8);
  const lastBox = useRef<Box | null>(null);
  const lastBoxPath = useRef<string | null>(null);
  if (liveBox) {
    lastBox.current = liveBox;
    lastBoxPath.current = ctx.pathname;
  }
  // keep the hole where it was while the next anchor mounts, so it springs instead of blinking
  const [holdLast, setHoldLast] = useState(true);
  useEffect(() => {
    setHoldLast(true);
    const t = window.setTimeout(() => setHoldLast(false), 650);
    return () => window.clearTimeout(t);
  }, [step.id]);
  // Only on the same page: after a route change the old hole would frame a loading skeleton,
  // so the spotlight waits (fully dimmed) for the new page's anchor, which mounts with its data.
  const box = liveBox ?? (anchor.status === 'waiting' && holdLast && lastBoxPath.current === ctx.pathname ? lastBox.current : null);
  const highlights = useHighlights(step.highlight);
  const idle = useIdle(6000, step.id);
  const [shakeKey, setShakeKey] = useState(0);
  const arrowRef = useRef<SVGSVGElement>(null);

  // Measured callout height (the card's natural height, before any max-height cap).
  const [cardH, setCardH] = useState(260);
  const cardHRef = useRef(cardH);
  cardHRef.current = cardH;
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!node) return;
    const card = node.querySelector<HTMLElement>('.t-callout__card') ?? node;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(card.scrollHeight);
      if (h > 0) setCardH((prev) => (Math.abs(prev - h) > 4 ? h : prev));
    });
    ro.observe(card);
    roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  const waitingOnUser = awaitingUser(step, ctx);
  const interact = step.interact ?? (waitingOnUser ? 'target' : 'none');
  const missing = targets.length > 0 && anchor.status === 'missing';

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeLeft = contentLeft(anchor.el);
  const pref = sideOf(step.placement);
  // Beside a dialog the gutter is all the room there is, so the narrower card is allowed there only.
  const minSideW = anchor.el?.closest('[role="dialog"]') ? MIN_W : SIDE_MIN_W;
  const plan = liveBox && !isSheet ? planPlacement(liveBox, pref, cardH, vw, vh, safeLeft, minSideW) : null;
  const anchored = !!anchor.el && !isSheet && !!plan;
  const floating = !!anchor.el && !isSheet && !plan && !!liveBox;

  // While the anchor mounts, hold the callout ~0.7s (avoids a centre→target jump), then show it centred.
  const [patience, setPatience] = useState(false);
  useEffect(() => {
    setPatience(false);
    const t = window.setTimeout(() => setPatience(true), 700);
    return () => window.clearTimeout(t);
  }, [step.id]);

  // Bring the target into view. If it would leave room for the callout below it when parked
  // under the header, park it there; otherwise centre it (or align its top when it's tall).
  useEffect(() => {
    if (!anchor.el) return;
    const el = anchor.el;
    const ensure = (smooth: boolean) => {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight;
      const need = cardHRef.current + GAP + MARGIN;
      const fitsUnder = r.height + HEADER + 8 + need <= h;
      const offscreen = r.top < HEADER - 8 || r.bottom > h - 24;
      const left = contentLeft(el);
      const box = { x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 };
      const narrowOk = el.closest('[role="dialog"]') ? MIN_W : SIDE_MIN_W;
      const noRoom = window.innerWidth > 720 && !planPlacement(box, pref, cardHRef.current, window.innerWidth, h, left, narrowOk);
      const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
      if ((offscreen || noRoom) && (fitsUnder || r.height > h - HEADER - 40)) {
        const prev = el.style.scrollMarginTop;
        el.style.scrollMarginTop = `${HEADER + 12}px`;
        el.scrollIntoView({ block: 'start', behavior });
        el.style.scrollMarginTop = prev;
      } else if (offscreen) {
        el.scrollIntoView({ block: 'center', behavior });
      }
    };
    ensure(true);
    const timers = [450, 1200].map((ms) => window.setTimeout(() => ensure(false), ms));
    if (waitingOnUser && interact !== 'none') {
      const f = anchor.el.matches('button, a, input, select, textarea, [tabindex]') ? anchor.el : anchor.el.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      window.setTimeout(() => f?.focus({ preventScroll: true }), 80);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [anchor.el, waitingOnUser, interact, pref]);

  useEffect(() => setShakeKey(0), [step.id]);
  useEffect(() => {
    const nudge = () => setShakeKey((k) => k + 1);
    document.addEventListener('sl-tour-nudge', nudge);
    return () => document.removeEventListener('sl-tour-nudge', nudge);
  }, []);

  const placement: Placement = plan ? (step.placement && sideOf(step.placement) === plan.side ? step.placement : plan.side) : 'bottom';
  const { refs, floatingStyles, context, placement: finalPlacement } = useFloating({
    placement,
    strategy: 'fixed',
    elements: { reference: anchored ? anchor.el : null },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(GAP),
      shift({ padding: { left: safeLeft + 12, right: 12, top: 12, bottom: PILL_CLEAR } }),
      size({
        padding: { top: 12, right: 12, left: 12, bottom: PILL_CLEAR },
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(180, availableHeight)}px`;
        },
      }),
      arrowMw({ element: arrowRef, padding: 18 }),
    ],
  });

  const mode = isSheet ? 'sheet' : anchored ? 'anchored' : floating ? 'float' : 'center';
  // On phones the callout is a sheet; if the target sits in the lower half, the sheet goes to the top.
  const sheetTop = mode === 'sheet' && !!liveBox && liveBox.y + liveBox.h / 2 > vh * 0.5;
  const floatW = Math.min(MAX_W, vw - safeLeft - MARGIN * 2);
  const floatPos = mode === 'float' ? floatPosition(liveBox, floatW, Math.min(cardH, vh - HEADER - MARGIN * 2), vw, vh, safeLeft, step.floatCorner) : null;
  const style = useMemo<CSSProperties | undefined>(() => {
    if (mode === 'anchored') return { ...floatingStyles, width: plan?.width };
    if (mode === 'float' && floatPos) return { left: floatPos.left, top: floatPos.top, width: floatW, maxHeight: vh - floatPos.top - MARGIN };
    if (sheetTop) return { top: 96, bottom: 'auto' };
    return undefined;
  }, [mode, floatingStyles, plan?.width, floatPos?.left, floatPos?.top, floatW, vh, sheetTop]);

  const setFloating = refs.setFloating;
  const calloutRef = useCallback(
    (node: HTMLDivElement | null) => {
      setFloating(node);
      measureRef(node);
    },
    [setFloating, measureRef],
  );

  return (
    <>
      <Spotlight box={box} interact={interact} hint={idle && waitingOnUser} onBlocked={() => setShakeKey((k) => k + 1)} highlights={highlights} />
      {/* while waiting for an anchor, hold the callout back for a beat to avoid a centre→target jump */}
      {(anchor.status !== 'waiting' || targets.length === 0 || patience) && (
        <TourCallout
          mode={mode}
          missing={missing}
          floatingRef={calloutRef}
          style={style}
          shakeKey={shakeKey}
          arrow={mode === 'anchored' ? <FloatingArrow ref={arrowRef} context={context} width={16} height={8} fill="#FFFFFF" stroke="#E3E6E3" strokeWidth={1} data-placement={finalPlacement} /> : null}
        />
      )}
    </>
  );
}
