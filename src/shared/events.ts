/**
 * The product → walkthrough event bus. Product UI emits facts ("a run finished", "the
 * reviewer approved an insight"); the tour engine waits on them to advance. Keeping this a
 * tiny typed CustomEvent channel means the product never imports the tour.
 */
import type { Channel, InsightType, StepKey } from './contracts';

export type SignalEvent =
  | { name: 'picker.opened' }
  | { name: 'picker.closed' }
  | { name: 'file.selected'; fileId: string; tourPath: string | null; format?: string }
  | { name: 'run.started'; runId: string; fileId: string | null; mode: 'live' | 'replay' }
  | { name: 'run.step'; runId: string; step: StepKey; status: string }
  | { name: 'run.finished'; runId: string; status: string }
  | { name: 'evidence.focused'; insightId: string; method: string }
  | { name: 'review.action'; insightId: string; action: 'approve' | 'edit' | 'reject' }
  | { name: 'review.empty' }
  | { name: 'delivery.opened'; deliveryId: string; channel: Channel }
  | { name: 'rule.changed'; ruleId: string }
  | { name: 'theme.opened'; themeId: string }
  | { name: 'ticket.state'; deliveryId: string; state: string }
  | { name: 'notification.opened'; notificationId: string }
  | { name: 'eval.promote_attempted'; promoted: boolean }
  | { name: 'redaction.toggled'; showing: 'before' | 'after' }
  | { name: 'insight.opened'; insightId: string; type: InsightType }
  | { name: 'route.changed'; path: string };

const NAME = 'signal-loop';
// globalThis rather than window: this module is type-checked in the Worker build too.
const target = globalThis as unknown as EventTarget;

export function emit(event: SignalEvent): void {
  target.dispatchEvent(new CustomEvent<SignalEvent>(NAME, { detail: event }));
}

export function listen(handler: (event: SignalEvent) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<SignalEvent>).detail);
  target.addEventListener(NAME, fn);
  return () => target.removeEventListener(NAME, fn);
}
