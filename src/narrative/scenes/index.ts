import type { ComponentType } from 'react';
import type { SceneId } from '../../tour/engine/types';
import { ColdOpen } from './ColdOpen';
import { BlackHole } from './BlackHole';
import { Why } from './Why';
import { Jtbd } from './Jtbd';
import { States } from './States';
import { Platform } from './Platform';
import { Rollout } from './Rollout';
import { Horizon } from './Horizon';
import { Production } from './Production';
import { ScorecardScene } from './Scorecard';

export type SceneDef = {
  component: ComponentType<{ beat: number; beats: number }>;
  /** Label for the advance button on the last beat. */
  exitLabel?: string;
  bare?: boolean;
};

export const SCENES: Record<SceneId, SceneDef> = {
  'cold-open': { component: ColdOpen },
  'black-hole': { component: BlackHole },
  why: { component: Why },
  jtbd: { component: Jtbd },
  states: { component: States },
  platform: { component: Platform, exitLabel: 'Open the product' },
  rollout: { component: Rollout },
  horizon: { component: Horizon },
  production: { component: Production, exitLabel: 'Scorecard' },
  scorecard: { component: ScorecardScene, bare: true },
};
