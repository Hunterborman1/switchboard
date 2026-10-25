/**
 * Part 13 · Earning trust: rollout. "Build it, then operate it."
 * Beat 0: phased timeline. Beat 1: adoption measured and hours returned.
 * Beat 2: operating it: review cadence, the agent standard, builder enablement.
 */
import { motion } from 'motion/react';
import { Arrow, Callout, Check, SceneHead, Stat } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

const PHASES = [
  { wk: 'Week 0', name: 'Discovery', items: ['Shadow two CSMs on real calls', 'A two-week time study replaces my assumptions', 'Agree the categories with CSMs and PMs'] },
  { wk: 'Weeks 1–2', name: 'Shadow mode', items: ['Runs quietly on real calls', 'CSMs compare it with their own notes', 'Nothing is sent automatically'] },
  { wk: 'Weeks 3–6', name: 'Champions', items: ['Two or three volunteer CSMs and one PM', 'Weekly review of what it missed and what was noise', 'Thresholds tuned on their feedback'] },
  { wk: 'Week 7+', name: 'Whole team', items: ['Confident items go straight to the owner', 'Anything high stakes is always reviewed', 'Expand one area at a time'] },
];

const TRUST = ['A quote on every insight', 'One click to say “this is wrong”', 'Accuracy published weekly', 'CSMs credited when it ships'];

const CYCLE = ['Build', 'Launch', 'Measure', 'Review', 'Improve'];

const OPERATE = [
  { k: 'Review cadence', v: 'Every agent is reviewed on a schedule: owner, quality, cost, incidents, and whether it’s still needed. Overdue reviews show up for executives.' },
  { k: 'The agent standard', v: 'Nine checks: an owner, a purpose, a data review, quality tests that gate changes, logs, a spending cap, human review, a way to roll back, and a review date.' },
  { k: 'Maintenance', v: 'Model and prompt changes have to pass the quality tests. Cost spikes and slowdowns alert the owner, and scheduled re-tests catch drift.' },
  { k: 'Helping other builders', v: 'Templates for Claude and Gumloop builds, the standard as a checklist, weekly office hours and a shared test kit.' },
];

function Timeline() {
  const calm = useCalm();
  return (
    <div className="sc-ro__timeline">
      <div className="sc-ro__rail" aria-hidden="true">
        <motion.span className="sc-ro__railfill" initial={calm ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: calm ? 0 : DUR.data, ease: EASE, delay: calm ? 0 : 0.1 }} />
      </div>
      <ol className="sc-ro__phases">
        {PHASES.map((p, i) => (
          <motion.li key={p.name} initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.1 + i * 0.12 }}>
            <span className="sc-ro__node" aria-hidden="true">{i + 1}</span>
            <span className="sc-ro__wk">{p.wk}</span>
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

function OperatingLoop() {
  const calm = useCalm();
  return (
    <div className="sc-ro__cycle" role="img" aria-label="The operating loop: build, launch, measure, review, improve, then back to build. Every agent, on a calendar, with an owner.">
      <ol>
        {CYCLE.map((c, i) => (
          <motion.li key={c} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: calm ? 0 : 0.05 + i * 0.1 }}>
            <span className="sc-ro__cyc">{c}</span>
            {i < CYCLE.length - 1 && (
              <span className="sc-ro__cycarrow" aria-hidden="true">
                <Arrow />
              </span>
            )}
          </motion.li>
        ))}
      </ol>
      <span className="sc-ro__cycback">Then back to build. Every agent, on a calendar, with an owner.</span>
    </div>
  );
}

const HEAD = [
  { h: 'Earn trust in public, one phase at a time.', l: 'It adds to the CSM’s work instead of replacing it. It takes the data entry, not the judgement. CSMs keep the relationship and the final call.' },
  { h: 'Measure adoption. Report hours, not hype.', l: 'Agent Ops shows who uses it, how often, and what it gives back. The number for executives is hours returned, after review time.' },
  { h: 'Build it, then operate it.', l: 'Launch is the start. Every agent gets an owner, a review schedule and the same standard, mine included. Then I make it easy for others to build to it.' },
];

export function Rollout({ beat }: { beat: number }) {
  const b = Math.min(beat, 2);
  const calm = useCalm();
  const item = (i: number) => ({ initial: calm ? false : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.08 + i * 0.08 } }) as const;
  return (
    <div className="sc-ro">
      <SceneHead k={b} title={HEAD[b]!.h} line={HEAD[b]!.l} />

      {b === 0 && (
        <div className="sc-ro__body" key="b0">
          <Timeline />
          <ul className="sc-ro__trust">
            {TRUST.map((t, i) => (
              <motion.li key={t} {...item(i + 4)}>
                <span className="sc-ro__check"><Check /></span>
                {t}
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {b === 1 && (
        <div className="sc-ro__measure" key="b1">
          <motion.div className="n-card sc-ro__hours" {...item(0)}>
            <Stat value={1.75} decimals={2} suffix=" hours" label="given back to each CSM, every week" tone="accent" />
            <Stat value={2730} label="hours a year across 30 CSMs" size="sm" />
            <Callout tone="assumption">
              <b>Assumption.</b> 10 minutes of admin per call, 15 calls a week, 70% of it removed. The time study replaces this.
            </Callout>
          </motion.div>
          <motion.div className="n-card sc-ro__list" {...item(1)}>
            <span className="n-label">What I measure every week</span>
            <dl>
              <div><dt>Capture rate</dt><dd>Share of calls that produce a reviewed insight</dd></div>
              <div><dt>Time to owner</dt><dd>From the end of the call to the right inbox</dd></div>
              <div><dt>Accuracy</dt><dd>Of what was sent, from one-click “wrong” flags</dd></div>
              <div><dt>Evidence rate</dt><dd>Product decisions that cite a customer quote</dd></div>
              <div><dt>Active reviewers</dt><dd>Weekly, and who keeps coming back</dd></div>
            </dl>
          </motion.div>
          <motion.div className="n-card sc-ro__list" {...item(2)}>
            <span className="n-label">What the executive report says</span>
            <dl>
              <div><dt>Hours returned</dt><dd>Time saved, minus time spent reviewing</dd></div>
              <div><dt>Value against AI cost</dt><dd>At a stated hourly rate</dd></div>
              <div><dt>Adoption</dt><dd>Active users by team, and the trend</dd></div>
              <div><dt>Quality</dt><dd>Accuracy, quotes checked, incidents</dd></div>
              <div><dt>Next</dt><dd>What we change, and why</dd></div>
            </dl>
          </motion.div>
        </div>
      )}

      {b === 2 && (
        <div className="sc-ro__body" key="b2">
          <OperatingLoop />
          <div className="sc-ro__operate">
            {OPERATE.map((x, i) => (
              <motion.div key={x.k} className="n-card sc-ro__op" {...item(i + 2)}>
                <h3>{x.k}</h3>
                <p className="n-body">{x.v}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
