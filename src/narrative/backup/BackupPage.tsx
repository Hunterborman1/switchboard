/**
 * Q&A backup pages (/backup/:topic). Standalone, deep-linkable, light and flat.
 * Topics match BACKUPS in src/tour/script/chapters.ts.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Badge, Button, Callout, TabLinks } from '../../ds';
import { IconArrowLeft, IconArrowRight } from '../../ds/icons';
import { SiteBar, Stat } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';
import { BACKUPS } from '../../tour/script/chapters';
import { tourApi } from '../../tour/api';
import { STANDARD_CHECKS } from '../../shared/platform-contracts';
import { BUDGET_LIMIT_USD } from '../../shared/contracts';
import './backup.css';

// ---------------------------------------------------------------- frame

/** A plain panel: white, 1px border, 8px radius (the system's card surface without a header). */
function Card({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <section className="bk-card" data-accent={accent ? 'true' : undefined}>
      {children}
    </section>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="bk-lede">{children}</p>;
}

function Frame({ topic, num, title, children }: { topic: string | null; num: string; title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const back = () => {
    const st = window.history.state as { idx?: number } | null;
    if (st && typeof st.idx === 'number' && st.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <main className="ds-app sl-n n-page bk-page" data-testid="backup-page" data-topic={topic ?? 'index'}>
      <SiteBar context="Questions">
        <Button variant="ghost" size="sm" icon={<IconArrowLeft size={16} />} onClick={back} data-testid="backup-back">
          Back
        </Button>
      </SiteBar>
      <div className="bk-switch">
        <div className="bk-switch__in">
          <TabLinks label="Q&A topics" items={BACKUPS.map((b) => ({ to: `/backup/${b.topic}`, label: b.title }))} />
        </div>
      </div>
      <div className="bk-body">
        <header className="bk-head">
          <p className="bk-kicker">{num}</p>
          <h1 className="bk-title">{title}</h1>
        </header>
        {children}
      </div>
    </main>
  );
}

const fmtUsd = (n: number, d = 4) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---------------------------------------------------------------- cost

type CostData = { perCall: number | null; liveRuns: number; p50Ms: number | null; spent: number | null; limit: number; ledgerCalls: number | null; ok: boolean };

function useCostData(): CostData | null {
  const [d, setD] = useState<CostData | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: CostData = { perCall: null, liveRuns: 0, p50Ms: null, spent: null, limit: BUDGET_LIMIT_USD, ledgerCalls: null, ok: false };
      try {
        const runs = await tourApi.runs(200);
        const live = runs.filter((r) => r.mode === 'live' && r.costUsd > 0);
        out.liveRuns = live.length;
        if (live.length) out.perCall = live.reduce((a, r) => a + r.costUsd, 0) / live.length;
        const durs = runs.map((r) => r.durationMs).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
        if (durs.length) out.p50Ms = durs[Math.floor(durs.length / 2)] ?? null;
        out.ok = true;
      } catch {
        /* fallback copy */
      }
      try {
        const h = await tourApi.health();
        out.spent = h.budget.spentUsd;
        out.limit = h.budget.limitUsd;
        out.ledgerCalls = h.ledger.reduce((a, l) => a + l.calls, 0);
        out.ok = true;
      } catch {
        /* fallback copy */
      }
      if (alive) setD(out);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return d;
}

function Gauge({ spent, limit }: { spent: number; limit: number }) {
  const calm = useCalm();
  const pct = Math.max(0, Math.min(1, spent / limit));
  const r = 80;
  const c = Math.PI * r;
  return (
    <svg viewBox="0 0 200 120" className="bk-gauge" role="img" aria-label={`Live AI budget: $${spent.toFixed(2)} of $${limit.toFixed(2)} used`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" className="bk-gauge__track" strokeWidth="12" strokeLinecap="round" />
      <motion.path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        className="bk-gauge__fill"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={calm ? { duration: 0 } : { duration: 0.6, ease: EASE }}
      />
      <text x="100" y="86" textAnchor="middle" className="bk-gauge__v">${spent.toFixed(2)}</text>
      <text x="100" y="108" textAnchor="middle" className="bk-gauge__l">of the ${limit.toFixed(0)} shared limit</text>
    </svg>
  );
}

// Measured shares of AI spend across the 48 recorded runs (data/replays/*.json).
const STEP_COST = [
  { k: 'Quick screen', share: 0.23, note: 'a short check on every file' },
  { k: 'Finding the feedback', share: 0.68, note: 'the whole redacted transcript in, structured results out' },
  { k: 'Naming themes', share: 0.09, note: 'only when a new theme forms' },
  { k: 'Similarity matching', share: 0, note: 'runs on the hosting platform, not billed per call' },
  { k: 'Retries and backup model', share: 0, note: 'none needed in the 48 recorded runs; budgeted anyway' },
];

function Cost() {
  const d = useCostData();
  const perCall = d?.perCall ?? null;
  return (
    <>
      <div className="bk-stats">
        <Card>
          {perCall != null && perCall > 0 ? <Stat value={perCall} prefix="$" decimals={4} label="per call (measured on live runs)" tone="accent" note={`${d?.liveRuns ?? 0} live runs so far`} /> : <Stat value={0.0014} prefix="~$" decimals={4} label="per call (recorded runs)" tone="accent" note="live figures unavailable right now" />}
        </Card>
        <Card>
          <Stat value={(perCall ?? 0.0014) * 1000} prefix="$" decimals={2} label="per 1,000 calls" note="before volume discounts or caching" />
        </Card>
        <Card>
          {d?.p50Ms != null ? <Stat value={d.p50Ms / 1000} decimals={1} suffix=" seconds" label="typical run time" note="all ten steps, end to end" /> : <Stat value={0} label="typical run time" note="not measured yet" />}
        </Card>
      </div>
      <div className="bk-split">
        <Card>
          <span className="n-label">Live AI spending limit</span>
          <Gauge spent={d?.spent ?? 0} limit={d?.limit ?? BUDGET_LIMIT_USD} />
          <p className="n-body">
            Viewers share a hard {`$${(d?.limit ?? BUDGET_LIMIT_USD).toFixed(0)}`} limit: one set at the AI provider, plus a check inside the app before every run (spend so far plus the run’s worst case). The key used for building and testing has its own $20 limit and never serves viewers.
          </p>
        </Card>
        <Card>
          <span className="n-label">Where a call’s cost goes</span>
          <div className="bk-bars">
            {STEP_COST.map((s) => (
              <div key={s.k} className="bk-bar">
                <div className="bk-bar__row">
                  <span>{s.k}</span>
                  <span className="n-num">{Math.round(s.share * 100)}%</span>
                </div>
                <div className="bk-bar__track">
                  <motion.div className="bk-bar__fill" initial={{ width: 0 }} animate={{ width: `${s.share * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                </div>
                <span className="n-note">{s.note}</span>
              </div>
            ))}
          </div>
          <p className="n-note" style={{ marginTop: 12 }}>Typical for a 30 to 40 minute transcript; the exact split for every run is on its trace page.</p>
        </Card>
      </div>
      <Callout>
        <b>At the limit it replays; it doesn’t break.</b> Every featured file has a recorded real run (its steps, results and timings). Once the money is spent, or if a live call fails or runs slow, the run replays that recording at real speed and says “Replay of a recorded live run” on screen. Your own uploads show a clear “Live AI limit reached” message.
      </Callout>
      {!d?.ok && d && <p className="n-note">Live numbers couldn’t be loaded just now; figures shown are estimates.</p>}
    </>
  );
}

// ---------------------------------------------------------------- security

const SEC: { t: string; items: string[]; tone?: 'accent' | 'indigo' }[] = [
  { t: 'Personal and health details', tone: 'accent', items: ['Redaction runs before any model sees the text: names, phone numbers, emails, card numbers, dates of birth, medical record numbers, addresses.', 'Each value becomes a placeholder like [PATIENT_1]; the original never leaves the server.', 'The browser only ever receives a masked preview (“J••• D••”).'] },
  { t: 'Hidden instructions', tone: 'accent', items: ['Transcript text is marked clearly as data, never as instructions.', 'The model can only fill in a fixed form and has no tools, so a planted instruction has nothing to act on.', 'Suspected attempts are flagged by the screening step and written to the audit log.'] },
  { t: 'Access', items: ['A password, plus signed links that expire seven days after they’re issued.', 'The sign-in cookie only works on this site, can’t be read by scripts, and expires with the link.', 'Revoke one link on its own, or all of them at once.'] },
  { t: 'Isolation', items: ['Every viewer gets their own workspace. Everyone sees the same sample data; changes only ever go to your own copy.', 'One panelist’s rule change or approval never shows up for another.'] },
  { t: 'Providers and keys', tone: 'indigo', items: ['Model calls only go to providers that don’t keep or train on the data (a routing setting, not yet a contract). Contractual zero retention and a data agreement are production items.', 'Keys live only on the server; nothing sensitive is ever sent to the browser.', 'Limits per session and per run, on top of the spending limit.'] },
];

function Security() {
  return (
    <>
      <Lede>Treat the transcript as hostile and personal by default. Here’s what that means concretely.</Lede>
      <div className="bk-cards">
        {SEC.map((s) => (
          <Card key={s.t}>
            <h3 className="bk-h3">{s.t}</h3>
            <ul className="bk-list">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Callout>In production I’d add a formal data review with Security before any real call reaches the system, a data agreement with each provider, and a release check that measures how much personal data redaction actually catches.</Callout>
    </>
  );
}

// ---------------------------------------------------------------- failure

const FLOW = [
  { k: 'Model answer', s: 'a filled-in form' },
  { k: 'Check the form', s: 'every field validated' },
  { k: 'Retry once', s: 'with the errors' },
  { k: 'Backup model', s: 'a second provider' },
  { k: 'Parked for a person', s: 'on the Health page' },
];

function FailureFlow() {
  const calm = useCalm();
  const step = 196;
  return (
    <svg viewBox="0 0 1000 170" className="bk-flow" role="img" aria-label="When the model's answer is malformed: check it, retry once with the errors, switch to the backup model, then park it for a person.">
      {FLOW.map((f, i) => {
        const x = 10 + i * step;
        const last = i === FLOW.length - 1;
        return (
          <g key={f.k}>
            <motion.rect x={x} y={40} width={160} height={74} rx={8} className={last ? 'bk-flow__box bk-flow__box--last' : 'bk-flow__box'} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: calm ? 0 : 0.18, delay: calm ? 0 : i * 0.1, ease: EASE }} />
            <text x={x + 80} y={74} textAnchor="middle" className="bk-flow__k">{f.k}</text>
            <text x={x + 80} y={96} textAnchor="middle" className="bk-flow__s">{f.s}</text>
            {!last && (
              <>
                <motion.path d={`M${x + 160} 77 H${x + step}`} className="bk-flow__line" strokeWidth="1.5" initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: calm ? 0 : 0.24, delay: calm ? 0 : 0.1 + i * 0.1 }} />
                <text x={x + 178} y={66} textAnchor="middle" className="bk-flow__f">fails</text>
              </>
            )}
            {i < FLOW.length - 1 && i > 0 && (
              <>
                <path d={`M${x + 80} 114 V146 H${x + 120}`} className="bk-flow__okline" fill="none" />
                <text x={x + 126} y={150} className="bk-flow__ok">works, carry on</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const FAILS = [
  { t: 'Provider errors', d: 'Rate limits, outages and timeouts are retried, waiting a little longer each time. Every call has a time limit. A slow or failing main model hands over to the backup model.' },
  { t: 'A quote that isn’t in the call', d: 'If a quote can’t be found in the transcript, word for word or very nearly, the insight is dropped and counted as made up. It’s never shown as fact.' },
  { t: 'Spending limit or live failure', d: 'The run replays a recorded real run at real speed, labelled on screen. The walkthrough works for all seven days regardless.' },
  { t: 'Partial failure', d: 'If Jira succeeds and Slack fails, the delivery reads as failed, with attempts and receipts per destination. Partial is not success.' },
  { t: 'Duplicates', d: 'Every upload gets a fingerprint. Uploading the same file again opens the same run, with no double insights.' },
  { t: 'Picking up where it stopped', d: 'The ten steps run on a fast path and save as they go. If a step fails or the run takes too long, a background job resumes from the last finished step, not from scratch.' },
];

function Failure() {
  return (
    <>
      <Lede>Things will fail. The design goal is that every failure is visible, bounded and recoverable.</Lede>
      <Card>
        <span className="n-label">When the model’s answer is malformed</span>
        <FailureFlow />
      </Card>
      <div className="bk-cards">
        {FAILS.map((f) => (
          <Card key={f.t}>
            <h3 className="bk-h3">{f.t}</h3>
            <p className="n-body">{f.d}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- build vs buy

const BVB = [
  { n: 'Gong', what: 'Conversation intelligence', good: 'Excellent capture, transcription and search across calls. Sales teams already know it.', gap: 'Built for deal coaching. It doesn’t own Invoca’s product taxonomy, routing rules or loop-closing back to CSMs.', cost: 'Per-seat licence; data lives in their platform.' },
  { n: 'Productboard', what: 'Feedback + roadmap', good: 'Good place for PMs to link feedback to features and roadmap items.', gap: 'Depends on people submitting and tagging notes, which is exactly the step that leaks today.', cost: 'Per-maker licence; another tool for CSMs to feed.' },
  { n: 'Enterpret', what: 'Feedback analytics', good: 'Unifies sources and auto-tags themes well; strong for trend analysis.', gap: 'Less about per-insight grounding, human review gates and routing to a named owner in their channel.', cost: 'Platform contract; taxonomy partly theirs.' },
  { n: 'Invoca Signal AI', what: 'Invoca’s own conversation AI', good: 'Already turns calls into signals at scale. Invoca owns the data, the models and the roadmap.', gap: 'Pointed at customers’ calls today, not at Invoca’s internal CSM workflow and its owners.', cost: 'Internal; the natural long-term home.' },
];

function BuildVsBuy() {
  return (
    <>
      <Lede>A fair comparison. Each of these is good at something; none of them does this specific job end to end.</Lede>
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col">Strength</th>
              <th scope="col">Gap for this job</th>
              <th scope="col">Cost &amp; ownership</th>
            </tr>
          </thead>
          <tbody>
            {BVB.map((r) => (
              <tr key={r.n}>
                <th scope="row">
                  <b>{r.n}</b>
                  <span className="n-note">{r.what}</span>
                </th>
                <td>{r.good}</td>
                <td>{r.gap}</td>
                <td>{r.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bk-cards bk-cards--3">
        <Card accent>
          <h3 className="bk-h3">Prove the workflow first</h3>
          <p className="n-body">The hard part isn’t transcription. It’s the taxonomy, the routing rules and closing the loop, and those are Invoca-specific.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Don’t build a recorder</h3>
          <p className="n-body">Calls come from whatever Invoca already records with. In production, they’re pulled in automatically.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Long-term home</h3>
          <p className="n-body">Most likely Signal AI and Invoca’s existing conversation data. This proof of concept is the spec for that.</p>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- metrics

const METRICS = [
  { m: 'Capture rate', d: 'Share of hand-labelled feedback the system finds on real calls', base: 'About 40% (assumed)', target: '80% or more', how: 'A weekly sample of calls labelled by champions, compared with what the system found' },
  { m: 'Time to owner', d: 'From the customer saying it to the named owner having it', base: 'Days, or never', target: 'Under 1 business day', how: 'Delivery receipts minus the time of the call' },
  { m: 'Accuracy of what’s sent', d: 'Items the owner agrees are real and correctly labelled', base: 'Not measured', target: '90% or more', how: '“This is wrong” clicks and review outcomes' },
  { m: 'Decisions citing evidence', d: 'Roadmap items that link to at least one checked quote', base: 'Unknown', target: 'Half, within two quarters', how: 'Jira and Linear links back to insights' },
  { m: 'CSM minutes saved', d: 'Admin minutes per call before, minus review minutes now', base: '18 minutes per call (assumed)', target: '70% removed', how: 'Agent Ops: time before minus time now, per call' },
  { m: 'Weekly active reviewers', d: 'People who approve, edit or reject at least once a week', base: 'None', target: 'Every champion, then every CSM', how: 'Agent Ops usage data' },
];

const GUARDS = [
  { m: 'Made-up feedback', target: '5% or less', d: 'Insights invented on calls that have nothing in them' },
  { m: 'Hidden instructions', target: '100%', d: 'Planted instructions flagged, and the results unaffected' },
  { m: 'Quotes found in the call', target: '95% or more', d: 'Quotes that match the transcript; misses are counted, not hidden' },
];

function Metrics() {
  return (
    <>
      <Lede>What I’d report every week. Baselines marked “assumed” get replaced by the 2-week time study before anyone sees a target.</Lede>
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Baseline</th>
              <th scope="col">Target</th>
              <th scope="col">How it’s measured</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((r) => (
              <tr key={r.m}>
                <th scope="row">
                  <b>{r.m}</b>
                  <span className="n-note">{r.d}</span>
                </th>
                <td>{r.base}</td>
                <td className="bk-accent">{r.target}</td>
                <td>{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="bk-h2">Guardrails that block a release</h2>
      <div className="bk-cards bk-cards--3">
        {GUARDS.map((g) => (
          <Card key={g.m}>
            <div className="bk-guard">
              <span className="bk-guard__t">{g.target}</span>
              <h3 className="bk-h3">{g.m}</h3>
              <p className="n-body">{g.d}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- agent ops

function AgentOps() {
  const navigate = useNavigate();
  return (
    <>
      <Lede>Signal Loop is one agent, running inside Switchboard. Agent Ops is where it is operated: the place an exec and the AI team look to see what’s running, who owns it, who uses it, and what it returns.</Lede>
      <div className="bk-split">
        <Card>
          <span className="n-label">Registry</span>
          <div className="bk-reg">
            <div className="bk-reg__row">
              <b>Signal Loop</b>
              <Badge tone="success" dot>
                Live
              </Badge>
              <span className="bk-reg__meta">
                <span>Built in code</span>
                <span>Customer Success</span>
                <span>Named owner and business owner</span>
              </span>
            </div>
            <div className="bk-reg__row">
              <b>RFP &amp; Security Questionnaire Responder</b>
              <Badge>Simulated</Badge>
              <span className="bk-reg__meta">
                <span>Built in Gumloop</span>
                <span>Sales</span>
                <span>Named owner and business owner</span>
              </span>
            </div>
          </div>
          <p className="n-body" style={{ marginTop: 12 }}>Two agents today; the registry is built for fifty. Every one has a purpose, a record of the data it touches, a review schedule and a next review date.</p>
        </Card>
        <Card>
          <span className="n-label">The agent standard: nine checks</span>
          <ol className="bk-checks">
            {STANDARD_CHECKS.map((c, i) => (
              <li key={c.key}>
                <span className="bk-checks__n">{i + 1}</span>
                {c.label}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div className="bk-cards">
        <Card>
          <h3 className="bk-h3">Usage</h3>
          <p className="n-body">Who uses each agent, when and how often: by role, by weekday and hour, retention by cohort, and a live panel of who’s in it right now.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Logs and reliability</h3>
          <p className="n-body">Every run has its logs and a timeline of its steps. Reliability targets have alerts that say what was expected, what happened, who owns it and what to do.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Cost</h3>
          <p className="n-body">AI cost per agent and per unit of work, next to the value of the time returned, so “is it worth it” has a number.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Review cadence</h3>
          <p className="n-body">Each agent has a review date. Overdue reviews show up in “needs attention” next to missed targets and gaps in the standard.</p>
        </Card>
      </div>
      <Callout tone="warning">
        <b>How hours returned are counted.</b> For each unit of work: the minutes it used to take, minus the minutes a person now spends reviewing it. The “used to take” minutes are labelled assumptions until a two-week time study replaces them. Review minutes are measured, not estimated.
      </Callout>
      <Card>
        <span className="n-label">What the monthly executive report says</span>
        <p className="n-body">Agents in production, active users and the trend, hours returned and what they’re worth, AI cost and return, what needs attention and who owns it, and what changed (prompts, models, thresholds) with the test result that allowed it.</p>
      </Card>
      <div>
        <Button variant="primary" iconRight={<IconArrowRight size={16} />} onClick={() => navigate('/ops')}>
          Open Agent Ops
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- differently

const LIMITS = [
  { t: 'Synthetic data', d: 'Every account, call and person is fictional. Realistic, hand-checked, but not Invoca’s actual calls. The first real test is shadow mode on real ones.' },
  { t: 'Assumptions, labelled', d: '“4 of 10 reach an owner” and the baseline admin minutes are assumptions. A 2-week time study with two CSMs replaces them.' },
  { t: 'Mock destinations', d: 'Slack, Jira and Linear are faithful mocks with receipts and retries, not real integrations.' },
  { t: 'Two models only', d: 'A main model, and a second one that judges and stands in as backup. Fine for a proof of concept; in production I’d re-run the speed and quality comparison every quarter.' },
  { t: 'Themes need history', d: 'Grouping looks good because about 220 older transcripts were loaded first. On day one with real data, themes are thin for a few weeks.' },
  { t: 'Small test set', d: '48 hand-checked files are enough to catch a big drop like the latest candidate’s, not to tell two good prompts apart, and none are held back yet. It should grow from reviewers’ edits.' },
];

function Differently() {
  return (
    <>
      <Lede>What I’d change, and what this build doesn’t prove yet.</Lede>
      <div className="bk-cards">
        {LIMITS.map((l) => (
          <Card key={l.t}>
            <h3 className="bk-h3">{l.t}</h3>
            <p className="n-body">{l.d}</p>
          </Card>
        ))}
      </div>
      <div className="bk-split">
        <Card accent>
          <h3 className="bk-h3">In a real rollout, first</h3>
          <ul className="bk-list">
            <li>Agree the categories with CSMs and PMs before writing a prompt.</li>
            <li>Run in shadow mode before anyone sees a screen: compare its output with CSM notes quietly.</li>
            <li>Agree the success metrics and the review cadence with the business owner.</li>
          </ul>
        </Card>
        <Card>
          <h3 className="bk-h3">With more time</h3>
          <ul className="bk-list">
            <li>Less polish on the theme graph; real Slack and Jira connections, switched on gradually.</li>
            <li>A labelled set of health-data calls, so redaction is measured before every release.</li>
            <li>Reviewers’ edits flowing automatically into the test set.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- index + page

function Index() {
  return (
    <div className="bk-cards">
      {BACKUPS.map((b, i) => (
        <Link key={b.topic} to={`/backup/${b.topic}`} className="bk-index">
          <span className="bk-index__n">Question {i + 1}</span>
          <b>{b.title}</b>
          <span className="n-body">{b.blurb}</span>
          <span className="bk-index__go">
            Open
            <IconArrowRight size={16} />
          </span>
        </Link>
      ))}
    </div>
  );
}

const PAGES: Record<string, () => JSX.Element> = {
  cost: Cost,
  security: Security,
  failure: Failure,
  'build-vs-buy': BuildVsBuy,
  metrics: Metrics,
  'agent-ops': AgentOps,
  differently: Differently,
};

export function BackupPage() {
  const { topic } = useParams();
  const idx = BACKUPS.findIndex((b) => b.topic === topic);
  const meta = idx >= 0 ? BACKUPS[idx] : undefined;
  const Page = meta ? PAGES[meta.topic] : undefined;
  useEffect(() => {
    document.title = meta ? `${meta.title} · Switchboard` : 'Questions · Switchboard';
    window.scrollTo(0, 0);
  }, [meta]);
  if (!meta || !Page) {
    return (
      <Frame topic={null} num="Questions and answers" title="Detail for the Q&amp;A">
        <Index />
      </Frame>
    );
  }
  return (
    <Frame topic={meta.topic} num={`Question ${idx + 1} of ${BACKUPS.length}`} title={meta.title}>
      <div className="bk-content" key={meta.topic}>
        <Page />
      </div>
    </Frame>
  );
}

export default BackupPage;
