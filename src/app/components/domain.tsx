/**
 * Domain vocabulary on the design system: one component per concept, so an insight type, a
 * gate result or a run status looks the same on every page.
 */
import type { ReactNode } from 'react';
import type { Gate, Insight, InsightStatus, InsightType, Run, Severity } from '../../shared/contracts';
import { connectorById, DOC_KIND_LABEL, type DocKind } from '../../shared/platform';
import { Badge, Button, ConnectorMark, DotLabel, EmptyState, Tooltip, type Tone } from '../../ds';
import { IconAlertCircle, IconRefresh } from '../../ds/icons';
import { RelativeTime } from '../../ds/time/RelativeTime';
import { GATE_HELP, GATE_LABEL, SEVERITY_LABEL, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from '../lib/labels';

export function TypeLabel({ type }: { type: InsightType }) {
  return <DotLabel color={TYPE_COLOR[type]}>{TYPE_LABEL[type]}</DotLabel>;
}

const SEVERITY_BADGE: Record<Severity, Tone> = { low: 'neutral', medium: 'neutral', high: 'warning', critical: 'danger' };
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_BADGE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

const GATE_BADGE: Record<Gate, Tone> = { auto_route: 'success', review: 'warning', held: 'neutral', dropped: 'danger' };
/** Where the gate sent an insight, with the reasons one hover away. */
export function GateBadge({ insight, attrs }: { insight: Pick<Insight, 'gate' | 'gateReasons'>; attrs?: Record<string, string> }) {
  const reasons = insight.gateReasons;
  const tip = (
    <span style={{ display: 'block' }}>
      <span style={{ display: 'block' }}>{GATE_HELP[insight.gate]}</span>
      {reasons.length ? (
        <span style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>
          {reasons.map((r) => (
            <span key={r} style={{ display: 'block' }}>
              {readableReason(r)}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
  return (
    <Tooltip label={tip}>
      <span tabIndex={0} style={{ display: 'inline-flex', borderRadius: 4 }} {...attrs}>
        <Badge tone={GATE_BADGE[insight.gate]} dot>
          {GATE_LABEL[insight.gate]}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** "confidence 0.71 < 0.80" → "Score 0.71, below 0.80". Everything else passes through. */
export function readableReason(reason: string): string {
  const m = reason.match(/^(confidence|grounding)\s+([\d.]+)\s*([<≥>=]+)\s*([\d.]+)/i);
  if (m) {
    const [, what, actual, op, threshold] = m;
    const noun = what!.toLowerCase() === 'confidence' ? 'Score' : 'Quote match';
    return op === '<' ? `${noun} ${actual}, below ${threshold}` : `${noun} ${actual}, at or above ${threshold}`;
  }
  if (/churn_risk/i.test(reason)) return 'Churn risk is always checked by a person';
  if (/sev-1|critical/i.test(reason)) return 'Critical bugs are always checked by a person';
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

const STATUS_BADGE: Record<InsightStatus, Tone> = { pending_review: 'warning', routed: 'success', rejected: 'neutral', held: 'neutral', dropped_ungrounded: 'danger' };
export function InsightStatusBadge({ status }: { status: InsightStatus }) {
  return <Badge tone={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const RUN_STATUS_LABEL: Record<Run['status'], string> = {
  queued: 'Queued',
  running: 'Processing',
  awaiting_review: 'Needs review',
  completed: 'Done',
  failed: 'Failed',
};
const RUN_STATUS_TONE: Record<Run['status'], Tone> = { queued: 'neutral', running: 'info', awaiting_review: 'warning', completed: 'success', failed: 'danger' };
export function RunStatusBadge({ status }: { status: Run['status'] }) {
  return (
    <Badge tone={RUN_STATUS_TONE[status]} dot>
      {RUN_STATUS_LABEL[status]}
    </Badge>
  );
}

export const MODE_REASON: Record<string, string> = {
  budget_reached: 'The live AI budget is used up, so this replayed a recorded live run at real speed.',
  live_failed: 'The live AI call failed or was too slow, so the recorded live run was played back.',
  live_disabled: 'Live AI was turned off; this replayed a recorded live run.',
  live_busy: 'Live AI was at capacity; this replayed a recorded live run.',
  seed: 'Sample history: a recorded live run, present in every workspace.',
};

/** Live or replay. Live is the normal case, so it is quiet; replay says why on hover. */
export function ModeBadge({ run }: { run: Pick<Run, 'mode' | 'modeReason'> }) {
  if (run.mode === 'live') return <span className="ds-subtle">Live</span>;
  return (
    <Tooltip label={MODE_REASON[run.modeReason ?? ''] ?? 'Replay of a recorded live run.'}>
      <span tabIndex={0} style={{ display: 'inline-flex' }}>
        <Badge tone="info">Replay</Badge>
      </span>
    </Tooltip>
  );
}

export const SOURCE_LABEL: Record<string, string> = {
  upload: 'Upload',
  paste: 'Pasted text',
  library: 'Library',
};
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'Upload';
  return SOURCE_LABEL[source] ?? connectorById(source)?.name ?? source;
}

export function SourceLabel({ source }: { source: string | null | undefined }) {
  const id = source ?? 'upload';
  return (
    <span className="ds-row" style={{ gap: 8 }}>
      <ConnectorMark id={id} size={18} />
      <span className="ds-truncate">{sourceLabel(id)}</span>
    </span>
  );
}

export function docKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return DOC_KIND_LABEL[kind as DocKind] ?? null;
}

export function When({ value }: { value: string | null | undefined }) {
  return <RelativeTime value={value} />;
}

export function ErrorState({ error, onRetry, what = 'this page' }: { error: Error; onRetry?: () => void; what?: string }) {
  return (
    <EmptyState
      icon={<IconAlertCircle />}
      title={`Couldn’t load ${what}`}
      description={error.message}
      actions={
        onRetry ? (
          <Button size="sm" icon={<IconRefresh size={14} />} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="ds-subtle">{children}</span>;
}
