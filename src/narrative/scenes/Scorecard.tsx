/**
 * 16 · Scorecard. What you did and what the system did, with real numbers from the
 * viewer's own workspace and from Agent Ops. Then "Explore freely" unlocks everything.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button, Display, Lede, Reveal, Stat, Chip } from '../components';
import { useCalm } from '../hooks';
import { loadScoreboard, tourApi, type Scoreboard } from '../../tour/api';
import type { RunDetail } from '../../shared/contracts';
import { useTour } from '../../tour/engine/TourProvider';
import { PLATFORM_API_BASE, SIGNAL_LOOP_AGENT_ID, type AgentImpact, type LogEntry, type Span } from '../../shared/platform-contracts';

type OpsFacts = { logLines: number; spans: number; hours: number | null; ok: boolean };

async function pget<T>(path: string): Promise<T> {
  const r = await fetch(`${PLATFORM_API_BASE}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(String(r.status));
  const b = (await r.json()) as { data?: T } | T;
  return b && typeof b === 'object' && 'data' in (b as object) ? (b as { data: T }).data : (b as T);
}

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
  const traces = new Set<string>();
  await Promise.all(
    runIds.slice(0, 8).map(async (id) => {
      try {
        const l = await pget<{ rows: LogEntry[] }>(`/logs?runId=${encodeURIComponent(id)}`);
        logLines += l.rows.length;
        l.rows.forEach((r) => traces.add(r.traceId));
        ok = true;
      } catch {
        /* ignore */
      }
    }),
  );
  await Promise.all(
    [...traces].slice(0, 8).map(async (t) => {
      try {
        const s = await pget<{ spans: Span[] }>(`/traces/${encodeURIComponent(t)}`);
        spans += s.spans.length;
      } catch {
        /* ignore */
      }
    }),
  );
  return { logLines, spans, hours, ok };
}

type Tile = { v?: number; s?: string; text?: string; l: string };

function TileView({ t }: { t: Tile }) {
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
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const explore = () => {
    tour.finish();
    navigate('/app/new');
  };

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
  const ev = run ? run.insights.flatMap((i) => i.evidence) : [];
  const grounded = ev.filter((e) => e.method !== 'failed').length;
  const redacted = run ? run.redactions.reduce((a, r) => a + r.count, 0) : 0;
  const sysAll: (Tile | null)[] = [
    { v: sb?.insights ?? 0, l: sb?.insights === 1 ? 'insight extracted' : 'insights extracted' },
    sb && sb.dropped > 0
      ? { v: sb.dropped, l: sb.dropped === 1 ? 'made-up quote rejected' : 'made-up quotes rejected' }
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
  const lede = !sb
    ? 'What you did, and what the system did.'
    : sb.ok
      ? 'Counted from your own workspace and this session, not a script.'
      : 'Live figures were unavailable, so these counts come from this session only.';

  return (
    <div className="n-grid sc-score" data-testid="scorecard">
      <div className="n-col-12">
        <Reveal className="n-stack">
          <Reveal.Item>
            <Display size="lg" as="h2">
              Here’s what <em>you</em> just did.
            </Display>
          </Reveal.Item>
          <Reveal.Item>
            <Lede>{lede}</Lede>
          </Reveal.Item>
        </Reveal>
      </div>
      <Reveal className="n-col-6 n-card sc-score__panel" delay={0.2}>
        <Reveal.Item>
          <span className="n-label">You</span>
        </Reveal.Item>
        <div className="sc-score__stats">
          {you.map((x) => (
            <Reveal.Item key={x.l}>
              <TileView t={x} />
            </Reveal.Item>
          ))}
        </div>
      </Reveal>
      <Reveal className="n-col-6 n-card n-card--accent sc-score__panel" delay={0.35}>
        <Reveal.Item>
          <span className="n-label" style={{ color: 'var(--n-accent)' }}>The system</span>
        </Reveal.Item>
        <div className="sc-score__stats">
          {sys.map((x) => (
            <Reveal.Item key={x.l}>
              <TileView t={x} />
            </Reveal.Item>
          ))}
          <Reveal.Item>
            <Stat value={sb?.costUsd ?? 0} prefix="$" decimals={sb && sb.costUsd < 0.1 ? 4 : 2} label={sb && sb.liveRuns === 0 && sb.runs > 0 ? 'AI spend (replays are free)' : 'AI spend on your runs'} size="sm" tone="accent" />
          </Reveal.Item>
        </div>
      </Reveal>
      <motion.div className="n-col-12 sc-score__ops" initial={calm ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.6, delay: calm ? 0 : 0.6 }}>
        <span className="n-label">In Agent Ops</span>
        <p className="n-body">
          {ops && ops.ok ? (
            <>
              Your session generated <b>{ops.logLines.toLocaleString()}</b> log lines across <b>{ops.spans.toLocaleString()}</b> spans
              {ops.hours != null ? (
                <>
                  . Signal Loop has returned about <b>{Math.round(ops.hours).toLocaleString()} hours</b> this period (baselines are labelled assumptions).
                </>
              ) : (
                '.'
              )}
            </>
          ) : (
            'Every run you did is in the platform as structured logs, spans, usage events and a work unit.'
          )}
        </p>
        <div className="n-row">
          {sb && sb.replayRuns > 0 && <Chip tone="indigo">{sb.replayRuns} replayed from a recorded live run</Chip>}
          {sb && sb.liveRuns > 0 && <Chip tone="accent">{sb.liveRuns} live</Chip>}
        </div>
      </motion.div>
      <div className="n-col-12 sc-score__actions">
        <Button size="lg" arrow onClick={explore} data-testid="explore-freely" autoFocus>
          Explore freely
        </Button>
        <Button variant="ghost" size="lg" onClick={() => navigate('/ops')}>
          Open Agent Ops
        </Button>
        <Button variant="quiet" onClick={() => navigate('/write-up')}>
          Read the write-up
        </Button>
        <Button variant="quiet" onClick={tour.restart}>
          Replay the walkthrough
        </Button>
      </div>
    </div>
  );
}
