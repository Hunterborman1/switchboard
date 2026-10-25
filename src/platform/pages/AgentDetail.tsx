import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { MetricStrip } from '../ui/Kpis';
import { tourAnchor } from '../../tour/anchors';
import { rewriteModelIds } from '../../shared/modelLabels';

/** Registry rows seeded before the neutral wording named the model gateway vendor; never show it. */
const neutralIntegration = (s: string) => rewriteModelIds(s.replace(/open\s*router/gi, 'Model router'));
import type { AgentDetail as Detail } from '../../worker/platform/types';
import { useApi } from '../lib/api';
import * as f from '../lib/format';
import { Bars, BarList } from '../ui/charts';
import { IconAlert, IconArrowUpRight, IconCheck, IconLock, IconLogs, IconPulse, IconX } from '../ui/icons';
import { AgentStatus, Avatar, Callout, CLASSIFICATION, Empty, ErrorState, PageHead, PageSkeleton, Panel, Pill, ReviewPill, Score, SourceChip } from '../ui/kit';
import { AlertList, SloCards } from './Reliability';
import { RunbookLink } from './RunbookLink';
import { useTimezone } from '../../uis/TimezoneContext';

const KIND_LABEL: Record<string, string> = { deploy: 'Deploy', prompt: 'Prompt', model: 'Model', threshold: 'Threshold', rule: 'Rule', incident: 'Incident', review: 'Review', access: 'Access' };

export function AgentDetail() {
  const { id = '' } = useParams();
  const det = useApi<Detail>(`/agents/${encodeURIComponent(id)}`, { pollMs: 30_000 });
  const { hash } = useLocation();
  const { timezone } = useTimezone();
  useEffect(() => {
    if (!hash || !det.data) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ block: 'start' });
  }, [hash, det.data]);

  if (det.error && !det.data) {
    return (
      <div className="ao-page">
        {det.error.status === 404 ? (
          <Empty title="No agent with that id">
            It is not in the registry. <Link to="/ops/agents">Back to the registry</Link>
          </Empty>
        ) : (
          <ErrorState message={det.error.message} onRetry={det.reload} />
        )}
      </div>
    );
  }
  if (!det.data) return <PageSkeleton />;
  const { agent: a, profile: p, impact: im, slos, alerts, changelog, usage, outcomes, topUsers, reviewStatus } = det.data;
  const passed = a.standard.filter((c) => c.passed).length;
  const live = a.source === 'live';
  const last = Date.parse(a.lastReview);
  const next = Date.parse(a.nextReview);
  const now = Date.now();
  const span = Math.max(1, next - last);
  const pos = Math.max(0, Math.min(1, (now - last) / span));
  const outcomeRows = (Object.entries(outcomes) as [keyof typeof outcomes, number][]).filter(([, n]) => n > 0).map(([k, n]) => ({ label: k[0]!.toUpperCase() + k.slice(1), value: n }));

  return (
    <div className="ao-page">
      <PageHead
        eyebrow={
          <>
            <Link to="/ops/agents">Agent registry</Link> / {a.department} · built with {a.builtWith === 'Code' ? 'code' : a.builtWith}
          </>
        }
        title={a.name}
        sub={a.purpose}
        meta={
          <>
            <AgentStatus value={a.status} />
            <SourceChip source={live ? 'live' : 'simulated'} label={live ? 'Real agent, live data' : 'Simulated agent'} />
            <span>{a.version}</span>
            <span className="ao-mono">{a.id}</span>
          </>
        }
        actions={
          <>
            <Link to={`/ops/logs?agentId=${a.id}`} className="ao-btn">
              <IconLogs /> Logs
            </Link>
            <Link to={`/ops/reliability?agentId=${a.id}`} className="ao-btn">
              <IconPulse /> Reliability
            </Link>
            {a.href ? (
              <Link to={a.href} className="ao-btn primary">
                Open {a.name} <IconArrowUpRight size={13} />
              </Link>
            ) : null}
          </>
        }
      />

      <MetricStrip
        minItemWidth={150}
        label={`${a.name} impact`}
        items={[
          { label: 'Tasks', value: f.int(im.workUnits), sub: `One task is one ${a.unitLabel}` },
          { label: 'Hours saved', value: f.num(im.hoursReturned, 1), unit: 'h', sub: `${a.baselineMinutesPerUnit} min per task by hand`, help: 'Minutes each task takes by hand, minus the minutes a person spent reviewing, for every task that was kept.' },
          { label: 'Estimated value', value: f.money(im.valueUsd), sub: 'Hours saved × hourly cost' },
          { label: 'AI cost', value: f.money(im.aiCostUsd), sub: im.workUnits ? `${f.money(im.aiCostUsd / im.workUnits, { precise: true })} per task` : '—' },
          { label: 'Accepted', value: f.pct(im.acceptanceRate), sub: 'Kept or delivered automatically', help: 'Share of tasks whose output was accepted by a reviewer or delivered automatically.' },
          { label: 'People', value: f.int(im.activeUsers), sub: live ? 'Simulated users and live viewers' : 'Simulated users' },
        ]}
      />

      <div className="ao-grid g-main">
        <Panel title="Ownership and review" sub="Every production agent has a named owner, a business owner and a review schedule. An overdue review fails the standard." attrs={tourAnchor('ops.agent.review')}>
          <div className="ao-owner">
            <div>
              <span className="k">Owner (builds and runs it)</span>
              <span className="ao-person">
                <Avatar name={a.ownerName} />
                <span>
                  <b>{a.ownerName}</b>
                  <br />
                  <small>{a.ownerId === 'ppl_hunter' ? 'AI Operations Lead' : 'AI Operations'}</small>
                </span>
              </span>
            </div>
            <div>
              <span className="k">Business owner (accountable)</span>
              <span className="ao-person">
                <Avatar name={a.businessOwner} />
                <span>
                  <b>{a.businessOwner.replace(/ \(.*/, '')}</b>
                  <br />
                  <small>{a.businessOwner.match(/\((.*)\)/)?.[1] ?? ''}</small>
                </span>
              </span>
            </div>
            <div>
              <span className="k">Review schedule</span>
              <b>Every {a.reviewCadenceDays} days</b>
              <span>
                <ReviewPill value={reviewStatus} />
              </span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="k">Success metric</span>
              <small style={{ color: 'var(--ao-text)', fontSize: 13, lineHeight: 1.5 }}>{p.successMetric}</small>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="ao-cadence" role="img" aria-label={`Last review ${a.lastReview}, next review ${a.nextReview}; ${Math.round(pos * 100)}% of the cycle elapsed`}>
              <span className="track" />
              <span className="fill" style={{ width: `${pos * 100}%`, background: reviewStatus === 'overdue' ? 'var(--ao-danger)' : reviewStatus === 'due_soon' ? 'var(--ao-warning-mark)' : 'var(--ao-accent)' }} />
              <span className="lab" style={{ left: 0, transform: 'none' }}>
                Last review {f.day(a.lastReview)}
              </span>
              <span className="lab" style={{ left: '100%', transform: 'translateX(-100%)' }}>
                Next {f.day(a.nextReview)}
              </span>
              <span className="mk" style={{ left: `calc(${pos * 100}% - 1px)` }} title="Today" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <RunbookLink url={p.runbookUrl} />
            <Link className="ao-btn sm" to="/ops/standard/reviews">
              Review calendar
            </Link>
          </div>
        </Panel>

        <Panel title="Data access and security review" sub="What the agent can read and write, and the review that approved it.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <IconLock /> <span style={{ fontSize: 13, color: 'var(--ao-text-2)' }}>Data classification</span> <Pill vocab={CLASSIFICATION} value={a.dataClassification} />
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13, color: 'var(--ao-text-2)', lineHeight: 1.5 }}>
              {a.dataAccess.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <dl className="ao-kv">
              <dt>Security review</dt>
              <dd>
                <Pill
                  vocab={{
                    approved: { label: 'Approved', tone: 'success', help: 'Passed security & data review.' },
                    approved_with_conditions: { label: 'Approved with conditions', tone: 'success', help: 'Passed, with conditions the owner must keep.' },
                    pending: { label: 'Pending', tone: 'warning', help: 'Review in progress.' },
                    not_started: { label: 'Not started', tone: 'danger', help: 'No review yet.' },
                  }}
                  value={p.securityReview.outcome}
                />
              </dd>
              <dt>Reviewed</dt>
              <dd>
                {p.securityReview.outcome === 'pending' || p.securityReview.outcome === 'not_started'
                  ? p.securityReview.reviewer
                  : `${f.dayYear(p.securityReview.date)} by ${p.securityReview.reviewer}`}
              </dd>
              <dt>Scope</dt>
              <dd>{p.securityReview.scope}</dd>
              {p.securityReview.conditions.length ? (
                <>
                  <dt>Conditions</dt>
                  <dd>{p.securityReview.conditions.join('; ')}</dd>
                </>
              ) : null}
              <dt>Integrations</dt>
              <dd>{p.integrations.map(neutralIntegration).join(' · ')}</dd>
              <dt>Budget</dt>
              <dd>
                {f.money(p.monthlyBudgetUsd)} a month, {f.money(p.perRunCapUsd)} per run
              </dd>
            </dl>
          </div>
        </Panel>
      </div>

      <Panel
        id="standard"
        title={
          <>
            Agent standard <Score passed={passed} total={a.standard.length} />
          </>
        }
        sub="The nine checks every agent is reviewed against before and after it goes live. Review schedule and live logging are checked from data, not self-reported."
        attrs={tourAnchor('ops.agent.standard')}
        actions={
          <Link className="ao-btn sm" to="/ops/standard">
            All agents
          </Link>
        }
      >
        <ul className="ao-checks">
          {a.standard.map((c) => (
            <li key={c.key} data-check={c.key} data-passed={c.passed}>
              <span className={`ic ${c.passed ? 'pass' : 'fail'}`} aria-hidden="true">
                {c.passed ? <IconCheck size={14} /> : <IconX size={14} />}
              </span>
              <span>
                <b>
                  {c.label} <span className="ao-sr">{c.passed ? 'passes' : 'gap'}</span>
                </b>
                <small>{c.evidence}</small>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="ao-grid g-main">
        <Panel title="Tasks per day" source={live ? 'mixed' : 'simulated'} sub={`One task is one ${a.unitLabel}. Hover a day for people and sessions.`}>
          <Bars
            data={usage.map((u) => ({ ...u, label: f.day(u.day) }))}
            x="label"
            y="workUnits"
            color={f.seriesColor(p.color)}
            height={200}
            yFormat={(v) => String(v)}
            tipTitle={(r) => String(r.label)}
            tipRows={(r) => [
              { label: 'Tasks', value: f.int(Number(r.workUnits)) },
              { label: 'People', value: f.int(Number(r.users)) },
              { label: 'Sessions', value: f.int(Number(r.sessions)) },
            ]}
            ariaLabel={`${a.name} tasks per day`}
          />
        </Panel>
        <Panel title="Outcomes and top users" source={live ? 'mixed' : 'simulated'}>
          <h3 className="ao-subhead">What happened to each task</h3>
          <BarList rows={outcomeRows} format={(v) => f.int(v)} color={f.seriesColor(p.color)} />
          <h3 className="ao-subhead" style={{ marginTop: 20 }}>Top users</h3>
          {topUsers.length ? (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {topUsers.map((u, i) => (
                <li key={u.actorId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="ao-muted ao-num" style={{ width: 14, fontSize: 13 }}>
                    {i + 1}
                  </span>
                  <Avatar name={u.name} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 500 }}>{u.name}</b>
                    <br />
                    <small className="ao-muted" style={{ fontSize: 13 }}>{u.role}</small>
                  </span>
                  <span className="ao-num">{f.int(u.workUnits)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ao-muted">No attributed work yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Service targets" source={live ? 'mixed' : 'simulated'} sub="Measured over the last 28 days." actions={<Link className="ao-btn sm" to={`/ops/reliability?agentId=${a.id}`}>Charts and models</Link>}>
        <SloCards slos={slos} />
      </Panel>

      <Panel title="Alerts" sub="Rules that are firing now, plus past incidents." flush>
        <AlertList alerts={alerts} />
      </Panel>

      <Panel title="Change history" sub="Releases, prompt and model changes with their test results, threshold and rule changes, reviews, access changes and incidents." source={live ? 'mixed' : 'simulated'}>
        {changelog.length ? (
          <ol className="ao-log">
            {changelog.map((c) => (
              <li key={c.id}>
                <span className={`nd ${c.kind}`} aria-hidden="true">
                  {c.kind === 'incident' ? <IconAlert size={12} /> : c.kind === 'review' ? <IconCheck size={12} /> : <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}
                </span>
                <div>
                  <div className="hd">
                    <span className="ao-tag">{KIND_LABEL[c.kind] ?? c.kind}</span>
                    <b>{rewriteModelIds(c.title)}</b>
                  </div>
                  <p>{rewriteModelIds(c.detail)}</p>
                  <div className="meta">
                    <span>{f.time(c.at, timezone)}</span>
                    <span>{c.actor}</span>
                    {c.ref ? <span className="ao-mono">{c.ref}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty title="No changes recorded" />
        )}
      </Panel>

      {live ? (
        <Callout tone="live" title="This is the real agent.">
          Signal Loop runs in this demo. Its runs, AI calls, deliveries and the people using it right now report here live; the six weeks before today are simulated history.{' '}
          <Link to="/app" className="ao-link">
            Open Signal Loop →
          </Link>
        </Callout>
      ) : (
        <Callout title="Simulated agent.">This record, its users and its activity are simulated, to show how an agent built in Gumloop sits in the same registry under the same standard.</Callout>
      )}
    </div>
  );
}
