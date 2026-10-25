import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Run } from '../../shared/contracts';
import { Button } from '../../system/components/primitives/Button.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { EmptyState } from '../../uis/EmptyState';
import { MonoId } from '../../uis/MonoId';
import { RelativeTime } from '../../uis/RelativeTime';
import { SegmentedControl } from '../../uis/SegmentedControl';
import { PageHeaderSkeleton, SkeletonSurface, TableSkeleton } from '../../uis/Skeleton';
import { StatusChip } from '../../uis/StatusChip';
import { useRuns } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel } from '../components/ui';
import { money, ms } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { ModeChip, RUN_STATUS_LABEL, RUN_STATUS_TONE } from './runs/runChips';

type Filter = 'all' | Run['status'];
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export default function RunsPage() {
  const runs = useRuns();
  const world = useWorldIndex();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const filter: Filter = FILTERS.some((f) => f.value === raw) ? (raw as Filter) : 'all';

  if (runs.loading) {
    return (
      <SkeletonSurface label="Loading runs">
        <PageHeaderSkeleton />
        <TableSkeleton rows={8} columns={7} />
      </SkeletonSurface>
    );
  }

  const all = runs.data ?? [];
  const rows = filter === 'all' ? all : all.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((r) => r.status === f).length);

  const columns: DataTableColumn<Run>[] = [
    {
      key: 'file',
      header: 'File',
      sortable: true,
      sortValue: (r) => r.filename.toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 200, maxWidth: 340 }}>
          <Link to={`/app/runs/${r.id}`} className="sl-quietlink sl-cell-title sl-ellipsis" style={{ display: 'block' }} title={r.filename}>
            {r.filename}
          </Link>
          <div className="sl-cell-sub">
            <MonoId value={r.id} keep={6} />
          </div>
        </div>
      ),
    },
    {
      key: 'account',
      header: 'Account',
      sortable: true,
      sortValue: (r) => world.accountName(r.accountId),
      render: (r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div className="sl-cell-title">{r.accountId ? world.accountName(r.accountId) : 'Pasted text'}</div>
          {r.callId ? <div className="sl-cell-sub sl-mono">{r.callId}</div> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => (
        <StatusChip tone={RUN_STATUS_TONE[r.status]} size="sm" pulse={r.status === 'running' || r.status === 'queued'}>
          {RUN_STATUS_LABEL[r.status]}
        </StatusChip>
      ),
    },
    { key: 'mode', header: 'Mode', render: (r) => <ModeChip run={r} /> },
    {
      key: 'insights',
      header: 'Insights',
      sortable: true,
      sortValue: (r) => r.insightCount,
      render: (r) =>
        r.status === 'queued' || r.status === 'running' ? (
          <span className="sl-meta" style={{ whiteSpace: 'nowrap' }}>In progress</span>
        ) : r.actionable === false ? (
          <span className="sl-meta" style={{ whiteSpace: 'nowrap' }}>Nothing actionable</span>
        ) : (
          <span className="sl-num" style={{ whiteSpace: 'nowrap' }} title={`${r.insightCount} kept · ${r.droppedCount} dropped (ungrounded) · ${r.reviewCount} sent to review`}>
            {r.insightCount} kept
            <span className="sl-subtle">
              {' '}
              · {r.droppedCount} dropped · {r.reviewCount} review
            </span>
          </span>
        ),
    },
    {
      key: 'cost',
      header: 'Cost',
      sortable: true,
      sortValue: (r) => r.costUsd,
      render: (r) => <span className="sl-mono">{money(r.costUsd, { precise: true })}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      sortValue: (r) => r.durationMs ?? 0,
      render: (r) => <span className="sl-mono">{ms(r.durationMs)}</span>,
    },
    {
      key: 'created',
      header: 'Started',
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => <RelativeTime value={r.createdAt} />,
    },
  ];

  return (
    <div className="sl-page">
      <AppPageHeader
        title="Runs"
        dataAsOf={runs.dataAsOf}
        actions={
          <Button size="sm" iconLeft="plus" onClick={() => navigate('/app/new')}>
            New call
          </Button>
        }
      />
      {runs.error && !runs.data ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refresh()} what="runs" />
      ) : (
        <Panel
          title="Pipeline runs"
          sub="Every file that went through the 10-step pipeline in this workspace, plus seeded history. Open one for its steps, evidence and trace."
          actions={
            <SegmentedControl<Filter>
              ariaLabel="Filter runs by status"
              size="sm"
              value={filter}
              options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} · ${count(f.value)}` }))}
              onChange={(v) => {
                const next = new URLSearchParams(params);
                if (v === 'all') next.delete('status');
                else next.set('status', v);
                setParams(next, { replace: true });
              }}
            />
          }
          flush
        >
          <DataTable<Run>
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            pagination="when-needed"
            initialSort={{ key: 'created', direction: 'desc' }}
            rowTone={(r) => (r.status === 'failed' ? 'red' : null)}
            caption="Pipeline runs"
            empty={
              all.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  title="No runs yet"
                  description="Bring in a call from the library, paste notes or drop a file to run the pipeline."
                  action={
                    <Button size="sm" onClick={() => navigate('/app/new')}>
                      New call
                    </Button>
                  }
                />
              ) : (
                <EmptyState variant="no-data" title="No runs with this status" description="Try another status filter." />
              )
            }
          />
        </Panel>
      )}
    </div>
  );
}
