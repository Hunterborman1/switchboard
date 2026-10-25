/**
 * Run view building blocks: insight card + confidence gauge, the dropped-quote card, the
 * screen card (with the injection callout) and the trace panel.
 */
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { THRESHOLDS, STEP_KEYS, STEP_LABELS, type Delivery, type Insight, type RunStep, type ScreenOutput } from '../../../shared/contracts';
import { SIGNAL_LOOP_AGENT_ID } from '../../../shared/platform-contracts';
import { tourAnchor } from '../../../tour/anchors';
import { TimelineLanes, type TimelineLane } from '../../../uis/TimelineLanes';
import { MonoId } from '../../../uis/MonoId';
import { StatusChip } from '../../../uis/StatusChip';
import { Hint } from '../../components/Hint';
import { GateChip, SeverityTag, TypeTag } from '../../components/ui';
import { IconArrowUpRight, IconChannels, IconMail, IconQuote, IconShieldAlert, IconTheme, IconTicket, IconHash, IconInbox } from '../../components/icons';
import { AREA_LABEL, CHANNEL_LABEL, money, ms } from '../../lib/labels';
import { useModelLabels } from '../../lib/models';
import { INSTANT_STEP_HELP } from '../../../shared/format';
import type { DisplayStep } from './useReveal';
import { friendlyModel } from './modelName';
import styles from './RunParts.module.css';

// ---------------------------------------------------------------- confidence gauge

export function ConfidenceGauge({
  insight,
  ready,
  reduced,
}: {
  insight: Pick<Insight, 'confidenceFinal' | 'confidenceModel' | 'groundingScore' | 'gate'>;
  ready: boolean;
  reduced: boolean;
}) {
  const v = Math.max(0, Math.min(1, insight.confidenceFinal));
  const zone = v >= THRESHOLDS.autoRoute ? 'auto' : v >= THRESHOLDS.review ? 'review' : 'held';
  const label = ready
    ? `Confidence ${v.toFixed(2)}: ${zone === 'auto' ? 'high enough to send automatically (0.80 or more)' : zone === 'review' ? 'between 0.55 and 0.80, so a person checks it first' : 'below 0.55, so it is held'}`
    : 'Confidence score pending the quote check';
  return (
    <div className={styles.gauge} role="img" aria-label={label}>
      <div className={styles.gaugeTrack}>
        <span className={styles.zoneHeld} style={{ width: `${THRESHOLDS.review * 100}%` }} />
        <span className={styles.zoneReview} style={{ left: `${THRESHOLDS.review * 100}%`, width: `${(THRESHOLDS.autoRoute - THRESHOLDS.review) * 100}%` }} />
        <span className={styles.zoneAuto} style={{ left: `${THRESHOLDS.autoRoute * 100}%`, right: 0 }} />
        {ready ? (
          <motion.span
            className={`${styles.gaugeFill} ${styles[`fill_${zone}`]}`}
            initial={reduced ? { width: `${v * 100}%` } : { width: '0%' }}
            animate={{ width: `${v * 100}%` }}
            transition={{ duration: reduced ? 0 : 0.6, ease: [0.2, 0, 0, 1] }}
          />
        ) : (
          <span className={styles.gaugePending} />
        )}
        <i className={styles.mark} style={{ left: `${THRESHOLDS.review * 100}%` }} />
        <i className={styles.mark} style={{ left: `${THRESHOLDS.autoRoute * 100}%` }} />
      </div>
      <div className={styles.gaugeScale} aria-hidden="true">
        <span style={{ left: `${THRESHOLDS.review * 100}%` }}>Review</span>
        <span style={{ left: `${THRESHOLDS.autoRoute * 100}%` }}>Auto-send</span>
      </div>
      <div className={styles.gaugeReadout}>
        {ready ? (
          <Hint
            label={
              <>
                Combines the AI’s own confidence ({insight.confidenceModel.toFixed(2)}), how exactly the quote matched the conversation ({insight.groundingScore.toFixed(2)}), the insight type and the account.
                <br />
                0.80 or more is sent automatically, 0.55 to 0.80 goes to a person, below 0.55 is held. Churn risk and critical bugs are always checked by a person.
              </>
            }
          >
            <span className={styles.readout} tabIndex={0}>
              <motion.strong initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.3, duration: 0.18 }}>
                {v.toFixed(2)}
              </motion.strong>
              <span className="sl-subtle"> confidence score</span>
            </span>
          </Hint>
        ) : (
          <span className={styles.readout}>
            <span className="sl-subtle">AI confidence {insight.confidenceModel.toFixed(2)} · checking the quote</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- insight card

export function ChannelIcon({ channel, size = 14 }: { channel: Delivery['channel'] | null; size?: number }) {
  if (channel === 'slack') return <IconHash size={size} />;
  if (channel === 'jira') return <IconTicket size={size} />;
  if (channel === 'linear') return <IconChannels size={size} />;
  if (channel === 'email_digest') return <IconMail size={size} />;
  return <IconInbox size={size} />;
}

export type CardStage = { grounded: boolean; scored: boolean; themed: boolean; routed: boolean; delivered: boolean };

export function InsightCard({
  insight,
  stage,
  themeName,
  ownerName,
  delivery,
  selected,
  onFocus,
  anchorGate,
  reduced,
  index,
}: {
  insight: Insight;
  stage: CardStage;
  themeName: string | null;
  ownerName: string | null;
  delivery: Delivery | null;
  selected: boolean;
  onFocus: () => void;
  anchorGate: boolean;
  reduced: boolean;
  index: number;
}) {
  const ev = insight.evidence[0];
  const method = ev?.method;
  return (
    <motion.article
      layout={!reduced}
      id={`insight-${insight.id}`}
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: reduced ? 0 : index * 0.06, ease: [0.2, 0, 0, 1] }}
      aria-label={`${insight.type.replace('_', ' ')}: ${insight.summary}`}
    >
      <div className={styles.cardTop}>
        <TypeTag type={insight.type} />
        <SeverityTag severity={insight.severity} />
        <span className={styles.area}>{AREA_LABEL[insight.productArea]}</span>
        <span className={styles.cardTopEnd}>
          {stage.scored ? <GateChip insight={insight} /> : <StatusChip tone="neutral" size="sm">{stage.grounded ? 'Scoring…' : 'Checking quote…'}</StatusChip>}
        </span>
      </div>
      <p className={styles.summary}>{insight.summary}</p>
      {ev ? (
        <button type="button" className={`${styles.quoteBtn} ${stage.grounded ? styles.quoteGrounded : ''}`} onClick={onFocus} aria-label={`Show this quote in the transcript: ${ev.matchedText ?? ev.quote}`}>
          <IconQuote size={14} />
          <span className={styles.quoteText}>{stage.grounded ? ev.matchedText ?? ev.quote : ev.quote}</span>
          <span className={styles.quoteMeta}>
            {stage.grounded && method && method !== 'failed' ? (
              <>
                <span className={styles.method} title={method === 'fuzzy' ? `Close match, similarity ${ev.score.toFixed(2)}` : 'Word-for-word match'}>{method === 'fuzzy' ? 'Close match' : 'Exact match'}</span>
                <span className={styles.locate} title={ev.turnId ? `Line ${ev.turnId}` : undefined}>
                  Show in transcript <IconArrowUpRight size={11} />
                </span>
              </>
            ) : (
              <span className={styles.methodPending}>Finding it in the transcript…</span>
            )}
          </span>
        </button>
      ) : null}
      <div {...(anchorGate ? tourAnchor('run.gate') : {})} className={styles.gaugeWrap}>
        <ConfidenceGauge insight={insight} ready={stage.scored} reduced={reduced} />
      </div>
      {stage.themed || stage.routed ? (
        <div className={styles.cardFoot}>
          {stage.themed ? (
            <motion.span className={styles.footItem} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
              <IconTheme size={14} />
              {insight.themeId ? (
                <>
                  Joined <Link to={`/app/themes/${insight.themeId}`} className="sl-quietlink sl-strong">{themeName ?? insight.themeId}</Link>
                </>
              ) : (
                <span>Started a new candidate theme</span>
              )}
            </motion.span>
          ) : null}
          {stage.routed ? (
            <motion.span className={styles.footItem} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: reduced ? 0 : 0.08 }}>
              <ChannelIcon channel={insight.channel} />
              {insight.gate === 'auto_route' ? (
                <span>
                  Routed to <strong className="sl-strong">{ownerName ?? insight.ownerId}</strong>
                  {insight.channel ? <span className="sl-subtle"> · {CHANNEL_LABEL[insight.channel]}</span> : null}
                  {stage.delivered && delivery?.receipt ? (
                    <span className={styles.receipt}>
                      {' '}
                      · <MonoId value={delivery.receipt} keep={10} />
                    </span>
                  ) : null}
                </span>
              ) : insight.gate === 'review' ? (
                <span>
                  Waiting for a human in the <Link to={`/app/review/${insight.id}`} className="sl-quietlink sl-strong">review queue</Link>
                  {ownerName ? <span className="sl-subtle"> · then {ownerName}</span> : null}
                </span>
              ) : (
                <span>Held: kept and visible, not sent</span>
              )}
            </motion.span>
          ) : null}
        </div>
      ) : null}
    </motion.article>
  );
}

// ---------------------------------------------------------------- dropped

export type DroppedItem = { id: string; summary: string | null; type: Insight['type'] | null; quote: string; bestMatch: string | null; score: number };

export function DroppedCard({ items, onFocus, reduced }: { items: DroppedItem[]; onFocus: (id: string) => void; reduced: boolean }) {
  return (
    <section className={styles.dropped} {...tourAnchor('run.dropped')} aria-label="Quotes that could not be found">
      <header className={styles.droppedHead}>
        <span className={styles.droppedIcon} aria-hidden="true">
          <IconShieldAlert size={18} />
        </span>
        <div>
          <h3 className={styles.droppedTitle}>
            {items.length} quote{items.length === 1 ? '' : 's'} not found in the conversation, dropped
          </h3>
          <p className={styles.droppedSub}>No quote, no insight. The AI’s quote isn’t in the conversation, so the insight is counted as made up and never sent.</p>
        </div>
      </header>
      {items.map((d, i) => (
        <motion.div key={d.id} className={styles.droppedItem} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: reduced ? 0 : 0.1 + i * 0.06 }}>
          {d.summary ? (
            <div className={styles.droppedClaim}>
              {d.type ? <TypeTag type={d.type} /> : null}
              <span>{d.summary}</span>
            </div>
          ) : null}
          <div className={styles.compare}>
            <div className={styles.compareCol}>
              <span className={styles.compareLabel}>The AI quoted</span>
              <q className={styles.compareModel}>{d.quote}</q>
            </div>
            <div className={styles.compareCol}>
              <span className={styles.compareLabel}>Closest text in the conversation</span>
              {d.bestMatch ? (
                <button type="button" className={styles.compareBest} onClick={() => onFocus(d.id)} title="Show it in the transcript">
                  “{d.bestMatch}”
                </button>
              ) : (
                <span className="sl-subtle">No similar passage found</span>
              )}
            </div>
          </div>
          <div className={styles.sim}>
            <span className={styles.simLabel}>Similarity</span>
            <span className={styles.simTrack} role="img" aria-label={`Similarity ${(d.score * 100).toFixed(0)}%, needs ${(THRESHOLDS.grounding * 100).toFixed(0)}%`}>
              <motion.span className={styles.simFill} initial={reduced ? { width: `${d.score * 100}%` } : { width: 0 }} animate={{ width: `${d.score * 100}%` }} transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.2, ease: [0.2, 0, 0, 1] }} />
              <i className={styles.simMark} style={{ left: `${THRESHOLDS.grounding * 100}%` }} />
            </span>
            <span className={styles.simValue}>
              <strong>{(d.score * 100).toFixed(0)}%</strong> <span className="sl-subtle">· needs {(THRESHOLDS.grounding * 100).toFixed(0)}% or more</span>
            </span>
          </div>
        </motion.div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- screen

const LANG: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' };
const CALL_KIND: Record<string, string> = { qbr: 'QBR', check_in: 'Check-in', renewal: 'Renewal', escalation: 'Escalation', onboarding: 'Onboarding', notes: 'CSM notes', email: 'Email', other: 'Other' };

export function ScreenCard({ screen, pending, model, ms: took }: { screen: ScreenOutput | null; pending: boolean; model: string | null; ms: number | null }) {
  return (
    <section className={`${styles.screen} ${screen?.injection_suspected ? styles.screenAlert : ''}`} {...tourAnchor('run.screen')} aria-label="Screen result">
      <header className={styles.screenHead}>
        <h3 className={styles.screenTitle}>Screening</h3>
        <span className={styles.screenMeta}>{pending ? 'Quick AI check…' : `${model ?? 'Main model'} · ${ms(took)}`}</span>
      </header>
      {pending || !screen ? (
        <div className={styles.screenFacts} aria-hidden="true">
          {['Actionable', 'Language', 'Call type', 'Manipulation attempt'].map((l) => (
            <div key={l} className={styles.fact}>
              <span className={styles.factLabel}>{l}</span>
              <span className={styles.factSkel} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.screenFacts}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Actionable</span>
              <StatusChip tone={screen.actionable ? 'success' : 'neutral'} size="sm">
                {screen.actionable ? 'Yes' : 'No'}
              </StatusChip>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Language</span>
              <span className={styles.factValue}>
                {LANG[screen.language] ?? screen.language}
              </span>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Call type</span>
              <span className={styles.factValue}>{CALL_KIND[screen.call_kind] ?? screen.call_kind}</span>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Manipulation attempt</span>
              <StatusChip tone={screen.injection_suspected ? 'danger' : 'success'} size="sm">
                {screen.injection_suspected ? 'Suspected' : 'None found'}
              </StatusChip>
            </div>
          </div>
          <p className={styles.screenReason}>{screen.reason}</p>
          {screen.injection_suspected ? (
            <div className={styles.injection} role="note">
              <div className={styles.injectionHead}>
                <IconShieldAlert size={18} />
                <strong>Prompt injection caught: hidden instructions to the AI were ignored</strong>
              </div>
              <p className={styles.injectionText}>
                The file contains instructions aimed at an AI. Signal Loop treated them as <em>plain text</em>, not commands: the AI can only fill in a fixed form and has no ability to take actions. The attempt was logged.
              </p>
              {screen.injection_excerpt ? (
                <figure className={styles.inert}>
                  <figcaption>Quoted from the file (not acted on)</figcaption>
                  <code>{screen.injection_excerpt}</code>
                </figure>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- trace

export function TracePanel({ runId, steps, totalCost, totalMs }: { runId: string; steps: DisplayStep[]; totalCost: number; totalMs: number | null }) {
  const models = useModelLabels();
  const modelLabel = (id: string | null | undefined) => friendlyModel(models.label(id));
  const shown = steps.filter((s) => s.display !== 'pending');
  const starts = shown.map((s) => s.startedAt).filter((x): x is string => !!x).sort();
  const ends = shown.map((s) => s.finishedAt ?? new Date().toISOString()).sort();
  const windowStart = starts[0] ?? new Date().toISOString();
  const windowEnd = ends[ends.length - 1] ?? windowStart;
  const lanes: TimelineLane[] = STEP_KEYS.map((key) => {
    const s = steps.find((x) => x.key === key)!;
    const visible = s.display !== 'pending' && s.startedAt;
    return {
      id: key,
      label: STEP_LABELS[key],
      segments: visible
        ? [
            {
              id: `${key}-seg`,
              detail: `${STEP_LABELS[key]} · ${s.display} · ${ms(s.durationMs)}${s.model ? ` · ${modelLabel(s.model)}` : ''}`,
              startedAt: s.startedAt!,
              finishedAt: s.display === 'running' ? null : s.finishedAt,
              severity: s.display === 'failed' ? 'red' : s.display === 'warned' ? 'yellow' : s.display === 'skipped' || s.display === 'running' ? 'neutral' : 'green',
            },
          ]
        : [],
    };
  });
  const tokensIn = shown.reduce((a, s) => a + (s.tokensIn ?? 0), 0);
  const tokensOut = shown.reduce((a, s) => a + (s.tokensOut ?? 0), 0);
  return (
    <section className="sl-panel" {...tourAnchor('run.trace')} aria-label="Trace">
      <header className="sl-panel-head">
        <div>
          <h2 className="sl-panel-title">Trace</h2>
          <p className="sl-panel-sub">Time, AI model and cost for each step of this run.</p>
        </div>
        <div className={styles.traceTotals}>
          <span>
            <span className={styles.totalLabel}>AI cost</span>
            <strong>{money(totalCost, { precise: true })}</strong>
          </span>
          <span>
            <span className={styles.totalLabel}>Tokens</span>
            <strong>
              {tokensIn.toLocaleString()} in · {tokensOut.toLocaleString()} out
            </strong>
          </span>
          <span>
            <span className={styles.totalLabel}>Total time</span>
            <strong>{ms(totalMs)}</strong>
          </span>
          <Link to={`/ops/traces/${runId}`} className={styles.opsLink}>
            Open trace in Agent Ops <IconArrowUpRight size={13} />
          </Link>
        </div>
      </header>
      <div className={styles.traceBody}>
        <div className={styles.lanes}>
          {shown.length ? <TimelineLanes lanes={lanes} windowStart={windowStart} windowEnd={windowEnd} rowHeight={26} /> : <p className="sl-meta">The waterfall fills in as steps run.</p>}
        </div>
        <div className="sl-scroll-x">
          <table className={styles.traceTable}>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Status</th>
                <th scope="col">Model</th>
                <th scope="col" className={styles.num}>Tokens in</th>
                <th scope="col" className={styles.num}>Tokens out</th>
                <th scope="col" className={styles.num}>Cost</th>
                <th scope="col" className={styles.num}>Time</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.key} data-status={s.display}>
                  <th scope="row">{STEP_LABELS[s.key]}</th>
                  <td>
                    <StepStatus status={s.display} />
                  </td>
                  <td className={styles.model}>{s.display === 'pending' || s.display === 'running' ? '—' : modelLabel(s.model) ?? <span className="sl-subtle">No AI</span>}</td>
                  <td className={styles.num}>{s.tokensIn != null && s.display !== 'pending' ? s.tokensIn.toLocaleString() : '—'}</td>
                  <td className={styles.num}>{s.tokensOut != null && s.display !== 'pending' ? s.tokensOut.toLocaleString() : '—'}</td>
                  <td className={styles.num}>{s.costUsd != null && s.display !== 'pending' ? money(s.costUsd, { precise: true }) : '—'}</td>
                  <td className={styles.num} title={s.display !== 'pending' && s.display !== 'running' && s.durationMs != null && s.durationMs < 1 ? (s.key === 'deliver' ? 'Delivery goes to in-app Slack and Jira simulators here, so it takes under a millisecond. Real webhooks would not.' : INSTANT_STEP_HELP) : undefined}>
                    {s.display === 'pending' || s.display === 'running' ? '—' : ms(s.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td />
                <td className={styles.model}>
                  <Link to={`/ops/logs?agentId=${SIGNAL_LOOP_AGENT_ID}&runId=${runId}`} className="sl-quietlink">
                    Logs for this run ↗
                  </Link>
                </td>
                <td className={styles.num}>{tokensIn.toLocaleString()}</td>
                <td className={styles.num}>{tokensOut.toLocaleString()}</td>
                <td className={styles.num}>
                  <strong>{money(totalCost, { precise: true })}</strong>
                </td>
                <td className={styles.num}>{ms(totalMs)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

function StepStatus({ status }: { status: RunStep['status'] }) {
  const tone = status === 'passed' ? 'success' : status === 'warned' ? 'warning' : status === 'failed' ? 'danger' : status === 'running' ? 'info' : 'neutral';
  return (
    <StatusChip tone={tone} size="sm">
      {status === 'warned' ? 'Warning' : status.charAt(0).toUpperCase() + status.slice(1)}
    </StatusChip>
  );
}
