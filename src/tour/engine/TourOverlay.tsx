/**
 * Product-layer overlay: spotlight + anchored callout. Renders only on product steps
 * while the tour is active. Falls back to a centred callout when the anchor never mounts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { arrow as arrowMw, autoUpdate, flip, FloatingArrow, offset, shift, size, useFloating } from '@floating-ui/react';
import { useMediaQuery } from '../../narrative/hooks';
import type { AnchorId } from '../anchors';
import { TourCallout } from './Callout';
import { Spotlight } from './Spotlight';
import { useTour } from './TourProvider';
import { findAnchor, useAnchor, useRect, type Box } from './useAnchor';

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

export function TourOverlay() {
  const tour = useTour();
  const { step, status } = tour;
  const active = status === 'active' && step.kind === 'product' && !tour.menuOpen;
  if (!active) return null;
  return createPortal(<OverlayInner />, document.body);
}

function OverlayInner() {
  const tour = useTour();
  const { step } = tour;
  const isSheet = useMediaQuery('(max-width: 720px)');
  const anchor = useAnchor(step.target, step.anchorTimeoutMs ?? 6000, step.id);
  const liveBox = useRect(anchor.el, 8);
  const lastBox = useRef<Box | null>(null);
  if (liveBox) lastBox.current = liveBox;
  // keep the hole where it was while the next anchor mounts, so it springs instead of blinking
  const box = liveBox ?? (anchor.status === 'waiting' ? lastBox.current : null);
  const highlights = useHighlights(step.highlight);
  const idle = useIdle(6000, step.id);
  const [shakeKey, setShakeKey] = useState(0);
  const arrowRef = useRef<SVGSVGElement>(null);

  const waitingOnUser = !!step.waitFor && step.waitFor !== 'next';
  const interact = step.interact ?? (waitingOnUser ? 'target' : 'none');
  const missing = !!step.target && anchor.status === 'missing';
  // Large targets (a full dialog) leave no room beside them: dock the callout in the free
  // gutter on the left when there is one, otherwise anchor with a height cap.
  const dockWidth = liveBox ? Math.min(320, liveBox.x - 32) : 0;
  const big = !!liveBox && (liveBox.h > window.innerHeight * 0.6 || liveBox.w > window.innerWidth * 0.7);
  const docked = !isSheet && big && dockWidth >= 260;
  const anchored = !!anchor.el && !isSheet && !docked;
  // While the anchor mounts, hold the callout ~0.7s (avoids a centre→target jump), then show it centred.
  const [patience, setPatience] = useState(false);
  useEffect(() => {
    setPatience(false);
    const t = window.setTimeout(() => setPatience(true), 700);
    return () => window.clearTimeout(t);
  }, [step.id]);

  // bring the target into view once
  useEffect(() => {
    if (!anchor.el) return;
    const r = anchor.el.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight - 40) anchor.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (waitingOnUser && interact !== 'none') {
      const f = anchor.el.matches('button, a, input, select, textarea, [tabindex]') ? anchor.el : anchor.el.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      window.setTimeout(() => f?.focus({ preventScroll: true }), 80);
    }
  }, [anchor.el, waitingOnUser, interact]);

  useEffect(() => setShakeKey(0), [step.id]);
  useEffect(() => {
    const nudge = () => setShakeKey((k) => k + 1);
    document.addEventListener('sl-tour-nudge', nudge);
    return () => document.removeEventListener('sl-tour-nudge', nudge);
  }, []);

  const { refs, floatingStyles, context, placement } = useFloating({
    placement: step.placement ?? 'bottom',
    elements: { reference: anchored ? anchor.el : null },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(20),
      flip({ padding: 16, fallbackAxisSideDirection: 'start' }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(180, availableHeight)}px`;
        },
      }),
      arrowMw({ element: arrowRef, padding: 18 }),
    ],
  });

  const mode = isSheet ? 'sheet' : docked ? 'dock' : anchored ? 'anchored' : 'center';
  const style = useMemo(() => (mode === 'anchored' ? floatingStyles : mode === 'dock' ? { width: dockWidth } : undefined), [mode, floatingStyles, dockWidth]);

  return (
    <>
      <Spotlight box={box} interact={interact} hint={idle && waitingOnUser} onBlocked={() => setShakeKey((k) => k + 1)} highlights={highlights} />
      {/* while waiting for an anchor, hold the callout back for a beat to avoid a centre→target jump */}
      {(anchor.status !== 'waiting' || !step.target || patience) && (
        <TourCallout
          mode={mode}
          missing={missing}
          floatingRef={mode === 'anchored' ? refs.setFloating : undefined}
          style={style}
          shakeKey={shakeKey}
          arrow={mode === 'anchored' ? <FloatingArrow ref={arrowRef} context={context} width={16} height={8} fill="rgb(10 35 30 / 0.92)" stroke="rgb(242 245 228 / 0.14)" strokeWidth={1} data-placement={placement} /> : null}
        />
      )}
    </>
  );
}
