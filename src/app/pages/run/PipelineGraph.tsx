/**
 * Pipeline progress: the ten steps as one calm stepper (ten across on wide screens, five per
 * row in a medium column, two per row on phones) and an inline panel with the selected step's
 * detail. Steps light up from the real run_steps rows through the reveal pacing in useReveal;
 * a running step shows an honest spinner. Status is always a distinct icon shape and words
 * (aria-label, the meta line), never colour alone.
 */
import type { ReactNode } from 'react';
import { STEP_KEYS, type StepKey } from '../../../shared/contracts';
import { INSTANT_STEP_HELP } from '../../../shared/format';
import { tourAnchor } from '../../../tour/anchors';
import { cx, KeyValue, Spinner } from '../../../ds';
import { money, ms } from '../../lib/labels';
import type { DisplayStep } from './useReveal';
import { STEP_ABOUT, STEP_NAME } from './stepText';
import styles from './PipelineGraph.module.css';

export const STATUS_WORD: Record<string, string> = {
  pending: 'Waiting',
  running: 'Running',
  passed: 'Done',
  warned: 'Done with a warning',
  failed: 'Failed',
  skipped: 'Skipped',
};

const ICON_CLASS: Record<string, string | undefined> = {
  pending: styles.iconPending,
  running: styles.iconRunning,
  passed: styles.iconPassed,
  warned: styles.iconWarned,
  failed: styles.iconFailed,
  skipped: styles.iconSkipped,
};

const BAR_CLASS: Record<string, string | undefined> = {
  pending: styles.barPending,
  running: styles.barRunning,
  passed: styles.barPassed,
  warned: styles.barWarned,
  failed: styles.barFailed,
  skipped: styles.barSkipped,
};

const glyph = (d: string, width = 2.6) => (
  <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A 16px status mark: number (waiting), spinner (running), check, exclamation, cross, dash. */
export function StepIcon({ status, index }: { status: string; index: number }) {
  let inner: ReactNode;
  if (status === 'running') inner = <Spinner />;
  else if (status === 'passed') inner = glyph('M3.5 8.5 6.5 11.5 12.5 4.5');
  else if (status === 'warned') inner = glyph('M8 3.5v5.5M8 12.4v.1');
  else if (status === 'failed') inner = glyph('M4.5 4.5l7 7M11.5 4.5l-7 7');
  else if (status === 'skipped') inner = glyph('M4.5 8h7', 2.2);
  else inner = index + 1;
  return (
    <span className={cx(styles.icon, ICON_CLASS[status])} aria-hidden="true">
      {inner}
    </span>
  );
}

function metaText(s: DisplayStep, stopped: boolean): string {
  if (s.display === 'pending') return stopped ? 'Not run' : 'Waiting';
  if (s.display === 'running') return 'Running';
  if (s.display === 'skipped') return 'Skipped';
  if (s.display === 'failed') return 'Failed';
  return ms(s.durationMs);
}

export function PipelineProgress({
  steps,
  selected,
  onSelect,
  story,
  modelLabel,
  stopped,
}: {
  steps: DisplayStep[];
  selected: StepKey;
  onSelect: (key: StepKey) => void;
  story: string | null;
  modelLabel: string | null;
  /** The run failed: steps after the failure never run. */
  stopped: boolean;
}) {
  const step = steps.find((s) => s.key === selected) ?? steps[0]!;
  return (
    <div className={styles.wrap}>
      <PipelineStepper steps={steps} selected={selected} onSelect={onSelect} stopped={stopped} />
      <StepDetail step={step} story={story} modelLabel={modelLabel} stopped={stopped} />
    </div>
  );
}

function PipelineStepper({ steps, selected, onSelect, stopped }: { steps: DisplayStep[]; selected: StepKey; onSelect: (key: StepKey) => void; stopped: boolean }) {
  return (
    <ol className={styles.steps} aria-label="Pipeline steps" {...tourAnchor('run.stepper')}>
      {steps.map((s, i) => {
        const instant = (s.display === 'passed' || s.display === 'warned') && s.durationMs != null && s.durationMs < 1;
        return (
          <li key={s.key} className={styles.step} data-step={s.key} data-status={s.display} {...(s.key === 'ground' ? tourAnchor('run.ground') : {})}>
            <button
              type="button"
              className={cx(styles.stepBtn, selected === s.key && styles.stepBtnSelected)}
              aria-pressed={selected === s.key}
              aria-label={`Step ${i + 1}, ${STEP_NAME[s.key]}: ${s.display === 'pending' && stopped ? 'Not run' : (STATUS_WORD[s.display] ?? s.display)}${s.display === 'passed' || s.display === 'warned' ? `, ${ms(s.durationMs)}` : ''}. Show details.`}
              onClick={() => onSelect(s.key)}
            >
              <span className={styles.stepTrack}>
                <StepIcon status={s.display} index={i} />
                <span className={cx(styles.bar, BAR_CLASS[s.display])} aria-hidden="true" />
              </span>
              <span className={styles.stepName}>{STEP_NAME[s.key]}</span>
              <span className={styles.stepMeta} title={instant ? INSTANT_STEP_HELP : undefined}>
                {metaText(s, stopped)}
                {s.display === 'warned' ? <span className={styles.warnWord}>Warning</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The selected (or currently running) step: what it did on this run, what it is, and its numbers. */
function StepDetail({ step, story, modelLabel, stopped }: { step: DisplayStep; story: string | null; modelLabel: string | null; stopped: boolean }) {
  const index = STEP_KEYS.indexOf(step.key);
  const done = step.display !== 'pending' && step.display !== 'running';
  const ran = done && step.display !== 'skipped';
  const usedModel = ran && !!step.model;
  return (
    <div className={styles.detail} aria-live="polite">
      <div className={styles.detailHead}>
        <StepIcon status={step.display} index={index} />
        <h3 className={styles.detailTitle}>{STEP_NAME[step.key]}</h3>
        <span className={styles.detailCount}>
          Step {index + 1} of {STEP_KEYS.length}
        </span>
      </div>
      <p className={cx(styles.detailStory, step.display === 'failed' && styles.detailStoryFailed, !done && styles.detailStoryQuiet)}>
        {step.display === 'running'
          ? 'Working on it now.'
          : step.display === 'pending'
            ? stopped
              ? 'Not run: the conversation stopped at an earlier step.'
              : 'Waiting for the steps before it.'
            : (story ?? STATUS_WORD[step.display])}
      </p>
      <p className={styles.detailAbout}>{STEP_ABOUT[step.key]}</p>
      <KeyValue
        stacked
        className={styles.detailFacts}
        items={[
          { label: 'Model', value: !ran ? '—' : usedModel ? (modelLabel ?? 'Other model') : <span className="ds-muted">No AI, code only</span> },
          { label: 'Tokens', value: ran && step.tokensIn != null ? <span className="ds-num">{`${step.tokensIn.toLocaleString()} in, ${(step.tokensOut ?? 0).toLocaleString()} out`}</span> : '—' },
          { label: 'AI cost', value: ran ? <span className="ds-num">{step.costUsd != null ? money(step.costUsd, { precise: true }) : '$0'}</span> : '—' },
          { label: 'Took', value: ran ? <span className="ds-num">{ms(step.durationMs)}</span> : '—' },
        ]}
      />
    </div>
  );
}
