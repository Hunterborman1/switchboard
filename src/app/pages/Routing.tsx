/**
 * Routing: the rules table that decides who hears about what, the flows those rules produce,
 * and the log of every delivery. Rules are code, not a prompt: the AI never picks the owner.
 * Edits are drafts per row; saving writes an override in the viewer's own workspace.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Channel, Person, RoutingRule } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { PERSON_ROLE_LABEL, PERSON_ROLES } from '../../shared/platform';
import { tourAnchor } from '../../tour/anchors';
import { Avatar, Badge, Button, Card, EmptyState, Input, Page, PageHeader, Segmented, Skeleton, Switch, Table, Tooltip, useToast } from '../../ds';
import { IconAlertCircle, IconAlertTriangle, IconCheck, IconChevronDown, IconRoute } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, keys, useConnections, useDeliveries, usePeople, useQuery, useRules } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { CHANNELS, ChannelMark, channelConnector, channelLabel, channelReady, DEFAULT_DESTINATION } from '../components/destinations/channel';
import { ErrorState, SIMULATED_TIP, SimulatedBadge } from '../components/domain';
import { AREA_SHORT, SEVERITY_LABEL, TYPE_LABEL } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { track } from '../telemetry';
import { useDeliveryLog } from './routing/DeliveryLog';
import { FlowChart, FlowList, type Flow } from './routing/FlowChart';
import styles from './routing/routing.module.css';

const ARR_FLOOR: Record<string, string> = {
  '<50k': '$0',
  '50k-250k': '$50k',
  '250k-1m': '$250k',
  '>1m': '$1M',
};
const ARR_BAND_LABEL: Record<string, string> = {
  '<50k': 'ARR under $50k',
  '50k-250k': 'ARR $50k to $250k',
  '250k-1m': 'ARR $250k to $1M',
  '>1m': 'ARR over $1M',
};
const BAND_ORDER = ['<50k', '50k-250k', '250k-1m', '>1m'];

/** Rule names in the seed read "Churn risk → VP Product"; on screen that arrow becomes "to". */
export function ruleName(name: string): string {
  return name.replace(/\s*→\s*/g, ' to ');
}

/** What a rule matches, as short plain chips. */
export function matchChips(r: RoutingRule): string[] {
  const out: string[] = [];
  out.push(...(r.match.types ? r.match.types.map((t) => TYPE_LABEL[t]) : ['Any type']));
  if (r.match.areas) out.push(...r.match.areas.map((a) => AREA_SHORT[a]));
  if (r.match.minSeverity) out.push(r.match.minSeverity === 'critical' ? 'Critical only' : `${SEVERITY_LABEL[r.match.minSeverity]} severity and up`);
  if (r.match.arrBands?.length) {
    const idx = r.match.arrBands.map((b) => BAND_ORDER.indexOf(b)).sort((a, b) => a - b);
    const contiguousToTop = idx[idx.length - 1] === BAND_ORDER.length - 1 && idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
    if (contiguousToTop && idx.length > 1) out.push(`ARR over ${ARR_FLOOR[BAND_ORDER[idx[0]!]!]}`);
    else out.push(...r.match.arrBands.map((b) => ARR_BAND_LABEL[b] ?? b));
  }
  return out;
}

/** The pricing-objection rule the walkthrough edits (the large-account one when it exists). */
export function isPricingLargeRule(r: RoutingRule, rules: RoutingRule[]): boolean {
  if (rules.some((x) => x.id === 'rule_pricing_large')) return r.id === 'rule_pricing_large';
  const first = rules.find((x) => x.match.types?.includes('pricing_objection') && x.match.arrBands && x.match.arrBands.length > 0) ?? rules.find((x) => x.match.types?.includes('pricing_objection'));
  return first?.id === r.id;
}

function hashRules(rules: RoutingRule[]): string {
  return rules.map((r) => `${r.id}:${r.ownerId}:${r.channel}:${r.enabled ? 1 : 0}:${r.priority}`).join('|');
}

const sameRule = (a: RoutingRule, b: RoutingRule) => a.ownerId === b.ownerId && a.channel === b.channel && a.destination === b.destination && a.enabled === b.enabled && a.priority === b.priority;

type RowState = { kind: 'saved' } | { kind: 'error'; message: string };

export default function RoutingPage() {
  useDocumentTitle('Routing');
  const rulesQ = useRules();
  const deliveriesQ = useDeliveries(null);
  const peopleQ = usePeople();
  const connQ = useConnections();
  const world = useWorldIndex();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, RoutingRule>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [flowView, setFlowView] = useState<'flow' | 'owners'>('flow');

  const rules = useMemo(() => [...(rulesQ.data ?? [])].sort((a, b) => a.priority - b.priority), [rulesQ.data]);
  const previewRules = useMemo(() => rules.map((r) => drafts[r.id] ?? r), [rules, drafts]);
  const dirtyCount = Object.keys(drafts).length;
  const previewKey = rules.length ? `routing/preview:${hashRules(previewRules)}` : null;
  const preview = useQuery(previewKey, () => api.routingPreview(previewRules), {
    staleMs: 30_000,
  });
  const connections = connQ.data;

  // The workspace directory: people endpoint first (it knows who is inactive), the world as a fallback.
  const directory: Person[] = useMemo(() => {
    const src = peopleQ.data?.length ? peopleQ.data : world.people;
    return src.filter((p) => p.active !== false);
  }, [peopleQ.data, world.people]);
  const personById = useCallback((id: string | null | undefined): Person | null => (id ? (peopleQ.data?.find((p) => p.id === id) ?? world.person(id)) : null), [peopleQ.data, world]);
  const personName = useCallback((id: string | null | undefined) => personById(id)?.name ?? world.personName(id), [personById, world]);

  const clearRowState = (id: string) =>
    setRowState((cur) => {
      if (!cur[id]) return cur;
      const c = { ...cur };
      delete c[id];
      return c;
    });

  const edit = useCallback((rule: RoutingRule, patch: Partial<RoutingRule>) => {
    setDrafts((cur) => {
      const next = { ...(cur[rule.id] ?? rule), ...patch };
      const copy = { ...cur };
      if (sameRule(next, rule)) delete copy[rule.id];
      else copy[rule.id] = next;
      return copy;
    });
    setRowState((cur) => {
      if (cur[rule.id]?.kind !== 'saved') return cur;
      const c = { ...cur };
      delete c[rule.id];
      return c;
    });
  }, []);

  const reset = (rule: RoutingRule) => {
    setDrafts((cur) => {
      const c = { ...cur };
      delete c[rule.id];
      return c;
    });
    clearRowState(rule.id);
  };

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
      track('rule_changed', {
        ruleId: rule.id,
        ownerId: draft.ownerId,
        channel: draft.channel,
        enabled: draft.enabled,
      });
      toast({
        tone: 'success',
        title: 'Override saved in your workspace',
        body: `${ruleName(rule.name)} now goes to ${personName(draft.ownerId)} in ${channelLabel(draft.channel)}. Other viewers still see the original rule.`,
      });
      setRowState((cur) => ({ ...cur, [rule.id]: { kind: 'saved' } }));
      window.setTimeout(() => {
        setRowState((cur) => {
          if (cur[rule.id]?.kind !== 'saved') return cur;
          const c = { ...cur };
          delete c[rule.id];
          return c;
        });
      }, 2400);
      invalidate(keys.rules, 'routing/preview');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRowState((cur) => ({ ...cur, [rule.id]: { kind: 'error', message } }));
      toast({ tone: 'danger', title: 'Couldn’t save the rule', body: message });
    } finally {
      setSaving(null);
    }
  };

  const deliveries = deliveriesQ.data ?? [];
  const retried = deliveries.filter((d) => d.attempts.length > 1).length;
  const log = useDeliveryLog({ deliveries, personName });
  const flows: Flow[] = preview.data?.flows ?? [];

  return (
    <Page>
      <PageHeader title="Routing" description="Rules decide who hears about what. The AI never picks the owner." />

      <Card
        title="Rules"
        description="The first matching rule wins and anything unmatched goes to triage. Your edits change your workspace only."
        actions={dirtyCount ? <Badge tone="warning">{dirtyCount} unsaved</Badge> : null}
        flush
        attrs={tourAnchor('routing.rules')}
      >
        {rulesQ.loading ? (
          <RowsSkeleton />
        ) : rulesQ.error && !rulesQ.data ? (
          <ErrorState error={rulesQ.error} onRetry={() => void rulesQ.refresh()} what="routing rules" />
        ) : rules.length === 0 ? (
          <EmptyState icon={<IconRoute />} title="No rules yet" description="Without rules every insight goes to the triage queue." compact />
        ) : (
          <Table label="Routing rules" minWidth={1080} className={styles.rules}>
            <colgroup>
              <col />
              <col style={{ width: 204 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Owner</th>
                <th>
                  <span className="ds-row" style={{ gap: 6 }}>
                    Channel
                    <SimulatedBadge tip={SIMULATED_TIP.routing} />
                  </span>
                </th>
                <th>Destination</th>
                <th>Priority</th>
                <th>Enabled</th>
                <th>
                  <span className="ds-sr-only">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const d = drafts[rule.id] ?? rule;
                const dirty = !!drafts[rule.id];
                const state = rowState[rule.id];
                const isOverride = rule.workspaceId !== 'seed';
                const pricing = isPricingLargeRule(rule, rules);
                const ready = channelReady(d.channel, connections);
                const connector = channelConnector(d.channel);
                const note: ReactNode =
                  state?.kind === 'error' ? (
                    <span className={styles.noteDanger}>
                      <IconAlertCircle size={14} />
                      <span>Couldn’t save this rule: {state.message}. Your changes are still here; try Save again.</span>
                    </span>
                  ) : !ready && connector ? (
                    <span className={styles.noteWarning}>
                      <IconAlertTriangle size={14} />
                      <span>
                        {connector.name} isn’t connected (simulated), so matches go to triage. <Link to={`/app/connections/${connector.id}`}>Connect {connector.name}</Link>
                      </span>
                    </span>
                  ) : null;
                const owner = personById(d.ownerId);
                return (
                  <RuleRows key={rule.id} note={note} dirty={dirty}>
                    <tr
                      className={[dirty ? styles.rowDirty : '', note ? styles.rowWithNote : ''].filter(Boolean).join(' ') || undefined}
                      data-rule-id={rule.id}
                      data-override={isOverride ? 'true' : undefined}
                      {...(pricing ? tourAnchor('routing.rule.pricing') : {})}
                    >
                      <td>
                        <div className={d.enabled ? styles.ruleName : `${styles.ruleName} ${styles.dim}`}>
                          <span className={styles.ruleTitle} title={ruleName(rule.name)}>
                            {ruleName(rule.name)}
                          </span>
                          {isOverride ? <Badge tone="info">Your override</Badge> : null}
                        </div>
                        <div className={d.enabled ? styles.chips : `${styles.chips} ${styles.dim}`}>
                          {matchChips(rule).map((c) => (
                            <Badge key={c}>{c}</Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <OwnerPicker rule={rule} value={d.ownerId} owner={owner} directory={directory} onChange={(ownerId) => edit(rule, { ownerId })} />
                      </td>
                      <td>
                        <ChannelPicker rule={rule} value={d.channel} connections={connections} onChange={(channel) => edit(rule, { channel, destination: channel === rule.channel ? rule.destination : DEFAULT_DESTINATION[channel] })} />
                      </td>
                      <td>
                        <Input inputSize="sm" aria-label={`Destination for ${ruleName(rule.name)}`} value={d.destination} onChange={(e) => edit(rule, { destination: e.target.value })} />
                      </td>
                      <td>
                        <Input
                          inputSize="sm"
                          type="number"
                          min={1}
                          max={999}
                          className={styles.priority}
                          aria-label={`Priority for ${ruleName(rule.name)}`}
                          value={d.priority}
                          onChange={(e) =>
                            edit(rule, {
                              priority: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                            })
                          }
                        />
                      </td>
                      <td>
                        <span className={styles.switchCell}>
                          <Switch checked={d.enabled} label={`${ruleName(rule.name)} enabled`} onChange={(v) => edit(rule, { enabled: v })} />
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          {dirty ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => reset(rule)} disabled={saving === rule.id}>
                                Reset
                              </Button>
                              <Button size="sm" variant="primary" loading={saving === rule.id} onClick={() => void save(rule)}>
                                Save
                              </Button>
                            </>
                          ) : state?.kind === 'saved' ? (
                            <span className={styles.saved} role="status">
                              <IconCheck size={14} />
                              Saved
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  </RuleRows>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Where insights go"
        description={
          dirtyCount
            ? `Previewing ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'} against every insight in your workspace.`
            : 'Every routed or waiting insight, by type, product area and owner, under the current rules.'
        }
        actions={
          flows.length ? (
            <span className={styles.wideOnly}>
              <Segmented
                size="sm"
                label="Chart view"
                value={flowView}
                onChange={setFlowView}
                options={[
                  { value: 'flow', label: 'Flow' },
                  { value: 'owners', label: 'By owner' },
                ]}
              />
            </span>
          ) : null
        }
        attrs={tourAnchor('routing.sankey')}
        className={styles.flowCard}
      >
        {preview.loading && !preview.data ? (
          <Skeleton height={420} />
        ) : preview.error && !preview.data ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refresh()} what="the routing preview" />
        ) : flows.length === 0 ? (
          <EmptyState icon={<IconRoute />} title="No insights to route yet" description="Bring in a conversation or approve an item in Review to see where insights go." compact />
        ) : flowView === 'owners' ? (
          <FlowList flows={flows} personName={personName} />
        ) : (
          <FlowChart flows={flows} personName={personName} />
        )}
      </Card>

      <Card
        title="Delivery log"
        description={
          deliveries.length ? `${deliveries.length.toLocaleString()} simulated deliveries, ${retried} needed a retry. Open a row to see each attempt.` : 'Every simulated send, with the receipt it produced.'
        }
        actions={log.actions}
        footer={log.footer}
        flush
        attrs={tourAnchor('routing.deliveries')}
      >
        {deliveriesQ.loading ? (
          <RowsSkeleton />
        ) : deliveriesQ.error && !deliveriesQ.data ? (
          <ErrorState error={deliveriesQ.error} onRetry={() => void deliveriesQ.refresh()} what="deliveries" />
        ) : (
          log.body
        )}
      </Card>
    </Page>
  );
}

/** A rule row, plus a full-width note row under it when something needs saying. */
function RuleRows({ children, note, dirty }: { children: ReactNode; note: ReactNode; dirty: boolean }) {
  return (
    <>
      {children}
      {note ? (
        <tr className={dirty ? `${styles.noteRow} ${styles.rowDirty}` : styles.noteRow}>
          <td colSpan={7}>{note}</td>
        </tr>
      ) : null}
    </>
  );
}

function OwnerPicker({ rule, value, owner, directory, onChange }: { rule: RoutingRule; value: string; owner: Person | null; directory: Person[]; onChange: (id: string) => void }) {
  const groups = PERSON_ROLES.map((role) => ({
    group: PERSON_ROLE_LABEL[role],
    options: directory.filter((p) => p.role === role).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.options.length);
  const current = directory.some((p) => p.id === value);
  const name = owner?.name ?? value;
  return (
    <div className={styles.ownerCell}>
      <label className={styles.picker}>
        <Avatar name={name} initials={owner?.initials} size="sm" />
        <span className={styles.pickerText}>{name}</span>
        <IconChevronDown size={14} className={styles.pickerChevron} />
        <select className={styles.pickerNative} aria-label={`Owner for ${ruleName(rule.name)}`} value={value} onChange={(e) => onChange(e.target.value)}>
          {!current ? <option value={value}>{`${name} (no longer in the directory)`}</option> : null}
          {groups.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {owner?.title ? (
        <span className={styles.ownerTitle} title={owner.title}>
          {owner.title}
        </span>
      ) : null}
    </div>
  );
}

function ChannelPicker({ rule, value, connections, onChange }: { rule: RoutingRule; value: Channel; connections: Parameters<typeof channelReady>[1]; onChange: (c: Channel) => void }) {
  const ready = channelReady(value, connections);
  return (
    <Tooltip label={ready ? null : `${channelConnector(value)?.name ?? channelLabel(value)} isn’t connected`}>
      <label className={styles.picker}>
        <ChannelMark channel={value} size={18} />
        <span className={styles.pickerText}>{channelLabel(value)}</span>
        {!ready ? <IconAlertTriangle size={14} className={styles.pickerWarn} /> : null}
        <IconChevronDown size={14} className={styles.pickerChevron} />
        <select className={styles.pickerNative} aria-label={`Channel for ${ruleName(rule.name)}`} value={value} onChange={(e) => onChange(e.target.value as Channel)}>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {channelReady(c, connections) ? channelLabel(c) : `${channelLabel(c)} (not connected)`}
            </option>
          ))}
        </select>
      </label>
    </Tooltip>
  );
}

function RowsSkeleton() {
  return (
    <div className={styles.inset} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <div className={styles.skelRule}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={10} />
          </div>
          <Skeleton height={28} />
          <Skeleton height={28} />
          <Skeleton height={28} />
        </div>
      ))}
    </div>
  );
}
