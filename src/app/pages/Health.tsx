/**
 * Usage and health: the live-AI budget, what the AI did each day (calls, cost, response time),
 * what failed and is waiting for a person, and the latest runs. Calm and factual: a day with
 * nothing recorded is a gap, never zero.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SIGNAL_LOOP_AGENT_ID } from '../../shared/platform-contracts';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, ButtonLink, Card, CellText, EmptyState, KeyValue, Meter, Page, PageHeader, Segmented, Skeleton, Stats, Table, TableSkeleton, Tooltip, type Tone } from '../../ds';
import { IconCheckCircle, IconSend } from '../../ds/icons';
import { useHealth } from '../api/hooks';
import type { AiCallRow, DlqRow, LedgerDay } from '../api/types';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, When } from '../components/domain';
import { int, ms } from '../lib/labels';
import { useModelLabels } from '../lib/models';
import { DailyChart, type ChartMetric, type DayPoint } from './health/DailyChart';
import styles from './health/Health.module.css';

const LOGS = `/ops/logs?agentId=${SIGNAL_LOOP_AGENT_ID}`;
const traceHref = (runId: string) => `/ops/traces/${encodeURIComponent(runId)}`;
const runLogsHref = (runId: string) => `${LOGS}&runId=${encodeURIComponent(runId)}`;
const RECENT_RUNS = 10;

/** The Worker's rows carry a few more fields than the typed shape (purpose, createdAt, fallback). */
type CallRow = AiCallRow & { purpose?: string | null; createdAt?: string; error?: string | null; fallback?: boolean };

const usd2 = (v: number) => `$${v.toFixed(2)}`;
/** Small totals: cents for anything over a dollar, otherwise enough decimals to be honest. */
const usdSmall = (v: number | null | undefined) => (v == null ? '—' : v === 0 ? '$0' : v >= 1 ? usd2(v) : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);

const PURPOSE_LABEL: Record<string, string> = {
  screen: 'Screening',
  extract: 'Extraction',
  theme: 'Theme naming',
  theme_name: 'Theme naming',
  second_opinion: 'Second opinion',
  triage: 'Triage',
  judge: 'Grading',
  embed: 'Theme matching',
  deliver: 'Delivery',
};
const purposeLabel = (p: string | null | undefined) => (p ? (PURPOSE_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' ')) : 'AI call');

/** "Schema validation failed twice (…); secondary model timed out after 20s" in plain words. */
function plainError(raw: string): string {
  const parts: string[] = [];
  if (/schema|validation|parse|json/i.test(raw)) parts.push('The AI’s answer was incomplete, even after a retry');
  if (/timed? ?out|timeout|too slow/i.test(raw)) parts.push(/secondary|backup|fallback/i.test(raw) ? 'The backup model took too long to answer' : 'The model took too long to answer');
  if (/\b5\d\d\b|unavailable/i.test(raw)) parts.push('The destination was unavailable');
  if (/\b429\b|rate limit/i.test(raw)) parts.push('The AI provider was busy');
  if (/\b40[13]\b|unauthori[sz]ed|forbidden/i.test(raw)) parts.push('Access was refused');
  if (/budget/i.test(raw)) parts.push('The live AI budget was used up');
  if (/parked|manual retry/i.test(raw)) parts.push('Parked for a person to retry');
  return parts.length ? `${parts.join('. ')}.` : raw;
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Every calendar day from the first recorded day to the last, with the missing ones as gaps. */
function fillDays(ledger: LedgerDay[]): DayPoint[] {
  const byDay = new Map(ledger.map((d) => [d.day, d]));
  const sorted = [...byDay.keys()].sort();
  if (!sorted.length) return [];
  const out: DayPoint[] = [];
  const end = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`).getTime();
  for (let t = new Date(`${sorted[0]}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const d = byDay.get(day);
    const collected = !!d && (d.calls != null || d.costUsd != null);
    out.push({
      day,
      label: dayLabel(day),
      collected,
      calls: collected ? d!.calls : null,
      failures: collected ? d!.failures : null,
      cost: collected ? d!.costUsd : null,
      p50: collected ? d!.p50Ms : null,
      p95: collected ? d!.p95Ms : null,
    });
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

type RunGroup = { key: string; runId: string | null; at: string; calls: CallRow[]; cost: number; took: number; ok: boolean; fallback: boolean; replay: boolean };

function groupRuns(rows: CallRow[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const r of rows) {
    const at = r.at ?? r.createdAt ?? '';
    const key = r.runId ?? r.id;
    const g = groups.get(key) ?? { key, runId: r.runId, at, calls: [], cost: 0, took: 0, ok: true, fallback: false, replay: false };
    g.calls.push(r);
    g.cost += r.costUsd ?? 0;
    g.took += r.ms ?? 0;
    g.ok &&= r.ok;
    g.fallback ||= !!r.fallback;
    g.replay ||= r.mode === 'replay';
    if (at > g.at) g.at = at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));
}

function OpsLinks({ runId }: { runId: string | null }) {
  if (!runId) return <span className="ds-subtle">—</span>;
  return (
    <span className={styles.opsLinks}>
      <Link to={traceHref(runId)}>Trace</Link>
      <Link to={runLogsHref(runId)}>Logs</Link>
    </span>
  );
}

function HealthSkeleton() {
  return (
    <div className="ds-stack" style={{ gap: 24 }} aria-busy="true" aria-label="Loading usage and health">
      <div className="ds-card ds-stack" style={{ gap: 14, padding: 20 }}>
        <Skeleton width={160} height={12} />
        <Skeleton width={240} height={28} />
        <Skeleton height={6} />
        <Skeleton width="50%" height={10} />
      </div>
      <Skeleton height={96} radius={8} />
      <div className="ds-card ds-stack" style={{ gap: 12, padding: 20 }}>
        <Skeleton width={140} height={12} />
        <Skeleton height={200} radius={6} />
      </div>
      <TableSkeleton rows={4} cols={6} />
    </div>
  );
}

export default function HealthPage() {
  useDocumentTitle('Usage and health');
  const health = useHealth();
  const { label: modelLabel, rewrite } = useModelLabels();
  const [metric, setMetric] = useState<ChartMetric>('calls');
  const [showTable, setShowTable] = useState(false);

  const days = useMemo(() => fillDays(health.data?.ledger ?? []), [health.data?.ledger]);
  const runs = useMemo(() => groupRuns((health.data?.recent ?? []) as CallRow[]).slice(0, RECENT_RUNS), [health.data?.recent]);

  const header = (
    <PageHeader title="Usage and health" description="What the AI costs, how fast it answers and anything that failed." actions={<ButtonLink to={LOGS}>View logs in Agent Ops</ButtonLink>} />
  );

  if (health.loading) {
    return (
      <Page>
        {header}
        <HealthSkeleton />
      </Page>
    );
  }
  if (health.error && !health.data) {
    return (
      <Page>
        {header}
        <Card>
          <ErrorState error={health.error} onRetry={() => void health.refresh()} what="usage and health" />
        </Card>
      </Page>
    );
  }

  const h = health.data!;
  const b = h.budget;
  const used = b.limitUsd > 0 ? b.spentUsd / b.limitUsd : 0;
  const perRun = b.liveRuns ? b.spentUsd / b.liveRuns : null;
  const roomFor = perRun ? Math.max(0, Math.floor((b.limitUsd - b.spentUsd) / perRun)) : null;
  const meterTone = !b.liveEnabled || used >= 0.9 ? 'danger' : used >= 0.75 ? 'warning' : 'accent';

  const recorded = days.filter((d) => d.collected);
  const gaps = days.length - recorded.length;
  const calls = recorded.reduce((a, d) => a + (d.calls ?? 0), 0);
  const failures = recorded.reduce((a, d) => a + (d.failures ?? 0), 0);
  const cost = recorded.reduce((a, d) => a + (d.cost ?? 0), 0);
  const costMedian = median(recorded.flatMap((d) => (d.cost != null ? [d.cost] : [])));
  const latest = [...recorded].reverse().find((d) => d.p50 != null || d.p95 != null) ?? null;
  const p50Median = median(recorded.flatMap((d) => (d.p50 != null ? [d.p50] : [])));
  const p95Median = median(recorded.flatMap((d) => (d.p95 != null ? [d.p95] : [])));
  const gapText = gaps ? ` ${gaps} day${gaps === 1 ? '' : 's'} with nothing recorded ${gaps === 1 ? 'shows' : 'show'} as a gap, not zero.` : '';
  const summary =
    metric === 'calls'
      ? `${int(calls)} AI calls over ${recorded.length} days, ${int(failures)} failed.${gapText}`
      : metric === 'cost'
        ? `${usdSmall(cost)} of AI cost over ${recorded.length} days, typically ${usdSmall(costMedian)} a day.${gapText}`
        : `On a typical day the usual call took ${ms(p50Median)} and the slowest 5% took ${ms(p95Median)}.${gapText}`;

  const cap = b.liveEnabled
    ? `At ${usd2(b.limitUsd)}, live AI switches off and every run replays a recorded live run at real speed. Nothing breaks.`
    : b.reason === 'disabled_by_owner'
      ? 'The owner switched live AI off. Runs replay recorded live runs at real speed, clearly labelled.'
      : 'The budget is used up. Runs replay recorded live runs at real speed, and custom uploads are paused.';

  return (
    <Page>
      {header}

      <Card
        title="Live AI budget"
        description="One shared cap for everyone viewing this demo, with the same hard limit set at the AI provider."
        attrs={tourAnchor('health.budget')}
        actions={
          <Badge tone={b.liveEnabled ? 'success' : 'warning'} dot>
            {b.liveEnabled ? 'Live AI on' : 'Replay mode'}
          </Badge>
        }
      >
        <div className={styles.budget}>
          <div className={styles.budgetMain}>
            <p className={styles.budgetFigure}>
              <span className={styles.budgetSpent}>{usd2(b.spentUsd)}</span>
              <span className={styles.budgetOf}>of {usd2(b.limitUsd)} used</span>
            </p>
            <Meter value={b.spentUsd} max={b.limitUsd} tone={meterTone} label={`Live AI budget: ${usd2(b.spentUsd)} of ${usd2(b.limitUsd)} used`} />
            <div className={styles.meterScale}>
              <span>{(used * 100).toFixed(used > 0 && used < 0.01 ? 2 : 1)}% used</span>
              <span>{usd2(Math.max(0, b.limitUsd - b.spentUsd))} left</span>
            </div>
            <p className={styles.capLine}>{cap}</p>
          </div>
          <KeyValue
            className={styles.budgetFacts}
            items={[
              { label: 'Live runs', value: <span className="ds-num">{int(b.liveRuns)}</span> },
              { label: 'Replays', value: <span className="ds-num">{int(b.replayRuns)}</span> },
              { label: 'Per live run', value: <span className="ds-num">{perRun != null ? usdSmall(perRun) : 'No live runs yet'}</span> },
              { label: 'Room for', value: <span className="ds-num">{roomFor != null ? `About ${int(roomFor)} more runs` : '—'}</span> },
            ]}
          />
        </div>
      </Card>

      {recorded.length ? (
        <Stats
          items={[
            { label: 'AI calls', value: int(calls), sub: `Over ${recorded.length} recorded days` },
            { label: 'AI cost', value: usdSmall(cost), sub: costMedian != null ? `Typically ${usdSmall(costMedian)} a day` : undefined },
            {
              label: 'Typical response',
              value: ms(latest?.p50),
              sub: latest?.p95 != null ? `Slowest 5%: ${ms(latest.p95)} on ${latest.label}` : undefined,
            },
            { label: 'Failed calls', value: int(failures), sub: `Out of ${int(calls)}. ${h.dlq.length} waiting for a person` },
          ]}
        />
      ) : null}

      <Card
        title="Daily usage"
        description={days.length ? `${days[0]!.label} to ${days[days.length - 1]!.label}` : 'Nothing recorded yet'}
        actions={
          days.length ? (
            <Segmented<ChartMetric>
              label="Chart metric"
              size="sm"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'calls', label: 'Calls' },
                { value: 'cost', label: 'Cost' },
                { value: 'latency', label: 'Response time' },
              ]}
            />
          ) : undefined
        }
        footer={
          days.length ? (
            <>
              <span className={styles.summary}>{summary}</span>
              <Button size="sm" variant="ghost" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
                {showTable ? 'Hide table' : 'Show table'}
              </Button>
            </>
          ) : undefined
        }
      >
        {days.length === 0 ? (
          <EmptyState compact title="Nothing recorded yet" description="The ledger fills as soon as the first live run calls a model." />
        ) : (
          <div className={styles.chartStack}>
            <DailyChart days={days} metric={metric} label={summary} />
            {showTable ? (
              <div className={styles.ledgerTable}>
                <Table compact label="Daily usage" minWidth={560}>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="is-num">AI calls</th>
                      <th className="is-num">Failed</th>
                      <th className="is-num">AI cost</th>
                      <th className="is-num">Typical call</th>
                      <th className="is-num">Slowest 5%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...days].reverse().map((d) => (
                      <tr key={d.day}>
                        <td className="is-nowrap">{d.label}</td>
                        {d.collected ? (
                          <>
                            <td className="is-num">{int(d.calls)}</td>
                            <td className="is-num">{int(d.failures)}</td>
                            <td className="is-num">{usdSmall(d.cost)}</td>
                            <td className="is-num">{ms(d.p50)}</td>
                            <td className="is-num">{ms(d.p95)}</td>
                          </>
                        ) : (
                          <td colSpan={5} className="is-num ds-subtle">
                            Nothing recorded
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card id="dlq" title="Failures waiting for a person" description="A failed call is retried, then handed to the backup model. Anything still failing is parked here." flush>
        {h.dlq.length === 0 ? (
          <EmptyState compact icon={<IconCheckCircle />} title="Nothing failed" description="Every step succeeded or recovered on a retry." />
        ) : (
          <Table label="Failures waiting for a person" minWidth={860}>
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Step</th>
                <th>What went wrong</th>
                <th className="is-num">Attempts</th>
                <th className="is-num">Failed</th>
                <th>Agent Ops</th>
              </tr>
            </thead>
            <tbody>
              {h.dlq.map((r: DlqRow) => (
                <tr key={r.id}>
                  <td className={styles.cellConversation}>
                    <CellText primary={r.filename ?? 'Conversation'} secondary={r.runId ?? undefined} />
                  </td>
                  <td className="is-nowrap">{purposeLabel(r.step)}</td>
                  <td className={styles.cellError}>
                    <Tooltip label={rewrite(r.error)}>
                      <span tabIndex={0} className={styles.errorText}>
                        {plainError(r.error)}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="is-num">{r.attempts ?? '—'}</td>
                  <td className="is-num ds-muted">
                    <When value={r.at} />
                  </td>
                  <td className="is-nowrap">
                    <OpsLinks runId={r.runId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        id="recent-calls"
        title="Recent runs"
        description="The latest runs that called a model, with what each cost."
        footer={
          runs.length ? (
            <>
              <span>
                The latest {runs.length} run{runs.length === 1 ? '' : 's'}
              </span>
              <ButtonLink to={LOGS} variant="ghost" size="sm">
                All calls in Agent Ops
              </ButtonLink>
            </>
          ) : undefined
        }
        flush
      >
        {runs.length === 0 ? (
          <EmptyState compact icon={<IconSend />} title="No AI calls yet" description="Runs appear here as soon as a live run reaches its first model call." />
        ) : (
          <Table label="Recent runs" minWidth={900}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Models</th>
                <th className="is-num">AI calls</th>
                <th className="is-num">AI cost</th>
                <th className="is-num">Took</th>
                <th>Result</th>
                <th className="is-num">When</th>
                <th>Agent Ops</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((g) => {
                const steps = [...new Set([...g.calls].reverse().map((c) => purposeLabel(c.purpose ?? c.step)))];
                const models = [...new Set(g.calls.map((c) => modelLabel(c.model) ?? 'Other model'))];
                const result: { tone: Tone; text: string; tip: string } = !g.ok
                  ? { tone: 'danger', text: 'Failed', tip: g.calls.find((c) => !c.ok)?.error ? plainError(g.calls.find((c) => !c.ok)!.error!) : 'At least one AI call failed.' }
                  : g.fallback
                    ? { tone: 'warning', text: 'Used backup', tip: 'The main model failed or was slow, so the backup model answered.' }
                    : { tone: 'success', text: 'OK', tip: 'Every AI call succeeded.' };
                return (
                  <tr key={g.key}>
                    <td className={styles.cellRun}>
                      <CellText
                        primary={
                          g.runId ? (
                            <Link to={`/app/runs/${g.runId}`} className={styles.runLink}>
                              {g.runId}
                            </Link>
                          ) : (
                            'Single call'
                          )
                        }
                        secondary={steps.join(', ')}
                      />
                    </td>
                    <td className={styles.cellModels}>{models.join(', ')}</td>
                    <td className="is-num">{g.calls.length}</td>
                    <td className="is-num">{usdSmall(g.cost)}</td>
                    <td className="is-num">{ms(g.took)}</td>
                    <td className="is-nowrap">
                      <span className={styles.badges}>
                        <Tooltip label={result.tip}>
                          <span tabIndex={0} className={styles.badgeFocus}>
                            <Badge tone={result.tone} dot>
                              {result.text}
                            </Badge>
                          </span>
                        </Tooltip>
                        {g.replay ? <Badge tone="info">Replay</Badge> : null}
                      </span>
                    </td>
                    <td className="is-num ds-muted">
                      <When value={g.at} />
                    </td>
                    <td className="is-nowrap">
                      <OpsLinks runId={g.runId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
