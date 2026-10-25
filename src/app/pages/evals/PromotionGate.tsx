import { useEffect, useRef, useState } from 'react';
import type { EvalRun } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import { tourAnchor } from '../../../tour/anchors';
import { Button } from '../../../system/components/primitives/Button.jsx';
import { usePrefersReducedMotion } from '../../state';
import { track } from '../../telemetry';
import { IconCheck, IconX } from '../../components/icons';
import { gateChecks, gateVerdict } from './evalModel';
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
    window.setTimeout(() => resultRef.current?.focus(), 30);
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

  return (
    <div className={styles.gate}>
      <div className="sl-spread">
        <div>
          <span className="sl-eyebrow">Promotion gate</span>
          <p className="sl-p">
            Promote <span className="sl-mono">{candidate.promptVersion}</span> over <span className="sl-mono">{current.promptVersion}</span>? Every rule must pass; the gate cannot be overridden from the UI.
          </p>
        </div>
        <span {...tourAnchor('evals.promote')} style={{ display: 'inline-flex' }}>
          <Button iconLeft={phase === 'done' ? 'refresh' : 'play'} onClick={run} loading={phase === 'checking'} disabled={phase === 'checking'}>
            {phase === 'idle' ? `Promote ${candidate.promptVersion.split('@')[1] ?? candidate.promptVersion}` : phase === 'checking' ? 'Checking the gate…' : 'Run the gate again'}
          </Button>
        </span>
      </div>

      {phase !== 'idle' ? (
        <ol className={styles.checks} aria-live="polite">
          {checks.map((c, i) => {
            const state = i < shown ? (c.info ? 'info' : c.ok ? 'ok' : 'fail') : i === shown && phase === 'checking' ? 'running' : 'pending';
            return (
              <li key={c.id} className={`${styles.check} ${styles[`check_${state}`] ?? ''}`}>
                <span className={styles.checkIcon} aria-hidden="true">
                  {state === 'ok' ? <IconCheck size={13} /> : state === 'fail' ? <IconX size={13} /> : null}
                </span>
                <span className={styles.checkText}>
                  <span className={styles.checkLabel}>{c.label}</span>
                  {state === 'ok' || state === 'fail' || state === 'info' ? <span className="sl-caption">{c.detail}</span> : null}
                </span>
                <span className="sl-sr-only">{state === 'ok' ? 'passed' : state === 'fail' ? 'failed' : state === 'info' ? 'for information' : state}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {phase === 'done' ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          className={`${styles.result} ${candidate.promoted ? styles.resultOk : styles.resultBlocked}`}
          {...tourAnchor('evals.gate')}
        >
          <span className={styles.resultWord}>{candidate.promoted ? 'Promoted' : 'Promotion blocked'}</span>
          <span className={styles.resultSub}>
            {gateVerdict(candidate, current)}
          </span>
          {!candidate.promoted && candidate.blockedReasons.length ? (
            <ul className={styles.reasons}>
              {candidate.blockedReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
