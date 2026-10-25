/**
 * Dock for the walkthrough's start/resume pill. Product shells (Signal Loop, Agent Ops)
 * render a slot in their chrome, never over page content:
 *   - "rail": top of the sidebar footer on desktop (compact when the rail is collapsed);
 *   - "bar":  the right end of the mobile launch bar (in the sticky top bar, so it never
 *             covers content, bottom sheets or actions).
 * ResumePill portals into whichever slot fits the current viewport.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type PillPlacement = 'rail' | 'bar';
type SlotEntry = { el: HTMLElement; compact: boolean };

const slots = new Map<PillPlacement, SlotEntry>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Matches the ConsoleShell breakpoint where the rail becomes a drawer and the launch bar shows. */
const MOBILE_QUERY = '(max-width: 760px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return;
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/** The slot the pill should render into right now, or null while no shell has mounted one. */
export function usePillSlot(): SlotEntry | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  const mobile = useIsMobile();
  return slots.get(mobile ? 'bar' : 'rail') ?? null;
}

export function TourPillSlot({ placement, compact = false }: { placement: PillPlacement; compact?: boolean }) {
  const mine = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        mine.current = el;
        slots.set(placement, { el, compact });
      } else {
        if (slots.get(placement)?.el === mine.current) slots.delete(placement);
        mine.current = null;
      }
      notify();
    },
    [placement, compact],
  );
  return <div ref={ref} className={`t-pill-slot t-pill-slot--${placement}${compact ? ' is-compact' : ''}`} data-tour-pill-slot={placement} />;
}
