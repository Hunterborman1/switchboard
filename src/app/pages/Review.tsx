/**
 * Review queue: insights the gate sent to a human. Approve (A) / Edit (E) / Reject (R),
 * J/K to move. Optimistic with rollback; every action carries an idempotency key and the
 * time the reviewer spent on the item (dwellMs → Agent Ops).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Delivery, type Insight, type InsightType, type ProductArea, type Severity } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Button } from '../../system/components/primitives/Button.jsx';
import { Select } from '../../system/components/forms/Select.jsx';
import { Textarea } from '../../system/components/forms/Textarea.jsx';
import { Input } from '../../system/components/forms/Input.jsx';
import { EmptyState } from '../../uis/EmptyState';
import { MonoId } from '../../uis/MonoId';
import { RelativeTime } from '../../uis/RelativeTime';
import { Skeleton, SkeletonSurface, PageHeaderSkeleton } from '../../uis/Skeleton';
import { api } from '../api/client';
import { invalidate, keys, setCached, useReviewQueue } from '../api/hooks';
import { EvidenceContext } from '../components/EvidenceContext';
import { AppPageHeader, ErrorState, GateChip, Panel, SeverityTag, TypeTag, useToast } from '../components/ui';
import { AREA_LABEL, CHANNEL_LABEL, SEVERITY_LABEL, TYPE_LABEL, renewalIn, money } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './review/Review.module.css';

type Mode = 'idle' | 'edit' | 'reject';
type Outcome = { insight: Insight; action: 'approve' | 'edit' | 'reject'; delivery: Delivery | null; at: number };

const REJECT_REASONS = ['Not a product issue', 'Duplicate of an existing item', 'Wrong type or area', 'Not actionable'];

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

function ReviewSkeleton() {
  return (
    <SkeletonSurface label="Loading review queue">
      <PageHeaderSkeleton />
      <div className={styles.layout}>
        <div className="sl-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="40%" height={10} />
              <Skeleton width="90%" height={13} />
              <Skeleton width="60%" height={10} />
            </div>
          ))}
        </div>
        <div className="sl-panel" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton width={180} height={12} />
          <Skeleton width="80%" height={22} />
          <Skeleton width="100%" height={90} />
          <Skeleton width="100%" height={140} />
        </div>
      </div>
    </SkeletonSurface>
  );
}

export default function ReviewPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const world = useWorldIndex();
  const queue = useReviewQueue();
  const items = useMemo(() => queue.data ?? [], [queue.data]);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const shownAt = useRef(performance.now());
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
      if (scroll && window.matchMedia('(max-width: 900px)').matches) {
        window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
      }
    },
    [navigate],
  );

  const act = useCallback(
    async (action: 'approve' | 'edit' | 'reject', extra: { edits?: Partial<Pick<Insight, 'type' | 'summary' | 'productArea' | 'severity'>>; reason?: string } = {}) => {
      if (!selected || busy) return;
      const target = selected;
      const dwellMs = Math.round(performance.now() - shownAt.current);
      const next = items[index + 1] ?? items[index - 1] ?? null;
      setBusy(true);
      const rollback = setCached<Insight[]>(keys.review, (prev) => (prev ?? []).filter((i) => i.id !== target.id));
      if (next) navigate(`/app/review/${next.id}`, { replace: true });
      else navigate('/app/review', { replace: true });
      try {
        const res = await api.reviewAction(target.id, { idempotencyKey: uuid(), action, edits: extra.edits, reason: extra.reason, dwellMs });
        setOutcome({ insight: res.data.insight, action, delivery: res.data.delivery, at: Date.now() });
        emit({ name: 'review.action', insightId: target.id, action });
        track('review_action', { insightId: target.id, action, type: target.type, gate: target.gate, edited: action === 'edit' ? Object.keys(extra.edits ?? {}) : [] }, dwellMs);
        invalidate(keys.review, 'insights', 'insight/', 'deliveries', 'notifications', 'themes');
      } catch (err) {
        rollback();
        navigate(`/app/review/${target.id}`, { replace: true });
        toast({ tone: 'danger', title: 'Action not saved', body: err instanceof Error ? err.message : 'Try again.' });
      } finally {
        setBusy(false);
        setMode('idle');
      }
    },
    [selected, busy, items, index, navigate, toast],
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

  return (
    <div className="sl-page">
      <AppPageHeader
        title="Review queue"
        subtitle="Insights a person should check before they reach an owner."
        dataAsOf={queue.dataAsOf}
      />
      {queue.error && !queue.data ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refresh()} what="the review queue" />
      ) : (
        <>
          {outcome ? <OutcomeCard outcome={outcome} onDismiss={() => setOutcome(null)} /> : null}
          {items.length === 0 ? (
            <EmptyState
              variant="no-data"
              icon="✓"
              title="Queue clear"
              description="Nothing is waiting for you. Lower-confidence insights, churn risks and critical bugs come here first; everything else goes straight to its owner."
              action={
                <Link to="/app/insights?status=routed" className="sl-linkbtn">
                  See routed insights
                </Link>
              }
            />
          ) : (
            <div className={styles.layout}>
              <section className={`sl-panel ${styles.queue}`} aria-label="Waiting for review" {...tourAnchor('review.queue')}>
                <header className={styles.queueHead}>
                  <span className="sl-panel-title">Waiting for review</span>
                  <span className="sl-meta sl-num">
                    {items.length} item{items.length === 1 ? '' : 's'} · oldest from <RelativeTime value={[...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt} />
                  </span>
                  <span className={styles.keys} aria-label="Keyboard shortcuts: J and K move, A approve, E edit, R reject">
                    <kbd>J</kbd>
                    <kbd>K</kbd> move · <kbd>A</kbd> approve · <kbd>E</kbd> edit · <kbd>R</kbd> reject
                  </span>
                </header>
                <ul className={styles.list} role="listbox" aria-label="Review queue" aria-activedescendant={selected ? `rq-${selected.id}` : undefined}>
                  {items.map((ins, i) => {
                    const active = ins.id === selected?.id;
                    return (
                      <li key={ins.id} {...(i === 0 ? tourAnchor('review.item') : {})}>
                        <div
                          id={`rq-${ins.id}`}
                          role="option"
                          aria-selected={active}
                          tabIndex={0}
                          className={`${styles.row} ${active ? styles.rowActive : ''}`}
                          onClick={() => select(ins.id, true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              select(ins.id, true);
                            }
                          }}
                        >
                          <div className={styles.rowTop}>
                            <TypeTag type={ins.type} />
                            <span className="sl-caption">
                              <RelativeTime value={ins.createdAt} />
                            </span>
                          </div>
                          <p className={styles.rowSummary}>{ins.summary}</p>
                          <div className={styles.rowMeta}>
                            <span className="sl-ellipsis sl-meta">{world.accountName(ins.accountId)}</span>
                            <SeverityTag severity={ins.severity} />
                            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                              <GateChip insight={ins} anchor={i === 0} />
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <div ref={detailRef} className={styles.detailCol}>
                {selected ? (
                  <Detail
                    key={selected.id}
                    insight={selected}
                    position={`${index + 1} of ${items.length}`}
                    mode={mode}
                    setMode={setMode}
                    busy={busy}
                    onAct={act}
                    onPrev={items[index - 1] ? () => select(items[index - 1]!.id) : undefined}
                    onNext={items[index + 1] ? () => select(items[index + 1]!.id) : undefined}
                  />
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Detail({
  insight,
  position,
  mode,
  setMode,
  busy,
  onAct,
  onPrev,
  onNext,
}: {
  insight: Insight;
  position: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  onAct: (action: 'approve' | 'edit' | 'reject', extra?: { edits?: Partial<Pick<Insight, 'type' | 'summary' | 'productArea' | 'severity'>>; reason?: string }) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const world = useWorldIndex();
  const acct = world.account(insight.accountId);
  const ev = insight.evidence.find((e) => e.method !== 'failed') ?? insight.evidence[0];
  return (
    <article className={`sl-panel ${styles.detail}`} aria-labelledby="review-detail-title">
      <header className={styles.detailHead}>
        <div className="sl-row">
          <TypeTag type={insight.type} />
          <SeverityTag severity={insight.severity} />
          <GateChip insight={insight} />
          <span className="sl-caption">{AREA_LABEL[insight.productArea]}</span>
        </div>
        <div className="sl-row-nowrap">
          <span className="sl-caption sl-num">{position}</span>
          <Button variant="ghost" size="sm" iconLeft="chevronLeft" onClick={onPrev} disabled={!onPrev} aria-label="Previous item (K)" />
          <Button variant="ghost" size="sm" iconLeft="chevronRight" onClick={onNext} disabled={!onNext} aria-label="Next item (J)" />
        </div>
      </header>

      <div className={styles.detailBody}>
        <h2 id="review-detail-title" className={styles.summary}>
          {insight.summary}
        </h2>

        <dl className={styles.facts}>
          <div>
            <dt>Account</dt>
            <dd>
              {world.accountName(insight.accountId)}
              {acct ? <span className="sl-caption" style={{ display: 'block' }}>{money(acct.arrUsd, { compact: true })} ARR · {acct.tier}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd>{acct ? renewalIn(acct.renewalDate) : '—'}</dd>
          </div>
          <div>
            <dt>CSM</dt>
            <dd>{world.personName(insight.csmId)}</dd>
          </div>
          <div>
            <dt>Would route to</dt>
            <dd>
              {insight.ownerId ? world.personName(insight.ownerId) : 'Triage'}
              {insight.channel ? <span className="sl-caption"> · {CHANNEL_LABEL[insight.channel]}</span> : null}
            </dd>
          </div>
        </dl>

        <section className={styles.block} {...tourAnchor('review.evidence')}>
          <div className="sl-spread">
            <h3 className={styles.blockTitle}>Evidence in context</h3>
            {ev ? (
              <span className="sl-caption sl-num" title={`Quote check: ${ev.method} match, similarity ${ev.score.toFixed(2)}`}>
                {ev.method === 'exact' ? 'Quote found word for word' : ev.method === 'failed' ? 'Quote not found' : `Quote found (${Math.round(ev.score * 100)}% match)`}
                {insight.runId ? (
                  <>
                    {' · '}
                    <Link to={`/app/runs/${insight.runId}`} className="sl-linkbtn">
                      Open run
                    </Link>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          <EvidenceContext insight={insight} />
        </section>

        <section className={styles.block}>
          <h3 className={styles.blockTitle}>Confidence score</h3>
          <div className={styles.confGrid}>
            <ConfStat label="AI confidence" hint="How sure the model said it was." value={insight.confidenceModel} />
            <ConfStat label="Quote check" hint="How closely the quote matches the conversation (1.00 is word for word)." value={insight.groundingScore} />
            <ConfStat label="Overall score" hint="Combines the two above with how reliable this insight type usually is. This decides where it goes." value={insight.confidenceFinal} strong />
          </div>
          <ConfBar value={insight.confidenceFinal} />
          {insight.rationale ? <p className="sl-p">{insight.rationale}</p> : null}
        </section>

        {mode === 'edit' ? <EditForm insight={insight} busy={busy} onCancel={() => setMode('idle')} onSave={(edits) => onAct('edit', { edits })} /> : null}
        {mode === 'reject' ? <RejectForm busy={busy} onCancel={() => setMode('idle')} onReject={(reason) => onAct('reject', { reason })} /> : null}
      </div>

      {mode === 'idle' ? (
        <footer className={styles.actions}>
          <Button variant="primary" iconLeft="check" onClick={() => onAct('approve')} loading={busy} {...tourAnchor('review.approve')}>
            Approve <kbd className={styles.kbdOnBrand}>A</kbd>
          </Button>
          <Button variant="secondary" iconLeft="edit" onClick={() => setMode('edit')} disabled={busy} {...tourAnchor('review.edit')}>
            Edit <kbd>E</kbd>
          </Button>
          <Button variant="tertiary" iconLeft="x" onClick={() => setMode('reject')} disabled={busy}>
            Reject <kbd>R</kbd>
          </Button>
          <span className={`sl-caption ${styles.actionsNote}`}>Every decision is saved with a record of what changed.</span>
        </footer>
      ) : null}
    </article>
  );
}

function ConfStat({ label, hint, value, strong }: { label: string; hint: string; value: number; strong?: boolean }) {
  return (
    <div className={styles.confStat} title={hint}>
      <span className="sl-caption">{label}</span>
      <span className={`${styles.confValue} ${strong ? styles.confStrong : ''}`}>{value.toFixed(2)}</span>
    </div>
  );
}

function ConfBar({ value }: { value: number }) {
  return (
    <div className={styles.confBar} role="img" aria-label={`Overall score ${value.toFixed(2)}. Held below 0.55, a person reviews from 0.55 to 0.80, sent automatically at 0.80 or above.`}>
      <div className={styles.confTrack}>
        <span className={styles.zoneHeld} style={{ width: '55%' }} />
        <span className={styles.zoneReview} style={{ width: '25%' }} />
        <span className={styles.zoneAuto} style={{ width: '20%' }} />
        <i className={styles.confMarker} style={{ left: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
      <div className={styles.confLabels} aria-hidden="true">
        <span style={{ width: '55%' }}>Held (below 0.55)</span>
        <span style={{ width: '25%' }}>Person reviews</span>
        <span style={{ width: '20%' }}>Sent automatically</span>
      </div>
    </div>
  );
}

function EditForm({
  insight,
  busy,
  onCancel,
  onSave,
}: {
  insight: Insight;
  busy: boolean;
  onCancel: () => void;
  onSave: (edits: Partial<Pick<Insight, 'type' | 'summary' | 'productArea' | 'severity'>>) => void;
}) {
  const [type, setType] = useState<InsightType>(insight.type);
  const [area, setArea] = useState<ProductArea>(insight.productArea);
  const [severity, setSeverity] = useState<Severity>(insight.severity);
  const [summary, setSummary] = useState(insight.summary);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector('select')?.focus();
  }, []);
  const edits: Partial<Pick<Insight, 'type' | 'summary' | 'productArea' | 'severity'>> = {};
  if (type !== insight.type) edits.type = type;
  if (area !== insight.productArea) edits.productArea = area;
  if (severity !== insight.severity) edits.severity = severity;
  if (summary.trim() !== insight.summary) edits.summary = summary.trim();
  const changed = Object.keys(edits).length > 0;
  const tooShort = summary.trim().length < 8;
  return (
    <form
      className={styles.form}
      aria-label="Edit insight"
      data-tour="review.editform"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && !tooShort) onSave(edits);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 className={styles.blockTitle}>Edit before routing</h3>
      <div className={styles.formGrid} ref={first}>
        <label className={styles.field}>
          <span>Type</span>
          <Select value={type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setType(e.target.value as InsightType)} options={INSIGHT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
        </label>
        <label className={styles.field}>
          <span>Product area</span>
          <Select value={area} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setArea(e.target.value as ProductArea)} options={PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))} />
        </label>
        <label className={styles.field}>
          <span>Severity</span>
          <Select value={severity} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSeverity(e.target.value as Severity)} options={(['low', 'medium', 'high', 'critical'] as Severity[]).map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Summary</span>
        <Textarea value={summary} rows={3} maxLength={240} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)} />
      </label>
      <div className="sl-row">
        <Button type="submit" variant="primary" iconLeft="check" disabled={!changed || tooShort} loading={busy}>
          Save edit & route
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {!changed ? <span className="sl-why-disabled">ⓘ Change a field to save; otherwise use Approve.</span> : tooShort ? <span className="sl-why-disabled">ⓘ Summary needs at least 8 characters.</span> : null}
      </div>
    </form>
  );
}

function RejectForm({ busy, onCancel, onReject }: { busy: boolean; onCancel: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
  }, []);
  return (
    <form
      className={styles.form}
      aria-label="Reject insight"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim()) onReject(reason.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <h3 className={styles.blockTitle}>Why reject it?</h3>
      <div className="sl-row">
        {REJECT_REASONS.map((r) => (
          <button key={r} type="button" className={`${styles.chip} ${reason === r ? styles.chipOn : ''}`} aria-pressed={reason === r} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <div ref={ref}>
        <Input value={reason} maxLength={300} placeholder="Or write your own reason" aria-label="Reject reason" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)} />
      </div>
      <div className="sl-row">
        <Button type="submit" variant="danger" iconLeft="x" disabled={!reason.trim()} loading={busy}>
          Reject
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {!reason.trim() ? <span className="sl-why-disabled">ⓘ Add a reason so the next version of the AI learns from it.</span> : null}
      </div>
    </form>
  );
}

function OutcomeCard({ outcome, onDismiss }: { outcome: Outcome; onDismiss: () => void }) {
  const world = useWorldIndex();
  const d = outcome.delivery;
  const verb = outcome.action === 'approve' ? 'Approved' : outcome.action === 'edit' ? 'Edited and routed' : 'Rejected';
  return (
    <Panel className={`${styles.outcome} ${outcome.action === 'reject' ? styles.outcomeMuted : ''}`} as="div">
      <div className={styles.outcomeRow} role="status">
        <span className={styles.outcomeIcon} aria-hidden="true">
          {outcome.action === 'reject' ? '✕' : '✓'}
        </span>
        <div className="sl-grow sl-stack-sm">
          <span className="sl-strong">
            {verb}: <span className="sl-muted">{outcome.insight.summary}</span>
          </span>
          {d ? (
            <span className="sl-row sl-meta">
              Delivered to <span className="sl-strong">{world.personName(d.ownerId)}</span> via {CHANNEL_LABEL[d.channel]} <span className="sl-mono">{d.destination}</span>
              {d.receipt ? (
                <>
                  · <span title={`Delivery receipt ${d.receipt}`}>receipt <MonoId value={d.receipt} keep={12} /></span>
                </>
              ) : null}
              · <Link to="/app/destinations" className="sl-linkbtn">Open in Destinations</Link>
            </span>
          ) : outcome.action === 'reject' ? (
            <span className="sl-meta">Saved as an example of what not to send; nothing was routed.</span>
          ) : (
            <span className="sl-meta">Sent to its owner; the delivery will show in the delivery log.</span>
          )}
        </div>
        <Button variant="ghost" size="sm" iconLeft="x" onClick={onDismiss} aria-label="Dismiss" />
      </div>
    </Panel>
  );
}


