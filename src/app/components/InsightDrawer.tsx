/**
 * Insight drawer: a quick look at one insight from a list. The customer's words, where it went
 * (owner, channel, rule, receipt), how sure the AI was (with the decision model's second
 * opinion), the account, its theme and who reviewed it. Opened at /app/insights/:id; the caller
 * returns focus to the row on close.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Delivery, Evidence, Insight, InsightStatus, ReviewRecord } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { Avatar, Badge, ButtonLink, ConnectorMark, CopyText, cx, Drawer, initialsOf, KeyValue, PersonChip, Quote, Skeleton, type Tone } from '../../ds';
import { IconAlertTriangle, IconCheckCircle, IconLayers } from '../../ds/icons';
import { useInsightDetail, useRules } from '../api/hooks';
import { AREA_LABEL, dateShort, money, SEVERITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { ErrorState, InsightStatusBadge, SeverityBadge, TypeLabel, When } from './domain';
import { channelConnector, placeText, routeText } from './insightRoute';
import { RedactedText } from '../pages/run/Transcript';
import styles from './InsightDrawer.module.css';

const EDITABLE: { key: 'type' | 'productArea' | 'severity' | 'summary'; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'productArea', label: 'Product area' },
  { key: 'severity', label: 'Severity' },
  { key: 'summary', label: 'Summary' },
];

function editValue(key: string, v: unknown): string {
  if (v == null || v === '') return 'None';
  const s = String(v);
  if (key === 'type') return TYPE_LABEL[s as Insight['type']] ?? s;
  if (key === 'productArea') return AREA_LABEL[s as Insight['productArea']] ?? s;
  if (key === 'severity') return SEVERITY_LABEL[s as Insight['severity']] ?? s;
  return s;
}

const ACTION_VERB: Record<ReviewRecord['action'], string> = { approve: 'approved and sent it', edit: 'edited and sent it', reject: 'rejected it' };

const DELIVERY_TONE: Record<Delivery['status'], Tone> = { delivered: 'success', queued: 'neutral', retrying: 'warning', failed: 'danger' };
/** Connectors are simulated, so a delivered item says so. */
const DELIVERY_LABEL: Record<Delivery['status'], string> = { delivered: 'Delivered (simulated)', queued: 'Queued', retrying: 'Retrying', failed: 'Failed' };
const TICKET_LABEL: Record<NonNullable<Delivery['ticketState']>, string> = { open: 'Open', in_progress: 'In progress', shipped: 'Shipped', wont_do: 'Won’t do' };

const NOT_SENT: Record<InsightStatus, string> = {
  pending_review: 'Not sent yet. It is waiting for a person to review it.',
  rejected: 'Rejected in review. Nothing was sent.',
  held: 'Held. The score was too low to send.',
  dropped_ungrounded: 'Dropped. The quote wasn’t found in the conversation.',
  routed: 'No delivery recorded yet.',
};

function quoteCite(ev: Evidence): string {
  if (ev.method === 'failed') return 'Not found in the conversation';
  if (ev.method === 'fuzzy') return `Close match, ${Math.round(ev.score * 100)}%`;
  return 'Found word for word';
}

function Section({ title, aside, children, first }: { title: string; aside?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section className={cx(styles.section, !first && styles.divided)}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {aside ? <span className={styles.sectionAside}>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ReviewItem({ r }: { r: ReviewRecord }) {
  const changes = r.action === 'edit' ? EDITABLE.filter(({ key }) => key in (r.after ?? {}) && editValue(key, r.before?.[key]) !== editValue(key, r.after?.[key])) : [];
  // Letters only, so "You (viewer)" reads "YV", not "Y(".
  const initials = initialsOf(r.reviewer.replace(/[^\p{L}\s]/gu, ''));
  return (
    <li className={styles.review}>
      <Avatar name={r.reviewer} initials={initials} size="sm" />
      <div className={styles.reviewBody}>
        <div className={styles.reviewHead}>
          <span className={styles.reviewWho}>
            <span className={styles.reviewName}>{r.reviewer}</span> {ACTION_VERB[r.action]}
          </span>
          <span className={styles.reviewWhen}>
            <When value={r.createdAt} />
          </span>
        </div>
        {changes.length ? (
          <ul className={styles.changes}>
            {changes.map(({ key, label }) => (
              <li key={key} className={styles.change}>
                <span className={styles.changeLabel}>{label}</span>
                <span className={styles.changeValue}>
                  <del className={styles.before}>{editValue(key, r.before?.[key])}</del> to <ins className={styles.after}>{editValue(key, r.after?.[key])}</ins>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {r.reason ? <p className={styles.reviewReason}>Reason: {r.reason}</p> : null}
      </div>
    </li>
  );
}

export function InsightDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useInsightDetail(id);
  const world = useWorldIndex();
  const rules = useRules();
  const { label: modelLabel } = useModelLabels();
  const opened = useRef<string | null>(null);

  const d = q.data;
  useEffect(() => {
    if (d && opened.current !== d.insight.id) {
      opened.current = d.insight.id;
      emit({ name: 'insight.opened', insightId: d.insight.id, type: d.insight.type });
      track('insight_opened', { insightId: d.insight.id, type: d.insight.type, status: d.insight.status });
    }
  }, [d]);

  const ins = d?.insight;
  const delivery = d?.deliveries[0] ?? null;
  const acct = world.account(ins?.accountId);
  const rule = rules.data?.find((r) => r.id === ins?.ruleId) ?? null;

  const footer = ins ? (
    <>
      {ins.runId ? (
        <ButtonLink to={`/app/runs/${ins.runId}`} variant={ins.status === 'pending_review' ? 'secondary' : 'primary'}>
          Open conversation
        </ButtonLink>
      ) : null}
      {ins.status === 'pending_review' ? (
        <ButtonLink to={`/app/review/${ins.id}`} variant="primary">
          Review it
        </ButtonLink>
      ) : null}
    </>
  ) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={ins ? ins.summary : q.error && !d ? 'Insight' : <Skeleton width={320} height={16} />}
      description={
        ins ? (
          <span className={styles.badges}>
            <TypeLabel type={ins.type} />
            <SeverityBadge severity={ins.severity} />
            <InsightStatusBadge status={ins.status} />
          </span>
        ) : undefined
      }
      footer={footer}
      attrs={{ 'data-testid': 'insight-drawer' }}
    >
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refresh()} what="this insight" />
      ) : !ins || !d ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading insight">
          <Skeleton width="40%" height={12} />
          <Skeleton width="100%" height={44} />
          <Skeleton width="30%" height={12} />
          <Skeleton width="100%" height={120} />
        </div>
      ) : (
        <>
          <Section title="Evidence" first>
            {ins.evidence.length ? (
              <div className={styles.quotes}>
                {ins.evidence.map((ev, i) => (
                  <Quote key={i} variant={ev.method === 'failed' ? 'failed' : 'default'} cite={quoteCite(ev)}>
                    <RedactedText text={ev.matchedText ?? ev.quote} />
                  </Quote>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>No quote recorded.</p>
            )}
          </Section>

          <Section
            title="Routing"
            aside={
              delivery ? (
                <>
                  Sent <When value={delivery.createdAt} />
                </>
              ) : undefined
            }
          >
            {delivery ? (
              <KeyValue
                items={[
                  { label: 'Sent to', value: <PersonChip name={world.personName(delivery.ownerId)} sub={world.person(delivery.ownerId)?.title} size="sm" /> },
                  {
                    label: 'Channel',
                    value: (
                      <span className={styles.channel}>
                        <ConnectorMark id={channelConnector(delivery.channel)} size={16} />
                        <span className={styles.channelText}>{placeText(delivery.channel, delivery.destination)}</span>
                      </span>
                    ),
                  },
                  ...(rule ? [{ label: 'Rule', value: rule.name }] : []),
                  {
                    label: 'Status',
                    value: (
                      <span className={styles.inline}>
                        <Badge tone={DELIVERY_TONE[delivery.status]} dot>
                          {DELIVERY_LABEL[delivery.status]}
                        </Badge>
                        {delivery.ticketState ? <span className={styles.subtle}>Ticket {TICKET_LABEL[delivery.ticketState].toLowerCase()}</span> : null}
                      </span>
                    ),
                  },
                  ...(delivery.receipt ? [{ label: 'Receipt', value: <CopyText value={delivery.receipt} label="Copy receipt" /> }] : []),
                  ...(delivery.mentions?.length ? [{ label: 'Tagged', value: delivery.mentions.map((m) => m.handle).join(', ') }] : []),
                ]}
              />
            ) : (
              <div className={styles.notSent}>
                <p className={styles.notSentText}>{NOT_SENT[ins.status]}</p>
                {ins.status === 'pending_review' && ins.ownerId ? (
                  <p className={styles.notSentSub}>On approval it goes to {routeText(world.personName(ins.ownerId), ins.channel, rule?.destination)}.</p>
                ) : null}
              </div>
            )}
          </Section>

          <Section title="Score">
            <div className={styles.scores}>
              <Score label="AI confidence" value={ins.confidenceModel} />
              <Score label="Quote match" value={ins.groundingScore} />
              <Score label="Final score" value={ins.confidenceFinal} strong />
            </div>
            {ins.secondOpinion ? <SecondOpinion opinion={ins.secondOpinion} /> : null}
            {ins.rationale ? <p className={styles.rationale}>{ins.rationale}</p> : null}
          </Section>

          <Section title="Account">
            <KeyValue
              items={[
                { label: 'Account', value: world.accountName(ins.accountId) },
                ...(acct
                  ? [
                      { label: 'ARR', value: `${money(acct.arrUsd, { compact: true })}, ${acct.tier}` },
                      { label: 'Renewal', value: dateShort(acct.renewalDate) },
                    ]
                  : []),
                { label: 'CSM', value: world.personName(ins.csmId) },
                { label: 'Product area', value: AREA_LABEL[ins.productArea] },
              ]}
            />
          </Section>

          <Section title="Theme">
            {d.theme ? (
              <Link to={`/app/themes/${d.theme.id}`} className={styles.theme}>
                <span className={styles.themeIcon}>
                  <IconLayers size={16} />
                </span>
                <span className={styles.themeText}>
                  <span className={styles.themeName}>{d.theme.name}</span>
                  <span className={styles.themeSub}>
                    {d.theme.insightCount} insight{d.theme.insightCount === 1 ? '' : 's'} from {d.theme.accountCount} account{d.theme.accountCount === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ) : (
              <p className={styles.empty}>Not part of a theme yet.</p>
            )}
          </Section>

          <Section title="Review history">
            {d.reviews.length ? (
              <ul className={styles.reviews}>
                {d.reviews.map((r) => (
                  <ReviewItem key={r.id} r={r} />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {ins.gate === 'auto_route' ? 'Sent automatically. The score was high enough that no review was needed.' : ins.status === 'pending_review' ? 'No one has reviewed it yet.' : 'No reviews.'}
              </p>
            )}
          </Section>

          <Section title="Details">
            <KeyValue
              items={[
                { label: 'Insight ID', value: <CopyText value={ins.id} label="Copy insight ID" /> },
                { label: 'Found', value: <When value={ins.createdAt} /> },
                { label: 'Model', value: modelLabel(ins.model) ?? ins.model },
                { label: 'Prompt version', value: <span className="ds-mono">{ins.promptVersion}</span> },
              ]}
            />
          </Section>
        </>
      )}
    </Drawer>
  );
}

function Score({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={styles.score}>
      <span className={styles.scoreLabel}>{label}</span>
      <span className={cx(styles.scoreValue, strong && styles.scoreStrong)}>{value.toFixed(2)}</span>
    </div>
  );
}

/** The decision model's independent check at the gate: agreed or not, its confidence, its note and what it changed. */
export function SecondOpinion({ opinion }: { opinion: NonNullable<Insight['secondOpinion']> }) {
  const effect = opinion.effect === 'demoted' ? 'It held this item for a person to check.' : opinion.effect === 'promoted' ? 'It sent this straight to its owner.' : null;
  return (
    <div className={styles.opinion}>
      <span className={cx(styles.opinionIcon, opinion.agree ? styles.opinionAgree : styles.opinionDisagree)}>{opinion.agree ? <IconCheckCircle size={16} /> : <IconAlertTriangle size={16} />}</span>
      <div className={styles.opinionText}>
        <span className={styles.opinionTitle}>
          Second opinion {opinion.agree ? 'agreed' : 'disagreed'}, <span className="ds-num">{opinion.confidence.toFixed(2)}</span>
        </span>
        {opinion.note ? <span className={styles.opinionNote}>{opinion.note}</span> : null}
        {effect ? <span className={styles.opinionMeta}>{effect}</span> : null}
      </div>
    </div>
  );
}
