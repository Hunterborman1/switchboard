import { createContext, useContext } from 'react';

/**
 * The walkthrough's pacing hint for the product. While a tour step with `pace: 'slow'` is
 * on screen, `slow` is true and `stepRevealMs` is how long the Run view should hold each
 * pipeline step's reveal so the narration can keep up. Outside the tour: `active: false`.
 *
 * Product usage: `const pace = useTourPace(); const hold = pace.slow ? pace.stepRevealMs : 0;`
 */
export type TourPace = {
  active: boolean;
  slow: boolean;
  /** Minimum ms the Run view should spend revealing each step while slow. */
  stepRevealMs: number;
  /** Current walkthrough step id (null when no tour is running). */
  stepId: string | null;
};

export const DEFAULT_PACE: TourPace = { active: false, slow: false, stepRevealMs: 0, stepId: null };

export const TourPaceContext = createContext<TourPace>(DEFAULT_PACE);

export function useTourPace(): TourPace {
  return useContext(TourPaceContext);
}
