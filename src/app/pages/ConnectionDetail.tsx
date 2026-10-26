/**
 * One connection: its state, what flows through it, its settings, the routing rules that use
 * it, and whether every owner can be tagged in it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CHANNEL_CONNECTOR, CHANNEL_LABEL, connectorById, type RoutableChannel } from '../../shared/platform';
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CellText,
  ConnectorMark,
  EmptyState,
  Field,
  Grid,
  Input,
  KeyValue,
  Meter,
  Modal,
  Page,
  PageHeader,
  PageSkeleton,
  Table,
  useCrumbs,
  useToast,
} from '../../ds';
import { IconActivity, IconArrowDown, IconArrowUp, IconPlug, IconRoute, IconSend } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, useConnection, usePeople, useRules } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, When } from '../components/domain';
import { useWorldIndex } from '../lib/world';
import { CATEGORY_LABEL, directionLabel } from './Connections';
import { ConnectDialog } from './connections/ConnectDialog';
import styles from './connections/connections.module.css';

export default function ConnectionDetailPage() {
  const { id = '' } = useParams();
  const def = connectorById(id);
  useDocumentTitle(def?.name ?? 'Connection');
  useCrumbs(def ? [{ label: def.name }] : null, [def?.name]);
  const detail = useConnection(def ? id : null);
  const rules = useRules();
  const people = usePeople();
  const world = useWorldIndex();
  const toast = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState<'test' | 'off' | 'save' | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const conn = detail.data?.connection;
  useEffect(() => {
    if (conn) setConfig(conn.config);
  }, [conn]);

  const usingRules = useMemo(
    () => (rules.data ?? []).filter((r) => CHANNEL_CONNECTOR[r.channel as RoutableChannel] === id),
    [rules.data, id],
  );
  const coverage = useMemo(() => {
    if (!def?.identity) return null;
    const active = (people.data ?? []).filter((p) => p.active !== false);
    const key = def.identity;
    // Chat needs a handle; trackers, CRM, Teams and email match people by work email unless a handle is set.
    const byEmail = key !== 'slack';
    const has = active.filter((p) => !!(p.identities?.[key] || (key === 'slack' ? p.slackHandle : byEmail ? p.email : undefined)));
    const explicit = active.filter((p) => !!p.identities?.[key] || (key === 'slack' && !!p.slackHandle)).length;
    return { has: has.length, total: active.length, missing: active.filter((p) => !has.includes(p)), byEmail, explicit };
  }, [def, people.data]);

  if (!def) {
    return (
      <Page>
        <Card>
          <EmptyState icon={<IconPlug />} title="That tool isn’t in the catalog" actions={<ButtonLink to="/app/connections" size="sm">All connections</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  if (detail.loading) return <PageSkeleton />;
  if (detail.error && !detail.data) {
    return (
      <Page>
        <Card>
          <ErrorState error={detail.error} onRetry={() => void detail.refresh()} what={def.name} />
        </Card>
      </Page>
    );
  }

  const on = conn?.status === 'connected';
  const sendsResults = def.direction !== 'source';
  const activity = detail.data?.activity ?? [];

  const test = async () => {
    setBusy('test');
    try {
      const { data: r } = await api.testConnection(def.id);
      invalidate(`connections/${def.id}`);
      toast({ tone: r.ok ? 'success' : 'danger', title: r.ok ? `Test sent to ${def.name}` : `${def.name} test failed`, body: r.ok ? `${r.message}${r.receipt ? ` (${r.receipt})` : ''} in ${r.ms} ms.` : r.message });
    } catch (err) {
      toast({ tone: 'danger', title: 'Test failed', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async () => {
    setBusy('off');
    try {
      await api.updateConnection(def.id, { action: 'disconnect' });
      invalidate('connections', 'routing', 'overview');
      toast({ tone: 'success', title: `${def.name} disconnected`, body: usingRules.length ? `${usingRules.length} routing rule${usingRules.length === 1 ? '' : 's'} now send matches to triage.` : undefined });
      setConfirmOff(false);
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t disconnect', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    try {
      await api.updateConnection(def.id, { action: 'configure', config });
      invalidate('connections');
      toast({ tone: 'success', title: 'Settings saved' });
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t save', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title={
          <span className={styles.headerTitle}>
            <ConnectorMark id={def.id} size={32} />
            {def.name}
          </span>
        }
        badge={on ? <Badge tone="success" dot>Connected</Badge> : <Badge dot>Not connected</Badge>}
        description={def.description}
        actions={
          on ? (
            <>
              {sendsResults ? (
                <Button icon={<IconSend size={15} />} loading={busy === 'test'} onClick={() => void test()}>
                  Send a test
                </Button>
              ) : null}
              <Button variant="danger" onClick={() => setConfirmOff(true)}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setConnectOpen(true)}>
              Connect {def.name}
            </Button>
          )
        }
      />

      {!on && usingRules.length ? (
        <Callout tone="warning" title={`${usingRules.length} routing rule${usingRules.length === 1 ? ' uses' : 's use'} ${def.name}`}>
          While it’s disconnected, their matches go to the triage queue instead.
        </Callout>
      ) : null}

      <Grid cols="sidebar">
        <div className="ds-stack" style={{ gap: 'var(--space-4)' }}>
          <Card title="Activity" description={sendsResults ? 'Deliveries and test messages sent through this connection.' : 'Conversations imported through this connection.'} flush>
            {activity.length === 0 ? (
              <EmptyState compact icon={<IconActivity />} title="No activity yet" description={on ? (sendsResults ? 'Send a test, or run a conversation whose insights route here.' : 'Imports appear here as conversations arrive.') : `Connect ${def.name} to start.`} />
            ) : (
              <Table label={`${def.name} activity`} compact minWidth={560}>
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Direction</th>
                    <th>Status</th>
                    <th className="is-num">When</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.slice(0, 50).map((a) => (
                    <tr key={a.id}>
                      <td style={{ maxWidth: 380 }}>
                        <CellText
                          primary={a.runId ? <Link to={`/app/runs/${a.runId}`}>{a.title}</Link> : a.title}
                          secondary={a.detail}
                        />
                      </td>
                      <td className="is-nowrap">
                        <span className="ds-row" style={{ gap: 6 }}>
                          {a.direction === 'in' ? <IconArrowDown size={14} className={styles.dirIn} /> : <IconArrowUp size={14} className={styles.dirOut} />}
                          {a.direction === 'in' ? 'In' : 'Out'}
                        </span>
                      </td>
                      <td className="is-nowrap">
                        <Badge tone={a.status === 'failed' ? 'danger' : a.status === 'retried' ? 'warning' : a.status === 'test' ? 'neutral' : 'success'}>
                          {a.status === 'ok' ? 'Delivered' : a.status === 'retried' ? 'Delivered after retry' : a.status === 'test' ? 'Test' : 'Failed'}
                        </Badge>
                      </td>
                      <td className="is-num ds-muted">
                        <When value={a.at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {sendsResults ? (
            <Card
              title="Routing rules using this tool"
              actions={
                <ButtonLink to="/app/routing" size="sm" variant="ghost" icon={<IconRoute size={14} />}>
                  Routing
                </ButtonLink>
              }
              flush
            >
              {usingRules.length === 0 ? (
                <EmptyState compact title="No rules send here" description="Pick this tool as a rule’s channel on the Routing page." />
              ) : (
                <ul className={styles.ruleList}>
                  {usingRules.map((r) => (
                    <li key={r.id} className={styles.ruleItem}>
                      <span className="ds-stack" style={{ minWidth: 0 }}>
                        <span className={styles.ruleName}>{r.name}</span>
                        <span className="ds-subtle" style={{ fontSize: 12 }}>
                          {world.personName(r.ownerId)}, {CHANNEL_LABEL[r.channel as RoutableChannel]} {r.destination}
                        </span>
                      </span>
                      {r.enabled ? <Badge tone={on ? 'success' : 'warning'}>{on ? 'Active' : 'Going to triage'}</Badge> : <Badge>Off</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <div className="ds-stack" style={{ gap: 'var(--space-4)' }}>
          <Card title="Details">
            <div className={styles.facts}>
              <KeyValue
                items={[
                  { label: 'Account', value: on ? conn?.account ?? '—' : 'Not connected' },
                  { label: 'Type', value: CATEGORY_LABEL[def.category] },
                  { label: 'Connected', value: on && conn?.connectedAt ? <When value={conn.connectedAt} /> : '—' },
                  { label: 'Connected by', value: on && conn?.connectedBy ? (people.data ?? []).find((p) => p.id === conn.connectedBy)?.name ?? world.personName(conn.connectedBy) : '—' },
                  { label: 'Last activity', value: conn?.lastActivityAt ? <When value={conn.lastActivityAt} /> : '—' },
                ]}
              />
              <div className="ds-stack" style={{ gap: 8 }}>
                <span className="ds-field__label">{directionLabel(def)}</span>
                {def.receives ? (
                  <div className={styles.flowRow}>
                    <IconArrowDown size={14} />
                    <span>{def.receives}</span>
                  </div>
                ) : null}
                {def.sends ? (
                  <div className={styles.flowRow}>
                    <IconArrowUp size={14} />
                    <span>{def.sends}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          {coverage ? (
            <Card title="Tagging people" description={`Owners are mentioned by their ${def.name} handle.`}>
              <div className={styles.coverage}>
                <div className={styles.coverageHead}>
                  <span>
                    <strong className="ds-num">{coverage.has}</strong> of {coverage.total} people can be tagged
                  </span>
                  <Link to="/app/people">People</Link>
                </div>
                <Meter value={coverage.has} max={Math.max(1, coverage.total)} tone={coverage.has < coverage.total ? 'warning' : 'accent'} label="People with a handle in this tool" />
                {coverage.byEmail ? (
                  <span className="ds-subtle" style={{ fontSize: 12 }}>
                    {coverage.explicit ? `${coverage.explicit} have a ${def.name} handle set; the rest are matched by work email.` : `Matched by work email. Set a ${def.name} handle on a person to override it.`}
                  </span>
                ) : null}
                {coverage.missing.length ? (
                  <span className="ds-subtle" style={{ fontSize: 12 }}>
                    Missing: {coverage.missing.slice(0, 4).map((p) => p.name).join(', ')}
                    {coverage.missing.length > 4 ? ` and ${coverage.missing.length - 4} more` : ''}. They’re tagged by name instead.
                  </span>
                ) : null}
              </div>
            </Card>
          ) : null}

          {on && def.configFields.length ? (
            <Card title="Settings">
              <div className={styles.form}>
                {def.configFields.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`cfg-${f.key}`} hint={f.help}>
                    <Input id={`cfg-${f.key}`} placeholder={f.placeholder} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
                  </Field>
                ))}
                <div className={styles.formActions}>
                  <Button size="sm" variant="primary" loading={busy === 'save'} onClick={() => void save()}>
                    Save settings
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </Grid>

      <ConnectDialog def={def} open={connectOpen} onClose={() => setConnectOpen(false)} />
      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={`Disconnect ${def.name}?`}
        description={
          usingRules.length
            ? `${usingRules.length} routing rule${usingRules.length === 1 ? '' : 's'} send to ${def.name}. Their matches will go to the triage queue until you reconnect.`
            : `Switchboard will stop ${sendsResults ? 'sending to' : 'importing from'} ${def.name}. You can reconnect at any time.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy === 'off'} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </>
        }
      />
    </Page>
  );
}
