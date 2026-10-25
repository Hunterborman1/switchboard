import { useEffect, useRef, useState } from 'react';
import type { AnchorId } from '../anchors';

export type AnchorState = { el: HTMLElement | null; status: 'none' | 'waiting' | 'found' | 'missing' };

const sel = (id: string) => `[data-tour="${CSS.escape(id)}"]`;

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function findAnchor(id: AnchorId): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel(id)));
  return all.find(visible) ?? null;
}

/** First visible anchor in priority order (a step can name a better target and a fallback). */
export function findFirstAnchor(ids: readonly AnchorId[]): HTMLElement | null {
  for (const id of ids) {
    const el = findAnchor(id);
    if (el) return el;
  }
  return null;
}

/**
 * Waits for `[data-tour="id"]` (the first of `ids` that is visible) to mount (MutationObserver + a light poll for elements that
 * become visible without a DOM mutation). After `timeoutMs` the status becomes 'missing' so
 * the callout can fall back to the centre with a Continue button. Keeps tracking: if the
 * element appears later, it switches back to 'found'. A higher-priority id that appears
 * later takes over (e.g. the edit form replacing the Edit button).
 */
export function useAnchor(ids: readonly AnchorId[], timeoutMs = 5000, key = ''): AnchorState {
  const idKey = ids.join('|');
  const [state, setState] = useState<AnchorState>({ el: null, status: ids.length ? 'waiting' : 'none' });
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const list = idKey ? (idKey.split('|') as AnchorId[]) : [];
    if (!list.length) {
      elRef.current = null;
      setState({ el: null, status: 'none' });
      return;
    }
    let done = false;
    let timedOut = false;
    const check = () => {
      const el = findFirstAnchor(list);
      if (el && el !== elRef.current) {
        elRef.current = el;
        setState({ el, status: 'found' });
      } else if (!el && elRef.current && !elRef.current.isConnected) {
        elRef.current = null;
        setState({ el: null, status: timedOut ? 'missing' : 'waiting' });
      } else if (!el && elRef.current && !visible(elRef.current)) {
        elRef.current = null;
        setState({ el: null, status: timedOut ? 'missing' : 'waiting' });
      }
    };
    elRef.current = null;
    setState({ el: null, status: 'waiting' });
    check();
    const mo = new MutationObserver(() => {
      if (!done) check();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tour', 'hidden', 'style', 'class', 'open'] });
    const poll = window.setInterval(check, 400);
    const t = window.setTimeout(() => {
      timedOut = true;
      if (!elRef.current) setState({ el: null, status: 'missing' });
    }, timeoutMs);
    return () => {
      done = true;
      mo.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(t);
    };
  }, [idKey, timeoutMs, key]);

  return state;
}

export type Box = { x: number; y: number; w: number; h: number };

/** Tracks an element's viewport rect every frame it changes (resize, scroll, layout animation). */
export function useRect(el: HTMLElement | null, pad = 8): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!el) {
      setBox(null);
      return;
    }
    let raf = 0;
    let last = '';
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const r = el.getBoundingClientRect();
      const b = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
      const k = `${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}|${Math.round(b.h)}`;
      if (k !== last) {
        last = k;
        setBox(b);
      }
    };
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    // rAF loop is cheap (one getBoundingClientRect) and catches layout animation; it stops when hidden.
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [el, pad]);
  return box;
}
