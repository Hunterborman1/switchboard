/**
 * Close the loop: the CSM's side. Every insight a CSM sent in comes back to them as it is
 * routed, acknowledged and shipped; a shipped one carries a drafted note for the customer.
 * The person filter, the kind filter and the open notification live in the URL.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Notification } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  KeyValue,
  Page,
  PageHeader,
  PersonChip,
  Quote,
  Segmented,
  Select,
  Skeleton,
  Stats,
  Textarea,
  Toolbar,
  Tooltip,
  useToast,
  type Tone,
} from '../../ds';
import { IconCopy, IconInbox, IconInfo, IconMail } from '../../ds/icons';
import { useInsightDetail, useMe, useNotifications, usePeople, useSession } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, SeverityBadge, SIMULATED_TIP, SimulatedBadge, TypeLabel, When } from '../components/domain';
import { dateShort } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { RedactedText } from './run/Transcript';
import styles from './loop/Loop.module.css';

type Kind = Notification['kind'];
type KindFilter = 'all' | Kind;
const KINDS: Kind[] = ['routed', 'acknowledged', 'shipped'];
const KIND_LABEL: Record<Kind, string> = { routed: 'Routed', acknowledged: 'Acknowledged', shipped: 'Shipped' };
const KIND_TONE: Record<Kind, Tone> = { routed: 'neutral', acknowledged: 'info', shipped: 'success' };
const WEEK_MS = 7 * 86_400_000;
const MINUTES_PER_ITEM = 15;
const PAGE = 30;
const PAGE_STACKED = 8;
const ALL = 'all';

/** "45 min" under two hours, then hours ("16 hours"). */
const savedTime = (min: number) => (min < 120 ? { value: min, unit: 'min' } : { value: Number.isInteger(min / 60) ? min / 60 : (min / 60).toFixed(1), unit: 'hours' });

/** True while the media query matches; follows resizes. */
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export default function LoopPage() {
  useDocumentTitle('Close the loop');
  const world = useWorldIndex();
  const me = useMe();
  const session = useSession();
  const people = usePeople();
  const [params, setParams] = useSearchParams();
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [extra, setExtra] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const narrow = useMedia('(max-width: 640px)');
  // Side by side, the inbox scrolls in its own column; stacked, it shows a few at a time instead.
  const stacked = useMedia('(max-width: 1099px)');
  const page = stacked ? PAGE_STACKED : PAGE;

  // Default to the acting user when they are a CSM; anyone else sees every CSM.
  const directory = people.data ?? world.people;
  const csms = directory.filter((p) => p.role === 'csm' && p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const actor = me.data ?? session.data?.actor ?? null;
  const actorCsm = actor && csms.some((p) => p.id === actor.personId) ? actor.personId : null;
  const actorKnown = !me.loading || !!session.data?.actor;
  const csmParam = params.get('csm');
  const csmId = csmParam === ALL ? null : (csmParam ?? actorCsm);
  const csm = world.person(csmId) ?? csms.find((p) => p.id === csmId) ?? null;

  const notifications = useNotifications(csmId);
  const kindParam = params.get('kind');
  const kind: KindFilter = KINDS.includes(kindParam as Kind) ? (kindParam as Kind) : 'all';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const all = useMemo(() => [...(notifications.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [notifications.data]);
  const visible = kind === 'all' ? all : all.filter((n) => n.kind === kind);
  const newestShipped = visible.find((n) => n.kind === 'shipped') ?? null;
  const nParam = params.get('n');
  const selected = (nParam ? all.find((n) => n.id === nParam) : null) ?? newestShipped ?? visible[0] ?? null;

  useEffect(() => setExtra(0), [csmId, kind]);
  const limit = page + extra;
  // The update on screen counts as read (the opened event is only for a deliberate click).
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (selectedId) setOpened((cur) => (cur.has(selectedId) ? cur : new Set(cur).add(selectedId)));
  }, [selectedId]);

  const stats = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    const week = all.filter((n) => new Date(n.createdAt).getTime() >= since);
    const ids = (k: Kind[]) => new Set(week.filter((n) => k.includes(n.kind)).map((n) => n.insightId)).size;
    return {
      landed: ids(['routed', 'acknowledged']),
      acknowledged: ids(['acknowledged']),
      shipped: ids(['shipped']),
      unread: all.filter((n) => !n.read && !opened.has(n.id)).length,
    };
  }, [all, opened]);

  const open = (n: Notification) => {
    setParam('n', n.id);
    setOpened((cur) => new Set(cur).add(n.id));
    emit({ name: 'notification.opened', notificationId: n.id });
    track('notification_opened', { notificationId: n.id, kind: n.kind, csmId: n.csmId });
    if (window.matchMedia('(max-width: 1099px)').matches) window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const count = (k: KindFilter) => (k === 'all' ? all.length : all.filter((n) => n.kind === k).length);
  const shown = visible.slice(0, limit);
  const first = (name: string | undefined) => name?.split(' ')[0];

  const header = <PageHeader title="Close the loop" description="What happened to the feedback CSMs sent in, and a note for the customer when it ships." />;

  if (notifications.loading || !actorKnown || !world.ready) {
    return (
      <Page>
        {header}
        <LoopSkeleton />
      </Page>
    );
  }

  return (
    <Page>
      {header}

      <Toolbar
        start={
          <Select
            aria-label="Choose a CSM"
            value={csmId ?? ALL}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set('csm', e.target.value);
              next.delete('n');
              setParams(next, { replace: true });
            }}
            options={[{ value: ALL, label: 'All CSMs' }, ...csms.map((p) => ({ value: p.id, label: p.id === actor?.personId ? `${p.name} (you)` : p.name }))]}
            style={{ width: 220 }}
          />
        }
        end={
          <Segmented<KindFilter>
            label="Filter updates"
            size={narrow ? 'sm' : 'md'}
            value={kind}
            onChange={(v) => {
              const next = new URLSearchParams(params);
              if (v === 'all') next.delete('kind');
              else next.set('kind', v);
              next.delete('n');
              setParams(next, { replace: true });
            }}
            options={(['all', ...KINDS] as KindFilter[]).map((k) => ({ value: k, label: k === 'all' ? 'All' : KIND_LABEL[k], count: count(k) }))}
          />
        }
      />

      {notifications.error && !notifications.data ? (
        <Card>
          <ErrorState error={notifications.error} onRetry={() => void notifications.refresh()} what="updates" />
        </Card>
      ) : (
        <>
          <Stats
            items={[
              { label: 'Reached an owner', value: stats.landed, unit: stats.landed === 1 ? 'insight' : 'insights', sub: 'In the last 7 days' },
              { label: 'Acknowledged', value: stats.acknowledged, unit: `of ${stats.landed}`, sub: 'Owners who replied' },
              { label: 'Shipped', value: stats.shipped, unit: stats.shipped === 1 ? 'change' : 'changes', sub: 'Each comes with a customer note' },
              {
                label: 'Follow-up time saved',
                info: (
                  <Tooltip label={`An estimate: ${MINUTES_PER_ITEM} minutes per item to write it up, find the owner and chase its status. A time study replaces it with measured numbers.`}>
                    <span tabIndex={0} className={styles.info} aria-label="How this is estimated">
                      <IconInfo size={14} />
                    </span>
                  </Tooltip>
                ),
                ...savedTime((stats.landed + stats.shipped) * MINUTES_PER_ITEM),
                sub: `Estimate at ${MINUTES_PER_ITEM} minutes per item`,
              },
            ]}
          />

          <div className={styles.split}>
            <Card
              title="Inbox"
              description={all.length ? `${stats.unread} unread of ${all.length}` : undefined}
              flush
              attrs={tourAnchor('loop.inbox')}
              footer={
                visible.length > shown.length ? (
                  <>
                    <span>
                      Showing {shown.length} of {visible.length}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setExtra((x) => x + page)}>
                      Show more
                    </Button>
                  </>
                ) : undefined
              }
            >
              {visible.length === 0 ? (
                <EmptyState
                  compact
                  icon={<IconInbox />}
                  title={all.length === 0 ? 'No updates yet' : 'Nothing in this filter'}
                  description={
                    all.length === 0 ? `When feedback ${csm ? `from ${first(csm.name)}’s` : 'from a CSM’s'} conversations is routed, acknowledged or shipped, it shows up here.` : 'Try another filter.'
                  }
                  actions={
                    all.length > 0 ? (
                      <Button size="sm" onClick={() => setParam('kind', null)}>
                        Show all updates
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className={styles.list} aria-label="Updates">
                  {shown.map((n) => {
                    const unread = !n.read && !opened.has(n.id);
                    const active = n.id === selected?.id;
                    return (
                      <li key={n.id} className={styles.listItem} {...(n === newestShipped ? tourAnchor('loop.shipped') : {})}>
                        <button type="button" className={`${styles.item}${active ? ` ${styles.itemActive}` : ''}`} onClick={() => open(n)} aria-current={active ? 'true' : undefined}>
                          <span className={`${styles.dot}${unread ? ` ${styles.dotUnread}` : ''}`} aria-hidden="true" />
                          <span className={styles.itemBody}>
                            <span className={styles.itemTop}>
                              <Badge tone={KIND_TONE[n.kind]}>{KIND_LABEL[n.kind]}</Badge>
                              {!csmId ? <span className={styles.itemWho}>{world.personName(n.csmId)}</span> : null}
                              <span className={styles.itemTime}>
                                <When value={n.createdAt} />
                              </span>
                            </span>
                            <span className={`${styles.itemTitle}${unread ? ` ${styles.itemTitleUnread}` : ''}`}>{n.title}</span>
                            <span className={styles.itemSnippet}>{n.body}</span>
                            {unread ? <span className="ds-sr-only">Unread</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div ref={detailRef} className={styles.detailCol}>
              {selected ? (
                <NotificationDetail key={selected.id} n={selected} showCsm={!csmId} />
              ) : (
                <Card title="Update" attrs={tourAnchor('loop.note')}>
                  <EmptyState compact icon={<IconMail />} title="Pick an update" description="Open an update to see what happened and the note drafted for the customer." />
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

/** Enough rows to show the drafted note without scrolling, within reason. */
const noteRows = (text: string) => Math.min(14, Math.max(5, text.split(/\n/).reduce((a, line) => a + Math.max(1, Math.ceil(line.length / 78)), 0) + 1));

function NotificationDetail({ n, showCsm }: { n: Notification; showCsm: boolean }) {
  const detail = useInsightDetail(n.insightId);
  const world = useWorldIndex();
  const toast = useToast();
  const original = n.draftCustomerNote ?? '';
  const [note, setNote] = useState(original);

  const ins = detail.data?.insight ?? null;
  const delivery = detail.data?.deliveries.find((d) => d.receipt) ?? detail.data?.deliveries[0] ?? null;
  const owner = delivery ? world.person(delivery.ownerId) : null;
  const acct = world.account(ins?.accountId);
  const evidence = ins?.evidence.find((e) => e.method !== 'failed') ?? ins?.evidence[0] ?? null;
  const quote = evidence ? (evidence.matchedText ?? evidence.quote) : null;
  const csm = world.person(n.csmId);
  const contact = acct?.name ?? 'the customer';

  const happened =
    n.kind === 'shipped' && owner
      ? `${owner.name} moved ${delivery?.receipt ?? 'the ticket'} to Shipped.`
      : n.kind === 'acknowledged' && owner
        ? `${owner.name} picked it up.`
        : n.kind === 'routed' && owner
          ? `Sent to ${owner.name}.`
          : n.body.split(/(?<=\.)\s/)[0];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note);
      toast({ tone: 'success', title: 'Note copied', body: 'Paste it into your email to the customer.' });
    } catch {
      toast({ tone: 'danger', title: 'Couldn’t copy the note', body: 'Select the text and copy it instead.' });
    }
  };
  const saveToGmail = () => {
    toast({ tone: 'success', title: 'Gmail draft (simulated)', body: `In production this saves a draft to ${contact} for you to send. Nothing was sent.` });
  };

  const facts: { label: string; value: ReactNode }[] = [
    owner
      ? {
          label: 'Owner',
          value: (
            <span className={styles.chipWrap}>
              <PersonChip name={owner.name} sub={owner.title} size="sm" />
            </span>
          ),
        }
      : null,
    delivery?.receipt ? { label: 'Ticket', value: <span className={styles.receipt}>{delivery.receipt}</span> } : null,
    acct ? { label: 'Account', value: `${acct.name}, ${acct.tier}, renews ${dateShort(acct.renewalDate)}` } : null,
    showCsm && csm ? { label: 'CSM', value: csm.name } : null,
  ].filter((x) => x != null);

  return (
    <Card
      title={n.title}
      description={
        <span className={styles.detailMeta}>
          <Badge tone={KIND_TONE[n.kind]}>{KIND_LABEL[n.kind]}</Badge>
          <When value={n.createdAt} />
        </span>
      }
      actions={
        ins ? (
          <ButtonLink to={`/app/insights/${ins.id}`} variant="ghost" size="sm">
            Open insight
          </ButtonLink>
        ) : undefined
      }
    >
      <div className={styles.detailBody}>
        <section className={styles.block} aria-label="What happened">
          <h3 className={styles.blockTitle}>What happened</h3>
          <p className={styles.happened}>{happened}</p>
          {facts.length ? <KeyValue items={facts} /> : detail.loading ? <Skeleton width="60%" /> : null}
        </section>

        <section className={styles.insight} aria-label="The insight">
          {ins ? (
            <>
              <span className={styles.insightTags}>
                <TypeLabel type={ins.type} />
                <SeverityBadge severity={ins.severity} />
              </span>
              <p className={styles.insightSummary}>{ins.summary}</p>
              {quote ? <Quote cite={acct ? `${acct.name}, in the conversation` : 'From the conversation'}>
                  <RedactedText text={quote} />
                </Quote> : null}
            </>
          ) : detail.loading ? (
            <div className="ds-stack" style={{ gap: 10 }}>
              <Skeleton width={160} />
              <Skeleton width="90%" />
              <Skeleton width="70%" />
            </div>
          ) : (
            <p className={styles.muted}>The insight behind this update is no longer in this workspace.</p>
          )}
        </section>

        <section className={styles.block} {...tourAnchor('loop.note')} aria-label="Draft note to the customer">
          {n.draftCustomerNote ? (
            <>
              <Field label="Draft note to the customer" hint="Drafted from the shipped ticket. Edit it before it goes anywhere; nothing is sent automatically." htmlFor={`note-${n.id}`}>
                <Textarea id={`note-${n.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={noteRows(original)} />
              </Field>
              <div className={styles.noteActions}>
                {note !== original ? (
                  <Button size="sm" variant="ghost" onClick={() => setNote(original)} className={styles.revert}>
                    Undo my edits
                  </Button>
                ) : null}
                <Button icon={<IconCopy size={14} />} onClick={() => void copy()}>
                  Copy
                </Button>
                <SimulatedBadge tip={SIMULATED_TIP.gmail} />
                <Button variant="primary" icon={<IconMail size={14} />} onClick={saveToGmail} disabled={!note.trim()}>
                  Send from Gmail
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.noNote}>
              <IconMail size={16} />
              <span>A note to the customer is drafted when this ships, so the CSM can close the loop in one step.</span>
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}

function LoopSkeleton() {
  return (
    <div className="ds-stack" style={{ gap: 24 }} aria-busy="true" aria-label="Loading updates">
      <div className="ds-row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <Skeleton width={220} height={32} radius={6} />
        <Skeleton width={360} height={32} radius={6} />
      </div>
      <Skeleton height={96} radius={8} />
      <div className={styles.split}>
        <div className="ds-card">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ds-stack" style={{ gap: 8, padding: '16px 20px', borderBottom: i < 5 ? '1px solid var(--border-row)' : 0 }}>
              <Skeleton width={90} height={10} />
              <Skeleton width="85%" height={10} />
              <Skeleton width="60%" height={10} />
            </div>
          ))}
        </div>
        <div className="ds-card ds-stack" style={{ gap: 14, padding: 20 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={10} />
          <Skeleton height={120} radius={8} />
          <Skeleton height={180} radius={6} />
        </div>
      </div>
    </div>
  );
}
