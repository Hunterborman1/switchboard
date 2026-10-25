/**
 * Part 0 · Cold open. A recorded 13-minute QBR, drawn as a flat waveform with one highlighted
 * moment and its transcript. Beat 1 names the idea ("Every call is a signal.") and shows what
 * that sentence becomes once Signal Loop has read it.
 */
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { SceneHead } from '../components';
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
        fill="#E8F4EF"
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
            fill={hot ? '#008463' : '#CDD2CD'}
            initial={calm ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: calm ? 0 : DUR.ui, ease: EASE, delay: calm ? 0 : (i / BARS) * 0.4 }}
          />
        );
      })}
      <line x1={hiA} x2={hiA} y1={-2} y2={H + 2} stroke="#006B51" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={highlight ? 1 : 0} />
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

export function ColdOpen({ beat }: { beat: number }) {
  const calm = useCalm();
  const resolved = beat >= 1;
  return (
    <div className="sc-cold">
      <SceneHead
        k={resolved ? 'b1' : 'b0'}
        size={resolved ? 'lg' : 'md'}
        title={resolved ? 'Every call is a signal.' : 'One sentence in this 13-minute call belongs on the roadmap.'}
        line={
          resolved
            ? 'Signal Loop turns what customers tell Invoca’s CSMs into product insight with the quote attached, sent to the person who can act on it.'
            : 'A quarterly review with Brightline Home Services on October 21. Most of it is routine. This part isn’t.'
        }
      />

      <div className="sc-cold__call n-card" data-no-advance>
        <div className="sc-cold__callhead">
          <span className="sc-cold__title">Quarterly review · Brightline Home Services</span>
          <span className="sc-cold__meta">13 min · 3 speakers · recorded</span>
        </div>
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
                {l.who} <span>{l.org}</span>
              </span>
              <span className="sc-cold__text">“{l.text}”</span>
            </motion.li>
          ))}
        </ol>
      </div>

      <motion.div
        className="sc-cold__becomes"
        initial={false}
        animate={{ opacity: resolved ? 1 : 0, y: resolved || calm ? 0 : 6 }}
        transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: resolved && !calm ? 0.12 : 0 }}
        aria-hidden={!resolved}
      >
        <span className="n-label">What Signal Loop makes of that sentence</span>
        <dl>
          {BECOMES.map((b) => (
            <div key={b.k}>
              <dt>{b.k}</dt>
              <dd>{b.v}</dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </div>
  );
}
