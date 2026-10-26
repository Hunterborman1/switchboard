import type { ComponentType } from 'react';
import type { SceneId } from '../../tour/engine/types';
import { Signal } from './Signal';
import { Jobs } from './Jobs';
import { Built } from './Built';
import { Platform } from './Platform';
import { Hood } from './Hood';
import { Trust } from './Trust';
import { Future } from './Future';
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
  jobs: { component: Jobs },
  built: { component: Built },
  platform: { component: Platform, exitLabel: 'Open the product' },
  hood: { component: Hood },
  trust: { component: Trust },
  future: { component: Future, exitLabel: 'Scorecard' },
  scorecard: { component: ScorecardScene, bare: true },
};
