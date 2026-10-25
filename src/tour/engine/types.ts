import type { Placement } from '@floating-ui/react';
import type { RunDetail, EvalRun, Budget, Theme } from '../../shared/contracts';
import type { OverviewReport, AgentRecord, AgentImpact, UsageReport } from '../../shared/platform-contracts';
import type { SignalEvent } from '../../shared/events';
import type { AnchorId } from '../anchors';

export const TOUR_PATHS = ['main', 'clean', 'messy', 'security', 'negative', 'privacy'] as const;
export type TourPath = (typeof TOUR_PATHS)[number];

export const PATH_LABELS: Record<TourPath, string> = {
  main: 'Main story',
  clean: 'Clean notes',
  messy: 'Messy transcript',
  security: 'Injection attempt',
  negative: 'Nothing actionable',
  privacy: 'PHI-heavy call',
};

export type ChapterId =
  | 'cold-open'
  | 'black-hole'
  | 'why'
  | 'jtbd'
  | 'states'
  | 'ch1'
  | 'ch2'
  | 'ch3'
  | 'ch4'
  | 'ch5'
  | 'ch6'
  | 'ch7'
  | 'ch8'
  | 'rollout'
  | 'horizon'
  | 'production'
  | 'scorecard';

export type Chapter = {
  id: ChapterId;
  /** Part number from the plan table (0–15). */
  part: number;
  title: string;
  layer: 'narrative' | 'product' | 'both';
  /** 1–7 for product chapters. */
  productIndex?: number;
  objective: string;
  /** Presenter target in seconds. */
  targetSec: number;
};

export type SceneId =
  | 'cold-open'
  | 'black-hole'
  | 'why'
  | 'jtbd'
  | 'states'
  | 'rollout'
  | 'horizon'
  | 'production'
  | 'scorecard';

export type Counters = {
  approvals: number;
  edits: number;
  rejects: number;
  rulesChanged: number;
  shipped: number;
  promoteAttempts: number;
  promoted: boolean | null;
  redactionToggled: boolean;
  deliveriesOpened: number;
};

export type EvalsData = { latest: EvalRun; history: EvalRun[]; candidate: EvalRun | null };

export type OpsData = {
  overview: OverviewReport | null;
  agent: (AgentRecord & { impact?: AgentImpact }) | null;
  live: UsageReport['live'] | null;
  traceId: string | null;
  logCount: number | null;
};

export type TourCtx = {
  path: TourPath;
  fileId: string | null;
  runId: string | null;
  themeId: string | null;
  explored: TourPath[];
  counters: Counters;
  /** Live RunDetail for ctx.runId (polled by the provider; not persisted). */
  run: RunDetail | null;
  evals: EvalsData | null;
  budget: Budget | null;
  ops: OpsData | null;
  /** A run that has a rejected (ungrounded) quote, for the optional "see a rejected quote" beat. */
  peek: RunDetail | null;
  /** The theme the viewer's insight joined (or the top theme). */
  theme: Theme | null;
  /** Current router pathname (relative to the basename). */
  pathname: string;
  lastEvent: SignalEvent | null;
};

export type Copy = string | ((ctx: TourCtx) => string);

export type WaitFor =
  | 'next'
  | { event: SignalEvent['name']; where?: (e: SignalEvent, ctx: TourCtx) => boolean; hint?: string }
  | { predicate: (ctx: TourCtx) => boolean; hint?: string };

export type StepAction = {
  label: string;
  to: string | ((ctx: TourCtx) => string);
  variant?: 'primary' | 'ghost';
  /** Mutate context before moving (e.g. mark a branch loop). */
  apply?: (ctx: TourCtx) => Partial<TourCtx>;
};

export type CheckpointData = { value: number; prefix?: string; suffix?: string; decimals?: number; label: string; sub?: string };

export type TourApi = {
  next: () => void;
  back: () => void;
  goto: (stepId: string, opts?: { beat?: number; replace?: boolean }) => void;
  setCtx: (patch: Partial<TourCtx>) => void;
};

export type Step = {
  id: string;
  chapter: ChapterId;
  kind: 'scene' | 'product';
  /** Path (relative to the router basename). A function may return null = stay where you are. */
  route?: string | ((ctx: TourCtx) => string | null);
  scene?: SceneId;
  beats?: number;
  /** What to spotlight. A list is a priority order: the first one on screen wins. */
  target?: AnchorId | AnchorId[] | ((ctx: TourCtx) => AnchorId | AnchorId[]);
  /** Extra anchors that get a soft ring (e.g. the recommended file inside the picker). */
  highlight?: AnchorId[];
  placement?: Placement;
  title: Copy;
  /** ≤ 20 words: the WHY. */
  body: Copy;
  /** Detail behind "How this works ›". */
  more?: Copy;
  /** HUD objective override for this step. */
  objective?: Copy;
  waitFor?: WaitFor;
  /** For 'next' steps: Continue is enabled only once this is true. */
  ready?: (ctx: TourCtx) => boolean;
  readyLabel?: Copy;
  next: string | ((ctx: TourCtx) => string);
  actions?: StepAction[] | ((ctx: TourCtx) => StepAction[] | undefined);
  onEnter?: (ctx: TourCtx, api: TourApi) => void;
  /** Ask the product to slow its animations while this step is on. */
  pace?: 'slow' | 'normal';
  /** Chapter-end checkpoint shown when leaving this step into another chapter. */
  checkpoint?: (ctx: TourCtx) => CheckpointData | null;
  /** Where clicks are allowed: just the cutout, everywhere (dimmed), or nowhere. Default: 'target' when waiting on an event, else 'none'. */
  interact?: 'target' | 'all' | 'none';
  /** Anchor wait before falling back to a centred callout. */
  anchorTimeoutMs?: number;
  /** Speaker notes for the presenter view. */
  notes?: string;
};

export type TourStatus = 'idle' | 'active' | 'explore';

export type Persisted = {
  status: TourStatus;
  stepId: string;
  beat: number;
  history: string[];
  ctx: Omit<TourCtx, 'run' | 'evals' | 'budget' | 'ops' | 'peek' | 'theme' | 'pathname' | 'lastEvent'>;
  startedAt: number | null;
  chapterEnteredAt: number | null;
  finished: boolean;
};

export type PresenterMsg =
  | { type: 'hello' }
  | { type: 'state'; stepId: string; beat: number; status: TourStatus; path: TourPath; explored: TourPath[]; startedAt: number | null; chapterEnteredAt: number | null; sentAt: number }
  | { type: 'cmd'; cmd: 'next' | 'back' }
  | { type: 'goto'; stepId: string }
  | { type: 'backup'; topic: string }
  | { type: 'bye' };
