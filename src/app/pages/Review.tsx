/**
 * Review: the human-in-the-loop queue. Insights the gate sent to a person, in a split view: the
 * queue on the left, the selected item on the right. J/K move, A approves and sends, E edits,
 * R rejects. Optimistic with rollback; every action carries an idempotency key and the time the
 * reviewer spent on the item (dwellMs, for Agent Ops).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Evidence, type Insight, type InsightType, type ProductArea, type Severity } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConnectorMark,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type ToastTone,
} from '../../ds';
import { IconCheck, IconCheckCircle, IconChevronDown, IconChevronUp, IconClock, IconMessage, IconPencil, IconTag, IconX } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, keys, setCached, useMe, useReviewQueue, useRules, useSession } from '../api/hooks';
import type { ReviewResult } from '../api/types';
import { useDocumentTitle } from '../AppShell';
import { EvidenceContext } from '../components/EvidenceContext';
import { SecondOpinion } from '../components/InsightDrawer';
import { ErrorState, GateBadge, readableReason, SeverityBadge, TypeLabel, When } from '../components/domain';
import { channelConnector, placeText, routeText } from '../components/insightRoute';
import { AREA_LABEL, dateShort, money, SEVERITY_LABEL, TYPE_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './review/Review.module.css';

type Mode = 'idle' | 'edit' | 'reject';
type Action = 'approve' | 'edit' | 'reject';
type Edits = Partial<Pick<Insight, 'type' | 'summary' | 'productArea' | 'severity'>>;
type ActExtra = { edits?: Edits; reason?: string };

const REJECT_REASONS = ['Not a product issue', 'Duplicate', 'Wrong type or area', 'Not actionable'];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
const REVIEW_FLOOR = 0.55;
const AUTO_ROUTE = 0.8;

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  }
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** "In 36 days", "In 3 months", "Passed". */
function renewalFromNow(date: string): string {
  const days = Math.round((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Passed';
  if (days === 0) return 'Today';
  if (days < 60) return `In ${days} day${days === 1 ? '' : 's'}`;
  return `In ${Math.round(days / 30)} months`;
}

function quoteMatch(ev: Evidence | undefined): string | null {
  if (!ev) return null;
  if (ev.method === 'failed') return 'Quote not found';
  if (ev.method === 'fuzzy') return `Quote found, ${Math.round(ev.score * 100)}% match`;
  return 'Quote found word for word';
}

/** The reason that decided it came here (not the score comparison or the account weighting). */
function decidingReason(insight: Insight): string | null {
  const reasons = insight.gateReasons;
  const rule = reasons.find((r) => !/^(confidence|grounding)\b/i.test(r) && !/^account context/i.test(r) && !/reviewer/i.test(r));
  const score = reasons.find((r) => /^confidence\b/i.test(r) && r.includes('<'));
  const pick = rule ?? score;
  return pick ? readableReason(pick) : null;
}

// ---------------------------------------------------------------- page

export default function ReviewPage() {
  useDocumentTitle('Review');
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const world = useWorldIndex();
  const queue = useReviewQueue();
  const rules = useRules();
  const items = useMemo(() => queue.data ?? [], [queue.data]);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(performance.now());
  const layoutRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const emptyEmitted = useRef(false);

  const selected = items.find((i) => i.id === routeId) ?? items[0] ?? null;
  const index = selected ? items.indexOf(selected) : -1;

  useEffect(() => {
    shownAt.current = performance.now();
    setMode('idle');
  }, [selected?.id]);

  useEffect(() => {
    if (queue.data && items.length === 0) {
      if (!emptyEmitted.current) emit({ name: 'review.empty' });
      emptyEmitted.current = true;
    } else if (items.length > 0) emptyEmitted.current = false;
  }, [queue.data, items.length]);

  const select = useCallback(
    (id: string, scroll = false) => {
      navigate(`/app/review/${id}`, { replace: true });
      const grid = layoutRef.current;
      const stacked = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length < 2 : false;
      if (scroll && stacked) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }), 30);
      }
    },
    [navigate],
  );

  const outcome = useCallback(
    (action: Action, res: ReviewResult, reason?: string): { tone: ToastTone; title: string; body?: ReactNode; action?: ReactNode } => {
      if (action === 'reject') {
        return { tone: 'neutral', title: 'Rejected', body: reason ? `Nothing was sent. Reason: ${reason}.` : 'Nothing was sent.' };
      }
      const d = res.delivery;
      const view = (
        <ButtonLink to={`/app/insights/${res.insight.id}`} variant="link" size="sm">
          View insight
        </ButtonLink>
      );
      if (!d) return { tone: 'success', title: action === 'edit' ? 'Edited and approved' : 'Approved', body: 'It will show in Deliveries once sent.', action: view };
      const who = routeText(world.personName(d.ownerId), d.channel, d.destination);
      return {
        tone: 'success',
        title: `${action === 'edit' ? 'Edited and sent to' : 'Sent to'} ${who}`,
        body: d.receipt ? (
          <>
            Receipt <span className="ds-mono">{d.receipt}</span>
          </>
        ) : undefined,
        action: view,
      };
    },
    [world],
  );

  const act = useCallback(
    async (action: Action, extra: ActExtra = {}) => {
      if (!selected || busy) return;
      const target = selected;
      const dwellMs = Math.round(performance.now() - shownAt.current);
      const next = items[index + 1] ?? items[index - 1] ?? null;
      const reason = extra.reason?.trim() || undefined;
      setBusy(true);
      const rollback = setCached<Insight[]>(keys.review, (prev) => (prev ?? []).filter((i) => i.id !== target.id));
      navigate(next ? `/app/review/${next.id}` : '/app/review', { replace: true });
      try {
        const res = await api.reviewAction(target.id, { idempotencyKey: uuid(), action, edits: extra.edits, reason, dwellMs });
        toast(outcome(action, res.data, reason));
        emit({ name: 'review.action', insightId: target.id, action });
        track('review_action', { insightId: target.id, action, type: target.type, gate: target.gate, edited: action === 'edit' ? Object.keys(extra.edits ?? {}) : [] }, dwellMs);
        invalidate(keys.review, 'insights', 'insight/', 'deliveries', 'notifications', 'themes');
      } catch (err) {
        rollback();
        navigate(`/app/review/${target.id}`, { replace: true });
        toast({ tone: 'danger', title: 'Not saved', body: err instanceof Error ? err.message : 'Try again.' });
      } finally {
        setBusy(false);
        setMode('idle');
      }
    },
    [selected, busy, items, index, navigate, toast, outcome],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'Escape' && mode !== 'idle') {
        setMode('idle');
        return;
      }
      if (!selected || mode !== 'idle') return;
      const k = e.key.toLowerCase();
      if (k === 'j' && items[index + 1]) select(items[index + 1]!.id);
      else if (k === 'k' && items[index - 1]) select(items[index - 1]!.id);
      else if (k === 'a') void act('approve');
      else if (k === 'e') setMode('edit');
      else if (k === 'r') setMode('reject');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, mode, items, index, select, act]);

  if (queue.loading) return <ReviewSkeleton />;

  const header = <PageHeader title="Review" description="Insights a person checks before they reach an owner." />;

  if (queue.error && !queue.data) {
    return (
      <Page>
        {header}
        <Card>
          <ErrorState error={queue.error} onRetry={() => void queue.refresh()} what="the review queue" />
        </Card>
      </Page>
    );
  }

  if (items.length === 0 || !selected) {
    return (
      <Page>
        {header}
        <Card attrs={tourAnchor('review.queue')}>
          <EmptyState
            icon={<IconCheckCircle />}
            title="Nothing waiting for review"
            description="Insights that need a person land here. The rest go straight to their owners."
            actions={
              <ButtonLink to="/app/insights?status=routed" size="sm">
                See sent insights
              </ButtonLink>
            }
          />
        </Card>
      </Page>
    );
  }

  const rule = rules.data?.find((r) => r.id === selected.ruleId) ?? null;

  return (
    <Page>
      {header}
      <div className={styles.split}>
        <div ref={layoutRef} className={styles.layout}>
          <Card
            flush
            className={styles.queue}
            bodyClassName={styles.queueBody}
            title={`${items.length} waiting`}
            actions={
              <span className={styles.keys}>
                <Kbd>J</Kbd>
                <Kbd>K</Kbd>
                <span className={styles.keysText}>to move</span>
              </span>
            }
            attrs={{ 'aria-label': 'Waiting for review', ...tourAnchor('review.queue') }}
          >
            <ul className={styles.list} role="listbox" aria-label="Review queue" aria-activedescendant={`rq-${selected.id}`}>
              {items.map((ins, i) => {
                const active = ins.id === selected.id;
                return (
                  <li
                    key={ins.id}
                    id={`rq-${ins.id}`}
                    role="option"
                    aria-selected={active}
                    tabIndex={0}
                    className={cx(styles.item, active && styles.itemActive)}
                    onClick={() => select(ins.id, true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select(ins.id, true);
                      }
                    }}
                    {...(i === 0 ? tourAnchor('review.item') : {})}
                  >
                    <span className={styles.itemTop}>
                      <TypeLabel type={ins.type} />
                      <span className={styles.itemAge}>
                        <When value={ins.createdAt} />
                      </span>
                    </span>
                    <span className={styles.itemSummary}>{ins.summary}</span>
                    <span className={styles.itemMeta}>
                      <span className={styles.itemAccount}>{world.accountName(ins.accountId)}</span>
                      <SeverityBadge severity={ins.severity} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div ref={detailRef} className={styles.detailCol}>
            <Detail
              key={selected.id}
              insight={selected}
              position={index + 1}
              total={items.length}
              destination={rule?.destination ?? null}
              mode={mode}
              setMode={setMode}
              busy={busy}
              onAct={act}
              onPrev={items[index - 1] ? () => select(items[index - 1]!.id) : undefined}
              onNext={items[index + 1] ? () => select(items[index + 1]!.id) : undefined}
            />
          </div>
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- selected item

function Detail({
  insight,
  position,
  total,
  destination,
  mode,
  setMode,
  busy,
  onAct,
  onPrev,
  onNext,
}: {
  insight: Insight;
  position: number;
  total: number;
  destination: string | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  onAct: (action: Action, extra?: ActExtra) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const world = useWorldIndex();
  const { data: me } = useMe();
  const session = useSession();
  const actor = me ?? session.data?.actor ?? null;
  const acct = world.account(insight.accountId);
  const ev = insight.evidence.find((e) => e.method !== 'failed') ?? insight.evidence[0];
  const owner = insight.ownerId ? world.personName(insight.ownerId) : 'Product Ops triage';
  const why = decidingReason(insight);

  const footer =
    mode === 'idle' ? (
      <>
        <div className={styles.actions}>
          <Button variant="primary" className={styles.approve} icon={<IconCheck />} kbd="A" aria-keyshortcuts="A" onClick={() => onAct('approve')} loading={busy} {...tourAnchor('review.approve')}>
            Approve and send
          </Button>
          <Button icon={<IconPencil />} kbd="E" aria-keyshortcuts="E" onClick={() => setMode('edit')} disabled={busy} {...tourAnchor('review.edit')}>
            Edit
          </Button>
          <Button variant="ghost" icon={<IconX />} kbd="R" aria-keyshortcuts="R" onClick={() => setMode('reject')} disabled={busy}>
            Reject
          </Button>
        </div>
        {actor ? (
          <span className={styles.actor}>
            <Avatar name={actor.name} initials={actor.initials} size="sm" />
            <span className={styles.actorName}>Acting as {actor.name}</span>
          </span>
        ) : null}
      </>
    ) : mode === 'reject' ? (
      <RejectForm busy={busy} onCancel={() => setMode('idle')} onReject={(reason) => onAct('reject', { reason })} />
    ) : undefined;

  return (
    <Card as="article" className={styles.detail} bodyClassName={styles.detailBody} footer={footer} attrs={{ 'aria-labelledby': 'review-detail-title' }}>
      <div className={styles.top}>
        <div className={styles.head}>
          <div className={styles.badges}>
            <TypeLabel type={insight.type} />
            <SeverityBadge severity={insight.severity} />
            <GateBadge insight={insight} attrs={tourAnchor('review.why')} />
          </div>
          <div className={styles.pager}>
            <span className={styles.position}>
              {position} of {total}
            </span>
            <IconButton size="sm" label="Previous (K)" icon={<IconChevronUp />} onClick={onPrev} disabled={!onPrev} />
            <IconButton size="sm" label="Next (J)" icon={<IconChevronDown />} onClick={onNext} disabled={!onNext} />
          </div>
        </div>
        {mode === 'edit' ? (
          <EditForm insight={insight} busy={busy} onCancel={() => setMode('idle')} onSave={(edits) => onAct('edit', { edits })} />
        ) : (
          <TitleBlock insight={insight} />
        )}
      </div>

      <dl className={styles.strip}>
        <Fact label="Account" value={world.accountName(insight.accountId)} sub={acct ? `${money(acct.arrUsd, { compact: true })} ARR, ${acct.tier}` : null} />
        <Fact label="Renewal" value={acct ? dateShort(acct.renewalDate) : '—'} sub={acct ? renewalFromNow(acct.renewalDate) : null} />
        <Fact label="CSM" value={world.personName(insight.csmId)} />
        <Fact
          label="On approval, goes to"
          value={owner}
          sub={
            <>
              <ConnectorMark id={channelConnector(insight.channel)} size={14} />
              <span className={styles.factSubText}>{placeText(insight.channel, destination)}</span>
            </>
          }
          title={routeText(owner, insight.channel, destination)}
        />
      </dl>

      <section className={styles.section} aria-labelledby="review-evidence-title" {...tourAnchor('review.evidence')}>
        <div className={styles.sectionHead}>
          <h3 id="review-evidence-title" className={styles.sectionTitle}>
            Evidence in context
          </h3>
          {ev ? <span className={styles.sectionAside}>{quoteMatch(ev)}</span> : null}
        </div>
        <EvidenceContext insight={insight} />
      </section>

      <section className={styles.section} aria-labelledby="review-score-title">
        <div className={styles.sectionHead}>
          <h3 id="review-score-title" className={styles.sectionTitle}>
            Score
          </h3>
        </div>
        <div className={styles.scores}>
          <ScoreValue label="AI confidence" hint="How sure the model said it was" value={insight.confidenceModel} />
          <ScoreValue label="Quote match" hint="How closely the quote matches the conversation; 1.00 is word for word" value={insight.groundingScore} />
          <ScoreValue label="Final score" hint="Combines the two with how reliable this type of insight usually is. It decides where the insight goes." value={insight.confidenceFinal} strong />
        </div>
        <ScoreMeter value={insight.confidenceFinal} />
        {why ? (
          <p className={styles.why}>
            <span className={styles.whyLabel}>Why it’s here</span>
            <span>{why}</span>
          </p>
        ) : null}
        {insight.secondOpinion ? <SecondOpinion opinion={insight.secondOpinion} /> : null}
      </section>
    </Card>
  );
}

function TitleBlock({ insight }: { insight: Insight }) {
  return (
    <div className={styles.titleBlock}>
      <h2 id="review-detail-title" className={styles.title}>
        {insight.summary}
      </h2>
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <IconTag size={14} />
          <span className={styles.metaText}>{AREA_LABEL[insight.productArea]}</span>
        </span>
        <span className={styles.metaItem}>
          <IconClock size={14} />
          <span className={styles.metaText}>
            Found <When value={insight.createdAt} />
          </span>
        </span>
        {insight.runId ? (
          <Link to={`/app/runs/${insight.runId}`} className={styles.metaLink}>
            <IconMessage size={14} />
            <span>Open conversation</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className={styles.fact} title={title}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        <span className={styles.factMain}>{value}</span>
        {sub ? <span className={styles.factSub}>{sub}</span> : null}
      </dd>
    </div>
  );
}

function ScoreValue({ label, hint, value, strong }: { label: string; hint: string; value: number; strong?: boolean }) {
  return (
    <div className={styles.score} title={hint}>
      <span className={styles.scoreLabel}>{label}</span>
      <span className={cx(styles.scoreValue, strong && styles.scoreStrong)}>{value.toFixed(2)}</span>
    </div>
  );
}

/** Final score on a 0–1 track, with the review floor (0.55) and auto-send line (0.80) marked. */
function ScoreMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      className={styles.meter}
      role="img"
      aria-label={`Final score ${value.toFixed(2)}. Below ${REVIEW_FLOOR.toFixed(2)} is held, from ${REVIEW_FLOOR.toFixed(2)} a person reviews, from ${AUTO_ROUTE.toFixed(2)} it is sent automatically.`}
    >
      <div className={styles.track}>
        <span className={styles.fill} style={{ width: `${pct}%` }} />
        <span className={styles.tick} style={{ left: `${REVIEW_FLOOR * 100}%` }} />
        <span className={styles.tick} style={{ left: `${AUTO_ROUTE * 100}%` }} />
      </div>
      <div className={styles.scale} aria-hidden="true">
        <span className={styles.scaleMark} style={{ left: `${REVIEW_FLOOR * 100}%` }}>
          {REVIEW_FLOOR.toFixed(2)}
        </span>
        <span className={styles.scaleMark} style={{ left: `${AUTO_ROUTE * 100}%` }}>
          {AUTO_ROUTE.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- edit and reject

function EditForm({ insight, busy, onCancel, onSave }: { insight: Insight; busy: boolean; onCancel: () => void; onSave: (edits: Edits) => void }) {
  const [type, setType] = useState<InsightType>(insight.type);
  const [area, setArea] = useState<ProductArea>(insight.productArea);
  const [severity, setSeverity] = useState<Severity>(insight.severity);
  const [summary, setSummary] = useState(insight.summary);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const edits: Edits = {};
  if (type !== insight.type) edits.type = type;
  if (area !== insight.productArea) edits.productArea = area;
  if (severity !== insight.severity) edits.severity = severity;
  if (summary.trim() !== insight.summary) edits.summary = summary.trim();
  const changed = Object.keys(edits).length > 0;
  const tooShort = summary.trim().length < 8;
  return (
    <form
      className={styles.editForm}
      aria-label="Edit insight"
      {...tourAnchor('review.editform')}
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !tooShort) onSave(edits);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className={styles.editGrid}>
        <Field label="Type" htmlFor="rv-type">
          <Select ref={first} id="rv-type" value={type} onChange={(e) => setType(e.target.value as InsightType)} options={INSIGHT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
        </Field>
        <Field label="Product area" htmlFor="rv-area">
          <Select id="rv-area" value={area} onChange={(e) => setArea(e.target.value as ProductArea)} options={PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))} />
        </Field>
        <Field label="Severity" htmlFor="rv-severity">
          <Select id="rv-severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="rv-summary" error={tooShort ? 'Use at least 8 characters.' : undefined}>
        <Textarea id="rv-summary" value={summary} rows={3} maxLength={240} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" icon={<IconCheck />} disabled={!changed || tooShort} loading={busy}>
          Save and send
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {!changed ? <span className={styles.formHint}>Change a field to save</span> : null}
      </div>
    </form>
  );
}

function RejectForm({ busy, onCancel, onReject }: { busy: boolean; onCancel: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <form
      className={styles.rejectForm}
      aria-label="Reject insight"
      onSubmit={(e) => {
        e.preventDefault();
        onReject(reason.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className={styles.rejectHead}>
        <span className={styles.rejectTitle}>Reject this insight</span>
        <span className={styles.rejectHint}>Nothing is sent. A reason helps the AI learn.</span>
      </div>
      <div className={styles.chips} role="group" aria-label="Common reasons">
        {REJECT_REASONS.map((r) => (
          <button key={r} type="button" className={cx(styles.chip, reason === r && styles.chipOn)} aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>
            {r}
          </button>
        ))}
      </div>
      <Input ref={input} value={reason} maxLength={300} placeholder="Reason (optional)" aria-label="Reject reason" onChange={(e) => setReason(e.target.value)} />
      <div className={styles.formActions}>
        <Button type="submit" variant="danger" icon={<IconX />} loading={busy}>
          Reject
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- loading

function ReviewSkeleton() {
  return (
    <Page attrs={{ 'aria-busy': 'true', 'aria-label': 'Loading the review queue' }}>
      <div className={styles.skelHead}>
        <Skeleton width={120} height={24} />
        <Skeleton width={320} height={12} />
      </div>
      <div className={styles.split}>
        <div className={styles.layout}>
          <Card flush className={styles.queue} title={<Skeleton width={80} height={12} />}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skelItem}>
                <Skeleton width="40%" height={10} />
                <Skeleton width="92%" height={12} />
                <Skeleton width="60%" height={10} />
              </div>
            ))}
          </Card>
          <Card className={styles.detail}>
            <div className={styles.skelDetail}>
              <Skeleton width={220} height={18} />
              <Skeleton width="80%" height={20} />
              <Skeleton width="100%" height={64} radius={8} />
              <Skeleton width="100%" height={140} />
              <Skeleton width="100%" height={60} />
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
