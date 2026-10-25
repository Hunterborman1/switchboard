/**
 * 14 · The next 12–18 months. A horizon line with milestones receding into the distance.
 */
import { motion } from 'motion/react';
import { Display, Lede, Reveal } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

const MILES = [
  { when: '0–3 mo', title: 'Every call, by default', body: 'Ingest straight from the call recorder and CRM. No uploads, no opt-in friction.' },
  { when: '3–6 mo', title: 'Real-time, in-call capture', body: 'Signals surface while the call is live, so the CSM can confirm one with the customer before hanging up.' },
  { when: '6–9 mo', title: 'Specialist agents', body: 'An extractor, a critic that challenges each claim, and a router, each with its own evals.' },
  { when: '9–12 mo', title: 'Cheaper, faster models', body: 'Unit cost keeps falling, so scanning every call (not a sample) becomes the obvious economics.' },
  { when: '12–15 mo', title: 'Drafted PRDs and replies', body: 'A theme becomes a first-draft PRD with quotes, and a drafted reply for each account that raised it.' },
  { when: '15–18 mo', title: 'Part of Invoca’s own platform', body: 'Plug into Invoca’s Signal AI and conversation data, so the internal loop and the product share one engine.' },
];

export function Horizon({ beat }: { beat: number }) {
  const calm = useCalm();
  return (
    <div className="n-grid sc-hz">
      <div className="n-col-12">
        <Reveal className="n-stack">
          <Reveal.Item>
            <Display size="md" as="h2">
              The next <em>12–18 months.</em>
            </Display>
          </Reveal.Item>
          <Reveal.Item>
            <Lede>The ingredients get cheaper and faster. The parts that earn trust stay the same.</Lede>
          </Reveal.Item>
        </Reveal>
      </div>
      <div className="n-col-12 sc-hz__stage">
        <svg className="sc-hz__sky" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="hz-line" x1="0" x2="1200" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#8EE58E" stopOpacity="1" />
              <stop offset="1" stopColor="#8EE58E" stopOpacity="0.1" />
            </linearGradient>
            <radialGradient id="hz-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#8EE58E" stopOpacity="0.22" />
              <stop offset="1" stopColor="#8EE58E" stopOpacity="0" />
            </radialGradient>
          </defs>
          <motion.line x1="0" x2="1200" y1="120" y2="120" stroke="url(#hz-line)" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={calm ? { duration: 0 } : { duration: 1.4, ease: EASE }} />
          {MILES.map((_, i) => {
            const x = 6 + i * 203;
            return <motion.circle key={i} cx={x} cy={120} r={i === 0 ? 6 : 4.5} fill="#8EE58E" initial={calm ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1 - i * 0.1, scale: 1 }} transition={calm ? { duration: 0 } : { duration: 0.4, delay: 0.3 + i * 0.18 }} style={{ transformOrigin: `${x}px 120px` }} />;
          })}
        </svg>
        <ol className="sc-hz__miles">
          {MILES.map((m, i) => (
            <motion.li key={m.title} initial={calm ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={calm ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: 0.4 + i * 0.12 }}>
              <span className="n-label" style={{ color: 'var(--n-accent)' }}>{m.when}</span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
      {beat >= 1 && (
        <Reveal className="n-col-12 sc-hz__constant">
          <Reveal.Item>
            <span className="n-label">What doesn’t change</span>
          </Reveal.Item>
          <Reveal.Item>
            <p className="n-display n-display--sm">
              No quote, no insight. Code checks the model. People make the <em>high-stakes</em> calls.
            </p>
          </Reveal.Item>
          <Reveal.Item>
            <p className="n-body">Grounding, gates, routing rules you can read, evals before every change, and an owner for every agent.</p>
          </Reveal.Item>
        </Reveal>
      )}
    </div>
  );
}
