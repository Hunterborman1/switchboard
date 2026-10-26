/**
 * The simulated authorize screen for a connector: what Switchboard will be able to do, which
 * account, and the connector's settings. Connecting records a workspace connection; nothing is
 * sent to the real tool.
 */
import { useEffect, useState } from 'react';
import type { Connection, ConnectorDef } from '../../../shared/platform';
import { Button, Callout, ConnectorMark, Field, Input, Modal, useToast } from '../../../ds';
import { IconCheck } from '../../../ds/icons';
import { api } from '../../api/client';
import { invalidate } from '../../api/hooks';
import { SIMULATED_TIP, SimulatedBadge } from '../../components/domain';
import styles from './connections.module.css';

export function ConnectDialog({ def, open, onClose, onConnected }: { def: ConnectorDef; open: boolean; onClose: () => void; onConnected?: (c: Connection) => void }) {
  const toast = useToast();
  const [account, setAccount] = useState(def.defaultAccount);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAccount(def.defaultAccount);
      setConfig({});
      setError(null);
    }
  }, [open, def]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const filled = Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim()));
      const { data: c } = await api.updateConnection(def.id, { action: 'connect', account: account.trim() || def.defaultAccount, config: filled });
      invalidate('connections', 'routing', 'overview', 'session');
      toast({ tone: 'success', title: `${def.name} connected`, body: `Simulated account ${c.account ?? def.defaultAccount}. Routing uses it from now on.` });
      onConnected?.(c);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      title={
        <span className={styles.dialogTitle}>
          <ConnectorMark id={def.id} size={28} />
          Connect {def.name}
        </span>
      }
      footerStart={<SimulatedBadge tip={SIMULATED_TIP.connections} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Authorize and connect
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <div>
          <p className={styles.dialogLead}>Switchboard will be able to:</p>
          <ul className={styles.scopes}>
            {def.scopes.map((s) => (
              <li key={s}>
                <IconCheck size={14} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <Field label="Account" htmlFor="connect-account" hint={`The ${def.vendor} workspace or address to connect.`}>
          <Input id="connect-account" value={account} onChange={(e) => setAccount(e.target.value)} />
        </Field>
        {def.configFields.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`connect-${f.key}`} optional hint={f.help}>
            <Input id={`connect-${f.key}`} placeholder={f.placeholder} value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
          </Field>
        ))}
        {error ? <Callout tone="danger">{error}</Callout> : null}
      </div>
    </Modal>
  );
}
