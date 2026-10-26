/**
 * Themes: similar feedback from different customers, grouped into one pattern, with the ARR
 * behind it and its trend. Filters and sort live in the URL so a view can be shared.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Theme } from '../../shared/contracts';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, Card, CellText, EmptyState, Page, PageHeader, SearchInput, Segmented, Select, SortTh, Table, TableSkeleton, Toolbar, type SortDir, type Tone } from '../../ds';
import { IconLayers } from '../../ds/icons';
import { useThemes } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, TypeLabel, When } from '../components/domain';
import { AREA_LABEL, TYPE_LABEL, money } from '../lib/labels';
import { TrendBars } from './themes/TrendBars';
import styles from './themes/themes.module.css';

export const THEME_STATUSES = ['candidate', 'active', 'on_roadmap', 'shipped'] as const;
export const THEME_STATUS_LABEL: Record<Theme['status'], string> = {
  candidate: 'Candidate',
  active: 'Active',
  on_roadmap: 'On roadmap',
  shipped: 'Shipped',
};
export const THEME_STATUS_TONE: Record<Theme['status'], Tone> = {
  candidate: 'neutral',
  active: 'info',
  on_roadmap: 'accent',
  shipped: 'success',
};

export function ThemeStatusBadge({ status }: { status: Theme['status'] }) {
  return (
    <Badge tone={THEME_STATUS_TONE[status]} dot>
      {THEME_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * The theme the C-1042 walkthrough insight joins (by id, or by name for real data). Mirrors
 * isSpotlitTheme in src/tour/script/copy.ts: the copy and the spotlight must name the same one.
 */
export function isC1042Theme(t: Pick<Theme, 'id' | 'name'>): boolean {
  return t.id === 'thm_offline_conv' || /offline conversions/i.test(t.name);
}

type StatusFilter = 'all' | Theme['status'];
type SortKey = 'arr' | 'insights' | 'accounts' | 'recent';
const PAGE = 25;

export default function ThemesPage() {
  useDocumentTitle('Themes');
  const themes = useThemes();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const area = params.get('area') ?? '';
  const rawStatus = params.get('status');
  const status: StatusFilter = (THEME_STATUSES as readonly string[]).includes(rawStatus ?? '') ? (rawStatus as Theme['status']) : 'all';
  const q = params.get('q') ?? '';
  const sortKey: SortKey = (['arr', 'insights', 'accounts', 'recent'] as const).find((k) => k === params.get('sort')) ?? 'arr';
  const sortDir: SortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  const [limit, setLimit] = useState(PAGE);
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const sortBy = (k: SortKey) => {
    const next = new URLSearchParams(params);
    next.set('sort', k);
    next.set('dir', sortKey === k && sortDir === 'desc' ? 'asc' : 'desc');
    setParams(next, { replace: true });
  };
  const sortState = (k: SortKey) => (sortKey === k ? sortDir : null);

  const all = themes.data ?? [];
  // The walkthrough spotlights the first matching theme in API order, the same one its copy names.
  const spotlitId = useMemo(() => all.find(isC1042Theme)?.id ?? null, [all]);

  const searched = useMemo(
    () =>
      all.filter((t) => {
        if (type && t.type !== type) return false;
        if (area && t.productArea !== area) return false;
        if (q && !`${t.name} ${t.summary}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [all, type, area, q],
  );
  const rows = useMemo(() => {
    const s = sortDir === 'asc' ? 1 : -1;
    const by: Record<SortKey, (a: Theme, b: Theme) => number> = {
      arr: (a, b) => a.arrUsd - b.arrUsd,
      insights: (a, b) => a.insightCount - b.insightCount,
      accounts: (a, b) => a.accountCount - b.accountCount,
      recent: (a, b) => a.lastSeen.localeCompare(b.lastSeen),
    };
    return searched.filter((t) => status === 'all' || t.status === status).sort((a, b) => s * by[sortKey](a, b));
  }, [searched, status, sortKey, sortDir]);
  const count = (f: StatusFilter) => searched.filter((t) => f === 'all' || t.status === f).length;
  const filtered = !!(type || area || q || status !== 'all');
  // Show a page at a time, always far enough to include the theme the walkthrough spotlights.
  const spotIndex = rows.findIndex((t) => t.id === spotlitId);
  const visible = rows.slice(0, Math.max(limit, spotIndex + 1));

  return (
    <Page>
      <PageHeader title="Themes" description="Similar feedback from different customers, grouped into one pattern with the ARR behind it." />

      <Toolbar
        start={
          <>
            <SearchInput placeholder="Search themes" value={q} onChange={(e) => setParam('q', e.target.value || null)} aria-label="Search themes" width={240} />
            <Select
              aria-label="Type"
              value={type}
              onChange={(e) => setParam('type', e.target.value || null)}
              options={[
                { value: '', label: 'All types' },
                ...INSIGHT_TYPES.map((t) => ({
                  value: t,
                  label: TYPE_LABEL[t],
                })),
              ]}
              style={{ width: 172 }}
            />
            <Select
              aria-label="Product area"
              value={area}
              onChange={(e) => setParam('area', e.target.value || null)}
              options={[
                { value: '', label: 'All product areas' },
                ...PRODUCT_AREAS.map((a) => ({
                  value: a,
                  label: AREA_LABEL[a],
                })),
              ]}
              style={{ width: 196 }}
            />
          </>
        }
        end={
          <Segmented<StatusFilter>
            label="Filter by status"
            value={status}
            onChange={(v) => setParam('status', v === 'all' ? null : v)}
            options={(['all', ...THEME_STATUSES] as StatusFilter[]).map((f) => ({
              value: f,
              label: f === 'all' ? 'All' : THEME_STATUS_LABEL[f],
              count: themes.data ? count(f) : null,
            }))}
          />
        }
      />

      {themes.loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : themes.error && !themes.data ? (
        <Card>
          <ErrorState error={themes.error} onRetry={() => void themes.refresh()} what="themes" />
        </Card>
      ) : (
        <Card
          flush
          attrs={tourAnchor('themes.list')}
          footer={
            rows.length > PAGE ? (
              <>
                <span>
                  Showing {visible.length} of {rows.length}
                </span>
                {visible.length < rows.length ? (
                  <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            filtered && all.length ? (
              <EmptyState
                icon={<IconLayers />}
                title="No themes match these filters"
                actions={
                  <Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={<IconLayers />} title="No themes yet" description="A theme forms once two or more customers say something similar. Bring in a few conversations to start one." />
            )
          ) : (
            <Table label="Themes" minWidth={1100}>
              <colgroup>
                <col />
                <col style={{ width: 164 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Theme</th>
                  <th>Type</th>
                  <SortTh active={sortState('insights')} onSort={() => sortBy('insights')} align="right">
                    Insights
                  </SortTh>
                  <SortTh active={sortState('accounts')} onSort={() => sortBy('accounts')} align="right">
                    Accounts
                  </SortTh>
                  <SortTh active={sortState('arr')} onSort={() => sortBy('arr')} align="right">
                    ARR at stake
                  </SortTh>
                  <th>Last 8 weeks</th>
                  <th>Status</th>
                  <SortTh active={sortState('recent')} onSort={() => sortBy('recent')} align="right">
                    Last seen
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const href = `/app/themes/${encodeURIComponent(t.id)}`;
                  return (
                    <tr key={t.id} className="is-clickable has-row-link" onClick={() => navigate(href)} {...(t.id === spotlitId ? tourAnchor('theme.c1042') : {})}>
                      <td style={{ maxWidth: 0 }}>
                        <Link to={href} className="ds-table__link" onClick={(e) => e.stopPropagation()} title={t.name}>
                          <CellText primary={t.name} secondary={AREA_LABEL[t.productArea]} />
                        </Link>
                      </td>
                      <td>
                        <TypeLabel type={t.type} />
                      </td>
                      <td className="is-num">{t.insightCount.toLocaleString()}</td>
                      <td className="is-num">{t.accountCount.toLocaleString()}</td>
                      <td className="is-num">{money(t.arrUsd, { compact: true })}</td>
                      <td>
                        <TrendBars weekly={t.weekly} name={t.name} />
                      </td>
                      <td>
                        <ThemeStatusBadge status={t.status} />
                      </td>
                      <td className="is-num ds-muted">
                        <When value={t.lastSeen} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </Page>
  );
}
