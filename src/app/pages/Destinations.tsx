import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Channel, Delivery } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { EmptyState } from '../../uis/EmptyState';
import { RelativeTime } from '../../uis/RelativeTime';
import { StatusChip } from '../../uis/StatusChip';
import { CardSkeleton, Skeleton, SkeletonSurface } from '../../uis/Skeleton';
import { api } from '../api/client';
import { invalidate, useDeliveries, useSession } from '../api/hooks';
import { AppPageHeader, ErrorState, useToast } from '../components/ui';
import { ChatPreview, DigestPreview, IssuePreview, TicketPreview, deliveryTitle, type TicketState } from '../components/destinations/Previews';
import { IconHash, IconIssue, IconMail, IconTicket } from '../components/icons';
import { CHANNEL_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './destinations/destinations.module.css';

const SECTIONS: { channel: Exclude<Channel, 'triage'>; title: string; sub: string; icon: React.ReactNode }[] = [
  { channel: 'jira', title: 'Issue tracker', sub: 'Bugs and requests become tickets with the evidence attached. The PM moves them; Shipped notifies the CSM.', icon: <IconTicket size={16} /> },
  { channel: 'slack', title: 'Team chat', sub: 'Time-sensitive signals (competitors, churn, large-account pricing) post to the owner’s channel.', icon: <IconHash size={16} /> },
  { channel: 'linear', title: 'Product issues', sub: 'Teams that plan in an issue tool get the same payload as an issue.', icon: <IconIssue size={16} /> },
  { channel: 'email_digest', title: 'Weekly email digest', sub: 'Lower-urgency signals batch into one weekly email per owner.', icon: <IconMail size={16} /> },
];

function isBrightline(d: Delivery): boolean {
  return /brightline/i.test(String(d.payload.account ?? ''));
}

function pickDefault(list: Delivery[], ws: string | null): Delivery | null {
  return (ws ? list.find((d) => d.workspaceId === ws) : undefined) ?? list.find(isBrightline) ?? list[0] ?? null;
}

/** The viewer's own deliveries first (newest first), then everything else in its order. */
function ownFirst(list: Delivery[], ws: string | null): Delivery[] {
  if (!ws) return list;
  const mine = list.filter((d) => d.workspaceId === ws);
  return mine.length ? [...mine, ...list.filter((d) => d.workspaceId !== ws)] : list;
}

function isoWeekLabel(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const w = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `Week ${w}`;
}

export default function DestinationsPage() {
  const { data, dataAsOf, error, loading, refresh } = useDeliveries(null);
  const world = useWorldIndex();
  const session = useSession();
  const ws = session.data?.workspaceId ?? null;
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [stateOverride, setStateOverride] = useState<Record<string, TicketState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const all = useMemo(() => (data ?? []).map((d) => (stateOverride[d.id] ? { ...d, ticketState: stateOverride[d.id]! } : d)), [data, stateOverride]);
  const byChannel = useMemo(() => {
    const m: Record<string, Delivery[]> = {};
    for (const d of all) (m[d.channel] ??= []).push(d);
    for (const k of Object.keys(m)) m[k] = ownFirst(m[k]!, ws);
    return m;
  }, [all, ws]);

  const selectedFor = (channel: Channel): Delivery | null => {
    const list = byChannel[channel] ?? [];
    const id = params.get(channel);
    return list.find((d) => d.id === id) ?? pickDefault(list, ws);
  };

  const select = (channel: Channel, d: Delivery) => {
    const next = new URLSearchParams(params);
    next.set(channel, d.id);
    setParams(next, { replace: true });
    emit({ name: 'delivery.opened', deliveryId: d.id, channel: d.channel });
  };

  const setTicket = async (d: Delivery, state: TicketState) => {
    const prev = d.ticketState;
    setStateOverride((cur) => ({ ...cur, [d.id]: state }));
    setBusy(d.id);
    try {
      const res = await api.ticket(d.id, state);
      emit({ name: 'ticket.state', deliveryId: d.id, state });
      track('ticket_state', { deliveryId: d.id, channel: d.channel, state });
      if (res.data.notification) {
        toast({ tone: 'success', title: state === 'shipped' ? 'Shipped · CSM notified' : 'Owner picked it up · CSM notified', body: res.data.notification.title });
      } else {
        toast({ tone: 'info', title: `${d.receipt ?? 'Ticket'} → ${state.replace('_', ' ')}` });
      }
      invalidate('deliveries', 'notifications', 'insight/');
    } catch (err) {
      setStateOverride((cur) => {
        const c = { ...cur };
        if (prev) c[d.id] = prev;
        else delete c[d.id];
        return c;
      });
      toast({ tone: 'danger', title: 'Could not change the ticket state', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  // Digest viewed → telemetry (once per mount, when it scrolls into view).
  const digestRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = digestRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let sent = false;
    const io = new IntersectionObserver((entries) => {
      if (!sent && entries.some((e) => e.isIntersecting)) {
        sent = true;
        track('digest_opened', { count: byChannel.email_digest?.length ?? 0 });
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [byChannel.email_digest?.length, loading]);

  return (
    <div className="sl-page">
      <AppPageHeader title="Destinations" dataAsOf={dataAsOf} />
      <p className={styles.intro}>
        Where routed insights land, rendered from the real delivery payloads. These are look-alike previews of the tools owners already use; every one carries the verbatim quote and links back to its provenance.
      </p>
      <nav className={styles.jump} aria-label="Jump to a destination">
        {SECTIONS.map((s) => (
          <a key={s.channel} href={`#dest-${s.channel}`} className={styles.jumpLink} onClick={(e) => { e.preventDefault(); document.getElementById(`dest-${s.channel}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {s.icon}
            {s.title}
            <span className={styles.count}>{byChannel[s.channel]?.length ?? 0}</span>
          </a>
        ))}
      </nav>

      {error && !data ? (
        <ErrorState error={error} onRetry={refresh} what="deliveries" />
      ) : loading ? (
        <SkeletonSurface label="Loading destinations">
          <div className={styles.section}>
            <div className={styles.list}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} height={52} />
              ))}
            </div>
            <CardSkeleton lines={6} />
          </div>
        </SkeletonSurface>
      ) : (
        SECTIONS.map((s) => {
          const list = byChannel[s.channel] ?? [];
          const sel = selectedFor(s.channel);
          return (
            <section key={s.channel} id={`dest-${s.channel}`} className={styles.block} ref={s.channel === 'email_digest' ? (el) => { digestRef.current = el; } : undefined}>
              <header className={styles.blockHead}>
                <span className={styles.blockIcon} aria-hidden="true">{s.icon}</span>
                <div>
                  <h2 className={styles.blockTitle}>
                    {s.title} <span className={styles.blockChannel}>· {CHANNEL_LABEL[s.channel]}</span>
                  </h2>
                  <p className={styles.blockSub}>{s.sub}</p>
                </div>
              </header>
              {list.length === 0 && s.channel === 'email_digest' && all.length > 0 ? (
                <div className={styles.digestWrap}>
                  <DigestPreview
                    deliveries={[...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)}
                    recipient={`${world.personName('ppl_rachel') === 'ppl_rachel' ? 'VP Product' : world.personName('ppl_rachel')} (product leadership digest)`}
                    week={isoWeekLabel(all[0]?.createdAt)}
                    note="No rule routes to the digest channel in your workspace yet, so this preview is built from the most recent deliveries across all channels."
                  />
                </div>
              ) : list.length === 0 ? (
                <EmptyState variant="no-data" title={`Nothing routed to ${CHANNEL_LABEL[s.channel]} yet`} description="Approve an item in Review, or change a routing rule, to send one here." />
              ) : s.channel === 'email_digest' ? (
                <div className={styles.digestWrap}>
                  <DigestPreview deliveries={list} recipient={`${world.personName(list[0]!.ownerId)}${list.some((d) => d.ownerId !== list[0]!.ownerId) ? ' and other digest owners' : ''}`} week={isoWeekLabel(list[0]?.createdAt)} />
                </div>
              ) : (
                <div className={styles.section}>
                  <ul className={styles.list} aria-label={`${CHANNEL_LABEL[s.channel]} deliveries`}>
                    {list.slice(0, 12).map((d) => {
                      const active = sel?.id === d.id;
                      const mine = !!ws && d.workspaceId === ws;
                      return (
                        <li key={d.id}>
                          <button type="button" className={styles.item} aria-current={active ? 'true' : undefined} onClick={() => select(s.channel, d)}>
                            {mine ? <span className={styles.mine}>From your run</span> : null}
                            <span className={styles.itemTitle}>{deliveryTitle(d)}</span>
                            <span className={styles.itemMeta}>
                              <span className="sl-ellipsis">{String(d.payload.account ?? d.destination)}</span>
                              {d.ticketState ? (
                                <StatusChip size="sm" tone={d.ticketState === 'shipped' ? 'success' : d.ticketState === 'in_progress' ? 'info' : 'neutral'}>
                                  {d.ticketState.replace('_', ' ')}
                                </StatusChip>
                              ) : (
                                <RelativeTime value={d.createdAt} />
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className={styles.preview}>
                    {sel ? (
                      s.channel === 'jira' ? (
                        <TicketPreview delivery={sel} owner={world.person(sel.ownerId)} busy={busy === sel.id} onState={(st) => void setTicket(sel, st)} />
                      ) : s.channel === 'slack' ? (
                        <ChatPreview delivery={sel} owner={world.person(sel.ownerId)} onOpen={() => emit({ name: 'delivery.opened', deliveryId: sel.id, channel: sel.channel })} />
                      ) : (
                        <IssuePreview delivery={sel} owner={world.person(sel.ownerId)} busy={busy === sel.id} onState={(st) => void setTicket(sel, st)} />
                      )
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
