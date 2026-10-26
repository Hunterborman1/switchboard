/**
 * Deliveries: what owners see in the tools they already use. One tab per kind of tool, a list
 * of deliveries on the left and a preview of the selected one on the right, built from the real
 * delivery. The tracker preview carries the ticket status the PM moves; Shipped notifies the CSM.
 * The selected tab and delivery live in the URL; the walkthrough step in the URL (?tour=) picks
 * the tab its spotlight needs.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Channel, Delivery, Person } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { CHANNEL_CONNECTOR, connectorById } from '../../shared/platform';
import { Badge, ButtonLink, Card, CopyText, EmptyState, Page, PageHeader, Skeleton, Tabs, useToast, type Tone } from '../../ds';
import { IconPlug, IconRoute, IconSend } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, useConnections, useDeliveries, usePeople, useSession } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ChannelMark, channelLabel, channelReady } from '../components/destinations/channel';
import {
  ChatPreview,
  DigestPreview,
  DocPreview,
  EmailPreview,
  JiraPreview,
  LinearPreview,
  ROLE_TEXT,
  SalesforcePreview,
  accountFor,
  deliveryTitle,
  str,
  taggedPeople,
  type PeopleLookup,
  type TicketState,
} from '../components/destinations/Previews';
import { ErrorState, SIMULATED_TIP, SimulatedBadge, When } from '../components/domain';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { isoWeekOf, weekStart } from './themes/weeks';
import styles from './destinations/destinations.module.css';

type Kind = 'issues' | 'chat' | 'crm' | 'email' | 'docs';
const KINDS: { value: Kind; label: string; noun: string; channels: Channel[]; prefer: Channel; connector: string }[] = [
  { value: 'issues', label: 'Issues', noun: 'Issue', channels: ['jira', 'linear'], prefer: 'jira', connector: 'jira' },
  { value: 'chat', label: 'Chat', noun: 'Chat', channels: ['slack', 'teams'], prefer: 'slack', connector: 'slack' },
  { value: 'crm', label: 'CRM', noun: 'CRM', channels: ['salesforce'], prefer: 'salesforce', connector: 'salesforce' },
  { value: 'email', label: 'Email', noun: 'Email', channels: ['email', 'email_digest'], prefer: 'email', connector: 'gmail' },
  { value: 'docs', label: 'Docs', noun: 'Docs', channels: ['google_drive'], prefer: 'google_drive', connector: 'google_drive' },
];
const kindOf = (c: Channel): Kind | null => KINDS.find((k) => k.channels.includes(c))?.value ?? null;

/** Walkthrough steps that spotlight something on this page, and the tab that shows it. */
const TOUR_KIND: Record<string, Kind> = { 'ch4.jira': 'issues', 'ch4.slack': 'chat', 'ch6.ship': 'issues' };

const TOOL_NOUN: Record<Channel, string> = {
  jira: 'Jira issue',
  linear: 'Linear issue',
  slack: 'Slack message',
  teams: 'Teams post',
  salesforce: 'Salesforce activity and task',
  email: 'Email',
  email_digest: 'Weekly digest',
  google_drive: 'Voice-of-customer doc',
  triage: 'Triage item',
};

/** Every connector is simulated, so a delivery is never "Delivered" without saying so. */
const STATUS: Record<Delivery['status'], { label: string; tone: Tone }> = {
  delivered: { label: 'Delivered (simulated)', tone: 'success' },
  queued: { label: 'Queued', tone: 'neutral' },
  retrying: { label: 'Retrying', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};
const TICKET: Record<TicketState, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  shipped: { label: 'Shipped', tone: 'success' },
  wont_do: { label: 'Won’t do', tone: 'neutral' },
};

/** One row in the list: a single delivery, or a weekly digest (every digest item for one owner and week). */
type Entry = { id: string; kind: Kind; channel: Channel; primary: Delivery; items: Delivery[]; mine: boolean; createdAt: string };

function buildEntries(list: Delivery[], ws: string | null): Record<Kind, Entry[]> {
  const out: Record<Kind, Entry[]> = { issues: [], chat: [], crm: [], email: [], docs: [] };
  const digests = new Map<string, Delivery[]>();
  for (const d of list) {
    const kind = kindOf(d.channel);
    if (!kind) continue;
    if (d.channel === 'email_digest') {
      const k = `${d.ownerId}|${isoWeekOf(d.createdAt)}|${d.destination}`;
      digests.set(k, [...(digests.get(k) ?? []), d]);
      continue;
    }
    out[kind].push({ id: d.id, kind, channel: d.channel, primary: d, items: [d], mine: !!ws && d.workspaceId === ws, createdAt: d.createdAt });
  }
  for (const [k, items] of digests) {
    const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const primary = sorted[0]!;
    out.email.push({ id: `digest:${k}`, kind: 'email', channel: 'email_digest', primary, items: sorted, mine: !!ws && sorted.some((d) => d.workspaceId === ws), createdAt: primary.createdAt });
  }
  for (const k of Object.keys(out) as Kind[]) out[k].sort((a, b) => Number(b.mine) - Number(a.mine) || b.createdAt.localeCompare(a.createdAt));
  return out;
}

/** The viewer's own delivery first; then Brightline (the walkthrough account) in the preferred tool; then the newest. */
function pickDefault(entries: Entry[], prefer: Channel): Entry | null {
  const brightline = (e: Entry) => /brightline/i.test(str(e.primary.payload, 'account') ?? '');
  return (
    entries.find((e) => e.mine && e.channel === prefer) ??
    entries.find((e) => e.mine) ??
    entries.find((e) => brightline(e) && e.channel === prefer) ??
    entries.find((e) => e.channel === prefer) ??
    entries[0] ??
    null
  );
}

export default function DestinationsPage() {
  useDocumentTitle('Deliveries');
  const deliveriesQ = useDeliveries(null);
  const session = useSession();
  const peopleQ = usePeople();
  const connQ = useConnections();
  const world = useWorldIndex();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [stateOverride, setStateOverride] = useState<Record<string, TicketState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const ws = session.data?.workspaceId ?? null;

  const all = useMemo(() => (deliveriesQ.data ?? []).map((d) => (stateOverride[d.id] ? { ...d, ticketState: stateOverride[d.id]! } : d)), [deliveriesQ.data, stateOverride]);
  const entries = useMemo(() => buildEntries(all, ws), [all, ws]);

  // Tab: the URL, else the kind of a deep-linked delivery, else Issues.
  const requested = params.get('kind') as Kind | null;
  const selectedParam = params.get('d');
  const linkedKind = selectedParam ? (Object.keys(entries) as Kind[]).find((k) => entries[k].some((e) => e.id === selectedParam)) : undefined;
  const kind: Kind = requested && KINDS.some((k) => k.value === requested) ? requested : (linkedKind ?? 'issues');
  const def = KINDS.find((k) => k.value === kind)!;
  const list = entries[kind];
  const selected = list.find((e) => e.id === selectedParam) ?? pickDefault(list, def.prefer);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // The walkthrough names its step in the URL; show the tab that step spotlights.
  const tourStep = params.get('tour');
  useEffect(() => {
    const want = tourStep ? TOUR_KIND[tourStep] : undefined;
    if (want && want !== requested) {
      const next = new URLSearchParams(params);
      next.set('kind', want);
      next.delete('d');
      setParams(next, { replace: true });
    }
    // Only when the step changes: afterwards the viewer may switch tabs freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  const lookup: PeopleLookup = useMemo(() => {
    const people: Person[] = peopleQ.data?.length ? peopleQ.data : world.people;
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      person: (id) => (id ? (byId.get(id) ?? world.person(id)) : null),
      csmFor: (accountId) => {
        const csmId = world.account(accountId)?.csmId;
        return csmId ? (byId.get(csmId) ?? world.person(csmId)) : null;
      },
      byName: (name) => (name ? (people.find((p) => p.name === name) ?? null) : null),
    };
  }, [peopleQ.data, world]);

  const open = (e: Entry) => {
    const next = new URLSearchParams(params);
    next.set('kind', e.kind);
    next.set('d', e.id);
    setParams(next, { replace: true });
    emit({ name: 'delivery.opened', deliveryId: e.primary.id, channel: e.primary.channel });
  };

  // Status changes are optimistic and written one at a time: a click while one is saving shows
  // at once and is sent when the current write finishes (the latest click wins).
  const saving = useRef(false);
  const queued = useRef<{ d: Delivery; state: TicketState } | null>(null);
  const setTicket = async (d: Delivery, state: TicketState) => {
    setStateOverride((cur) => ({ ...cur, [d.id]: state }));
    if (saving.current) {
      queued.current = { d, state };
      return;
    }
    const prev = deliveriesQ.data?.find((x) => x.id === d.id)?.ticketState ?? null;
    saving.current = true;
    setBusy(d.id);
    try {
      const res = await api.ticket(d.id, state);
      emit({ name: 'ticket.state', deliveryId: d.id, state });
      track('ticket_state', { deliveryId: d.id, channel: d.channel, state });
      if (res.data.notification) {
        toast({ tone: 'success', title: state === 'shipped' ? 'Shipped. The CSM has been told.' : 'Moved. The CSM has been told.', body: res.data.notification.title });
      } else {
        toast({ tone: 'info', title: `${d.receipt ?? 'Ticket'} moved to ${TICKET[state].label.toLowerCase()}` });
      }
      invalidate('deliveries', 'notifications', 'insight/');
    } catch (err) {
      queued.current = null;
      setStateOverride((cur) => {
        const c = { ...cur };
        if (prev) c[d.id] = prev;
        else delete c[d.id];
        return c;
      });
      toast({ tone: 'danger', title: 'Couldn’t change the ticket status', body: err instanceof Error ? err.message : String(err) });
    } finally {
      saving.current = false;
      setBusy(null);
      const next = queued.current;
      queued.current = null;
      if (next) void setTicket(next.d, next.state);
    }
  };

  // Keep the selected delivery in view inside the list (the default pick may sit further down).
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const ul = listRef.current;
    const el = ul?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!ul || !el) return;
    const top = el.offsetTop;
    if (top < ul.scrollTop || top + el.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = Math.max(0, top - 8);
  }, [selected?.id, kind]);

  // Telemetry: the digest was looked at (once per visit).
  const digestSeen = useRef(false);
  useEffect(() => {
    if (selected?.channel === 'email_digest' && !digestSeen.current) {
      digestSeen.current = true;
      track('digest_opened', { count: selected.items.length });
    }
  }, [selected]);

  const loading = deliveriesQ.loading;
  const connections = connQ.data;

  return (
    <Page>
      <PageHeader
        title="Deliveries"
        description="What owners see in the tools they already use."
        badge={<SimulatedBadge tip={SIMULATED_TIP.deliveries} />}
      />

      <Tabs<Kind>
        label="Delivery destinations"
        value={kind}
        onChange={(v) => setParam({ kind: v, d: null })}
        items={KINDS.map((k) => ({ value: k.value, label: k.label, count: deliveriesQ.data ? entries[k.value].length : null }))}
      />

      {loading ? (
        <div className={styles.layoutWrap}>
          <div className={styles.layout} aria-busy="true" aria-label="Loading deliveries">
            <Card flush>
              <div className={styles.skelList}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className={styles.skelItem}>
                    <Skeleton width={20} height={20} radius={5} />
                    <div className={styles.skelText}>
                      <Skeleton width="90%" height={12} />
                      <Skeleton width="50%" height={10} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Skeleton height={520} radius={8} />
          </div>
        </div>
      ) : deliveriesQ.error && !deliveriesQ.data ? (
        <Card>
          <ErrorState error={deliveriesQ.error} onRetry={() => void deliveriesQ.refresh()} what="deliveries" />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyKind kind={def} ready={channelReady(def.prefer, connections)} />
        </Card>
      ) : (
        <div className={styles.layoutWrap}>
          <div className={styles.layout} role="tabpanel" aria-label={def.label}>
            <Card flush className={styles.listCard}>
              <ul ref={listRef} className={styles.list} aria-label={`${def.noun} deliveries`}>
                {list.map((e) => (
                  <li key={e.id} className={styles.listItem}>
                    <EntryButton entry={e} active={selected?.id === e.id} onSelect={() => open(e)} />
                  </li>
                ))}
              </ul>
            </Card>
            {selected ? <PreviewPanel entry={selected} lookup={lookup} busy={busy === selected.primary.id} onState={(s) => void setTicket(selected.primary, s)} /> : null}
          </div>
        </div>
      )}
    </Page>
  );
}

function EntryButton({ entry: e, active, onSelect }: { entry: Entry; active: boolean; onSelect: () => void }) {
  const d = e.primary;
  const digest = e.channel === 'email_digest';
  const title = digest ? d.destination || 'Weekly digest' : deliveryTitle(d);
  const sub = digest ? `Week of ${weekStart(isoWeekOf(d.createdAt))}, ${e.items.length} signal${e.items.length === 1 ? '' : 's'}` : (str(d.payload, 'account') ?? d.destination);
  return (
    <button type="button" className={styles.item} aria-current={active ? 'true' : undefined} onClick={onSelect}>
      <ChannelMark channel={e.channel} size={20} />
      <span className={styles.itemText}>
        <span className={styles.itemTitle}>{title}</span>
        <span className={styles.itemMeta}>
          <span className={styles.itemSub} title={sub}>
            {sub}
          </span>
          {e.mine ? <Badge tone="accent">Yours</Badge> : null}
          {d.ticketState ? <Badge tone={TICKET[d.ticketState].tone}>{TICKET[d.ticketState].label}</Badge> : null}
          <span className={styles.itemWhen}>
            <When value={e.createdAt} />
          </span>
        </span>
      </span>
    </button>
  );
}

function PreviewPanel({ entry: e, lookup, busy, onState }: { entry: Entry; lookup: PeopleLookup; busy: boolean; onState: (s: TicketState) => void }) {
  const d = e.primary;
  const tagged = taggedPeople(d, lookup);
  const st = STATUS[d.status];
  const retries = Math.max(0, d.attempts.length - 1);
  const owner = lookup.person(d.ownerId);
  const digest = e.channel === 'email_digest';
  const description = digest
    ? `${e.items.length} signal${e.items.length === 1 ? '' : 's'} batched into one email for ${owner?.name ?? 'the owner'}.`
    : tagged.length
      ? `Tags ${tagged.map((t) => `${t.name} (${ROLE_TEXT[t.role]})`).join(', ')}.`
      : `Sent to ${owner?.name ?? 'the owner'}.`;

  let preview;
  switch (e.channel) {
    case 'jira':
      preview = <JiraPreview delivery={d} tagged={tagged} busy={busy} onState={onState} />;
      break;
    case 'linear':
      preview = <LinearPreview delivery={d} tagged={tagged} busy={busy} onState={onState} />;
      break;
    case 'slack':
    case 'teams':
      preview = <ChatPreview delivery={d} tagged={tagged} onOpen={() => emit({ name: 'delivery.opened', deliveryId: d.id, channel: d.channel })} />;
      break;
    case 'salesforce':
      preview = <SalesforcePreview delivery={d} tagged={tagged} />;
      break;
    case 'email':
      preview = <EmailPreview delivery={d} tagged={tagged} />;
      break;
    case 'email_digest':
      preview = (
        <DigestPreview
          deliveries={e.items}
          recipient={owner?.name ?? d.destination}
          recipientEmail={str(d.payload, 'to') ?? owner?.email ?? null}
          weekOf={weekStart(isoWeekOf(d.createdAt))}
          account={accountFor(d)}
        />
      );
      break;
    default:
      preview = <DocPreview delivery={d} tagged={tagged} />;
  }

  return (
    <Card
      className={styles.previewCard}
      title={TOOL_NOUN[e.channel]}
      description={description}
      actions={
        digest ? null : (
          <ButtonLink to={`/app/insights/${d.insightId}`} size="sm" variant="ghost">
            Open insight
          </ButtonLink>
        )
      }
      bodyClassName={styles.inset}
      footer={
        <>
          <span className={styles.footStart}>
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {retries ? <span>after {retries === 1 ? '1 retry' : `${retries} retries`}</span> : null}
            {d.receipt && !digest ? <CopyText value={d.receipt} label="Copy receipt" /> : null}
          </span>
          <span className={styles.footEnd}>
            {channelLabel(d.channel)}, <When value={d.createdAt} />
          </span>
        </>
      }
    >
      {preview}
    </Card>
  );
}

function EmptyKind({ kind, ready }: { kind: (typeof KINDS)[number]; ready: boolean }) {
  const connectorId = CHANNEL_CONNECTOR[kind.prefer];
  const name = connectorId ? (connectorById(connectorId)?.name ?? kind.label) : kind.label;
  return (
    <EmptyState
      icon={<IconSend />}
      title={`Nothing sent to ${kind.channels.map(channelLabel).join(' or ')} yet`}
      description={ready ? `Point a routing rule at ${name} and its matches show up here.` : `${name} isn’t connected. Connect it, then point a routing rule at it.`}
      actions={
        <>
          {!ready && connectorId ? (
            <ButtonLink to={`/app/connections/${connectorId}`} size="sm" variant="primary" icon={<IconPlug size={14} />}>
              Connect {name}
            </ButtonLink>
          ) : null}
          <ButtonLink to="/app/routing" size="sm" icon={<IconRoute size={14} />}>
            Edit routing rules
          </ButtonLink>
        </>
      }
    />
  );
}
