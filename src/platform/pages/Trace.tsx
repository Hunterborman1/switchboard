import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import type { Span } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../uis/TimezoneContext';
import type { RegistryRow, TraceView } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Empty, ErrorState, PageHead, PageSkeleton, Panel, SourceChip } from '../ui/kit';

const KINDS = [
  { key: 'request', label: 'API request', color: '#102A56', test: (n: string) => /^(GET|POST|PUT|DELETE|PATCH) /.test(n) },
  { key: 'workflow', label: 'Workflow', color: '#5E74E3', test: (n: string) => n.startsWith('workflow') || n.startsWith('gumloop flow') },
  { key: 'step', label: 'Step', color: '#00A87F', test: (n: string) => n.startsWith('step.') },
  { key: 'ai', label: 'AI call', color: '#7C4DCC', test: (n: string) => n.startsWith('ai.') },
  { key: 'delivery', label: 'Delivery', color: '#D08A1E', test: (n: string) => n.startsWith('delivery.') },
  { key: 'run', label: 'Run', color: '#6B6F86', test: (n: string) => n.startsWith('run ') },
] as const;
function kindOf(name: string) {
  return KINDS.find((k) => k.test(name)) ?? { key: 'other', label: 'Other', color: '#8E9491' };
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
  const fallbacks = ai.filter((s) => s.attrs.fallback === true || s.status === 'error').length;
  const runId = (d.spans.find((s) => s.attrs.runId)?.attrs.runId as string | undefined) ?? d.logs.find((l) => l.runId)?.runId ?? null;
  const selected = built.rows.find((r) => r.span.spanId === sel)?.span ?? null;
  const selLogs = selected ? d.logs.filter((l) => l.spanId === selected.spanId) : [];
  const tk = ticks(built.total);

  return (
    <div className="ao-page">
      <PageHead
        eyebrow={
          <>
            <Link to="/ops/logs" className="ao-link">
              Logs & traces
            </Link>{' '}
            · Trace
          </>
        }
        title={runId ? `Run ${runId}` : 'Trace'}
        sub="Every span in the request: the API call, the workflow and its steps, each AI call (model, tokens, cost, fallback) and each delivery. Select a span for its attributes and logs."
        meta={
          <>
            <span className="ao-mono">{traceId}</span>
            {d.source ? <SourceChip source={d.source} /> : null}
            {agent ? <Link to={`/ops/agents/${agent.id}`} className="ao-link">{agent.name}</Link> : null}
            {built.rows[0] ? <span>started {f.time(built.rows[0].span.start, timezone, true)}</span> : null}
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
          { label: 'Duration', value: f.ms(built.total) },
          { label: 'Spans', value: d.spans.length },
          { label: 'AI calls', value: ai.length, sub: fallbacks ? `${fallbacks} failed over to fallback` : 'no fallbacks' },
          { label: 'Tokens', value: f.int(tokens) },
          { label: 'AI cost', value: f.money(cost, { precise: true }) },
          { label: 'Errors', value: errors, accent: errors ? 'var(--cn-danger-txt)' : undefined },
        ]}
      />
      <Panel title="Span waterfall" sub="Bars are positioned on one time axis from the first span. Striped bars ended in an error." attrs={tourAnchor('ops.trace.waterfall')} flush>
        <div style={{ padding: '12px 18px 0' }}>
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
          <div style={{ overflowX: 'auto', padding: '12px 18px 16px' }}>
            <div className="ao-wf" role="list" aria-label="Spans">
              <div className="ao-wf-axis" aria-hidden="true">
                <span>Span</span>
                <span className="ao-wf-ticks">
                  {tk.map((t) => (
                    <span key={t} style={{ left: `${(t / built.total) * 100}%` }}>
                      {f.ms(t)}
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
                    aria-label={`${r.span.name}, ${f.ms(r.span.durationMs)}, starts at ${f.ms(r.startMs)}${r.span.status === 'error' ? ', error' : ''}`}
                    data-kind={k.key}
                  >
                    <span className="ao-wf-name" style={{ paddingLeft: r.depth * 14 }}>
                      <span className="kd" style={{ background: k.color }} aria-hidden="true" />
                      <span className="nm" title={r.span.name}>
                        {r.span.name}
                      </span>
                      {r.span.attrs.fallback === true ? <span className="ao-pill warning" style={{ fontSize: 10 }}>fallback</span> : null}
                      {r.span.status === 'error' ? <span className="ao-pill danger" style={{ fontSize: 10 }}>error</span> : null}
                    </span>
                    <span className="ao-wf-lane" aria-hidden="true">
                      {tk.map((t) => (
                        <span key={t} className="grid" style={{ left: `${(t / built.total) * 100}%` }} />
                      ))}
                      <span className={`ao-wf-bar${r.span.status === 'error' ? ' err' : ''}`} style={{ left: `${left}%`, width: `${width}%`, background: r.span.status === 'error' ? '#CF2519' : k.color }} />
                    </span>
                    <span className="ao-wf-ms">{f.ms(r.span.durationMs)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty title="No spans recorded for this trace">The logs below are all there is; spans arrive with the SDK’s span() calls.</Empty>
        )}
      </Panel>

      {selected ? (
        <Panel title={selected.name} sub={`Span ${selected.spanId} · ${f.ms(selected.durationMs)} · ${selected.status}`} actions={<button type="button" className="ao-btn sm" onClick={() => setSel(null)}>Close</button>}>
          <div className="ao-grid g-2">
            <div>
              <h3 style={{ fontSize: 'var(--fs-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--cn-ink-3-txt)', fontWeight: 500, marginBottom: 6 }}>Attributes</h3>
              <pre className="ao-json">{JSON.stringify(selected.attrs, null, 2)}</pre>
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--fs-micro)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--cn-ink-3-txt)', fontWeight: 500, marginBottom: 6 }}>Logs on this span</h3>
              {selLogs.length ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {selLogs.map((l) => (
                    <li key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 'var(--fs-body-sm)' }}>
                      <span className={`ao-lv ${l.level}`}>{l.level}</span>
                      <span className="ao-mono">{l.event}</span>
                      <span>{l.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ao-muted" style={{ margin: 0 }}>
                  No log lines on this span.
                </p>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Correlated logs" sub={`${d.logs.length} lines on this trace${runId ? ` and run ${runId}` : ''}, oldest first.`} flush>
        <div className="ao-table-wrap">
          <table className="ao-table ao-logtable compact">
            <caption className="ao-sr">Correlated logs</caption>
            <thead>
              <tr>
                <th scope="col">+ms</th>
                <th scope="col">Level</th>
                <th scope="col" className="ao-hide-sm">Component</th>
                <th scope="col" className="ao-hide-sm">Event</th>
                <th scope="col">Message</th>
                <th scope="col" className="num">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {d.logs.map((l) => (
                <tr key={l.id} className={`lvl-${l.level}${sel && l.spanId === sel ? ' is-selected' : ''}`}>
                  <td className="ao-mono" style={{ whiteSpace: 'nowrap' }}>{built.rows.length ? f.ms(Math.max(0, Date.parse(l.at) - built.t0)) : f.clock(l.at, timezone)}</td>
                  <td>
                    <span className={`ao-lv ${l.level}`}>{l.level}</span>
                  </td>
                  <td className="ao-hide-sm">{l.component}</td>
                  <td className="ao-mono ao-hide-sm">{l.event}</td>
                  <td className="msg">
                    <span title={l.message}>{l.message}</span>
                  </td>
                  <td className="num ao-mono">{l.durationMs != null ? f.ms(l.durationMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
