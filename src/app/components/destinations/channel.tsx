/**
 * Channels as people see them: the tool's mark and its name. One place so the routing table,
 * the delivery log and the deliveries page name a channel the same way.
 */
import type { Channel } from '../../../shared/contracts';
import { CHANNEL_CONNECTOR, CHANNEL_LABEL, connectorById, type Connection } from '../../../shared/platform';
import { CellText, ConnectorMark } from '../../../ds';

export const CHANNELS: Channel[] = ['slack', 'teams', 'jira', 'linear', 'salesforce', 'email', 'email_digest', 'google_drive', 'triage'];

/** Where a rule sends in a channel until someone names it: picking a new channel resets the destination to this. */
export const DEFAULT_DESTINATION: Record<Channel, string> = {
  slack: '#product-feedback',
  teams: 'Product feedback',
  jira: 'PROD',
  linear: 'Core Product',
  salesforce: 'Account record',
  email: 'Owner’s inbox',
  email_digest: 'Weekly digest',
  google_drive: 'Customer feedback',
  triage: 'Product Ops triage',
};

export function channelLabel(channel: Channel): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

/** The ConnectorMark id for a channel; triage is Switchboard's own queue. */
export function channelMarkId(channel: Channel): string {
  return CHANNEL_CONNECTOR[channel] ?? 'triage';
}

/** The connector a channel delivers through (null for triage). */
export function channelConnector(channel: Channel) {
  const id = CHANNEL_CONNECTOR[channel];
  return id ? (connectorById(id) ?? null) : null;
}

/**
 * Whether a channel can deliver right now. Triage always can. While connections are unknown
 * (still loading, or the endpoint is unavailable) we say yes rather than warn on a guess.
 */
export function channelReady(channel: Channel, connections: Connection[] | undefined): boolean {
  const id = CHANNEL_CONNECTOR[channel];
  if (!id || !connections) return true;
  const c = connections.find((x) => x.id === id);
  return !c || c.status === 'connected';
}

export function ChannelMark({ channel, size = 18 }: { channel: Channel; size?: number }) {
  return <ConnectorMark id={channelMarkId(channel)} size={size} />;
}

/** Mark, channel name and (optionally) the destination inside it, as a table cell. */
export function ChannelCell({ channel, destination }: { channel: Channel; destination?: string | null }) {
  return (
    <span className="ds-row" style={{ gap: 10, alignItems: 'center' }}>
      <ChannelMark channel={channel} size={20} />
      <span className="ds-stack">
        <CellText primary={channelLabel(channel)} secondary={destination || undefined} />
      </span>
    </span>
  );
}
