/**
 * Part 15 · POC → production. A plain table: what each job runs on today, then (beat 1)
 * what it runs on in production, filled in one row after another.
 */
import { motion } from 'motion/react';
import { Check, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

const ROWS = [
  { concern: 'Website and API', poc: 'Cloudflare Worker and a React app', prod: 'Vercel with Next.js' },
  { concern: 'AI model calls', poc: 'Vercel AI SDK through a shared router', prod: 'Vercel AI SDK with our own provider keys' },
  { concern: 'Long-running jobs', poc: 'Cloudflare Workflows', prod: 'Trigger.dev' },
  { concern: 'Database', poc: 'Cloudflare D1', prod: 'Neon Postgres' },
  { concern: 'Finding similar feedback', poc: 'Cloudflare Vectorize', prod: 'pgvector on Neon' },
  { concern: 'Reporting at scale', poc: 'Daily summaries in D1', prod: 'ClickHouse with dbt models' },
  { concern: 'Bringing in calls', poc: 'Upload, or pick from a library', prod: 'Pulled from the recorder and CRM (for example Gong, Zoom, Salesforce, Zendesk)' },
  { concern: 'Live transcription', poc: 'Not needed yet', prod: 'Render, streaming speech to text' },
];

const CONSTANTS = ['Strict TypeScript everywhere', 'One set of data contracts for the API, the pipeline and the screens', 'Each AI provider bills directly; keys stay on the server'];

export function Production({ beat }: { beat: number }) {
  const calm = useCalm();
  const moved = beat >= 1;
  return (
    <div className="sc-prod">
      <SceneHead
        k={moved ? 'b1' : 'b0'}
        title={moved ? 'Same design, production stack.' : 'What you just used is deployed.'}
        line={
          moved
            ? 'Each piece maps one to one. The prompts, the quote checks and the tests move unchanged; only the hosting changes.'
            : 'The proof of concept runs entirely on Cloudflare: one Worker, a fast path for each call with a durable fallback, a database and a similarity index.'
        }
      />
      <div className="sc-prod__table" role="table" aria-label="Proof of concept to production mapping">
        <div className="sc-prod__row sc-prod__row--head" role="row">
          <span role="columnheader">Job</span>
          <span role="columnheader">Today (deployed)</span>
          <span role="columnheader">In production</span>
        </div>
        {ROWS.map((r, i) => (
          <div key={r.concern} className="sc-prod__row" role="row">
            <span role="cell" className="sc-prod__concern">{r.concern}</span>
            <span role="cell" className="sc-prod__poc">{r.poc}</span>
            <span role="cell" className="sc-prod__cell">
              <motion.span
                className="sc-prod__prod"
                initial={false}
                animate={{ opacity: moved ? 1 : 0, x: moved || calm ? 0 : -4 }}
                transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: moved && !calm ? i * 0.06 : 0 }}
              >
                {r.prod}
              </motion.span>
              {!moved && <span className="sc-prod__empty" aria-hidden="true" />}
            </span>
          </div>
        ))}
      </div>
      <ul className="sc-prod__constants">
        {CONSTANTS.map((c) => (
          <li key={c}>
            <span className="sc-prod__check"><Check /></span>
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
