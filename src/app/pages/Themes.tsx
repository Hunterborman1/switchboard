import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Theme } from '../../shared/contracts';
import { tourAnchor } from '../../tour/anchors';
import { Select } from '../../system/components/forms/Select.jsx';
import { SearchInput } from '../../system/components/forms/Input.jsx';
import { Sparkline } from '../../uis/Sparkline';
import { StatusChip, type StatusTone } from '../../uis/StatusChip';
import { EmptyState } from '../../uis/EmptyState';
import { Skeleton, SkeletonSurface } from '../../uis/Skeleton';
import { useThemes } from '../api/hooks';
import { AppPageHeader, ErrorState, TypeTag } from '../components/ui';
import { AREA_LABEL, TYPE_LABEL, money } from '../lib/labels';
import styles from './themes/themes.module.css';

export const THEME_STATUS_LABEL: Record<Theme['status'], string> = {
  candidate: 'Candidate',
  active: 'Active',
  on_roadmap: 'On roadmap',
  shipped: 'Shipped',
};
export const THEME_STATUS_TONE: Record<Theme['status'], StatusTone> = {
  candidate: 'neutral',
  active: 'info',
  on_roadmap: 'warning',
  shipped: 'success',
};

/** The theme the C-1042 walkthrough insight joins (by id, or by name for real data). */
export function isC1042Theme(t: Pick<Theme, 'id' | 'name'>): boolean {
  return t.id === 'thm_offline_conv' || /offline conversions/i.test(t.name);
}

type SortKey = 'arr' | 'insights' | 'accounts' | 'recent' | 'trend';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'arr', label: 'Sort: ARR at stake' },
  { value: 'insights', label: 'Sort: insights' },
  { value: 'accounts', label: 'Sort: accounts' },
  { value: 'trend', label: 'Sort: rising this week' },
  { value: 'recent', label: 'Sort: last seen' },
];

function trendDelta(t: Theme): number {
  const w = t.weekly;
  if (w.length < 2) return 0;
  return (w[w.length - 1]?.count ?? 0) - (w[w.length - 2]?.count ?? 0);
}

function ThemesSkeleton() {
  return (
    <SkeletonSurface label="Loading themes">
      <div className={styles.grid}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.card} style={{ gap: 14 }}>
            <Skeleton width="40%" height={11} />
            <Skeleton width="85%" height={18} />
            <Skeleton width="100%" height={11} />
            <Skeleton width="70%" height={11} />
            <div className={styles.stats}>
              <Skeleton height={28} />
              <Skeleton height={28} />
              <Skeleton height={28} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonSurface>
  );
}

export default function ThemesPage() {
  const { data, dataAsOf, error, loading, refresh } = useThemes();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const area = params.get('area') ?? '';
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'arr';

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    let list = data ?? [];
    if (type) list = list.filter((t) => t.type === type);
    if (area) list = list.filter((t) => t.productArea === area);
    if (status) list = list.filter((t) => t.status === status);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter((t) => `${t.name} ${t.summary}`.toLowerCase().includes(s));
    }
    const by: Record<SortKey, (a: Theme, b: Theme) => number> = {
      arr: (a, b) => b.arrUsd - a.arrUsd,
      insights: (a, b) => b.insightCount - a.insightCount,
      accounts: (a, b) => b.accountCount - a.accountCount,
      recent: (a, b) => b.lastSeen.localeCompare(a.lastSeen),
      trend: (a, b) => trendDelta(b) - trendDelta(a),
    };
    return [...list].sort(by[sort] ?? by.arr);
  }, [data, type, area, status, q, sort]);

  const total = data?.length ?? 0;
  const filtered = !!(type || area || status || q);

  return (
    <div className="sl-page">
      <AppPageHeader title="Themes" dataAsOf={dataAsOf} />
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Filter themes">
          <SearchInput
            size="sm"
            placeholder="Search themes"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParam('q', e.target.value)}
            style={{ width: 220 }}
            aria-label="Search themes"
          />
          <Select size="sm" aria-label="Type" value={type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('type', e.target.value)} options={[{ value: '', label: 'All types' }, ...INSIGHT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
          <Select size="sm" aria-label="Product area" value={area} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('area', e.target.value)} options={[{ value: '', label: 'All areas' }, ...PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))]} />
          <Select size="sm" aria-label="Status" value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('status', e.target.value)} options={[{ value: '', label: 'All statuses' }, ...(['candidate', 'active', 'on_roadmap', 'shipped'] as const).map((s) => ({ value: s, label: THEME_STATUS_LABEL[s] }))]} />
          <Select size="sm" aria-label="Sort" value={sort} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParam('sort', e.target.value)} options={SORTS} />
        </div>
        {data ? (
          <span className={styles.summary}>
            {rows.length === total ? `${total} themes` : `${rows.length} of ${total} themes`} · membership is deterministic (embeddings); a model only names them
          </span>
        ) : null}
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={refresh} what="themes" />
      ) : loading ? (
        <ThemesSkeleton />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState variant="no-data" title="No themes match these filters" description="Clear a filter to see more. Filters live in the URL, so this view is shareable." />
        ) : (
          <EmptyState variant="not-yet-collected" title="No themes yet" description="Themes form once two or more grounded insights land near each other. Run a call from New call to start one." />
        )
      ) : (
        <div className={styles.grid} {...tourAnchor('themes.list')}>
          {rows.map((t) => (
            <ThemeCard key={t.id} theme={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeCard({ theme: t }: { theme: Theme }) {
  const values = t.weekly.map((w) => w.count);
  const delta = trendDelta(t);
  const last = values[values.length - 1] ?? 0;
  return (
    <Link to={`/app/themes/${encodeURIComponent(t.id)}`} className={styles.card} {...(isC1042Theme(t) ? tourAnchor('theme.c1042') : {})} aria-label={`${t.name}: ${t.insightCount} insights, ${t.accountCount} accounts, ${money(t.arrUsd, { compact: true })} ARR at stake`}>
      <div className={styles.cardTop}>
        <TypeTag type={t.type} />
        <StatusChip tone={THEME_STATUS_TONE[t.status]} size="sm">
          {THEME_STATUS_LABEL[t.status]}
        </StatusChip>
      </div>
      <div>
        <h3 className={styles.name}>{t.name}</h3>
        <span className={styles.area}>{AREA_LABEL[t.productArea]}</span>
      </div>
      <p className={styles.summaryText}>{t.summary}</p>
      <div className={styles.spark}>
        <Sparkline values={values} width={150} height={28} label={`${t.name} insights per week, last 8 weeks`} bucketLabels={t.weekly.map((w) => w.week)} />
        <span className={styles.sparkLabel}>
          {last} this week · {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : 'flat'} vs last
        </span>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Insights</span>
          <span className={styles.statValue}>{t.insightCount.toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Accounts</span>
          <span className={styles.statValue}>{t.accountCount.toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ARR at stake</span>
          <span className={styles.statValue}>{money(t.arrUsd, { compact: true })}</span>
        </div>
      </div>
    </Link>
  );
}
