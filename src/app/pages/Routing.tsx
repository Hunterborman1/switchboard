import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { Channel, Delivery, InsightType, RoutingRule } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Select } from '../../system/components/forms/Select.jsx';
import { Input } from '../../system/components/forms/Input.jsx';
import { Switch } from '../../system/components/forms/Switch.jsx';
import { Button } from '../../system/components/primitives/Button.jsx';
import { DataTable, type DataTableColumn } from '../../uis/DataTable';
import { DeliveryTimeline, deriveDeliveryTimeline } from '../../uis/DeliveryTimeline';
import { EmptyState } from '../../uis/EmptyState';
import { MonoId } from '../../uis/MonoId';
import { RelativeTime } from '../../uis/RelativeTime';
import { StatusChip, type StatusTone } from '../../uis/StatusChip';
import { Skeleton, SkeletonSurface, TableSkeleton } from '../../uis/Skeleton';
import { api } from '../api/client';
import { invalidate, keys, useDeliveries, useQuery, useRules } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel, TypeTag, useToast } from '../components/ui';
import { AREA_SHORT, CHANNEL_LABEL, SEVERITY_LABEL, TYPE_COLOR, TYPE_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import styles from './routing/routing.module.css';

const CHANNELS: Channel[] = ['slack', 'jira', 'linear', 'email_digest', 'triage'];

export function describeMatch(r: RoutingRule): string {
  const parts: string[] = [];
  parts.push(r.match.types ? r.match.types.map((t) => TYPE_LABEL[t].toLowerCase()).join(' / ') : 'any type');
  if (r.match.areas) parts.push(r.match.areas.map((a) => AREA_SHORT[a]).join(' / '));
  if (r.match.minSeverity) parts.push(`severity ≥ ${SEVERITY_LABEL[r.match.minSeverity].toLowerCase()}`);
  if (r.match.arrBands) parts.push(`ARR ${r.match.arrBands.join(', ')}`);
  return parts.join(' · ');
}

export function isPricingLargeRule(r: RoutingRule, rules: RoutingRule[]): boolean {
  if (rules.some((x) => x.id === 'rule_pricing_large')) return r.id === 'rule_pricing_large';
  const first =
    rules.find((x) => x.match.types?.includes('pricing_objection') && x.match.arrBands && x.match.arrBands.length > 0) ??
    rules.find((x) => x.match.types?.includes('pricing_objection'));
  return first?.id === r.id;
}

const DELIVERY_TONE: Record<Delivery['status'], StatusTone> = { delivered: 'success', queued: 'neutral', retrying: 'warning', failed: 'danger' };

function hashRules(rules: RoutingRule[]): string {
  return rules.map((r) => `${r.id}:${r.ownerId}:${r.channel}:${r.enabled ? 1 : 0}:${r.priority}`).join('|');
}

export default function RoutingPage() {
  const rulesQ = useRules();
  const deliveriesQ = useDeliveries(null);
  const world = useWorldIndex();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, RoutingRule>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [openDelivery, setOpenDelivery] = useState<Set<string>>(new Set());

  const rules = useMemo(() => [...(rulesQ.data ?? [])].sort((a, b) => a.priority - b.priority), [rulesQ.data]);
  const previewRules = useMemo(() => rules.map((r) => drafts[r.id] ?? r), [rules, drafts]);
  const dirtyCount = Object.keys(drafts).length;
  const previewKey = rules.length ? `routing/preview:${hashRules(previewRules)}` : null;
  const preview = useQuery(previewKey, () => api.routingPreview(previewRules), { staleMs: 30_000 });

  const edit = useCallback(
    (rule: RoutingRule, patch: Partial<RoutingRule>) => {
      setDrafts((cur) => {
        const base = cur[rule.id] ?? rule;
        const next = { ...base, ...patch };
        const same = next.ownerId === rule.ownerId && next.channel === rule.channel && next.destination === rule.destination && next.enabled === rule.enabled && next.priority === rule.priority;
        const copy = { ...cur };
        if (same) delete copy[rule.id];
        else copy[rule.id] = next;
        return copy;
      });
    },
    [],
  );

  const save = async (rule: RoutingRule) => {
    const draft = drafts[rule.id];
    if (!draft) return;
    setSaving(rule.id);
    try {
      await api.putRule(draft);
      setDrafts((cur) => {
        const c = { ...cur };
        delete c[rule.id];
        return c;
      });
      emit({ name: 'rule.changed', ruleId: rule.id });
      track('rule_changed', { ruleId: rule.id, ownerId: draft.ownerId, channel: draft.channel, enabled: draft.enabled });
      toast({ tone: 'success', title: 'Override saved in your workspace', body: `${rule.name} → ${world.personName(draft.ownerId)} (${CHANNEL_LABEL[draft.channel]}). Other viewers still see the baseline.` });
      setJustSaved(rule.id);
      window.setTimeout(() => setJustSaved((x) => (x === rule.id ? null : x)), 1700);
      invalidate(keys.rules, 'routing/preview');
    } catch (err) {
      toast({ tone: 'danger', title: 'Could not save the override', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  const ownerOptions = useMemo(
    () => world.people.filter((p) => p.role !== 'csm').map((p) => ({ value: p.id, label: `${p.name} · ${p.title}` })),
    [world.people],
  );

  const deliveries = deliveriesQ.data ?? [];
  const deliveryColumns: DataTableColumn<Delivery>[] = [
    {
      key: 'insight',
      header: 'Insight',
      render: (d) => {
        const title = String(d.payload.title ?? d.payload.summary ?? d.insightId);
        return (
          <div style={{ minWidth: 220, maxWidth: 420 }}>
            <Link className="sl-quietlink sl-cell-title" to={`/app/insights/${d.insightId}`} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </Link>
            <div className="sl-cell-sub">{String(d.payload.account ?? '')}</div>
          </div>
        );
      },
    },
    { key: 'dest', header: 'Destination', sortable: true, sortValue: (d) => d.channel, render: (d) => (
      <div>
        <div className="sl-cell-title">{CHANNEL_LABEL[d.channel]}</div>
        <div className="sl-cell-sub">{d.destination}</div>
      </div>
    ) },
    { key: 'owner', header: 'Owner', sortable: true, sortValue: (d) => world.personName(d.ownerId), render: (d) => world.personName(d.ownerId) },
    { key: 'status', header: 'Status', sortable: true, sortValue: (d) => d.status, render: (d) => (
      <StatusChip tone={DELIVERY_TONE[d.status]}>{d.status}{d.attempts.length > 1 ? ` · ${d.attempts.length} attempts` : ''}</StatusChip>
    ) },
    { key: 'receipt', header: 'Receipt', render: (d) => (d.receipt ? <MonoId value={d.receipt} keep={10} /> : <span className="sl-subtle">—</span>) },
    { key: 'at', header: 'When', sortable: true, sortValue: (d) => d.createdAt, render: (d) => <RelativeTime value={d.createdAt} /> },
  ];

  if (rulesQ.error && !rulesQ.data) {
    return (
      <div className="sl-page">
        <AppPageHeader title="Routing" dataAsOf={rulesQ.dataAsOf} />
        <ErrorState error={rulesQ.error} onRetry={rulesQ.refresh} what="routing rules" />
      </div>
    );
  }

  return (
    <div className="sl-page">
      <AppPageHeader title="Routing" dataAsOf={rulesQ.dataAsOf} />

      <Panel
        title="Rules"
        sub="Routing is decided by this table, never by the prompt. Lowest priority number wins; anything unmatched goes to triage. Edits are saved as overrides in your workspace."
        actions={dirtyCount ? <StatusChip tone="warning">{dirtyCount} unsaved</StatusChip> : null}
        flush
        anchor={tourAnchor('routing.rules')}
      >
        {rulesQ.loading ? (
          <div className="sl-panel-body">
            <TableSkeleton rows={8} columns={7} />
          </div>
        ) : rules.length === 0 ? (
          <div className="sl-panel-body">
            <EmptyState variant="not-yet-collected" title="No rules yet" description="Without rules every insight goes to the triage queue." />
          </div>
        ) : (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Routing rules (scrolls horizontally on small screens)">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Rule · match</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Enabled</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    <span className="sl-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const d = drafts[rule.id] ?? rule;
                  const dirty = !!drafts[rule.id];
                  const isOverride = rule.workspaceId !== 'seed';
                  const pricing = isPricingLargeRule(rule, rules);
                  return (
                    <tr
                      key={rule.id}
                      className={`${dirty ? styles.rowDirty : ''} ${justSaved === rule.id ? styles.rowSaved : ''} ${!d.enabled ? styles.rowDisabled : ''}`}
                      {...(pricing ? tourAnchor('routing.rule.pricing') : {})}
                      data-rule-id={rule.id}
                      data-override={isOverride ? 'true' : undefined}
                    >
                      <td style={{ minWidth: 240 }}>
                        <div className={styles.ruleName}>
                          {rule.name} {isOverride ? <span className={styles.override}>Your override</span> : null}
                        </div>
                        <div className={styles.ruleMatch}>{describeMatch(rule)}</div>
                      </td>
                      <td data-label="Owner">
                        <Select
                          size="sm"
                          aria-label={`Owner for ${rule.name}`}
                          value={d.ownerId}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => edit(rule, { ownerId: e.target.value })}
                          options={ownerOptions.some((o) => o.value === d.ownerId) ? ownerOptions : [{ value: d.ownerId, label: world.personName(d.ownerId) }, ...ownerOptions]}
                          style={{ width: 250 }}
                        />
                      </td>
                      <td data-label="Channel">
                        <Select
                          size="sm"
                          aria-label={`Channel for ${rule.name}`}
                          value={d.channel}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => edit(rule, { channel: e.target.value as Channel })}
                          options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
                          style={{ width: 140 }}
                        />
                      </td>
                      <td data-label="Destination">
                        <Input
                          size="sm"
                          aria-label={`Destination for ${rule.name}`}
                          value={d.destination}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => edit(rule, { destination: e.target.value })}
                          style={{ width: 180 }}
                        />
                      </td>
                      <td data-label="Priority">
                        <input
                          className={styles.prio}
                          type="number"
                          min={1}
                          max={999}
                          aria-label={`Priority for ${rule.name}`}
                          value={d.priority}
                          onChange={(e) => edit(rule, { priority: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
                        />
                      </td>
                      <td data-label="Enabled">
                        <Switch size="sm" checked={d.enabled} aria-label={`${rule.name} enabled`} onChange={(v: boolean) => edit(rule, { enabled: v })} />
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actions}>
                          {dirty ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setDrafts((cur) => { const c = { ...cur }; delete c[rule.id]; return c; })}>
                                Reset
                              </Button>
                              <Button size="sm" variant="primary" loading={saving === rule.id} onClick={() => void save(rule)}>
                                Save
                              </Button>
                            </>
                          ) : (
                            justSaved === rule.id ? <span className="sl-caption" role="status">Saved ✓</span> : null
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Where insights flow"
        sub={
          dirtyCount
            ? `Previewing ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'} against every insight in your workspace`
            : 'Type → product area → owner, for every routed or pending insight under the current rules'
        }
        anchor={tourAnchor('routing.sankey')}
      >
        <RoutingSankey flows={preview.data?.flows ?? null} loading={preview.loading} personName={world.personName} />
      </Panel>

      <Panel
        title="Delivery log"
        sub={deliveries.length ? `${deliveries.length} deliveries · ${deliveries.filter((d) => d.attempts.length > 1).length} needed a retry · expand a row for its attempt timeline` : 'Receipts from Slack, Jira, Linear and the digest'}
        flush
        anchor={tourAnchor('routing.deliveries')}
      >
        {deliveriesQ.loading ? (
          <div className="sl-panel-body"><TableSkeleton rows={6} columns={6} /></div>
        ) : deliveriesQ.error && !deliveriesQ.data ? (
          <div className="sl-panel-body"><ErrorState error={deliveriesQ.error} onRetry={deliveriesQ.refresh} what="deliveries" /></div>
        ) : (
          <DataTable
            columns={deliveryColumns}
            rows={deliveries.slice(0, 40)}
            getRowKey={(d) => d.id}
            pagination="when-needed"
            rowTone={(d) => (d.status === 'failed' ? 'red' : d.status === 'retrying' ? 'yellow' : null)}
            empty={<EmptyState variant="no-data" title="Nothing delivered yet" description="Approved and auto-routed insights land here with a receipt." />}
            expandable={{
              isOpen: (d) => openDelivery.has(d.id),
              onToggle: (d) =>
                setOpenDelivery((cur) => {
                  const n = new Set(cur);
                  if (n.has(d.id)) n.delete(d.id);
                  else n.add(d.id);
                  return n;
                }),
              toggleLabel: (d, open) => `${open ? 'Hide' : 'Show'} attempts for ${d.receipt ?? d.id}`,
              render: (d) => (
                <div className="sl-stack-sm" style={{ padding: '4px 0' }}>
                  <DeliveryTimeline model={deriveDeliveryTimeline(d.attempts.map((a, i) => ({ id: `${d.id}-${i}`, at: a.at, ok: a.ok })))} height={64} />
                  <ul style={{ margin: 0, paddingLeft: 18 }} className="sl-meta">
                    {d.attempts.map((a, i) => (
                      <li key={i}>
                        Attempt {i + 1}: {a.ok ? 'ok' : 'failed'} · {a.ms} ms · {a.note} · <RelativeTime value={a.at} />
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            }}
          />
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Sankey

type SNode = { name: string; kind: 'type' | 'area' | 'owner'; key: string; color: string };

function RoutingSankey({ flows, loading, personName }: { flows: { type: InsightType; area: string; ownerId: string; count: number }[] | null; loading: boolean; personName: (id: string) => string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? 999) < 640));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const data = useMemo(() => {
    if (!flows || flows.length === 0) return null;
    const nodes: SNode[] = [];
    const idx = new Map<string, number>();
    const node = (key: string, n: SNode) => {
      if (!idx.has(key)) {
        idx.set(key, nodes.length);
        nodes.push(n);
      }
      return idx.get(key)!;
    };
    // stable order: types, areas, owners (alphabetical) so re-flows animate in place
    const types = [...new Set(flows.map((f) => f.type))].sort();
    const areas = [...new Set(flows.map((f) => f.area))].sort();
    const owners = [...new Set(flows.map((f) => f.ownerId))].sort((a, b) => personName(a).localeCompare(personName(b)));
    types.forEach((t) => node(`t:${t}`, { name: TYPE_LABEL[t], kind: 'type', key: t, color: TYPE_COLOR[t] }));
    areas.forEach((a) => node(`a:${a}`, { name: AREA_SHORT[a as keyof typeof AREA_SHORT] ?? a, kind: 'area', key: a, color: 'var(--cn-neutral)' }));
    owners.forEach((o) => node(`o:${o}`, { name: personName(o), kind: 'owner', key: o, color: 'var(--cn-green-deep)' }));
    const l1 = new Map<string, number>();
    const l2 = new Map<string, number>();
    for (const f of flows) {
      const k1 = `${f.type}|${f.area}`;
      const k2 = `${f.area}|${f.ownerId}`;
      l1.set(k1, (l1.get(k1) ?? 0) + f.count);
      l2.set(k2, (l2.get(k2) ?? 0) + f.count);
    }
    const links = [
      ...[...l1].map(([k, v]) => {
        const [t, a] = k.split('|');
        return { source: idx.get(`t:${t}`)!, target: idx.get(`a:${a}`)!, value: v };
      }),
      ...[...l2].map(([k, v]) => {
        const [a, o] = k.split('|');
        return { source: idx.get(`a:${a}`)!, target: idx.get(`o:${o}`)!, value: v };
      }),
    ];
    return { nodes, links, total: flows.reduce((s, f) => s + f.count, 0) };
  }, [flows, personName]);

  if (loading && !data) {
    return (
      <SkeletonSurface label="Computing flows">
        <Skeleton height={380} />
      </SkeletonSurface>
    );
  }
  if (!data) return <EmptyState variant="no-data" title="No insights to route yet" description="Run a call or approve an item in Review to see flows here." />;

  return (
    <div ref={wrapRef}>
      {narrow ? <FlowList flows={flows ?? []} personName={personName} /> : null}
      <div style={narrow ? { display: 'none' } : undefined}>
      <div className={styles.sankeyHead} aria-hidden="true">
        <span>Insight type</span>
        <span>Product area</span>
        <span>Owner</span>
      </div>
      <div className={styles.sankey} role="img" aria-label={`Routing flows for ${data.total} insights: ${(flows ?? []).map((f) => `${f.count} ${TYPE_LABEL[f.type]} in ${f.area} to ${personName(f.ownerId)}`).join('; ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            sort={false}
            nodeWidth={10}
            nodePadding={14}
            iterations={48}
            linkCurvature={0.55}
            margin={{ top: 6, right: 130, bottom: 6, left: 130 }}
            node={<SankeyNode nodes={data.nodes} />}
            link={<SankeyLink nodes={data.nodes} />}
          >
            <Tooltip
              contentStyle={{ borderRadius: 6, border: '1px solid var(--cn-border)', boxShadow: 'var(--shadow-md)', fontSize: 12 }}
              formatter={(v) => [`${String(v)} insights`, '']}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        {[...new Set((flows ?? []).map((f) => f.type))].sort().map((t) => (
          <TypeTag key={t} type={t} />
        ))}
        <span className="sl-caption">· width = number of insights ({data.total} total) · <Link to="/app/insights">open the records →</Link></span>
      </div>
      </div>
    </div>
  );
}

/** Small screens: the same flows as a ranked owner list (a Sankey is unreadable at phone width). */
function FlowList({ flows, personName }: { flows: { type: InsightType; area: string; ownerId: string; count: number }[]; personName: (id: string) => string }) {
  const byOwner = new Map<string, { total: number; types: Map<InsightType, number> }>();
  for (const f of flows) {
    const o = byOwner.get(f.ownerId) ?? { total: 0, types: new Map() };
    o.total += f.count;
    o.types.set(f.type, (o.types.get(f.type) ?? 0) + f.count);
    byOwner.set(f.ownerId, o);
  }
  const rows = [...byOwner.entries()].sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...rows.map(([, r]) => r.total));
  const total = flows.reduce((a, f) => a + f.count, 0);
  return (
    <ul className={styles.flowList} aria-label="Insights per owner">
      {rows.map(([owner, r]) => (
        <li key={owner} className={styles.flowRow}>
          <div className={styles.flowHead}>
            <span className="sl-strong">{personName(owner)}</span>
            <span className="sl-mono sl-meta">{r.total} · {Math.round((r.total / Math.max(total, 1)) * 100)}% of {total}</span>
          </div>
          <div className={styles.flowBar} aria-hidden="true">
            {[...r.types.entries()].map(([t, n]) => (
              <i key={t} style={{ width: `${(n / max) * 100}%`, background: TYPE_COLOR[t] }} title={`${TYPE_LABEL[t]}: ${n}`} />
            ))}
          </div>
          <div className={styles.flowTypes}>
            {[...r.types.entries()].map(([t, n]) => (
              <span key={t} className="sl-caption">{TYPE_LABEL[t]} {n}</span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

type NodeRenderProps = { x?: number; y?: number; width?: number; height?: number; index?: number; payload?: { value?: number; depth?: number } };

function SankeyNode(props: NodeRenderProps & { nodes: SNode[] }) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload, nodes } = props;
  const n = nodes[index];
  if (!n) return null;
  const left = n.kind === 'type';
  const right = n.kind === 'owner';
  const tx = left ? x - 8 : right ? x + width + 8 : x + width + 6;
  const anchor = left ? 'end' : 'start';
  return (
    <g style={{ transition: 'transform 600ms var(--ease-out)' }}>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={2} fill={n.color} style={{ transition: 'y 600ms var(--ease-out), height 600ms var(--ease-out)' }} />
      <text
        x={tx}
        y={y + height / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={12}
        fontFamily="var(--font-sans)"
        fill="var(--cn-off-black)"
        style={{ transition: 'y 600ms var(--ease-out)', paintOrder: 'stroke', stroke: 'var(--cn-white)', strokeWidth: n.kind === 'area' ? 3 : 0 }}
      >
        {n.name}
        <tspan fill="var(--cn-ink-3-txt)" fontFamily="var(--font-mono)" fontSize={11}>{`  ${payload?.value ?? ''}`}</tspan>
      </text>
    </g>
  );
}

type LinkRenderProps = {
  sourceX?: number;
  targetX?: number;
  sourceY?: number;
  targetY?: number;
  sourceControlX?: number;
  targetControlX?: number;
  linkWidth?: number;
  index?: number;
  payload?: { source?: { name?: string }; target?: { name?: string }; value?: number };
};

function SankeyLink(props: LinkRenderProps & { nodes: SNode[] }) {
  const { sourceX = 0, targetX = 0, sourceY = 0, targetY = 0, sourceControlX = 0, targetControlX = 0, linkWidth = 0, payload, nodes } = props;
  const [hover, setHover] = useState(false);
  const srcName = payload?.source?.name;
  const src = nodes.find((n) => n.name === srcName);
  const color = src?.kind === 'type' ? src.color : 'var(--cn-green)';
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeOpacity={hover ? 0.55 : 0.28}
      strokeWidth={Math.max(linkWidth, 1)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ transition: 'd 600ms var(--ease-out), stroke-width 600ms var(--ease-out), stroke-opacity 150ms' }}
    />
  );
}
