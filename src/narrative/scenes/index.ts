import type { ComponentType } from 'react';
import type { SceneId } from '../../tour/engine/types';
import { Signal } from './Signal';
import { Real } from './Real';
import { Why } from './Why';
import { Platform } from './Platform';
import { Production } from './Production';
import { ScorecardScene } from './Scorecard';

export type SceneDef = {
  /** Draws the whole scene at once: every part is on screen after one short entrance. */
  component: ComponentType;
  /** Label for the advance button. */
  exitLabel?: string;
  bare?: boolean;
};

export const SCENES: Record<SceneId, SceneDef> = {
  signal: { component: Signal },
  real: { component: Real },
  why: { component: Why },
  platform: { component: Platform, exitLabel: 'Open the product' },
  production: { component: Production, exitLabel: 'Scorecard' },
  scorecard: { component: ScorecardScene, bare: true },
};
