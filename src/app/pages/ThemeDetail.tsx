/**
 * A theme: the pattern, what it is worth (ARR across distinct accounts), whether it is
 * growing, the customers' own words, the accounts behind it and every insight in it.
 * Clicking a week in the trend filters the insight list to that week.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import type { Account, Insight, Theme } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, Card, CellText, EmptyState, Page, PageHeader, PersonChip, Quote, Skeleton, Stats, Table, TableSkeleton, useCrumbs, useToast, type Tone } from '../../ds';
import { IconArrowUp, IconLayers, IconX } from '../../ds/icons';
import { useTheme } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, InsightStatusBadge, SeverityBadge, TypeLabel, When } from '../components/domain';
import { AREA_LABEL, dateShort, money, renewalIn } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { ThemeStatusBadge } from './Themes';
import { isoWeekOf, weekStart } from './themes/weeks';
import { RedactedText } from './run/Transcript';
import styles from './themes/themes.module.css';

const INSIGHTS_PAGE = 20;

const HEALTH: Record<Account['health'], { label: string; tone: Tone }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  watch: { label: 'Watch', tone: 'warning' },
  at_risk: { label: 'At risk', tone: 'danger' },
};

function trendSummary(weekly: Theme['weekly']): string {
  if (!weekly.length) return 'No weekly history yet.';
  const total = weekly.reduce((s, w) => s + w.count, 0);
  const peak = weekly.reduce((a, b) => (b.count > a.count ? b : a));
  const half = Math.floor(weekly.length / 2);
  const recent = weekly.slice(half).reduce((s, w) => s + w.count, 0);
  const earlier = weekly.slice(0, half).reduce((s, w) => s + w.count, 0);
  const dir = recent > earlier ? 'Growing' : recent < earlier ? 'Fading' : 'Steady';
  return `${dir}: ${recent} in the last ${weekly.length - half} weeks against ${earlier} in the ${half} before. ${total} in ${weekly.length} weeks, most in the week of ${weekStart(peak.week)} (${peak.count}).`;
}

export default function ThemeDetailPage() {
  const { id = '' } = useParams();
  const themeQ = useTheme(id);
  const world = useWorldIndex();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [promoted, setPromoted] = useState(false);
  const [limit, setLimit] = useState(INSIGHTS_PAGE);
  const insightsRef = useRef<HTMLElement | null>(null);
  const week = params.get('week');

  useEffect(() => {
    if (!id) return;
    emit({ name: 'theme.opened', themeId: id });
    track('theme_opened', { themeId: id });
  }, [id]);

  const data = themeQ.data;
  const theme: Theme | undefined = data?.theme
    ? {
        ...data.theme,
        status: promoted && data.theme.status !== 'shipped' ? 'on_roadmap' : data.theme.status,
      }
    : undefined;
  useDocumentTitle(theme?.name ?? 'Theme');
  useCrumbs(theme ? [{ label: theme.name }] : null, [theme?.name]);

  const accounts = useMemo(() => [...(data?.accounts ?? [])].sort((a, b) => b.arrUsd - a.arrUsd), [data]);
  const insights = useMemo(() => [...(data?.insights ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data]);
  const perAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of insights) if (i.accountId) m.set(i.accountId, (m.get(i.accountId) ?? 0) + 1);
    return m;
  }, [insights]);
  const shownInsights = week ? insights.filter((i) => isoWeekOf(i.createdAt) === week) : insights;

  const pickWeek = (w: string) => {
    const next = new URLSearchParams(params);
    next.set('week', w);
    setParams(next, { replace: true });
    window.requestAnimationFrame(() =>
      insightsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      }),
    );
  };
  const clearWeek = () => {
    const next = new URLSearchParams(params);
    next.delete('week');
    setParams(next, { replace: true });
  };

  if (themeQ.error && !data) {
    return (
      <Page>
        <PageHeader title="Theme" />
        <Card>
          <ErrorState error={themeQ.error} onRetry={() => void themeQ.refresh()} what="this theme" />
        </Card>
      </Page>
    );
  }

  if (!theme) return <DetailSkeleton />;

  const owner = world.person(theme.ownerId);
  const canPromote = theme.status === 'candidate' || theme.status === 'active';
  const weekly = theme.weekly;
  const last = weekly.length - 1;

  return (
    <Page>
      <PageHeader
        title={theme.name}
        badge={<ThemeStatusBadge status={theme.status} />}
        description={theme.summary}
        meta={
          <>
            <TypeLabel type={theme.type} />
            <span>{AREA_LABEL[theme.productArea]}</span>
            {owner ? (
              <span className={styles.owner}>
                <span>Owner</span>
                <PersonChip name={owner.name} initials={owner.initials} sub={owner.title} size="sm" />
              </span>
            ) : (
              <span className="ds-subtle">No owner yet</span>
            )}
          </>
        }
        actions={
          <>
            {!canPromote ? <span className={styles.why}>{theme.status === 'shipped' ? 'Already shipped' : 'Already on the roadmap'}</span> : null}
            <Button
              variant="primary"
              icon={<IconArrowUp />}
              disabled={!canPromote}
              onClick={() => {
                setPromoted(true);
                toast({
                  tone: 'success',
                  title: 'Promoted to roadmap in your workspace',
                  body: `${theme.name} now reads “On roadmap” for ${owner?.name ?? 'its owner'}.`,
                });
              }}
            >
              Promote to roadmap
            </Button>
          </>
        }
      />

      <Stats
        items={[
          {
            label: 'Insights',
            value: theme.insightCount.toLocaleString(),
            sub: `${weekly.reduce((s, w) => s + w.count, 0).toLocaleString()} in the last ${weekly.length} weeks`,
          },
          {
            label: 'Accounts',
            value: theme.accountCount.toLocaleString(),
            sub: 'Each counted once',
          },
          {
            label: 'ARR at stake',
            value: money(theme.arrUsd, { compact: true }),
            sub: 'Combined ARR of the accounts affected',
            attrs: tourAnchor('theme.arr'),
          },
          {
            label: 'First seen',
            value: dateShort(theme.firstSeen),
            sub: `Last seen ${dateShort(theme.lastSeen)}`,
          },
        ]}
      />

      <div className={styles.detailGrid}>
        <Card title="Trend" description="New insights each week. Select a week to see its insights." attrs={tourAnchor('theme.trend')} className={styles.fillCard} bodyClassName={styles.fillBody}>
          {weekly.length === 0 ? (
            <EmptyState icon={<IconLayers />} title="No weekly history yet" compact />
          ) : (
            <div className={styles.trendBody}>
              <div className={styles.chart} role="img" aria-label={`Insights per week: ${weekly.map((w) => `week of ${weekStart(w.week)} ${w.count}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={weekly.map((w) => ({
                      ...w,
                      label: weekStart(w.week),
                    }))}
                    margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} width={28} />
                    <ChartTooltip
                      cursor={{ fill: 'var(--bg-muted)' }}
                      contentStyle={{
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-2)',
                        fontSize: 12,
                        padding: '6px 10px',
                      }}
                      labelStyle={{
                        color: 'var(--text-secondary)',
                        marginBottom: 2,
                      }}
                      itemStyle={{ color: 'var(--text)', padding: 0 }}
                      formatter={(v) => [`${String(v)} insight${v === 1 ? '' : 's'}`, 'New']}
                      labelFormatter={(l) => `Week of ${String(l)}`}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40} cursor="pointer" isAnimationActive={false} onClick={(_, i) => weekly[i] && pickWeek(weekly[i]!.week)}>
                      {weekly.map((w, i) => (
                        <Cell key={w.week} fill={week ? (w.week === week ? 'var(--chart-1)' : 'var(--accent-line)') : i === last ? 'var(--chart-1)' : 'var(--accent-line)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={styles.chartSummary}>{trendSummary(weekly)}</p>
            </div>
          )}
        </Card>

        <Card title="What customers said" description="Representative quotes, each traced to the conversation it came from." attrs={tourAnchor('theme.quotes')}>
          {theme.topQuotes.length === 0 ? (
            <EmptyState title="No quotes yet" description="Quotes appear once an insight in this theme has a verified quote." compact />
          ) : (
            <ul className={styles.quotes}>
              {theme.topQuotes.slice(0, 4).map((q) => (
                <li key={q.insightId}>
                  <Quote
                    cite={
                      <span className={styles.cite}>
                        <span className="ds-truncate">{world.accountName(q.accountId)}</span>
                        <Link to={`/app/insights/${q.insightId}`}>Open insight</Link>
                      </span>
                    }
                  >
                    <RedactedText text={q.quote} />
                  </Quote>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Accounts affected"
        description={`${accounts.length} account${accounts.length === 1 ? '' : 's'}, ${money(
          accounts.reduce((s, a) => s + a.arrUsd, 0),
          { compact: true },
        )} combined ARR.`}
        flush
      >
        {accounts.length === 0 ? (
          <EmptyState title="No accounts linked" compact />
        ) : (
          <Table label="Accounts affected" minWidth={760}>
            <thead>
              <tr>
                <th>Account</th>
                <th className="is-num">ARR</th>
                <th>Renewal</th>
                <th>Health</th>
                <th>CSM</th>
                <th className="is-num">Insights here</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="is-clickable has-row-link" onClick={() => navigate(`/app/insights?account=${a.id}`)}>
                  <td>
                    <Link to={`/app/insights?account=${a.id}`} className="ds-table__link" onClick={(e) => e.stopPropagation()}>
                      <CellText primary={a.name} secondary={`${a.tier}, ${a.vertical.replace(/_/g, ' ')}`} />
                    </Link>
                  </td>
                  <td className="is-num">{money(a.arrUsd)}</td>
                  <td className="is-nowrap">
                    <CellText primary={dateShort(a.renewalDate)} secondary={renewalIn(a.renewalDate).split(' · ')[1] ?? undefined} />
                  </td>
                  <td>
                    <Badge tone={HEALTH[a.health].tone} dot>
                      {HEALTH[a.health].label}
                    </Badge>
                  </td>
                  <td className="is-nowrap">{world.personName(a.csmId)}</td>
                  <td className="is-num">{perAccount.get(a.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <section ref={insightsRef} className={styles.anchorTarget}>
        <Card
          title="Insights in this theme"
          description={week ? `${shownInsights.length} from the week of ${weekStart(week)}.` : `${insights.length} insight${insights.length === 1 ? '' : 's'}, newest first.`}
          actions={
            week ? (
              <Button size="sm" variant="ghost" icon={<IconX size={14} />} onClick={clearWeek}>
                Show all weeks
              </Button>
            ) : null
          }
          flush
          footer={
            shownInsights.length > INSIGHTS_PAGE ? (
              <>
                <span>
                  Showing {Math.min(limit, shownInsights.length)} of {shownInsights.length}
                </span>
                {limit < shownInsights.length ? (
                  <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + INSIGHTS_PAGE)}>
                    Show more
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        >
          {shownInsights.length === 0 ? (
            <EmptyState title={week ? 'No insights that week' : 'No insights yet'} compact />
          ) : (
            <InsightsTable insights={shownInsights.slice(0, limit)} accountName={world.accountName} onOpen={(i) => navigate(`/app/insights/${i.id}`)} />
          )}
        </Card>
      </section>
    </Page>
  );
}

function InsightsTable({ insights, accountName, onOpen }: { insights: Insight[]; accountName: (id: string | null) => string; onOpen: (i: Insight) => void }) {
  return (
    <Table label="Insights in this theme" minWidth={860}>
      <colgroup>
        <col />
        <col style={{ width: 200 }} />
        <col style={{ width: 104 }} />
        <col style={{ width: 150 }} />
        <col style={{ width: 104 }} />
      </colgroup>
      <thead>
        <tr>
          <th>Insight</th>
          <th>Account</th>
          <th>Severity</th>
          <th>Status</th>
          <th className="is-num">Received</th>
        </tr>
      </thead>
      <tbody>
        {insights.map((i) => (
          <tr key={i.id} className="is-clickable has-row-link" onClick={() => onOpen(i)}>
            <td style={{ maxWidth: 0 }}>
              <Link to={`/app/insights/${i.id}`} className="ds-table__link" onClick={(e) => e.stopPropagation()} title={i.summary}>
                <CellText primary={i.summary} />
              </Link>
            </td>
            <td className="ds-truncate" style={{ maxWidth: 0 }}>
              {i.accountId ? accountName(i.accountId) : <span className="ds-subtle">No account</span>}
            </td>
            <td>
              <SeverityBadge severity={i.severity} />
            </td>
            <td>
              <InsightStatusBadge status={i.status} />
            </td>
            <td className="is-num ds-muted">
              <When value={i.createdAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <div className="ds-stack" style={{ gap: 10 }} aria-busy="true" aria-label="Loading theme">
        <Skeleton width={360} height={24} />
        <Skeleton width={520} height={12} />
      </div>
      <Skeleton height={96} radius={8} />
      <div className={styles.detailGrid}>
        <Skeleton height={300} radius={8} />
        <Skeleton height={300} radius={8} />
      </div>
      <TableSkeleton rows={5} cols={6} />
    </Page>
  );
}
