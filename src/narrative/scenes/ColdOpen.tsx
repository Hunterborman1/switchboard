/**
 * 00 · Cold open. A live waveform (a call, in progress) resolves into the Signal Loop mark
 * and the line "Every call is a signal."
 */
import { motion, AnimatePresence } from 'motion/react';
import { useMemo } from 'react';
import { Chip, Display, Lede, Reveal } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

const BARS = 72;

function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function Waveform({ resolved, bars = BARS, height = 220 }: { resolved: boolean; bars?: number; height?: number }) {
  const calm = useCalm();
  const amps = useMemo(
    () =>
      Array.from({ length: bars }, (_, i) => {
        const env = Math.sin((i / (bars - 1)) * Math.PI); // speech envelope
        return 0.12 + env * (0.35 + seeded(i) * 0.65);
      }),
    [bars],
  );
  return (
    <svg viewBox={`0 0 ${bars * 10} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="wf-g" x1="0" x2="1">
          <stop offset="0" stopColor="#F2F5E4" stopOpacity="0.15" />
          <stop offset="0.5" stopColor="#8EE58E" stopOpacity="1" />
          <stop offset="1" stopColor="#F2F5E4" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {amps.map((a, i) => {
        const h = a * height * 0.9;
        const centre = i === Math.floor(bars / 2);
        return (
          <motion.rect
            key={i}
            x={i * 10 + 3}
            width={4}
            rx={2}
            fill={centre && resolved ? '#8EE58E' : 'url(#wf-g)'}
            initial={false}
            animate={
              resolved
                ? { y: height / 2 - 1, height: 2, opacity: centre ? 0 : 0.16 }
                : calm
                  ? { y: height / 2 - h / 2, height: h, opacity: 1 }
                  : { y: [height / 2 - h / 2, height / 2 - (h * 0.35) / 2, height / 2 - h / 2], height: [h, h * 0.35, h], opacity: 1 }
            }
            transition={
              resolved
                ? { duration: calm ? 0 : 0.7, ease: EASE, delay: calm ? 0 : Math.abs(i - bars / 2) * 0.006 }
                : calm
                  ? { duration: 0 }
                  : { duration: 0.9 + seeded(i + 7) * 0.9, repeat: Infinity, ease: 'easeInOut', delay: seeded(i + 3) * 0.8 }
            }
          />
        );
      })}
    </svg>
  );
}

export function LoopMark({ size = 120, draw = true }: { size?: number; draw?: boolean }) {
  const calm = useCalm();
  const t = (d: number, delay = 0) => (calm ? { duration: 0 } : { duration: d, ease: EASE, delay });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="lm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.circle cx="60" cy="60" r="50" fill="none" stroke="rgb(242 245 228 / 0.22)" strokeWidth="2" initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={t(1.1)} />
      <motion.path
        d="M60 10 A50 50 0 0 1 108 46"
        fill="none"
        stroke="#8EE58E"
        strokeWidth="3"
        strokeLinecap="round"
        filter="url(#lm-glow)"
        initial={draw ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={t(0.7, 0.5)}
      />
      <motion.circle cx="108" cy="46" r="5" fill="#8EE58E" filter="url(#lm-glow)" initial={draw ? { scale: 0 } : false} animate={{ scale: 1 }} transition={t(0.4, 1.1)} style={{ transformOrigin: '108px 46px' }} />
      {[
        [36, 6],
        [48, 22],
        [60, 34],
        [72, 18],
        [84, 10],
      ].map(([x, h], i) => (
        <motion.line
          key={x}
          x1={x}
          x2={x}
          y1={60 - (h ?? 0)}
          y2={60 + (h ?? 0)}
          stroke="#F2F5E4"
          strokeWidth="4"
          strokeLinecap="round"
          initial={draw ? { scaleY: 0 } : false}
          animate={{ scaleY: 1 }}
          transition={t(0.5, 0.25 + i * 0.07)}
          style={{ transformOrigin: `${x}px 60px` }}
        />
      ))}
    </svg>
  );
}

export function ColdOpen({ beat }: { beat: number }) {
  const resolved = beat >= 1;
  return (
    <div className="sc-cold">
      <div className="sc-cold__wave">
        <Waveform resolved={resolved} />
        <AnimatePresence>
          {!resolved && (
            <motion.div className="sc-cold__meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(6px)' }} transition={{ duration: 0.5 }}>
              <span className="n-chip n-chip--accent">
                <span className="n-chip__dot" /> Recording
              </span>
              <span className="n-label">QBR · Brightline Home Services · 00:41:12</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        {!resolved ? (
          <Reveal key="pre" className="sc-cold__pre" delay={0.4}>
            <Reveal.Item>
              <p className="n-kicker" style={{ fontSize: 'var(--n-display-sm)' }}>
                Thirteen minutes of a QBR. Somewhere in here is a roadmap decision.
              </p>
            </Reveal.Item>
          </Reveal>
        ) : (
          <Reveal key="post" className="sc-cold__post" delay={0.35} each={0.12}>
            <Reveal.Item>
              <LoopMark />
            </Reveal.Item>
            <Reveal.Item>
              <Display size="xl">
                Every call is a <em>signal.</em>
              </Display>
            </Reveal.Item>
            <Reveal.Item>
              <Lede style={{ marginInline: 'auto', textAlign: 'center' }}>
                Signal Loop turns what customers tell Invoca’s CSMs into routed, evidence-backed product insight, and runs like any production agent should: owned, measured, observable.
              </Lede>
            </Reveal.Item>
            <Reveal.Item>
              <div className="n-row" style={{ justifyContent: 'center' }}>
                <Chip>Option 3 · The feedback loop architect</Chip>
                <Chip tone="accent">Built and operated by Hunter Borman</Chip>
              </div>
            </Reveal.Item>
          </Reveal>
        )}
      </AnimatePresence>
    </div>
  );
}
