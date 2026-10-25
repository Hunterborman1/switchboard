import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Account, Theme } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { MetricStrip } from '../../system/components/blocks/MetricStrip.jsx';
import { Button } from '../../system/components/primitives/Button.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { StatusChip } from '../../uis/StatusChip';
import { EmptyState } from '../../uis/EmptyState';
import { MonoId } from '../../uis/MonoId';
import { LineageGraph, deriveNodes, layoutNodes, type LineageEdgeRow } from '../../uis';
import { CardSkeleton, Skeleton, SkeletonSurface, TableSkeleton } from '../../uis/Skeleton';
import { useTheme } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel, TypeTag, WhyDisabled, useToast } from '../components/ui';
import { AREA_LABEL, TYPE_LABEL, dateShort, money, renewalIn } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { THEME_STATUS_LABEL, THEME_STATUS_TONE } from './Themes';
import styles from './themes/themes.module.css';

const HEALTH_TONE = { healthy: 'success', watch: 'warning', at_risk: 'danger' } as const;
const HEALTH_LABEL = { healthy: 'Healthy', watch: 'Watch', at_risk: 'At risk' } as const;

function weekLabel(week: string): string {
  const m = week.match(/W(\d+)/);
  return m ? `W${m[1]}` : week;
}

function DetailSkeleton() {
  return (
    <SkeletonSurface label="Loading theme">
      <div className="sl-stack-lg">
        <Skeleton width="45%" height={26} />
        <Skeleton width="70%" height={13} />
        <Skeleton height={78} />
        <div className={styles.detailGrid}>
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
        <TableSkeleton rows={5} columns={6} />
      </div>
    </SkeletonSurface>
  );
}

export default function ThemeDetailPage() {
  const { id = '' } = useParams();
  const { data, dataAsOf, error, loading, refresh } = useTheme(id);
  const world = useWorldIndex();
  const toast = useToast();
  const navigate = useNavigate();
  const [promoted, setPromoted] = useState(false);

  useEffect(() => {
    if (!id) return;
    emit({ name: 'theme.opened', themeId: id });
    track('theme_opened', { themeId: id });
  }, [id]);

  const theme: Theme | undefined = data?.theme ? { ...data.theme, status: promoted && data.theme.status !== 'shipped' ? 'on_roadmap' : data.theme.status } : undefined;

  const accounts = useMemo(() => [...(data?.accounts ?? [])].sort((a, b) => b.arrUsd - a.arrUsd), [data]);
  const insights = data?.insights ?? [];

  const lineage: LineageEdgeRow[] = useMemo(() => {
    if (!theme) return [];
    const themeRef = { externalIdentity: `theme:${theme.id}`, nodeKind: 'theme', displayLabel: theme.name, href: null, meta: `${theme.insightCount} insights` };
    const edges: LineageEdgeRow[] = [];
    const shown = insights.slice(0, 10);
    for (const ins of shown) {
      const acct = world.account(ins.accountId);
      const insRef = { externalIdentity: `insight:${ins.id}`, nodeKind: 'insight', displayLabel: ins.summary.length > 46 ? `${ins.summary.slice(0, 44)}…` : ins.summary, href: `/app/insights/${ins.id}`, meta: TYPE_LABEL[ins.type] };
      if (acct) {
        edges.push({
          lineageEdgeId: `a-${ins.id}`,
          fromNode: { externalIdentity: `account:${acct.id}`, nodeKind: 'account', displayLabel: acct.name, href: `/app/insights?account=${acct.id}`, meta: money(acct.arrUsd, { compact: true }) },
          toNode: insRef,
          relationshipKind: 'said',
          generationSource: 'account',
          active: true,
        });
      }
      edges.push({ lineageEdgeId: `m-${ins.id}`, fromNode: insRef, toNode: themeRef, relationshipKind: 'member_of', generationSource: 'membership', active: ins.status !== 'rejected' });
    }
    return edges;
  }, [theme, insights, world]);

  if (error && !data) return (
    <div className="sl-page">
      <AppPageHeader title="Theme" dataAsOf={dataAsOf} breadcrumbs={[{ label: 'Themes', href: '/app/themes' }]} />
      <ErrorState error={error} onRetry={refresh} what="this theme" />
    </div>
  );

  if (loading || !theme) return (
    <div className="sl-page">
      <AppPageHeader title="Theme" dataAsOf={dataAsOf} breadcrumbs={[{ label: 'Themes', href: '/app/themes' }]} />
      <DetailSkeleton />
    </div>
  );

  const owner = world.person(theme.ownerId);
  const canPromote = theme.status === 'candidate' || theme.status === 'active';
  const totalWeekly = theme.weekly.reduce((a, w) => a + w.count, 0);

  const columns: DataTableColumn<Account>[] = [
    {
      key: 'name',
      header: 'Account',
      sortable: true,
      sortValue: (a) => a.name,
      render: (a) => (
        <div>
          <Link className="sl-quietlink sl-cell-title" to={`/app/insights?account=${a.id}`}>{a.name}</Link>
          <div className="sl-cell-sub">{a.tier} · {a.vertical.replace('_', ' ')}</div>
        </div>
      ),
    },
    { key: 'arr', header: 'ARR', sortable: true, sortValue: (a) => a.arrUsd, render: (a) => <span className="sl-num">{money(a.arrUsd)}</span> },
    { key: 'renewal', header: 'Renewal', sortable: true, sortValue: (a) => a.renewalDate, render: (a) => <span className="sl-num">{renewalIn(a.renewalDate)}</span> },
    { key: 'health', header: 'Health', sortable: true, sortValue: (a) => ({ at_risk: 0, watch: 1, healthy: 2 })[a.health], render: (a) => <StatusChip tone={HEALTH_TONE[a.health]}>{HEALTH_LABEL[a.health]}</StatusChip> },
    { key: 'csm', header: 'CSM', sortable: true, sortValue: (a) => world.personName(a.csmId), render: (a) => world.personName(a.csmId) },
    { key: 'insights', header: 'Insights here', sortable: true, sortValue: (a) => insights.filter((i) => i.accountId === a.id).length, render: (a) => <span className="sl-num">{insights.filter((i) => i.accountId === a.id).length}</span> },
  ];

  const shownArr = accounts.reduce((s, a) => s + a.arrUsd, 0);

  return (
    <div className="sl-page">
      <AppPageHeader
        title={theme.name}
        subtitle={`${AREA_LABEL[theme.productArea]} theme`}
        dataAsOf={dataAsOf}
        breadcrumbs={[{ label: 'Themes', href: '/app/themes' }, { label: theme.name }]}
      />

      <div className={styles.headerRow}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sl-row" style={{ marginBottom: 8 }}>
            <TypeTag type={theme.type} />
            <StatusChip tone={THEME_STATUS_TONE[theme.status]}>{THEME_STATUS_LABEL[theme.status]}</StatusChip>
            <span className="sl-caption" title="Theme ID"><MonoId value={theme.id} /></span>
          </div>
          <p className={styles.lede}>{theme.summary}</p>
          <p className="sl-meta" style={{ margin: '8px 0 0' }}>
            Owner: <span className="sl-strong">{owner ? `${owner.name} · ${owner.title}` : 'Unassigned'}</span>
          </p>
        </div>
        <div className={`sl-stack-sm ${styles.headerAction}`}>
          <Button
            variant="primary"
            iconLeft="arrowUpRight"
            disabled={!canPromote}
            onClick={() => {
              setPromoted(true);
              toast({ tone: 'success', title: 'Promoted to roadmap in your workspace', body: `${theme.name} now reads "On roadmap" for ${owner?.name ?? 'its owner'}.` });
            }}
          >
            Promote to roadmap
          </Button>
          {!canPromote ? <WhyDisabled reason={theme.status === 'shipped' ? 'Already shipped' : 'Already on the roadmap'} /> : null}
        </div>
      </div>

      <MetricStrip
        minItemWidth={170}
        items={[
          { label: 'Insights', value: theme.insightCount.toLocaleString(), sub: `${totalWeekly.toLocaleString()} in the last 8 weeks` },
          { label: 'Accounts', value: theme.accountCount.toLocaleString(), sub: `${accounts.length} listed below` },
          {
            label: 'ARR at stake',
            value: <span {...tourAnchor('theme.arr')}>{money(theme.arrUsd, { compact: true })}</span>,
            sub: 'Combined ARR of the accounts affected',
          },
          { label: 'First seen', value: <span style={{ fontSize: 'var(--fs-title-lg)' }}>{dateShort(theme.firstSeen)}</span>, sub: `Last seen ${dateShort(theme.lastSeen)}` },
        ]}
      />

      <div className={styles.detailGrid}>
        <Panel
          title="Trend"
          sub="New insights in this theme each week. Click a bar to see them."
          anchor={tourAnchor('theme.trend')}
        >
          {theme.weekly.length === 0 ? (
            <EmptyState variant="not-yet-collected" title="No weekly history yet" />
          ) : (
            <div className={styles.chart} role="img" aria-label={`Weekly insights: ${theme.weekly.map((w) => `${w.week} ${w.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={theme.weekly.map((w) => ({ ...w, label: weekLabel(w.week) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke="var(--cn-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--cn-border)' }} tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} width={44} />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-subtle)' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow-2)', fontSize: 12 }}
                    formatter={(v) => [`${String(v)} insights`, 'Joined']}
                    labelFormatter={(l) => `Week ${String(l)}`}
                  />
                  <Bar
                    dataKey="count"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={44}
                    cursor="pointer"
                    isAnimationActive
                    onClick={() => navigate(`/app/insights?q=${encodeURIComponent(theme.name.split(' ').slice(0, 2).join(' '))}`)}
                  >
                    {theme.weekly.map((w, i) => (
                      <Cell key={w.week} fill={i === theme.weekly.length - 1 ? 'var(--chart-1)' : 'var(--accent-subtle)'} stroke={i === theme.weekly.length - 1 ? 'none' : 'var(--chart-1)'} strokeOpacity={0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="sl-caption" style={{ margin: '10px 0 0' }}>
            The solid bar is the current week. <Link className="sl-linkbtn" to={`/app/insights?q=${encodeURIComponent(theme.name.split(' ').slice(0, 2).join(' '))}`}>Open these insights</Link>
          </p>
        </Panel>

        <Panel title="What customers said" sub="The clearest verified quotes in this theme" anchor={tourAnchor('theme.quotes')}>
          {theme.topQuotes.length === 0 ? (
            <EmptyState variant="no-data" title="No quotes yet" description="Quotes appear once an insight in this theme has a verified quote." />
          ) : (
            <ul className={styles.quotes}>
              {theme.topQuotes.map((q) => (
                <li key={q.insightId} className={styles.quoteItem}>
                  <blockquote className="sl-quote">{q.quote}</blockquote>
                  <div className={styles.quoteMeta}>
                    <span>{world.accountName(q.accountId)}</span>
                    <Link className="sl-linkbtn" to={`/app/insights/${q.insightId}`}>Open insight</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Accounts affected"
        sub={`${accounts.length} accounts · ${money(shownArr)} combined ARR`}
        flush
      >
        <DataTable
          columns={columns}
          rows={accounts}
          getRowKey={(a) => a.id}
          pagination="when-needed"
          initialSort={{ key: 'arr', direction: 'desc' }}
          rowTone={(a) => (a.health === 'at_risk' ? 'red' : null)}
          empty={<EmptyState variant="no-data" title="No accounts linked" />}
        />
      </Panel>

      <Panel title="How it connects" sub="Which accounts raised which insights in this theme. Use a node’s Open link to see the record." flush>
        {lineage.length === 0 ? (
          <div className="sl-panel-body">
            <EmptyState variant="not-yet-collected" title="No linked insights yet" />
          </div>
        ) : (
          <div className={styles.lineage}>
            <LineageGraph nodes={layoutFor(lineage)} edges={lineage} rootIdentity={`theme:${theme.id}`} focusIdentity={null} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function layoutFor(edges: LineageEdgeRow[]) {
  return layoutNodes(deriveNodes(edges), edges);
}
