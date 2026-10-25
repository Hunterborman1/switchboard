/**
 * Part 14 · The next 12–18 months. A flat timeline of six milestones, then what doesn't change.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { tourApi } from '../../tour/api';
import { SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';
import { usdPrecise } from '../../shared/format';

// Months 0–3 are the rollout scene's own phases (discovery, shadow, champions, team), so
// nothing here promises "every call" before shadow mode and champions have earned it.
const EVERY_CALL = 'Every call, by default';
const MILES = [
  { when: 'Months 0–3', title: 'Earn trust first', body: 'Discovery and the time study, shadow mode where nothing is sent, champions, then the team: the rollout you just saw.' },
  // body is replaced with the measured average per-call cost when the run ledger answers (usePerCallCost)
  { when: 'Months 3–6', title: EVERY_CALL, body: 'Read calls straight from the recorder and CRM. The cost per call is low enough that reading every call beats a sample.' },
  { when: 'Months 6–9', title: 'Capture during the call', body: 'Signals appear while the call is live, so the CSM can confirm one with the customer before hanging up.' },
  { when: 'Months 9–12', title: 'Specialist agents', body: 'One finds the feedback, one challenges each claim, one decides who hears it. Each has its own tests.' },
  { when: 'Months 12–15', title: 'Drafted specs and replies', body: 'A theme becomes a first-draft product spec with quotes, plus a drafted reply for each account that raised it.' },
  { when: 'Months 15–18', title: 'Part of Invoca’s platform', body: 'Plug into Invoca’s Signal AI and conversation data, so the internal loop and the product share one engine.' },
];

/** Mean AI cost per live run, measured from the run ledger (the same figure as the cost backup). */
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

export function Horizon({ beat }: { beat: number }) {
  const calm = useCalm();
  const perCall = usePerCallCost();
  const miles = MILES.map((m) =>
    m.title === EVERY_CALL && perCall != null && perCall > 0
      ? { ...m, body: `Read calls straight from the recorder and CRM. At about ${usdPrecise(perCall)} of AI per call (measured on this build), reading every call beats a sample.` }
      : m,
  );
  return (
    <div className="sc-hz">
      <SceneHead title="The next 12 to 18 months." line="The ingredients get cheaper and faster. The parts that earn trust stay the same." />
      <div className="sc-hz__stage">
        <div className="sc-hz__axis" aria-hidden="true">
          <motion.span className="sc-hz__axisfill" initial={calm ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: calm ? 0 : DUR.data, ease: EASE, delay: calm ? 0 : 0.1 }} />
        </div>
        <ol className="sc-hz__miles">
          {miles.map((m, i) => (
            <motion.li key={m.title} initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.1 + i * 0.08 }}>
              <span className="sc-hz__dot" aria-hidden="true" data-first={i === 0 ? 'true' : undefined} />
              <span className="sc-hz__when">{m.when}</span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
      <motion.div className="sc-hz__constant" initial={false} animate={{ opacity: beat >= 1 ? 1 : 0, y: beat >= 1 || calm ? 0 : 4 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE }} aria-hidden={beat < 1}>
        <span className="n-label">What doesn’t change</span>
        <p className="sc-hz__rule">No quote, no insight. Code checks the model. People make the high-stakes calls.</p>
        <p className="n-body">Quotes checked against the call, routing rules anyone can read, tests before every change, and an owner for every agent.</p>
      </motion.div>
    </div>
  );
}
