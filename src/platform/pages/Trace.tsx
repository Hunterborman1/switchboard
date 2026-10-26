/**
 * One trace: everything that happened in one request on a shared clock (the API call, the
 * workflow and its steps, each AI call and delivery), then the correlated log lines.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, CopyText, EmptyState, Page, PageHeader, Stats, Table, useCrumbs } from '../../ds';
import { IconFileText } from '../../ds/icons';
import type { Span } from '../../shared/platform-contracts';
import { relabelModelsDeep, rewriteModelIds } from '../../shared/modelLabels';
import { explainSpanErrors } from '../../shared/format';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { RegistryRow, TraceView } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { ChartLegend, ChartSummary } from '../ui/charts';
import { InfoTip } from '../ui/InfoTip';
import { canOpenAgent, LoadError, OpsSkeleton, SourceBadge, useOpsTitle } from '../ui/kit';
import { AREA_LABEL, LevelBadge } from './Logs';

const KINDS = [
  { key: 'request', label: 'API request', color: 'var(--chart-5)', test: (n: string) => /^(GET|POST|PUT|DELETE|PATCH) /.test(n) },
  { key: 'workflow', label: 'Workflow', color: 'var(--chart-2)', test: (n: string) => n.startsWith('workflow') || n.startsWith('gumloop flow') },
  { key: 'step', label: 'Step', color: 'var(--chart-1)', test: (n: string) => n.startsWith('step.') },
  { key: 'ai', label: 'AI call', color: 'var(--chart-4)', test: (n: string) => n.startsWith('ai.') },
  { key: 'delivery', label: 'Delivery', color: 'var(--chart-3)', test: (n: string) => n.startsWith('delivery.') },
  { key: 'run', label: 'Run', color: 'var(--text-tertiary)', test: (n: string) => n === 'run' || n.startsWith('run ') },
] as const;
function kindOf(name: string) {
  return KINDS.find((k) => k.test(name)) ?? { key: 'other', label: 'Other', color: 'var(--text-disabled)' };
}

type Row = { span: Span; depth: number; startMs: number };

function buildRows(spans: Span[]): { rows: Row[]; t0: number; total: number } {
  if (!spans.length) return { rows: [], t0: 0, total: 0 };
  const t0 = Math.min(...spans.map((s) => Date.parse(s.start)));
  const end = Math.max(...spans.map((s) => Date.parse(s.start) + s.durationMs));
  const ids = new Set(spans.map((s) => s.spanId));
  const startOf = (s: Span) => Date.parse(s.start);
  const endOf = (s: Span) => startOf(s) + s.durationMs;
  /**
   * A span that names itself (or an unknown span) as its parent would be unreachable from the
   * roots and silently vanish. Hang it under the tightest span that encloses it in time (strictly
   * longer, so no cycles); with none, it is a root. Every recorded span is drawn.
   */
  const parentOf = (s: Span): string | null => {
    if (s.parentId === null) return null;
    if (s.parentId !== s.spanId && ids.has(s.parentId)) return s.parentId;
    let best: Span | null = null;
    for (const c of spans) {
      // AI calls and deliveries are leaves, and a step never nests under another step.
      if (c.spanId === s.spanId || c.durationMs <= s.durationMs || /^(ai|delivery)\./.test(c.name)) continue;
      if (s.name.includes('.') && c.name.split('.')[0] === s.name.split('.')[0]) continue;
      if (startOf(c) <= startOf(s) && endOf(c) >= endOf(s) && (!best || c.durationMs < best.durationMs)) best = c;
    }
    return best?.spanId ?? null;
  };
  const kids = new Map<string | null, Span[]>();
  for (const s of spans) {
    const p = parentOf(s);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(s);
  }
  for (const list of kids.values()) list.sort((a, b) => a.start.localeCompare(b.start) || b.durationMs - a.durationMs);
  const rows: Row[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const s of kids.get(parent) ?? []) {
      if (seen.has(s.spanId)) continue;
      seen.add(s.spanId);
      rows.push({ span: s, depth, startMs: startOf(s) - t0 });
      if (depth < 12) walk(s.spanId, depth + 1);
    }
  };
  walk(null, 0);
  // Anything still unreached (a parent cycle in the data) is drawn at the top level.
  for (const s of spans) if (!seen.has(s.spanId)) rows.push({ span: s, depth: 0, startMs: startOf(s) - t0 });
  return { rows, t0, total: Math.max(1, end - t0) };
}

function ticks(total: number): number[] {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000];
  const step = steps.find((s) => total / s <= 5) ?? 600_000;
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
  const runId = tr.data ? ((tr.data.spans.find((s) => s.attrs.runId)?.attrs.runId as string | undefined) ?? tr.data.logs.find((l) => l.runId)?.runId ?? null) : null;
  // A simulated agent's run has no trace page: its URL goes back to the logs (see canOpenAgent).
  const locked = !!tr.data?.agentId && !canOpenAgent(tr.data.agentId, reg.data);
  const title = locked ? null : runId ? `Run ${runId}` : 'Trace';
  useOpsTitle(title);
  useCrumbs(title ? [{ label: title }] : null, [title]);

  if (tr.error && !tr.data)
    return (
      <Page>
        {tr.error.status === 404 ? (
          <Card>
            <EmptyState
              icon={<IconFileText />}
              title="No trace with that id"
              description={`Nothing is recorded under ${traceId}.`}
              actions={
                <ButtonLink to="/ops/logs" size="sm">
                  Back to logs
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <LoadError error={tr.error} onRetry={tr.reload} what="this trace" />
        )}
      </Page>
    );
  if (!tr.data) return <OpsSkeleton />;
  const d = tr.data;
  if (locked || !title) return <Navigate to="/ops/logs" replace />;
  const agent = reg.data?.find((r) => r.id === d.agentId);
  const ai = d.spans.filter((s) => s.name.startsWith('ai.'));
  const tokens = ai.reduce((s, x) => s + Number(x.attrs.tokensIn ?? 0) + Number(x.attrs.tokensOut ?? 0), 0);
  const cost = ai.reduce((s, x) => s + Number(x.attrs.costUsd ?? 0), 0);
  const errors = d.spans.filter((s) => s.status === 'error').length;
  const errorNote = explainSpanErrors(d.spans);
  const fallbacks = ai.filter((s) => s.attrs.fallback === true || s.status === 'error').length;
  const selected = built.rows.find((r) => r.span.spanId === sel)?.span ?? null;
  const selLogs = selected ? d.logs.filter((l) => l.spanId === selected.spanId) : [];
  const tk = ticks(built.total);
  const slowest = [...built.rows].filter((r) => r.depth > 0 || built.rows.length === 1).sort((a, b) => b.span.durationMs - a.span.durationMs)[0];
  const usedKinds = [...new Map(built.rows.map((r) => kindOf(r.span.name)).map((k) => [k.key, k])).values()].sort((a, b) => KINDS.findIndex((k) => k.key === a.key) - KINDS.findIndex((k) => k.key === b.key));

  return (
    <Page>
      <PageHeader
        title={title}
        description="Everything in one request on one timeline. Select a step for its details."
        meta={
          <>
            {agent ? <Link to={`/ops/agents/${agent.id}`}>{agent.name}</Link> : null}
            {built.rows[0] ? <span>Started {f.time(built.rows[0].span.start, timezone, true)}</span> : null}
            {d.source ? <SourceBadge source={d.source} /> : null}
            <CopyText value={traceId} display={traceId.length > 18 ? `${traceId.slice(0, 16)}…` : traceId} label="Copy trace id" />
          </>
        }
        actions={
          <ButtonLink to={`/ops/logs?traceId=${traceId}`} icon={<IconFileText />}>
            Logs for this trace
          </ButtonLink>
        }
      />

      <Stats
        items={[
          { label: 'Total time', value: f.ms(built.total) },
          { label: 'Steps', value: d.spans.length, info: <InfoTip label="Steps">Each timed piece of work in this request: the request itself, workflow steps, AI calls and deliveries.</InfoTip> },
          { label: 'AI calls', value: ai.length, sub: fallbacks ? `${fallbacks} switched to the backup model` : 'None used the backup model' },
          { label: 'Tokens', value: f.int(tokens), info: <InfoTip label="Tokens">Text the AI read and wrote, in tokens (roughly three quarters of a word each). AI cost is priced per token.</InfoTip> },
          { label: 'AI cost', value: f.money(cost, { precise: true }) },
          { label: 'Errors', value: <span style={errors ? { color: 'var(--danger)' } : undefined}>{errors}</span>, sub: errorNote ?? 'None' },
        ]}
      />

      <Card title="Timeline" description="Each bar is one step on a shared clock from the start of the request." flush attrs={tourAnchor('ops.trace.waterfall')}>
        {built.rows.length ? (
          <>
            <div style={{ padding: '16px 20px 4px' }}>
              <ChartLegend series={usedKinds.map((k) => ({ key: k.key, label: k.label, color: k.color }))} marks={errors ? [{ kind: 'breach', label: 'Ended in an error' }] : []} />
            </div>
            <div className="ao-wf-scroll">
              <div className="ao-wf" role="list" aria-label="Steps">
                <div className="ao-wf__axis" aria-hidden="true">
                  <span>Step</span>
                  <span className="ao-wf__ticks">
                    {tk.map((t, i) => (
                      <span key={t} className={`ao-wf__tick${i === 0 ? ' ao-wf__tick--first' : ''}${i === tk.length - 1 && t / built.total > 0.9 ? ' ao-wf__tick--last' : ''}`} style={{ left: `${(t / built.total) * 100}%` }}>
                        {f.offset(t)}
                      </span>
                    ))}
                  </span>
                  <span className="ao-wf__ms-head">Took</span>
                </div>
                {built.rows.map((r) => {
                  const k = kindOf(r.span.name);
                  const left = (r.startMs / built.total) * 100;
                  const width = Math.max(0.3, (r.span.durationMs / built.total) * 100);
                  const err = r.span.status === 'error';
                  return (
                    <button
                      key={r.span.spanId}
                      type="button"
                      role="listitem"
                      className="ao-wf__row"
                      aria-pressed={sel === r.span.spanId}
                      onClick={() => setSel(sel === r.span.spanId ? null : r.span.spanId)}
                      aria-label={`${rewriteModelIds(r.span.name)}, ${f.ms(r.span.durationMs)}, starts at ${f.offset(r.startMs)}${err ? ', error' : ''}`}
                      data-kind={k.key}
                    >
                      <span className="ao-wf__name" style={{ paddingLeft: r.depth * 14 }}>
                        <span className="ao-agent-dot" style={{ background: k.color }} aria-hidden="true" />
                        <span className="ao-wf__label" title={rewriteModelIds(r.span.name)}>
                          {rewriteModelIds(r.span.name)}
                        </span>
                        {r.span.attrs.fallback === true ? <Badge tone="warning">Backup model</Badge> : null}
                        {err ? <Badge tone="danger">Error</Badge> : null}
                      </span>
                      <span className="ao-wf__lane" aria-hidden="true">
                        {tk.map((t) => (
                          <span key={t} className="ao-wf__grid" style={{ left: `${(t / built.total) * 100}%` }} />
                        ))}
                        <span className={`ao-wf__bar${err ? ' ao-wf__bar--error' : ''}`} style={{ left: `${Math.min(left, 99.7)}%`, width: `min(${width}%, ${100 - Math.min(left, 99.7)}%)`, background: err ? 'var(--danger)' : k.color }} />
                      </span>
                      <span className="ao-wf__ms">{f.ms(r.span.durationMs)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              <ChartSummary>
                {d.spans.length} steps over {f.ms(built.total)}
                {slowest ? `; the longest was ${rewriteModelIds(slowest.span.name)} at ${f.ms(slowest.span.durationMs)}` : ''}.{errors ? ` ${errors} ended in an error${errorNote ? `: ${errorNote.charAt(0).toLowerCase()}${errorNote.slice(1)}` : '.'}` : ''}
              </ChartSummary>
            </div>
          </>
        ) : (
          <EmptyState compact title="No timed steps recorded for this trace" description="The log lines below are everything recorded for it." />
        )}
      </Card>

      {selected ? (
        <Card
          title={rewriteModelIds(selected.name)}
          description={`Took ${f.ms(selected.durationMs)}, ${selected.status === 'error' ? 'ended in an error' : 'completed'}.`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setSel(null)}>
              Close
            </Button>
          }
        >
          <div className="ao-pair">
            <section>
              <h3 className="ao-subhead">Attributes</h3>
              <pre className="ao-json">{JSON.stringify(relabelModelsDeep(selected.attrs), null, 2)}</pre>
            </section>
            <section>
              <h3 className="ao-subhead">Log lines for this step</h3>
              {selLogs.length ? (
                <ul className="ao-span-logs">
                  {selLogs.map((l) => (
                    <li key={l.id} className="ao-span-log">
                      <LevelBadge level={l.level} />
                      <span className="ao-mono">{l.event}</span>
                      <span>{rewriteModelIds(l.message)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ao-note">No log lines for this step.</p>
              )}
            </section>
          </div>
        </Card>
      ) : null}

      <Card title="Log lines" description={`${d.logs.length} line${d.logs.length === 1 ? '' : 's'} from this request${runId ? ` and run ${runId}` : ''}, oldest first.`} flush>
        <Table label="Correlated logs" compact>
          <thead>
            <tr>
              <th>After</th>
              <th>Level</th>
              <th className="ao-hide-sm">Area</th>
              <th className="ao-hide-sm ao-hide-md">Event</th>
              <th className="ao-end-sm">Message</th>
              <th className="is-num ao-hide-sm">Took</th>
            </tr>
          </thead>
          <tbody>
            {d.logs.map((l) => (
              <tr key={l.id} className={sel && l.spanId === sel ? 'is-selected' : undefined}>
                <td className="is-nowrap ds-num">{built.rows.length ? f.offset(Math.max(0, Date.parse(l.at) - built.t0)) : f.clock(l.at, timezone)}</td>
                <td className="is-nowrap">
                  <LevelBadge level={l.level} />
                </td>
                <td className="ao-hide-sm is-nowrap">{AREA_LABEL[l.component] ?? l.component}</td>
                <td className="ao-hide-sm ao-hide-md is-nowrap">
                  <span className="ao-mono ds-muted">{l.event}</span>
                </td>
                <td className="ao-end-sm">
                  <span className="ao-msg ao-msg--wide" title={rewriteModelIds(l.message)}>
                    {rewriteModelIds(l.message)}
                  </span>
                </td>
                <td className="is-num ao-hide-sm ds-muted">{l.durationMs != null ? f.ms(l.durationMs) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Page>
  );
}
