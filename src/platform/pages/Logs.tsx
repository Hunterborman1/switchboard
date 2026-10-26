/**
 * Logs and traces: every request, workflow step, AI call, delivery and budget check from every
 * agent, newest first. Filters live in the URL; a row opens its detail; lines from one run share
 * a trace.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, ButtonLink, Callout, Card, Checkbox, Drawer, EmptyState, KeyValue, Page, PageHeader, SearchInput, Segmented, Select, Table, TableSkeleton, type Tone } from '../../ds';
import { IconFileText, IconX } from '../../ds/icons';
import { relabelModelsDeep, rewriteModelIds } from '../../shared/modelLabels';
import type { LogEntry } from '../../shared/platform-contracts';
import { PLATFORM_API_BASE } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { LogsPage, RegistryRow, YourLastRun } from '../../worker/platform/types';
import { ApiError, useApi } from '../lib/api';
import * as f from '../lib/format';
import { IconTrace } from '../ui/icons';
import { LoadError, SourceBadge, useOpsTitle } from '../ui/kit';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const LEVEL_LABEL: Record<string, string> = { debug: 'Debug', info: 'Info', warn: 'Warning', error: 'Error' };
const LEVEL_TONE: Record<string, Tone> = { debug: 'neutral', info: 'info', warn: 'warning', error: 'danger' };
export const levelLabel = (l: string) => LEVEL_LABEL[l] ?? l;
const FILTER_LABEL: Record<string, string> = { agentId: 'Agent', level: 'Level', component: 'Area', traceId: 'Trace', runId: 'Run', q: 'Search', source: 'Data', web: 'Web requests' };
const COMPONENTS = ['api', 'workflow', 'ai', 'delivery', 'budget', 'gumloop', 'telemetry', 'gate'];
/** Plain names for the log components (the raw key stays in the URL and the detail panel). */
export const AREA_LABEL: Record<string, string> = { api: 'API', workflow: 'Workflow', ai: 'AI call', delivery: 'Delivery', budget: 'Budget', gumloop: 'Gumloop', telemetry: 'Usage tracking', gate: 'Sign-in' };
const FILTER_KEYS = ['agentId', 'level', 'component', 'traceId', 'runId', 'q', 'source', 'web'] as const;

/** A log level as a badge (colour and word). */
export function LevelBadge({ level }: { level: string }) {
  return <Badge tone={LEVEL_TONE[level] ?? 'neutral'}>{levelLabel(level)}</Badge>;
}

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
  useOpsTitle('Logs and traces');
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
  const [error, setError] = useState<Error | null>(null);
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
      setError(e instanceof Error ? e : new Error('Could not load logs'));
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
  const active = FILTER_KEYS.filter((k) => params.get(k) && k !== 'web');
  // Routine web requests (successful page and API calls) are hidden unless asked for; a trace,
  // run or API-area filter always shows them (the same rule as the API: includesWebRequests).
  const webForced = !!params.get('traceId') || !!params.get('runId') || params.get('component') === 'api';
  const webOn = webForced || params.get('web') === '1';
  const firstLoad = loading && pages.length === 0;

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

  const chipValue = (k: string) => {
    const v = params.get(k)!;
    if (k === 'agentId') return names[v] ?? v;
    if (k === 'component') return AREA_LABEL[v] ?? v;
    if (k === 'level') return v.split(',').map(levelLabel).join(', ');
    if (k === 'source') return v === 'live' ? 'Live' : v === 'simulated' ? 'Simulated' : v;
    return v;
  };

  return (
    <Page>
      <PageHeader
        title="Logs and traces"
        description="Every request, step, AI call and delivery from every agent, newest first."
        meta={
          <>
            <span>
              {total != null ? `${f.int(total)} matching lines` : 'Counting lines'}
              {webOn ? '' : ', routine web requests hidden'}
            </span>
            {asOf ? <span>Updated {f.ago(asOf)}</span> : null}
          </>
        }
        actions={
          <Button variant="primary" icon={<IconTrace />} onClick={yourLastRun} loading={lastRun.state === 'loading'} {...tourAnchor('ops.logs.trace')}>
            {lastRun.state === 'loading' ? 'Finding your run' : 'Your last run'}
          </Button>
        }
      />

      {lastRun.state === 'none' ? (
        <Callout tone="info" title="No live Signal Loop run yet.">
          Run a conversation in <Link to="/app/new">Switchboard</Link> (or follow the walkthrough), then select Your last run again.
        </Callout>
      ) : null}
      {lastRun.state === 'found' && lastRun.run ? (
        <Callout
          tone="success"
          title={lastRun.run.isYours ? 'Your latest Signal Loop run.' : 'Latest live Signal Loop run (none from your workspace yet).'}
          actions={
            <ButtonLink size="sm" to={`/ops/traces/${lastRun.run.traceId}`} icon={<IconTrace size={14} />}>
              Open the trace
            </ButtonLink>
          }
        >
          Run <span className="ao-mono">{lastRun.run.runId ?? 'unknown'}</span> at {f.time(lastRun.run.at, timezone)}.
        </Callout>
      ) : null}

      <form
        className="ao-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', q.trim() || null);
        }}
      >
        <div className="ds-toolbar">
          <div className="ds-toolbar__group">
            <SearchInput aria-label="Search message, event, trace or run id" placeholder="Search messages, events or ids" value={q} onChange={(e) => setQ(e.target.value)} width={300} />
            <Button type="submit">Search</Button>
          </div>
          <div className="ds-toolbar__group">
            <Select
              aria-label="Agent"
              value={params.get('agentId') ?? ''}
              onChange={(e) => set('agentId', e.target.value || null)}
              options={[{ value: '', label: 'All agents' }, ...(reg.data ?? []).map((r) => ({ value: r.id, label: r.name }))]}
              style={{ width: 200 }}
            />
            <Select
              aria-label="Area"
              value={params.get('component') ?? ''}
              onChange={(e) => set('component', e.target.value || null)}
              options={[{ value: '', label: 'Any area' }, ...COMPONENTS.map((c) => ({ value: c, label: AREA_LABEL[c] ?? c }))]}
              style={{ width: 150 }}
            />
          </div>
        </div>
        <div className="ds-toolbar">
          <div className="ds-toolbar__group">
            <div className="ao-levels" role="group" aria-label="Levels">
              {LEVELS.map((l) => (
                <button key={l} type="button" className="ao-level" aria-pressed={!levels.length || levels.includes(l)} onClick={() => toggleLevel(l)} aria-label={l}>
                  <span className={`ao-level__dot ao-level__dot--${l}`} aria-hidden="true" />
                  {levelLabel(l)}
                </button>
              ))}
            </div>
            <span title={webForced ? 'A trace, a run or the API area always includes its web requests.' : 'Successful page and API requests. Failed requests always show.'}>
              <Checkbox checked={webOn} disabled={webForced} onChange={(v) => set('web', v ? '1' : null)}>
                Include web requests
              </Checkbox>
            </span>
          </div>
          <div className="ds-toolbar__group">
            <Segmented
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
        </div>
      </form>

      {active.length ? (
        <div className="ao-chips" aria-label="Active filters">
          <span className="ao-note">Filtered by</span>
          {active.map((k) => (
            <button key={k} type="button" className="ao-chip" onClick={() => set(k, null)} aria-label={`Remove filter ${FILTER_LABEL[k] ?? k}`}>
              <span className="ao-chip__key">{FILTER_LABEL[k] ?? k}</span>
              <span className={`ao-chip__value${k === 'traceId' || k === 'runId' ? ' ao-mono' : ''}`}>{chipValue(k)}</span>
              <IconX size={12} />
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams())}>
            Clear all
          </Button>
          {params.get('traceId') ? (
            <span className="ao-chips__end">
              <ButtonLink to={`/ops/traces/${params.get('traceId')}`} size="sm" variant="primary" icon={<IconTrace size={14} />}>
                Open trace
              </ButtonLink>
            </span>
          ) : null}
        </div>
      ) : null}

      {firstLoad ? (
        <TableSkeleton rows={10} cols={6} />
      ) : error && !rows.length ? (
        <LoadError error={error} onRetry={() => void load(null)} what="logs" />
      ) : (
        <Card
          flush
          attrs={tourAnchor('ops.logs')}
          footer={
            rows.length ? (
              <>
                <span>
                  Showing {f.int(rows.length)}
                  {total != null ? ` of ${f.int(total)}` : ''}, newest first
                </span>
                {next ? (
                  <Button size="sm" variant="ghost" onClick={() => void load(next)} loading={loading}>
                    Load 100 more
                  </Button>
                ) : (
                  <span>End of results</span>
                )}
              </>
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<IconFileText />}
              title="No log lines match"
              description="Loosen a filter, or run something in Switchboard to create live lines."
              actions={
                active.length ? (
                  <Button size="sm" onClick={() => setParams(new URLSearchParams())}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="ao-logscroll">
              <Table label="Log lines, newest first" compact>
                <thead>
                  <tr>
                    <th>Time ({f.tzLabel(timezone)})</th>
                    <th>Level</th>
                    <th className="ao-hide-sm">Agent</th>
                    <th className="ao-hide-sm ao-hide-md">Event</th>
                    <th className="ao-end-sm">Message</th>
                    <th className="ao-hide-sm ao-end-md">Trace</th>
                    <th className="is-num ao-hide-sm ao-hide-md">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr
                      key={l.id}
                      className="is-clickable"
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
                      <td className="is-nowrap ds-num" title={f.time(l.at, timezone, true)}>
                        <span className="ao-hide-sm">{f.day(l.at)}, </span>
                        {f.clock(l.at, timezone)}
                      </td>
                      <td className="is-nowrap">
                        <LevelBadge level={l.level} />
                      </td>
                      <td className="ao-hide-sm is-nowrap">
                        <span className="ds-table__primary">{names[l.agentId] ?? l.agentId}</span>
                        <span className="ds-table__secondary">
                          {AREA_LABEL[l.component] ?? l.component}
                          {l.source === 'live' ? ', live' : ''}
                        </span>
                      </td>
                      <td className="ao-hide-sm ao-hide-md is-nowrap">
                        <span className="ao-mono ds-muted">{l.event}</span>
                      </td>
                      <td className="ao-end-sm">
                        <span className="ao-msg" title={rewriteModelIds(l.message)}>
                          {rewriteModelIds(l.message)}
                        </span>
                      </td>
                      <td className="ao-hide-sm ao-end-md is-nowrap">
                        <Link className="ao-mono" to={`/ops/traces/${l.traceId}`} title={`Open trace ${l.traceId}`}>
                          {l.traceId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="is-num ao-hide-sm ao-hide-md ds-muted">{l.durationMs != null ? f.ms(l.durationMs) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? <span className="ao-mono" style={{ fontSize: 15 }}>{open.event}</span> : ''}
        description={open ? `${names[open.agentId] ?? open.agentId}, ${f.time(open.at, timezone, true)}` : undefined}
        footer={
          open ? (
            <>
              {open.runId ? (
                <Button
                  onClick={() => {
                    setOpen(null);
                    navigate(`/ops/logs?runId=${open.runId}`);
                  }}
                >
                  All logs for this run
                </Button>
              ) : null}
              <ButtonLink to={`/ops/traces/${open.traceId}`} variant="primary" icon={<IconTrace />}>
                Open trace
              </ButtonLink>
            </>
          ) : null
        }
      >
        {open ? (
          <>
            <div className="ao-inline">
              <LevelBadge level={open.level} />
              <SourceBadge source={open.source} />
              <Badge outline>{AREA_LABEL[open.component] ?? open.component}</Badge>
            </div>
            <p className="ao-drawer-message">{rewriteModelIds(open.message)}</p>
            <KeyValue
              items={[
                { label: 'Trace id', value: <span className="ao-mono">{open.traceId}</span> },
                { label: 'Step id', value: <span className="ao-mono">{open.spanId ?? '—'}</span> },
                { label: 'Run id', value: <span className="ao-mono">{open.runId ?? '—'}</span> },
                { label: 'Workspace', value: <span className="ao-mono">{open.workspaceId ?? '—'}</span> },
                { label: 'Duration', value: open.durationMs != null ? f.ms(open.durationMs) : '—' },
              ]}
            />
            <section>
              <h3 className="ao-subhead">Details</h3>
              <pre className="ao-json">{JSON.stringify(relabelModelsDeep(open.fields), null, 2)}</pre>
            </section>
          </>
        ) : null}
      </Drawer>
    </Page>
  );
}
