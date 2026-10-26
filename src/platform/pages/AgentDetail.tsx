/**
 * One agent: what it returns, who owns it and when it is reviewed, what it can touch, how it
 * scores against the standard, its service targets, alerts and change history. Only a real
 * agent has this page; a simulated agent's URL goes back to the registry (see canOpenAgent).
 */
import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Badge, ButtonLink, Callout, Card, CopyText, EmptyState, KeyValue, Page, PageHeader, PersonChip, Section, Stats, useCrumbs } from '../../ds';
import { IconActivity, IconCalendar, IconCheck, IconExternal, IconFileText, IconLock, IconX } from '../../ds/icons';
import { rewriteModelIds } from '../../shared/modelLabels';
import { tourAnchor } from '../../tour/anchors';
import { useTimezone } from '../../ds/time/TimezoneContext';
import type { AgentDetail as Detail, RegistryRow } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { BarList, Bars, ChartSummary } from '../ui/charts';
import { InfoTip } from '../ui/InfoTip';
import { AgentSourceBadge, AgentStatus, CLASSIFICATION, isOpenable, LoadError, OpsSkeleton, RankPerson, ReviewBadge, Score, SECURITY_REVIEW, SourceBadge, useOpsTitle, VocabBadge } from '../ui/kit';
import { AlertList, SloCards } from './Reliability';
import { RunbookLink } from './RunbookLink';

/** Registry rows seeded before the neutral wording named the model gateway vendor; never show it. */
const neutralIntegration = (s: string) => rewriteModelIds(s.replace(/open\s*router/gi, 'Model router'));

const KIND_LABEL: Record<string, string> = { deploy: 'Release', prompt: 'Prompt', model: 'Model', threshold: 'Threshold', rule: 'Rule', incident: 'Incident', review: 'Review', access: 'Access' };
const KIND_TONE: Record<string, 'neutral' | 'danger' | 'success' | 'info'> = { incident: 'danger', review: 'success', deploy: 'info' };

export function AgentDetail() {
  const { id = '' } = useParams();
  const reg = useApi<RegistryRow[]>('/agents');
  // Known simulated from the registry: redirect without loading its detail. The detail's own
  // source is the backstop when the registry is not loaded yet.
  const knownLocked = reg.data?.find((r) => r.id === id)?.source === 'simulated';
  const det = useApi<Detail>(knownLocked ? null : `/agents/${encodeURIComponent(id)}`, { pollMs: 30_000 });
  const locked = knownLocked || (!!det.data && !isOpenable(det.data.agent.source));
  const { hash } = useLocation();
  const { timezone } = useTimezone();
  const name = locked ? null : (det.data?.agent.name ?? null);
  useOpsTitle(name ?? 'Agent');
  useCrumbs(name ? [{ label: name }] : null, [name]);
  useEffect(() => {
    if (!hash || !det.data) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, det.data]);

  if (locked) return <Navigate to="/ops/agents" replace />;
  if (det.error && !det.data) {
    return (
      <Page>
        {det.error.status === 404 ? (
          <Card>
            <EmptyState
              title="No agent with that id"
              description="It is not in the registry."
              actions={
                <ButtonLink to="/ops/agents" size="sm">
                  Back to the registry
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <LoadError error={det.error} onRetry={det.reload} what="this agent" />
        )}
      </Page>
    );
  }
  if (!det.data) return <OpsSkeleton />;
  const { agent: a, profile: p, impact: im, slos, alerts, changelog, usage, outcomes, topUsers, reviewStatus } = det.data;
  const passed = a.standard.filter((c) => c.passed).length;
  const last = Date.parse(a.lastReview);
  const next = Date.parse(a.nextReview);
  const span = Math.max(1, next - last);
  const pos = Math.max(0, Math.min(1, (Date.now() - last) / span));
  const outcomeRows = (Object.entries(outcomes) as [keyof typeof outcomes, number][]).filter(([, n]) => n > 0).map(([k, n]) => ({ label: k[0]!.toUpperCase() + k.slice(1), value: n }));
  const color = f.seriesColor(p.color);
  const totalTasks = usage.reduce((s, u) => s + u.workUnits, 0);
  const busiest = usage.reduce<(typeof usage)[number] | null>((b, u) => (!b || u.workUnits > b.workUnits ? u : b), null);
  const business = a.businessOwner.replace(/ \(.*/, '');
  const businessRole = a.businessOwner.match(/\((.*)\)/)?.[1] ?? 'Business owner';

  return (
    <Page>
      <PageHeader
        title={a.name}
        badge={
          <>
            <AgentStatus value={a.status} />
            <AgentSourceBadge source={a.source} />
          </>
        }
        description={a.purpose}
        meta={
          <>
            <span>
              {a.department}, built with {a.builtWith === 'Code' ? 'code' : a.builtWith}
            </span>
            <span>{a.version}</span>
            <CopyText value={a.id} label="Copy agent id" />
          </>
        }
        actions={
          <>
            <ButtonLink to={`/ops/logs?agentId=${a.id}`} icon={<IconFileText />}>
              Logs
            </ButtonLink>
            <ButtonLink to={`/ops/reliability?agentId=${a.id}`} icon={<IconActivity />}>
              Reliability
            </ButtonLink>
            {a.href ? (
              <ButtonLink to={a.href} variant="primary" iconRight={<IconExternal size={14} />}>
                Open {a.name}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Stats
        items={[
          { label: 'Tasks', value: f.int(im.workUnits), sub: `One task is one ${a.unitLabel}` },
          {
            label: 'Hours saved',
            value: f.num(im.hoursReturned, 1),
            unit: 'h',
            sub: `${a.baselineMinutesPerUnit} min per task by hand`,
            info: <InfoTip label="Hours saved">Minutes each task takes by hand, minus the minutes a person spent reviewing, for every task that was kept.</InfoTip>,
          },
          { label: 'Estimated value', value: f.money(im.valueUsd), sub: 'Hours saved times hourly cost' },
          { label: 'AI cost', value: f.money(im.aiCostUsd), sub: im.workUnits ? `${f.money(im.aiCostUsd / im.workUnits, { precise: true })} per task` : 'No tasks yet' },
          {
            label: 'Accepted',
            value: f.pct(im.acceptanceRate),
            sub: 'Kept or sent automatically',
            info: <InfoTip label="Accepted">Share of tasks whose output was accepted by a reviewer or delivered automatically.</InfoTip>,
          },
          { label: 'People', value: f.int(im.activeUsers), sub: 'Simulated users and live viewers' },
        ]}
      />

      <div className="ao-split ao-split--stretch">
        <Card className="ao-fill" title="Ownership and review" description="A named owner, an accountable business owner and a review schedule. An overdue review fails the standard." attrs={tourAnchor('ops.agent.review')}>
          <div className="ao-owner">
            <div className="ao-owner__cell">
              <span className="ao-owner__key">Owner</span>
              <PersonChip name={a.ownerName} sub={a.ownerId === 'ppl_hunter' ? 'AI Operations Lead' : 'AI Operations'} />
            </div>
            <div className="ao-owner__cell">
              <span className="ao-owner__key">Business owner</span>
              <PersonChip name={business} sub={businessRole} />
            </div>
            <div className="ao-owner__cell">
              <span className="ao-owner__key">Review schedule</span>
              <span className="ao-inline">
                <span className="ao-owner__value">Every {a.reviewCadenceDays} days</span>
                <ReviewBadge value={reviewStatus} />
              </span>
            </div>
            <div className="ao-owner__cell ao-owner__wide">
              <span className="ao-owner__key">Success metric</span>
              <span className="ao-owner__text">{p.successMetric}</span>
            </div>
          </div>
          <div className="ao-cadence" role="img" aria-label={`Last review ${f.dayYear(a.lastReview)}, next review ${f.dayYear(a.nextReview)}; ${Math.round(pos * 100)}% of the cycle has passed`}>
            <div className="ao-cadence__track">
              <span className={`ao-cadence__fill${reviewStatus === 'overdue' ? ' ao-cadence__fill--danger' : reviewStatus === 'due_soon' ? ' ao-cadence__fill--warning' : ''}`} style={{ width: `${pos * 100}%` }} />
              <span className="ao-cadence__today" style={{ left: `${pos * 100}%` }} title="Today" />
            </div>
            <div className="ao-cadence__labels">
              <span>Last review {f.day(a.lastReview)}</span>
              <span>Next {f.day(a.nextReview)}</span>
            </div>
          </div>
          <div className="ao-inline" style={{ marginTop: 20 }}>
            <RunbookLink url={p.runbookUrl} />
            <ButtonLink size="sm" to="/ops/standard/reviews" icon={<IconCalendar size={14} />}>
              Review calendar
            </ButtonLink>
          </div>
        </Card>

        <Card className="ao-fill" title="Data access and security" description="What the agent can read and write, and the review that approved it.">
          <div className="ao-stack">
            <span className="ao-inline">
              <IconLock size={14} />
              <span className="ao-note">Data classification</span>
              <VocabBadge vocab={CLASSIFICATION} value={a.dataClassification} />
            </span>
            <ul className="ao-bullets">
              {a.dataAccess.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <KeyValue
              items={[
                { label: 'Security review', value: <VocabBadge vocab={SECURITY_REVIEW} value={p.securityReview.outcome} /> },
                {
                  label: 'Reviewed',
                  value: p.securityReview.outcome === 'pending' || p.securityReview.outcome === 'not_started' ? p.securityReview.reviewer : `${f.dayYear(p.securityReview.date)} by ${p.securityReview.reviewer}`,
                },
                { label: 'Scope', value: p.securityReview.scope },
                ...(p.securityReview.conditions.length ? [{ label: 'Conditions', value: p.securityReview.conditions.join('; ') }] : []),
                { label: 'Integrations', value: p.integrations.map(neutralIntegration).join(', ') },
                { label: 'Budget', value: `${f.money(p.monthlyBudgetUsd)} a month, ${f.money(p.perRunCapUsd)} per run` },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card
        id="standard"
        title={
          <span className="ao-inline">
            Agent standard
            <Score passed={passed} total={a.standard.length} />
          </span>
        }
        description="Nine checks every agent is held to. The review schedule and live logging are checked from data, not self-reported."
        attrs={tourAnchor('ops.agent.standard')}
        actions={
          <ButtonLink size="sm" variant="ghost" to="/ops/standard">
            Compare agents
          </ButtonLink>
        }
      >
        <ul className="ao-checks">
          {a.standard.map((c) => (
            <li key={c.key} className="ao-check" data-check={c.key} data-passed={c.passed}>
              <span className={`ao-check__icon${c.passed ? '' : ' ao-check__icon--fail'}`} aria-hidden="true">
                {c.passed ? <IconCheck size={12} /> : <IconX size={12} />}
              </span>
              <span className="ao-check__text">
                <span className="ao-check__label">
                  {c.label} <span className="ds-sr-only">{c.passed ? 'passes' : 'gap'}</span>
                </span>
                <span className="ao-check__evidence">{c.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="ao-split ao-split--stretch">
        <Card className="ao-fill" title="Tasks per day" description={`One task is one ${a.unitLabel}.`} actions={<SourceBadge source="mixed" />}>
          <Bars
            data={usage.map((u) => ({ ...u, label: f.day(u.day) }))}
            x="label"
            y="workUnits"
            color={color}
            height={200}
            yFormat={(v) => f.int(v)}
            tipTitle={(r) => String(r.label)}
            tipRows={(r) => [
              { label: 'Tasks', value: f.int(Number(r.workUnits)) },
              { label: 'People', value: f.int(Number(r.users)) },
              { label: 'Sessions', value: f.int(Number(r.sessions)) },
            ]}
            ariaLabel={`${a.name} tasks per day`}
          />
          <ChartSummary>
            {f.int(totalTasks)} tasks over {usage.length} days{busiest && busiest.workUnits ? `; the busiest day was ${f.day(busiest.day)} with ${f.int(busiest.workUnits)}` : ''}.
          </ChartSummary>
        </Card>
        <Card className="ao-fill" title="Outcomes and top users" actions={<SourceBadge source="mixed" />}>
          <h3 className="ao-subhead">What happened to each task</h3>
          <BarList rows={outcomeRows} format={(v) => f.int(v)} label="Task outcomes" />
          <h3 className="ao-subhead" style={{ marginTop: 20 }}>
            Top users
          </h3>
          {topUsers.length ? (
            <ol className="ao-rank">
              {topUsers.map((u, i) => (
                <li key={u.actorId} className="ao-rank__row">
                  <span className="ao-rank__n">{i + 1}</span>
                  <RankPerson name={u.name} sub={u.role} />
                  <span className="ao-rank__value">
                    <span className="ao-rank__strong">{f.int(u.workUnits)} tasks</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ao-note">No attributed work yet.</p>
          )}
        </Card>
      </div>

      <Section
        title="Service targets"
        description="Measured over the last 28 days."
        actions={
          <ButtonLink size="sm" variant="ghost" to={`/ops/reliability?agentId=${a.id}`}>
            Charts and models
          </ButtonLink>
        }
      >
        <SloCards slos={slos} />
      </Section>

      <Card title="Alerts" description="Rules firing now, plus past incidents." flush>
        <AlertList alerts={alerts} />
      </Card>

      <Card title="Change history" description="Releases, prompt and model changes with their test results, rules, reviews, access changes and incidents." actions={<SourceBadge source="mixed" />} flush>
        {changelog.length ? (
          <ol className="ao-history">
            {changelog.map((c) => (
              <li key={c.id} className="ao-history__item">
                <span className="ao-history__kind">
                  <Badge tone={KIND_TONE[c.kind] ?? 'neutral'}>{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                </span>
                <div className="ao-history__body">
                  <span className="ao-history__title">{rewriteModelIds(c.title)}</span>
                  <p className="ao-history__detail">{rewriteModelIds(c.detail)}</p>
                  <div className="ao-history__meta">
                    <span>{f.time(c.at, timezone)}</span>
                    <span>{c.actor}</span>
                    {c.ref ? <span className="ao-mono">{c.ref}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact title="No changes recorded" />
        )}
      </Card>

      <Callout tone="success" title="This is the real agent.">
        Signal Loop (in Switchboard) runs in this demo. Its runs, AI calls and deliveries report here live; the six weeks before today are simulated history.
      </Callout>
    </Page>
  );
}

