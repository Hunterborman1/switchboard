import type { Run } from '../../../shared/contracts';
import { StatusChip, type StatusTone } from '../../../uis/StatusChip';
import { Hint } from '../../components/Hint';

export const RUN_STATUS_TONE: Record<Run['status'], StatusTone> = {
  queued: 'neutral',
  running: 'info',
  awaiting_review: 'warning',
  completed: 'success',
  failed: 'danger',
};

export const RUN_STATUS_LABEL: Record<Run['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  failed: 'Failed',
};

export const MODE_REASON: Record<string, string> = {
  budget_reached: 'The $15 live AI budget is used up, so this run replayed a recorded live run at real speed.',
  live_failed: 'The live AI call failed or was too slow, so the recorded live run was played back.',
  live_disabled: 'Live AI was turned off for this run; it replayed a recorded live run.',
  seed: 'Sample history: a recorded live run, present in every workspace.',
};

export function ModeChip({ run }: { run: Pick<Run, 'mode' | 'modeReason'> }) {
  if (run.mode === 'live') {
    return (
      <Hint label="Live: this run called the real AI models.">
        <span tabIndex={0} style={{ display: 'inline-flex' }}>
          <StatusChip tone="success" size="sm">
            Live
          </StatusChip>
        </span>
      </Hint>
    );
  }
  return (
    <Hint label={MODE_REASON[run.modeReason ?? ''] ?? 'Replay of a recorded live run.'}>
      <span tabIndex={0} style={{ display: 'inline-flex' }}>
        <StatusChip tone="info" size="sm">
          Replay
        </StatusChip>
      </span>
    </Hint>
  );
}
