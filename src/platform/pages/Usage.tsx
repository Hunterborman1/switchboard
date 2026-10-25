import { Link, useSearchParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { RegistryRow, UsageReportX } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { BarList, Heatmap, Legend, Lines } from '../ui/charts';
import { IconEye, IconPlay, IconSpark, IconUsers } from '../ui/icons';
import { Avatar, Delta, ErrorState, PageHead, PageSkeleton, Panel, Seg } from '../ui/kit';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function kindIcon(k: string) {
  if (k.startsWith('tour')) return <IconPlay size={12} />;
  if (k === 'page_view' || k === 'session_start') return <IconEye size={12} />;
  return <IconSpark size={12} />;
}

/** Shift UTC weekday/hour cells into the viewer's display timezone (PT = UTC−7 in the window). */
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

export function LivePanel({ data, compact }: { data: UsageReportX; compact?: boolean }) {
  const { timezone } = useTimezone();
  const l = data.live;
  const youSessions = new Set(data.you.sessionIds);
  return (
    <section className="ao-live" aria-labelledby="ao-live-title" {...tourAnchor('ops.usage.live')}>
      <div className="ao-live-head">
        <div>
          <h2 id="ao-live-title">
            <span className="ao-livedot" aria-hidden="true" /> Live right now
          </h2>
          <p>Real people using this demo, updated every 10 seconds. “Active now” means seen in the last 5 minutes. Your own session is marked.</p>
        </div>
        <Link to="/app" className="ao-btn sm">
          Open Signal Loop to appear here
        </Link>
      </div>
      <div className="ao-live-stats">
        <div className="ao-live-stat">
          <span>Active now</span>
          <b data-testid="live-active">{f.int(l.activeNow)}</b>
          <small>Sessions in the last 5 minutes</small>
        </div>
        <div className="ao-live-stat">
          <span>Sessions</span>
          <b>{f.int(l.sessionsToday)}</b>
          <small>Last 24 hours</small>
        </div>
        <div className="ao-live-stat">
          <span>Walkthrough starts</span>
          <b>{f.int(l.tourStarts)}</b>
          <small>Last 24 hours</small>
        </div>
        <div className="ao-live-stat">
          <span>Walkthroughs finished</span>
          <b>{f.int(l.tourCompletions)}</b>
          <small>{l.tourStarts ? `${f.pct(l.tourCompletions / l.tourStarts)} of starts` : 'None yet'}</small>
        </div>
      </div>
      {compact ? null : (
        <div className="ao-live-body">
          <div className="ao-live-col">
            <h3>Sessions in the last 30 minutes</h3>
            {data.liveSessions.length ? (
              <ul className="ao-live-list">
                {data.liveSessions.map((s) => (
                  <li key={s.sessionId} className={s.isYou ? 'you' : undefined} data-you={s.isYou ? 'true' : undefined}>
                    <span className="ao-kind" aria-hidden="true">
                      <IconUsers size={12} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="k">
                        {s.isYou ? 'You' : s.actorId === 'owner' ? 'Hunter (owner)' : `Viewer ${s.actorId.replace(/^viewer:/, '').slice(0, 6)}`}{' '}
                        {s.isYou ? <span className="ao-you">That’s you</span> : null}
                      </span>
                      <span className="m">
                        {s.events} action{s.events === 1 ? '' : 's'}
                        {cleanPath(s.lastPath) ? ` · last on ${cleanPath(s.lastPath)}` : ''}
                      </span>
                    </span>
                    <time dateTime={s.lastAt}>{f.ago(s.lastAt)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ao-live-empty">
                Nobody in the last 30 minutes. Open <Link to="/app">Signal Loop</Link> or start the <Link to="/walkthrough">walkthrough</Link> in another tab, then come back: your session appears here within seconds, marked “That’s you”.
              </div>
            )}
          </div>
          <div className="ao-live-col">
            <h3>Recent activity</h3>
            {l.recent.length ? (
              <ul className="ao-live-list" aria-live="polite">
                {l.recent.slice(0, 14).map((e) => {
                  const you = youSessions.has(e.sessionId);
                  return (
                    <li key={e.id} className={you ? 'you' : undefined}>
                      <span className="ao-kind" aria-hidden="true">
                        {kindIcon(e.kind)}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="k">
                          {f.kind(e.kind)} {you ? <span className="ao-you">You</span> : null}
                        </span>
                        <span className="m">
                          {cleanPath(e.path) ?? (typeof e.props.step === 'string' ? e.props.step : '')} {e.actorId === 'owner' ? '· owner' : `· ${e.actorId.replace(/^viewer:/, 'viewer ')}`}
                        </span>
                      </span>
                      <time dateTime={e.at} title={f.time(e.at, timezone, true)}>
                        {f.clock(e.at, timezone)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="ao-live-empty">No live activity yet. It arrives as people use Signal Loop.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function Usage() {
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
  if (usage.error && !usage.data) return <div className="ao-page"><ErrorState message={usage.error.message} onRetry={usage.reload} /></div>;
  if (!usage.data) return <PageSkeleton />;
  const d = usage.data;
  const src = source === 'live' ? 'live' : source === 'simulated' ? 'simulated' : 'mixed';
  const tz = f.tzLabel(timezone);
  const featureRows = d.features.filter((x) => x.kind !== 'session_start').slice(0, 9).map((x) => ({ label: f.kind(x.kind), value: x.events, sub: `${x.users} ${x.users === 1 ? 'person' : 'people'}` }));
  const roles = d.byRole.map((r) => ({ label: f.role(r.role), value: r.users, sub: `${f.int(r.events)} actions` }));

  return (
    <div className="ao-page">
      <PageHead
        title="Usage"
        sub="Who uses which agent, when, and how often. The live panel is real; the six-week history is simulated."
        meta={<span>Updated {f.ago(usage.dataAsOf)}</span>}
        actions={
          <>
            <select className="ao-select" aria-label="Agent" value={agentId} onChange={(e) => set('agentId', e.target.value)}>
              <option value="">All agents</option>
              {(reg.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Seg
              label="Data source"
              value={source}
              onChange={(v) => set('source', v === 'all' ? '' : v)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'live', label: 'Live only' },
                { value: 'simulated', label: 'Simulated' },
              ]}
            />
          </>
        }
      />

      <LivePanel data={d} />

      <MetricStrip
        minItemWidth={150}
        label="Usage totals"
        items={[
          { label: 'People', value: f.int(d.totals.users), sub: 'Used an agent this period' },
          { label: 'Weekly active users', value: f.int(d.totals.wau), sub: <><Delta value={d.totals.priorWau ? (d.totals.wau - d.totals.priorWau) / d.totals.priorWau : null} /> vs {d.totals.priorWau} the week before</> },
          { label: 'Sessions', value: f.int(d.totals.sessions), sub: 'This period' },
          { label: 'Actions', value: f.int(d.totals.events), sub: 'Page views, runs, reviews and exports', help: 'Every tracked action: viewing a page, starting a run, reviewing an output, exporting, and so on.' },
        ]}
      />

      <Panel title="People and sessions per day" source={src} sub="Busy on weekdays, quiet at weekends.">
        <Legend
          series={[
            { key: 'users', label: 'People', color: '#008463' },
            { key: 'sessions', label: 'Sessions', color: '#2F5DB8' },
          ]}
        />
        <Lines
          data={d.daily.map((x) => ({ ...x, label: f.day(x.day) }))}
          x="label"
          series={[
            { key: 'users', label: 'People', color: '#008463' },
            { key: 'sessions', label: 'Sessions', color: '#2F5DB8' },
          ]}
          height={220}
          yFormat={(v) => String(v)}
          tipTitle={(r) => String(r.label)}
          tipValue={(_, v) => f.int(v)}
          ariaLabel="Daily people and sessions"
        />
      </Panel>

      <div className="ao-grid g-main">
        <Panel title="When people use agents" source={src} sub={`Activity by weekday and hour, ${tz === 'UTC' ? 'UTC' : 'Pacific time'}. Busiest mid-morning and early afternoon Pacific.`} attrs={tourAnchor('ops.usage.heatmap')}>
          <Heatmap cells={shiftHeat(d.heatmap, timezone)} tzLabel={tz === 'UTC' ? 'UTC' : 'Pacific time'} rowLabels={DAYS} />
        </Panel>
        <Panel title="Top users" source={src} sub="Ranked by tasks completed, then sessions.">
          {d.topUsers.length ? (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }} data-testid="top-users">
              {d.topUsers.map((u, i) => (
                <li key={u.actorId} style={{ display: 'grid', gridTemplateColumns: '16px auto minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}>
                  <span className="ao-muted ao-num" style={{ fontSize: 13 }}>{i + 1}</span>
                  <Avatar name={u.name} />
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</b>
                    <small className="ao-muted" style={{ fontSize: 13 }}>
                      {u.role} · last seen {f.day(u.lastSeen)}
                    </small>
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 13 }} className="ao-num">
                    <b style={{ fontWeight: 600, fontSize: 14 }}>{f.int(u.workUnits)}</b> tasks
                    <br />
                    <span className="ao-muted">{f.int(u.sessions)} sessions</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ao-muted">No attributed users for this filter.</p>
          )}
        </Panel>
      </div>

      <div className="ao-grid g-2">
        <Panel title="By role" source={src} sub="People per role.">
          <BarList rows={roles} format={(v) => `${v} ${v === 1 ? 'person' : 'people'}`} color="#008463" />
        </Panel>
        <Panel title="Features used" source={src} sub="Actions by type: which parts of an agent earn their keep.">
          <BarList rows={featureRows} format={(v) => f.int(v)} color="#2F5DB8" />
        </Panel>
      </div>
    </div>
  );
}
