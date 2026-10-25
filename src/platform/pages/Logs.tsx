import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { relabelModelsDeep, rewriteModelIds } from '../../shared/modelLabels';
import type { LogEntry } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { LogsPage, RegistryRow, YourLastRun } from '../../worker/platform/types';
import { ApiError, useApi } from '../lib/api';
import { PLATFORM_API_BASE } from '../../shared/platform-contracts';
import * as f from '../lib/format';
import { IconTrace, IconX } from '../ui/icons';
import { Callout, Drawer, Empty, ErrorState, PageHead, Panel, Seg, SourceChip } from '../ui/kit';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const LEVEL_LABEL: Record<string, string> = { debug: 'Debug', info: 'Info', warn: 'Warning', error: 'Error' };
export const levelLabel = (l: string) => LEVEL_LABEL[l] ?? l;
const FILTER_LABEL: Record<string, string> = { agentId: 'Agent', level: 'Level', component: 'Area', traceId: 'Trace', runId: 'Run', q: 'Search', source: 'Data' };
const COMPONENTS = ['api', 'workflow', 'ai', 'delivery', 'budget', 'gumloop', 'telemetry', 'gate'];
/** Plain names for the log components (the raw key stays in the URL and the detail panel). */
export const AREA_LABEL: Record<string, string> = { api: 'API', workflow: 'Workflow', ai: 'AI call', delivery: 'Delivery', budget: 'Budget', gumloop: 'Gumloop', telemetry: 'Usage tracking', gate: 'Sign-in' };
const FILTER_KEYS = ['agentId', 'level', 'component', 'traceId', 'runId', 'q', 'source'] as const;

async function getJson<T>(path: string): Promise<{ data: T; dataAsOf: string }> {
  const hint = (() => {
    try {
      return sessionStorage.getItem('sl_tel_session') ?? '';
    } catch {
      return '';
    }
  })();
  const res = await fetch(`${PLATFORM_API_BASE}${path}`, { headers: hint ? { 'x-ao-sessions': hint } : {} });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'http', body?.error?.message ?? 'Request failed');
  return body;
}

export function Logs() {
  const [params, setParams] = useSearchParams();
  const { timezone } = useTimezone();
  const navigate = useNavigate();
  const reg = useApi<RegistryRow[]>('/agents');
  const filterQs = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return q.toString();
  }, [params]);
  const [pages, setPages] = useState<LogsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [open, setOpen] = useState<LogEntry | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [lastRun, setLastRun] = useState<{ state: 'idle' | 'loading' | 'none' | 'found'; run?: NonNullable<YourLastRun> & { isYours: boolean } }>({ state: 'idle' });

  const load = async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const r = await getJson<LogsPage>(`/logs?limit=100&${filterQs}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      setPages((p) => (cursor ? [...p, r.data] : [r.data]));
      setAsOf(r.dataAsOf);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load logs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterQs]);
  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: false });
  };
  const levels = (params.get('level') ?? '').split(',').filter(Boolean);
  const toggleLevel = (l: string) => {
    const current = levels.length ? levels : [...LEVELS];
    const next = current.includes(l) ? current.filter((x) => x !== l) : [...current, l];
    set('level', next.length && next.length < 4 ? next.join(',') : null);
  };
  const rows = pages.flatMap((p) => p.rows);
  const total = pages[0]?.total ?? null;
  const next = pages[pages.length - 1]?.nextCursor ?? null;
  const names = Object.fromEntries((reg.data ?? []).map((r) => [r.id, r.profile.shortName]));
  const active = FILTER_KEYS.filter((k) => params.get(k));

  const yourLastRun = async () => {
    setLastRun({ state: 'loading' });
    try {
      const r = await getJson<(NonNullable<YourLastRun> & { isYours: boolean }) | null>('/logs/your-last-run');
      if (!r.data) {
        setLastRun({ state: 'none' });
        return;
      }
      setLastRun({ state: 'found', run: r.data });
      const n = new URLSearchParams();
      n.set('traceId', r.data.traceId);
      setParams(n);
    } catch {
      setLastRun({ state: 'none' });
    }
  };

  return (
    <div className="ao-page">
      <PageHead
        title="Logs and traces"
        sub="Every request, workflow step, AI call, delivery and budget check from every agent. Lines from the same run share a trace. Signal Loop’s lines are live; the rest is simulated history."
        meta={<span>{total != null ? `${f.int(total)} matching lines` : 'Counting…'} · updated {f.ago(asOf)}</span>}
        actions={
          <button type="button" className="ao-btn primary" onClick={yourLastRun} {...tourAnchor('ops.logs.trace')} disabled={lastRun.state === 'loading'}>
            <IconTrace /> {lastRun.state === 'loading' ? 'Finding your run…' : 'Your last run'}
          </button>
        }
      />

      {lastRun.state === 'none' ? (
        <Callout title="No live Signal Loop run yet.">
          Run a call in <Link to="/app/new" className="ao-link">Signal Loop</Link> (or follow the walkthrough), then press “Your last run” again. Its trace appears here with every step, AI call and delivery.
        </Callout>
      ) : null}
      {lastRun.state === 'found' && lastRun.run ? (
        <Callout tone="live" title={lastRun.run.isYours ? 'Your latest Signal Loop run.' : 'Latest live Signal Loop run (none from your workspace yet).'}>
          Run <span className="ao-mono">{lastRun.run.runId ?? '—'}</span> at {f.time(lastRun.run.at, timezone)}.{' '}
          <Link to={`/ops/traces/${lastRun.run.traceId}`} className="ao-link">
            Open the trace →
          </Link>
        </Callout>
      ) : null}

      <Panel flush attrs={tourAnchor('ops.logs')}>
        <form
          className="ao-filters"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim() || null);
          }}
        >
          <label className="ao-field grow">
            <span>Search message, event, trace or run id</span>
            <input className="ao-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: fallback, delivery.retry, run_sl_0042" />
          </label>
          <label className="ao-field">
            <span>Agent</span>
            <select className="ao-select" value={params.get('agentId') ?? ''} onChange={(e) => set('agentId', e.target.value || null)}>
              <option value="">All agents</option>
              {(reg.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ao-field">
            <span>Area</span>
            <select className="ao-select" value={params.get('component') ?? ''} onChange={(e) => set('component', e.target.value || null)}>
              <option value="">Any area</option>
              {COMPONENTS.map((c) => (
                <option key={c} value={c}>
                  {AREA_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <div className="ao-field">
            <span>Level</span>
            <div className="ao-chiprow" role="group" aria-label="Levels">
              {LEVELS.map((l) => (
                <button key={l} type="button" aria-pressed={!levels.length || levels.includes(l)} onClick={() => toggleLevel(l)} aria-label={l}>
                  <span className={`ao-lv ${l}`}>{levelLabel(l)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ao-field">
            <span>Source</span>
            <Seg
              label="Source"
              value={params.get('source') ?? 'all'}
              onChange={(v) => set('source', v === 'all' ? null : v)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'live', label: 'Live' },
                { value: 'simulated', label: 'Simulated' },
              ]}
            />
          </div>
          <button type="submit" className="ao-btn">
            Search
          </button>
        </form>
        {active.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 20px', borderBottom: '1px solid var(--ao-border)', alignItems: 'center' }}>
            <span className="ao-muted" style={{ fontSize: 13 }}>
              Filtered by
            </span>
            {active.map((k) => (
              <button key={k} type="button" className="ao-tag" onClick={() => set(k, null)} aria-label={`Remove filter ${FILTER_LABEL[k] ?? k}`}>
                {FILTER_LABEL[k] ?? k}:{' '}
                {k === 'traceId' || k === 'runId' ? <span className="ao-mono">{params.get(k)}</span> : <span>{k === 'agentId' ? names[params.get(k)!] ?? params.get(k) : k === 'component' ? AREA_LABEL[params.get(k)!] ?? params.get(k) : k === 'level' ? params.get(k)!.split(',').map(levelLabel).join(', ') : params.get(k)}</span>}{' '}
                <IconX size={10} />
              </button>
            ))}
            <button type="button" className="ao-btn ghost sm" onClick={() => setParams(new URLSearchParams())}>
              Clear all
            </button>
            {params.get('traceId') ? (
              <Link to={`/ops/traces/${params.get('traceId')}`} className="ao-btn sm primary" style={{ marginLeft: 'auto' }}>
                <IconTrace /> Open trace
              </Link>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={error} onRetry={() => load(null)} />
          </div>
        ) : rows.length === 0 && !loading ? (
          <Empty title="No log lines match">Loosen a filter, or run something in Signal Loop to create live rows.</Empty>
        ) : (
          <div className="ao-table-wrap" style={{ maxHeight: 640, overflowY: 'auto' }}>
            <table className="ao-table ao-logtable compact ao-fit">
              <caption className="ao-sr">Log lines, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Time ({f.tzLabel(timezone)})</th>
                  <th scope="col">Level</th>
                  <th scope="col" className="ao-hide-sm">Agent</th>
                  <th scope="col" className="ao-hide-sm ao-hide-md">Event</th>
                  <th scope="col">Message</th>
                  <th scope="col" className="ao-hide-sm">Trace</th>
                  <th scope="col" className="num ao-hide-sm ao-hide-md">
                    Took
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr
                    key={l.id}
                    className={`clickable lvl-${l.level}`}
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button')) return;
                      setOpen(l);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(l);
                    }}
                    aria-label={`${levelLabel(l.level)} ${l.event}: ${rewriteModelIds(l.message)}`}
                  >
                    <td className="when" title={f.time(l.at, timezone, true)}>
                      <span className="ao-hide-sm">{f.day(l.at)}, </span>
                      {f.clock(l.at, timezone)}
                    </td>
                    <td>
                      <span className={`ao-lv ${l.level}`}>{levelLabel(l.level)}</span>
                    </td>
                    <td className="ao-hide-sm" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'grid' }}>
                        <span>{names[l.agentId] ?? l.agentId}</span>
                        <small className="ao-muted" style={{ fontSize: 12 }}>
                          {AREA_LABEL[l.component] ?? l.component}
                          {l.source === 'live' ? ' · live' : ''}
                        </small>
                      </span>
                    </td>
                    <td className="ao-mono ao-hide-sm ao-hide-md" style={{ whiteSpace: 'nowrap', color: 'var(--ao-text-2)' }}>
                      {l.event}
                    </td>
                    <td className="msg">
                      <span title={rewriteModelIds(l.message)}>{rewriteModelIds(l.message)}</span>
                    </td>
                    <td className="ao-hide-sm">
                      <Link className="ao-trace-btn" to={`/ops/traces/${l.traceId}`} title={l.traceId}>
                        {l.traceId.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="num ao-hide-sm ao-hide-md" style={{ whiteSpace: 'nowrap', color: 'var(--ao-text-2)' }}>{l.durationMs != null ? f.ms(l.durationMs) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="ao-panel-foot">
          <span>
            Showing {f.int(rows.length)}
            {total != null ? ` of ${f.int(total)}` : ''}, newest first
          </span>
          {next ? (
            <button type="button" className="ao-btn sm" onClick={() => load(next)} disabled={loading}>
              {loading ? 'Loading…' : 'Load 100 more'}
            </button>
          ) : rows.length ? (
            <span>End of results</span>
          ) : null}
        </div>
      </Panel>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? open.event : ''}
        sub={open ? `${names[open.agentId] ?? open.agentId} · ${f.time(open.at, timezone, true)}` : undefined}
        foot={
          open ? (
            <>
              {open.runId ? (
                <button type="button" className="ao-btn" onClick={() => { setOpen(null); navigate(`/ops/logs?runId=${open.runId}`); }}>
                  All logs for this run
                </button>
              ) : null}
              <Link to={`/ops/traces/${open.traceId}`} className="ao-btn primary">
                <IconTrace /> Open trace
              </Link>
            </>
          ) : null
        }
      >
        {open ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`ao-lv ${open.level}`}>{levelLabel(open.level)}</span>
              <SourceChip source={open.source} />
              <span className="ao-tag">{AREA_LABEL[open.component] ?? open.component}</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ao-text)' }}>{rewriteModelIds(open.message)}</p>
            <dl className="ao-kv">
              <dt>Trace id</dt>
              <dd className="ao-mono">{open.traceId}</dd>
              <dt>Step id</dt>
              <dd className="ao-mono">{open.spanId ?? '—'}</dd>
              <dt>Run id</dt>
              <dd className="ao-mono">{open.runId ?? '—'}</dd>
              <dt>Workspace</dt>
              <dd className="ao-mono">{open.workspaceId ?? '—'}</dd>
              <dt>Duration</dt>
              <dd>{open.durationMs != null ? f.ms(open.durationMs) : '—'}</dd>
            </dl>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--ao-text-2)' }}>Details</h3>
              <pre className="ao-json">{JSON.stringify(relabelModelsDeep(open.fields), null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
