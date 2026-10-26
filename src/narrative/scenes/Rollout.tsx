/**
 * Part 15 · Earning trust: rollout. "Build it, then operate it."
 * Beat 0: phased timeline. Beat 1: adoption measured and hours returned.
 * Beat 2: operating it: review cadence, the agent standard, builder enablement.
 * All three beats share one grid cell, so the scene keeps its size and nothing jumps.
 */
import { Callout } from '../../ds';
import { Appear, Arrow, Check, SceneHead, Stat } from '../components';

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

const MEASURE = [
  { k: 'Capture rate', v: 'Share of calls that produce a reviewed insight' },
  { k: 'Time to owner', v: 'From the end of the call to the right inbox' },
  { k: 'Accuracy', v: 'Of what was sent, from one-click “wrong” flags' },
  { k: 'Evidence rate', v: 'Product decisions that cite a customer quote' },
  { k: 'Active reviewers', v: 'Weekly, and who keeps coming back' },
];

const REPORT = [
  { k: 'Hours returned', v: 'Time saved, minus time spent reviewing' },
  { k: 'Value against AI cost', v: 'At a stated hourly rate' },
  { k: 'Adoption', v: 'Active users by team, and the trend' },
  { k: 'Quality', v: 'Accuracy, quotes checked, incidents' },
  { k: 'Next', v: 'What we change, and why' },
];

const HEADS = [
  { title: 'Earn trust in public, one phase at a time.', line: 'It adds to the CSM’s work instead of replacing it: it takes the data entry, not the judgement. CSMs keep the relationship and the final call.' },
  { title: 'Measure adoption. Report hours, not hype.', line: 'Agent Ops shows who uses it, how often, and what it gives back. The number for executives is hours returned, after review time.' },
  { title: 'Build it, then operate it.', line: 'Launch is the start. Every agent gets an owner, a review schedule and the same standard, mine included. Then I make it easy for others to build to it.' },
];

function Phases({ show }: { show: boolean }) {
  return (
    <div className="sc-ro__timeline">
      <ol className="sc-ro__phases">
        {PHASES.map((p, i) => (
          <Appear key={p.name} as="li" show={show} delay={0.06 + i * 0.1}>
            <span className="sc-ro__node" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sc-ro__wk">{p.wk}</span>
            <h3 className="sc-ro__name">{p.name}</h3>
            <ul>
              {p.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </Appear>
        ))}
      </ol>
    </div>
  );
}

function KvList({ title, items }: { title: string; items: { k: string; v: string }[] }) {
  return (
    <section className="sc-ro__card sc-ro__list" aria-label={title}>
      <h3 className="sc-ro__cardtitle">{title}</h3>
      <dl>
        {items.map((x) => (
          <div key={x.k}>
            <dt>{x.k}</dt>
            <dd>{x.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Rollout({ beat }: { beat: number }) {
  const b = Math.min(beat, 2);
  return (
    <div className="sc sc-ro">
      <SceneHead heads={HEADS} active={b} />

      <div className="sc-ro__stack">
        <Appear show={b === 0} className="sc-ro__beat">
          <Phases show={b === 0} />
          <ul className="sc-ro__trust">
            {TRUST.map((t) => (
              <li key={t}>
                <Check />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Appear>

        <Appear show={b === 1} className="sc-ro__beat sc-ro__measure">
          <section className="sc-ro__card sc-ro__hours" aria-label="Hours returned">
            <h3 className="sc-ro__cardtitle">Hours given back</h3>
            <Stat value={1.75} decimals={2} suffix="hours" label="to each CSM, every week" tone="accent" start={b === 1} />
            <Stat value={2730} suffix="hours" label="a year across 30 CSMs" size="sm" start={b === 1} />
            <Callout tone="warning" title="Assumption">
              10 minutes of admin per call, 15 calls a week, 70% of it removed. The time study replaces this.
            </Callout>
          </section>
          <KvList title="What I measure every week" items={MEASURE} />
          <KvList title="What the executive report says" items={REPORT} />
        </Appear>

        <Appear show={b === 2} className="sc-ro__beat">
          <div className="sc-ro__cycle" role="img" aria-label="The operating loop: build, launch, measure, review, improve, then back to build. Every agent, on a calendar, with an owner.">
            <ol>
              {CYCLE.map((c, i) => (
                <li key={c}>
                  <span className="sc-ro__cyc">{c}</span>
                  {i < CYCLE.length - 1 && (
                    <span className="sc-ro__cycarrow" aria-hidden="true">
                      <Arrow size={16} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <span className="sc-ro__cycback">Then back to build. Every agent, on a calendar, with an owner.</span>
          </div>
          <div className="sc-ro__operate">
            {OPERATE.map((x) => (
              <section key={x.k} className="sc-ro__card sc-ro__op">
                <h3 className="sc-ro__cardtitle">{x.k}</h3>
                <p className="n-body">{x.v}</p>
              </section>
            ))}
          </div>
        </Appear>
      </div>
    </div>
  );
}
