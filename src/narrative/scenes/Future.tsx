/**
 * Chapter 10 · The next 12–18 months. Three sections side by side (stacked on phones): the
 * roadmap by months; what more agents and faster, cheaper models change (the cost per call is
 * measured from the run ledger when it answers); and the path from the proof of concept to the
 * production stack. The scorecard follows as this chapter's last step.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { tourApi } from '../../tour/api';
import { usdPrecise } from '../../shared/format';
import { Enter, SceneHead } from '../components';

// Months 0–3 are the rollout's own phases (chapter 9), so nothing promises "every call" before
// shadow mode and champions have earned it.
const MILES = [
  { when: 'Months 0–3', title: 'Earn trust first', body: 'The rollout, before anything is automatic.' },
  { when: 'Months 3–6', title: 'Every call, by default', body: 'Read calls straight from the recorder and CRM.' },
  { when: 'Months 6–9', title: 'Capture during the call', body: 'The CSM confirms a signal before hanging up.' },
  { when: 'Months 9–12', title: 'More analyses, one platform', body: 'Follow-ups, renewal risk and escalations.' },
  { when: 'Months 12–15', title: 'Specialist agents', body: 'One finds, one checks each claim, one routes.' },
  { when: 'Months 15–18', title: 'Part of Invoca’s platform', body: 'Compliance review, coaching, and Signal AI.' },
];

/** Production first, today's proof-of-concept piece under it. */
const STACK = [
  { job: 'Website and API', prod: 'Vercel with Next.js', poc: 'a Cloudflare Worker and a React app' },
  { job: 'Long-running jobs', prod: 'Trigger.dev', poc: 'Cloudflare Workflows' },
  { job: 'Data and search', prod: 'Neon Postgres, pgvector', poc: 'Cloudflare D1 and Vectorize' },
  { job: 'Reporting at scale', prod: 'ClickHouse with dbt', poc: 'daily summaries in D1' },
  { job: 'Conversations in', prod: 'dlt from Gong, Zoom, CRMs', poc: 'any file, connectors simulated' },
  { job: 'Results out', prod: 'Slack, Jira, Salesforce APIs', poc: 'in-app previews (simulated)' },
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

function Section({ delay, title, children, testId }: { delay: number; title: string; children: ReactNode; testId: string }) {
  return (
    <Enter as="section" delay={delay} className="sc-prod__col" attrs={{ 'aria-label': title, 'data-testid': testId }}>
      <h2 className="sc-prod__title">{title}</h2>
      {children}
    </Enter>
  );
}

export function Future() {
  const perCall = usePerCallCost();
  return (
    <div className="sc sc-future">
      <SceneHead title="The next 12 to 18 months." line="Grow it on the same platform. More agents and cheaper models open new doors. The parts that earn trust stay the same." />
      <div className="sc-prod__grid">
        <Section delay={0.04} title="What comes next" testId="future-roadmap">
          <ol className="sc-prod__miles">
            {MILES.map((m, i) => (
              <li key={m.title} data-first={i === 0 ? 'true' : undefined}>
                <span className="sc-prod__dot" aria-hidden="true" />
                <span className="sc-prod__when">{m.when}</span>
                <b>{m.title}</b>
                <span className="sc-prod__line">{m.body}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section delay={0.14} title="What changes the game" testId="future-change">
          <div className="sc-future__block">
            <b>More agents, each with one job</b>
            <span className="sc-prod__line">One finds the feedback, one checks each claim, one decides who hears it. Agent Ops gives each one an owner, a budget, tests and logs.</span>
          </div>
          <div className="sc-future__block">
            <b>Faster, cheaper models</b>
            <span className="sc-future__cost" data-testid="future-cost">
              {perCall != null && perCall > 0 ? `About ${usdPrecise(perCall)} of AI per call today` : 'A fraction of a cent of AI per call today'}
            </span>
            <span className="sc-prod__line">{perCall != null && perCall > 0 ? 'Measured on this build. ' : ''}At that price, reading every call beats sampling. Faster models make capture during the call practical, and each conversation can run more analyses.</span>
          </div>
          <p className="sc-prod__constant">
            <b>What doesn’t change:</b> no quote, no insight. Code checks the model. People make the high-stakes calls.
          </p>
        </Section>
        <Section delay={0.24} title="From proof of concept to production" testId="future-stack">
          <dl className="sc-prod__stack">
            {STACK.map((r) => (
              <div key={r.job}>
                <dt>{r.job}</dt>
                <dd className="sc-prod__to">{r.prod}</dd>
                <dd className="sc-prod__from">Today: {r.poc}</dd>
              </div>
            ))}
          </dl>
          <p className="sc-prod__line">Same prompts, quote checks and tests. Only the hosting and the connectors change.</p>
        </Section>
      </div>
    </div>
  );
}
