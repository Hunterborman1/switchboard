import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Notification } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Button } from '../../system/components/primitives/Button.jsx';
import { Select } from '../../system/components/forms/Select.jsx';
import { Callout } from '../../system/components/blocks/Callout.jsx';
import { Avatar } from '../../system/components/primitives/Avatar.jsx';
import { EmptyState } from '../../uis/EmptyState';
import { RelativeTime } from '../../uis/RelativeTime';
import { SegmentedControl } from '../../uis/SegmentedControl';
import { KpiStrip } from '../../uis/StatTile';
import { ListSkeleton, PageHeaderSkeleton, SkeletonSurface, TilesSkeleton } from '../../uis/Skeleton';
import { StatusChip, type StatusTone } from '../../uis/StatusChip';
import { useInsightDetail, useNotifications } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel, SeverityTag, TypeTag, useCopy } from '../components/ui';
import { IconCopy, IconCheck, IconMail } from '../components/icons';
import { useWorldIndex } from '../lib/world';
import { dateShort } from '../lib/labels';
import { track } from '../telemetry';
import styles from './loop/Loop.module.css';

type Kind = Notification['kind'];
type KindFilter = 'all' | Kind;
const KIND_LABEL: Record<Kind, string> = { routed: 'Routed', acknowledged: 'Acknowledged', shipped: 'Shipped' };
const KIND_TONE: Record<Kind, StatusTone> = { routed: 'info', acknowledged: 'warning', shipped: 'success' };
const KIND_HELP: Record<Kind, string> = {
  routed: 'Your insight reached its owner. Acknowledging is not resolving: it stays open until the owner acts.',
  acknowledged: 'The owner picked it up and said so.',
  shipped: 'The change shipped. A note to the customer is drafted for you.',
};
const WEEK_MS = 7 * 86_400_000;
const MINUTES_PER_ITEM = 15;

export default function LoopPage() {
  const world = useWorldIndex();
  const [params, setParams] = useSearchParams();
  const csmId = params.get('csm') ?? 'ppl_marcus';
  const kindParam = params.get('kind');
  const kind: KindFilter = kindParam === 'routed' || kindParam === 'acknowledged' || kindParam === 'shipped' ? kindParam : 'all';
  const notifications = useNotifications(csmId);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const all = useMemo(() => [...(notifications.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [notifications.data]);
  const visible = kind === 'all' ? all : all.filter((n) => n.kind === kind);
  const defaultId = all.find((n) => n.kind === 'shipped')?.id ?? all[0]?.id ?? null;
  const selectedId = params.get('n') && all.some((n) => n.id === params.get('n')) ? params.get('n') : defaultId;
  const selected = all.find((n) => n.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    const week = all.filter((n) => new Date(n.createdAt).getTime() >= since);
    const landed = new Set(week.filter((n) => n.kind === 'routed' || n.kind === 'acknowledged').map((n) => n.insightId));
    const shipped = new Set(week.filter((n) => n.kind === 'shipped').map((n) => n.insightId));
    const acknowledged = new Set(week.filter((n) => n.kind === 'acknowledged').map((n) => n.insightId));
    const unread = all.filter((n) => !n.read && !opened.has(n.id)).length;
    return { landed: landed.size, shipped: shipped.size, acknowledged: acknowledged.size, unread, total: all.length };
  }, [all, opened]);

  const open = (n: Notification) => {
    setParam('n', n.id);
    setOpened((cur) => new Set(cur).add(n.id));
    emit({ name: 'notification.opened', notificationId: n.id });
    track('notification_opened', { notificationId: n.id, kind: n.kind, csmId });
  };

  const csms = world.people.filter((p) => p.role === 'csm');
  const csm = world.person(csmId);

  if (notifications.loading || !world.ready) {
    return (
      <SkeletonSurface label="Loading the CSM loop">
        <PageHeaderSkeleton />
        <div className="sl-stack-lg">
          <TilesSkeleton count={4} />
          <div className="sl-grid-2">
            <ListSkeleton lines={6} />
            <ListSkeleton lines={4} />
          </div>
        </div>
      </SkeletonSurface>
    );
  }

  return (
    <div className="sl-page">
      <AppPageHeader
        title="CSM loop"
        subtitle="What happened to the feedback each CSM sent in"
        dataAsOf={notifications.dataAsOf}
        actions={
          <label className={styles.csmPicker}>
            <span className={styles.csmLabel}>CSM</span>
            <Select
              size="sm"
              aria-label="Choose a CSM"
              value={csmId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const next = new URLSearchParams(params);
                next.set('csm', e.target.value);
                next.delete('n');
                setParams(next, { replace: true });
              }}
              options={csms.map((p) => ({ value: p.id, label: p.name }))}
            />
          </label>
        }
      />

      {notifications.error && !notifications.data ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refresh()} what="notifications" />
      ) : (
        <>
          <section className={styles.hero} aria-label="This week">
            <Avatar initials={csm?.initials ?? '?'} size="lg" />
            <div className={styles.heroText}>
              <span className={styles.heroMeta}>{csm?.name ?? 'CSM'} · last 7 days</span>
              <p className={styles.headline}>
                <strong className="sl-num">{stats.landed}</strong> of your insights landed this week ·{' '}
                <strong className="sl-num">{stats.shipped}</strong> shipped
              </p>
              <p className={styles.heroSub}>Every item you send comes back to you with its status. You stay the customer’s advocate; Signal Loop does the chasing.</p>
            </div>
          </section>

          <div>
            <KpiStrip
              label="CSM loop metrics"
              items={[
                { label: 'Reached an owner', value: stats.landed, unit: stats.landed === 1 ? 'insight' : 'insights', sub: 'Sent to an owner in the last 7 days' },
                { label: 'Acknowledged', value: `${stats.acknowledged} of ${stats.landed}`, sub: 'Owners who replied' },
                { label: 'Shipped', value: stats.shipped, unit: stats.shipped === 1 ? 'change' : 'changes', sub: 'A customer note is drafted for each' },
                { label: 'Follow-up time saved', value: `about ${(stats.landed + stats.shipped) * MINUTES_PER_ITEM}`, unit: 'min', sub: `Estimate, at ${MINUTES_PER_ITEM} minutes per item` },
              ]}
            />
          </div>
          <Callout tone="neutral" title="Time saved is an estimate">
            It assumes {MINUTES_PER_ITEM} minutes per item to write it up, find the right owner and chase its status. A time study in the first week replaces this with measured numbers
            before anyone reports it.
          </Callout>

          <div className={styles.split}>
            <Panel
              title="Inbox"
              sub={`${stats.unread} unread of ${stats.total}`}
              flush
              anchor={tourAnchor('loop.inbox')}
              actions={
                <SegmentedControl<KindFilter>
                  ariaLabel="Filter notifications"
                  size="sm"
                  value={kind}
                  options={[
                    { value: 'all', label: `All · ${all.length}` },
                    { value: 'routed', label: `Routed · ${all.filter((n) => n.kind === 'routed').length}` },
                    { value: 'acknowledged', label: `Acknowledged · ${all.filter((n) => n.kind === 'acknowledged').length}` },
                    { value: 'shipped', label: `Shipped · ${all.filter((n) => n.kind === 'shipped').length}` },
                  ]}
                  onChange={(v) => setParam('kind', v === 'all' ? null : v)}
                />
              }
            >
              {visible.length === 0 ? (
                <div className={styles.emptyPad}>
                  <EmptyState
                    variant="no-data"
                    title={all.length === 0 ? 'No updates yet' : 'Nothing in this filter'}
                    description={all.length === 0 ? `When an insight from ${csm?.name.split(' ')[0] ?? 'this CSM'}'s calls is routed, acknowledged or shipped, it shows up here.` : 'Try another filter.'}
                  />
                </div>
              ) : (
                <ul className={styles.list}>
                  {visible.map((n) => {
                    const unread = !n.read && !opened.has(n.id);
                    const active = n.id === selected?.id;
                    return (
                      <li key={n.id} data-tour={n === visible.find((x) => x.kind === 'shipped') ? 'loop.shipped' : undefined}>
                        <button type="button" className={`${styles.item}${active ? ` ${styles.itemActive}` : ''}`} onClick={() => open(n)} aria-current={active ? 'true' : undefined}>
                          <span className={`${styles.unread}${unread ? ` ${styles.unreadOn}` : ''}`} aria-label={unread ? 'Unread' : undefined} />
                          <span className={styles.itemBody}>
                            <span className={styles.itemTop}>
                              <StatusChip tone={KIND_TONE[n.kind]} size="sm">
                                {KIND_LABEL[n.kind]}
                              </StatusChip>
                              <span className="sl-caption">
                                <RelativeTime value={n.createdAt} />
                              </span>
                            </span>
                            <span className={`${styles.itemTitle}${unread ? ` ${styles.itemTitleUnread}` : ''}`}>{n.title}</span>
                            <span className={styles.itemSnippet}>{n.body}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <NotificationDetail n={selected} />
          </div>
        </>
      )}
    </div>
  );
}

function NotificationDetail({ n }: { n: Notification | null }) {
  const detail = useInsightDetail(n?.insightId ?? null);
  const world = useWorldIndex();
  const [copied, copy] = useCopy();

  if (!n) {
    return (
      <Panel title="Update">
        <EmptyState variant="no-data" title="Pick an update" description="Open a notification to see what happened and the drafted note to your customer." />
      </Panel>
    );
  }
  const ins = detail.data?.insight;
  const acct = world.account(ins?.accountId);
  const quote = ins?.evidence.find((e) => e.method !== 'failed')?.matchedText ?? ins?.evidence[0]?.quote;
  return (
    <Panel
      title={n.title}
      sub={
        <span className="sl-row">
          <StatusChip tone={KIND_TONE[n.kind]} size="sm">
            {KIND_LABEL[n.kind]}
          </StatusChip>
          <span>{KIND_HELP[n.kind]}</span>
        </span>
      }
    >
      <div className="sl-stack-lg">
        <p className="sl-body">{n.body}</p>

        {ins ? (
          <div className={styles.insightBox}>
            <div className="sl-spread">
              <span className="sl-row">
                <TypeTag type={ins.type} />
                <SeverityTag severity={ins.severity} />
              </span>
              <Link to={`/app/insights/${ins.id}`} className="sl-caption">
                Open insight
              </Link>
            </div>
            <p className={styles.insightSummary}>{ins.summary}</p>
            {quote ? <blockquote className="sl-quote">{quote}</blockquote> : null}
            {acct ? (
              <span className="sl-meta">
                {acct.name} · {acct.tier} · renews {dateShort(acct.renewalDate)}
              </span>
            ) : null}
          </div>
        ) : detail.loading ? (
          <ListSkeleton lines={3} />
        ) : null}

        <div {...tourAnchor('loop.note')} className={styles.noteWrap}>
          {n.draftCustomerNote ? (
            <article className={styles.note} aria-label="Draft note to the customer">
              <header className={styles.noteHead}>
                <span className={styles.noteIcon} aria-hidden="true">
                  <IconMail size={16} />
                </span>
                <span className={styles.noteMeta}>
                  <span className="sl-strong">Draft note to the customer</span>
                  <span className="sl-caption">Drafted from the shipped ticket. Edit it before sending; nothing is sent automatically.</span>
                </span>
                <Button size="sm" variant={copied ? 'secondary' : 'primary'} onClick={() => copy(n.draftCustomerNote ?? '')} aria-live="polite">
                  <span className="sl-row-nowrap" style={{ gap: 6 }}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    {copied ? 'Copied' : 'Copy note'}
                  </span>
                </Button>
              </header>
              <p className={styles.noteBody}>{n.draftCustomerNote}</p>
            </article>
          ) : (
            <div className={styles.noNote}>
              <IconMail size={16} />
              <span>No customer note for this update. Notes are drafted when an item ships, so you can close the loop with the customer in one click.</span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
