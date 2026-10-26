/**
 * Insights: every insight Signal Loop found and where it went. Search, type, product area,
 * status and account filters live in the URL. A row opens the insight drawer at
 * /app/insights/:id with the filters kept.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INSIGHT_TYPES, PRODUCT_AREAS, type Insight, type InsightStatus } from '../../shared/contracts';
import { Avatar, Button, ButtonLink, Card, CellText, cx, EmptyState, Page, PageHeader, SearchInput, Select, SortTh, Table, TableSkeleton, Toolbar, type SortDir } from '../../ds';
import { IconPlus, IconSparkle } from '../../ds/icons';
import { api } from '../api/client';
import { keys, useQuery } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, InsightStatusBadge, SeverityBadge, TypeLabel, When } from '../components/domain';
import { InsightDrawer } from '../components/InsightDrawer';
import { AREA_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './insights/Insights.module.css';

const STATUSES: InsightStatus[] = ['pending_review', 'routed', 'held', 'rejected', 'dropped_ungrounded'];
const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
type SortKey = 'type' | 'severity' | 'score' | 'created';
const SORT_KEYS: SortKey[] = ['type', 'severity', 'score', 'created'];
const PAGE = 25;

export default function InsightsPage() {
  useDocumentTitle('Insights');
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const world = useWorldIndex();
  const type = sp.get('type') ?? '';
  const area = sp.get('area') ?? '';
  const status = sp.get('status') ?? '';
  const account = sp.get('account') ?? '';
  const q = sp.get('q') ?? '';
  const rawSort = sp.get('sort') as SortKey | null;
  const sortKey: SortKey = rawSort && SORT_KEYS.includes(rawSort) ? rawSort : 'created';
  const sortDir: SortDir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  const [text, setText] = useState(q);
  const [limit, setLimit] = useState(PAGE);
  const opener = useRef<string | null>(null);

  useEffect(() => setText(q), [q]);

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(sp);
      if (v) next.set(k, v);
      else next.delete(k);
      setSp(next, { replace: true });
      setLimit(PAGE);
    },
    [sp, setSp],
  );

  // Debounce the search into the URL.
  useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => {
      setParam('q', text.trim());
      if (text.trim()) track('search', { surface: 'insights', length: text.trim().length });
    }, 300);
    return () => window.clearTimeout(t);
  }, [text, q, setParam]);

  const sortBy = (k: SortKey) => {
    const next = new URLSearchParams(sp);
    next.set('sort', k);
    next.set('dir', sortKey === k && sortDir === 'desc' ? 'asc' : 'desc');
    setSp(next, { replace: true });
  };
  const sortState = (k: SortKey) => (sortKey === k ? sortDir : null);

  const baseQs = new URLSearchParams(Object.entries({ type, area, account, q }).filter(([, v]) => v)).toString();
  const filtered = useQuery(keys.insights(baseQs), () => api.insights({ type, area, account, q }), { pollMs: 15_000 });
  const all = useQuery(keys.insights(''), () => api.insights(), { pollMs: 15_000 });

  // Keep the last result on screen while a new filter loads, instead of flashing a skeleton.
  const last = useRef<Insight[] | undefined>(undefined);
  if (filtered.data) last.current = filtered.data;
  const shown = filtered.data ?? last.current;
  const pending = !filtered.data && !!last.current && !filtered.error;
  const base = useMemo(() => shown ?? [], [shown]);
  const rows = useMemo(() => {
    const s = sortDir === 'asc' ? 1 : -1;
    return (status ? base.filter((i) => i.status === status) : base).slice().sort((a, b) => {
      switch (sortKey) {
        case 'type':
          return s * TYPE_LABEL[a.type].localeCompare(TYPE_LABEL[b.type]);
        case 'severity':
          return s * (SEV_RANK[a.severity] - SEV_RANK[b.severity]);
        case 'score':
          return s * (a.confidenceFinal - b.confidenceFinal);
        default:
          return s * a.createdAt.localeCompare(b.createdAt);
      }
    });
  }, [base, status, sortKey, sortDir]);
  const visible = rows.slice(0, limit);
  const total = all.data?.length ?? null;
  const anyFilter = !!(type || area || status || account || q);

  const searchSuffix = sp.toString() ? `?${sp.toString()}` : '';
  const open = (ins: Insight) => {
    opener.current = ins.id;
    navigate({ pathname: `/app/insights/${ins.id}`, search: searchSuffix });
  };
  const close = useCallback(() => {
    const back = opener.current ?? id;
    navigate({ pathname: '/app/insights', search: sp.toString() ? `?${sp.toString()}` : '' }, { replace: true });
    window.setTimeout(() => {
      if (back) document.querySelector<HTMLElement>(`[data-insight-row="${back}"]`)?.focus();
    }, 30);
  }, [navigate, sp, id]);

  const clearFilters = () => {
    setText('');
    setSp(new URLSearchParams(), { replace: true });
    setLimit(PAGE);
  };

  const accounts = useMemo(() => [...world.accounts].sort((a, b) => a.name.localeCompare(b.name)), [world.accounts]);
  const err = filtered.error && !filtered.data ? filtered.error : null;

  return (
    <Page>
      <PageHeader
        title="Insights"
        description="Everything Signal Loop found in customer conversations, and where it went."
      />

      <Toolbar
        start={
          <>
            <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search insights" aria-label="Search insights" width={260} />
            <Select
              aria-label="Filter by type"
              value={type}
              onChange={(e) => setParam('type', e.target.value)}
              options={[{ value: '', label: 'All types' }, ...INSIGHT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]}
              className={styles.filter}
            />
            <Select
              aria-label="Filter by product area"
              value={area}
              onChange={(e) => setParam('area', e.target.value)}
              options={[{ value: '', label: 'All product areas' }, ...PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))]}
              className={styles.filter}
            />
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
              options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
              className={styles.filter}
            />
            <Select
              aria-label="Filter by account"
              value={account}
              onChange={(e) => setParam('account', e.target.value)}
              options={[{ value: '', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
              className={styles.filter}
            />
            {anyFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </>
        }
      />

      {!shown && !filtered.error ? (
        <TableSkeleton rows={8} cols={7} />
      ) : err ? (
        <Card>
          <ErrorState error={err} onRetry={() => void filtered.refresh()} what="insights" />
        </Card>
      ) : (
        <Card
          flush
          className={pending ? styles.pending : undefined}
          attrs={pending ? { 'aria-busy': 'true' } : undefined}
          footer={rows.length > 0 ? <PagerFooter shown={visible.length} matching={rows.length} total={anyFilter ? total : null} onMore={() => setLimit((l) => l + PAGE)} /> : undefined}
        >
          {rows.length === 0 ? (
            total === 0 ? (
              <EmptyState
                icon={<IconSparkle />}
                title="No insights yet"
                description="Bring in a conversation. Insights appear here as soon as their quotes are checked against it."
                actions={
                  <ButtonLink to="/app/new" variant="primary" size="sm" icon={<IconPlus size={14} />}>
                    New conversation
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                icon={<IconSparkle />}
                title="Nothing matches these filters"
                actions={
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <Table label="Insights" minWidth={980}>
              <thead>
                <tr>
                  <th>Insight</th>
                  <SortTh active={sortState('type')} onSort={() => sortBy('type')}>
                    Type
                  </SortTh>
                  <SortTh active={sortState('severity')} onSort={() => sortBy('severity')}>
                    Severity
                  </SortTh>
                  <th>Status</th>
                  <th>Owner</th>
                  <SortTh active={sortState('score')} onSort={() => sortBy('score')} align="right">
                    Score
                  </SortTh>
                  <SortTh active={sortState('created')} onSort={() => sortBy('created')} align="right">
                    Found
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={cx('is-clickable', 'has-row-link', r.id === id && 'is-selected')} onClick={() => open(r)}>
                    <td className={styles.insightCell}>
                      <Link
                        to={{ pathname: `/app/insights/${r.id}`, search: searchSuffix }}
                        className="ds-table__link"
                        data-insight-row={r.id}
                        title={r.summary}
                        onClick={(e) => {
                          e.stopPropagation();
                          opener.current = r.id;
                        }}
                      >
                        <CellText primary={r.summary} secondary={world.accountName(r.accountId)} />
                      </Link>
                    </td>
                    <td className="is-nowrap">
                      <TypeLabel type={r.type} />
                    </td>
                    <td className="is-nowrap">
                      <SeverityBadge severity={r.severity} />
                    </td>
                    <td className="is-nowrap">
                      <InsightStatusBadge status={r.status} />
                    </td>
                    <td className={styles.ownerCell}>
                      {r.ownerId ? (
                        <span className={styles.owner}>
                          <Avatar name={world.personName(r.ownerId)} initials={world.person(r.ownerId)?.initials} size="sm" />
                          <span className={styles.ownerName}>{world.personName(r.ownerId)}</span>
                        </span>
                      ) : (
                        <span className="ds-subtle">None</span>
                      )}
                    </td>
                    <td className="is-num" title={`AI confidence ${r.confidenceModel.toFixed(2)}, quote match ${r.groundingScore.toFixed(2)}`}>
                      {r.confidenceFinal.toFixed(2)}
                    </td>
                    <td className="is-num ds-muted">
                      <When value={r.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {id ? <InsightDrawer id={id} onClose={close} /> : null}
    </Page>
  );
}

/** "12 of 354 insights" when filtered, "Showing 25 of 120 insights" while paging. */
function PagerFooter({ shown, matching, total, onMore }: { shown: number; matching: number; total: number | null; onMore: () => void }) {
  const noun = (n: number) => `insight${n === 1 ? '' : 's'}`;
  const text = shown < matching ? `Showing ${shown} of ${matching} ${noun(matching)}` : total != null ? `${matching} of ${total} ${noun(total)}` : `${matching} ${noun(matching)}`;
  return (
    <>
      <span className={styles.count} aria-live="polite">
        {text}
      </span>
      {shown < matching ? (
        <Button size="sm" variant="ghost" onClick={onMore}>
          Show more
        </Button>
      ) : null}
    </>
  );
}
