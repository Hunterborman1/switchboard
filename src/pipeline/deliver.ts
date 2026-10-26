/**
 * Deliver: simulated adapters for every channel a rule can route to (Slack, Teams, Jira, Linear,
 * Salesforce, direct email, the weekly email digest, a Google Drive voice-of-customer doc) and
 * triage. Each produces a realistic payload preview and a receipt (INTG-482, a Slack ts, a
 * Salesforce task id, …) with simulated attempt timings, and tags the owner, the account's CSM
 * and, for high-stakes items on large accounts, the VP of Customer Success, by their handle in
 * that tool. Deterministic per insight id, including one transient failure-then-retry case
 * (about 1 in 9 Jira/Linear/Salesforce deliveries) so retries are visible in the UI. Nothing
 * leaves the Worker.
 */
import type { Account, Channel, Delivery, Insight, Notification, Person } from '../shared/contracts.ts';
import { CHANNEL_CONNECTOR, personHandle } from '../shared/platform.ts';
import type { RouteDecision } from './route.ts';
import { fnv1a } from './util.ts';

export const AREA_LABEL: Record<Insight['productArea'], string> = {
  call_tracking: 'Call Tracking & Attribution',
  signal_ai: 'Signal AI',
  presense: 'PreSense',
  integrations: 'Integrations',
  quality_management: 'Quality Management',
  ai_agents: 'AI Agents',
  billing_pricing: 'Billing & Pricing',
  platform: 'Platform',
};
export const TYPE_LABEL: Record<Insight['type'], string> = {
  feature_request: 'Feature request',
  bug: 'Bug',
  pricing_objection: 'Pricing objection',
  competitor_mention: 'Competitor mention',
  churn_risk: 'Churn risk',
  praise: 'Praise',
};

const JIRA_KEYS: Record<Insight['productArea'], string> = {
  call_tracking: 'CT', signal_ai: 'SAI', presense: 'PRES', integrations: 'INTG', quality_management: 'QM', ai_agents: 'AIA', billing_pricing: 'BILL', platform: 'PLAT',
};

export function projectKey(destination: string, area: Insight['productArea']): string {
  const m = destination.match(/^[A-Z][A-Z0-9]{1,6}$/);
  return m ? m[0] : JIRA_KEYS[area];
}

export function bestQuote(insight: Insight): string {
  const e = insight.evidence.find((x) => x.method !== 'failed');
  return e?.matchedText ?? e?.quote ?? insight.evidence[0]?.quote ?? '';
}

function money(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;
}

export type DeliverContext = {
  account: Account | null;
  owner: Person | null;
  csm: Person | null;
  now: number;
  ids: (prefix: string) => string;
  /** The workspace directory (for watchers). Omitted: owner and CSM only. */
  people?: Person[];
  /** The connected account the channel's connector delivers through ("invoca.slack.com"). */
  connectorAccount?: string | null;
  /** That connector's settings (default channel, project, folder …). */
  connectorConfig?: Record<string, string>;
};

export type Mention = NonNullable<Delivery['mentions']>[number];

/** Accounts above this ARR get the VP of Customer Success watching churn and pricing signals. */
export const WATCHER_ARR_USD = 250_000;

export function vpCustomerSuccess(people: Person[]): Person | null {
  return people.find((p) => p.active !== false && /\b(VP|Vice President)\b/i.test(p.title) && /customer success/i.test(p.title)) ?? null;
}

/**
 * Who a delivery tags, by their handle in the destination tool: the owner, the account's CSM,
 * and for churn risk or pricing push-back on accounts over $250k ARR the VP of Customer Success.
 * Each person once; people no longer in the directory are not tagged.
 */
export function deliveryMentions(insight: Pick<Insight, 'type'>, channel: Channel, ctx: Pick<DeliverContext, 'owner' | 'csm' | 'account' | 'people'>): Mention[] {
  const connector = CHANNEL_CONNECTOR[channel];
  const out: Mention[] = [];
  const add = (p: Person | null | undefined, role: Mention['role']) => {
    if (!p || p.active === false || out.some((m) => m.personId === p.id)) return;
    out.push({ personId: p.id, handle: personHandle(p, connector), role });
  };
  add(ctx.owner, 'owner');
  add(ctx.csm, 'csm');
  if ((insight.type === 'churn_risk' || insight.type === 'pricing_objection') && (ctx.account?.arrUsd ?? 0) > WATCHER_ARR_USD) add(vpCustomerSuccess(ctx.people ?? []), 'watcher');
  return out;
}

const at = (h: string) => `@${h.replace(/^@/, '')}`;

/** UTC date (YYYY-MM-DD), `plusDays` after `now`. */
function day(now: number, plusDays = 0): string {
  return new Date(now + plusDays * 86_400_000).toISOString().slice(0, 10);
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function base62(n: number, len: number): string {
  let out = '';
  let x = Math.abs(n);
  for (let i = 0; i < len; i++) {
    out = B62[x % 62]! + out;
    x = Math.floor(x / 62) || fnv1a(String(n + i));
  }
  return out;
}

/**
 * Flat fields every destination preview reads (account, ARR, renewal, area, confidence, CSM),
 * from the insight/account join. Merged into each channel payload at write time, and applied
 * at read time to delivery rows written before these fields existed (enrichDelivery).
 * Absent values are left out rather than written as placeholders, so a preview can hide them.
 */
export function previewFields(insight: Insight, account: Account | null, csm: Person | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: insight.type,
    productArea: insight.productArea,
    summary: insight.summary,
    severity: insight.severity,
    confidence: Math.round(insight.confidenceFinal * 100) / 100,
  };
  const quote = bestQuote(insight);
  if (quote) out.quote = quote;
  if (account) {
    out.account = account.name;
    out.accountId = account.id;
    out.tier = account.tier;
    out.arrUsd = account.arrUsd;
    out.renewalDate = account.renewalDate;
  }
  if (csm) out.csm = csm.name;
  return out;
}

/** Fills missing preview fields on a stored delivery (older rows carried only channel-shaped payloads). */
export function enrichDelivery(d: Delivery, insight: Insight | null | undefined, account: Account | null, csm: Person | null): Delivery {
  if (!insight) return d;
  const fields = previewFields(insight, account, csm);
  const payload = { ...(d.payload as Record<string, unknown>) };
  let changed = false;
  for (const [k, v] of Object.entries(fields)) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') {
      payload[k] = v;
      changed = true;
    }
  }
  return changed ? { ...d, payload } : d;
}

/** Build the destination payload preview. */
export function renderPayload(channel: Channel, insight: Insight, decision: RouteDecision, ctx: DeliverContext): Record<string, unknown> {
  return { ...channelPayload(channel, insight, decision, ctx), ...previewFields(insight, ctx.account, ctx.csm) };
}

function channelPayload(channel: Channel, insight: Insight, decision: RouteDecision, ctx: DeliverContext): Record<string, unknown> {
  const quote = bestQuote(insight);
  const acct = ctx.account ? `${ctx.account.name} (${ctx.account.tier}, ${money(ctx.account.arrUsd)} ARR, renews ${ctx.account.renewalDate})` : 'No account';
  const title = `${TYPE_LABEL[insight.type]}: ${insight.summary}`;
  const mentions = deliveryMentions(insight, channel, ctx);
  const cc = mentions.length ? mentions.map((m) => at(m.handle)).join(' ') : 'owner';
  switch (channel) {
    case 'slack':
    case 'teams':
      // Teams posts carry the same blocks, so one chat preview renders both.
      return {
        channel: decision.destination,
        text: title,
        blocks: [
          { type: 'header', text: `${TYPE_LABEL[insight.type]} · ${AREA_LABEL[insight.productArea]}` },
          { type: 'section', text: insight.summary },
          { type: 'quote', text: quote },
          { type: 'fields', fields: [['Account', acct], ['Severity', insight.severity], ['Confidence', insight.confidenceFinal.toFixed(2)], ['CSM', ctx.csm?.name ?? '—']] },
          { type: 'context', text: `Signal Loop · ${insight.id} · cc ${cc}` },
        ],
      };
    case 'salesforce': {
      const owner = ctx.owner?.name ?? ctx.connectorConfig?.taskQueue ?? 'Account owner';
      return {
        object: 'Account',
        destination: decision.destination,
        title,
        activity: { type: 'Customer signal', subject: title, date: day(ctx.now), description: `${insight.rationale}\n\n> ${quote}\n\n${acct}` },
        task: {
          subject: `Follow up: ${insight.summary}`, owner, ownerHandle: ctx.owner ? personHandle(ctx.owner, 'salesforce') : null, status: 'Not Started',
          priority: insight.severity === 'critical' || insight.severity === 'high' ? 'High' : 'Normal', dueDate: day(ctx.now, insight.severity === 'critical' ? 1 : 3),
        },
        description: `${insight.rationale}\n\n> ${quote}`,
      };
    }
    case 'email':
      return {
        to: ctx.owner?.email ?? decision.destination,
        cc: ctx.csm && ctx.csm.id !== ctx.owner?.id ? [ctx.csm.email] : [],
        from: ctx.connectorAccount ?? 'signals@invoca.example',
        subject: title,
        title,
        body: [insight.rationale, '', `> ${quote}`, '', `Account: ${acct}`, `Severity: ${insight.severity} · confidence ${insight.confidenceFinal.toFixed(2)}`].join('\n'),
        description: insight.rationale,
      };
    case 'google_drive':
      return {
        doc: `Voice of customer · ${AREA_LABEL[insight.productArea]}`,
        folder: ctx.connectorConfig?.folder || decision.destination || 'Customer Success / Signals',
        heading: day(ctx.now),
        section: TYPE_LABEL[insight.type],
        title,
        entry: `${ctx.account?.name ?? 'Unknown account'}: ${insight.summary}`,
        description: insight.rationale,
      };
    case 'jira':
      return {
        project: projectKey(decision.destination, insight.productArea),
        issueType: insight.type === 'bug' ? 'Bug' : insight.type === 'feature_request' ? 'Story' : 'Task',
        summary: insight.summary,
        priority: { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low' }[insight.severity],
        labels: ['signal-loop', insight.type, ctx.account ? ctx.account.id.replace(/^acct_/, '') : 'no-account'],
        components: [AREA_LABEL[insight.productArea]],
        assignee: ctx.owner?.name ?? null,
        reporter: 'Signal Loop',
        description: `${insight.rationale}\n\n> ${quote}\n\nAccount: ${acct}\nCSM: ${ctx.csm?.name ?? '—'}\nConfidence: ${insight.confidenceFinal.toFixed(2)} · Evidence grounded (${insight.evidence[0]?.method ?? 'n/a'})`,
      };
    case 'linear':
      return {
        team: decision.destination,
        title,
        priority: { critical: 1, high: 2, medium: 3, low: 4 }[insight.severity],
        labels: ['Signal Loop', TYPE_LABEL[insight.type]],
        assignee: ctx.owner?.name ?? null,
        description: `${insight.rationale}\n\n> ${quote}\n\n${acct}`,
      };
    case 'email_digest':
      return {
        to: ctx.owner?.email ?? decision.destination,
        subject: `Signal Loop weekly digest · ${AREA_LABEL[insight.productArea]}`,
        section: TYPE_LABEL[insight.type],
        line: `${ctx.account?.name ?? 'Unknown account'}: ${insight.summary}`,
        quote,
      };
    case 'triage':
      return {
        queue: decision.destination,
        reason: decision.reason,
        item: title,
        quote,
        account: acct,
      };
  }
}

function receiptFor(channel: Channel, insight: Insight, decision: RouteDecision, now: number): string {
  const h = fnv1a(insight.id);
  switch (channel) {
    case 'teams':
      return `${now}${String(h % 1000).padStart(3, '0')}`;
    case 'salesforce':
      return `00T5f00000${base62(h, 5)}`;
    case 'email':
      return `<sl.${h.toString(16).padStart(8, '0')}.${Math.floor(now / 1000).toString(36)}@invoca.example>`;
    case 'google_drive':
      return `VOC-${JIRA_KEYS[insight.productArea]}#r${120 + (h % 880)}`;
    case 'jira':
      return `${projectKey(decision.destination, insight.productArea)}-${100 + (h % 900)}`;
    case 'linear': {
      const team = decision.destination.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join('').slice(0, 3) || 'SIG';
      return `${team}-${10 + (h % 490)}`;
    }
    case 'slack':
      return `${Math.floor(now / 1000)}.${String(h % 1_000_000).padStart(6, '0')}`;
    case 'email_digest': {
      const d = new Date(now);
      return `digest-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}#${1 + (h % 40)}`;
    }
    case 'triage':
      return `TRI-${1000 + (h % 9000)}`;
  }
}

const ADAPTER_NAME: Record<Channel, string> = {
  slack: 'Slack', teams: 'Teams', jira: 'Jira', linear: 'Linear', salesforce: 'Salesforce', email: 'Email', email_digest: 'Digest', google_drive: 'Google Drive', triage: 'Triage',
};

/** Whether this insight hits the deterministic transient-failure case. */
export function hitsTransientFailure(insightId: string, channel: Channel): boolean {
  return (channel === 'jira' || channel === 'linear' || channel === 'salesforce') && fnv1a(`retry:${insightId}`) % 9 === 0;
}

export function deliverInsight(insight: Insight, decision: RouteDecision, ctx: DeliverContext): Delivery {
  const h = fnv1a(insight.id);
  const channel = decision.channel;
  const attempts: Delivery['attempts'] = [];
  let t = ctx.now;
  if (hitsTransientFailure(insight.id, channel)) {
    const ms = 2400 + (h % 900);
    attempts.push({ at: new Date(t).toISOString(), ok: false, ms, note: `HTTP 503 from ${ADAPTER_NAME[channel]} mock (upstream busy) · retry in 2s` });
    t += ms + 2000;
  }
  const ms = 90 + (h % 380);
  const receipt = receiptFor(channel, insight, decision, ctx.now);
  attempts.push({ at: new Date(t).toISOString(), ok: true, ms, note: `${ADAPTER_NAME[channel]} accepted · ${receipt}` });
  return {
    id: ctx.ids('dlv'),
    workspaceId: insight.workspaceId,
    insightId: insight.id,
    channel,
    destination: decision.destination,
    ownerId: decision.ownerId,
    status: 'delivered',
    attempts,
    receipt,
    payload: renderPayload(channel, insight, decision, ctx),
    ticketState: channel === 'jira' || channel === 'linear' ? 'open' : null,
    createdAt: new Date(ctx.now).toISOString(),
    mentions: deliveryMentions(insight, channel, ctx),
    connectorAccount: CHANNEL_CONNECTOR[channel] ? ctx.connectorAccount ?? null : null,
  };
}

export function routedNotification(insight: Insight, delivery: Delivery, ctx: DeliverContext): Notification | null {
  if (!insight.csmId) return null;
  const who = ctx.owner ? `${ctx.owner.name} (${ctx.owner.title})` : 'the owning team';
  return {
    id: ctx.ids('ntf'),
    workspaceId: insight.workspaceId,
    csmId: insight.csmId,
    insightId: insight.id,
    kind: 'routed',
    title: `Your ${ctx.account?.name ?? 'customer'} feedback reached ${ctx.owner?.name ?? 'an owner'}`,
    body: `${TYPE_LABEL[insight.type]} "${insight.summary}" was sent to ${who} via ${ADAPTER_NAME[delivery.channel]}${delivery.receipt ? ` (${delivery.receipt})` : ''}.`,
    draftCustomerNote: null,
    read: false,
    createdAt: new Date(ctx.now).toISOString(),
  };
}

/** Template-based close-the-loop note when a ticket ships (no LLM needed). */
export function shippedNotification(insight: Insight, delivery: Delivery, ctx: { account: Account | null; csm: Person | null; owner: Person | null; now: number; ids: (p: string) => string; contactFirstName?: string | null }): Notification | null {
  if (!insight.csmId) return null;
  const acct = ctx.account?.name ?? 'your customer';
  const greeting = ctx.contactFirstName ? `Hi ${ctx.contactFirstName},` : 'Hi there,';
  const quote = bestQuote(insight);
  const note = [
    greeting,
    '',
    `Quick follow-up from our last conversation. You told us${quote ? ` "${quote.length > 140 ? `${quote.slice(0, 137)}…` : quote}"` : ' about this'}, and I wanted you to hear it from me first: the work on "${insight.summary.replace(/\.$/, '')}" has now shipped${delivery.receipt ? ` (ref ${delivery.receipt})` : ''}.`,
    '',
    `${ctx.owner ? `${ctx.owner.name} on our ${AREA_LABEL[insight.productArea]} team` : `Our ${AREA_LABEL[insight.productArea]} team`} picked this up directly from your feedback. Happy to walk your team through it on our next call.`,
    '',
    'Thanks for pushing us on this,',
    ctx.csm?.name ?? 'Your Invoca CSM',
  ].join('\n');
  return {
    id: ctx.ids('ntf'),
    workspaceId: delivery.workspaceId,
    csmId: insight.csmId,
    insightId: insight.id,
    kind: 'shipped',
    title: `Your feedback from ${acct} shipped`,
    body: `${delivery.receipt ?? 'The ticket'} "${insight.summary}" moved to Shipped. A draft note to the customer is ready to edit and send.`,
    draftCustomerNote: note,
    read: false,
    createdAt: new Date(ctx.now).toISOString(),
  };
}
