/**
 * Settings: the workspace, the models it calls (the one page that shows their exact ids), the
 * thresholds that decide where an insight goes, the prompt version and how data is handled.
 */
import { useState, type ReactNode } from 'react';
import { THRESHOLDS } from '../../shared/contracts';
import { Badge, Button, ButtonLink, Card, DotLabel, IconButton, Modal, Page, PageHeader, Skeleton, useToast } from '../../ds';
import { IconCheck, IconCopy, IconRefresh } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, useSession } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState } from '../components/domain';
import { dateShort } from '../lib/labels';
import styles from './settings/Settings.module.css';

/** Shown in the product switcher; the workspace has no editable name yet. */
const WORKSPACE_NAME = 'Invoca Customer Success';

function SettingRow({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </li>
  );
}

/** An id a person might copy: the full value in mono, and a copy button beside it. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={styles.copyValue}>
      <span className={styles.mono} title={value}>
        {value}
      </span>
      <IconButton
        label={copied ? 'Copied' : label}
        size="sm"
        icon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          });
        }}
      />
    </span>
  );
}

function ModelId({ id }: { id: string | null | undefined }) {
  if (!id) return <span className={styles.notSet}>Not configured</span>;
  return <CopyValue value={id} label="Copy model ID" />;
}

const fixed = (n: number) => n.toFixed(2);

/** The 0 to 1 confidence score and the two lines that split it. */
function ThresholdScale() {
  const review = THRESHOLDS.review * 100;
  const auto = THRESHOLDS.autoRoute * 100;
  return (
    <div className={styles.scaleBlock}>
      <div
        className={styles.track}
        role="img"
        aria-label={`Confidence score from 0 to 1: below ${fixed(THRESHOLDS.review)} is held, ${fixed(THRESHOLDS.review)} to ${fixed(THRESHOLDS.autoRoute)} goes to review, ${fixed(THRESHOLDS.autoRoute)} and above is sent automatically`}
      >
        <span className={`${styles.zone} ${styles.zoneHeld}`} style={{ width: `${review}%` }} />
        <span className={`${styles.zone} ${styles.zoneReview}`} style={{ width: `${auto - review}%` }} />
        <span className={`${styles.zone} ${styles.zoneAuto}`} style={{ width: `${100 - auto}%` }} />
      </div>
      <div className={styles.ticks} aria-hidden="true">
        <span className={styles.tickStart}>0</span>
        <span className={styles.tick} style={{ left: `${review}%` }}>
          {fixed(THRESHOLDS.review)}
        </span>
        <span className={styles.tick} style={{ left: `${auto}%` }}>
          {fixed(THRESHOLDS.autoRoute)}
        </span>
        <span className={styles.tickEnd}>1</span>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <DotLabel color="var(--border-strong)">Held</DotLabel>
        <DotLabel color="var(--warning-mark)">A person reviews</DotLabel>
        <DotLabel color="var(--accent)">Sent automatically</DotLabel>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="ds-stack" style={{ gap: 24 }} aria-busy="true" aria-label="Loading settings">
      {[3, 3, 2].map((rows, i) => (
        <div key={i} className="ds-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <Skeleton width={140} height={12} />
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '22px 20px', borderBottom: r < rows - 1 ? '1px solid var(--border-row)' : 0 }}>
              <Skeleton width="40%" height={10} />
              <Skeleton width={120} height={10} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const session = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetWorkspace();
      invalidate('');
      toast({ tone: 'success', title: 'Workspace reset', body: 'Your conversations, reviews and rule changes are cleared. Sample history is untouched.' });
      setConfirm(false);
    } catch (e) {
      toast({ tone: 'danger', title: 'Couldn’t reset the workspace', body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const header = <PageHeader title="Settings" description="Your workspace, the AI models it calls and the rules that decide what gets sent." />;

  if (session.loading) {
    return (
      <Page width="narrow">
        {header}
        <SettingsSkeleton />
      </Page>
    );
  }
  if (session.error && !session.data) {
    return (
      <Page width="narrow">
        {header}
        <Card>
          <ErrorState error={session.error} onRetry={() => void session.refresh()} what="settings" />
        </Card>
      </Page>
    );
  }
  const s = session.data!;
  const version = s.promptVersion.split('@').pop() ?? s.promptVersion;

  return (
    <Page width="narrow">
      {header}

      <Card title="Workspace" description="Everything you change here is saved to your own private workspace. Other viewers never see it." flush>
        <ul className={styles.rows}>
          <SettingRow label="Name">
            <span className={styles.value}>{WORKSPACE_NAME}</span>
          </SettingRow>
          <SettingRow label="Workspace ID" description="Quote it if you report a problem.">
            <CopyValue value={s.workspaceId} label="Copy workspace ID" />
          </SettingRow>
          <SettingRow
            label="Your access"
            description={
              s.isOwner
                ? 'Signed in as the owner. You can change workspace-wide settings.'
                : s.linkExpiresAt
                  ? `Signed in with a private link that works until ${dateShort(s.linkExpiresAt)}.`
                  : 'Signed in as a viewer.'
            }
          >
            <Badge tone={s.isOwner ? 'accent' : 'neutral'}>{s.isOwner ? 'Owner' : 'Viewer'}</Badge>
          </SettingRow>
          <SettingRow label="Reset workspace" description="Clears your conversations, review decisions, ticket changes and routing changes. Sample history stays.">
            <Button variant="danger" icon={<IconRefresh size={14} />} onClick={() => setConfirm(true)}>
              Reset workspace
            </Button>
          </SettingRow>
        </ul>
      </Card>

      <Card title="Models" description="The AI models this workspace calls. Everywhere else in the app they appear by role." flush>
        <ul className={styles.rows}>
          <SettingRow label="Decision model" description="Triage and second opinions. Fast, so it can sit in front of every conversation.">
            <ModelId id={s.models.decision} />
          </SettingRow>
          <SettingRow label="Main model" description="Reads each conversation and pulls out the insights.">
            <ModelId id={s.models.primary} />
          </SettingRow>
          <SettingRow label="Backup model" description="Takes over when the main model fails, and grades the quality checks. A different AI family.">
            <ModelId id={s.models.secondary} />
          </SettingRow>
        </ul>
      </Card>

      <Card title="Thresholds" description="Every insight gets a confidence score from 0 to 1. Read-only here: the owner changes these, and only after the new values pass the quality check." flush>
        <ThresholdScale />
        <ul className={styles.rows}>
          <SettingRow label="Send automatically" description="At or above this score, the insight goes straight to its owner.">
            <span className={styles.value}>≥ {fixed(THRESHOLDS.autoRoute)}</span>
          </SettingRow>
          <SettingRow label="Send for review" description="From this score up, a person checks it first. Churn risk and critical bugs always come here.">
            <span className={styles.value}>≥ {fixed(THRESHOLDS.review)}</span>
          </SettingRow>
          <SettingRow label="Quote match" description="Each quote must match the conversation at least this closely, or the insight is dropped.">
            <span className={styles.value}>≥ {fixed(THRESHOLDS.grounding)}</span>
          </SettingRow>
        </ul>
      </Card>

      <Card title="Prompt" flush>
        <ul className={styles.rows}>
          <SettingRow label="Extraction prompt" description="Recorded on every insight. A new version goes live only if it passes the quality check.">
            <Badge tone="accent" size="lg">
              {version}
            </Badge>
            <ButtonLink to="/app/evals" variant="ghost" size="sm">
              View quality
            </ButtonLink>
          </SettingRow>
        </ul>
      </Card>

      <Card title="Data handling" flush>
        <ul className={styles.rows}>
          <SettingRow label="Redaction" description="Names, emails, phone numbers and health information are replaced with placeholders before any model call.">
            <Badge tone="success" dot>
              On
            </Badge>
          </SettingRow>
          <SettingRow label="Provider data collection" description="Model providers are told not to store or train on anything this workspace sends.">
            <Badge tone="success" dot>
              Off
            </Badge>
          </SettingRow>
        </ul>
      </Card>

      <Modal
        open={confirm}
        onClose={() => (busy ? undefined : setConfirm(false))}
        title="Reset this workspace?"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void reset()}>
              Reset workspace
            </Button>
          </>
        }
      >
        <p className={styles.modalText}>
          Your conversations, review decisions, ticket changes and routing changes will be cleared. This can’t be undone. Sample history stays, and other viewers aren’t affected.
        </p>
      </Modal>
    </Page>
  );
}
