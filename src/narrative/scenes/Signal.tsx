/**
 * Chapter 1 · Every call is a signal. Everything on one screen, no clicks: the recorded
 * 13-minute Brightline QBR with its one roadmap-worthy moment at 06:00 (data/files/file_c1042.vtt),
 * where feedback like it gets lost today (100 → 72 → 55 → 40, an illustrative assumption and
 * labelled as one), and what Signal Loop makes of that sentence instead.
 *
 * Entrance, once on arrival: the call, then the handoffs (each bar arrives at the previous
 * stage's size and shrinks to what survives), then the bottom row. Settled by about 850 ms.
 */
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { Callout, ConnectorMark } from '../../ds';
import { Enter, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

/** The call: 2026-10-21 Brightline QBR (data/files/file_c1042.vtt), 13:00 long. */
const CALL_SEC = 13 * 60;
const HIGHLIGHT = { from: 6 * 60, to: 6 * 60 + 23 };
const BARS = 96;

function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A still, flat waveform of the whole call; the highlighted span is drawn in the accent. Bars sweep in left to right once. */
function Waveform({ delay }: { delay: number }) {
  const calm = useCalm();
  const amps = useMemo(() => Array.from({ length: BARS }, (_, i) => 0.18 + 0.82 * Math.abs(Math.sin(i * 0.37) * 0.5 + (seeded(i) - 0.5) * 0.9)), []);
  const W = 1000;
  const H = 56;
  const step = W / BARS;
  const hiA = (HIGHLIGHT.from / CALL_SEC) * W;
  const hiB = (HIGHLIGHT.to / CALL_SEC) * W;
  const t = (d: number) => ({ duration: calm ? 0 : DUR.ui, ease: EASE, delay: calm ? 0 : delay + d });
  return (
    <div className="sc-sig__wavewrap" aria-hidden="true">
      <svg className="sc-sig__wave" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <motion.rect x={hiA - 2} y={0} width={hiB - hiA + 4} height={H} rx={4} style={{ fill: 'var(--accent-subtle)' }} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={t(0.3)} />
        {amps.map((a, i) => {
          const x = i * step + step / 2;
          const h = Math.max(4, a * (H - 8));
          const hot = x >= hiA && x <= hiB;
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
              transition={t((i / BARS) * 0.3)}
            />
          );
        })}
      </svg>
      <div className="sc-sig__axis">
        <span>00:00</span>
        <span className="sc-sig__axis-hi" style={{ left: `${(HIGHLIGHT.from / CALL_SEC) * 100}%` }}>
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

/** Out of every 100 things customers tell a CSM. Illustrative, and labelled as an assumption on screen. */
const STAGES = [
  { label: 'Said by a customer on a call', n: 100 },
  { label: 'Written down by the CSM', n: 72, lost: 28, why: 'said once, never written down' },
  { label: 'Shared beyond the CSM', n: 55, lost: 17, why: 'stays in a notes field' },
  { label: 'Reaches the right owner', n: 40, lost: 15, why: 'the Slack thread scrolls away' },
];

const BECOMES = [
  { k: 'What it is', v: 'Competitor offer: same-day conversions' },
  { k: 'Who hears it', v: 'Competitive intel and the product owner, today' },
  { k: 'Evidence', v: 'Jeff Kim’s words, at 06:00 in the call' },
  { k: 'Why it matters', v: 'Brightline renews in 12 weeks' },
];

const T = { call: 0.04, lines: 0.28, lost: 0.1, bars: 0.18, becomes: 0.4 };

function Handoffs() {
  const calm = useCalm();
  return (
    <ol
      className="sc-sig__stages"
      role="img"
      aria-label="Out of every 100 pieces of customer feedback: 72 are written down, 55 are shared beyond the CSM, and 40 reach someone who can act on them. 60 are lost along the way. These numbers are illustrative."
    >
      {STAGES.map((s, i) => {
        const from = i === 0 ? 0 : s.n + (s.lost ?? 0);
        const delay = T.bars + i * 0.08;
        return (
          <li key={s.label} className="sc-sig__stage">
            <span className="sc-sig__label">
              <span>{s.label}</span>
              {s.lost != null ? (
                <span className="sc-sig__lost">
                  <b>−{s.lost}</b> {s.why}
                </span>
              ) : null}
            </span>
            <span className="sc-sig__track">
              {s.lost != null ? <span className="sc-sig__gap" style={{ left: `${s.n}%`, width: `${s.lost}%` }} /> : null}
              <motion.span
                className="sc-sig__bar"
                data-final={i === STAGES.length - 1 ? 'true' : undefined}
                initial={calm ? false : { width: `${from}%` }}
                animate={{ width: `${s.n}%` }}
                transition={{ duration: calm ? 0 : DUR.data * 0.6, ease: EASE, delay: calm ? 0 : delay }}
              />
            </span>
            <span className="sc-sig__n">{s.n}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Signal() {
  const calm = useCalm();
  return (
    <div className="sc sc-sig">
      <SceneHead
        title="Every call is a signal."
        line="One sentence in this 13-minute QBR belongs on the roadmap. Today, most feedback like it gets lost."
      />

      <div className="sc-sig__grid">
        <Enter as="section" delay={T.call} className="sc-sig__card sc-sig__call" attrs={{ 'aria-label': 'The recorded call', 'data-testid': 'signal-call' }}>
          <header className="sc-sig__callhead">
            <ConnectorMark id="gong" size={24} title="Recorded in Gong" />
            <div className="sc-sig__titles">
              <span className="sc-sig__title">Quarterly review</span>
              <span className="sc-sig__account">Brightline Home Services</span>
            </div>
            <span className="sc-sig__meta">
              <span>Oct 21</span>
              <span>13 min</span>
              <span>3 speakers</span>
            </span>
          </header>
          <Waveform delay={T.call} />
          <ol className="sc-sig__lines">
            {LINES.map((l, i) => (
              <motion.li
                key={l.t}
                data-hot={l.hot ? 'true' : undefined}
                initial={calm ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : T.lines + i * 0.06 }}
              >
                <span className="sc-sig__ts">{fmt(l.t)}</span>
                <span className="sc-sig__said">
                  <span className="sc-sig__who">
                    <b>{l.who}</b>
                    <span>{l.org}</span>
                  </span>
                  <span className="sc-sig__text">“{l.text}”</span>
                </span>
              </motion.li>
            ))}
          </ol>
        </Enter>

        <Enter as="section" delay={T.lost} className="sc-sig__card sc-sig__flow" attrs={{ 'aria-label': 'Where feedback gets lost today', 'data-testid': 'signal-lost' }}>
          <header className="sc-sig__flowhead">
            <h2 className="sc-sig__h">Where feedback like this gets lost today</h2>
            <p className="sc-sig__sub">Out of every 100 things customers tell a CSM</p>
          </header>
          <Handoffs />
          <div className="sc-sig__foot">
            <p className="sc-sig__summary">
              <b>60 of every 100</b> never reach an owner.
            </p>
            <Callout tone="warning" title="Assumption">
              Illustrative, not measured. A two-week time study with two CSMs would replace these numbers.
            </Callout>
          </div>
        </Enter>
      </div>

      <Enter as="section" delay={T.becomes} className="sc-sig__becomes" attrs={{ 'aria-label': 'What Signal Loop makes of that sentence', 'data-testid': 'signal-becomes' }}>
        <h2 className="n-label">What Signal Loop makes of that sentence</h2>
        <dl>
          {BECOMES.map((b) => (
            <div key={b.k}>
              <dt>{b.k}</dt>
              <dd>{b.v}</dd>
            </div>
          ))}
        </dl>
      </Enter>
    </div>
  );
}
