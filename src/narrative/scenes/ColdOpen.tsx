/**
 * Part 1 · Cold open. A recorded 13-minute QBR, drawn as a flat waveform with one highlighted
 * moment and its transcript. Beat 1 names the idea ("Every call is a signal.") and shows what
 * that sentence becomes once Signal Loop has read it.
 */
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { ConnectorMark } from '../../ds';
import { Appear, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

/** The call: 2026-10-21 Brightline QBR (data/files/file_c1042.vtt), 13:00 long. */
const CALL_SEC = 13 * 60;
const HIGHLIGHT = { from: 6 * 60, to: 6 * 60 + 23 };
const BARS = 104;

function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A still, flat waveform of the whole call. The highlighted span is drawn in the accent. */
export function Waveform({ highlight = true }: { highlight?: boolean }) {
  const calm = useCalm();
  const amps = useMemo(() => Array.from({ length: BARS }, (_, i) => 0.18 + 0.82 * Math.abs(Math.sin(i * 0.37) * 0.5 + (seeded(i) - 0.5) * 0.9)), []);
  const W = 1000;
  const H = 56;
  const step = W / BARS;
  const hiA = (HIGHLIGHT.from / CALL_SEC) * W;
  const hiB = (HIGHLIGHT.to / CALL_SEC) * W;
  return (
    <div className="sc-cold__wavewrap" aria-hidden="true">
      <svg className="sc-cold__wave" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <motion.rect
          x={hiA - 2}
          y={0}
          width={hiB - hiA + 4}
          height={H}
          rx={4}
          style={{ fill: 'var(--accent-subtle)' }}
          initial={calm ? false : { opacity: 0 }}
          animate={{ opacity: highlight ? 1 : 0 }}
          transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: calm ? 0 : 0.45 }}
        />
        {amps.map((a, i) => {
          const x = i * step + step / 2;
          const h = Math.max(4, a * (H - 8));
          const hot = highlight && x >= hiA && x <= hiB;
          return (
            <motion.rect
              key={i}
              x={x - 2}
              width={4}
              rx={2}
              y={H / 2 - h / 2}
              height={h}
              style={{ fill: hot ? 'var(--accent)' : 'var(--border-strong)' }}
              initial={calm ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: calm ? 0 : (i / BARS) * 0.4 }}
            />
          );
        })}
      </svg>
      <div className="sc-cold__axis">
        <span>00:00</span>
        <span className="sc-cold__axis-hi" style={{ left: `${(HIGHLIGHT.from / CALL_SEC) * 100}%`, opacity: highlight ? 1 : 0 }}>
          {fmt(HIGHLIGHT.from)}
        </span>
        <span>{fmt(CALL_SEC)}</span>
      </div>
    </div>
  );
}

const LINES = [
  { t: 5 * 60 + 54, who: 'Dana Ortiz', org: 'Brightline', text: 'Because I’ll be honest with you, this is the one that keeps me up at night.' },
  { t: 6 * 60, who: 'Jeff Kim', org: 'Brightline', text: 'CallRail’s been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day.', hot: true },
  { t: 6 * 60 + 24, who: 'Marcus Bell', org: 'Invoca CSM', text: 'That’s fair, and I appreciate you telling me.' },
];

const BECOMES = [
  { k: 'What it is', v: 'Competitor offer: same-day conversions' },
  { k: 'Who hears it', v: 'Competitive intel and the product owner, today' },
  { k: 'Evidence', v: 'Jeff Kim’s words, at 06:00 in the call' },
  { k: 'Why it matters', v: 'Brightline renews in 12 weeks' },
];

const HEADS = [
  { title: 'One sentence in this 13-minute call belongs on the roadmap.', line: 'A quarterly review with Brightline Home Services on October 21. Most of it is routine. This part isn’t.' },
  { title: 'Every call is a signal.', line: 'Signal Loop turns what customers tell Invoca’s CSMs into product insight with the quote attached, sent to the person who can act on it.' },
];

export function ColdOpen({ beat }: { beat: number }) {
  const calm = useCalm();
  const resolved = beat >= 1;
  return (
    <div className="sc sc-cold">
      <SceneHead heads={HEADS} active={resolved ? 1 : 0} />

      <div className="sc-cold__visual">
        <section className="sc-cold__call" aria-label="The recorded call" data-no-advance>
          <header className="sc-cold__callhead">
            <ConnectorMark id="gong" size={24} title="Recorded in Gong" />
            <div className="sc-cold__titles">
              <span className="sc-cold__title">Quarterly review</span>
              <span className="sc-cold__account">Brightline Home Services</span>
            </div>
            <span className="sc-cold__meta">
              <span>13 min</span>
              <span>3 speakers</span>
            </span>
          </header>
          <Waveform />
          <ol className="sc-cold__lines">
            {LINES.map((l, i) => (
              <motion.li
                key={l.t}
                data-hot={l.hot ? 'true' : undefined}
                initial={calm ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : 0.5 + i * 0.12 }}
              >
                <span className="sc-cold__ts">{fmt(l.t)}</span>
                <span className="sc-cold__who">
                  <b>{l.who}</b>
                  <span>{l.org}</span>
                </span>
                <span className="sc-cold__text">“{l.text}”</span>
              </motion.li>
            ))}
          </ol>
        </section>

        <Appear show={resolved} delay={0.12} className="sc-cold__becomes">
          <h2 className="n-label">What Signal Loop makes of that sentence</h2>
          <dl>
            {BECOMES.map((b) => (
              <div key={b.k}>
                <dt>{b.k}</dt>
                <dd>{b.v}</dd>
              </div>
            ))}
          </dl>
        </Appear>
      </div>
    </div>
  );
}
