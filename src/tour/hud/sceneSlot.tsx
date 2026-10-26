/**
 * Dock for the walkthrough controls on a scene (the chapter menu, and the timer while
 * presenting). The scene's top bar renders the slot at its right end, after "4 of 18", and the
 * HUD portals into it, so the controls sit in the bar's own flow instead of floating over it.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';

let slot: HTMLElement | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The scene top bar's tools slot, or null while no scene is on screen. */
export function useSceneToolsSlot(): HTMLElement | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  return slot;
}

export function SceneToolsSlot() {
  const mine = useRef<HTMLSpanElement | null>(null);
  const ref = useCallback((el: HTMLSpanElement | null) => {
    if (el) {
      mine.current = el;
      slot = el;
    } else {
      if (slot === mine.current) slot = null;
      mine.current = null;
    }
    notify();
  }, []);
  return <span ref={ref} className="n-topbar__tools" data-scene-tools="" />;
}
