/**
 * Chapter 10 · Scorecard. What you did and what the system did, with real numbers from the
 * viewer's own workspace and from Agent Ops. Then "Explore freely" unlocks everything.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Badge, Button, ProductMark } from '../../ds';
import { IconArrowRight } from '../../ds/icons';
import { SceneHead, Stat } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';
import { loadScoreboard, tourApi, type Scoreboard } from '../../tour/api';
import type { RunDetail } from '../../shared/contracts';
import { useTour } from '../../tour/engine/TourProvider';
import { usdTotal } from '../../shared/format';
import { PLATFORM_API_BASE, SIGNAL_LOOP_AGENT_ID, type AgentImpact, type LogEntry, type Span } from '../../shared/platform-contracts';

type OpsFacts = { logLines: number; spans: number; traces: number; hours: number | null; ok: boolean };

async function pget<T>(path: string): Promise<T> {
  const r = await fetch(`${PLATFORM_API_BASE}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(String(r.status));
  const b = (await r.json()) as { data?: T } | T;
  return b && typeof b === 'object' && 'data' in (b as object) ? (b as { data: T }).data : (b as T);
}

/**
 * The Agent Ops line counts exactly what the trace pages show: for each of the viewer's runs,
 * its trace's spans and its correlated log lines (the trace endpoint returns both). With one
 * run this matches that run's trace page; with several it is their sum, and says so.
 */
async function loadOps(runIds: string[]): Promise<OpsFacts> {
  let logLines = 0;
  let spans = 0;
  let hours: number | null = null;
  let ok = false;
  try {
    const a = await pget<{ impact: AgentImpact }>(`/agents/${SIGNAL_LOOP_AGENT_ID}`);
    hours = a.impact?.hoursReturned ?? null;
    ok = true;
  } catch {
    /* platform not reachable */
  }
  // One trace per run: the trace its run-scoped log lines carry (the same one operate.trace opens).
  const traces = new Set<string>();
  await Promise.all(
    runIds.slice(0, 8).map(async (id) => {
      try {
        const l = await pget<{ rows: LogEntry[] }>(`/logs?runId=${encodeURIComponent(id)}`);
        const t = l.rows.find((r) => r.runId === id)?.traceId ?? l.rows[0]?.traceId;
        if (t) traces.add(t);
        ok = true;
      } catch {
        /* ignore */
      }
    }),
  );
  await Promise.all(
    [...traces].map(async (t) => {
      try {
        const s = await pget<{ spans: Span[]; logs: LogEntry[] }>(`/traces/${encodeURIComponent(t)}`);
        spans += s.spans.length;
        logLines += s.logs.length;
      } catch {
        /* ignore */
      }
    }),
  );
  return { logLines, spans, traces: traces.size, hours, ok };
}

/** A count (`v`), a plain-text value (`text`, muted) or a money figure (`money`, full weight). */
type Tile = { v?: number; s?: string; text?: string; money?: string; l: string };

function TileView({ t }: { t: Tile }) {
  if (t.money != null) {
    return (
      <div className="n-stat n-stat--sm">
        <div className="n-stat__value">{t.money}</div>
        <div className="n-stat__label">{t.l}</div>
      </div>
    );
  }
  if (t.text != null) {
    return (
      <div className="n-stat n-stat--sm">
        <div className="n-stat__value n-stat__value--text">{t.text}</div>
        <div className="n-stat__label">{t.l}</div>
      </div>
    );
  }
  return <Stat value={t.v ?? 0} suffix={t.s} label={t.l} size="sm" />;
}

export function ScorecardScene() {
  const tour = useTour();
  const navigate = useNavigate();
  const calm = useCalm();
  const [sb, setSb] = useState<Scoreboard | null>(null);
  const [ops, setOps] = useState<OpsFacts | null>(null);
  const [fetchedRun, setFetchedRun] = useState<RunDetail | null>(null);
  // Every run in the workspace, so grounded quotes and redactions add up the same way as
  // insights and routed counts (all runs), never one run against a sum of three.
  const [allRuns, setAllRuns] = useState<RunDetail[] | null>(null);
  const c = tour.ctx.counters;
  const run = tour.ctx.run ?? fetchedRun;

  // The viewer's own run (for grounded-quote and redaction facts) after a refresh.
  useEffect(() => {
    if (tour.ctx.run || !tour.ctx.runId) return;
    let alive = true;
    tourApi
      .run(tour.ctx.runId)
      .then((d) => alive && setFetchedRun(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tour.ctx.run, tour.ctx.runId]);

  useEffect(() => {
    let alive = true;
    loadScoreboard().then((s) => {
      if (!alive) return;
      setSb(s);
      const ids = [...new Set([...(tour.ctx.runId ? [tour.ctx.runId] : []), ...s.runIds])];
      loadOps(ids).then((o) => alive && setOps(o));
      Promise.all(s.runIds.slice(0, 12).map((id) => tourApi.run(id).catch(() => null))).then((rs) => {
        if (alive) setAllRuns(rs.filter((r): r is RunDetail => r != null));
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Leaving the scorecard finishes the presentation: the Guide then offers a nudge per screen. */
  const leave = (to: string) => {
    tour.finish();
    navigate(to);
  };
  const explore = () => leave('/app/new');

  // Tiles say what is true for this session. A zero the viewer didn't cause reads as a
  // failure, so a zero system counter is swapped for a fact about their own run, or left out.
  const runs = sb?.runs ?? (tour.ctx.runId ? 1 : 0);
  const decisions = c.approvals + c.edits + c.rejects;
  const you: Tile[] = [
    { v: runs, l: runs === 1 ? 'call you ran' : 'calls you ran' },
    ...(decisions > 0 ? [{ v: decisions, l: decisions === 1 ? 'decision you made' : 'decisions you made' }] : []),
    c.rulesChanged > 0 ? { v: c.rulesChanged, l: c.rulesChanged === 1 ? 'routing rule changed' : 'routing rules changed' } : { text: 'Unchanged', l: 'routing rules' },
    ...(c.shipped > 0 ? [{ v: c.shipped, l: c.shipped === 1 ? 'ticket shipped' : 'tickets shipped' }] : []),
    { v: tour.ctx.explored.length, l: 'scenarios explored', s: ' / 6' },
  ];
  const pool = allRuns && allRuns.length ? allRuns : run ? [run] : [];
  const ev = pool.flatMap((r) => r.insights.flatMap((i) => i.evidence));
  const grounded = ev.filter((e) => e.method !== 'failed').length;
  const redacted = pool.reduce((a, r) => a + r.redactions.reduce((b, x) => b + x.count, 0), 0);
  const sysAll: (Tile | null)[] = [
    { v: sb?.insights ?? 0, l: sb?.insights === 1 ? 'insight extracted' : 'insights extracted' },
    sb && sb.dropped > 0
      ? { v: sb.dropped, l: sb.dropped === 1 ? 'quote not found in the transcript, dropped' : 'quotes not found in the transcript, dropped' }
      : ev.length > 0
        ? { v: grounded, s: ` / ${ev.length}`, l: 'quotes grounded in the transcript' }
        : null,
    sb && sb.injections > 0
      ? { v: sb.injections, l: sb.injections === 1 ? 'injection attempt caught' : 'injection attempts caught' }
      : redacted > 0
        ? { v: redacted, l: redacted === 1 ? 'value redacted before the model' : 'values redacted before the model' }
        : null,
    ...(sb && sb.routed > 0 ? [{ v: sb.routed, l: sb.routed === 1 ? 'insight routed' : 'insights routed' }] : []),
  ];
  const sys = sysAll.filter((t): t is Tile => t != null);
  // Nothing of the viewer's own to count yet: say so and point at chapter 4, rather than a
  // wall of zeros that reads like something broke.
  const empty = sb != null && runs === 0 && !tour.ctx.runId;
  const startCall = () => tour.goto('call.intro');
  const startRef = useRef<HTMLButtonElement>(null);
  // Keyboard focus follows the primary action: "Bring in a call" once we know it's empty.
  useEffect(() => {
    if (empty) startRef.current?.focus({ preventScroll: true });
  }, [empty]);
  const opsCounted = ops != null && ops.ok && ops.traces > 0 && ops.logLines + ops.spans > 0;
  const lede = empty
    ? 'It fills in as you go: run one call and it counts what you did and what the system did.'
    : !sb
    ? 'What you did, and what the system did.'
    : sb.ok
      ? 'Counted from your own workspace and this session, not a script.'
      : 'Live figures were unavailable, so these counts come from this session only.';


  return (
    <div className="sc sc-score" data-testid="scorecard" data-empty={empty ? 'true' : undefined}>
      <SceneHead title={empty ? 'Your scorecard is empty so far.' : 'Here’s what you just did.'} line={lede} />
      <div className="sc-score__visual">
        {empty ? (
          <motion.section
            className="sc-score__card sc-score__empty"
            aria-label="No runs yet"
            data-testid="scorecard-empty"
            initial={calm ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: calm ? 0 : DUR.layout, ease: EASE }}
          >
            <h2 className="sc-score__h">You haven’t run a call yet</h2>
            <p className="n-body">
              Chapter 4, A call comes in, runs a recorded customer call through Signal Loop. It takes about a minute. Then come back to see what it found, what it held back,
              what the AI cost and the trail it left in Agent Ops.
            </p>
            <div className="sc-score__actions">
              <Button ref={startRef} variant="primary" size="lg" iconRight={<IconArrowRight />} onClick={startCall} data-testid="scorecard-start-call">
                Bring in a call
              </Button>
            </div>
          </motion.section>
        ) : (
          <div className="sc-score__panels">
            <motion.section className="sc-score__card" aria-label="You" initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.05 }}>
              <h2 className="sc-score__h">You</h2>
              <div className="sc-score__stats">
                {you.map((x) => (
                  <TileView key={x.l} t={x} />
                ))}
              </div>
            </motion.section>
            <motion.section className="sc-score__card" aria-label="The system" initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.15 }}>
              <h2 className="sc-score__h">The system</h2>
              <div className="sc-score__stats">
                {sys.map((x) => (
                  <TileView key={x.l} t={x} />
                ))}
                <TileView t={{ money: usdTotal(sb?.costUsd ?? 0), l: sb && sb.liveRuns === 0 && sb.runs > 0 ? 'AI spend (replays are free)' : 'AI spend on your runs' }} />
              </div>
            </motion.section>
          </div>
        )}
        <motion.section className="sc-score__ops" aria-label="In Agent Ops" initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.3 }}>
          <ProductMark product="agent-ops" size={24} />
          <div className="sc-score__opstext">
            <h2 className="sc-score__h">In Agent Ops</h2>
            <p className="n-body">
              {!empty && opsCounted && ops ? (
                <>
                  {ops.traces > 1 ? <>Your {ops.traces} runs left </> : <>Your run left </>}
                  <b>{ops.logLines.toLocaleString()}</b> log lines and <b>{ops.spans.toLocaleString()}</b> timed steps
                  {ops.traces > 1 ? ' across their traces' : ' in its trace'}
                  {ops.hours != null ? (
                    <>
                      . Signal Loop has given back about <b>{Math.round(ops.hours).toLocaleString()} hours</b> this period (the baselines are labelled assumptions).
                    </>
                  ) : (
                    '.'
                  )}
                </>
              ) : empty ? (
                'Every call you run shows up in the platform as log lines, timed steps, usage and cost, next to every other agent.'
              ) : (
                'Every run you did is in the platform as logs, timed steps, usage and a unit of work.'
              )}
            </p>
          </div>
          {!empty && sb && (sb.replayRuns > 0 || sb.liveRuns > 0) && (
            <div className="sc-score__badges">
              {sb.replayRuns > 0 && <Badge tone="info">{sb.replayRuns} replayed from a recorded live run</Badge>}
              {sb.liveRuns > 0 && <Badge tone="accent">{sb.liveRuns} live</Badge>}
            </div>
          )}
        </motion.section>
        <div className="sc-score__actions">
          <Button variant={empty ? 'secondary' : 'primary'} size="lg" iconRight={empty ? undefined : <IconArrowRight />} onClick={explore} data-testid="explore-freely" autoFocus={!empty}>
            Explore freely
          </Button>
          <Button variant="secondary" size="lg" onClick={() => leave('/ops')}>
            Open Agent Ops
          </Button>
          <Button variant="ghost" size="lg" onClick={() => leave('/write-up')}>
            Read the write-up
          </Button>
          <Button variant="ghost" size="lg" onClick={() => leave('/app/claude')} data-testid="scorecard-claude">
            Ask Claude about it
          </Button>
          {empty ? null : (
            <Button variant="ghost" size="lg" onClick={tour.restart}>
              Replay the presentation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
