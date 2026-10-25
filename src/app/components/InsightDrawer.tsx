/**
 * Insight drawer: one insight's full provenance — transcript → quote span → insight →
 * theme → delivery — with evidence, confidence, gate reasons, review history (before →
 * after) and the delivery receipt with its attempt timeline. A modal dialog: focus moves
 * in on open, Tab stays inside, Esc closes, and the caller returns focus to the row.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { ReviewRecord } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { Button } from '../../system/components/primitives/Button.jsx';
import { DeliveryTimeline, deriveDeliveryTimeline } from '../../uis/DeliveryTimeline';
import { MonoId } from '../../uis/MonoId';
import { ProvenanceFlow, type ProvenanceNode } from '../../uis/ProvenanceFlow';
import { RelativeTime } from '../../uis/RelativeTime';
import { Skeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { useInsightDetail } from '../api/hooks';
import { AREA_LABEL, CHANNEL_LABEL, STATUS_LABEL, STATUS_TONE, money, renewalIn } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { EvidenceContext } from './EvidenceContext';
import { ErrorState, GateChip, SeverityTag, TypeTag } from './ui';
import styles from './InsightDrawer.module.css';

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.replace(/_/g, ' ');
  return JSON.stringify(v);
}

function ReviewDiff({ r }: { r: ReviewRecord }) {
  const keys = [...new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})])].filter((k) => fmt(r.before?.[k]) !== fmt(r.after?.[k]));
  return (
    <li className={styles.review}>
      <div className="sl-spread">
        <span className="sl-row">
          <StatusChip tone={r.action === 'reject' ? 'neutral' : r.action === 'edit' ? 'info' : 'success'} size="sm">
            {r.action === 'approve' ? 'Approved' : r.action === 'edit' ? 'Edited' : 'Rejected'}
          </StatusChip>
          <span className="sl-meta">by {r.reviewer}</span>
        </span>
        <span className="sl-caption">
          <RelativeTime value={r.createdAt} />
        </span>
      </div>
      {keys.length ? (
        <dl className={styles.diff}>
          {keys.map((k) => (
            <div key={k} className={styles.diffRow}>
              <dt>{k}</dt>
              <dd>
                <del>{fmt(r.before?.[k])}</del>
                <span aria-hidden="true"> → </span>
                <ins>{fmt(r.after?.[k])}</ins>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {r.reason ? <p className={styles.reason}>“{r.reason}”</p> : null}
    </li>
  );
}

export function InsightDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useInsightDetail(id);
  const world = useWorldIndex();
  const { label: modelLabel } = useModelLabels();
  const panelRef = useRef<HTMLDivElement>(null);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('[data-drawer-close]')?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"], input, select, textarea'));
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const d = q.data;
  useEffect(() => {
    if (d && opened.current !== d.insight.id) {
      opened.current = d.insight.id;
      emit({ name: 'insight.opened', insightId: d.insight.id, type: d.insight.type });
      track('insight_opened', { insightId: d.insight.id, type: d.insight.type, status: d.insight.status });
    }
  }, [d]);

  const ins = d?.insight;
  const ev = ins?.evidence.find((e) => e.method !== 'failed') ?? ins?.evidence[0];
  const delivery = d?.deliveries[0] ?? null;
  const acct = world.account(ins?.accountId);

  const nodes: ProvenanceNode[] = ins
    ? [
        { id: 'transcript', kind: 'Transcript', label: d?.run?.callId ?? d?.run?.filename ?? 'Source call', meta: d?.run ? undefined : 'not retained', href: d?.run ? `/app/runs/${d.run.id}` : undefined },
        { id: 'quote', kind: 'Quote span', label: ev?.turnId ? `${ev.turnId} · ${ev.method}` : ev?.method ?? 'quote', meta: ev ? `score ${ev.score.toFixed(2)}` : undefined },
        { id: 'insight', kind: 'Insight', label: ins.id },
        ...(d?.theme ? [{ id: 'theme', kind: 'Theme', label: d.theme.name.length > 28 ? `${d.theme.name.slice(0, 27)}…` : d.theme.name, href: `/app/themes/${d.theme.id}` }] : [{ id: 'theme', kind: 'Theme', label: 'No theme yet', meta: 'candidate' }]),
        ...(delivery
          ? [{ id: 'delivery', kind: CHANNEL_LABEL[delivery.channel], label: delivery.receipt ?? delivery.destination, href: '/app/destinations' }]
          : [{ id: 'delivery', kind: 'Delivery', label: ins.status === 'pending_review' ? 'awaiting review' : ins.status === 'rejected' ? 'not routed' : 'none', href: ins.status === 'pending_review' ? `/app/review/${ins.id}` : undefined }]),
      ]
    : [];

  const host = (typeof document !== 'undefined' && document.querySelector('.sl-app')) || document.body;
  return createPortal(
    <div className={styles.overlay} data-testid="insight-drawer">
      <button type="button" className={styles.backdrop} aria-label="Close insight" tabIndex={-1} onClick={onClose} />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="insight-drawer-title">
        <header className={styles.head}>
          <div className="sl-grow sl-stack-sm">
            <span className="sl-eyebrow">Insight</span>
            {ins ? <MonoId value={ins.id} keep={14} /> : <Skeleton width={120} height={11} />}
          </div>
          <Button variant="ghost" size="sm" iconLeft="x" onClick={onClose} aria-label="Close (Esc)" data-drawer-close="" />
        </header>
        <div className={styles.body}>
          {q.error && !d ? (
            <ErrorState error={q.error} onRetry={() => void q.refresh()} what="this insight" />
          ) : !ins ? (
            <div className="sl-stack">
              <Skeleton width="60%" height={14} />
              <Skeleton width="95%" height={24} />
              <Skeleton width="100%" height={44} />
              <Skeleton width="100%" height={120} />
            </div>
          ) : (
            <>
              <div className="sl-row">
                <TypeTag type={ins.type} />
                <SeverityTag severity={ins.severity} />
                <StatusChip tone={STATUS_TONE[ins.status]} size="sm">
                  {STATUS_LABEL[ins.status]}
                </StatusChip>
                <GateChip insight={ins} />
              </div>
              <h2 id="insight-drawer-title" className={styles.title}>
                {ins.summary}
              </h2>
              <p className="sl-meta">
                {world.accountName(ins.accountId)}
                {acct ? ` · ${money(acct.arrUsd, { compact: true })} ARR · renews ${renewalIn(acct.renewalDate)}` : ''} · {AREA_LABEL[ins.productArea]} · CSM {world.personName(ins.csmId)} · <RelativeTime value={ins.createdAt} />
              </p>

              <section className={styles.section}>
                <h3 className={styles.h3}>Provenance</h3>
                <ProvenanceFlow nodes={nodes} />
              </section>

              <section className={styles.section}>
                <div className="sl-spread">
                  <h3 className={styles.h3}>Evidence</h3>
                  {ev ? (
                    <span className="sl-caption sl-num">
                      {ev.method} match · grounding {ev.score.toFixed(2)} {ev.score >= 0.9 ? '≥' : '<'} 0.90
                    </span>
                  ) : null}
                </div>
                {ev && ev.method === 'fuzzy' && ev.quote !== ev.matchedText ? (
                  <p className="sl-caption">
                    Model quoted “{ev.quote}”; matched to the transcript span below.
                  </p>
                ) : null}
                <EvidenceContext insight={ins} radius={1} />
              </section>

              <section className={styles.section}>
                <h3 className={styles.h3}>Confidence</h3>
                <dl className={styles.kv}>
                  <div>
                    <dt>Model</dt>
                    <dd className="sl-mono">{ins.confidenceModel.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Grounding</dt>
                    <dd className="sl-mono">{ins.groundingScore.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Final</dt>
                    <dd className="sl-mono sl-strong">{ins.confidenceFinal.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Prompt · model</dt>
                    <dd className="sl-mono sl-ellipsis" title={`${ins.promptVersion} · ${modelLabel(ins.model) ?? 'no model'}`}>
                      {ins.promptVersion}
                    </dd>
                  </div>
                </dl>
                {ins.rationale ? <p className="sl-p">{ins.rationale}</p> : null}
              </section>

              <section className={styles.section}>
                <h3 className={styles.h3}>Delivery</h3>
                {delivery ? (
                  <div className={styles.delivery}>
                    <div className="sl-spread">
                      <span className="sl-row">
                        <StatusChip tone={delivery.status === 'delivered' ? 'success' : delivery.status === 'failed' ? 'danger' : 'warning'} size="sm">
                          {delivery.status}
                        </StatusChip>
                        <span className="sl-meta">
                          {CHANNEL_LABEL[delivery.channel]} · <span className="sl-mono">{delivery.destination}</span> → {world.personName(delivery.ownerId)}
                        </span>
                      </span>
                      {delivery.receipt ? <MonoId value={delivery.receipt} keep={14} /> : null}
                    </div>
                    <DeliveryTimeline model={deriveDeliveryTimeline(delivery.attempts.map((a, i) => ({ id: `${delivery.id}-${i}`, at: a.at, ok: a.ok })))} height={58} />
                    <ul className={styles.attempts}>
                      {delivery.attempts.map((a, i) => (
                        <li key={i}>
                          <span className={a.ok ? styles.ok : styles.fail} aria-hidden="true" />
                          <span className="sl-meta">
                            Attempt {i + 1}: {a.note} · <span className="sl-mono">{a.ms} ms</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {delivery.ticketState ? (
                      <p className="sl-caption">
                        Ticket state: <span className="sl-strong">{delivery.ticketState.replace('_', ' ')}</span> ·{' '}
                        <Link to="/app/destinations" className="sl-quietlink">
                          open in Destinations
                        </Link>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="sl-p">
                    {ins.status === 'pending_review' ? (
                      <>
                        Not delivered yet: waiting for a reviewer. <Link to={`/app/review/${ins.id}`}>Review it</Link>
                      </>
                    ) : ins.status === 'rejected' ? (
                      'Rejected in review; nothing was routed.'
                    ) : ins.status === 'held' ? (
                      'Held below the review floor; visible here, not routed.'
                    ) : (
                      'No delivery recorded.'
                    )}
                  </p>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.h3}>Review history</h3>
                {d.reviews.length ? (
                  <ul className={styles.reviews}>
                    {d.reviews.map((r) => (
                      <ReviewDiff key={r.id} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className="sl-p">{ins.gate === 'auto_route' ? 'Auto-routed above 0.80: no human review was needed.' : 'No review actions yet.'}</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    host,
  );
}
