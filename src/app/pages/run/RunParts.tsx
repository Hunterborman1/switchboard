/**
 * Conversation page building blocks: the triage card, insight rows (with the score, the gate,
 * the decision model's second opinion and where it went) and the dropped-quote card. Step timing
 * lives in ./Timing.tsx. All on the design system; walkthrough anchors live on the same elements.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { THRESHOLDS, type Delivery, type Insight, type ScreenOutput } from '../../../shared/contracts';
import { SIGNAL_LOOP_AGENT_ID } from '../../../shared/platform-contracts';
import { ANALYSES, CHANNEL_CONNECTOR, CHANNEL_LABEL } from '../../../shared/platform';
import { tourAnchor } from '../../../tour/anchors';
import { Badge, Callout, Card, ConnectorMark, CopyText, cx, KeyValue, Meter, Quote, Skeleton, Spinner, Tooltip } from '../../../ds';
import { IconInbox } from '../../../ds/icons';
import { GateBadge, SeverityBadge, SimulatedBadge, SIMULATED_TIP, TypeLabel } from '../../components/domain';
import { AREA_LABEL, ms } from '../../lib/labels';
import { INSTANT_STEP_HELP } from '../../../shared/format';
import type { DisplayStep } from './useReveal';
import { RedactedText, redactedPlain } from './Transcript';
import { languageName } from './stepText';
import styles from './RunParts.module.css';

// ---------------------------------------------------------------- triage

/** The meeting type, for calls and meetings only (email and notes already say what they are). */
const CALL_KIND: Record<string, string> = { qbr: 'QBR', check_in: 'Check-in', renewal: 'Renewal', escalation: 'Escalation', onboarding: 'Onboarding' };
const COMPLEXITY: Record<string, string> = { clean: 'Clean', noisy: 'Noisy', very_noisy: 'Very noisy' };

function AnalysisChips({ ids }: { ids: string[] }) {
  return (
    <span className={styles.chips}>
      {ids.map((id) => {
        const def = ANALYSES.find((a) => a.id === id);
        if (!def) return null;
        return def.availability === 'built' ? (
          <Badge key={id} tone="accent" dot>
            {def.name}
          </Badge>
        ) : (
          <Tooltip key={id} label={`${def.name} would run here. It isn’t built yet.`}>
            <span tabIndex={0} className={styles.chipWrap}>
              <Badge outline>
                {def.name}
                <span className={styles.notBuilt}>Not built</span>
              </Badge>
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

export function TriageCard({
  screen,
  pending,
  notRun,
  running,
  model,
  took,
  docKind,
}: {
  screen: ScreenOutput | null;
  pending: boolean;
  /** The run stopped before triage. */
  notRun: boolean;
  running: boolean;
  model: string | null;
  took: number | null;
  docKind: string | null;
}) {
  const meta = pending ? (
    running ? (
      <span className={styles.cardMeta}>
        <Spinner /> Deciding
      </span>
    ) : (
      <span className={styles.cardMeta}>Waiting</span>
    )
  ) : (
    <span className={styles.cardMeta}>
      <span>{model ?? 'No AI'}</span>
      <span className="ds-num">{ms(took)}</span>
    </span>
  );

  if (notRun) {
    return (
      <Card title="Triage" description="What this is and what runs on it." actions={<span className={styles.cardMeta}>Not run</span>} attrs={{ ...tourAnchor('run.screen'), 'aria-label': 'Triage' }}>
        <p className={styles.notRun}>The run stopped before triage, so nothing was decided.</p>
      </Card>
    );
  }

  if (pending || !screen) {
    return (
      <Card title="Triage" description="What this is and what runs on it." actions={meta} attrs={{ ...tourAnchor('run.screen'), 'aria-label': 'Triage' }}>
        <KeyValue
          className={styles.triageKv}
          items={['What it is', 'Language', 'Product feedback', 'Hidden instructions', 'Analyses'].map((label, i) => ({
            label,
            value: <Skeleton width={[120, 72, 40, 88, 96][i]} height={10} style={{ marginTop: 4 }} />,
          }))}
        />
      </Card>
    );
  }

  const analyses = screen.analyses?.length ? screen.analyses : screen.actionable ? ['product_feedback'] : [];
  const complexity = screen.complexity ?? null;
  const kind = CALL_KIND[screen.call_kind] ?? null;
  const items: { label: ReactNode; value: ReactNode }[] = [
    {
      label: 'What it is',
      value: (
        <span className={styles.inline}>
          <span>{docKind ?? 'Conversation'}</span>
          {kind ? <span className="ds-subtle">{kind}</span> : null}
        </span>
      ),
    },
    { label: 'Language', value: languageName(screen.language) },
    {
      label: 'Product feedback',
      value: screen.actionable ? (
        <Badge tone="success">Yes</Badge>
      ) : (
        <span className={styles.inline}>
          <Badge>No</Badge>
          <span className="ds-subtle">Nothing to extract</span>
        </span>
      ),
    },
  ];
  if (complexity) {
    items.push({
      label: 'Noise',
      value: COMPLEXITY[complexity] ?? complexity,
    });
  }
  items.push(
    { label: 'Hidden instructions', value: screen.injection_suspected ? <Badge tone="danger">Found</Badge> : <span className={styles.ok}>None found</span> },
    { label: 'Analyses', value: analyses.length ? <AnalysisChips ids={analyses} /> : <span className="ds-subtle">None apply</span> },
  );
  if (screen.reason)
    items.push({
      label: 'Why',
      value: (
        <span className="ds-muted">
          <RedactedText text={screen.reason} />
        </span>
      ),
    });

  return (
    <Card title="Triage" description="What this is and what runs on it." actions={meta} attrs={{ ...tourAnchor('run.screen'), 'aria-label': 'Triage' }}>
      <div className={styles.triage}>
        <KeyValue className={styles.triageKv} items={items} />
        {screen.injection_suspected ? (
          <Callout tone="warning" title="Prompt injection caught and ignored">
            <p className={styles.calloutText}>The file contains instructions aimed at an AI. They were read as plain text, nothing acted on them, and the attempt was logged.</p>
            {screen.injection_excerpt ? (
              <figure className={styles.inert}>
                <figcaption className={styles.inertCaption}>Quoted from the file, not acted on</figcaption>
                <pre className={styles.inertText}>{screen.injection_excerpt}</pre>
              </figure>
            ) : null}
          </Callout>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- insights

export type CardStage = { grounded: boolean; scored: boolean; themed: boolean; routed: boolean; delivered: boolean };

function matchWords(ev: Insight['evidence'][number]): string {
  if (ev.method === 'fuzzy') return `Close match, ${Math.round(ev.score * 100)}% similar`;
  if (ev.method === 'normalized') return 'Found in the conversation';
  return 'Found word for word';
}

function scoreTone(v: number): 'accent' | 'warning' {
  return v >= THRESHOLDS.autoRoute ? 'accent' : 'warning';
}

function Mentions({ mentions }: { mentions: NonNullable<Delivery['mentions']> }) {
  const order = { owner: 0, csm: 1, watcher: 2 } as const;
  const sorted = [...mentions].sort((a, b) => order[a.role] - order[b.role]);
  const lead = sorted.filter((m) => m.role === 'owner');
  const cc = sorted.filter((m) => m.role !== 'owner');
  return (
    <span className={styles.mentions}>
      {lead.map((m) => m.handle).join(', ')}
      {cc.length ? (
        <>
          {lead.length ? ', ' : ''}
          <span className="ds-subtle">cc </span>
          {cc.map((m) => m.handle).join(', ')}
        </>
      ) : null}
    </span>
  );
}

/** A matching rule that couldn't deliver, so the insight went to the triage queue instead. */
export type Diversion = { why: 'not_connected' | 'owner_inactive'; channel: string } | null;

function diversionText(d: NonNullable<Diversion>): string {
  if (d.why === 'owner_inactive') return 'The owner is no longer in the directory, so it went to the triage queue.';
  const name = (CHANNEL_LABEL as Record<string, string>)[d.channel] ?? d.channel;
  return `${name} isn’t connected, so it went to the triage queue.`;
}

export function InsightRow({
  insight,
  stage,
  inProgress,
  themeName,
  ownerName,
  delivery,
  diversion,
  selected,
  onFocus,
  anchorGate,
  opinionModel,
}: {
  insight: Insight;
  stage: CardStage;
  inProgress: boolean;
  themeName: string | null;
  ownerName: string | null;
  delivery: Delivery | null;
  diversion: Diversion;
  selected: boolean;
  onFocus: () => void;
  anchorGate: boolean;
  opinionModel: string | null;
}) {
  const ev = insight.evidence.find((e) => e.method !== 'failed') ?? insight.evidence[0];
  const quote = ev ? (stage.grounded ? (ev.matchedText ?? ev.quote) : ev.quote) : null;
  const v = Math.max(0, Math.min(1, insight.confidenceFinal));
  const op = insight.secondOpinion ?? null;

  const routeFacts: { label: ReactNode; value: ReactNode }[] = [];
  if (stage.themed) {
    routeFacts.push({
      label: 'Theme',
      value: insight.themeId ? (
        <Link to={`/app/themes/${insight.themeId}`} className={styles.link}>
          {themeName ?? 'Open theme'}
        </Link>
      ) : (
        <span className="ds-muted">Started a new theme</span>
      ),
    });
  } else if (inProgress) {
    routeFacts.push({ label: 'Theme', value: <Skeleton width={160} height={10} style={{ marginTop: 4 }} /> });
  }
  if (stage.routed) {
    if (insight.gate === 'review') {
      routeFacts.push({
        label: 'Owner',
        value: (
          <span className={styles.inline}>
            <Link to={`/app/review/${insight.id}`} className={styles.link}>
              Waiting for review
            </Link>
            {ownerName ? <span className="ds-subtle">then {ownerName}</span> : null}
          </span>
        ),
      });
    } else if (insight.gate === 'held') {
      routeFacts.push({ label: 'Owner', value: <span className="ds-muted">Held: kept here, not sent</span> });
    } else {
      routeFacts.push({ label: 'Owner', value: ownerName ?? 'Unassigned' });
    }
    const channel = delivery?.channel ?? insight.channel;
    if (channel && insight.gate === 'auto_route') {
      const connector = CHANNEL_CONNECTOR[channel];
      routeFacts.push({
        label: 'Sent to',
        value: (
          <span className={styles.inline}>
            <span className={styles.sentTo}>
              {connector ? <ConnectorMark id={connector} size={16} /> : <IconInbox size={16} />}
              <span>{CHANNEL_LABEL[channel]}</span>
            </span>
            {connector ? <SimulatedBadge tip={SIMULATED_TIP.delivery} /> : null}
            {delivery?.destination ? (
              <span className={cx('ds-muted', styles.destination)} title={delivery.destination}>
                {delivery.destination}
              </span>
            ) : null}
            {stage.delivered && delivery?.receipt ? <CopyText value={delivery.receipt} label="Copy receipt" /> : null}
          </span>
        ),
      });
    }
    if (diversion) routeFacts.push({ label: 'Rerouted', value: <span className="ds-muted">{diversionText(diversion)}</span> });
    if (stage.delivered && delivery?.mentions?.length) routeFacts.push({ label: 'Tagged', value: <Mentions mentions={delivery.mentions} /> });
  } else if (inProgress) {
    routeFacts.push({ label: 'Owner', value: <Skeleton width={120} height={10} style={{ marginTop: 4 }} /> });
  }

  return (
    <article id={`insight-${insight.id}`} className={cx(styles.insight, selected && styles.insightSelected)} aria-label={redactedPlain(insight.summary)}>
      <div className={styles.insightTop}>
        <TypeLabel type={insight.type} />
        <SeverityBadge severity={insight.severity} />
        <span className={styles.area}>{AREA_LABEL[insight.productArea]}</span>
      </div>
      <p className={styles.summary}>
        <RedactedText text={insight.summary} />
      </p>

      {quote ? (
        <div className={styles.quote} onClick={onFocus}>
          <Quote
            cite={
              <span className={styles.cite}>
                {stage.grounded && ev && ev.method !== 'failed' ? <span>{matchWords(ev)}</span> : <span>Checking it against the conversation</span>}
                <button
                  type="button"
                  className={cx('ds-link-button', styles.citeLink)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocus();
                  }}
                  aria-label={`Show this quote in the transcript: ${redactedPlain(quote)}`}
                >
                  Show in transcript
                </button>
              </span>
            }
          >
            <RedactedText text={quote} />
          </Quote>
        </div>
      ) : null}

      <div className={styles.decision} {...(anchorGate ? tourAnchor('run.gate') : {})}>
        <div className={styles.decisionRow}>
          <span className={styles.scoreLabel}>Score</span>
          {stage.scored ? (
            <Tooltip
              label={`Combines the AI’s own confidence (${insight.confidenceModel.toFixed(2)}) with how exactly the quote matched (${insight.groundingScore.toFixed(2)}). 0.80 or more is sent automatically, 0.55 to 0.80 goes to a person, below 0.55 is held.`}
            >
              <span className={styles.score} tabIndex={0}>
                <span className={styles.scoreValue}>{v.toFixed(2)}</span>
                <Meter value={v} tone={scoreTone(v)} label={`Score ${v.toFixed(2)}`} className={styles.scoreMeter} />
              </span>
            </Tooltip>
          ) : (
            <span className={styles.score}>
              <Skeleton width={28} height={10} />
              <Skeleton width={88} height={6} radius={999} />
            </span>
          )}
          <span className={styles.gate}>{stage.scored ? <GateBadge insight={insight} /> : <Badge>{stage.grounded ? 'Scoring' : 'Checking quote'}</Badge>}</span>
        </div>
        {stage.scored && op ? (
          <div className={styles.opinion}>
            <span className={styles.opinionHead}>
              <span>
                {opinionModel ?? 'Decision model'} {op.agree ? 'agreed' : 'disagreed'}
              </span>
              <span className="ds-subtle ds-num">{op.confidence.toFixed(2)} confidence</span>
              {op.effect === 'promoted' ? <Badge tone="success">Sent straight to the owner</Badge> : op.effect === 'demoted' ? <Badge tone="warning">Held for review</Badge> : null}
            </span>
            {op.note ? <span className={styles.opinionNote}>{op.note}</span> : null}
          </div>
        ) : null}
      </div>

      {routeFacts.length ? <KeyValue className={styles.routeKv} items={routeFacts} /> : null}
    </article>
  );
}

export function InsightSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.insight}>
          <div className={styles.insightTop}>
            <Skeleton width={110} height={10} />
            <Skeleton width={48} height={10} />
          </div>
          <Skeleton width={`${86 - i * 9}%`} height={12} />
          <div className={styles.quoteSkeleton}>
            <Skeleton width="92%" height={10} />
            <Skeleton width="64%" height={10} />
          </div>
          <Skeleton width="100%" height={36} radius={6} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dropped

export type DroppedItem = { id: string; summary: string | null; type: Insight['type'] | null; quote: string; bestMatch: string | null; score: number };

export function DroppedCard({ items, onFocus }: { items: DroppedItem[]; onFocus: (id: string) => void }) {
  const need = Math.round(THRESHOLDS.grounding * 100);
  return (
    <Card
      title={`${items.length} quote${items.length === 1 ? '' : 's'} not found in the conversation`}
      description="No quote, no insight: dropped, counted, never sent."
      flush
      attrs={{ ...tourAnchor('run.dropped'), 'aria-label': 'Quotes that could not be found' }}
    >
      {items.map((d) => {
        const pct = Math.round(d.score * 100);
        return (
          <div key={d.id} className={styles.dropped}>
            {d.summary ? (
              <div className={styles.droppedClaim}>
                {d.type ? <TypeLabel type={d.type} /> : null}
                <span className={styles.droppedSummary}>
                  <RedactedText text={d.summary} />
                </span>
              </div>
            ) : null}
            <div className={styles.droppedBlock}>
              <span className={styles.droppedLabel}>The AI quoted</span>
              <Quote variant="failed">
                <RedactedText text={d.quote} />
              </Quote>
            </div>
            <div className={styles.droppedBlock}>
              <span className={styles.droppedLabel}>Closest text in the conversation</span>
              {d.bestMatch ? (
                <div className={styles.quote} onClick={() => onFocus(d.id)}>
                  <Quote
                    variant="muted"
                    cite={
                      <button
                        type="button"
                        className={cx('ds-link-button', styles.citeLink)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onFocus(d.id);
                        }}
                      >
                        Show in transcript
                      </button>
                    }
                  >
                    <RedactedText text={d.bestMatch} />
                  </Quote>
                </div>
              ) : (
                <span className="ds-subtle">Nothing similar was found.</span>
              )}
            </div>
            <div className={styles.similarity}>
              <span className={styles.droppedLabel}>Similarity</span>
              <Meter value={d.score} tone="danger" label={`Similarity ${pct}%, needs ${need}%`} className={styles.similarityMeter} />
              <span className="ds-num">{pct}%</span>
              <span className="ds-subtle">needs {need}%</span>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

