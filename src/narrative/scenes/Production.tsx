/**
 * Chapter 9 · Making it real. One screen, three sections side by side (stacked on phones):
 *   - Roll it out: the four rollout phases, the hours-back assumption, and how it is operated
 *     after launch (the former "Earning trust" scene);
 *   - Grow it: six milestones over the next 12–18 months and what doesn't change (the former
 *     "Next 12–18 months" scene; the per-call cost is measured from the run ledger when it answers);
 *   - Run it: what each job runs on in production, with today's proof-of-concept piece under it
 *     (the former "From proof of concept to production" scene).
 * Everything is on screen at arrival; the three sections enter left to right once.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Callout } from '../../ds';
import { tourApi } from '../../tour/api';
import { usdPrecise } from '../../shared/format';
import { Check, Enter, SceneHead, Stat } from '../components';

const PHASES = [
  { wk: 'Week 0', name: 'Discovery', line: 'A two-week time study with two CSMs.' },
  { wk: 'Weeks 1–2', name: 'Shadow mode', line: 'Runs on real calls. Nothing is sent.' },
  { wk: 'Weeks 3–6', name: 'Champions', line: 'Two or three CSMs and a PM tune it.' },
  { wk: 'Week 7+', name: 'Whole team', line: 'High stakes stay reviewed. The rest routes.' },
];

// Months 0–3 are the rollout's own phases, so nothing promises "every call" before shadow mode
// and champions have earned it.
const EVERY_CALL = 'Every call, by default';
const MILES = [
  { when: 'Months 0–3', title: 'Earn trust first', body: 'The rollout, before anything is automatic.' },
  // body is replaced with the measured average per-call cost when the run ledger answers (usePerCallCost)
  { when: 'Months 3–6', title: EVERY_CALL, body: 'Read calls straight from the recorder and CRM.' },
  { when: 'Months 6–9', title: 'Capture during the call', body: 'The CSM confirms a signal before hanging up.' },
  { when: 'Months 9–12', title: 'More analyses, one platform', body: 'Follow-ups, renewal risk and escalations.' },
  { when: 'Months 12–15', title: 'Specialist agents', body: 'One finds, one checks each claim, one routes.' },
  { when: 'Months 15–18', title: 'Part of Invoca’s platform', body: 'Compliance review, coaching, and Signal AI.' },
];

/** Production first (the point of the column), today's proof-of-concept piece under it. */
const STACK = [
  { job: 'Website and API', prod: 'Vercel with Next.js', poc: 'a Cloudflare Worker and a React app' },
  { job: 'AI calls', prod: 'AI SDK on our own keys', poc: 'the Vercel AI SDK through OpenRouter' },
  { job: 'Long-running jobs', prod: 'Trigger.dev', poc: 'Cloudflare Workflows' },
  { job: 'Data and search', prod: 'Neon Postgres, pgvector', poc: 'Cloudflare D1 and Vectorize' },
  { job: 'Reporting at scale', prod: 'ClickHouse with dbt', poc: 'daily summaries in D1' },
  { job: 'Conversations in', prod: 'dlt from Gong, Zoom, CRMs', poc: 'any file, connectors simulated' },
  { job: 'Results out', prod: 'Slack, Jira, Salesforce APIs', poc: 'in-app previews (simulated)' },
  { job: 'Live transcription', prod: 'Streaming on Render', poc: 'not needed yet' },
];

/** Mean AI cost per live run, measured from the run ledger (the same figure as the cost Q&A). */
function usePerCallCost(): number | null {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    tourApi
      .runs(200)
      .then((runs) => {
        const live = runs.filter((r) => r.mode === 'live' && r.costUsd > 0);
        if (alive && live.length) setV(live.reduce((a, r) => a + r.costUsd, 0) / live.length);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

function Section({ delay, step, title, children, testId }: { delay: number; step: string; title: string; children: ReactNode; testId: string }) {
  return (
    <Enter as="section" delay={delay} className="sc-prod__col" attrs={{ 'aria-label': `${step}: ${title}`, 'data-testid': testId }}>
      <header className="sc-prod__colhead">
        <span className="sc-prod__step">{step}</span>
        <h2 className="sc-prod__title">{title}</h2>
      </header>
      {children}
    </Enter>
  );
}

export function Production() {
  const perCall = usePerCallCost();
  const miles = MILES.map((m) =>
    m.title === EVERY_CALL && perCall != null && perCall > 0 ? { ...m, body: `About ${usdPrecise(perCall)} of AI per call, measured on this build.` } : m,
  );
  return (
    <div className="sc sc-prod">
      <SceneHead
        title="Making it real."
        line="Roll it out one phase at a time, grow it on one platform, and run the same design in production."
      />
      <div className="sc-prod__grid">
        <Section delay={0.04} step="Roll it out" title="Earn trust, one phase at a time" testId="production-rollout">
          <ol className="sc-prod__phases">
            {PHASES.map((p, i) => (
              <li key={p.name}>
                <span className="sc-prod__node" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="sc-prod__phase">
                  <span className="sc-prod__when">{p.wk}</span>
                  <b>{p.name}</b>
                  <span className="sc-prod__line">{p.line}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="sc-prod__hours">
            <Stat value={1.75} decimals={2} suffix="hours" label="back to each CSM every week, about 2,730 a year across 30 CSMs" tone="accent" size="sm" />
            <Callout tone="warning" title="Assumption">
              10 minutes of admin per call, 15 calls a week, 70% removed.
            </Callout>
          </div>
          <p className="sc-prod__operate">
            <b>Then operate it.</b> Adoption from usage, not surveys. Every agent gets an owner, a review date and the nine-check standard.
          </p>
        </Section>

        <Section delay={0.14} step="Grow it" title="The next 12 to 18 months" testId="production-horizon">
          <ol className="sc-prod__miles">
            {miles.map((m, i) => (
              <li key={m.title} data-first={i === 0 ? 'true' : undefined}>
                <span className="sc-prod__dot" aria-hidden="true" />
                <span className="sc-prod__when">{m.when}</span>
                <b>{m.title}</b>
                <span className="sc-prod__line">{m.body}</span>
              </li>
            ))}
          </ol>
          <p className="sc-prod__constant">
            <b>What doesn’t change:</b> no quote, no insight. Code checks the model. People make the high-stakes calls.
          </p>
        </Section>

        <Section delay={0.24} step="Run it" title="Same design, production stack" testId="production-stack">
          <dl className="sc-prod__stack">
            {STACK.map((r) => (
              <div key={r.job}>
                <dt>{r.job}</dt>
                <dd className="sc-prod__to">{r.prod}</dd>
                <dd className="sc-prod__from">Today: {r.poc}</dd>
              </div>
            ))}
          </dl>
          <ul className="sc-prod__constants">
            <li>
              <Check />
              <span>Strict TypeScript, one set of contracts</span>
            </li>
            <li>
              <Check />
              <span>Providers bill directly. Keys stay on the server.</span>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
