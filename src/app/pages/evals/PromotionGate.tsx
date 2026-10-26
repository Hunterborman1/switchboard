/**
 * The go-live check for a candidate prompt. "Promote" runs every recorded gate rule in turn and
 * ends in the result the data dictates; nobody can override it from here. Cost and speed are
 * listed for context and never count as a failure.
 */
import { useEffect, useRef, useState } from 'react';
import type { EvalRun } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import { tourAnchor } from '../../../tour/anchors';
import { Button, Spinner } from '../../../ds';
import { IconCheckCircle, IconInfo, IconPlay, IconRefresh, IconXCircle } from '../../../ds/icons';
import { usePrefersReducedMotion } from '../../state';
import { track } from '../../telemetry';
import { gateChecks, gateHeadline, gateVerdict, ver } from './evalModel';
import styles from './Evals.module.css';

type Phase = 'idle' | 'checking' | 'done';
const STEP_MS = 260;

export function PromotionGate({ candidate, current }: { candidate: EvalRun; current: EvalRun }) {
  const checks = gateChecks(candidate, current);
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const finish = () => {
    setPhase('done');
    emit({ name: 'eval.promote_attempted', promoted: candidate.promoted });
    track('eval_promote', { candidate: candidate.promptVersion, current: current.promptVersion, promoted: candidate.promoted });
    window.setTimeout(() => resultRef.current?.focus({ preventScroll: true }), 30);
  };

  const run = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (reduced) {
      setShown(checks.length);
      finish();
      return;
    }
    setPhase('checking');
    setShown(0);
    checks.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setShown(i + 1), STEP_MS * (i + 1)));
    });
    timers.current.push(window.setTimeout(finish, STEP_MS * (checks.length + 1) + 120));
  };

  const rules = checks.filter((c) => !c.info).length;
  const done = phase === 'done';
  const cand = ver(candidate.promptVersion);

  return (
    <div className={styles.gate}>
      <div className={styles.gateHead}>
        <div className={styles.gateText}>
          <h3 className={styles.gateTitle}>Go-live check</h3>
          <p className={styles.gateDescription}>
            Replace {ver(current.promptVersion)} with {cand}? All {rules} rules must pass, and nobody can override the check from here.
          </p>
        </div>
        <Button
          variant={phase === 'idle' ? 'primary' : 'secondary'}
          icon={phase === 'done' ? <IconRefresh size={14} /> : <IconPlay size={14} />}
          onClick={run}
          loading={phase === 'checking'}
          className={styles.gateButton}
          {...tourAnchor('evals.promote')}
        >
          {phase === 'idle' ? `Promote ${cand}` : phase === 'checking' ? 'Checking' : 'Run the check again'}
        </Button>
      </div>

      {phase !== 'idle' ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className={`${styles.result}${done ? ` ${candidate.promoted ? styles.resultOk : styles.resultBlocked}` : ''}`}
          {...(done ? tourAnchor('evals.gate') : {})}
        >
          <div className={styles.resultHead}>
            {done ? (
              candidate.promoted ? (
                <IconCheckCircle size={18} className={styles.resultIconOk} />
              ) : (
                <IconXCircle size={18} className={styles.resultIconBlocked} />
              )
            ) : (
              <span className={styles.resultSpinner}>
                <Spinner />
              </span>
            )}
            <div className={styles.resultText}>
              <p className={styles.resultTitle}>{done ? gateHeadline(candidate, current) : `Checking ${Math.min(shown + 1, checks.length)} of ${checks.length}`}</p>
              {done ? <p className={styles.resultSub}>{gateVerdict(candidate, current)}</p> : null}
            </div>
          </div>
          <ol className={styles.checks}>
            {checks.map((c, i) => {
              const state = i < shown ? (c.info ? 'info' : c.ok ? 'ok' : 'fail') : i === shown && phase === 'checking' ? 'running' : 'pending';
              return (
                <li key={c.id} className={styles.check}>
                  <span className={`${styles.checkIcon} ${styles[`tone_${state}`] ?? ''}`} aria-hidden="true">
                    {state === 'ok' ? (
                      <IconCheckCircle size={16} />
                    ) : state === 'fail' ? (
                      <IconXCircle size={16} />
                    ) : state === 'info' ? (
                      <IconInfo size={16} />
                    ) : state === 'running' ? (
                      <Spinner />
                    ) : (
                      <span className={styles.checkDot} />
                    )}
                  </span>
                  <span className={styles.checkText}>
                    <span className={`${styles.checkLabel}${state === 'pending' || state === 'running' ? ` ${styles.checkLabelPending}` : ''}`}>{c.label}</span>
                    {state === 'ok' || state === 'fail' || state === 'info' ? <span className={styles.checkDetail}>{c.detail}</span> : null}
                  </span>
                  <span className={`${styles.checkState} ${styles[`tone_${state}`] ?? ''}`}>{state === 'ok' ? 'Pass' : state === 'fail' ? 'Fail' : state === 'info' ? 'Not gated' : ''}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
