/**
 * Overview: the platform at a glance. What came in (any kind, any source), what Signal Loop made
 * of it, where results went and who was tagged, and what needs a person now.
 */
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CHANNEL_CONNECTOR, CHANNEL_LABEL, connectorById, DOC_KIND_LABEL, type DocKind, type RoutableChannel } from '../../shared/platform';
import { Badge, ButtonLink, Card, CellText, ConnectorMark, EmptyState, Grid, Meter, Page, PageHeader, Segmented, Skeleton, Stats, Table } from '../../ds';
import { IconArrowRight, IconCheckCircle, IconPlug, IconPlus } from '../../ds/icons';
import { useConnections, useOverview, useReviewQueue, useRules, useRuns } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, RunStatusBadge, SIMULATED_TIP, SimulatedBadge, sourceLabel, TypeLabel, When } from '../components/domain';
import { useWorldIndex } from '../lib/world';
import styles from './overview/overview.module.css';

type Window = '7' | '30' | '90';

function BarList({ rows, label }: { rows: { key: string; label: ReactNode; count: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <EmptyState compact title="Nothing yet" />;
  return (
    <ul className={styles.barList} aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={styles.barRow}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack}>
            <Meter value={r.count} max={max} label={`${typeof r.label === 'string' ? r.label : r.key}: ${r.count}`} />
          </span>
          <span className={styles.barValue}>{r.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OverviewPage() {
  useDocumentTitle('Overview');
  const [params, setParams] = useSearchParams();
  const win = (['7', '30', '90'].includes(params.get('days') ?? '') ? params.get('days') : '30') as Window;
  const overview = useOverview(Number(win));
  const review = useReviewQueue();
  const runs = useRuns();
  const conns = useConnections();
  const rules = useRules();
  const world = useWorldIndex();
  const navigate = useNavigate();

  const o = overview.data;
  const delta = o && o.conversationsPrev > 0 ? Math.round(((o.conversations - o.conversationsPrev) / o.conversationsPrev) * 100) : null;
  const disconnectedInUse = (conns.data ?? []).filter((c) => c.status !== 'connected' && (rules.data ?? []).some((r) => r.enabled && CHANNEL_CONNECTOR[r.channel as RoutableChannel] === c.id));
  const recent = (runs.data ?? []).slice(0, 6);

  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Conversations in, the right people out. Here’s what happened in this workspace."
        actions={
          <>
            <Segmented<Window>
              label="Time window"
              value={win}
              onChange={(v) => {
                const next = new URLSearchParams(params);
                if (v === '30') next.delete('days');
                else next.set('days', v);
                setParams(next, { replace: true });
              }}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
            />
            <ButtonLink to="/app/new" variant="primary" icon={<IconPlus />}>
              New conversation
            </ButtonLink>
          </>
        }
      />

      {overview.loading ? (
        <div className="ds-stats" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ds-stat">
              <Skeleton width={120} height={10} />
              <Skeleton width={80} height={24} />
            </div>
          ))}
        </div>
      ) : overview.error && !o ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => void overview.refresh()} what="the overview" />
        </Card>
      ) : o ? (
        <Stats
          items={[
            {
              label: 'Conversations',
              value: o.conversations.toLocaleString(),
              delta: delta != null && delta !== 0 ? { value: `${Math.abs(delta)}%`, direction: delta > 0 ? 'up' : 'down', good: delta > 0 } : null,
              sub: `vs the previous ${o.window.days} days`,
            },
            { label: 'Results delivered', value: o.deliveries.toLocaleString(), sub: `to ${o.peopleTagged} ${o.peopleTagged === 1 ? 'person' : 'people'}` },
            { label: 'Waiting for review', value: o.awaitingReview.toLocaleString(), sub: o.awaitingReview ? <Link to="/app/review">Open the queue</Link> : 'Nothing waiting' },
            { label: 'Time to owner', value: o.medianMinutesToOwner != null ? o.medianMinutesToOwner.toLocaleString() : '—', unit: o.medianMinutesToOwner != null ? 'min' : undefined, sub: 'Median, from arrival' },
          ]}
        />
      ) : null}

      {disconnectedInUse.length ? (
        <div className={styles.alert} role="status">
          <IconPlug />
          <span>
            {disconnectedInUse.map((c) => connectorById(c.id)?.name).join(', ')} {disconnectedInUse.length === 1 ? 'isn’t' : 'aren’t'} connected, so rules that send there route to triage.
          </span>
          <ButtonLink to="/app/connections" size="sm">
            Connections
          </ButtonLink>
        </div>
      ) : null}

      <Grid cols={3}>
        <Card title="What came in" description="By what the decision model says each one is.">
          {o ? (
            <BarList label="Conversations by kind" rows={o.byKind.map((k) => ({ key: k.kind, label: DOC_KIND_LABEL[k.kind as DocKind] ?? k.kind, count: k.count }))} />
          ) : (
            <Skeleton height={120} />
          )}
        </Card>
        <Card title="Where it came from" description={<SimulatedBadge tip={SIMULATED_TIP.overviewSources} />} actions={<ButtonLink to="/app/connections" size="sm" variant="ghost" iconRight={<IconArrowRight size={14} />}>Connections</ButtonLink>}>
          {o ? (
            <BarList
              label="Conversations by source"
              rows={o.bySource.map((s) => ({
                key: s.source,
                label: (
                  <span className="ds-row" style={{ gap: 8 }}>
                    <ConnectorMark id={s.source} size={16} />
                    <span className="ds-truncate">{sourceLabel(s.source)}</span>
                  </span>
                ),
                count: s.count,
              }))}
            />
          ) : (
            <Skeleton height={120} />
          )}
        </Card>
        <Card title="Where results went" description={<SimulatedBadge tip={SIMULATED_TIP.overviewResults} />} actions={<ButtonLink to="/app/destinations" size="sm" variant="ghost" iconRight={<IconArrowRight size={14} />}>Deliveries</ButtonLink>}>
          {o ? (
            <BarList
              label="Deliveries by tool"
              rows={o.byConnector.map((c) => ({
                key: c.connectorId,
                label: (
                  <span className="ds-row" style={{ gap: 8 }}>
                    <ConnectorMark id={c.connectorId} size={16} />
                    <span className="ds-truncate">{c.connectorId === 'triage' ? CHANNEL_LABEL.triage : connectorById(c.connectorId)?.name ?? c.connectorId}</span>
                  </span>
                ),
                count: c.count,
              }))}
            />
          ) : (
            <Skeleton height={120} />
          )}
        </Card>
      </Grid>

      <Grid cols="sidebar">
        <Card
          title="Recent conversations"
          actions={
            <ButtonLink to="/app/runs" size="sm" variant="ghost" iconRight={<IconArrowRight size={14} />}>
              View all
            </ButtonLink>
          }
          flush
        >
          {runs.loading ? (
            <div style={{ padding: 20 }}>
              <Skeleton height={140} />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState compact title="No conversations yet" actions={<ButtonLink to="/app/new" size="sm" variant="primary">New conversation</ButtonLink>} />
          ) : (
            <Table label="Recent conversations" compact minWidth={560}>
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Status</th>
                  <th className="is-num">Received</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="is-clickable" onClick={() => navigate(`/app/runs/${r.id}`)}>
                    <td style={{ maxWidth: 360 }}>
                      <Link to={`/app/runs/${r.id}`} className="ds-table__link" onClick={(e) => e.stopPropagation()}>
                        <CellText primary={r.filename} secondary={r.accountId ? world.accountName(r.accountId) : 'No account'} />
                      </Link>
                    </td>
                    <td className="is-nowrap">
                      <RunStatusBadge status={r.status} />
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

        <Card
          title="Needs a person"
          actions={
            review.data?.length ? (
              <ButtonLink to="/app/review" size="sm" variant="ghost" iconRight={<IconArrowRight size={14} />}>
                Review
              </ButtonLink>
            ) : undefined
          }
          flush
        >
          {review.loading ? (
            <div style={{ padding: 20 }}>
              <Skeleton height={120} />
            </div>
          ) : !review.data?.length ? (
            <EmptyState compact icon={<IconCheckCircle />} title="All caught up" description="Nothing is waiting for review." />
          ) : (
            <ul className="ds-list">
              {review.data.slice(0, 4).map((i) => (
                <li key={i.id}>
                  <Link to={`/app/review/${i.id}`} className={`ds-list__item ${styles.reviewItem}`}>
                    <span className={styles.reviewText}>
                      <TypeLabel type={i.type} />
                      <span className={styles.reviewSummary}>{i.summary}</span>
                      <span className={styles.reviewMeta}>{world.accountName(i.accountId)}</span>
                    </span>
                    {i.severity === 'critical' || i.severity === 'high' ? <Badge tone={i.severity === 'critical' ? 'danger' : 'warning'}>{i.severity === 'critical' ? 'Critical' : 'High'}</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>
    </Page>
  );
}

