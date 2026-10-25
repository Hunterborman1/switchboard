/**
 * 13 · Earning trust: rollout. "Build it, then operate it."
 * Beat 0: phased timeline. Beat 1: adoption measured + hours returned to execs.
 * Beat 2: operating it: review cadence, the agent standard, builder enablement.
 */
import { AnimatePresence, motion } from 'motion/react';
import { Callout, Chip, Display, Lede, Reveal, Stat } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

const PHASES = [
  { wk: 'Week 0', name: 'Discovery', items: ['Shadow two CSMs on real calls', '2-week time study replaces my assumptions', 'Co-design the taxonomy with CSMs and PMs'] },
  { wk: 'Weeks 1–2', name: 'Shadow mode', items: ['Runs silently on real calls', 'CSMs compare it with their own notes', 'Nothing routes automatically'] },
  { wk: 'Weeks 3–6', name: 'Champions', items: ['2–3 volunteer CSMs and one PM', 'Weekly calibration: what it missed, what was noise', 'Thresholds tuned on their labels'] },
  { wk: 'Week 7+', name: 'Team', items: ['Auto-route above 0.80, review below', 'High-stakes items always reviewed', 'Expand area by area'] },
];

const TRUST = ['A quote on every insight', 'One-click “this is wrong”', 'Precision published weekly', 'CSMs credited when it ships'];

const CYCLE = ['Build', 'Launch', 'Measure', 'Review', 'Improve'];
const TRACK = 'M 90 20 H 1110 A 40 40 0 0 1 1110 100 H 90 A 40 40 0 0 1 90 20 Z';

/** The operating loop: build → launch → measure → review → improve → build. */
function OperatingLoop() {
  const calm = useCalm();
  return (
    <svg className="sc-ro__loop" viewBox="0 0 1200 120" role="img" aria-label="The operating loop: build, launch, measure, review, improve, and back to build.">
      <motion.path d={TRACK} fill="none" stroke="rgb(142 229 142 / 0.35)" strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={calm ? { duration: 0 } : { duration: 1.4, ease: EASE }} />
      {!calm && (
        <circle r="5" fill="#8EE58E" style={{ filter: 'drop-shadow(0 0 6px #8EE58E)' }}>
          <animateMotion dur="7s" repeatCount="indefinite" path={TRACK} />
        </circle>
      )}
      {CYCLE.map((c, i) => {
        const x = 150 + i * 225;
        return (
          <motion.g key={c} initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={calm ? { duration: 0 } : { duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE }}>
            <rect x={x - 70} y={4} width={140} height={32} rx={16} fill="#0E2C26" stroke="rgb(142 229 142 / 0.5)" />
            <text x={x} y={25} textAnchor="middle" className="sc-ro__cyc">{c.toUpperCase()}</text>
          </motion.g>
        );
      })}
      <text x={600} y={78} textAnchor="middle" className="sc-ro__cycsub">every agent, on a calendar, with an owner</text>
    </svg>
  );
}

function Timeline() {
  const calm = useCalm();
  return (
    <div className="sc-ro__timeline">
      <svg className="sc-ro__rail" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="1000" y1="12" y2="12" stroke="rgb(242 245 228 / 0.14)" strokeWidth="2" />
        <motion.line x1="0" x2="1000" y1="12" y2="12" stroke="#8EE58E" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={calm ? { duration: 0 } : { duration: 1.6, ease: EASE, delay: 0.3 }} />
      </svg>
      <ol className="sc-ro__phases">
        {PHASES.map((p, i) => (
          <motion.li key={p.name} initial={calm ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={calm ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: 0.35 + i * 0.32 }}>
            <span className="sc-ro__node" aria-hidden="true" />
            <span className="n-label" style={{ color: 'var(--n-accent)' }}>{p.wk}</span>
            <h3 className="sc-ro__name">{p.name}</h3>
            <ul>
              {p.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function Rollout({ beat }: { beat: number }) {
  const b = Math.min(beat, 2);
  return (
    <div className="n-grid sc-ro">
      <div className="n-col-12">
        <AnimatePresence mode="wait">
          <Reveal key={b} className="n-stack">
            <Reveal.Item>
              <Display size="md" as="h2">
                {b === 0 && <>Earn trust in <em>public,</em> one phase at a time.</>}
                {b === 1 && <>Measure adoption. Report <em>hours,</em> not hype.</>}
                {b === 2 && <>Build it, then <em>operate</em> it.</>}
              </Display>
            </Reveal.Item>
            <Reveal.Item>
              <Lede>
                {b === 0 && 'Additive, not replacement. It takes the data entry, not the judgement. CSMs keep the relationship and the final call.'}
                {b === 1 && 'Agent Ops shows who uses it, when and how often, and what it returns. The exec number is hours given back, net of review time.'}
                {b === 2 && 'Launch is the start. Every agent gets an owner, a review cadence and the same standard, mine included. Then I make it easy for others to build to it.'}
              </Lede>
            </Reveal.Item>
          </Reveal>
        </AnimatePresence>
      </div>

      {b === 0 && (
        <div className="n-col-12">
          <Timeline />
          <Reveal className="n-row sc-ro__trust" delay={1.6}>
            {TRUST.map((t) => (
              <Reveal.Item key={t}>
                <Chip tone="accent" dot>{t}</Chip>
              </Reveal.Item>
            ))}
          </Reveal>
        </div>
      )}

      {b === 1 && (
        <Reveal className="n-col-12 sc-ro__measure" delay={0.25} each={0.1}>
          <Reveal.Item className="n-card n-card--accent sc-ro__hours">
            <Stat value={1.75} decimals={2} suffix=" hrs" label="given back per CSM, per week" tone="accent" />
            <Stat value={2730} label="hours a year across 30 CSMs" size="sm" />
            <Callout tone="assumption">
              <span className="n-label" style={{ color: 'var(--n-amber)' }}>Assumption</span> 10 min of admin per call × 15 calls a week, 70% removed. The time study replaces this.
            </Callout>
          </Reveal.Item>
          <Reveal.Item className="n-card sc-ro__list">
            <span className="n-label">What I measure, weekly</span>
            <ul>
              <li><b>Capture rate</b> share of calls that produce reviewed insight</li>
              <li><b>Time to owner</b> from call end to the right inbox</li>
              <li><b>Precision</b> of routed items, from one-click “wrong” flags</li>
              <li><b>Evidence rate</b> PM decisions that cite a quote</li>
              <li><b>Weekly active reviewers</b> and retention by cohort</li>
            </ul>
          </Reveal.Item>
          <Reveal.Item className="n-card sc-ro__list">
            <span className="n-label">What the exec report says</span>
            <ul>
              <li><b>Hours returned</b> Σ(baseline − measured review minutes)</li>
              <li><b>Value vs AI cost</b> at a stated loaded hourly rate</li>
              <li><b>Adoption</b> active users, by team, trend</li>
              <li><b>Quality</b> precision, grounding rate, incidents</li>
              <li><b>Next</b> what we change, and why</li>
            </ul>
          </Reveal.Item>
        </Reveal>
      )}

      {b === 2 && (
        <div className="n-col-12">
          <OperatingLoop />
        </div>
      )}
      {b === 2 && (
        <Reveal className="n-col-12 sc-ro__operate" delay={0.25} each={0.1}>
          {[
            { k: 'Review cadence', v: 'Every agent reviewed on a calendar: owner, evals, cost, incidents, still needed? Overdue shows up on the exec view.' },
            { k: 'The agent standard', v: 'Nine checks: owner, purpose, data review, evals with a gate, logs and traces, spend cap, human review, rollback, cadence.' },
            { k: 'Maintenance', v: 'Model and prompt changes go through the eval gate. Cost spikes and SLO breaches alert the owner; drift is caught by scheduled eval re-runs and the reviewer-edit rate.' },
            { k: 'Builder enablement', v: 'Templates for Claude and Gumloop builds, the standard as a checklist, weekly office hours, a shared eval harness.' },
          ].map((x) => (
            <Reveal.Item key={x.k} className="n-card sc-ro__op">
              <span className="n-label" style={{ color: 'var(--n-accent)' }}>{x.k}</span>
              <p className="n-body">{x.v}</p>
            </Reveal.Item>
          ))}
        </Reveal>
      )}
    </div>
  );
}
