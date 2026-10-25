import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import type { Span } from '../../shared/platform-contracts';
import { relabelModelsDeep, rewriteModelIds } from '../../shared/modelLabels';
import { explainSpanErrors } from '../../shared/format';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { RegistryRow, TraceView } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Empty, ErrorState, PageHead, PageSkeleton, Panel, SourceChip } from '../ui/kit';
import { AREA_LABEL, levelLabel } from './Logs';

const KINDS = [
  { key: 'request', label: 'API request', color: '#3E8E9E', test: (n: string) => /^(GET|POST|PUT|DELETE|PATCH) /.test(n) },
  { key: 'workflow', label: 'Workflow', color: '#2F5DB8', test: (n: string) => n.startsWith('workflow') || n.startsWith('gumloop flow') },
  { key: 'step', label: 'Step', color: '#008463', test: (n: string) => n.startsWith('step.') },
  { key: 'ai', label: 'AI call', color: '#7A4FB5', test: (n: string) => n.startsWith('ai.') },
  { key: 'delivery', label: 'Delivery', color: '#C2780C', test: (n: string) => n.startsWith('delivery.') },
  { key: 'run', label: 'Run', color: '#6B756F', test: (n: string) => n.startsWith('run ') },
] as const;
function kindOf(name: string) {
  return KINDS.find((k) => k.test(name)) ?? { key: 'other', label: 'Other', color: '#8A938E' };
}

type Row = { span: Span; depth: number; startMs: number };

function buildRows(spans: Span[]): { rows: Row[]; t0: number; total: number } {
  if (!spans.length) return { rows: [], t0: 0, total: 0 };
  const t0 = Math.min(...spans.map((s) => Date.parse(s.start)));
  const end = Math.max(...spans.map((s) => Date.parse(s.start) + s.durationMs));
  const ids = new Set(spans.map((s) => s.spanId));
  const kids = new Map<string | null, Span[]>();
  for (const s of spans) {
    const p = s.parentId && ids.has(s.parentId) ? s.parentId : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(s);
  }
  for (const list of kids.values()) list.sort((a, b) => a.start.localeCompare(b.start) || b.durationMs - a.durationMs);
  const rows: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const s of kids.get(parent) ?? []) {
      rows.push({ span: s, depth, startMs: Date.parse(s.start) - t0 });
      if (depth < 12) walk(s.spanId, depth + 1);
    }
  };
  walk(null, 0);
  return { rows, t0, total: Math.max(1, end - t0) };
}

function ticks(total: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000];
  const step = steps.find((s) => total / s <= 6) ?? 600_000;
  const out: number[] = [];
  for (let t = 0; t <= total; t += step) out.push(t);
  return out;
}

export function Trace() {
  const { traceId = '' } = useParams();
  const tr = useApi<TraceView>(`/traces/${encodeURIComponent(traceId)}`, { pollMs: 8_000 });
  const reg = useApi<RegistryRow[]>('/agents');
  const { timezone } = useTimezone();
  const [sel, setSel] = useState<string | null>(null);
  const built = useMemo(() => buildRows(tr.data?.spans ?? []), [tr.data]);

  if (tr.error && !tr.data)
    return (
      <div className="ao-page">
        {tr.error.status === 404 ? (
          <Empty title="No trace with that id">
            Nothing recorded under <span className="ao-mono">{traceId}</span>. <Link to="/ops/logs">Back to logs</Link>
          </Empty>
        ) : (
          <ErrorState message={tr.error.message} onRetry={tr.reload} />
        )}
      </div>
    );
  if (!tr.data) return <PageSkeleton />;
  const d = tr.data;
  const agent = reg.data?.find((r) => r.id === d.agentId);
  const ai = d.spans.filter((s) => s.name.startsWith('ai.'));
  const tokens = ai.reduce((s, x) => s + Number(x.attrs.tokensIn ?? 0) + Number(x.attrs.tokensOut ?? 0), 0);
  const cost = ai.reduce((s, x) => s + Number(x.attrs.costUsd ?? 0), 0);
  const errors = d.spans.filter((s) => s.status === 'error').length;
  const errorNote = explainSpanErrors(d.spans);
  const fallbacks = ai.filter((s) => s.attrs.fallback === true || s.status === 'error').length;
  const runId = (d.spans.find((s) => s.attrs.runId)?.attrs.runId as string | undefined) ?? d.logs.find((l) => l.runId)?.runId ?? null;
  const selected = built.rows.find((r) => r.span.spanId === sel)?.span ?? null;
  const selLogs = selected ? d.logs.filter((l) => l.spanId === selected.spanId) : [];
  const tk = ticks(built.total);

  return (
    <div className="ao-page">
      <PageHead
        title={runId ? `Run ${runId}` : 'Trace'}
        sub="Everything that happened in one request, on one timeline: the API call, the workflow and its steps, each AI call and each delivery. Select a step for its details and log lines."
        meta={
          <>
            {agent ? <Link to={`/ops/agents/${agent.id}`} className="ao-link">{agent.name}</Link> : null}
            {built.rows[0] ? <span>Started {f.time(built.rows[0].span.start, timezone, true)}</span> : null}
            {d.source ? <SourceChip source={d.source} /> : null}
            <span>
              Trace id <span className="ao-mono" style={{ color: 'var(--ao-text-2)' }}>{traceId}</span>
            </span>
          </>
        }
        actions={
          <Link className="ao-btn" to={`/ops/logs?traceId=${traceId}`}>
            Logs for this trace
          </Link>
        }
      />
      <MetricStrip
        minItemWidth={140}
        label="Trace summary"
        items={[
          { label: 'Total time', value: f.ms(built.total) },
          { label: 'Steps', value: d.spans.length, help: 'Each timed piece of work in this request (a span): the request itself, workflow steps, AI calls and deliveries.' },
          { label: 'AI calls', value: ai.length, sub: fallbacks ? `${fallbacks} switched to the backup model` : 'None used the backup model' },
          { label: 'Tokens', value: f.int(tokens), help: 'Text the AI read and wrote, in tokens (roughly ¾ of a word each). AI cost is priced per token.' },
          { label: 'AI cost', value: f.money(cost, { precise: true }) },
          { label: 'Errors', value: errors, accent: errors ? 'var(--ao-danger)' : undefined, sub: errorNote ?? 'None' },
        ]}
      />
      <Panel title="Timeline" sub="Each bar is one step, placed on a shared clock from the start of the request. Red bars ended in an error." attrs={tourAnchor('ops.trace.waterfall')} flush>
        <div style={{ padding: '14px 20px 0' }}>
          <div className="ao-wf-legend">
            {KINDS.map((k) => (
              <span key={k.key}>
                <i style={{ background: k.color }} aria-hidden="true" />
                {k.label}
              </span>
            ))}
          </div>
        </div>
        {built.rows.length ? (
          <div style={{ overflowX: 'auto', padding: '12px 20px 16px' }}>
            <div className="ao-wf" role="list" aria-label="Steps">
              <div className="ao-wf-axis" aria-hidden="true">
                <span>Step</span>
                <span className="ao-wf-ticks">
                  {tk.map((t) => (
                    <span key={t} style={{ left: `${(t / built.total) * 100}%` }}>
                      {f.offset(t)}
                    </span>
                  ))}
                </span>
                <span style={{ textAlign: 'right', paddingRight: 6 }}>Duration</span>
              </div>
              {built.rows.map((r) => {
                const k = kindOf(r.span.name);
                const left = (r.startMs / built.total) * 100;
                const width = Math.max(0.3, (r.span.durationMs / built.total) * 100);
                return (
                  <button
                    key={r.span.spanId}
                    type="button"
                    role="listitem"
                    className="ao-wf-row"
                    aria-pressed={sel === r.span.spanId}
                    onClick={() => setSel(sel === r.span.spanId ? null : r.span.spanId)}
                    aria-label={`${rewriteModelIds(r.span.name)}, ${f.ms(r.span.durationMs)}, starts at ${f.offset(r.startMs)}${r.span.status === 'error' ? ', error' : ''}`}
                    data-kind={k.key}
                  >
                    <span className="ao-wf-name" style={{ paddingLeft: r.depth * 14 }}>
                      <span className="kd" style={{ background: k.color }} aria-hidden="true" />
                      <span className="nm" title={rewriteModelIds(r.span.name)}>
                        {rewriteModelIds(r.span.name)}
                      </span>
                      {r.span.attrs.fallback === true ? <span className="ao-pill warning">Backup model</span> : null}
                      {r.span.status === 'error' ? <span className="ao-pill danger">Error</span> : null}
                    </span>
                    <span className="ao-wf-lane" aria-hidden="true">
                      {tk.map((t) => (
                        <span key={t} className="grid" style={{ left: `${(t / built.total) * 100}%` }} />
                      ))}
                      <span className={`ao-wf-bar${r.span.status === 'error' ? ' err' : ''}`} style={{ left: `${left}%`, width: `${width}%`, background: r.span.status === 'error' ? '#B42318' : k.color }} />
                    </span>
                    <span className="ao-wf-ms">{f.ms(r.span.durationMs)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty title="No timed steps recorded for this trace">The log lines below are everything recorded for it.</Empty>
        )}
      </Panel>

      {selected ? (
        <Panel title={rewriteModelIds(selected.name)} sub={`Took ${f.ms(selected.durationMs)} · ${selected.status === 'error' ? 'ended in an error' : 'completed'} · step id ${selected.spanId}`} actions={<button type="button" className="ao-btn sm" onClick={() => setSel(null)}>Close</button>}>
          <div className="ao-grid g-2">
            <div>
              <h3 className="ao-subhead">Attributes</h3>
              <pre className="ao-json">{JSON.stringify(relabelModelsDeep(selected.attrs), null, 2)}</pre>
            </div>
            <div>
              <h3 className="ao-subhead">Log lines for this step</h3>
              {selLogs.length ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {selLogs.map((l) => (
                    <li key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, flexWrap: 'wrap' }}>
                      <span className={`ao-lv ${l.level}`}>{levelLabel(l.level)}</span>
                      <span className="ao-mono">{l.event}</span>
                      <span>{rewriteModelIds(l.message)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ao-muted" style={{ margin: 0 }}>
                  No log lines for this step.
                </p>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Log lines" sub={`${d.logs.length} line${d.logs.length === 1 ? '' : 's'} from this request${runId ? ` and run ${runId}` : ''}, oldest first.`} flush>
        <div className="ao-table-wrap">
          <table className="ao-table ao-logtable compact">
            <caption className="ao-sr">Correlated logs</caption>
            <thead>
              <tr>
                <th scope="col">After</th>
                <th scope="col">Level</th>
                <th scope="col" className="ao-hide-sm">Area</th>
                <th scope="col" className="ao-hide-sm">Event</th>
                <th scope="col">Message</th>
                <th scope="col" className="num">
                  Took
                </th>
              </tr>
            </thead>
            <tbody>
              {d.logs.map((l) => (
                <tr key={l.id} className={`lvl-${l.level}${sel && l.spanId === sel ? ' is-selected' : ''}`}>
                  <td className="when">{built.rows.length ? f.offset(Math.max(0, Date.parse(l.at) - built.t0)) : f.clock(l.at, timezone)}</td>
                  <td>
                    <span className={`ao-lv ${l.level}`}>{levelLabel(l.level)}</span>
                  </td>
                  <td className="ao-hide-sm">{AREA_LABEL[l.component] ?? l.component}</td>
                  <td className="ao-mono ao-hide-sm" style={{ color: 'var(--ao-text-2)' }}>{l.event}</td>
                  <td className="msg">
                    <span title={rewriteModelIds(l.message)}>{rewriteModelIds(l.message)}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap', color: 'var(--ao-text-2)' }}>{l.durationMs != null ? f.ms(l.durationMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
