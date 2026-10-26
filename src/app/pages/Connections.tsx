/**
 * Connections: the tools Switchboard reads conversations from and sends results to. Connecting
 * one is simulated (a workspace record and in-app previews), but it changes real behaviour:
 * a routing rule whose tool is disconnected sends its matches to triage instead.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CONNECTORS, type Connection, type ConnectorCategory, type ConnectorDef } from '../../shared/platform';
import { Badge, Button, ButtonLink, Card, ConnectorMark, EmptyState, Page, PageHeader, SearchInput, Section, Segmented, Skeleton, Toolbar, Tooltip } from '../../ds';
import { IconPlug } from '../../ds/icons';
import { useConnections } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState } from '../components/domain';
import { tourAnchor } from '../../tour/anchors';
import { ConnectDialog } from './connections/ConnectDialog';
import styles from './connections/connections.module.css';

type Filter = 'all' | 'connected' | 'destination' | 'source';

export const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  chat: 'Team chat',
  tracker: 'Issue tracker',
  crm: 'CRM',
  email: 'Email',
  docs: 'Documents',
  recorder: 'Call recorder',
  support: 'Support desk',
};

export function directionLabel(def: ConnectorDef): string {
  return def.direction === 'source' ? 'Brings in conversations' : def.direction === 'destination' ? 'Receives results' : 'Brings in and receives';
}

const SIMULATED = 'Connecting records the connection in your workspace and changes routing for real. Deliveries are shown as in-app previews; nothing is sent to the actual tool.';

export default function ConnectionsPage() {
  useDocumentTitle('Connections');
  const conns = useConnections();
  const [params, setParams] = useSearchParams();
  const [connecting, setConnecting] = useState<ConnectorDef | null>(null);
  const filter = (params.get('show') as Filter | null) ?? 'all';
  const q = (params.get('q') ?? '').toLowerCase();

  const byId = new Map((conns.data ?? []).map((c) => [c.id, c]));
  const isOn = (d: ConnectorDef) => byId.get(d.id)?.status === 'connected';
  const matches = (d: ConnectorDef, f: Filter) =>
    f === 'all' ? true : f === 'connected' ? isOn(d) : f === 'destination' ? d.direction !== 'source' : d.direction !== 'destination';
  const searched = CONNECTORS.filter((d) => !q || `${d.name} ${d.vendor} ${CATEGORY_LABEL[d.category]} ${d.description}`.toLowerCase().includes(q));
  const shown = searched.filter((d) => matches(d, filter));
  const connected = shown.filter(isOn);
  const available = shown.filter((d) => !isOn(d));

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        title="Connections"
        badge={
          <Tooltip label={SIMULATED}>
            <span tabIndex={0} style={{ display: 'inline-flex' }}>
              <Badge tone="info">Simulated</Badge>
            </span>
          </Tooltip>
        }
        description="Where conversations come from, and the tools results are sent to. People are tagged with their own handle in each tool."
      />

      <Toolbar
        start={<SearchInput placeholder="Search tools" value={params.get('q') ?? ''} onChange={(e) => setParam('q', e.target.value || null)} aria-label="Search tools" />}
        end={
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={(v) => setParam('show', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'All', count: conns.data ? searched.length : null },
              { value: 'connected', label: 'Connected', count: conns.data ? searched.filter(isOn).length : null },
              { value: 'destination', label: 'Receives results', count: conns.data ? searched.filter((d) => matches(d, 'destination')).length : null },
              { value: 'source', label: 'Brings in conversations', count: conns.data ? searched.filter((d) => matches(d, 'source')).length : null },
            ]}
          />
        }
      />

      {conns.loading ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.card} style={{ padding: 20, gap: 12, display: 'flex', flexDirection: 'column' }}>
              <Skeleton width={160} height={16} />
              <Skeleton height={10} />
              <Skeleton width="70%" height={10} />
            </div>
          ))}
        </div>
      ) : conns.error && !conns.data ? (
        <Card>
          <ErrorState error={conns.error} onRetry={() => void conns.refresh()} what="connections" />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={<IconPlug />} title="No tools match" actions={<Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>} />
        </Card>
      ) : (
        <>
          {connected.length ? (
            <Section title={`Connected (${connected.length})`}>
              <div className={styles.grid} {...tourAnchor('connections.grid')}>
                {connected.map((d) => (
                  <ConnectorCard key={d.id} def={d} conn={byId.get(d.id)} onConnect={() => setConnecting(d)} />
                ))}
              </div>
            </Section>
          ) : null}
          {available.length ? (
            <Section title={`Available (${available.length})`}>
              <div className={styles.grid}>
                {available.map((d) => (
                  <ConnectorCard key={d.id} def={d} conn={byId.get(d.id)} onConnect={() => setConnecting(d)} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}

      {connecting ? <ConnectDialog def={connecting} open onClose={() => setConnecting(null)} /> : null}
    </Page>
  );
}

function ConnectorCard({ def, conn, onConnect }: { def: ConnectorDef; conn: Connection | undefined; onConnect: () => void }) {
  const on = conn?.status === 'connected';
  return (
    <article className={styles.card}>
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <ConnectorMark id={def.id} size={32} />
          <div className={styles.cardName}>
            <Link to={`/app/connections/${def.id}`} className={styles.cardTitle}>
              {def.name}
            </Link>
            <span className={styles.cardKind}>
              {CATEGORY_LABEL[def.category]}, {directionLabel(def).toLowerCase()}
            </span>
          </div>
        </div>
        <p className={styles.cardDesc}>{def.description}</p>
      </div>
      <div className={styles.cardFoot}>
        <span className={styles.status}>
          <span className={styles.statusDot} data-on={on} aria-hidden="true" />
          <span className={styles.statusText} title={on ? conn?.account ?? undefined : undefined}>
            {on ? conn?.account ?? 'Connected' : 'Not connected'}
          </span>
        </span>
        {on ? (
          <ButtonLink to={`/app/connections/${def.id}`} size="sm">
            Manage
          </ButtonLink>
        ) : (
          <Button size="sm" variant="primary" onClick={onConnect}>
            Connect
          </Button>
        )}
      </div>
    </article>
  );
}
