/**
 * Part 17 · POC → production. A plain table: what each job runs on today, then (beat 1)
 * what it runs on in production, filled in one row after another.
 */
import { motion } from 'motion/react';
import { Check, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

const ROWS = [
  { concern: 'Website and API', poc: 'Cloudflare Worker and a React app', prod: 'Vercel with Next.js' },
  { concern: 'AI model calls', poc: 'Vercel AI SDK through a shared router', prod: 'Vercel AI SDK with our own provider keys' },
  { concern: 'Deciding what to run', poc: 'A fast decision model via OpenRouter', prod: 'The same, on our own key' },
  { concern: 'Long-running jobs', poc: 'Cloudflare Workflows', prod: 'Trigger.dev' },
  { concern: 'Database', poc: 'Cloudflare D1', prod: 'Neon Postgres' },
  { concern: 'Finding similar feedback', poc: 'Cloudflare Vectorize', prod: 'pgvector on Neon' },
  { concern: 'Reporting at scale', poc: 'Daily summaries in D1', prod: 'ClickHouse with dbt models' },
  { concern: 'Bringing in conversations', poc: 'Any file, plus connectors (simulated here)', prod: 'dlt from Gong, Zoom, Salesforce and Zendesk, plus direct connectors' },
  { concern: 'Sending results', poc: 'In-app previews with receipts (simulated)', prod: 'The Slack, Jira and Salesforce APIs' },
  { concern: 'Live transcription', poc: 'Not needed yet', prod: 'Render, streaming speech to text' },
];

const CONSTANTS = ['Strict TypeScript everywhere', 'One set of data contracts end to end', 'Each provider bills directly; keys stay on the server'];

const HEADS = [
  { title: 'What you just used is deployed.', line: 'The proof of concept runs on Cloudflare: one Worker, a fast path for each conversation with a durable fallback, a database and a similarity index.' },
  { title: 'Same design, production stack.', line: 'Each piece maps one to one. The prompts, the quote checks and the tests move unchanged; only the hosting changes.' },
];

export function Production({ beat }: { beat: number }) {
  const calm = useCalm();
  const moved = beat >= 1;
  return (
    <div className="sc sc-prod">
      <SceneHead heads={HEADS} active={moved ? 1 : 0} />
      <div className="sc-prod__visual">
        <div className="sc-prod__card">
          <table className="ds-table ds-table--compact sc-prod__table" aria-label="Proof of concept to production">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Today (deployed)</th>
                <th scope="col">In production</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={r.concern}>
                  <th scope="row" className="sc-prod__concern">
                    {r.concern}
                  </th>
                  <td className="sc-prod__poc" data-label="Today">
                    {r.poc}
                  </td>
                  <td className="sc-prod__cell" data-label="In production">
                    <motion.span
                      className="sc-prod__prod"
                      initial={false}
                      animate={{ opacity: moved ? 1 : 0, x: moved || calm ? 0 : -4 }}
                      transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: moved && !calm ? i * 0.05 : 0 }}
                      aria-hidden={moved ? undefined : true}
                    >
                      {r.prod}
                    </motion.span>
                    {!moved && <span className="sc-prod__empty" aria-hidden="true" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="sc-prod__constants">
          {CONSTANTS.map((c) => (
            <li key={c}>
              <Check />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
