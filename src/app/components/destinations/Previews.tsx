/**
 * Delivery previews: what a routed insight looks like in the tool its owner works in. Simplified,
 * neutral renderings (our typography, the tool's colour only in its mark), never screenshots or
 * logos. Every field reads the delivery itself: its payload (src/pipeline/deliver.ts writes the
 * per-channel shape plus flat preview fields), its mentions (the owner, the account's CSM and any
 * watchers, by their handle in that tool) and the connected account it went through. Older
 * deliveries lack some fields; anything missing is left out rather than printed as a dash.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Delivery, InsightType, Person } from '../../../shared/contracts';
import { CHANNEL_CONNECTOR, connectorById, personHandle, type ConnectorId } from '../../../shared/platform';
import { tourAnchor } from '../../../tour/anchors';
import { Avatar, Badge, ConnectorMark, ProductMark, Quote, Segmented } from '../../../ds';
import { IconArrowDown, IconArrowUp, IconCheck, IconMinus } from '../../../ds/icons';
import { When } from '../domain';
import { AREA_LABEL, SEVERITY_LABEL, TYPE_LABEL, dateShort, money } from '../../lib/labels';
import styles from './previews.module.css';

// ---------------------------------------------------------------- payload readers

export type Payload = Record<string, unknown>;
export const str = (p: Payload | null | undefined, k: string): string | null => (p && typeof p[k] === 'string' && (p[k] as string).trim() ? (p[k] as string) : null);
export const num = (p: Payload | null | undefined, k: string): number | null => (p && typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : null);
const arr = (p: Payload | null | undefined, k: string): string[] => (p && Array.isArray(p[k]) ? (p[k] as unknown[]).filter((x) => typeof x === 'string' && x).map(String) : []);
const obj = (p: Payload | null | undefined, k: string): Payload | null => (p && p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? (p[k] as Payload) : null);

export function deliveryTitle(d: Delivery): string {
  const p = d.payload as Payload;
  return str(p, 'summary') ?? str(p, 'title') ?? str(p, 'item') ?? d.insightId;
}

export function typeOf(p: Payload): InsightType | null {
  const t = str(p, 'type');
  return t && t in TYPE_LABEL ? (t as InsightType) : null;
}

function areaOf(p: Payload): string | null {
  const a = str(p, 'productArea');
  return a ? (AREA_LABEL[a as keyof typeof AREA_LABEL] ?? a) : null;
}

/** The first paragraph of a markdown-ish description (the rationale), without the quote and account lines. */
function rationale(text: string | null): string | null {
  if (!text) return null;
  const first = text.split(/\n\s*\n/)[0]?.trim();
  return first && !first.startsWith('>') ? first : null;
}

function quoteOf(d: Delivery): string | null {
  const p = d.payload as Payload;
  return str(p, 'quote') ?? str(obj(p, 'activity'), 'quote');
}

// ---------------------------------------------------------------- people on a delivery

export type Tagged = { personId: string; person: Person | null; name: string; handle: string; role: 'owner' | 'csm' | 'watcher' };

export type PeopleLookup = {
  person: (id: string | null | undefined) => Person | null;
  csmFor: (accountId: string | null | undefined) => Person | null;
  byName: (name: string | null | undefined) => Person | null;
};

export const ROLE_LABEL: Record<Tagged['role'], string> = { owner: 'Owner', csm: 'CSM', watcher: 'Watching' };
export const ROLE_TEXT: Record<Tagged['role'], string> = { owner: 'owner', csm: 'CSM', watcher: 'watching' };

/**
 * Who a delivery tags. Newer deliveries carry `mentions`; for older ones, rebuild the same
 * list the pipeline would (the owner, then the account's CSM) with each person's handle.
 */
export function taggedPeople(d: Delivery, lookup: PeopleLookup): Tagged[] {
  const connector = (CHANNEL_CONNECTOR[d.channel] ?? null) as ConnectorId | null;
  if (d.mentions?.length) {
    return d.mentions.map((m) => {
      const person = lookup.person(m.personId);
      return { personId: m.personId, person, name: person?.name ?? m.handle.replace(/^@/, ''), handle: m.handle, role: m.role };
    });
  }
  const out: Tagged[] = [];
  const add = (p: Person | null, role: Tagged['role']) => {
    if (!p || p.active === false || out.some((x) => x.personId === p.id)) return;
    out.push({ personId: p.id, person: p, name: p.name, handle: personHandle(p, connector), role });
  };
  add(lookup.person(d.ownerId), 'owner');
  const p = d.payload as Payload;
  add(lookup.csmFor(str(p, 'accountId')) ?? lookup.byName(str(p, 'csm')), 'csm');
  return out;
}

/** The connected account a delivery went through; older rows fall back to the connector's account. */
export function accountFor(d: Delivery): string | null {
  if (d.connectorAccount) return d.connectorAccount;
  const id = CHANNEL_CONNECTOR[d.channel];
  return id ? (connectorById(id)?.defaultAccount ?? null) : null;
}

/** "October 22, 2026": how a dated heading reads in a document. */
function longDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: dateOnly ? 'UTC' : undefined });
}

const at = (h: string) => `@${h.replace(/^@/, '')}`;
/** A person's handle under their name, when the tool's handle is not just their name. */
const handleSub = (t: Tagged): string | undefined => (t.handle.replace(/^@/, '') !== t.name ? at(t.handle) : undefined);

function Mention({ handle, plain }: { handle: string; plain?: boolean }) {
  return <span className={styles.mention}>{plain ? handle.replace(/^@/, '') : at(handle)}</span>;
}

// ---------------------------------------------------------------- frame

function ToolFrame({
  connector,
  name,
  account,
  title,
  end,
  children,
  attrs,
  label,
}: {
  connector: string;
  name: string;
  account: string | null;
  title?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
  attrs?: Record<string, string>;
  label: string;
}) {
  return (
    <article className={styles.frame} aria-label={label} {...attrs}>
      <header className={styles.chrome}>
        <ConnectorMark id={connector} size={18} />
        <span className={styles.chromeName}>{name}</span>
        {title ? <span className={styles.chromeTitle}>{title}</span> : null}
        <span className={styles.chromeEnd}>{end ?? (account ? <span className={styles.via}>via {account}</span> : null)}</span>
      </header>
      {children}
    </article>
  );
}

type FieldLayout = 'row' | 'stack' | 'side' | 'mail' | 'task';
const FIELD_CLASS: Record<FieldLayout, string | undefined> = { row: styles.field, stack: styles.fieldStack, side: styles.fieldSide, mail: styles.fieldMail, task: styles.fieldTask };

/** One label/value pair in a <dl>. Missing values render nothing. */
function Field({ label, children, layout = 'row' }: { label: string; children: ReactNode; layout?: FieldLayout }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className={FIELD_CLASS[layout]}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{children}</dd>
    </div>
  );
}

function PersonLine({ name, sub, initials }: { name: string; sub?: ReactNode; initials?: string }) {
  return (
    <span className={styles.personLine}>
      <Avatar name={name} initials={initials} size="sm" />
      <span className={styles.personText}>
        <span className={styles.personName}>{name}</span>
        {sub ? <span className={styles.personSub}>{sub}</span> : null}
      </span>
    </span>
  );
}

function priorityIcon(label: string) {
  if (/highest|urgent|high/i.test(label)) return <IconArrowUp size={14} />;
  if (/low/i.test(label)) return <IconArrowDown size={14} />;
  return <IconMinus size={14} />;
}

function priorityLabel(p: Payload): string | null {
  const s = str(p, 'priority');
  if (s) return s;
  const n = num(p, 'priority');
  return n != null ? (({ 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' } as Record<number, string>)[n] ?? null) : null;
}

function accountLine(p: Payload): string | null {
  const name = str(p, 'account');
  if (!name) return null;
  const tier = str(p, 'tier');
  const arrUsd = num(p, 'arrUsd');
  return [name, tier, arrUsd != null ? `${money(arrUsd, { compact: true })} ARR` : null].filter(Boolean).join(', ');
}

function EvidenceQuote({ d, csm }: { d: Delivery; csm?: string | null }) {
  const q = quoteOf(d);
  if (!q) return null;
  const p = d.payload as Payload;
  return (
    <Quote
      cite={
        <span className={styles.cite}>
          <span>{[str(p, 'account'), csm ? `raised by ${csm}` : null].filter(Boolean).join(', ') || 'Customer'}</span>
          <Link to={`/app/insights/${d.insightId}`}>View in Signal Loop</Link>
        </span>
      }
    >
      {q}
    </Quote>
  );
}

// ---------------------------------------------------------------- ticket status (the PM's move)

export type TicketState = NonNullable<Delivery['ticketState']>;
const STATES: { value: TicketState; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
];

export function TicketStateControl({ value, busy, onChange }: { value: TicketState | null; busy: boolean; onChange: (s: TicketState) => void }) {
  return (
    <div className={styles.state} {...tourAnchor('ticket.state')}>
      <div className={styles.stateRow}>
        <span className={styles.stateLabel}>Status</span>
        <Segmented<TicketState>
          label="Ticket status"
          value={(value ?? '') as TicketState}
          onChange={(v) => {
            if (v !== value) onChange(v);
          }}
          options={STATES}
        />
      </div>
      <span className={styles.stateHint} role="status">
        {busy ? 'Saving…' : 'Moving to Shipped tells the CSM who raised it.'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Jira

export function JiraPreview({ delivery: d, tagged, busy, onState }: { delivery: Delivery; tagged: Tagged[]; busy: boolean; onState: (s: TicketState) => void }) {
  const p = d.payload as Payload;
  const key = str(p, 'key') ?? d.receipt ?? d.id;
  const project = str(p, 'project') ?? d.destination;
  const owner = tagged.find((t) => t.role === 'owner');
  const watchers = tagged.filter((t) => t.role !== 'owner');
  const csm = tagged.find((t) => t.role === 'csm')?.name ?? str(p, 'csm');
  const priority = priorityLabel(p);
  const labels = arr(p, 'labels');
  const component = arr(p, 'components')[0] ?? areaOf(p);
  const arrUsd = num(p, 'arrUsd');
  const renewal = str(p, 'renewalDate');
  return (
    <ToolFrame connector="jira" name="Jira" account={accountFor(d)} attrs={tourAnchor('dest.jira')} label={`Jira issue ${key}`}>
      <div className={styles.issue}>
        <div className={styles.issueMain}>
          <div className={styles.crumbs}>
            <span>Projects</span>
            <span aria-hidden="true">/</span>
            <span>{project}</span>
            <span aria-hidden="true">/</span>
            <span className={styles.key}>{key}</span>
            {str(p, 'issueType') ? <Badge outline>{str(p, 'issueType')}</Badge> : null}
          </div>
          <h3 className={styles.issueTitle}>{deliveryTitle(d)}</h3>
          <TicketStateControl value={d.ticketState} busy={busy} onChange={onState} />
          {rationale(str(p, 'description')) ? (
            <section className={styles.block}>
              <h4 className={styles.blockLabel}>Description</h4>
              <p className={styles.text}>{rationale(str(p, 'description'))}</p>
            </section>
          ) : null}
          {quoteOf(d) ? (
            <section className={styles.block}>
              <h4 className={styles.blockLabel}>Customer quote</h4>
              <EvidenceQuote d={d} csm={csm} />
            </section>
          ) : null}
          {labels.length ? (
            <section className={styles.block}>
              <h4 className={styles.blockLabel}>Labels</h4>
              <div className={styles.tags}>
                {labels.map((l) => (
                  <Badge key={l} outline>
                    {l}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className={styles.issueSide} aria-label="Details">
          <h4 className={styles.blockLabel}>Details</h4>
          <dl className={styles.fields}>
            <Field layout="side" label="Assignee">
              {owner ? <PersonLine name={owner.name} initials={owner.person?.initials} sub={handleSub(owner)} /> : 'Unassigned'}
            </Field>
            <Field layout="side" label="Reporter">
              <span className={styles.personLine}>
                <ProductMark product="signal-loop" size={20} />
                <span className={styles.personName}>Signal Loop</span>
              </span>
            </Field>
            <Field layout="side" label="Watchers">
              {watchers.length ? (
                <span className={styles.stack}>
                  {watchers.map((w) => (
                    <PersonLine key={w.personId} name={w.name} initials={w.person?.initials} sub={ROLE_LABEL[w.role]} />
                  ))}
                </span>
              ) : null}
            </Field>
            <Field layout="side" label="Priority">
              {priority ? (
                <span className={styles.inline}>
                  {priorityIcon(priority)}
                  {priority}
                </span>
              ) : null}
            </Field>
            <Field layout="side" label="Component">
              {component}
            </Field>
            <Field layout="side" label="Customer">
              {str(p, 'account')}
            </Field>
            <Field layout="side" label="Customer ARR">
              {arrUsd != null ? money(arrUsd) : null}
            </Field>
            <Field layout="side" label="Renewal">
              {renewal ? dateShort(renewal) : null}
            </Field>
          </dl>
        </aside>
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- Linear

export function LinearPreview({ delivery: d, tagged, busy, onState }: { delivery: Delivery; tagged: Tagged[]; busy: boolean; onState: (s: TicketState) => void }) {
  const p = d.payload as Payload;
  const key = str(p, 'key') ?? d.receipt ?? d.id;
  const team = str(p, 'team') ?? str(p, 'project') ?? d.destination;
  const owner = tagged.find((t) => t.role === 'owner');
  const subscribers = tagged.filter((t) => t.role !== 'owner');
  const csm = tagged.find((t) => t.role === 'csm')?.name ?? str(p, 'csm');
  const priority = priorityLabel(p);
  const labels = arr(p, 'labels');
  const status = d.ticketState === 'shipped' ? 'Done' : d.ticketState === 'in_progress' ? 'In Progress' : 'Todo';
  return (
    <ToolFrame connector="linear" name="Linear" account={accountFor(d)} attrs={tourAnchor('dest.jira')} label={`Linear issue ${key}`}>
      <div className={styles.linear}>
        <div className={styles.crumbs}>
          <span>{team}</span>
          <span aria-hidden="true">/</span>
          <span className={styles.key}>{key}</span>
        </div>
        <h3 className={styles.issueTitle}>{deliveryTitle(d)}</h3>
        <div className={styles.props}>
          <span className={styles.prop}>
            <span className={styles.statusDot} data-state={d.ticketState ?? 'open'} aria-hidden="true" />
            {status}
          </span>
          {priority ? (
            <span className={styles.prop}>
              {priorityIcon(priority)}
              {priority}
            </span>
          ) : null}
          <span className={styles.prop}>
            <Avatar name={owner?.name ?? 'Unassigned'} initials={owner?.person?.initials} size="sm" />
            {owner?.name ?? 'Unassigned'}
          </span>
          {labels.slice(0, 3).map((l) => (
            <span key={l} className={styles.prop}>
              {l}
            </span>
          ))}
        </div>
        {rationale(str(p, 'description')) ? <p className={styles.text}>{rationale(str(p, 'description'))}</p> : null}
        <EvidenceQuote d={d} csm={csm} />
        <TicketStateControl value={d.ticketState} busy={busy} onChange={onState} />
        {subscribers.length || accountLine(p) ? (
          <dl className={styles.fieldsInline}>
            <Field label="Customer">{accountLine(p)}</Field>
            <Field label="Subscribers">
              {subscribers.length ? (
                <span className={styles.inlineList}>
                  {subscribers.map((s) => (
                    <PersonLine key={s.personId} name={s.name} initials={s.person?.initials} sub={ROLE_LABEL[s.role]} />
                  ))}
                </span>
              ) : null}
            </Field>
          </dl>
        ) : null}
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- Slack / Teams

export function ChatPreview({ delivery: d, tagged, onOpen }: { delivery: Delivery; tagged: Tagged[]; onOpen?: () => void }) {
  const p = d.payload as Payload;
  const teams = d.channel === 'teams';
  const [acked, setAcked] = useState(false);
  const type = typeOf(p);
  const channel = (str(p, 'channel') ?? d.destination).replace(/^#/, '');
  const arrUsd = num(p, 'arrUsd');
  const renewal = str(p, 'renewalDate');
  const severity = str(p, 'severity');
  const csm = tagged.find((t) => t.role === 'csm')?.name ?? str(p, 'csm');
  return (
    <ToolFrame
      connector={teams ? 'teams' : 'slack'}
      name={teams ? 'Teams' : 'Slack'}
      account={accountFor(d)}
      title={teams ? channel : `# ${channel}`}
      attrs={tourAnchor('dest.slack')}
      label={`${teams ? 'Teams post' : 'Slack message'} in ${channel}`}
    >
      <div className={styles.chat}>
        <span className={styles.botAvatar}>
          <ProductMark product="signal-loop" size={36} />
        </span>
        <div className={styles.message}>
          <div className={styles.messageHead}>
            <span className={styles.botName}>Signal Loop</span>
            <Badge>App</Badge>
            <span className={styles.time}>
              <When value={d.createdAt} />
            </span>
          </div>
          <p className={styles.messageText}>
            New {type ? TYPE_LABEL[type].toLowerCase() : 'customer signal'} from <strong>{str(p, 'account') ?? 'a customer'}</strong>.{' '}
            {tagged.map((t) => (
              <Mention key={t.personId} handle={teams ? t.name : t.handle} plain={teams} />
            ))}
          </p>
          <div className={teams ? `${styles.attachment} ${styles.attachmentTeams}` : styles.attachment}>
            <p className={styles.attachmentTitle}>{deliveryTitle(d)}</p>
            {quoteOf(d) ? <Quote>{quoteOf(d)}</Quote> : null}
            <dl className={styles.grid}>
              <Field layout="stack" label="Account">
                {str(p, 'account')}
              </Field>
              <Field layout="stack" label="ARR">
                {arrUsd != null ? money(arrUsd, { compact: true }) : null}
              </Field>
              <Field layout="stack" label="Renewal">
                {renewal ? dateShort(renewal) : null}
              </Field>
              <Field layout="stack" label="Severity">
                {severity ? (SEVERITY_LABEL[severity as keyof typeof SEVERITY_LABEL] ?? severity) : null}
              </Field>
              <Field layout="stack" label="Product area">
                {areaOf(p)}
              </Field>
              <Field layout="stack" label="CSM">
                {csm}
              </Field>
            </dl>
            <div className={styles.actions}>
              <Link to={`/app/insights/${d.insightId}`} className={styles.chatButton} onClick={onOpen}>
                Open in Signal Loop
              </Link>
              <button type="button" className={styles.chatButton} aria-pressed={acked} onClick={() => setAcked(true)}>
                {acked ? (
                  <>
                    <IconCheck size={14} /> Acknowledged
                  </>
                ) : (
                  'Acknowledge'
                )}
              </button>
            </div>
          </div>
          {acked ? <p className={styles.context}>You acknowledged this. The CSM sees it in Close the loop.</p> : null}
        </div>
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- Salesforce

export function SalesforcePreview({ delivery: d, tagged }: { delivery: Delivery; tagged: Tagged[] }) {
  const p = d.payload as Payload;
  const activity = obj(p, 'activity');
  const task = obj(p, 'task');
  const owner = tagged.find((t) => t.role === 'owner');
  const csm = tagged.find((t) => t.role === 'csm');
  const arrUsd = num(p, 'arrUsd');
  const renewal = str(p, 'renewalDate');
  const subject = str(activity, 'subject') ?? str(p, 'title') ?? deliveryTitle(d);
  const taskOwner = owner?.name ?? str(task, 'owner') ?? 'Account owner';
  const taskHandle = str(task, 'ownerHandle') ?? owner?.handle ?? null;
  return (
    <ToolFrame connector="salesforce" name="Salesforce" account={accountFor(d)} title="Account" label={`Salesforce account activity for ${str(p, 'account') ?? 'the account'}`}>
      <div className={styles.sf}>
        <div className={styles.sfRecord}>
          <span className={styles.recordType}>Account</span>
          <h3 className={styles.recordName}>{str(p, 'account') ?? d.destination}</h3>
          <dl className={styles.recordFields}>
            <Field layout="stack" label="Tier">
              {str(p, 'tier')}
            </Field>
            <Field layout="stack" label="ARR">
              {arrUsd != null ? money(arrUsd) : null}
            </Field>
            <Field layout="stack" label="Renewal">
              {renewal ? dateShort(renewal) : null}
            </Field>
            <Field layout="stack" label="CSM">
              {csm?.name ?? str(p, 'csm')}
            </Field>
          </dl>
        </div>
        <div className={styles.sfCols}>
          <section className={styles.sfPanel}>
            <h4 className={styles.blockLabel}>Activity</h4>
            <div className={styles.activity}>
              <div className={styles.activityHead}>
                <span className={styles.activityTitle}>{subject}</span>
                <span className={styles.time}>{str(activity, 'date') ? dateShort(str(activity, 'date')) : <When value={d.createdAt} />}</span>
              </div>
              <span className={styles.activityType}>{str(activity, 'type') ?? 'Customer signal'}, logged by Signal Loop</span>
              {rationale(str(activity, 'description') ?? str(p, 'description')) ? <p className={styles.text}>{rationale(str(activity, 'description') ?? str(p, 'description'))}</p> : null}
              <EvidenceQuote d={d} csm={csm?.name ?? str(p, 'csm')} />
            </div>
          </section>
          <section className={styles.sfPanel}>
            <h4 className={styles.blockLabel}>Open task</h4>
            <div className={styles.task}>
              <span className={styles.taskTitle}>{str(task, 'subject') ?? `Follow up: ${deliveryTitle(d)}`}</span>
              <dl className={styles.fields}>
                <Field layout="task" label="Assigned to">
                  <PersonLine name={taskOwner} initials={owner?.person?.initials} sub={taskHandle ? at(taskHandle) : undefined} />
                </Field>
                <Field layout="task" label="Status">
                  {str(task, 'status') ?? 'Not started'}
                </Field>
                <Field layout="task" label="Priority">
                  {str(task, 'priority')}
                </Field>
                <Field layout="task" label="Due">
                  {str(task, 'dueDate') ? dateShort(str(task, 'dueDate')) : null}
                </Field>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- email (direct)

export function EmailPreview({ delivery: d, tagged }: { delivery: Delivery; tagged: Tagged[] }) {
  const p = d.payload as Payload;
  const owner = tagged.find((t) => t.role === 'owner');
  const others = tagged.filter((t) => t.role !== 'owner');
  const to = str(p, 'to') ?? owner?.handle ?? null;
  const ccList = arr(p, 'cc').length ? arr(p, 'cc') : others.map((o) => o.handle);
  const from = str(p, 'from') ?? accountFor(d) ?? 'signals@invoca.example';
  const body = rationale(str(p, 'body')) ?? rationale(str(p, 'description'));
  return (
    <ToolFrame connector="gmail" name="Gmail" account={from} label={`Email to ${to ?? 'the owner'}`}>
      <div className={styles.mail}>
        <h3 className={styles.mailSubject}>{str(p, 'subject') ?? deliveryTitle(d)}</h3>
        <dl className={styles.mailHead}>
          <Field layout="mail" label="From">
            Signal Loop &lt;{from}&gt;
          </Field>
          <Field layout="mail" label="To">
            {to}
          </Field>
          <Field layout="mail" label="Cc">
            {ccList.length ? ccList.join(', ') : null}
          </Field>
          <Field layout="mail" label="Sent">
            <When value={d.createdAt} />
          </Field>
        </dl>
        <div className={styles.mailBody}>
          {owner ? <p className={styles.text}>Hi {owner.name.split(' ')[0]},</p> : null}
          {body ? <p className={styles.text}>{body}</p> : null}
          {quoteOf(d) ? <Quote cite={str(p, 'account') ?? undefined}>{quoteOf(d)}</Quote> : null}
          {accountLine(p) ? <p className={styles.textMuted}>{accountLine(p)}</p> : null}
          <div>
            <Link to={`/app/insights/${d.insightId}`} className={styles.mailButton}>
              See the evidence
            </Link>
          </div>
        </div>
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- weekly digest (email)

export function DigestPreview({
  deliveries,
  recipient,
  recipientEmail,
  weekOf,
  account,
}: {
  deliveries: Delivery[];
  recipient: string;
  recipientEmail: string | null;
  weekOf: string;
  account: string | null;
}) {
  const accounts = new Map<string, number>();
  for (const d of deliveries) {
    const p = d.payload as Payload;
    const a = str(p, 'account');
    if (a) accounts.set(a, num(p, 'arrUsd') ?? 0);
  }
  const arrSum = [...accounts.values()].reduce((a, b) => a + b, 0);
  const groups = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    const t = typeOf(d.payload as Payload) ?? 'other';
    groups.set(t, [...(groups.get(t) ?? []), d]);
  }
  const from = account ?? 'signals@invoca.example';
  return (
    <ToolFrame connector="gmail" name="Gmail" account={from} label={`Weekly digest for ${recipient}`}>
      <div className={styles.mail}>
        <h3 className={styles.mailSubject}>Your customer signals, week of {weekOf}</h3>
        <dl className={styles.mailHead}>
          <Field layout="mail" label="From">
            Signal Loop &lt;{from}&gt;
          </Field>
          <Field layout="mail" label="To">
            {recipientEmail ? `${recipient} <${recipientEmail}>` : recipient}
          </Field>
        </dl>
        <div className={styles.mailBody}>
          <div className={styles.digestStats}>
            <div className={styles.digestStat}>
              <span className={styles.digestValue}>{deliveries.length}</span>
              <span className={styles.digestLabel}>{deliveries.length === 1 ? 'signal, with its quote' : 'signals, each with a quote'}</span>
            </div>
            <div className={styles.digestStat}>
              <span className={styles.digestValue}>{accounts.size}</span>
              <span className={styles.digestLabel}>{accounts.size === 1 ? 'account' : 'accounts'}</span>
            </div>
            <div className={styles.digestStat}>
              <span className={styles.digestValue}>{money(arrSum, { compact: true })}</span>
              <span className={styles.digestLabel}>ARR behind them</span>
            </div>
          </div>
          {[...groups.entries()].map(([t, list]) => (
            <section key={t} className={styles.digestGroup}>
              <h4 className={styles.digestHeading}>
                {t in TYPE_LABEL ? TYPE_LABEL[t as InsightType] : 'Other'}
                <span className={styles.digestCount}>{list.length}</span>
              </h4>
              <ul className={styles.digestList}>
                {list.slice(0, 4).map((d) => {
                  const p = d.payload as Payload;
                  return (
                    <li key={d.id} className={styles.digestItem}>
                      <span className={styles.digestTitle}>{deliveryTitle(d)}</span>
                      {quoteOf(d) ? <Quote cite={str(p, 'account') ?? undefined}>{quoteOf(d)}</Quote> : str(p, 'account') ? <span className={styles.textMuted}>{str(p, 'account')}</span> : null}
                      <Link to={`/app/insights/${d.insightId}`} className={styles.digestLink}>
                        See the evidence
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {list.length > 4 ? <p className={styles.textMuted}>And {list.length - 4} more in Signal Loop.</p> : null}
            </section>
          ))}
          <p className={styles.mailFoot}>You get this because routing rules send these signals to you. Reply “wrong” on any item and it becomes labelled data for the next prompt version.</p>
        </div>
      </div>
    </ToolFrame>
  );
}

// ---------------------------------------------------------------- Google Drive

export function DocPreview({ delivery: d, tagged }: { delivery: Delivery; tagged: Tagged[] }) {
  const p = d.payload as Payload;
  const type = typeOf(p);
  const doc = str(p, 'doc') ?? `Voice of customer, ${areaOf(p) ?? 'all areas'}`;
  const heading = str(p, 'heading');
  const entry = str(p, 'entry') ?? `${str(p, 'account') ?? 'Customer'}: ${deliveryTitle(d)}`;
  return (
    <ToolFrame connector="google_drive" name="Google Docs" account={accountFor(d)} title={doc} label={`Google Doc entry in ${doc}`}>
      <div className={styles.docWrap}>
        {str(p, 'folder') ? <p className={styles.docPath}>{str(p, 'folder')}</p> : null}
        <div className={styles.page}>
          <h3 className={styles.docH2}>{longDate(heading ?? d.createdAt)}</h3>
          <h4 className={styles.docH3}>{str(p, 'section') ?? (type ? TYPE_LABEL[type] : 'Customer signal')}</h4>
          <p className={styles.text}>{entry}</p>
          {quoteOf(d) ? <Quote cite={str(p, 'account') ?? undefined}>{quoteOf(d)}</Quote> : null}
          {rationale(str(p, 'description')) ? <p className={styles.textMuted}>{rationale(str(p, 'description'))}</p> : null}
          {tagged.length ? (
            <p className={styles.chips}>
              {tagged.map((t) => (
                <span key={t.personId} className={styles.chip}>
                  <Avatar name={t.name} initials={t.person?.initials} size="sm" />
                  {t.name}
                </span>
              ))}
            </p>
          ) : null}
          <p className={styles.docNote}>
            Added by Signal Loop. <Link to={`/app/insights/${d.insightId}`}>See the evidence</Link>
          </p>
        </div>
      </div>
    </ToolFrame>
  );
}
