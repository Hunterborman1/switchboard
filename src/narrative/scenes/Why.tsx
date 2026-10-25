/**
 * 02 · Why this option. Invoca turns its customers' calls into signals; mirror the same
 * idea onto Invoca's own CSM calls. Animated mirror diagram.
 */
import { motion } from 'motion/react';
import { Chip, Display, Lede, Reveal } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

type RowProps = { y: number; from: string; fromSub: string; engine: string; to: string; toSub: string; tone: 'ink' | 'accent'; show: boolean; delay?: number };

function Row({ y, from, fromSub, engine, to, toSub, tone, show, delay = 0 }: RowProps) {
  const calm = useCalm();
  const t = (d: number, dl = 0) => (calm ? { duration: 0 } : { duration: d, ease: EASE, delay: delay + dl });
  const stroke = tone === 'accent' ? '#8EE58E' : 'rgb(242 245 228 / 0.55)';
  const engineFill = tone === 'accent' ? 'rgb(142 229 142 / 0.12)' : 'rgb(242 245 228 / 0.05)';
  return (
    <motion.g initial={false} animate={{ opacity: show ? 1 : 0 }} transition={t(0.5)}>
      {/* source */}
      <rect x="20" y={y - 44} width="310" height="88" rx="14" fill="rgb(242 245 228 / 0.03)" stroke="rgb(242 245 228 / 0.16)" />
      <text x="40" y={y - 6} className="sc-why__t">{from}</text>
      <text x="40" y={y + 20} className="sc-why__s">{fromSub}</text>
      {/* line in */}
      <motion.path d={`M330 ${y} H 430`} stroke={stroke} strokeWidth="1.5" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: show ? 1 : 0 }} transition={t(0.6, 0.2)} />
      {/* engine */}
      <rect x="430" y={y - 52} width="200" height="104" rx="52" fill={engineFill} stroke={stroke} />
      <text x="530" y={y + 6} textAnchor="middle" className="sc-why__e" fill={tone === 'accent' ? '#D1FFD1' : '#F2F5E4'}>{engine}</text>
      {/* line out */}
      <motion.path d={`M630 ${y} H 730`} stroke={stroke} strokeWidth="1.5" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: show ? 1 : 0 }} transition={t(0.6, 0.5)} />
      {/* destination */}
      <rect x="730" y={y - 44} width="350" height="88" rx="14" fill="rgb(242 245 228 / 0.03)" stroke="rgb(242 245 228 / 0.16)" />
      <text x="752" y={y - 6} className="sc-why__t">{to}</text>
      <text x="752" y={y + 20} className="sc-why__s">{toSub}</text>
      {/* travelling pulses */}
      {show && !calm &&
        [0, 1, 2].flatMap((i) =>
          ([
            [330, 430],
            [630, 730],
          ] as const).map(([a, b], k) => (
            <motion.circle
              key={`${i}-${k}`}
              r="3.5"
              cy={y}
              fill={tone === 'accent' ? '#8EE58E' : '#F2F5E4'}
              initial={{ cx: a, opacity: 0 }}
              animate={{ cx: [a, b], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.5, delay: delay + 1 + i * 0.85 + k * 1.3, ease: 'linear' }}
            />
          )),
        )}
    </motion.g>
  );
}

export function Why({ beat }: { beat: number }) {
  const calm = useCalm();
  return (
    <div className="n-grid sc-why">
      <div className="n-col-12 sc-why__head">
        <Reveal key={beat >= 2 ? 'h2' : 'h1'} className="n-stack">
          <Reveal.Item>
            {beat < 2 ? (
              <Display size="md" as="h2">
                Invoca already turns calls into <em>signals.</em>
              </Display>
            ) : (
              <Display size="md" as="h2">
                Same idea, pointed <em>inward.</em>
              </Display>
            )}
          </Reveal.Item>
          <Reveal.Item>
            <Lede>
              {beat < 2
                ? 'For its customers, every inbound call becomes a conversion, an intent, a coaching moment. Option 3 asks for the same discipline on Invoca’s own customer conversations.'
                : 'I chose the feedback loop because it uses data Invoca already has, it’s low risk (internal, additive, human-reviewed), and it can show value in weeks, not quarters.'}
            </Lede>
          </Reveal.Item>
        </Reveal>
      </div>
      <div className="n-col-12">
        <svg className="sc-why__svg" viewBox="0 0 1100 420" role="img" aria-label="Top: Invoca's customers' calls flow through Signal AI into marketing and contact-center signals. Mirrored below: Invoca's own CSM calls flow through Signal Loop into product, VP, sales and support signals.">
          <Row y={90} from="Customers’ calls" fromSub="Inbound calls to Invoca customers" engine="Invoca Signal AI" to="Signals for the business" toSub="Conversions · intent · coaching" tone="ink" show />
          <motion.g initial={false} animate={{ opacity: beat >= 1 ? 1 : 0 }} transition={{ duration: calm ? 0 : 0.5 }}>
            <line x1="20" x2="1080" y1="210" y2="210" stroke="rgb(242 245 228 / 0.22)" strokeDasharray="2 6" />
            <rect x="486" y="198" width="88" height="24" rx="12" fill="#0A231E" stroke="rgb(242 245 228 / 0.22)" />
            <text x="530" y="214" textAnchor="middle" className="sc-why__m">MIRROR</text>
          </motion.g>
          <motion.g initial={false} animate={{ y: beat >= 1 ? 0 : -60, opacity: beat >= 1 ? 1 : 0 }} transition={calm ? { duration: 0 } : { duration: 0.7, ease: EASE }}>
            <Row y={330} from="Invoca’s own CSM calls" fromSub="QBRs · renewals · check-ins" engine="Signal Loop" to="Signals for Invoca" toSub="PM · VP Product · Sales · Support" tone="accent" show={beat >= 1} delay={0.2} />
          </motion.g>
        </svg>
        <div className="sc-why__stack" aria-hidden="true">
          <div className="sc-why__chain">
            <span>Customers’ calls</span><i>→</i><b>Invoca Signal AI</b><i>→</i><span>Signals for the business</span>
          </div>
          {beat >= 1 && (
            <motion.div className="sc-why__chain sc-why__chain--accent" initial={calm ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.6 }}>
              <span>Invoca’s own CSM calls</span><i>→</i><b>Signal Loop</b><i>→</i><span>PM · VP · Sales · Support</span>
            </motion.div>
          )}
        </div>
      </div>
      {beat >= 2 && (
        <Reveal className="n-col-12 n-row sc-why__chips" delay={0.3}>
          <Reveal.Item><Chip tone="accent" dot>The data already exists</Chip></Reveal.Item>
          <Reveal.Item><Chip tone="accent" dot>Internal, additive, reviewed</Chip></Reveal.Item>
          <Reveal.Item><Chip tone="accent" dot>Value in weeks</Chip></Reveal.Item>
          <Reveal.Item><Chip tone="indigo" dot>A path into Signal AI later</Chip></Reveal.Item>
        </Reveal>
      )}
    </div>
  );
}
