/**
 * The Run view: one call moving through the real 10-step pipeline. Polls GET /runs/:id
 * (~600ms while running) and reveals steps with a human-followable dwell (useReveal).
 * Top: pipeline graph + lifecycle stepper. Left: transcript with redaction pills and
 * evidence highlights. Right: screen result, insight cards with confidence gauges and gate
 * results, the dropped-quote card. Bottom: trace (waterfall + per-step model/tokens/cost).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { STEP_KEYS, STEP_LABELS, type Insight, type StepKey } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Button } from '../../system/components/primitives/Button.jsx';
import { MonoId } from '../../uis/MonoId';
import { RunStateStepper, type StepperTerminal } from '../../uis/RunStateStepper';
import { StatusChip } from '../../uis/StatusChip';
import { EmptyState } from '../../uis/EmptyState';
import { Banner } from '../../uis/Banner';
import { RelativeTime } from '../../uis/RelativeTime';
import { ApiError } from '../api/client';
import { useRun, useThemes } from '../api/hooks';
import { AppPageHeader, ErrorState } from '../components/ui';
import { Hint } from '../components/Hint';
import { FileGlyph, IconReplay } from '../components/icons';
import { money, ms, STEP_HELP } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { useWorldIndex } from '../lib/world';
import { usePrefersReducedMotion, useTourState } from '../state';
import { track } from '../telemetry';
import { PipelineGraph } from './run/PipelineGraph';
import { DroppedCard, InsightCard, ScreenCard, TracePanel, type DroppedItem } from './run/RunParts';
import { Transcript, type Highlight } from './run/Transcript';
import { useReveal } from './run/useReveal';
import styles from './run/RunView.module.css';

const MODE_REASON: Record<string, string> = {
  budget_reached: 'The $15 live-AI viewer budget is used up, so this run replays a recorded live execution of the same file at real speed: the actual steps, outputs and timings.',
  live_failed: 'The live model call failed or ran slow, so the system fell back to a recorded live execution of this file instead of failing.',
  live_disabled: 'Live AI is switched off for this workspace, so this replays a recorded live execution of the same file at real speed.',
  seed: 'Seeded history: recorded from a live run during setup, replayed from its real run_steps rows.',
};

function formatFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'txt';
  return ['vtt', 'txt', 'md', 'eml', 'chat'].includes(ext) ? ext : 'txt';
}

export default function RunViewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, dataAsOf, refresh } = useRun(id);
  const { pace } = useTourState();
  const reduced = usePrefersReducedMotion();
  const world = useWorldIndex();
  const themes = useThemes();
  const reveal = useReveal(data, pace, reduced);
  const { label: modelLabel, rewrite: rewriteModels } = useModelLabels();

  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ insightId: string; n: number } | null>(null);
  const [mode, setMode] = useState<'after' | 'before'>('after');
  const [pickedStep, setPickedStep] = useState<StepKey | null>(null);
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    if (data && viewed.current !== data.run.id) {
      viewed.current = data.run.id;
      track('run_viewed', { runId: data.run.id, status: data.run.status, mode: data.run.mode });
    }
  }, [data]);

  const run = data?.run;
  const account = world.account(run?.accountId);
  const themeName = useCallback((tid: string | null) => (tid ? themes.data?.find((t) => t.id === tid)?.name ?? null : null), [themes.data]);

  const groundDone = reveal.done('ground');
  const insights = data?.insights ?? [];
  const kept = useMemo(() => insights.filter((i) => !(groundDone && i.gate === 'dropped')), [insights, groundDone]);

  const dropped: DroppedItem[] = useMemo(() => {
    if (!groundDone || !data) return [];
    const fromInsights = insights
      .filter((i) => i.gate === 'dropped')
      .map((i) => ({ id: i.id, summary: i.summary, type: i.type, quote: i.evidence[0]?.quote ?? '', bestMatch: i.evidence[0]?.matchedText ?? null, score: i.evidence[0]?.score ?? 0 }));
    const groundStep = data.steps.find((s) => s.key === 'ground');
    const detailList = (groundStep?.detail?.dropped ?? groundStep?.detail?.rejected) as Array<Record<string, unknown>> | undefined;
    const extra = (Array.isArray(detailList) ? detailList : [])
      .filter((d) => !fromInsights.some((f) => f.id === d.insightId || f.quote === d.quote))
      .map((d, i) => ({
        id: String(d.insightId ?? `drop-${i}`),
        summary: (d.summary as string) ?? null,
        type: (d.type as Insight['type']) ?? null,
        quote: String(d.quote ?? ''),
        bestMatch: (d.bestMatch as string) ?? (d.matchedText as string) ?? null,
        score: Number(d.score ?? 0),
      }));
    return [...fromInsights, ...extra];
  }, [groundDone, data, insights]);

  const highlights: Highlight[] = useMemo(() => {
    if (!groundDone) return [];
    const hs: Highlight[] = [];
    for (const i of kept) {
      const ev = i.evidence.find((e) => e.method !== 'failed');
      if (!ev) continue;
      hs.push({ insightId: i.id, turnId: ev.turnId, start: ev.start, end: ev.end, text: ev.matchedText ?? ev.quote, kind: ev.method === 'fuzzy' ? 'fuzzy' : 'grounded', label: `${i.type.replace('_', ' ')} · ${ev.method}${ev.method === 'fuzzy' ? ` ${ev.score.toFixed(2)}` : ''} · click to open` });
    }
    for (const d of dropped) {
      if (!d.bestMatch) continue;
      const src = insights.find((x) => x.id === d.id)?.evidence[0];
      hs.push({ insightId: d.id, turnId: src?.turnId ?? null, start: src?.start ?? null, end: src?.end ?? null, text: d.bestMatch, kind: 'dropped', label: `Closest match for a dropped quote · ${(d.score * 100).toFixed(0)}% similar` });
    }
    return hs;
  }, [groundDone, kept, dropped, insights]);

  const focusInsight = useCallback(
    (insightId: string) => {
      setSelected(insightId);
      setFocus((f) => ({ insightId, n: (f?.n ?? 0) + 1 }));
      const ins = insights.find((i) => i.id === insightId);
      emit({ name: 'evidence.focused', insightId, method: ins?.evidence[0]?.method ?? 'failed' });
    },
    [insights],
  );

  const selectFromTranscript = useCallback((insightId: string) => {
    setSelected(insightId);
    const el = document.getElementById(`insight-${insightId}`);
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }, []);

  if (error && !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="sl-page">
        <AppPageHeader title="Run" dataAsOf={null} breadcrumbs={[{ label: 'Runs', href: '/app/runs' }, { label: id }]} />
        {notFound ? (
          <EmptyState variant="no-data" title="Run not found" description={`No run ${id} in your workspace or the seeded history.`} action={<Button variant="secondary" onClick={() => navigate('/app/new')}>Start a new call</Button>} />
        ) : (
          <ErrorState error={error} onRetry={() => void refresh()} what="this run" />
        )}
      </div>
    );
  }

  if (loading || !data || !run) return <RunSkeleton id={id} />;

  const screenStep = reveal.steps.find((s) => s.key === 'screen');
  const extractDone = reveal.done('extract');
  const scoreDone = reveal.done('score');
  const screenDone = reveal.done('screen');
  const redactDone = reveal.done('redact');
  const stage = { grounded: groundDone, scored: scoreDone, themed: reveal.done('theme'), routed: reveal.done('route'), delivered: reveal.done('deliver') };
  const negative = screenDone && data.screen && !data.screen.actionable;
  const ingestStep = data.steps.find((s) => s.key === 'ingest');
  const duplicateOf = reveal.done('ingest') ? (ingestStep?.detail?.duplicateOf as string | null | undefined) : null;
  const visibleKept = kept;
  const reviewN = scoreDone ? visibleKept.filter((i) => i.gate === 'review').length : 0;
  const autoN = scoreDone ? visibleKept.filter((i) => i.gate === 'auto_route').length : 0;
  const lastRevealed = reveal.revealed > 0 ? STEP_KEYS[reveal.revealed - 1]! : null;
  const detailKey = pickedStep ?? (reveal.activeIdx >= 0 ? STEP_KEYS[reveal.activeIdx]! : lastRevealed) ?? 'ingest';
  const detailStep = reveal.steps.find((s) => s.key === detailKey)!;
  const shownCost = reveal.steps.filter((s) => s.display !== 'pending' && s.display !== 'running').reduce((a, s) => a + (s.costUsd ?? 0), 0);
  const failedStep = run.status === 'failed' ? data.steps.find((s) => s.status === 'failed') : undefined;

  const terminal: StepperTerminal | null = reveal.finished
    ? run.status === 'failed'
      ? { label: 'Failed', severity: 'red', at: run.finishedAt, message: failedStep?.summary ? rewriteModels(failedStep.summary) : null }
      : run.actionable === false
        ? { label: 'Nothing actionable', severity: 'neutral', at: run.finishedAt }
        : run.status === 'awaiting_review'
          ? { label: `Awaiting review (${run.reviewCount})`, severity: 'yellow', at: run.finishedAt }
          : { label: 'Completed', severity: 'green', at: run.finishedAt }
    : null;
  const lifecycleCurrent = reveal.done('route') ? 'routed' : scoreDone ? 'gated' : redactDone ? 'processing' : reveal.revealed > 0 ? 'processing' : 'queued';

  return (
    <div className="sl-page">
      <AppPageHeader
        title={run.callId ? `Run · ${run.callId}` : 'Run'}
        dataAsOf={dataAsOf}
        breadcrumbs={[{ label: 'Runs', href: '/app/runs' }, { label: run.filename }]}
      />

      {/* ------------------------------------------------ header + pipeline */}
      <section className={styles.top} aria-label="Pipeline">
        <div className={styles.topHead}>
          <FileGlyph format={formatFormat(run.filename)} size={38} />
          <div className={styles.topTitle}>
            <h2 className={styles.fileName} title={run.filename}>
              {run.filename}
            </h2>
            <div className={styles.topMeta}>
              <span>{account?.name ?? (run.accountId ? run.accountId : 'No account')}</span>
              {run.callId ? (
                <>
                  <span aria-hidden="true">·</span>
                  <MonoId value={run.callId} keep={12} />
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="sl-subtle">run</span> <MonoId value={run.id} keep={6} />
              <span aria-hidden="true">·</span>
              <span className="sl-subtle">sha256</span> <MonoId value={run.sha256} keep={6} />
              <span aria-hidden="true">·</span>
              <span className="sl-subtle">
                started <RelativeTime value={run.createdAt} />
              </span>
            </div>
          </div>
          <div className={styles.topBadges}>
            <Hint label={run.mode === 'live' ? 'This run called the real models (fast tier + independent fallback) through the gated, budgeted runtime key.' : MODE_REASON[run.modeReason ?? ''] ?? 'Replays a recorded live execution of the same file at real speed.'}>
              <span className={`${styles.mode} ${run.mode === 'live' ? styles.modeLive : styles.modeReplay}`} tabIndex={0}>
                <span className={styles.modeDot} aria-hidden="true" />
                {run.mode === 'live' ? 'Live' : 'Replay of a recorded live run'}
              </span>
            </Hint>
            <StatusChip
              tone={run.status === 'failed' ? 'danger' : !reveal.finished ? 'info' : run.status === 'awaiting_review' ? 'warning' : run.actionable === false ? 'neutral' : 'success'}
              pulse={!reveal.finished}
              size="md"
            >
              {!reveal.finished ? 'Running' : run.status === 'awaiting_review' ? 'Awaiting review' : run.status === 'failed' ? 'Failed' : run.actionable === false ? 'Nothing actionable' : 'Completed'}
            </StatusChip>
            <Button variant="tertiary" size="sm" onClick={() => { setPickedStep(null); reveal.replay(); }} disabled={!reveal.finished} title={reveal.finished ? 'Replay the reveal from the recorded steps' : 'Available when the run has finished'}>
              <IconReplay size={14} /> Replay
            </Button>
          </div>
        </div>

        <PipelineGraph steps={reveal.steps} selected={pickedStep} onSelect={(k) => setPickedStep((p) => (p === k ? null : k))} pace={pace} reduced={reduced} />

        <div className={styles.stepStrip} aria-live="polite">
          <span className={styles.stepStripNum}>{STEP_KEYS.indexOf(detailKey) + 1}/10</span>
          <span className={styles.stepStripName}>{STEP_LABELS[detailKey]}</span>
          <span className={styles.stepStripText}>
            {detailStep.display === 'pending' ? STEP_HELP[detailKey] : detailStep.display === 'running' ? `${STEP_HELP[detailKey]}` : (detailStep.summary ? rewriteModels(detailStep.summary) : STEP_HELP[detailKey])}
          </span>
          <span className={styles.stepStripFacts}>
            {detailStep.display !== 'pending' && detailStep.display !== 'running' ? (
              <>
                {detailStep.model ? <span>{modelLabel(detailStep.model)}</span> : <span className="sl-subtle">code, no model</span>}
                {detailStep.tokensIn != null ? <span className="sl-mono">{(detailStep.tokensIn + (detailStep.tokensOut ?? 0)).toLocaleString()} tok</span> : null}
                {detailStep.costUsd != null ? <span className="sl-mono">{money(detailStep.costUsd, { precise: true })}</span> : null}
                <span className="sl-mono">{ms(detailStep.durationMs)}</span>
              </>
            ) : detailStep.display === 'running' ? (
              <span className={styles.working}>working…</span>
            ) : null}
          </span>
        </div>

        <div className={styles.lifecycle}>
          <RunStateStepper
            stages={[
              { key: 'queued', label: 'Queued', at: run.createdAt },
              { key: 'processing', label: 'Processing' },
              { key: 'gated', label: 'Grounded & gated' },
              { key: 'routed', label: 'Routed & delivered' },
            ]}
            current={lifecycleCurrent}
            terminal={terminal}
          />
          <div className={styles.liveCost}>
            <span className={styles.liveCostLabel}>AI cost so far</span>
            <strong className="sl-mono">{money(shownCost, { precise: true })}</strong>
          </div>
        </div>
      </section>

      {failedStep && reveal.finished ? (
        <Banner tone="danger" title={`Run failed at ${STEP_LABELS[failedStep.key]}`} action={<Link to="/app/health">Dead-letter queue</Link>}>
          {(failedStep.summary ? rewriteModels(failedStep.summary) : null) ?? 'A step failed after its retries. A partial failure reads as a failure: nothing from this run was routed.'}
        </Banner>
      ) : null}
      {duplicateOf ? (
        <Banner tone="info" title="Duplicate upload: skipped at ingest" action={<Link to={`/app/runs/${duplicateOf}`}>Open the original run</Link>}>
          This file's SHA-256 matches an earlier upload, so the pipeline did no further work and spent nothing.
        </Banner>
      ) : null}

      {/* ------------------------------------------------ main grid */}
      <div className={styles.grid}>
        <div className={styles.left}>
          <Transcript
            turns={data.turns}
            redactions={data.redactions}
            highlights={highlights}
            mode={mode}
            onModeChange={setMode}
            focus={focus}
            onSelectInsight={selectFromTranscript}
            pending={!redactDone || data.turns.length === 0 && !reveal.finished}
            pendingLabel={reveal.revealed < 2 ? 'Parsing speakers and turns…' : 'Redacting personal data before any model sees it…'}
          />
        </div>

        <div className={styles.right}>
          <ScreenCard screen={screenDone ? data.screen : null} pending={!screenDone} model={modelLabel(screenStep?.model)} ms={screenStep?.durationMs ?? null} />

          <section className={styles.insights} aria-label="Insights" {...tourAnchor('run.insights')}>
            <header className={styles.insightsHead}>
              <h2 className={styles.insightsTitle}>Insights</h2>
              <span className={styles.insightsCount}>
                {!extractDone
                  ? reveal.activeIdx === STEP_KEYS.indexOf('extract')
                    ? 'extracting…'
                    : 'appear after the extract step'
                  : `${visibleKept.length} kept${groundDone ? ` · ${dropped.length} dropped` : ''}${scoreDone ? ` · ${autoN} auto-routed · ${reviewN} to review` : ''}`}
              </span>
            </header>

            {negative ? (
              <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <EmptyState
                  variant="no-data"
                  icon="✓"
                  title="Nothing actionable"
                  description="Screened as a friendly check-in with no feedback, requests, objections or risks. No insights were created and nothing was routed. The system doesn't invent work."
                />
              </motion.div>
            ) : duplicateOf ? (
              <EmptyState variant="no-data" title="No new insights" description="The original run already produced and routed this call's insights." />
            ) : !extractDone ? (
              <div className={styles.pendingCards} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`${styles.ghostCard} ${reveal.activeIdx === STEP_KEYS.indexOf('extract') ? styles.ghostActive : ''}`}>
                    <span style={{ width: '38%' }} />
                    <span style={{ width: '92%' }} />
                    <span style={{ width: '70%' }} />
                  </div>
                ))}
              </div>
            ) : visibleKept.length === 0 && dropped.length === 0 ? (
              <EmptyState variant="no-data" title="No insights in this call" description="The extract step returned an empty list: nothing in this conversation met the taxonomy." />
            ) : (
              <div className={styles.cards}>
                <AnimatePresence initial={false}>
                  {visibleKept.map((ins, idx) => (
                    <InsightCard
                      key={ins.id}
                      insight={ins}
                      index={idx}
                      stage={stage}
                      themeName={themeName(ins.themeId)}
                      ownerName={world.personName(ins.ownerId)}
                      delivery={data.deliveries.find((d) => d.insightId === ins.id) ?? null}
                      selected={selected === ins.id}
                      onFocus={() => focusInsight(ins.id)}
                      anchorGate={idx === 0}
                      reduced={reduced}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          {dropped.length > 0 ? <DroppedCard items={dropped} onFocus={focusInsight} reduced={reduced} /> : null}

          {reveal.finished && !negative && !duplicateOf && run.status !== 'failed' ? (
            <motion.div className={styles.done} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div>
                <strong>Done in {ms(run.durationMs)}</strong>
                <span className="sl-subtle">
                  {' '}
                  · {money(run.costUsd, { precise: true })} · {run.insightCount} insight{run.insightCount === 1 ? '' : 's'} · {run.droppedCount} dropped · {run.reviewCount} to review
                </span>
              </div>
              <div className={styles.doneActions}>
                {run.reviewCount > 0 ? (
                  <Button variant="primary" size="sm" onClick={() => navigate('/app/review')}>
                    Review {run.reviewCount} item{run.reviewCount === 1 ? '' : 's'}
                  </Button>
                ) : null}
                <Button variant="tertiary" size="sm" onClick={() => navigate('/app/routing')}>
                  See routing
                </Button>
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>

      <TracePanel runId={run.id} steps={reveal.steps} totalCost={shownCost} totalMs={reveal.finished ? run.durationMs : null} />
    </div>
  );
}

function RunSkeleton({ id }: { id: string }) {
  return (
    <div className="sl-page" role="status" aria-label="Loading run">
      <AppPageHeader title="Run" dataAsOf={null} breadcrumbs={[{ label: 'Runs', href: '/app/runs' }, { label: id }]} />
      <section className={styles.top} aria-hidden="true">
        <div className={styles.topHead}>
          <span className={styles.sk} style={{ width: 38, height: 38 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className={styles.sk} style={{ width: '40%', height: 16 }} />
            <span className={styles.sk} style={{ width: '60%', height: 11 }} />
          </div>
        </div>
        <div className={styles.skGraph}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={styles.skNode}>
              <span className={styles.sk} style={{ width: 44, height: 44, borderRadius: '50%' }} />
              <span className={styles.sk} style={{ width: '70%', height: 10 }} />
            </span>
          ))}
        </div>
      </section>
      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.skPanel} style={{ height: 520 }} />
        </div>
        <div className={styles.right}>
          <div className={styles.skPanel} style={{ height: 140 }} />
          <div className={styles.skPanel} style={{ height: 220 }} />
          <div className={styles.skPanel} style={{ height: 220 }} />
        </div>
      </div>
    </div>
  );
}
