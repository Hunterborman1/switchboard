/**
 * How long the run took, shown so a fast run reads as real: a live clock from the run's real
 * start, then the server's total; and, once finished, a waterfall of the real step timestamps on
 * one shared clock (src/shared/runTiming.ts), with tokens, AI cost and a link to every call in
 * Agent Ops. Model roles only ("Decision model"), never ids.
 */
import { useEffect, useState } from 'react';
import { STEP_KEYS } from '../../../shared/contracts';
import { INSTANT_STEP_HELP } from '../../../shared/format';
import { runElapsedMs, runTiming, type RunTiming, type TimingRow } from '../../../shared/runTiming';
import { SIGNAL_LOOP_AGENT_ID } from '../../../shared/platform-contracts';
import { tourAnchor } from '../../../tour/anchors';
import { ButtonLink, Card, cx, Spinner, Tooltip } from '../../../ds';
import { IconExternal } from '../../../ds/icons';
import { money, ms } from '../../lib/labels';
import type { RunDetail } from '../../api/types';
import type { RevealState } from './useReveal';
import { STEP_NAME } from './stepText';
import styles from './Timing.module.css';

const TERMINAL = new Set(['completed', 'awaiting_review', 'failed']);

/** A clock that ticks only while `on`. */
function useTicker(on: boolean, every = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [on, every]);
  return now;
}

/** "3.4 s" at a tenth of a second while counting; the final total uses the shared formatter. */
const tenths = (v: number) => `${(Math.max(0, v) / 1000).toFixed(1)} s`;

/** Elapsed time while the run (or a replay of its reveal) is going; null when nothing is ticking. */
export function useLiveElapsed(detail: RunDetail, reveal: Pick<RevealState, 'replaying' | 'replayStartedAt'>): { running: boolean; elapsedMs: number | null } {
  const terminal = TERMINAL.has(detail.run.status);
  const running = !terminal || reveal.replaying;
  const now = useTicker(running);
  if (reveal.replaying && reveal.replayStartedAt != null) {
    const wall = detail.run.durationMs ?? Number.POSITIVE_INFINITY;
    void now; // re-render every tick
    return { running, elapsedMs: Math.min(wall, performance.now() - reveal.replayStartedAt) };
  }
  if (terminal) return { running: false, elapsedMs: detail.run.durationMs };
  return { running, elapsedMs: runElapsedMs(detail, now) };
}

/** The header meta "Took": live while running, the real total after. */
export function TookValue({ detail, reveal }: { detail: RunDetail; reveal: Pick<RevealState, 'replaying' | 'replayStartedAt'> }) {
  const { running, elapsedMs } = useLiveElapsed(detail, reveal);
  if (running && !reveal.replaying) return <span className="ds-num">{elapsedMs != null ? tenths(elapsedMs) : '—'}</span>;
  return <span className="ds-num">{ms(detail.run.durationMs)}</span>;
}

/**
 * The live clock in the Progress card: "Running · 3.4 s" while the run goes, "Finished in 4.24 s"
 * with "Live run" or "Replay" after, "Replaying at recorded speed" during a replay of the reveal.
 * Its width is reserved, so nothing moves when the words change.
 */
export function RunClock({ detail, reveal }: { detail: RunDetail; reveal: Pick<RevealState, 'replaying' | 'replayStartedAt'> }) {
  const { running, elapsedMs } = useLiveElapsed(detail, reveal);
  const failed = detail.run.status === 'failed';
  const mode = detail.run.mode === 'replay' ? 'Replay' : 'Live run';
  let label: string;
  let value: string | null;
  let note: string | null = null;
  if (reveal.replaying) {
    label = 'Replaying at recorded speed';
    value = elapsedMs != null ? tenths(elapsedMs) : null;
  } else if (running) {
    label = 'Running';
    value = elapsedMs != null ? tenths(elapsedMs) : null;
  } else {
    label = failed ? 'Stopped after' : 'Finished in';
    value = ms(detail.run.durationMs);
    note = mode;
  }
  return (
    <span className={styles.clock} {...tourAnchor('run.clock')} role="timer" aria-live="off" data-state={reveal.replaying ? 'replaying' : running ? 'running' : 'finished'}>
      {running ? <Spinner /> : null}
      <span className={styles.clockLabel}>{label}</span>
      {value ? (
        <>
          {/* Whitespace between flex items isn't drawn (the gap spaces them) but keeps the text readable. */}
          {running ? (
            <>
              {' '}
              <span className={styles.clockSep} aria-hidden="true">
                ·
              </span>{' '}
            </>
          ) : (
            ' '
          )}
          <span className={cx('ds-num', styles.clockValue)}>{value}</span>
        </>
      ) : null}
      {note ? (
        <>
          {' '}
          <span className={styles.clockNote}>{note}</span>
        </>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------- timing card

function rowName(r: TimingRow): string {
  if (r.secondOpinion) return 'Score and second opinion';
  if (r.lookups) return 'Theme lookups';
  return STEP_NAME[r.key];
}

function rowSub(r: TimingRow, role: string | null, discarded: boolean): string {
  if (r.status === 'skipped') return discarded ? 'Skipped, early call discarded' : 'Skipped';
  if (r.status === 'failed') return role ? `${role}, failed` : 'Failed';
  if (r.withTriage) return `${role ?? 'Main model'}, started with triage`;
  if (r.afterRunMs != null) return `${role ?? 'Main model'} names it after the run`;
  if (r.ai) return role ?? 'Other model';
  if (r.lookups) return 'Similarity search';
  return 'Code';
}

function Row({ r, span, role, discarded }: { r: TimingRow; span: number; role: string | null; discarded: boolean }) {
  const left = span > 0 ? (r.start / span) * 100 : 0;
  const width = span > 0 ? ((r.end - r.start) / span) * 100 : 0;
  const skipped = r.status === 'skipped';
  // Code steps that take a millisecond or two draw as a hairline: a bar that thin would be invisible.
  // A step whose model call came after the run (theme naming) is drawn by its in-run time only.
  const onClock = r.ai && r.afterRunMs == null;
  const tick = !skipped && !onClock && (r.instant || width < 0.6);
  const name = rowName(r);
  const sub = rowSub(r, role, discarded);
  const label = (
    <span className={styles.rowLabel}>
      <span className={styles.rowName}>{name}</span>
      <span className={styles.rowSub}>{sub}</span>
    </span>
  );
  const durText = skipped ? '—' : ms(r.ms);
  return (
    <li className={styles.row} data-timing-step={r.key} data-ai={r.ai ? 'true' : undefined} data-status={r.status}>
      {r.ai ? (
        <Tooltip label={`${r.tokensIn.toLocaleString()} tokens in, ${r.tokensOut.toLocaleString()} out, ${money(r.costUsd, { precise: true })} of AI${r.afterRunMs != null ? `. Naming took ${ms(r.afterRunMs)} after the run finished, so it isn’t in the wall time.` : ''}`}>
          <span className={styles.rowLabelWrap} tabIndex={0}>
            {label}
          </span>
        </Tooltip>
      ) : (
        <span className={styles.rowLabelWrap}>{label}</span>
      )}
      <span className={styles.track} aria-hidden="true">
        {skipped ? null : tick ? (
          <span className={styles.tick} style={{ left: `${Math.min(99.6, left)}%` }} />
        ) : (
          <span className={cx(styles.bar, onClock ? styles.barAi : styles.barCode, r.status === 'failed' && styles.barFailed)} style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }} />
        )}
      </span>
      <span className={cx('ds-num', styles.dur, skipped && 'ds-subtle')} title={r.instant ? INSTANT_STEP_HELP : undefined}>
        {durText}
      </span>
      <span className="ds-sr-only">
        {`${name}, ${sub}. ${skipped ? 'Not run.' : `Started at ${r.start < 1 ? '0 s' : ms(r.start)}, took ${durText}.`}`}
      </span>
    </li>
  );
}

function caption(t: RunTiming): string {
  const parts: string[] = [];
  if (t.replay) parts.push('Replay of a recorded live run, at its recorded speed. Recorded before triage ran alongside extraction, so the steps are re-timed to today’s order.');
  if (!t.timestamped) parts.push('This run has no step timestamps, so the steps are laid out from their durations.');
  if (!parts.length) parts.push('Every step on one clock, from the times each one started and finished.');
  return parts.join(' ');
}

function why(t: RunTiming): string | null {
  const out: string[] = [];
  if (t.parallel) out.push('Triage ran alongside extraction, so it added no time.');
  const code = t.rows.filter((r) => !r.ai && !r.lookups && r.status !== 'skipped' && r.status !== 'failed');
  if (code.length) {
    const total = code.reduce((a, r) => a + r.ms, 0);
    out.push(`The ${code.length} code steps took ${total < 1 ? 'under a millisecond' : ms(total)} in all.`);
  }
  // Wall time runs from receiving the file; the clock above starts at the first step.
  const before = t.wallMs - t.spanMs;
  if (t.timestamped && before >= 50) out.push(`Wall time also counts the ${ms(before)} between receiving the file and the first step.`);
  return out.length ? out.join(' ') : null;
}

export function TimingCard({ detail, modelLabel }: { detail: RunDetail; modelLabel: (id: string | null | undefined) => string | null }) {
  const t = runTiming(detail);
  const runId = detail.run.id;
  const logs = (
    <ButtonLink to={`/ops/logs?agentId=${SIGNAL_LOOP_AGENT_ID}&runId=${runId}`} size="sm" variant="ghost" iconRight={<IconExternal size={13} />}>
      Logs
    </ButtonLink>
  );
  if (!t) {
    return (
      <Card title="Timing" description="Nothing ran, so there is nothing to time." actions={logs} attrs={{ ...tourAnchor('run.timing'), 'aria-label': 'Timing' }}>
        <p className={styles.empty}>No step of this conversation has finished.</p>
      </Card>
    );
  }
  const extract = detail.steps.find((s) => s.key === 'extract');
  const discarded = !!(extract?.detail as Record<string, unknown> | null)?.speculativeDiscarded;
  const note = why(t);
  const ordered = STEP_KEYS.map((k) => t.rows.find((r) => r.key === k)).filter((r): r is TimingRow => !!r);
  return (
    <Card title="Timing" description={caption(t)} actions={logs} flush attrs={{ ...tourAnchor('run.timing'), 'aria-label': 'Timing' }}>
      <div className={styles.body}>
        <ol className={styles.rows} aria-label="Step timings">
          {ordered.map((r) => (
            <Row key={r.key} r={r} span={t.spanMs} role={r.ai ? modelLabel(r.model) : null} discarded={r.key === 'extract' && discarded} />
          ))}
        </ol>
        <div className={styles.axis} aria-hidden="true">
          <span />
          <span className={styles.axisTrack}>
            <span className="ds-num">0 s</span>
            <span className="ds-num">{ms(t.spanMs)}</span>
          </span>
          <span />
        </div>
        {note ? <p className={styles.why}>{note}</p> : null}
      </div>
      <div className={styles.foot}>
        <dl className={styles.totals}>
          <div>
            <dt>Wall time</dt>
            <dd className="ds-num">{ms(t.wallMs)}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd className="ds-num" title={`${t.tokensIn.toLocaleString()} in, ${t.tokensOut.toLocaleString()} out`}>
              {t.tokensIn.toLocaleString()} in, {t.tokensOut.toLocaleString()} out
            </dd>
          </div>
          <div>
            <dt>AI cost</dt>
            <dd className="ds-num">{money(t.costUsd, { precise: true })}</dd>
          </div>
        </dl>
        <ButtonLink to={`/ops/traces/${runId}`} size="sm" variant="secondary" iconRight={<IconExternal size={13} />} className={styles.opsLink}>
          See every call in Agent Ops
        </ButtonLink>
      </div>
    </Card>
  );
}

/** Placeholder with the card's shape while the run is still going, so nothing jumps when it lands. */
export function TimingPending() {
  return (
    <Card title="Timing" description="Appears when the run finishes, from the real step timestamps." attrs={{ 'aria-label': 'Timing' }}>
      <p className={styles.empty}>Still running.</p>
    </Card>
  );
}
