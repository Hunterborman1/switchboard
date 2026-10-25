/**
 * Q&A backup scenes (/backup/:topic). Standalone, deep-linkable, editorial dark.
 * Topics match BACKUPS in src/tour/script/chapters.ts.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Arrow, Backdrop, Button, Callout, Card, Chip, Display, Eyebrow, Lede, Mark, Reveal, Stat } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';
import { BACKUPS } from '../../tour/script/chapters';
import { tourApi } from '../../tour/api';
import { STANDARD_CHECKS } from '../../shared/platform-contracts';
import { BUDGET_LIMIT_USD } from '../../shared/contracts';
import './backup.css';

// ---------------------------------------------------------------- frame

function Frame({ topic, num, title, children }: { topic: string | null; num: string; title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const back = () => {
    const st = window.history.state as { idx?: number } | null;
    if (st && typeof st.idx === 'number' && st.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <main className="sl-n n-page bk-page" data-testid="backup-page" data-topic={topic ?? 'index'}>
      <Backdrop />
      <header className="bk-top">
        <Mark href={import.meta.env.BASE_URL} />
        <button className="n-btn n-btn--quiet n-btn--sm" onClick={back} data-testid="backup-back">
          <Arrow dir="left" /> Walkthrough
        </button>
      </header>
      <nav className="bk-switch" aria-label="Q&A backup topics">
        {BACKUPS.map((b) => (
          <Link key={b.topic} to={`/backup/${b.topic}`} className="bk-switch__item" aria-current={b.topic === topic ? 'page' : undefined}>
            {b.title}
          </Link>
        ))}
      </nav>
      <div className="bk-body">
        <Reveal className="bk-head n-stack">
          <Reveal.Item>
            <Eyebrow num={num}>Q&amp;A backup</Eyebrow>
          </Reveal.Item>
          <Reveal.Item>
            <Display size="md" as="h1">
              {title}
            </Display>
          </Reveal.Item>
        </Reveal>
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
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgb(242 245 228 / 0.12)" strokeWidth="12" strokeLinecap="round" />
      <motion.path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke="#8EE58E"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={calm ? { duration: 0 } : { duration: 1.1, ease: EASE }}
      />
      <text x="100" y="86" textAnchor="middle" className="bk-gauge__v">${spent.toFixed(2)}</text>
      <text x="100" y="108" textAnchor="middle" className="bk-gauge__l">OF ${limit.toFixed(0)} VIEWER CAP</text>
    </svg>
  );
}

const STEP_COST = [
  { k: 'Screen', share: 0.12, note: 'fast call, a few hundred tokens' },
  { k: 'Extract', share: 0.71, note: 'the whole redacted transcript in, structured JSON out' },
  { k: 'Theme naming', share: 0.07, note: 'only when a new theme forms' },
  { k: 'Embeddings', share: 0.02, note: 'near zero' },
  { k: 'Retries / fallback', share: 0.08, note: 'budgeted, not hoped away' },
];

function Cost() {
  const d = useCostData();
  const perCall = d?.perCall ?? null;
  return (
    <>
      <div className="bk-stats">
        <Card>
          {perCall != null ? <Stat value={perCall} prefix="$" decimals={4} label="per call (live runs, measured)" tone="accent" note={`${d?.liveRuns ?? 0} live runs in the ledger`} /> : <Stat value={0.004} prefix="~$" decimals={3} label="per call (estimate)" tone="accent" note="ledger unavailable right now" />}
        </Card>
        <Card>
          <Stat value={(perCall ?? 0.004) * 1000} prefix="$" decimals={2} label="per 1,000 calls" note="before volume discounts or caching" />
        </Card>
        <Card>
          {d?.p50Ms != null ? <Stat value={d.p50Ms / 1000} decimals={1} suffix="s" label="median run time" note="all ten steps, end to end" /> : <Stat value={0} label="median run time" note="not measured yet" />}
        </Card>
      </div>
      <div className="bk-split">
        <Card>
          <span className="n-label">Live AI budget</span>
          <Gauge spent={d?.spent ?? 0} limit={d?.limit ?? BUDGET_LIMIT_USD} />
          <p className="n-body">
            Viewers share a hard {`$${(d?.limit ?? BUDGET_LIMIT_USD).toFixed(0)}`} cap: a provider-side limit on the runtime key, plus an in-app ledger checked before every run (spend so far + the run’s worst case). Separately, the build and test key has its own $20 limit and never touches viewer traffic.
          </p>
        </Card>
        <Card>
          <span className="n-label">Where a call’s cost goes</span>
          <div className="bk-bars">
            {STEP_COST.map((s) => (
              <div key={s.k} className="bk-bar">
                <div className="bk-bar__row">
                  <span>{s.k}</span>
                  <span className="n-mono">{Math.round(s.share * 100)}%</span>
                </div>
                <div className="bk-bar__track">
                  <motion.div className="bk-bar__fill" initial={{ width: 0 }} animate={{ width: `${s.share * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
                </div>
                <span className="n-note">{s.note}</span>
              </div>
            ))}
          </div>
          <p className="n-note" style={{ marginTop: 12 }}>Shares are typical for a 30–40 minute transcript; the exact split for every run is on its trace.</p>
        </Card>
      </div>
      <Callout>
        <b>At the cap it replays, it doesn’t break.</b> Every featured file has a recorded real run (its steps, outputs and timings). Once the budget is spent, or if a live call fails or runs slow, the run replays that recording at real speed and says “Replay of a recorded live run” on screen. Custom uploads show a clear “Live AI budget reached” state.
      </Callout>
      {!d?.ok && d && <p className="n-note">Live numbers couldn’t be loaded just now; figures shown are estimates.</p>}
    </>
  );
}

// ---------------------------------------------------------------- security

const SEC: { t: string; items: string[]; tone?: 'accent' | 'indigo' }[] = [
  { t: 'PII and PHI', tone: 'accent', items: ['Redaction runs before any model call: names, phones, emails, cards (Luhn-checked), DOB, MRNs, addresses.', 'Values become reversible tokens like [PATIENT_1]; the original never leaves the Worker.', 'The browser only ever receives a masked preview (“J••• D••”).'] },
  { t: 'Prompt injection', tone: 'accent', items: ['Transcript text is wrapped as data between delimiters.', 'The model can only return a fixed schema and has no tools, so an instruction has nothing to act on.', 'Suspected injections are flagged by the screen step and written to the audit log.'] },
  { t: 'Access', items: ['Password gate plus HMAC-signed links that expire 7 days after issue, checked in constant time.', 'Cookie scoped to /repo/invoca: HttpOnly, Secure, SameSite=Lax, Max-Age capped at link expiry.', 'Revoke one link by its ID, or all of them by rotating the signing secret.'] },
  { t: 'Isolation', items: ['Every viewer gets their own workspace. Reads are seed ∪ yours; writes only ever go to yours.', 'One panelist’s rule change or approval never shows up for another.'] },
  { t: 'Providers and keys', tone: 'indigo', items: ['Model calls route only to providers that don’t collect or train on data (a routing filter, not a contract), and require schema support. Contractual zero retention and a DPA are production items.', 'Keys are server-only secrets; nothing sensitive is ever bundled into the client.', 'Per-session rate limits and a per-run token cap on top of the spend cap.'] },
];

function Security() {
  return (
    <>
      <Lede>Treat the transcript as hostile and personal by default. Here’s what that means concretely.</Lede>
      <div className="bk-cards">
        {SEC.map((s) => (
          <Card key={s.t}>
            <Chip tone={s.tone} dot>
              {s.t}
            </Chip>
            <ul className="bk-list">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Callout>In production I’d add a formal data review with Security before any real call reaches the system, a DPA check per provider, and redaction recall measured on a labelled PHI set as a release gate.</Callout>
    </>
  );
}

// ---------------------------------------------------------------- failure

const FLOW = [
  { k: 'Model output', s: 'structured JSON' },
  { k: 'Re-parse', s: 'Zod validates' },
  { k: 'Retry once', s: 'errors fed back' },
  { k: 'Fallback model', s: 'second tier' },
  { k: 'Dead-letter queue', s: 'visible on Health' },
];

function FailureFlow() {
  const calm = useCalm();
  const step = 196;
  return (
    <svg viewBox="0 0 1000 170" className="bk-flow" role="img" aria-label="Schema failure path: model output, re-parse, retry once with errors, fallback model, dead-letter queue.">
      {FLOW.map((f, i) => {
        const x = 10 + i * step;
        const last = i === FLOW.length - 1;
        return (
          <g key={f.k}>
            <motion.rect x={x} y={40} width={160} height={74} rx={14} fill={last ? 'rgb(255 156 140 / 0.1)' : '#0E2C26'} stroke={last ? '#FF9C8C' : 'rgb(242 245 228 / 0.2)'} initial={calm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.5, delay: calm ? 0 : i * 0.12, ease: EASE }} />
            <text x={x + 80} y={74} textAnchor="middle" className="bk-flow__k">{f.k}</text>
            <text x={x + 80} y={96} textAnchor="middle" className="bk-flow__s">{f.s}</text>
            {!last && (
              <>
                <motion.path d={`M${x + 160} 77 H${x + step}`} stroke="#8EE58E" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: calm ? 0 : 0.4, delay: calm ? 0 : 0.3 + i * 0.12 }} />
                <text x={x + 178} y={66} textAnchor="middle" className="bk-flow__f">fail</text>
              </>
            )}
            {i < FLOW.length - 1 && i > 0 && (
              <>
                <path d={`M${x + 80} 114 V146 H${x + 120}`} stroke="rgb(142 229 142 / 0.5)" fill="none" strokeDasharray="3 4" />
                <text x={x + 126} y={150} className="bk-flow__ok">ok → continue</text>
              </>
            )}
          </g>
        );
      })}
      {!calm && (
        <circle r="5" fill="#8EE58E">
          <animateMotion dur="4s" repeatCount="indefinite" path={`M10 77 H${10 + 4 * step + 80}`} />
        </circle>
      )}
    </svg>
  );
}

const FAILS = [
  { t: 'Provider errors', d: '429s, 5xx and timeouts get step-level retries with backoff. Every call has a timeout. Slow or failing primary → fallback model.' },
  { t: 'Ungrounded quote', d: 'If a quote can’t be found in the transcript (exact, normalised, or fuzzy ≥ 0.90), the insight is dropped and counted as a hallucination. It’s never shown as fact.' },
  { t: 'Budget or live failure', d: 'The run replays a recorded real execution at real speed, labelled on screen. The walkthrough works for all 7 days regardless.' },
  { t: 'Partial failure', d: 'If Jira succeeds and Slack fails, the delivery reads as failed, with attempts and receipts per destination. Partial is not success.' },
  { t: 'Duplicates', d: 'Every upload is hashed (SHA-256). A re-upload is idempotent: same hash, same run, no double insights.' },
  { t: 'Durability', d: 'The ten steps run on a fast path and save as they go. If a step fails or the run takes too long, a durable Workflow resumes from the last completed step, not from scratch.' },
];

function Failure() {
  return (
    <>
      <Lede>Things will fail. The design goal is that every failure is visible, bounded and recoverable.</Lede>
      <Card>
        <span className="n-label">Schema failure path</span>
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
          <span className="n-label" style={{ color: 'var(--n-accent)' }}>Prove the workflow thin</span>
          <p className="n-body">The hard part isn’t transcription. It’s the taxonomy, the routing rules and closing the loop, and those are Invoca-specific.</p>
        </Card>
        <Card>
          <span className="n-label">Don’t build a recorder</span>
          <p className="n-body">Capture comes from whatever Invoca already records with. In production, dlt pulls from it.</p>
        </Card>
        <Card>
          <span className="n-label">Long-term home</span>
          <p className="n-body">Most likely Signal AI and Invoca’s existing conversation data. This POC is the spec for that.</p>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- metrics

const METRICS = [
  { m: 'Capture rate', d: 'Share of golden-labelled insights the system finds on real calls', base: '~40% (assumed)', target: '≥ 80%', how: 'Weekly sample of calls labelled by champions vs system output' },
  { m: 'Time to owner', d: 'Customer says it → named owner has it', base: 'days to never', target: '< 1 business day', how: 'Delivery receipts minus call timestamp' },
  { m: 'Precision of routed items', d: 'Routed items the owner agrees are real and correctly typed', base: 'n/a', target: '≥ 90%', how: '“This is wrong” clicks + review outcomes' },
  { m: 'PM decisions citing evidence', d: 'Roadmap items that link to at least one grounded quote', base: 'unknown', target: '≥ 50% in two quarters', how: 'Jira/Linear links back to insights' },
  { m: 'CSM minutes saved', d: 'Baseline admin minutes per call minus measured review minutes', base: '18 min/call (registered assumption)', target: '≥ 70% removed', how: 'Agent Ops work units: baseline − human minutes' },
  { m: 'Weekly active reviewers', d: 'People who approve, edit or reject at least once a week', base: '0', target: 'every champion, then every CSM', how: 'Agent Ops usage events' },
];

const GUARDS = [
  { m: 'Negative-control false positives', target: '≤ 5%', d: 'Insights invented on calls with nothing in them' },
  { m: 'Injection resistance', target: '100%', d: 'Planted instructions flagged, output schema unaffected' },
  { m: 'Grounding rate', target: '≥ 95%', d: 'Quotes that match the transcript; drops are counted, not hidden' },
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
                <td className="n-mono">{r.base}</td>
                <td className="n-mono bk-accent">{r.target}</td>
                <td>{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="n-label">Guardrails: these block a release</span>
      <div className="bk-cards bk-cards--3">
        {GUARDS.map((g) => (
          <Card key={g.m}>
            <div className="bk-guard">
              <span className="bk-guard__t n-mono">{g.target}</span>
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
      <Lede>Signal Loop is one agent. Agent Ops is the platform it reports into: the place an exec and the AI team look to see what’s running, who owns it, who uses it, and what it returns.</Lede>
      <div className="bk-split">
        <Card>
          <span className="n-label">Registry</span>
          <div className="bk-reg">
            <div className="bk-reg__row">
              <b>Signal Loop</b>
              <Chip tone="accent" dot>Live</Chip>
              <span className="n-note">Code · Customer Success · named owner + business owner</span>
            </div>
            <div className="bk-reg__row">
              <b>RFP &amp; Security Questionnaire Responder</b>
              <Chip>Simulated</Chip>
              <span className="n-note">Gumloop · Sales · named owner + business owner</span>
            </div>
          </div>
          <p className="n-body" style={{ marginTop: 12 }}>Two agents today; the registry is built for fifty. Every one has a purpose, data access, classification, review cadence and next review date.</p>
        </Card>
        <Card>
          <span className="n-label">The agent standard · 9 checks</span>
          <ol className="bk-checks">
            {STANDARD_CHECKS.map((c, i) => (
              <li key={c.key}>
                <span className="n-mono">{String(i + 1).padStart(2, '0')}</span>
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
          <h3 className="bk-h3">Observability</h3>
          <p className="n-body">Structured logs with one trace ID per run, a span waterfall, SLOs with error budgets, and alerts with expected vs actual, an owner and a runbook.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Cost</h3>
          <p className="n-body">AI cost per agent and per unit of work, next to the value of the time returned, so “is it worth it” has a number.</p>
        </Card>
        <Card>
          <h3 className="bk-h3">Review cadence</h3>
          <p className="n-body">Each agent has a review date. Overdue reviews show up in “needs attention” next to SLO breaches and standard gaps.</p>
        </Card>
      </div>
      <Callout tone="assumption">
        <b>Impact maths, honestly.</b> Hours returned = Σ (registered baseline minutes per unit − measured human review minutes) ÷ 60. The baselines are labelled assumptions until a 2-week time study replaces them. Human minutes are measured, not estimated.
      </Callout>
      <Card>
        <span className="n-label">What the exec report says, monthly</span>
        <p className="n-body">Agents in production · active users and trend · hours returned and their value at a loaded rate · AI cost · ROI · what needs attention and who owns it · what changed (prompts, models, thresholds) and the eval result that allowed it.</p>
      </Card>
      <div>
        <Button onClick={() => navigate('/ops')} arrow>
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
  { t: 'Two models only', d: 'One fast tier, one independent judge and fallback. Fine for a POC; in production I’d re-run the speed and quality test quarterly.' },
  { t: 'Themes need history', d: 'Clustering looks good because ~220 backfill transcripts seed it. On day one with real data, themes are thin for a few weeks.' },
  { t: 'Small eval set', d: '48 golden files is enough to catch large regressions like v5, not to separate two good prompts, and there is no held-out split yet. It should grow from reviewer edits.' },
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
          <span className="n-label" style={{ color: 'var(--n-accent)' }}>In a real rollout, first</span>
          <ul className="bk-list">
            <li>Co-design the taxonomy with CSMs and PMs before writing a prompt.</li>
            <li>Run shadow mode before anyone sees a UI: compare output to CSM notes silently.</li>
            <li>Agree the success metrics and the review cadence with the business owner.</li>
          </ul>
        </Card>
        <Card>
          <span className="n-label">With more time</span>
          <ul className="bk-list">
            <li>Cut: the theme graph polish. Add: real Slack and Jira integrations behind a feature flag.</li>
            <li>A labelled PHI set to measure redaction recall as a release gate.</li>
            <li>Reviewer edits flowing automatically into the eval set.</li>
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
        <Link key={b.topic} to={`/backup/${b.topic}`} className="bk-index n-card">
          <span className="n-mono bk-index__n">{String(i + 1).padStart(2, '0')}</span>
          <b>{b.title}</b>
          <span className="n-body">{b.blurb}</span>
          <span className="bk-index__go">
            Open <Arrow />
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
    document.title = meta ? `${meta.title} · Signal Loop` : 'Q&A backup · Signal Loop';
    window.scrollTo(0, 0);
  }, [meta]);
  if (!meta || !Page) {
    return (
      <Frame topic={null} num="Q&A" title="Backup scenes">
        <Index />
      </Frame>
    );
  }
  return (
    <Frame topic={meta.topic} num={String(idx + 1).padStart(2, '0')} title={meta.title}>
      <div className="bk-content" key={meta.topic}>
        <Page />
      </div>
    </Frame>
  );
}

export default BackupPage;
