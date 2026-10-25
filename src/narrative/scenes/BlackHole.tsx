/**
 * Part 1 · The insight black hole. A flat flow: where customer feedback comes from, each
 * handoff it has to survive, and how much is lost at each one. Beat 0 shows the sources,
 * beat 1 reveals the handoffs one after another, beat 2 labels the figures as an assumption.
 */
import { motion } from 'motion/react';
import { Callout, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

const SOURCES = ['Quarterly reviews', 'Renewal calls', 'Check-ins', 'Support escalations'];

/** Out of every 100 things customers tell a CSM (illustrative, labelled on beat 2). */
const STAGES = [
  { label: 'Said by a customer on a call', n: 100 },
  { label: 'Written down by the CSM', n: 72, lost: 28, why: 'said once, never written down' },
  { label: 'Shared beyond the CSM', n: 55, lost: 17, why: 'stays in a notes field' },
  { label: 'Reaches the right owner', n: 40, lost: 15, why: 'Slack thread scrolls away' },
];

export function BlackHole({ beat }: { beat: number }) {
  const calm = useCalm();
  const flowing = beat >= 1;
  return (
    <div className="sc-bh">
      <SceneHead
        k={flowing ? 'b1' : 'b0'}
        title={flowing ? 'Most of it never reaches the person who could act on it.' : 'Customers tell CSMs exactly what to build.'}
        line={
          flowing
            ? 'Every handoff is manual and optional. Follow 100 pieces of feedback from the call to an owner.'
            : 'What’s broken, what’s missing, what a competitor just offered them. It comes up on every kind of call.'
        }
      />

      <div className="sc-bh__flow" role="img" aria-label="Out of every 100 pieces of customer feedback: 72 are written down, 55 are shared beyond the CSM, and 40 reach someone who can act on them. 60 are lost along the way." data-no-advance>
        <div className="sc-bh__sources">
          <span className="n-label">Where it comes from</span>
          <ul>
            {SOURCES.map((s, i) => (
              <motion.li key={s} initial={calm ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.1 + i * 0.06 }}>
                {s}
              </motion.li>
            ))}
          </ul>
        </div>

        <ol className="sc-bh__stages">
          {STAGES.map((s, i) => {
            const shown = i === 0 || flowing;
            const delay = calm || !flowing || i === 0 ? 0 : 0.1 + (i - 1) * 0.4;
            return (
              <li key={s.label} className="sc-bh__stage" data-shown={shown}>
                <span className="sc-bh__step">{i === 0 ? 'Start' : `Handoff ${i}`}</span>
                <span className="sc-bh__label">{s.label}</span>
                <span className="sc-bh__track">
                  {s.lost != null && (
                    <motion.span
                      className="sc-bh__gap"
                      style={{ left: `${s.n}%`, width: `${s.lost}%` }}
                      initial={false}
                      animate={{ opacity: shown ? 1 : 0 }}
                      transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: delay + (calm ? 0 : 0.12) }}
                    />
                  )}
                  {/* Each bar arrives at the previous stage's size, then shrinks to what survives the handoff. */}
                  <motion.span
                    className="sc-bh__bar"
                    data-final={i === STAGES.length - 1 ? 'true' : undefined}
                    initial={false}
                    animate={{ width: shown ? (calm || i === 0 ? `${s.n}%` : [`${s.n + (s.lost ?? 0)}%`, `${s.n}%`]) : '0%', opacity: shown ? 1 : 0 }}
                    transition={{ width: { duration: calm ? 0 : DUR.data * 0.7, ease: EASE, delay: delay + (calm ? 0 : 0.12) }, opacity: { duration: calm ? 0 : DUR.press, delay } }}
                  />
                </span>
                <motion.span className="sc-bh__n" initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: delay + (calm ? 0 : 0.3) }}>
                  {s.n}
                </motion.span>
                <motion.span className="sc-bh__lost" initial={false} animate={{ opacity: shown && s.lost != null ? 1 : 0 }} transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: delay + (calm ? 0 : 0.3) }}>
                  {s.lost != null && (
                    <>
                      <b>−{s.lost}</b> {s.why}
                    </>
                  )}
                </motion.span>
              </li>
            );
          })}
        </ol>

        <div className="sc-bh__legend" aria-hidden="true">
          <span><i className="sc-bh__key sc-bh__key--kept" /> still moving</span>
          <span><i className="sc-bh__key sc-bh__key--lost" /> lost at this handoff</span>
        </div>
      </div>

      <motion.div className="sc-bh__foot" initial={false} animate={{ opacity: beat >= 2 ? 1 : 0, y: beat >= 2 || calm ? 0 : 4 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE }} aria-hidden={beat < 2}>
        <p className="sc-bh__summary">
          <b>60 of every 100</b> never reach an owner.
        </p>
        <Callout tone="assumption">
          <b>Assumption.</b> These numbers are illustrative, not measured. The first thing I’d do is a two-week time study with two CSMs to replace them with real ones.
        </Callout>
      </motion.div>
    </div>
  );
}
