/**
 * Usage: who uses which agent, when and how often. The live panel is real (this demo's
 * viewers, "that's you"); the six-week history behind the charts is simulated.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, ButtonLink, Card, EmptyState, Page, PageHeader, Segmented, Select, Stats, Toolbar } from '../../ds';
import { IconUsers } from '../../ds/icons';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { RegistryRow, UsageReportX } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { BarList, ChartLegend, ChartSummary, Heatmap, Lines } from '../ui/charts';
import { InfoTip } from '../ui/InfoTip';
import { agentLabel, agentSource, LoadError, OpsSkeleton, RankPerson, SourceBadge, useOpsTitle } from '../ui/kit';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Shift UTC weekday/hour cells into the viewer's display time zone (PT = UTC−7 in the window). */
function shiftHeat(cells: UsageReportX['heatmap'], tz: string) {
  if (tz === 'UTC') return cells;
  const off = -7;
  const out = new Map<string, number>();
  for (const c of cells) {
    let h = c.hour + off;
    let d = c.weekday;
    if (h < 0) {
      h += 24;
      d = (d + 6) % 7;
    }
    const k = `${d}:${h}`;
    out.set(k, (out.get(k) ?? 0) + c.events);
  }
  return [...out.entries()].map(([k, events]) => {
    const [d, h] = k.split(':').map(Number);
    return { weekday: d!, hour: h!, events };
  });
}

/** One path style everywhere: strip the deployment prefix so "/repo/invoca/app/new" and "/app/new" read the same. */
const cleanPath = (p: string | null | undefined): string | null => (p ? p.replace(/^\/repo\/invoca(?=\/|$)/, '') || '/' : null);
const viewerName = (actorId: string) => (actorId === 'owner' ? 'Hunter (owner)' : `Viewer ${actorId.replace(/^viewer:/, '').slice(0, 6)}`);

export function LivePanel({ data }: { data: UsageReportX }) {
  const { timezone } = useTimezone();
  const l = data.live;
  const youSessions = new Set(data.you.sessionIds);
  return (
    <Card
      title={
        <span className="ao-live-title">
          <span className="ao-live-dot" aria-hidden="true" />
          Live right now
        </span>
      }
      description="Real people using this demo, updated every 10 seconds. Your own session is marked."
      footer={
        <>
          <span>Use Switchboard in another tab and your session appears here within seconds.</span>
          <ButtonLink to="/app/overview" size="sm">
            Open Switchboard
          </ButtonLink>
        </>
      }
      attrs={tourAnchor('ops.usage.live')}
    >
      <div className="ao-live-stats">
        <div className="ao-live-stat">
          <span className="ao-live-stat__label">Active now</span>
          <span className="ao-live-stat__value" data-testid="live-active">
            {f.int(l.activeNow)}
          </span>
          <span className="ao-live-stat__sub">Seen in the last 5 minutes</span>
        </div>
        <div className="ao-live-stat">
          <span className="ao-live-stat__label">Sessions</span>
          <span className="ao-live-stat__value">{f.int(l.sessionsToday)}</span>
          <span className="ao-live-stat__sub">Last 24 hours</span>
        </div>
        <div className="ao-live-stat">
          <span className="ao-live-stat__label">Walkthroughs started</span>
          <span className="ao-live-stat__value">{f.int(l.tourStarts)}</span>
          <span className="ao-live-stat__sub">Last 24 hours</span>
        </div>
        <div className="ao-live-stat">
          <span className="ao-live-stat__label">Walkthroughs finished</span>
          <span className="ao-live-stat__value">{f.int(l.tourCompletions)}</span>
          <span className="ao-live-stat__sub">{l.tourStarts ? `${f.pct(l.tourCompletions / l.tourStarts)} of starts` : 'None yet'}</span>
        </div>
      </div>
      <div className="ao-live-cols">
        <div>
          <h3 className="ao-subhead">Sessions in the last 30 minutes</h3>
          {data.liveSessions.length ? (
            <ul className="ao-live-list">
              {data.liveSessions.map((s) => (
                <li key={s.sessionId} className={`ao-live-item${s.isYou ? ' ao-live-item--you' : ''}`} data-you={s.isYou ? 'true' : undefined}>
                  <span className="ao-live-item__text">
                    <span className="ao-live-item__title">
                      <span className="ds-truncate">{s.isYou ? 'You' : viewerName(s.actorId)}</span>
                      {s.isYou ? <Badge tone="accent">That’s you</Badge> : null}
                    </span>
                    <span className="ao-live-item__meta">
                      {s.events} action{s.events === 1 ? '' : 's'}
                      {cleanPath(s.lastPath) ? `, last on ${cleanPath(s.lastPath)}` : ''}
                    </span>
                  </span>
                  <time className="ao-live-item__time" dateTime={s.lastAt}>
                    {f.ago(s.lastAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ao-live-empty">
              Nobody in the last 30 minutes. Start the <Link to="/walkthrough">walkthrough</Link> or use Switchboard in another tab.
            </p>
          )}
        </div>
        <div>
          <h3 className="ao-subhead">Recent activity</h3>
          {l.recent.length ? (
            <ul className="ao-live-list" aria-live="polite">
              {l.recent.slice(0, 14).map((e) => {
                const you = youSessions.has(e.sessionId);
                const where = cleanPath(e.path) ?? (typeof e.props.step === 'string' ? e.props.step : null);
                return (
                  <li key={e.id} className={`ao-live-item${you ? ' ao-live-item--you' : ''}`}>
                    <span className="ao-live-item__text">
                      <span className="ao-live-item__title">
                        <span className="ds-truncate">{f.kind(e.kind)}</span>
                        {you ? <Badge tone="accent">You</Badge> : null}
                      </span>
                      <span className="ao-live-item__meta">
                        {where ? `${where}, ` : ''}
                        {e.actorId === 'owner' ? 'owner' : e.actorId.replace(/^viewer:/, 'viewer ')}
                      </span>
                    </span>
                    <time className="ao-live-item__time" dateTime={e.at} title={f.time(e.at, timezone, true)}>
                      {f.clock(e.at, timezone)}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ao-live-empty">No live activity yet. It arrives as people use Switchboard.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function Usage() {
  useOpsTitle('Usage');
  const [params, setParams] = useSearchParams();
  const agentId = params.get('agentId') ?? '';
  const source = (params.get('source') as 'all' | 'live' | 'simulated' | null) ?? 'all';
  const usage = useApi<UsageReportX>(`/usage?source=${source}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`, { pollMs: 10_000 });
  const reg = useApi<RegistryRow[]>('/agents');
  const { timezone } = useTimezone();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  const header = (
    <PageHeader
      title="Usage"
      description="Who uses each agent, when and how often."
      meta={usage.data ? <span>Updated {f.ago(usage.dataAsOf)}</span> : undefined}
    />
  );
  const toolbar = (
    <Toolbar
      start={
        <Select
          aria-label="Agent"
          value={agentId}
          onChange={(e) => set('agentId', e.target.value)}
          options={[{ value: '', label: 'All agents' }, ...(reg.data ?? []).map((r) => ({ value: r.id, label: agentLabel(r.profile.shortName || r.name, r.source) }))]}
          style={{ width: 260, maxWidth: '100%' }}
        />
      }
      end={
        <Segmented
          label="Data source"
          value={source}
          onChange={(v) => set('source', v === 'all' ? '' : v)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'live', label: 'Live only' },
            { value: 'simulated', label: 'Simulated' },
          ]}
        />
      }
    />
  );

  if (usage.error && !usage.data)
    return (
      <Page>
        {header}
        <LoadError error={usage.error} onRetry={usage.reload} what="usage" />
      </Page>
    );
  if (!usage.data) return <OpsSkeleton />;
  const d = usage.data;
  // A simulated agent has no live data, whatever the source filter says.
  const src = (agentId && agentSource(agentId, reg.data) === 'simulated') || source === 'simulated' ? 'simulated' : source === 'live' ? 'live' : 'mixed';
  const tzName = timezone === 'UTC' ? 'UTC' : 'Pacific time';
  const featureRows = d.features
    .filter((x) => x.kind !== 'session_start')
    .slice(0, 8)
    .map((x) => ({ label: f.kind(x.kind), value: x.events }));
  const roles = d.byRole.map((r) => ({ label: f.role(r.role), value: r.users }));
  const heat = shiftHeat(d.heatmap, timezone);
  const peak = heat.reduce<(typeof heat)[number] | null>((b, c) => (!b || c.events > b.events ? c : b), null);
  const busiestDay = d.daily.reduce<(typeof d.daily)[number] | null>((b, c) => (!b || c.users > b.users ? c : b), null);
  const wauDelta = d.totals.priorWau ? Math.round(((d.totals.wau - d.totals.priorWau) / d.totals.priorWau) * 100) : null;
  const lineSeries = [
    { key: 'users', label: 'People', color: 'var(--chart-1)' },
    { key: 'sessions', label: 'Sessions', color: 'var(--chart-2)' },
  ];

  return (
    <Page>
      {header}
      {toolbar}

      <LivePanel data={d} />

      <Stats
        items={[
          { label: 'People', value: f.int(d.totals.users), sub: 'Used an agent this period' },
          {
            label: 'Weekly active users',
            value: f.int(d.totals.wau),
            delta: wauDelta == null || wauDelta === 0 ? null : { value: `${Math.abs(wauDelta)}%`, direction: wauDelta > 0 ? 'up' : 'down' },
            sub: d.totals.priorWau ? `vs ${d.totals.priorWau} the week before` : 'First week of data',
          },
          { label: 'Sessions', value: f.int(d.totals.sessions), sub: 'This period' },
          {
            label: 'Actions',
            value: f.int(d.totals.events),
            sub: 'Views, runs, reviews and exports',
            info: <InfoTip label="Actions">Every tracked action: viewing a page, starting a run, reviewing an output, exporting, and so on.</InfoTip>,
          },
        ]}
      />

      <Card title="People and sessions per day" actions={<SourceBadge source={src} />}>
        <ChartLegend series={lineSeries} />
        <Lines
          data={d.daily.map((x) => ({ ...x, label: f.day(x.day) }))}
          x="label"
          series={lineSeries}
          height={220}
          yFormat={(v) => f.int(v)}
          tipTitle={(r) => String(r.label)}
          tipValue={(_, v) => f.int(v)}
          ariaLabel="People and sessions per day"
        />
        <ChartSummary>
          Busy on weekdays, quiet at weekends.{busiestDay ? ` The busiest day was ${f.day(busiestDay.day)}: ${f.int(busiestDay.users)} people in ${f.int(busiestDay.sessions)} sessions.` : ''}
        </ChartSummary>
      </Card>

      <div className="ao-split ao-split--stretch">
        <Card className="ao-fill" title="When people use agents" description={`Actions by weekday and hour, ${tzName}.`} actions={<SourceBadge source={src} />} attrs={tourAnchor('ops.usage.heatmap')}>
          <Heatmap cells={heat} tzLabel={tzName} rowLabels={DAYS} />
          <ChartSummary>
            {peak && peak.events
              ? `Busiest on ${DAY_NAMES[peak.weekday]} at ${String(peak.hour).padStart(2, '0')}:00 ${timezone === 'UTC' ? 'UTC' : 'Pacific'}, with ${f.int(peak.events)} actions.`
              : 'No activity for this filter.'}
          </ChartSummary>
        </Card>
        <Card className="ao-fill" title="Top users" description="Ranked by tasks completed, then sessions." actions={<SourceBadge source={src} />}>
          {d.topUsers.length ? (
            <ol className="ao-rank" data-testid="top-users">
              {[...d.topUsers].sort((a, b) => b.workUnits - a.workUnits || b.sessions - a.sessions).map((u, i) => (
                <li key={u.actorId} className="ao-rank__row">
                  <span className="ao-rank__n">{i + 1}</span>
                  <RankPerson name={u.name} sub={`${u.role}. Last seen ${f.day(u.lastSeen)}`} />
                  <span className="ao-rank__value">
                    <span className="ao-rank__strong">{f.int(u.workUnits)} tasks</span>
                    <span>{f.int(u.sessions)} sessions</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact icon={<IconUsers />} title="No attributed users" description="Nobody matches this filter yet." />
          )}
        </Card>
      </div>

      <div className="ao-pair">
        <Card className="ao-fill" title="By role" description="People per role." actions={<SourceBadge source={src} />}>
          <BarList rows={roles} format={(v) => `${v} ${v === 1 ? 'person' : 'people'}`} label="People per role" />
        </Card>
        <Card className="ao-fill" title="Features used" description="Actions by type: which parts of an agent earn their keep." actions={<SourceBadge source={src} />}>
          <BarList rows={featureRows} format={(v) => f.int(v)} label="Actions by type" />
        </Card>
      </div>
    </Page>
  );
}
