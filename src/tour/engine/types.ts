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

/** The ten chapters: three to set up, five in the real product, two to close. */
export type ChapterId = 'signal' | 'real' | 'why' | 'call' | 'review' | 'routing' | 'patterns' | 'operate' | 'production' | 'scorecard';

export type Chapter = {
  id: ChapterId;
  /** Position in the talk, 1-based. Every chapter, narrative and product, is numbered in one sequence. */
  part: number;
  title: string;
  /** narrative: scenes only. product: the real product, with the Guide. both: a scene and the product, or the viewer's product data on a scene. */
  layer: 'narrative' | 'product' | 'both';
  objective: string;
  /** Presenter target in seconds. */
  targetSec: number;
};

export type SceneId = 'signal' | 'real' | 'why' | 'platform' | 'production' | 'scorecard';

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
  /** One sentence explaining the trace's error spans (e.g. retried deliveries), or null when there are none. */
  traceErrors?: string | null;
};

export type TourCtx = {
  path: TourPath;
  fileId: string | null;
  /** Format of the picked file (vtt, txt, md, eml, chat): the intro copy depends on it, not just the path. */
  fileFormat?: string | null;
  runId: string | null;
  /** The run on screen is an earlier run of the same file that was reopened, not a new execution. */
  runReused?: boolean;
  themeId: string | null;
  explored: TourPath[];
  counters: Counters;
  /** Live RunDetail for ctx.runId (polled by the provider; not persisted). */
  run: RunDetail | null;
  evals: EvalsData | null;
  budget: Budget | null;
  ops: OpsData | null;
  /** A run that has a rejected (ungrounded) quote, for the optional "see a rejected quote" step. */
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
  | {
      event: SignalEvent['name'];
      where?: (e: SignalEvent, ctx: TourCtx) => boolean;
      hint?: string;
      /** Already done (e.g. on a revisit): show Continue instead of waiting for the event. */
      satisfied?: (ctx: TourCtx) => boolean;
    }
  | { predicate: (ctx: TourCtx) => boolean; hint?: string };

/** The step is still waiting on the viewer (an event or predicate not yet met). */
export function awaitingUser(step: { waitFor?: WaitFor }, ctx: TourCtx): boolean {
  const w = step.waitFor;
  if (!w || w === 'next') return false;
  if ('event' in w && w.satisfied?.(ctx)) return false;
  return true;
}

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
  goto: (stepId: string, opts?: { replace?: boolean }) => void;
  setCtx: (patch: Partial<TourCtx>) => void;
};

export type Step = {
  id: string;
  chapter: ChapterId;
  kind: 'scene' | 'product';
  /** Path (relative to the router basename). A function may return null = stay where you are. */
  route?: string | ((ctx: TourCtx) => string | null);
  /** kind 'scene': the scene to draw. A scene shows all of its content on arrival; only Back / Next move on. */
  scene?: SceneId;
  /** What the Guide points at (it gets a ring). A list is a priority order: the first one on screen wins. */
  target?: AnchorId | AnchorId[] | ((ctx: TourCtx) => AnchorId | AnchorId[]);
  /** Extra anchors that get a soft ring (e.g. the recommended file inside the picker). */
  highlight?: AnchorId[];
  title: Copy;
  /** ≤ 20 words: the WHY. */
  body: Copy;
  /** Detail behind "How this works". */
  more?: Copy;
  waitFor?: WaitFor;
  /** For 'next' steps: Continue is enabled only once this is true. */
  ready?: (ctx: TourCtx) => boolean;
  readyLabel?: Copy;
  next: string | ((ctx: TourCtx) => string);
  actions?: StepAction[] | ((ctx: TourCtx) => StepAction[] | undefined);
  onEnter?: (ctx: TourCtx, api: TourApi) => void;
  /** What this step changed ("2 decisions made by a person"): one quiet line in the Guide. */
  checkpoint?: (ctx: TourCtx) => CheckpointData | null;
  /** Where "Resume presentation" lands if the viewer left on this step (e.g. a step that needs an open dialog). */
  resumeAt?: string;
  /** Anchor wait before the Guide says the part isn't on screen. */
  anchorTimeoutMs?: number;
  /** Speaker notes for the presenter view. */
  notes?: string;
};

export type TourStatus = 'idle' | 'active' | 'explore';

export type Persisted = {
  status: TourStatus;
  stepId: string;
  history: string[];
  ctx: Omit<TourCtx, 'run' | 'evals' | 'budget' | 'ops' | 'peek' | 'theme' | 'pathname' | 'lastEvent'>;
  startedAt: number | null;
  chapterEnteredAt: number | null;
  finished: boolean;
};

export type PresenterMsg =
  | { type: 'hello' }
  | { type: 'state'; stepId: string; status: TourStatus; path: TourPath; explored: TourPath[]; startedAt: number | null; chapterEnteredAt: number | null; sentAt: number }
  | { type: 'cmd'; cmd: 'next' | 'back' }
  | { type: 'goto'; stepId: string }
  | { type: 'backup'; topic: string }
  | { type: 'bye' };
