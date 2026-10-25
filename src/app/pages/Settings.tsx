import { useState } from 'react';
import { BUDGET_LIMIT_USD, THRESHOLDS } from '../../shared/contracts';
import { Button } from '../../system/components/primitives/Button.jsx';
import { Badge } from '../../system/components/primitives/Badge.jsx';
import { Modal } from '../../system/components/overlay/Modal.jsx';
import { Callout } from '../../system/components/blocks/Callout.jsx';
import { SettingsRow } from '../../system/components/blocks/SettingsRow.jsx';
import { CardSkeleton, PageHeaderSkeleton, SkeletonSurface } from '../../uis/Skeleton';
import { MonoId } from '../../uis/MonoId';
import { api } from '../api/client';
import { invalidate, useSession } from '../api/hooks';
import { AppPageHeader, ErrorState, Panel, useToast } from '../components/ui';
import { money } from '../lib/labels';
import styles from './settings/Settings.module.css';

function ThresholdBar() {
  const review = THRESHOLDS.review * 100;
  const auto = THRESHOLDS.autoRoute * 100;
  return (
    <div className={styles.scale} role="img" aria-label={`Confidence score: below ${THRESHOLDS.review} held, ${THRESHOLDS.review} to ${THRESHOLDS.autoRoute} reviewed by a person, ${THRESHOLDS.autoRoute} and above sent automatically`}>
      <div className={styles.track}>
        <span className={styles.zoneHeld} style={{ width: `${review}%` }}>
          Held
        </span>
        <span className={styles.zoneReview} style={{ width: `${auto - review}%` }}>
          Person reviews
        </span>
        <span className={styles.zoneAuto} style={{ width: `${100 - auto}%` }}>
          Sent automatically
        </span>
      </div>
      <div className={styles.ticks} aria-hidden="true">
        <span style={{ left: 0 }}>0.00</span>
        <span style={{ left: `${review}%` }}>{THRESHOLDS.review.toFixed(2)}</span>
        <span style={{ left: `${auto}%` }}>{THRESHOLDS.autoRoute.toFixed(2)}</span>
        <span style={{ left: '100%' }}>1.00</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const session = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (session.loading) {
    return (
      <SkeletonSurface label="Loading settings">
        <PageHeaderSkeleton />
        <div className="sl-stack-lg">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={4} />
        </div>
      </SkeletonSurface>
    );
  }
  if (session.error && !session.data) {
    return (
      <div className="sl-page">
        <AppPageHeader title="Settings" subtitle="Models, budget and the rules that decide what gets sent" dataAsOf={null} />
        <ErrorState error={session.error} onRetry={() => void session.refresh()} what="settings" />
      </div>
    );
  }
  const s = session.data!;

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetWorkspace();
      invalidate('');
      toast({ tone: 'success', title: 'Workspace reset', body: 'Your runs, reviews and rule overrides are cleared. Seeded history is untouched.' });
      setConfirm(false);
    } catch (e) {
      toast({ tone: 'danger', title: 'Reset failed', body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sl-page">
      <AppPageHeader title="Settings" subtitle="Models, budget and the rules that decide what gets sent" dataAsOf={session.dataAsOf} />
      <Callout tone="neutral" title="Viewer changes stay in your workspace">
        Everything you change in this demo (routing rules, review decisions, ticket states) is written to your own workspace
        <span className="sl-mono"> ({s.workspaceId})</span>. Other viewers see the seeded baseline plus their own changes, never yours.
      </Callout>

      <div className="sl-grid-2">
        <Panel title="Model configuration" sub="The exact AI models this deployment calls. Two at most, chosen for speed in testing. Everywhere else in the app they appear as Main model and Backup model." flush>
          <SettingsRow label="Main model" description="The fast model: screening, extraction and naming themes." controlWidth="auto">
            <MonoId value={s.models.primary} keep={40} />
          </SettingsRow>
          <SettingsRow label="Backup model" description="Takes over when the main model fails or is slow. From a different AI family, it also grades the evals." controlWidth="auto">
            <MonoId value={s.models.secondary} keep={40} />
          </SettingsRow>
          <SettingsRow label="Extraction prompt" description="Recorded on every insight; each version is tested before it goes live." controlWidth="auto" last>
            <Badge tone="brand" uppercase={false}>
              {s.promptVersion}
            </Badge>
          </SettingsRow>
        </Panel>

        <Panel title="Budget" sub="Live AI spend, shared by everyone viewing this demo." flush>
          <SettingsRow label="Spending limit" description="A hard limit at the AI provider, plus an in-app check before every run." controlWidth="auto">
            <span className="sl-num sl-strong">{money(s.budget.limitUsd ?? BUDGET_LIMIT_USD, { precise: true })}</span>
          </SettingsRow>
          <SettingsRow label="Spent so far" description={`${s.budget.liveRuns.toLocaleString()} live runs and ${s.budget.replayRuns.toLocaleString()} replays`} controlWidth="auto">
            <span className="sl-num">{money(s.budget.spentUsd, { precise: true })}</span>
          </SettingsRow>
          <SettingsRow label="When the limit is reached" description="Runs replay recorded live runs at real speed, clearly labelled. Custom uploads pause and say why." controlWidth="auto" last>
            <Badge tone={s.budget.liveEnabled ? 'success' : 'warning'} uppercase={false}>
              {s.budget.liveEnabled ? 'Live AI on' : 'Replay mode'}
            </Badge>
          </SettingsRow>
        </Panel>
      </div>

      <Panel title="Confidence thresholds" sub="Every insight gets a confidence score from 0 to 1 that decides where it goes. Read-only here: changing them has to pass the evals first.">
        <div className="sl-stack-lg">
          <ThresholdBar />
          <div className="sl-grid-3">
            <div className={styles.rule}>
              <span className={styles.ruleLabel}>Sent automatically</span>
              <span className={styles.ruleValue}>≥ {THRESHOLDS.autoRoute.toFixed(2)}</span>
              <p className="sl-p">At or above this score the insight goes straight to its owner. The score combines the AI’s confidence, how well the quote matched and how reliable that insight type usually is.</p>
            </div>
            <div className={styles.rule}>
              <span className={styles.ruleLabel}>Person reviews</span>
              <span className={styles.ruleValue}>
                {THRESHOLDS.review.toFixed(2)} – {THRESHOLDS.autoRoute.toFixed(2)}
              </span>
              <p className="sl-p">Goes to the review queue. Churn risk and critical bugs always land here, whatever their score.</p>
            </div>
            <div className={styles.rule}>
              <span className={styles.ruleLabel}>Quote match</span>
              <span className={styles.ruleValue}>≥ {THRESHOLDS.grounding.toFixed(2)}</span>
              <p className="sl-p">Every quote must be found in the conversation, word for word or a close match at this similarity. Below it the insight is dropped as made up.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Your workspace" sub="Start the walkthrough over with a clean slate.">
        <div className="sl-spread">
          <p className="sl-p" style={{ maxWidth: '62ch' }}>
            Clears the runs, review decisions, ticket changes and routing overrides you made. Seeded history and other viewers' workspaces are not affected.
          </p>
          <Button variant="danger" iconLeft="refresh" onClick={() => setConfirm(true)}>
            Reset my workspace
          </Button>
        </div>
      </Panel>

      <Modal
        open={confirm}
        onClose={() => (busy ? undefined : setConfirm(false))}
        eyebrow="Workspace"
        title="Reset your workspace?"
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setConfirm(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void reset()}>
              Reset workspace
            </Button>
          </>
        }
      >
        <p className="sl-p">
          Your runs, reviews and rule overrides in <span className="sl-mono">{s.workspaceId}</span> will be cleared. This cannot be undone. The seeded baseline stays.
        </p>
      </Modal>
    </div>
  );
}
