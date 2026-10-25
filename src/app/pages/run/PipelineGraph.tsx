/**
 * The 10-step pipeline graph. Nodes light up from the real run_steps rows (through the
 * reveal pacing in useReveal): pending → running (a turning ring) → passed / warned /
 * failed / skipped. When a step completes, its connector fills and a glowing pulse travels
 * to the next node. Status is always in words too (aria-label + the label row), never
 * colour alone. Wide: one row. Medium container: two rows of five. Narrow: a vertical list
 * with each step's one-line summary.
 */
import { motion } from 'motion/react';
import { STEP_LABELS, type StepKey } from '../../../shared/contracts';
import { tourAnchor } from '../../../tour/anchors';
import { ms, STEP_HELP } from '../../lib/labels';
import { INSTANT_STEP_HELP } from '../../../shared/format';
import type { DisplayStep } from './useReveal';
import styles from './PipelineGraph.module.css';

const STATUS_WORD: Record<string, string> = {
  pending: 'waiting',
  running: 'running',
  passed: 'passed',
  warned: 'passed with a warning',
  failed: 'failed',
  skipped: 'skipped',
};

function Glyph({ status, index }: { status: string; index: number }) {
  if (status === 'passed')
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <motion.path d="m5.5 12.5 4 4L18.5 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28 }} />
      </svg>
    );
  if (status === 'warned')
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 6.5v7M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  if (status === 'failed')
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  if (status === 'skipped')
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  return <span className={styles.num}>{index + 1}</span>;
}

export function PipelineGraph({
  steps,
  selected,
  onSelect,
  pace,
  reduced,
}: {
  steps: DisplayStep[];
  selected: StepKey | null;
  onSelect: (key: StepKey) => void;
  pace: number;
  reduced: boolean;
}) {
  const flowMs = Math.max(260, Math.min(900, pace * 0.85));
  return (
    <div className={styles.wrap}>
      <ol className={styles.graph} aria-label="Pipeline steps" {...tourAnchor('run.stepper')}>
        {steps.map((s, i) => {
          const next = steps[i + 1];
          const flowing = s.display !== 'pending' && s.display !== 'running';
          const st = s.display;
          return (
            <li key={s.key} className={`${styles.cell} ${styles[`s_${st}`] ?? ''}`} data-step={s.key} data-status={st} data-tour={s.key === 'ground' ? 'run.ground' : undefined}>
              <button
                type="button"
                className={`${styles.node} ${selected === s.key ? styles.nodeSelected : ''}`}
                onClick={() => onSelect(s.key)}
                aria-label={`Step ${i + 1}, ${STEP_LABELS[s.key]}: ${STATUS_WORD[st] ?? st}${s.durationMs != null && flowing ? `, ${ms(s.durationMs)}` : ''}. ${STEP_HELP[s.key]}`}
                aria-pressed={selected === s.key}
              >
                {st === 'running' ? <span className={styles.ring} aria-hidden="true" /> : null}
                {st === 'running' && !reduced ? <span className={styles.halo} aria-hidden="true" /> : null}
                <span className={styles.disc}>
                  <Glyph status={st} index={i} />
                </span>
              </button>
              <span className={styles.label}>{STEP_LABELS[s.key]}</span>
              <span className={styles.meta} title={flowing && st !== 'skipped' && s.durationMs != null && s.durationMs < 1 ? INSTANT_STEP_HELP : undefined}>
                {st === 'running' ? 'running…' : flowing ? (st === 'skipped' ? 'skipped' : ms(s.durationMs)) : ' '}
              </span>
              {s.display !== 'pending' && s.summary && flowing ? <span className={styles.vsummary}>{s.summary}</span> : <span className={styles.vsummary}>{st === 'running' ? 'Working…' : STEP_HELP[s.key]}</span>}
              {next ? (
                <span className={`${styles.link} ${flowing ? styles.linkOn : ''}`} aria-hidden="true">
                  <span className={styles.linkFill} style={{ transitionDuration: reduced ? '0ms' : `${flowMs}ms` }} />
                  {flowing && !reduced && s.revealedAt && Date.now() - s.revealedAt < 2500 ? (
                    <motion.span
                      key={`${s.key}-${s.revealedAt}`}
                      className={styles.pulse}
                      initial={{ left: '0%', opacity: 0 }}
                      animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                      transition={{ duration: flowMs / 1000, ease: 'easeInOut', times: [0, 0.15, 0.85, 1] }}
                    />
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
