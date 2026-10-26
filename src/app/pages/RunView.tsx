/**
 * A conversation: one file moving through the ten-step pipeline. Polls GET /runs/:id (~600ms
 * while running) and reveals steps with a human-followable dwell (useReveal), so a fast run
 * stays watchable. Top: the header and pipeline progress. Left: the transcript, with hidden
 * personal details and the quotes behind each insight. Right: triage, insights (score, gate,
 * second opinion, routing), any dropped quotes, and the per-step trace.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { STEP_KEYS, type Insight, type StepKey } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { stepsCostUsd } from '../../shared/format';
import { inferDocKind } from '../../shared/platform';
import { Button, ButtonLink, Callout, Card, EmptyState, Page, PageHeader, Skeleton, useCrumbs, useToast } from '../../ds';
import { IconBuilding, IconCheckCircle, IconExternal, IconInbox, IconPlus, IconRefresh } from '../../ds/icons';
import { api, ApiError } from '../api/client';
import { invalidate, keys, useRun, useThemes } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { docKindLabel, ErrorState, MODE_REASON, ModeBadge, RunStatusBadge, SourceLabel, When } from '../components/domain';
import { money, ms } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { useWorldIndex } from '../lib/world';
import { usePrefersReducedMotion, useTourState } from '../state';
import { track } from '../telemetry';
import { PipelineProgress } from './run/PipelineGraph';
import { DroppedCard, InsightRow, InsightSkeletons, TraceCard, TriageCard, type Diversion, type DroppedItem } from './run/RunParts';
import { STEP_NAME, stepStory, tidySummary } from './run/stepText';
import { redactedPlain, Transcript, type Highlight } from './run/Transcript';
import { useReveal } from './run/useReveal';
import styles from './run/RunView.module.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function RunViewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, refresh } = useRun(id);
  const [search] = useSearchParams();
  /** Opened from New conversation as "your earlier run" (a duplicate): say so, and offer a fresh live run. */
  const earlier = search.get('earlier') === '1';
  const toast = useToast();
  const [rerunning, setRerunning] = useState(false);
  const { pace } = useTourState();
  const reduced = usePrefersReducedMotion();
  const world = useWorldIndex();
  const themes = useThemes();
  const reveal = useReveal(data, pace, reduced);
  const models = useModelLabels();

  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ insightId: string; n: number } | null>(null);
  const [mode, setMode] = useState<'after' | 'before'>('after');
  const [pickedStep, setPickedStep] = useState<StepKey | null>(null);
  const viewed = useRef<string | null>(null);

  const run = data?.run;
  const name = run?.filename ?? 'Conversation';
  useDocumentTitle(name);
  useCrumbs([{ label: name }], [name]);

  useEffect(() => {
    if (data && viewed.current !== data.run.id) {
      viewed.current = data.run.id;
      track('run_viewed', { runId: data.run.id, status: data.run.status, mode: data.run.mode });
    }
  }, [data]);

  // A different conversation (Run again, or a link) starts with nothing picked.
  useEffect(() => {
    setPickedStep(null);
    setSelected(null);
    setFocus(null);
  }, [id]);

  const themeName = useCallback((tid: string | null) => (tid ? (themes.data?.find((t) => t.id === tid)?.name ?? null) : null), [themes.data]);

  const groundDone = reveal.done('ground');
  const insights = useMemo(() => data?.insights ?? [], [data]);
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
      hs.push({
        insightId: i.id,
        turnId: ev.turnId,
        start: ev.start,
        end: ev.end,
        text: ev.matchedText ?? ev.quote,
        kind: ev.method === 'fuzzy' ? 'fuzzy' : 'grounded',
        label: `Quote behind “${redactedPlain(i.summary)}”. Click to open it.`,
      });
    }
    for (const d of dropped) {
      if (!d.bestMatch) continue;
      const src = insights.find((x) => x.id === d.id)?.evidence[0];
      hs.push({
        insightId: d.id,
        turnId: src?.turnId ?? null,
        start: src?.start ?? null,
        end: src?.end ?? null,
        text: d.bestMatch,
        kind: 'dropped',
        label: `Closest text to a dropped quote, ${Math.round(d.score * 100)}% similar`,
      });
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

  const runAgain = async () => {
    if (!run?.fileId) return;
    setRerunning(true);
    try {
      const res = await api.createRun({ fileId: run.fileId, mode: 'auto', rerun: true });
      emit({ name: 'run.started', runId: res.data.runId, fileId: run.fileId, mode: res.data.mode });
      track('run_created', { runId: res.data.runId, fileId: run.fileId, source: 'library', mode: res.data.mode, rerun: true, duplicate: !!res.data.duplicate });
      invalidate(keys.runs, keys.session);
      navigate(`/app/runs/${res.data.runId}`);
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t start a new run', body: err instanceof ApiError ? err.message : 'Try again in a moment.' });
    } finally {
      setRerunning(false);
    }
  };

  if (error && !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page>
        <PageHeader title="Conversation" />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<IconInbox />}
              title="Conversation not found"
              description="It isn’t in this workspace or the sample history. It may have been removed."
              actions={
                <>
                  <ButtonLink to="/app/runs" size="sm">
                    All conversations
                  </ButtonLink>
                  <ButtonLink to="/app/new" variant="primary" size="sm" icon={<IconPlus size={14} />}>
                    New conversation
                  </ButtonLink>
                </>
              }
            />
          ) : (
            <ErrorState error={error} onRetry={() => void refresh()} what="this conversation" />
          )}
        </Card>
      </Page>
    );
  }

  if (loading || !data || !run) return <RunSkeleton />;

  // ------------------------------------------------ derived view state
  const screenStep = reveal.steps.find((s) => s.key === 'screen')!;
  const extractDone = reveal.done('extract');
  const scoreDone = reveal.done('score');
  const screenDone = reveal.done('screen');
  const redactDone = reveal.done('redact');
  const extractIdx = STEP_KEYS.indexOf('extract');
  const stage = { grounded: groundDone, scored: scoreDone, themed: reveal.done('theme'), routed: reveal.done('route'), delivered: reveal.done('deliver') };
  const negative = screenDone && !!data.screen && !data.screen.actionable;
  const ingestStep = data.steps.find((s) => s.key === 'ingest');
  const duplicateOf = reveal.done('ingest') ? (ingestStep?.detail?.duplicateOf as string | null | undefined) : null;
  const reviewN = scoreDone ? kept.filter((i) => i.gate === 'review').length : 0;
  const autoN = scoreDone ? kept.filter((i) => i.gate === 'auto_route').length : 0;
  // Unless a step is picked: the running step, else the failed one, else the last step that did something.
  const revealedSteps = reveal.steps.slice(0, reveal.revealed);
  const lastRevealed = revealedSteps.find((s) => s.display === 'failed')?.key ?? [...revealedSteps].reverse().find((s) => s.display !== 'skipped')?.key ?? null;
  const detailKey: StepKey = pickedStep ?? (reveal.activeIdx >= 0 ? STEP_KEYS[reveal.activeIdx]! : lastRevealed) ?? 'ingest';
  const detailStep = reveal.steps.find((s) => s.key === detailKey)!;
  const shownCost = stepsCostUsd(reveal.steps.filter((s) => s.display !== 'pending' && s.display !== 'running'));
  const failedStep = run.status === 'failed' ? data.steps.find((s) => s.status === 'failed') : undefined;
  const finished = reveal.finished;
  const inProgress = !finished;
  const shownStatus = finished ? run.status : run.status === 'queued' && reveal.revealed === 0 ? 'queued' : 'running';
  const rewrite = (text: string) => models.rewrite(text);
  // What it is comes from triage: shown once that step is revealed, never ahead of it.
  const docKind = screenDone
    ? docKindLabel(run.docKind ?? data.screen?.doc_kind ?? inferDocKind((data.steps.find((s) => s.key === 'normalize')?.detail?.format as string | undefined) ?? null, data.screen?.call_kind))
    : null;
  const account = world.account(run.accountId);
  const runningName = reveal.activeIdx >= 0 ? STEP_NAME[STEP_KEYS[reveal.activeIdx]!] : null;

  const progressDescription = !finished
    ? runningName
      ? `Step ${reveal.activeIdx + 1} of ${STEP_KEYS.length}: ${runningName}`
      : 'Starting'
    : failedStep
      ? `Stopped at ${STEP_NAME[failedStep.key]}`
      : `Finished in ${ms(run.durationMs)}`;

  const routeDecisions = (data.steps.find((s) => s.key === 'route')?.detail?.decisions ?? []) as Array<{ insightId?: string; diverted?: { why?: string; channel?: string } }>;
  const diversionFor = (insightId: string): Diversion => {
    const d = Array.isArray(routeDecisions) ? routeDecisions.find((x) => x.insightId === insightId)?.diverted : undefined;
    return d && (d.why === 'not_connected' || d.why === 'owner_inactive') ? { why: d.why, channel: d.channel ?? '' } : null;
  };
  const stoppedEarly = !!failedStep && finished && (!extractDone || kept.length === 0);
  const insightsDescription = stoppedEarly
    ? 'Nothing to send'
    : !extractDone
      ? reveal.activeIdx === extractIdx
        ? 'Reading for product feedback'
        : 'Appear after the Extract step'
      : negative
        ? 'Nothing to send'
        : [
            plural(kept.length, 'insight'),
            scoreDone && autoN ? `${autoN} sent automatically` : null,
            scoreDone && reviewN ? `${reviewN} to review` : null,
            groundDone && dropped.length ? `${dropped.length} dropped` : null,
          ]
            .filter(Boolean)
            .join(', ');

  return (
    <Page>
      <PageHeader
        title={<span title={run.filename}>{run.filename}</span>}
        badge={
          <span className={styles.badges}>
            <RunStatusBadge status={shownStatus} />
            {run.mode === 'replay' ? <ModeBadge run={run} /> : null}
          </span>
        }
        description={run.mode === 'replay' ? (MODE_REASON[run.modeReason ?? ''] ?? 'A recorded live run of this file, replayed at real speed.') : undefined}
        meta={
          <>
            <span className={styles.metaItem}>
              <IconBuilding size={14} />
              <span className="ds-truncate">{account?.name ?? (run.accountId ? run.accountId : 'No account')}</span>
            </span>
            <SourceLabel source={run.source} />
            {docKind ? <span className={styles.metaItem}>{docKind}</span> : null}
            <span className={styles.metaBreak} aria-hidden="true" />
            <span className={styles.metaItem}>
              <span className="ds-subtle">Received</span>
              <When value={run.createdAt} />
            </span>
            <span className={styles.metaItem}>
              <span className="ds-subtle">AI cost</span>
              <span className="ds-num">{money(shownCost, { precise: true })}</span>
            </span>
            <span className={styles.metaItem}>
              <span className="ds-subtle">Took</span>
              <span className="ds-num">{finished ? ms(run.durationMs) : '—'}</span>
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink to={`/ops/traces/${run.id}`} iconRight={<IconExternal size={14} />}>
              Open in Agent Ops
            </ButtonLink>
            {finished && run.fileId && !earlier ? (
              <Button icon={<IconRefresh size={14} />} loading={rerunning} onClick={() => void runAgain()}>
                Run again
              </Button>
            ) : null}
            {finished && run.reviewCount > 0 ? (
              <ButtonLink to="/app/review" variant="primary">
                Review {plural(run.reviewCount, 'insight')}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {failedStep && finished ? (
        <Callout
          tone="danger"
          title={`Stopped at ${STEP_NAME[failedStep.key]}`}
          actions={
            <ButtonLink to="/app/health" size="sm">
              Usage and health
            </ButtonLink>
          }
        >
          {tidySummary(failedStep.summary, rewrite) ?? 'A step failed after retrying.'} Nothing from this conversation was sent.
        </Callout>
      ) : null}
      {earlier ? (
        <Callout
          tone="info"
          title="Your earlier run of this file"
          actions={
            run.fileId ? (
              <Button variant="primary" size="sm" loading={rerunning} onClick={() => void runAgain()}>
                Run again live
              </Button>
            ) : undefined
          }
        >
          Nothing new is running. The steps, timings and costs are the ones recorded <When value={run.createdAt} />.
        </Callout>
      ) : null}
      {duplicateOf ? (
        <Callout
          tone="info"
          title="Same file as an earlier upload"
          actions={
            <ButtonLink to={`/app/runs/${duplicateOf}`} size="sm">
              Open the original
            </ButtonLink>
          }
        >
          It wasn’t processed again, and nothing was spent.
        </Callout>
      ) : null}

      <Card
        title="Progress"
        description={progressDescription}
        actions={
          finished ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconRefresh size={14} />}
              onClick={() => {
                setPickedStep(null);
                reveal.replay();
              }}
            >
              Replay steps
            </Button>
          ) : null
        }
        attrs={{ 'aria-label': 'Pipeline progress' }}
      >
        <PipelineProgress
          steps={reveal.steps}
          selected={detailKey}
          onSelect={(k) => setPickedStep((p) => (p === k ? null : k))}
          story={stepStory(detailStep, { screen: data.screen, insights, rewrite })}
          modelLabel={models.label(detailStep.model)}
          stopped={finished && run.status === 'failed'}
        />
      </Card>

      <div className={styles.grid}>
        <div className={styles.main}>
          <Transcript
            turns={data.turns}
            redactions={data.redactions}
            highlights={highlights}
            mode={mode}
            onModeChange={setMode}
            focus={focus}
            activeInsight={selected}
            onSelectInsight={selectFromTranscript}
            pending={!finished && (!redactDone || data.turns.length === 0)}
            pendingLabel={reveal.revealed < 2 ? 'Reading speakers and lines' : 'Hiding personal details before any AI sees the text'}
            emptyLabel={failedStep && !redactDone ? `Not shown: the run stopped at ${STEP_NAME[failedStep.key]}, before personal details were hidden.` : 'No lines could be read from this file.'}
          />
        </div>

        <div className={styles.side}>
          <TriageCard
            screen={screenDone ? data.screen : null}
            pending={!screenDone}
            notRun={!!failedStep && finished && !screenDone}
            running={reveal.activeIdx === STEP_KEYS.indexOf('screen')}
            model={models.label(screenStep.model)}
            took={screenStep.durationMs}
            docKind={docKind}
          />

          <Card title="Insights" description={insightsDescription} flush attrs={{ ...tourAnchor('run.insights'), 'aria-label': 'Insights' }}>
            {stoppedEarly ? (
              <EmptyState compact icon={<IconInbox />} title="No insights" description={`The run stopped at ${STEP_NAME[failedStep!.key]}, so nothing was found or sent.`} />
            ) : negative ? (
              <EmptyState
                compact
                icon={<IconCheckCircle />}
                title="Nothing actionable"
                description="No product feedback in this conversation. Nothing was created or sent, which is the right outcome."
              />
            ) : duplicateOf ? (
              <EmptyState compact icon={<IconInbox />} title="No new insights" description="The original run already found and sent what was in this file." />
            ) : !extractDone ? (
              <InsightSkeletons />
            ) : kept.length === 0 && dropped.length === 0 ? (
              <EmptyState compact icon={<IconCheckCircle />} title="No product feedback found" description="Nothing in this conversation matched a type of feedback Signal Loop tracks." />
            ) : kept.length === 0 ? (
              <EmptyState compact icon={<IconInbox />} title="No insights kept" description="Every quote failed the check, so nothing was sent." />
            ) : (
              kept.map((ins, idx) => (
                <InsightRow
                  key={ins.id}
                  insight={ins}
                  stage={stage}
                  inProgress={inProgress}
                  themeName={themeName(ins.themeId)}
                  ownerName={ins.ownerId ? world.personName(ins.ownerId) : null}
                  delivery={data.deliveries.find((d) => d.insightId === ins.id) ?? null}
                  diversion={diversionFor(ins.id)}
                  selected={selected === ins.id}
                  onFocus={() => focusInsight(ins.id)}
                  anchorGate={idx === 0}
                  opinionModel={models.label(ins.secondOpinion?.model)}
                />
              ))
            )}
          </Card>

          {dropped.length > 0 ? <DroppedCard items={dropped} onFocus={focusInsight} /> : null}

          <TraceCard runId={run.id} steps={reveal.steps} modelLabel={models.label} totalCost={shownCost} totalMs={finished ? run.durationMs : null} />
        </div>
      </div>
    </Page>
  );
}

/** First load: the page's shape, so nothing jumps when the data arrives. */
function RunSkeleton() {
  return (
    <Page attrs={{ 'aria-busy': 'true', 'aria-label': 'Loading conversation' }}>
      <div className={styles.skeletonHeader}>
        <Skeleton width="min(320px, 80%)" height={24} />
        <Skeleton width="min(480px, 100%)" height={12} />
      </div>
      <Card title="Progress">
        <div className={styles.skeletonSteps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={styles.skeletonStep}>
              <Skeleton height={3} radius={999} />
              <Skeleton width="70%" height={10} />
              <Skeleton width="40%" height={8} />
            </div>
          ))}
        </div>
      </Card>
      <div className={styles.grid}>
        <div className={styles.main}>
          <Card title="Transcript">
            <div className={styles.skeletonLines}>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} width={`${90 - ((i * 17) % 35)}%`} height={10} />
              ))}
            </div>
          </Card>
        </div>
        <div className={styles.side}>
          <Card title="Triage">
            <div className={styles.skeletonLines}>
              <Skeleton width="60%" height={10} />
              <Skeleton width="40%" height={10} />
              <Skeleton width="50%" height={10} />
            </div>
          </Card>
          <Card title="Insights" flush>
            <InsightSkeletons count={2} />
          </Card>
        </div>
      </div>
    </Page>
  );
}
