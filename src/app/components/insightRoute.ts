/**
 * Where an insight goes, in words: "Kate Morrison in Slack #pricing-feedback". Shared by the
 * review queue (where it will go on approval) and the insight drawer (where it went).
 */
import type { Channel } from '../../shared/contracts';
import { CHANNEL_CONNECTOR, CHANNEL_LABEL } from '../../shared/platform';

export function channelLabel(channel: Channel | null | undefined): string {
  if (!channel) return 'Triage queue';
  return CHANNEL_LABEL[channel] ?? channel;
}

/** Connector id for the channel's mark ('triage' has Switchboard's own mark). */
export function channelConnector(channel: Channel | null | undefined): string {
  if (!channel) return 'triage';
  return CHANNEL_CONNECTOR[channel] ?? 'triage';
}

/** The place, without the person: "Slack #pricing-feedback", "Jira INTG", "VP Product weekly digest". */
export function placeText(channel: Channel | null | undefined, destination: string | null | undefined): string {
  const label = channelLabel(channel);
  if (!destination) return label;
  if (channel === 'email_digest' || channel === 'triage' || !channel) return destination;
  if (channel === 'email') return `Email to ${destination}`;
  return `${label} ${destination}`;
}

/** The person and the place: "Kate Morrison in Slack #pricing-feedback". */
export function routeText(owner: string, channel: Channel | null | undefined, destination: string | null | undefined): string {
  if (channel === 'email') return `${owner} by email`;
  if (channel === 'email_digest') return `${owner} in the ${destination ?? 'weekly digest'}`;
  return `${owner} in ${placeText(channel, destination)}`;
}
