/**
 * Delivery log: every send with its receipt. A row expands into its attempts, so a retry is
 * visible rather than hidden behind "Delivered".
 */
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Channel, Delivery } from '../../../shared/contracts';
import { Badge, Button, CellText, CopyText, EmptyState, IconButton, Select, Table, type Tone } from '../../../ds';
import { IconCheckCircle, IconChevronDown, IconChevronRight, IconSend, IconXCircle } from '../../../ds/icons';
import { CHANNELS, ChannelCell, channelLabel } from '../../components/destinations/channel';
import { When } from '../../components/domain';
import { ms } from '../../lib/labels';
import styles from './routing.module.css';

const PAGE = 20;

const STATUS: Record<Delivery['status'], { label: string; tone: Tone }> = {
  delivered: { label: 'Delivered', tone: 'success' },
  queued: { label: 'Queued', tone: 'neutral' },
  retrying: { label: 'Retrying', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

function titleOf(d: Delivery): string {
  const p = d.payload as Record<string, unknown>;
  const s = typeof p.summary === 'string' && p.summary ? p.summary : typeof p.title === 'string' && p.title ? p.title : null;
  return s ?? d.insightId;
}
function accountOf(d: Delivery): string | null {
  const a = (d.payload as Record<string, unknown>).account;
  return typeof a === 'string' && a ? a : null;
}

export function useDeliveryLog({ deliveries, personName }: { deliveries: Delivery[]; personName: (id: string | null | undefined) => string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<Channel | ''>('');
  const [limit, setLimit] = useState(PAGE);

  const present = useMemo(() => CHANNELS.filter((c) => deliveries.some((d) => d.channel === c)), [deliveries]);
  const rows = channel ? deliveries.filter((d) => d.channel === channel) : deliveries;
  const visible = rows.slice(0, limit);
  const toggle = (id: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return {
    actions:
      present.length > 1 ? (
        <span className={styles.wideOnly}>
          <Select
            selectSize="sm"
            aria-label="Filter deliveries by channel"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as Channel | '');
              setLimit(PAGE);
            }}
            options={[{ value: '', label: 'All channels' }, ...present.map((c) => ({ value: c, label: channelLabel(c) }))]}
            style={{ width: 156 }}
          />
        </span>
      ) : null,
    footer:
      rows.length > PAGE ? (
        <>
          <span>
            Showing {visible.length} of {rows.length}
          </span>
          {visible.length < rows.length ? (
            <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Show more
            </Button>
          ) : null}
        </>
      ) : null,
    body:
      rows.length === 0 ? (
        <EmptyState icon={<IconSend />} title="Nothing delivered yet" description="Approved and auto-routed insights land here with a receipt from the tool they went to." compact />
      ) : (
        <Table label="Delivery log" minWidth={1080}>
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 176 }} />
            <col style={{ width: 144 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 184 }} />
            <col style={{ width: 88 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <span className="ds-sr-only">Attempts</span>
              </th>
              <th>Insight</th>
              <th>Destination</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Receipt</th>
              <th className="is-num">When</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => {
              const isOpen = open.has(d.id);
              const st = STATUS[d.status];
              const retries = Math.max(0, d.attempts.length - 1);
              return (
                <Fragment key={d.id}>
                  <tr className={isOpen ? styles.logRowOpen : undefined}>
                    <td className={styles.logToggle}>
                      <IconButton
                        size="sm"
                        label={`${isOpen ? 'Hide' : 'Show'} attempts for ${d.receipt ?? d.id}`}
                        tooltip={false}
                        aria-expanded={isOpen}
                        icon={isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        onClick={() => toggle(d.id)}
                      />
                    </td>
                    <td style={{ maxWidth: 0 }}>
                      <Link to={`/app/insights/${d.insightId}`} className={styles.logLink} title={titleOf(d)}>
                        <CellText primary={titleOf(d)} secondary={accountOf(d) ?? undefined} />
                      </Link>
                    </td>
                    <td style={{ maxWidth: 0 }}>
                      <ChannelCell channel={d.channel} destination={d.destination} />
                    </td>
                    <td className="ds-truncate" style={{ maxWidth: 0 }} title={personName(d.ownerId)}>
                      {personName(d.ownerId)}
                    </td>
                    <td>
                      <CellText
                        primary={
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                        }
                        secondary={retries ? `After ${retries} ${retries === 1 ? 'retry' : 'retries'}` : undefined}
                      />
                    </td>
                    <td style={{ maxWidth: 0 }}>{d.receipt ? <CopyText value={d.receipt} label="Copy receipt" /> : <span className="ds-subtle">None</span>}</td>
                    <td className="is-num ds-muted">
                      <When value={d.createdAt} />
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className={styles.logDetailRow}>
                      <td />
                      <td colSpan={6}>
                        <ol className={styles.attempts} data-testid="delivery-timeline" aria-label={`Attempts for ${d.receipt ?? d.id}`}>
                          {d.attempts.map((a, i) => (
                            <li key={i} className={styles.attempt}>
                              <span className={a.ok ? styles.attemptOk : styles.attemptFail} aria-hidden="true">
                                {a.ok ? <IconCheckCircle size={14} /> : <IconXCircle size={14} />}
                              </span>
                              <span className={styles.attemptName}>
                                Attempt {i + 1}
                                <span className="ds-sr-only">{a.ok ? ' succeeded' : ' failed'}</span>
                              </span>
                              <span className={styles.attemptNote} title={a.note}>
                                {a.note}
                              </span>
                              <span className={styles.attemptMs}>{ms(a.ms)}</span>
                              <span className={styles.attemptAt}>
                                <When value={a.at} />
                              </span>
                            </li>
                          ))}
                          {d.attempts.length === 0 ? <li className={styles.attempt}>No attempts recorded yet.</li> : null}
                        </ol>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      ),
  };
}
