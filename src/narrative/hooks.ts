import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/** True when the viewer asked for reduced motion (or ?motion=reduced for tests). */
export function useCalm(): boolean {
  const prefers = useReducedMotion();
  const forced = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('motion') === 'reduced';
  return Boolean(prefers) || forced;
}

/** Count a number up from `from` to `to`. Reduced motion → jumps straight to the value. */
export function useCountUp(to: number, opts: { duration?: number; from?: number; start?: boolean; decimals?: number } = {}): number {
  const { duration = 600, from = 0, start = true, decimals = 0 } = opts;
  const calm = useCalm();
  const [value, setValue] = useState(calm || !start ? (start ? to : from) : from);
  const raf = useRef(0);
  useEffect(() => {
    if (!start) {
      setValue(from);
      return;
    }
    if (calm || duration <= 0) {
      setValue(to);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      const f = Math.pow(10, decimals);
      setValue(Math.round(v * f) / f);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, from, start, duration, calm, decimals]);
  return value;
}

/** Element size via ResizeObserver. */
export function useSize<T extends Element>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const r = entry.contentRect;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}
