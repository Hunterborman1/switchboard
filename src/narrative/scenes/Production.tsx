/**
 * 15 · POC → production. The deployed Cloudflare pieces slide into their production slots.
 */
import { motion } from 'motion/react';
import { Chip, Display, Lede, Reveal } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

const ROWS = [
  { concern: 'Web + API', poc: 'Worker (Hono) + Vite SPA', prod: 'Vercel · Next.js' },
  { concern: 'LLM calls', poc: 'AI SDK via a router key', prod: 'Vercel AI SDK · direct BYOK' },
  { concern: 'Orchestration', poc: 'Cloudflare Workflows', prod: 'Trigger.dev' },
  { concern: 'State', poc: 'D1', prod: 'Neon Postgres' },
  { concern: 'Similarity', poc: 'Workers AI embeddings + Vectorize', prod: 'pgvector on Neon' },
  { concern: 'Analytics at volume', poc: 'D1 rollups', prod: 'ClickHouse + dbt marts' },
  { concern: 'Ingestion', poc: 'Upload + file library', prod: 'dlt from the team’s recorder and CRM (e.g. Gong, Zoom, Salesforce, Zendesk)' },
  { concern: 'Stateful workers', poc: '—', prod: 'Render · streaming speech-to-text' },
];

export function Production({ beat }: { beat: number }) {
  const calm = useCalm();
  const moved = beat >= 1;
  return (
    <div className="n-grid sc-prod">
      <div className="n-col-12">
        <Reveal className="n-stack">
          <Reveal.Item>
            <Display size="md" as="h2">
              {moved ? <>Same design, <em>production</em> stack.</> : <>What you just used is <em>deployed.</em></>}
            </Display>
          </Reveal.Item>
          <Reveal.Item>
            <Lede>{moved ? 'Each piece maps one-to-one. The contracts, prompts, grounding and evals move unchanged; only the hosting changes.' : 'The POC runs entirely on Cloudflare: one Worker, a fast path per call with a durable Workflow fallback, D1, Vectorize and Workers AI embeddings.'}</Lede>
          </Reveal.Item>
        </Reveal>
      </div>
      <div className="n-col-12 sc-prod__table" role="table" aria-label="POC to production mapping">
        <div className="sc-prod__row sc-prod__row--head" role="row">
          <span role="columnheader" className="n-label">Concern</span>
          <span role="columnheader" className="n-label">POC · deployed</span>
          <span role="columnheader" className="n-label" style={{ color: moved ? 'var(--n-accent)' : undefined }}>Production</span>
        </div>
        {ROWS.map((r, i) => (
          <div key={r.concern} className="sc-prod__row" role="row">
            <span role="cell" className="sc-prod__concern">{r.concern}</span>
            <span role="cell" className="sc-prod__cell">
              <motion.span
                className="sc-prod__chip sc-prod__chip--poc"
                initial={false}
                animate={moved ? { x: calm ? 0 : 40, opacity: 0.32, filter: 'blur(0.5px)' } : { x: 0, opacity: 1, filter: 'blur(0px)' }}
                transition={calm ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: i * 0.07 }}
              >
                {r.poc}
              </motion.span>
            </span>
            <span role="cell" className="sc-prod__cell">
              <motion.span
                className="sc-prod__chip sc-prod__chip--prod"
                initial={false}
                animate={moved ? { x: 0, opacity: 1, filter: 'blur(0px)' } : { x: calm ? 0 : -40, opacity: 0, filter: 'blur(6px)' }}
                transition={calm ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: 0.15 + i * 0.07 }}
              >
                {r.prod}
              </motion.span>
            </span>
          </div>
        ))}
      </div>
      <Reveal className="n-col-12 n-row" delay={0.2}>
        <Reveal.Item><Chip tone="accent" dot>Strict TypeScript everywhere</Chip></Reveal.Item>
        <Reveal.Item><Chip dot>Zod contracts shared by API, pipeline and UI</Chip></Reveal.Item>
        <Reveal.Item><Chip dot>Provider-owned billing, keys server-only</Chip></Reveal.Item>
      </Reveal>
    </div>
  );
}
