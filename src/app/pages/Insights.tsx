/**
 * Insights: every insight in the workspace (seed ∪ yours), filterable with filters in the
 * URL. Status tiles filter the table; every count shows its denominator. A row opens the
 * provenance drawer at /app/insights/:id (search preserved).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Insight, type InsightStatus } from '../../shared/contracts';
import { Select } from '../../system/components/forms/Select.jsx';
import { SearchInput } from '../../system/components/forms/Input.jsx';
import { Button } from '../../system/components/primitives/Button.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { EmptyState } from '../../uis/EmptyState';
import { RelativeTime } from '../../uis/RelativeTime';
import { PageHeaderSkeleton, Skeleton, SkeletonSurface, TableSkeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { api } from '../api/client';
import { keys, useQuery } from '../api/hooks';
import { InsightDrawer } from '../components/InsightDrawer';
import { AppPageHeader, ErrorState, SeverityTag, TypeTag } from '../components/ui';
import { AREA_LABEL, AREA_SHORT, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './insights/Insights.module.css';

const TILES: { status: InsightStatus; label: string; help: string }[] = [
  { status: 'pending_review', label: 'Pending review', help: 'Waiting for a person to check' },
  { status: 'routed', label: 'Routed', help: 'Delivered to an owner' },
  { status: 'held', label: 'Held', help: 'Low score, not sent' },
  { status: 'rejected', label: 'Rejected', help: 'Turned down in review' },
  { status: 'dropped_ungrounded', label: 'Dropped', help: 'Quote not found in the call' },
];

const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

export default function InsightsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const world = useWorldIndex();
  const type = sp.get('type') ?? '';
  const area = sp.get('area') ?? '';
  const status = sp.get('status') ?? '';
  const account = sp.get('account') ?? '';
  const q = sp.get('q') ?? '';
  const [text, setText] = useState(q);
  const opener = useRef<string | null>(null);

  useEffect(() => setText(q), [q]);

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(sp);
      if (v) next.set(k, v);
      else next.delete(k);
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );

  // debounce search into the URL
  useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => {
      setParam('q', text.trim());
      if (text.trim()) track('search', { surface: 'insights', length: text.trim().length });
    }, 300);
    return () => window.clearTimeout(t);
  }, [text, q, setParam]);

  const baseQs = new URLSearchParams(Object.entries({ type, area, account, q }).filter(([, v]) => v)).toString();
  const filtered = useQuery(keys.insights(baseQs), () => api.insights({ type, area, account, q }), { pollMs: 15_000 });
  const all = useQuery(keys.insights(''), () => api.insights(), { pollMs: 15_000 });

  const base = useMemo(() => filtered.data ?? [], [filtered.data]);
  const rows = useMemo(() => (status ? base.filter((i) => i.status === status) : base), [base, status]);
  const total = all.data?.length ?? null;
  const counts = useMemo(() => {
    const m: Partial<Record<InsightStatus, number>> = {};
    for (const i of base) m[i.status] = (m[i.status] ?? 0) + 1;
    return m;
  }, [base]);
  const anyFilter = !!(type || area || status || account || q);

  const open = (ins: Insight) => {
    opener.current = ins.id;
    navigate({ pathname: `/app/insights/${ins.id}`, search: sp.toString() ? `?${sp.toString()}` : '' });
  };
  const close = useCallback(() => {
    const back = opener.current ?? id;
    navigate({ pathname: '/app/insights', search: sp.toString() ? `?${sp.toString()}` : '' }, { replace: true });
    window.setTimeout(() => {
      if (back) document.querySelector<HTMLElement>(`[data-insight-row="${back}"]`)?.focus();
    }, 30);
  }, [navigate, sp, id]);

  const columns: DataTableColumn<Insight>[] = [
    {
      key: 'summary',
      header: 'Insight',
      sortable: true,
      sortValue: (r) => r.summary.toLowerCase(),
      render: (r) => (
        <button type="button" className={styles.rowBtn} data-insight-row={r.id} onClick={() => open(r)}>
          <span className="sl-cell-title">{r.summary}</span>
          <span className="sl-cell-sub">{world.accountName(r.accountId)}</span>
        </button>
      ),
    },
    { key: 'type', header: 'Type', sortable: true, sortValue: (r) => TYPE_LABEL[r.type], render: (r) => <TypeTag type={r.type} /> },
    { key: 'area', header: 'Area', sortable: true, sortValue: (r) => AREA_LABEL[r.productArea], render: (r) => <span className="sl-meta" style={{ color: 'var(--text)' }}>{AREA_SHORT[r.productArea]}</span> },
    { key: 'severity', header: 'Severity', sortable: true, sortValue: (r) => SEV_RANK[r.severity], render: (r) => <SeverityTag severity={r.severity} /> },
    {
      key: 'conf',
      header: 'Score',
      sortable: true,
      sortValue: (r) => r.confidenceFinal,
      render: (r) => (
        <span className={styles.conf} title={`Overall score ${r.confidenceFinal.toFixed(2)} (AI confidence ${r.confidenceModel.toFixed(2)}, quote check ${r.groundingScore.toFixed(2)})`}>
          <span className={styles.confTrack} aria-hidden="true">
            <i style={{ width: `${Math.round(r.confidenceFinal * 100)}%`, background: r.confidenceFinal >= 0.8 ? 'var(--success)' : r.confidenceFinal >= 0.55 ? 'var(--cn-warning)' : 'var(--text-tertiary)' }} />
          </span>
          <span className="sl-num">{r.confidenceFinal.toFixed(2)}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => STATUS_LABEL[r.status],
      render: (r) => (
        <StatusChip tone={STATUS_TONE[r.status]} size="sm">
          {STATUS_LABEL[r.status]}
        </StatusChip>
      ),
    },
    { key: 'created', header: 'Seen', sortable: true, sortValue: (r) => r.createdAt, render: (r) => <span className="sl-meta"><RelativeTime value={r.createdAt} /></span> },
  ];

  if (filtered.loading && all.loading) {
    return (
      <SkeletonSurface label="Loading insights">
        <PageHeaderSkeleton />
        <div className={styles.tiles}>
          {TILES.map((t) => (
            <div key={t.status} className={styles.tile}>
              <Skeleton width="60%" height={10} />
              <Skeleton width="40%" height={22} />
            </div>
          ))}
        </div>
        <TableSkeleton rows={8} columns={6} />
      </SkeletonSurface>
    );
  }

  const err = filtered.error && !filtered.data ? filtered.error : null;

  return (
    <div className="sl-page">
      <AppPageHeader title="Insights" subtitle="Every insight pulled from customer conversations, and where it went." dataAsOf={filtered.dataAsOf ?? all.dataAsOf} />

      <div className={styles.tiles} role="group" aria-label="Filter by status">
        {TILES.map((t) => {
          const n = counts[t.status] ?? 0;
          const on = status === t.status;
          return (
            <button
              key={t.status}
              type="button"
              className={`${styles.tile} ${on ? styles.tileOn : ''}`}
              data-tone={STATUS_TONE[t.status]}
              aria-pressed={on}
              onClick={() => setParam('status', on ? '' : t.status)}
            >
              <span className={styles.tileLabel}>{t.label}</span>
              <span className={styles.tileValue}>
                <span className="sl-num">{n}</span>
                <span className={styles.tileDen}>/ {base.length}</span>
              </span>
              <span className={styles.tileHelp}>{t.help}</span>
            </button>
          );
        })}
      </div>

      <section className="sl-panel">
        <div className={styles.toolbar}>
          <div className="sl-filters">
            <SearchInput
              value={text}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
              placeholder="Search summary, quote, account"
              aria-label="Search insights"
              style={{ width: 260, maxWidth: '100%' }}
            />
            <Select aria-label="Type" value={type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('type', e.target.value)} options={[{ value: '', label: 'All types' }, ...INSIGHT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
            <Select aria-label="Product area" value={area} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('area', e.target.value)} options={[{ value: '', label: 'All areas' }, ...PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))]} />
            <Select aria-label="Account" value={account} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('account', e.target.value)} options={[{ value: '', label: 'All accounts' }, ...[...world.accounts].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ value: a.id, label: a.name }))]} />
            {anyFilter ? (
              <Button variant="ghost" size="sm" iconLeft="x" onClick={() => { setText(''); setSp(new URLSearchParams(), { replace: true }); }}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <span className="sl-meta sl-num" aria-live="polite">
            {rows.length} of {total ?? '…'} insights{filtered.refreshing ? ' · refreshing' : ''}
          </span>
        </div>
        {err ? (
          <div style={{ padding: 20 }}>
            <ErrorState error={err} onRetry={() => void filtered.refresh()} what="insights" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            pagination="when-needed"
            initialSort={{ key: 'created', direction: 'desc' }}
            rowTone={(r) => (r.status === 'rejected' || r.status === 'held' ? 'muted' : r.status === 'dropped_ungrounded' ? 'red' : null)}
            empty={
              total === 0 ? (
                <EmptyState variant="not-yet-collected" title="No insights yet" description="Run a call from New call. Insights appear here as soon as their quotes are verified." />
              ) : (
                <EmptyState variant="no-data" title="No insights match these filters" description="Try a broader filter, or clear the filters." />
              )
            }
          />
        )}
      </section>

      {id ? <InsightDrawer id={id} onClose={close} /> : null}
    </div>
  );
}
