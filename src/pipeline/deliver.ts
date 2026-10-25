/**
 * Deliver: mock adapters for Slack, Jira, Linear, the weekly email digest and triage. Each
 * produces a realistic payload preview and a receipt (INTG-482, a Slack ts, …) with simulated
 * attempt timings. Deterministic per insight id, including one transient failure-then-retry
 * case (about 1 in 9 Jira/Linear deliveries) so retries are visible in the UI.
 */
import type { Account, Channel, Delivery, Insight, Notification, Person } from '../shared/contracts.ts';
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
};

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
  switch (channel) {
    case 'slack':
      return {
        channel: decision.destination,
        text: title,
        blocks: [
          { type: 'header', text: `${TYPE_LABEL[insight.type]} · ${AREA_LABEL[insight.productArea]}` },
          { type: 'section', text: insight.summary },
          { type: 'quote', text: quote },
          { type: 'fields', fields: [['Account', acct], ['Severity', insight.severity], ['Confidence', insight.confidenceFinal.toFixed(2)], ['CSM', ctx.csm?.name ?? '—']] },
          { type: 'context', text: `Signal Loop · ${insight.id} · cc ${ctx.owner ? `@${ctx.owner.slackHandle.replace(/^@/, '')}` : 'owner'}` },
        ],
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

const ADAPTER_NAME: Record<Channel, string> = { slack: 'Slack', jira: 'Jira', linear: 'Linear', email_digest: 'Digest', triage: 'Triage' };

/** Whether this insight hits the deterministic transient-failure case. */
export function hitsTransientFailure(insightId: string, channel: Channel): boolean {
  return (channel === 'jira' || channel === 'linear') && fnv1a(`retry:${insightId}`) % 9 === 0;
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
