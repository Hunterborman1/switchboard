/**
 * Small shared product components: panels, type/severity/gate chips, toasts, the page
 * header with the budget pill, error states. Composes HB + UIS; adds no new tokens.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Gate, Insight, InsightType, Severity } from '../../shared/contracts';
import { Toast } from '../../system/components/feedback/Toast.jsx';
import { Button } from '../../system/components/primitives/Button.jsx';
import { Hint } from './Hint';
import { PageHeader, type Breadcrumb } from '../../uis/PageHeader';
import { StatusChip } from '../../uis/StatusChip';
import { SeverityChip } from '../../uis/SeverityChip';
import { EmptyState } from '../../uis/EmptyState';
import { tourAnchor } from '../../tour/anchors';
import { useSession } from '../api/hooks';
import {
  GATE_HELP,
  GATE_LABEL,
  GATE_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  TYPE_COLOR,
  TYPE_LABEL,
  money,
  reasonToObservation,
} from '../lib/labels';

// ---------------------------------------------------------------- panel

export function Panel({
  title,
  sub,
  actions,
  children,
  flush = false,
  className,
  anchor,
  id,
  headFlat = false,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  className?: string;
  anchor?: Record<string, string>;
  id?: string;
  headFlat?: boolean;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={`sl-panel${className ? ` ${className}` : ''}`} id={id} {...anchor}>
      {title || actions ? (
        <header className={`sl-panel-head${headFlat ? ' sl-panel-head-flat' : ''}`}>
          <div style={{ minWidth: 0 }}>
            {title ? <h2 className="sl-panel-title">{title}</h2> : null}
            {sub ? <p className="sl-panel-sub">{sub}</p> : null}
          </div>
          {actions ? <div className="sl-row">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? 'sl-panel-body-flush' : 'sl-panel-body'}>{children}</div>
    </Tag>
  );
}

// ---------------------------------------------------------------- chips

export function TypeTag({ type }: { type: InsightType }) {
  return (
    <span className="sl-type">
      <i style={{ background: TYPE_COLOR[type] }} aria-hidden="true" />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <StatusChip tone={SEVERITY_TONE[severity]} size="sm">
      {SEVERITY_LABEL[severity]}
    </StatusChip>
  );
}

/** Gate result: a status word, and (for anything but auto-route) a "why" popover with rule/expected/actual. */
export function GateChip({ insight, anchor }: { insight: Pick<Insight, 'gate' | 'gateReasons'>; anchor?: boolean }) {
  const gate: Gate = insight.gate;
  const sev = gate === 'auto_route' ? 'green' : gate === 'review' ? 'yellow' : gate === 'dropped' ? 'red' : 'neutral';
  const observations = insight.gateReasons.map(reasonToObservation);
  return (
    <span {...(anchor ? tourAnchor('review.why') : {})} style={{ display: 'inline-flex' }}>
      <SeverityChip
        severity={sev}
        text={GATE_LABEL[gate]}
        observations={observations}
        label={`${GATE_LABEL[gate]}: ${GATE_HELP[gate]}${observations.length ? ' Open for the reasons.' : ''}`}
        popoverTitle={observations.length ? 'Why it landed here' : undefined}
      />
    </span>
  );
}

export function GateStatus({ gate }: { gate: Gate }) {
  return (
    <StatusChip tone={GATE_TONE[gate]} size="sm">
      {GATE_LABEL[gate]}
    </StatusChip>
  );
}

// ---------------------------------------------------------------- toasts

type ToastItem = { id: number; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'; title: ReactNode; body?: ReactNode; action?: ReactNode };
const ToastCtx = createContext<(t: Omit<ToastItem, 'id'> & { ms?: number }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<ToastItem, 'id'> & { ms?: number }) => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-3), { ...t, id }]);
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), t.ms ?? 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="sl-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <Toast key={t.id} tone={t.tone} title={t.title} action={t.action} onClose={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>
            {t.body}
          </Toast>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- budget pill + header

export function BudgetPill({ compact = false }: { compact?: boolean }) {
  const { data } = useSession();
  const b = data?.budget;
  const live = b?.liveEnabled ?? true;
  const label = !b ? 'Checking budget…' : live ? 'Live AI' : 'Replay mode';
  const detail = b
    ? live
      ? `Live AI on: ${money(b.spentUsd, { precise: true })} of ${money(b.limitUsd, { precise: true })} viewer budget used · ${b.liveRuns.toLocaleString()} live runs. New runs call the real models.`
      : `Live AI budget reached (${money(b.spentUsd, { precise: true })} of ${money(b.limitUsd, { precise: true })}). Runs replay a recorded live run at real speed; custom uploads are paused.`
    : 'Reading the session…';
  const pct = b ? Math.min(1, b.spentUsd / Math.max(b.limitUsd, 0.0001)) : 0;
  return (
    <Hint label={detail} placement="bottom">
      <span
        className={`sl-budget-pill ${live ? 'is-live' : 'is-replay'}${compact ? ' is-compact' : ''}`}
        tabIndex={0}
        aria-label={detail}
        {...tourAnchor('budget.pill')}
      >
        <span className="sl-budget-dot" aria-hidden="true" />
        <span className="sl-budget-label">{label}</span>
        {!compact && b ? (
          <>
            <span className="sl-budget-track" aria-hidden="true">
              <span style={{ width: `${(pct * 100).toFixed(1)}%` }} />
            </span>
            <span className="sl-budget-amt sl-mono">
              {money(b.spentUsd, { precise: true })} / {money(b.limitUsd, { precise: true })}
            </span>
          </>
        ) : null}
      </span>
    </Hint>
  );
}

export function AppPageHeader({
  title,
  dataAsOf,
  breadcrumbs,
  actions,
}: {
  title: string;
  dataAsOf: string | null;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <PageHeader title={title} dataAsOf={dataAsOf} breadcrumbs={breadcrumbs}>
      {actions}
      <BudgetPill />
    </PageHeader>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — Signal Loop`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

// ---------------------------------------------------------------- states

export function ErrorState({ error, onRetry, what = 'this page' }: { error: Error; onRetry?: () => void; what?: string }) {
  return (
    <EmptyState
      variant="collection-failed"
      title={`Could not load ${what}`}
      description={error.message}
      action={onRetry ? <Button variant="secondary" size="sm" iconLeft="refresh" onClick={onRetry}>Retry</Button> : undefined}
    />
  );
}

/** A disabled control that says why (UIS rule: disabled controls explain themselves). */
export function WhyDisabled({ reason }: { reason: ReactNode }) {
  return (
    <span className="sl-why-disabled">
      <span aria-hidden="true">ⓘ</span>
      {reason}
    </span>
  );
}

export function useStableNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  }, []);
  return [copied, copy];
}

export function useMemoOnce<T>(fn: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(fn, []);
}
