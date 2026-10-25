/**
 * Destination previews: what a routed insight looks like where its owner works. Generic
 * chat / tracker / issue / email shapes with neutral icons and names (no third-party logos).
 * Every field reads the delivery's own `payload` (the API fills account, ARR, renewal, area,
 * confidence and CSM from the insight/account join). A field with no value is left out
 * rather than printed as "—".
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Delivery, InsightType, Person } from '../../../shared/contracts';
import { tourAnchor } from '../../../tour/anchors';
import { Brandmark } from '../../../system/components/primitives/Brandmark.jsx';
import { MonoId } from '../../../uis/MonoId';
import { RelativeTime } from '../../../uis/RelativeTime';
import { IconHash, IconIssue, IconMail, IconTicket } from '../icons';
import { AREA_LABEL, TYPE_COLOR, TYPE_LABEL, money, renewalIn } from '../../lib/labels';
import styles from './previews.module.css';

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string): string | null => (typeof p[k] === 'string' && (p[k] as string).length ? (p[k] as string) : null);
const num = (p: Payload, k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
const arr = (p: Payload, k: string): string[] => (Array.isArray(p[k]) ? (p[k] as unknown[]).map(String) : []);

function typeOf(p: Payload): InsightType | null {
  const t = str(p, 'type');
  return t && t in TYPE_LABEL ? (t as InsightType) : null;
}

function areaLabel(p: Payload): string | null {
  const a = str(p, 'productArea');
  return a ? AREA_LABEL[a as keyof typeof AREA_LABEL] ?? a : null;
}

/** Definition-list rows, minus any whose value is missing. */
function Fields({ rows, className }: { rows: [string, ReactNode | null | undefined][]; className?: string }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return null;
  return (
    <dl className={className}>
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function deliveryTitle(d: Delivery): string {
  const p = d.payload as Payload;
  return str(p, 'summary') ?? str(p, 'title') ?? d.insightId;
}

function Initials({ person }: { person: Person | null }) {
  return <span className={styles.initials} aria-hidden="true">{person?.initials ?? '?'}</span>;
}

// ---------------------------------------------------------------- chat (Slack-like)

export function ChatPreview({ delivery, owner, onOpen }: { delivery: Delivery; owner: Person | null; onOpen?: () => void }) {
  const p = delivery.payload as Payload;
  const [acked, setAcked] = useState(false);
  const type = typeOf(p);
  const arrUsd = num(p, 'arrUsd');
  const renewal = str(p, 'renewalDate');
  const channel = str(p, 'channel') ?? delivery.destination;
  const conf = num(p, 'confidence');
  return (
    <article className={styles.frame} {...tourAnchor('dest.slack')} aria-label={`Chat message preview in ${channel}`}>
      <div className={styles.chrome}>
        <IconHash size={15} />
        <span className={styles.chromeTitle}>{channel.replace(/^#/, '')}</span>
        <span className={styles.chromeEnd}>
          <span>Team chat</span>
        </span>
      </div>
      <div className={styles.chatBody}>
        <span className={styles.botAvatar} aria-hidden="true">
          <Brandmark tone="dark" size={22} title="" />
        </span>
        <div className={styles.msg}>
          <div className={styles.msgHead}>
            <span className={styles.botName}>Signal Loop</span>
            <span className={styles.appTag}>App</span>
            <span className={styles.time}>
              <RelativeTime value={delivery.createdAt} />
            </span>
          </div>
          <p className={styles.msgText}>
            New <b>{type ? TYPE_LABEL[type].toLowerCase() : 'insight'}</b> from <b>{str(p, 'account') ?? 'a customer'}</b>
            {owner ? <> for <span className="sl-mono">@{owner.slackHandle.replace(/^@/, '')}</span></> : null}
          </p>
          <div className={styles.attachment} style={{ borderLeftColor: type ? TYPE_COLOR[type] : undefined }}>
            <p className={styles.attTitle}>{deliveryTitle(delivery)}</p>
            {str(p, 'quote') ? <blockquote className="sl-quote" style={{ background: 'var(--cn-white)' }}>{str(p, 'quote')}</blockquote> : null}
            <Fields
              className={styles.fields}
              rows={[
                ['Account', str(p, 'account')],
                [arrUsd != null && renewal ? 'ARR · renewal' : arrUsd != null ? 'ARR' : 'Renewal', arrUsd != null || renewal ? [arrUsd != null ? money(arrUsd, { compact: true }) : null, renewal ? renewalIn(renewal) : null].filter(Boolean).join(' · ') : null],
                ['Area', areaLabel(p)],
                ['Confidence', conf != null ? `${conf.toFixed(2)}${str(p, 'csm') ? ` · from ${str(p, 'csm')}` : ''}` : null],
              ]}
            />
            <div className={styles.btnRow}>
              <Link to={`/app/insights/${delivery.insightId}`} className={`${styles.chatBtn} ${styles.chatBtnPrimary}`} onClick={onOpen}>
                Open in Signal Loop
              </Link>
              <button type="button" className={styles.chatBtn} onClick={() => setAcked(true)} aria-pressed={acked}>
                {acked ? '✓ Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          </div>
          <div className={styles.reactions}>
            {acked ? <span>✓ You acknowledged · the CSM sees it in their loop</span> : <span>Receipt <MonoId value={delivery.receipt ?? delivery.id} /></span>}
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- state control

export type TicketState = NonNullable<Delivery['ticketState']>;
const STATES: { value: TicketState; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
];

export function TicketStateControl({
  value,
  busy,
  onChange,
  anchor = false,
  hint,
}: {
  value: TicketState | null;
  busy: boolean;
  onChange: (s: TicketState) => void;
  anchor?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className={styles.states}>
      <div className={styles.sectionLabel} id="ticket-state-label">Status</div>
      <div className={styles.stateTrack} role="group" aria-labelledby="ticket-state-label" {...(anchor ? tourAnchor('ticket.state') : {})}>
        {STATES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={styles.stateBtn}
            data-state={s.value}
            aria-pressed={value === s.value}
            disabled={busy}
            onClick={() => value !== s.value && onChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className={styles.stateHint}>{busy ? 'Saving…' : hint ?? 'Moving to Shipped notifies the CSM who raised it.'}</span>
    </div>
  );
}

// ---------------------------------------------------------------- tracker (Jira-like)

export function TicketPreview({
  delivery,
  owner,
  busy,
  onState,
}: {
  delivery: Delivery;
  owner: Person | null;
  busy: boolean;
  onState: (s: TicketState) => void;
}) {
  const p = delivery.payload as Payload;
  const key = str(p, 'key') ?? delivery.receipt ?? delivery.id;
  const project = str(p, 'project') ?? delivery.destination;
  const labels = arr(p, 'labels');
  const priority = str(p, 'priority');
  const arrUsd = num(p, 'arrUsd');
  return (
    <article className={`${styles.frame} ${styles.ticketWrap}`} {...tourAnchor('dest.jira')} aria-label={`Tracker ticket preview ${key}`}>
      <div className={styles.chrome}>
        <IconTicket size={15} />
        <span className={styles.chromeTitle}>Issue tracker</span>
        <span className={styles.chromeEnd}>
          <MonoId value={key} keep={12} />
        </span>
      </div>
      <div className={styles.ticket}>
        <div className={styles.ticketMain}>
          <div className={styles.crumbs}>
            <span>Projects</span>
            <span aria-hidden="true">/</span>
            <span>{project}</span>
            <span aria-hidden="true">/</span>
            <span className="sl-mono">{key}</span>
          </div>
          <h3 className={styles.ticketTitle}>{deliveryTitle(delivery)}</h3>
          <div style={{ maxWidth: 380 }}>
            <TicketStateControl value={delivery.ticketState} busy={busy} onChange={onState} anchor />
          </div>
          <div>
            <div className={styles.sectionLabel}>Description</div>
            <p className={styles.desc}>{str(p, 'description') ?? deliveryTitle(delivery)}</p>
          </div>
          {str(p, 'quote') ? (
            <div>
              <div className={styles.sectionLabel}>Evidence (verbatim, grounded)</div>
              <blockquote className="sl-quote">{str(p, 'quote')}</blockquote>
              <p className="sl-caption" style={{ margin: '6px 0 0' }}>
                {str(p, 'account') ?? 'Customer'}
                {str(p, 'csm') ? ` · reported by ${str(p, 'csm')}` : ''} · <Link to={`/app/insights/${delivery.insightId}`}>provenance in Signal Loop →</Link>
              </p>
            </div>
          ) : null}
          {labels.length ? (
            <div>
              <div className={styles.sectionLabel}>Labels</div>
              <div className={styles.labels}>
                {labels.map((l) => (
                  <span key={l} className={styles.label}>{l}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <aside className={styles.ticketSide}>
          <div className={styles.sideField}>
            <div className={styles.sectionLabel}>Assignee</div>
            <span className={styles.person}>
              <Initials person={owner} />
              {owner?.name ?? 'Unassigned'}
            </span>
          </div>
          <div className={styles.sideField}>
            <div className={styles.sectionLabel}>Reporter</div>
            <span className={styles.person}>
              <span className={styles.initials} style={{ background: 'var(--cn-green-mid)' }} aria-hidden="true">
                <Brandmark tone="dark" size={16} title="" />
              </span>
              Signal Loop
            </span>
          </div>
          {priority ? (
            <div className={styles.sideField}>
              <div className={styles.sectionLabel}>Priority</div>
              <span>{priority}</span>
            </div>
          ) : null}
          {str(p, 'account') ? (
            <div className={styles.sideField}>
              <div className={styles.sectionLabel}>Customer</div>
              <span>{str(p, 'account')}</span>
            </div>
          ) : null}
          {arrUsd != null ? (
            <div className={styles.sideField}>
              <div className={styles.sectionLabel}>Customer ARR</div>
              <span className="sl-num">{money(arrUsd)}</span>
            </div>
          ) : null}
          <div className={styles.sideField}>
            <div className={styles.sectionLabel}>Created</div>
            <RelativeTime value={delivery.createdAt} showAbsoluteInline={false} />
          </div>
        </aside>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- issue (Linear-like)

function PrioBars({ priority }: { priority: string }) {
  const level = { Highest: 4, High: 3, Medium: 2, Low: 1 }[priority] ?? 0;
  return (
    <span className={styles.prioBars} aria-label={`Priority ${priority}`}>
      {[4, 7, 10].map((h, i) => (
        <i key={h} className={i < Math.min(level, 3) ? styles.on : ''} style={{ height: h }} />
      ))}
    </span>
  );
}

export function IssuePreview({ delivery, owner, busy, onState }: { delivery: Delivery; owner: Person | null; busy: boolean; onState: (s: TicketState) => void }) {
  const p = delivery.payload as Payload;
  const key = str(p, 'key') ?? delivery.receipt ?? delivery.id;
  const priority = str(p, 'priority') ?? 'Medium';
  const labels = arr(p, 'labels');
  const stateLabel = delivery.ticketState === 'shipped' ? 'Done' : delivery.ticketState === 'in_progress' ? 'In progress' : 'Todo';
  return (
    <article className={styles.frame} aria-label={`Issue preview ${key}`}>
      <div className={styles.chrome}>
        <IconIssue size={15} />
        <span className={styles.chromeTitle}>{str(p, 'project') ?? delivery.destination}</span>
        <span className={styles.chromeEnd}>
          <MonoId value={key} keep={12} />
        </span>
      </div>
      <div className={styles.issue}>
        <h3 className={styles.ticketTitle} style={{ fontSize: 'var(--fs-title-lg)' }}>{deliveryTitle(delivery)}</h3>
        <div className={styles.issueMeta}>
          <span className={styles.pill}>
            <IconIssue size={12} /> {stateLabel}
          </span>
          <span className={styles.pill}>
            <PrioBars priority={priority} /> {priority}
          </span>
          <span className={styles.pill}>
            <span className={styles.initials} style={{ width: 16, height: 16, fontSize: 8 }} aria-hidden="true">{owner?.initials ?? '?'}</span>
            {owner?.name ?? 'Unassigned'}
          </span>
          {labels.slice(0, 3).map((l) => (
            <span key={l} className={styles.pill}>{l}</span>
          ))}
        </div>
        {str(p, 'quote') ? <blockquote className="sl-quote">{str(p, 'quote')}</blockquote> : null}
        <p className={styles.desc} style={{ color: 'var(--text-muted)' }}>{str(p, 'description') ?? ''}</p>
        <div style={{ maxWidth: 360 }}>
          <TicketStateControl value={delivery.ticketState} busy={busy} onChange={onState} />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- weekly PM digest (email)

export function DigestPreview({ deliveries, recipient, week, note }: { deliveries: Delivery[]; recipient: string; week: string; note?: ReactNode }) {
  const byType = new Map<string, number>();
  for (const d of deliveries) {
    const t = typeOf(d.payload as Payload);
    if (t) byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const accounts = new Set(deliveries.map((d) => str(d.payload as Payload, 'account')).filter(Boolean));
  const arrSum = [...new Map(deliveries.map((d) => [str(d.payload as Payload, 'account'), num(d.payload as Payload, 'arrUsd') ?? 0])).values()].reduce((a, b) => a + b, 0);
  return (
    <article className={styles.frame} aria-label="Weekly PM email digest preview">
      <div className={styles.chrome}>
        <IconMail size={15} />
        <span className={styles.chromeTitle}>Email</span>
        <span className={styles.chromeEnd}>{week}</span>
      </div>
      <dl className={styles.mailHead}>
        <dt>From</dt>
        <dd>Signal Loop &lt;digest@signal-loop.example&gt;</dd>
        <dt>To</dt>
        <dd>{recipient}</dd>
        <dt>Subject</dt>
        <dd>
          <b>Your customer signal digest · {week}</b>
        </dd>
      </dl>
      <div className={styles.mailBody}>
        {note ? <p className="sl-caption" style={{ margin: 0 }}>{note}</p> : null}
        <h3 className={styles.mailH}>{deliveries.length} customer signals routed this week</h3>
        <div className={styles.mailStats}>
          <div className={styles.mailStat}>
            <b>{deliveries.length}</b>
            <span>insights, every one with a quote</span>
          </div>
          <div className={styles.mailStat}>
            <b>{accounts.size}</b>
            <span>accounts</span>
          </div>
          <div className={styles.mailStat}>
            <b>{money(arrSum, { compact: true })}</b>
            <span>ARR behind them</span>
          </div>
        </div>
        {byType.size ? (
          <p className="sl-p">
            {[...byType.entries()].map(([t, n]) => `${n} ${TYPE_LABEL[t as InsightType].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}
          </p>
        ) : null}
        <ul className={styles.mailList}>
          {deliveries.slice(0, 6).map((d) => {
            const p = d.payload as Payload;
            const t = typeOf(p);
            return (
              <li key={d.id} className={styles.mailItem}>
                <span className="sl-row" style={{ gap: 6 }}>
                  {t ? <span className="sl-type"><i style={{ background: TYPE_COLOR[t] }} aria-hidden="true" />{TYPE_LABEL[t]}</span> : null}
                  {str(p, 'account') ? <span className="sl-caption">· {str(p, 'account')}</span> : null}
                </span>
                <span className="sl-strong">{deliveryTitle(d)}</span>
                {str(p, 'quote') ? <span className="sl-meta">“{str(p, 'quote')}”</span> : null}
                <Link to={`/app/insights/${d.insightId}`} className="sl-caption">See evidence and provenance →</Link>
              </li>
            );
          })}
        </ul>
        <p className={styles.mailFoot}>
          You get this because routing rules send these signals to you. Reply “wrong” on any item and it becomes labelled data for the next prompt version.
        </p>
      </div>
    </article>
  );
}
