/**
 * Conversations: everything brought into the workspace, whatever it is and wherever it came
 * from, with what Signal Loop made of it. Filters live in the URL.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Run } from '../../shared/contracts';
import { Button, ButtonLink, Card, CellText, EmptyState, Page, PageHeader, SearchInput, Segmented, Select, SortTh, Table, TableSkeleton, Toolbar, type SortDir } from '../../ds';
import { IconInbox, IconPlus } from '../../ds/icons';
import { useRuns } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { docKindLabel, ErrorState, ModeBadge, RUN_STATUS_LABEL, RunStatusBadge, SourceLabel, sourceLabel, When } from '../components/domain';
import { money, ms } from '../lib/labels';
import { useWorldIndex } from '../lib/world';

type Filter = 'all' | 'running' | 'awaiting_review' | 'completed' | 'failed';
const FILTERS: Filter[] = ['all', 'running', 'awaiting_review', 'completed', 'failed'];
type SortKey = 'name' | 'account' | 'cost' | 'duration' | 'created';
const PAGE = 25;

const inProgress = (r: Run) => r.status === 'queued' || r.status === 'running';

function Result({ run }: { run: Run }) {
  if (inProgress(run)) return <span className="ds-subtle">In progress</span>;
  if (run.status === 'failed') return <span className="ds-subtle">No result</span>;
  if (run.actionable === false) return <span className="ds-subtle">Nothing actionable</span>;
  if (run.insightCount === 0) return <span className="ds-subtle">No insights</span>;
  return (
    <CellText
      primary={`${run.insightCount} insight${run.insightCount === 1 ? '' : 's'}`}
      secondary={run.reviewCount ? `${run.reviewCount} to review` : run.droppedCount ? `${run.droppedCount} unproven quote${run.droppedCount === 1 ? '' : 's'} dropped` : 'All sent'}
    />
  );
}

export default function RunsPage() {
  useDocumentTitle('Conversations');
  const runs = useRuns();
  const world = useWorldIndex();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);

  const raw = params.get('status');
  const filter: Filter = FILTERS.includes(raw as Filter) ? (raw as Filter) : 'all';
  const q = params.get('q') ?? '';
  const source = params.get('source') ?? '';
  const sortKey = (params.get('sort') as SortKey | null) ?? 'created';
  const sortDir: SortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const sortBy = (k: SortKey) => {
    const next = new URLSearchParams(params);
    const dir = sortKey === k && sortDir === 'desc' ? 'asc' : 'desc';
    next.set('sort', k);
    next.set('dir', dir);
    setParams(next, { replace: true });
  };

  const all = runs.data ?? [];
  const sources = useMemo(() => [...new Set(all.map((r) => r.source ?? 'upload'))].sort(), [all]);
  const matchesStatus = (r: Run, f: Filter) => (f === 'all' ? true : f === 'running' ? inProgress(r) : r.status === f);
  const searched = all.filter((r) => {
    if (source && (r.source ?? 'upload') !== source) return false;
    if (!q) return true;
    const hay = `${r.filename} ${world.accountName(r.accountId)} ${r.callId ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const rows = searched
    .filter((r) => matchesStatus(r, filter))
    .sort((a, b) => {
      const s = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return s * a.filename.localeCompare(b.filename);
        case 'account':
          return s * world.accountName(a.accountId).localeCompare(world.accountName(b.accountId));
        case 'cost':
          return s * (a.costUsd - b.costUsd);
        case 'duration':
          return s * ((a.durationMs ?? 0) - (b.durationMs ?? 0));
        default:
          return s * a.createdAt.localeCompare(b.createdAt);
      }
    });
  const visible = rows.slice(0, limit);
  const count = (f: Filter) => searched.filter((r) => matchesStatus(r, f)).length;
  const sortState = (k: SortKey) => (sortKey === k ? sortDir : null);

  return (
    <Page>
      <PageHeader
        title="Conversations"
        description="Calls, meeting notes, email threads, chats and documents brought into this workspace, and what Signal Loop found in each."
        actions={
          <ButtonLink to="/app/new" variant="primary" icon={<IconPlus />}>
            New conversation
          </ButtonLink>
        }
      />

      <Toolbar
        start={
          <>
            <SearchInput placeholder="Search by file or account" value={q} onChange={(e) => setParam('q', e.target.value || null)} aria-label="Search conversations" width={280} />
            <Select
              aria-label="Filter by source"
              value={source}
              onChange={(e) => setParam('source', e.target.value || null)}
              options={[{ value: '', label: 'All sources' }, ...sources.map((s) => ({ value: s, label: sourceLabel(s) }))]}
              style={{ width: 160 }}
            />
          </>
        }
        end={
          <Segmented<Filter>
            label="Filter by status"
            value={filter}
            onChange={(v) => setParam('status', v === 'all' ? null : v)}
            options={FILTERS.map((f) => ({ value: f, label: f === 'all' ? 'All' : RUN_STATUS_LABEL[f], count: runs.data ? count(f) : null }))}
          />
        }
      />

      {runs.loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : runs.error && !runs.data ? (
        <Card>
          <ErrorState error={runs.error} onRetry={() => void runs.refresh()} what="conversations" />
        </Card>
      ) : (
        <Card flush footer={rows.length > PAGE ? <PagerFooter shown={visible.length} total={rows.length} onMore={() => setLimit((l) => l + PAGE)} /> : undefined}>
          {rows.length === 0 ? (
            all.length === 0 ? (
              <EmptyState
                icon={<IconInbox />}
                title="No conversations yet"
                description="Bring in a call, paste meeting notes or upload any document. Signal Loop reads it and sends what matters to the right people."
                actions={
                  <ButtonLink to="/app/new" variant="primary" size="sm" icon={<IconPlus size={14} />}>
                    New conversation
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                icon={<IconInbox />}
                title="Nothing matches these filters"
                actions={
                  <Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <Table label="Conversations" minWidth={920}>
              <thead>
                <tr>
                  <SortTh active={sortState('name')} onSort={() => sortBy('name')}>
                    Conversation
                  </SortTh>
                  <SortTh active={sortState('account')} onSort={() => sortBy('account')}>
                    Account
                  </SortTh>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Signal Loop</th>
                  <SortTh active={sortState('cost')} onSort={() => sortBy('cost')} align="right">
                    AI cost
                  </SortTh>
                  <SortTh active={sortState('duration')} onSort={() => sortBy('duration')} align="right">
                    Took
                  </SortTh>
                  <SortTh active={sortState('created')} onSort={() => sortBy('created')} align="right">
                    Received
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const kind = docKindLabel(r.docKind);
                  const fmt = (r.sourceFormat ?? r.filename.split('.').pop() ?? '').toUpperCase();
                  return (
                    <tr key={r.id} className="is-clickable has-row-link" onClick={() => navigate(`/app/runs/${r.id}`)}>
                      <td style={{ maxWidth: 320 }}>
                        <Link to={`/app/runs/${r.id}`} className="ds-table__link" onClick={(e) => e.stopPropagation()}>
                          <CellText primary={r.filename} secondary={[kind, fmt && fmt.length <= 5 ? fmt : null].filter(Boolean).join(', ') || 'Conversation'} />
                        </Link>
                      </td>
                      <td className="is-nowrap">
                        <CellText primary={r.accountId ? world.accountName(r.accountId) : <span className="ds-subtle">No account</span>} secondary={r.callId ?? undefined} />
                      </td>
                      <td className="is-nowrap">
                        <SourceLabel source={r.source} />
                      </td>
                      <td className="is-nowrap">
                        <span className="ds-row" style={{ gap: 8 }}>
                          <RunStatusBadge status={r.status} />
                          {r.mode === 'replay' ? <ModeBadge run={r} /> : null}
                        </span>
                      </td>
                      <td className="is-nowrap">
                        <Result run={r} />
                      </td>
                      <td className="is-num">{inProgress(r) ? '—' : money(r.costUsd, { precise: true })}</td>
                      <td className="is-num">{inProgress(r) ? '—' : ms(r.durationMs)}</td>
                      <td className="is-num ds-muted">
                        <When value={r.createdAt} />
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

function PagerFooter({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <>
      <span>
        Showing {shown} of {total}
      </span>
      {shown < total ? (
        <Button size="sm" variant="ghost" onClick={onMore}>
          Show more
        </Button>
      ) : null}
    </>
  );
}
