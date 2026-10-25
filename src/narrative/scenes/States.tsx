/**
 * 04 · Current → future state. Animated swimlane: show the relay (beat 0), reveal the leaks
 * dripping at each handoff (1), morph into the future state as leaks seal (2), close the
 * loop back to the CSM and the customer (3).
 */
import { motion, AnimatePresence } from 'motion/react';
import { Display, Lede, Reveal, Stat } from '../components';
import { useCalm } from '../hooks';
import { EASE } from '../motion';

const W = 1280;
const H = 600;
const LANES_NOW = ['Customer', 'CSM', 'Notes & CRM', 'Product', 'Leadership'];
const LANES_NEXT = ['Customer', 'CSM', 'Signal Loop', 'Product', 'Leadership'];
const LANE_Y = [70, 180, 290, 400, 510];
const BW = 150;
const BH = 50;

type NodeDef = { id: string; lane: number; x: number; now: string; next: string; nx?: number };
const NODES: NodeDef[] = [
  { id: 'customer', lane: 0, x: 270, now: 'Says it on a call', next: 'Says it on a call' },
  { id: 'csm', lane: 1, x: 450, now: 'Hears it', next: 'Stays in the room', nx: 440 },
  { id: 'capture', lane: 2, x: 630, now: 'Types notes, later', next: 'Captured + quoted', nx: 610 },
  { id: 'route', lane: 2, x: 810, now: 'Maybe posts in Slack', next: 'Grounded, routed', nx: 790 },
  { id: 'pm', lane: 3, x: 990, now: 'Maybe sees it', next: 'Ticket, quote, ARR', nx: 975 },
  { id: 'vp', lane: 4, x: 1165, now: 'Hears it at renewal', next: 'Theme across accounts', nx: 1160 },
];

const LEAKS = [
  { now: 'Said once, never written down', next: 'Recorded and transcribed' },
  { now: 'Retyped later, half remembered', next: 'Extracted with a verbatim quote' },
  { now: 'Lost in a notes field', next: 'Grounded and scored' },
  { now: 'Slack thread scrolls away', next: 'Routed by an editable rule' },
  { now: 'No theme, no ARR, no trend', next: 'Themed with ARR attached' },
];

const nodeX = (n: NodeDef, future: boolean) => (future && n.nx ? n.nx : n.x);
const ny = (n: NodeDef) => LANE_Y[n.lane]!;

function seg(a: NodeDef, b: NodeDef, future: boolean) {
  const ax = nodeX(a, future) + BW / 2;
  const ay = ny(a);
  const bx = nodeX(b, future) - BW / 2;
  const by = ny(b);
  const dx = (bx - ax) * 0.55;
  return { d: `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`, mx: (ax + bx) / 2, my: (ay + by) / 2 };
}

const LOOP_D = 'M 975 430 C 975 600, 300 610, 300 430 C 300 300, 330 205, 365 192';

function Swimlane({ beat }: { beat: number }) {
  const calm = useCalm();
  const future = beat >= 2;
  const leaks = beat >= 1;
  const loop = beat >= 3;
  const tr = (d = 0.7, delay = 0) => (calm ? { duration: 0 } : { duration: d, ease: EASE, delay });
  const lanes = future ? LANES_NEXT : LANES_NOW;
  return (
    <svg className="sc-states__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={future ? 'Future state: each handoff is sealed by the system, and the loop closes back to the CSM and the customer.' : 'Current state: a relay of handoffs from customer to CSM to notes, Slack, product and leadership, leaking at every step.'}>
      <defs>
        <filter id="st-glow" filterUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="st-lane-accent" x1="0" x2="1">
          <stop offset="0" stopColor="#8EE58E" stopOpacity="0.14" />
          <stop offset="1" stopColor="#8EE58E" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* lanes */}
      {LANE_Y.map((y, i) => {
        const sys = i === 2 && future;
        return (
          <g key={i}>
            <motion.rect x="0" y={y - 52} width={W} height="104" rx="0" initial={false} animate={{ opacity: sys ? 1 : 0 }} transition={tr(0.6)} fill="url(#st-lane-accent)" />
            <line x1="0" x2={W} y1={y + 52} y2={y + 52} stroke="rgb(242 245 228 / 0.08)" />
            <text x="20" y={y + 4} className="sc-states__lane" fill={sys ? '#8EE58E' : 'rgb(242 245 228 / 0.48)'}>
              {lanes[i]!.toUpperCase()}
            </text>
          </g>
        );
      })}
      {/* connectors */}
      {NODES.slice(0, -1).map((a, i) => {
        const b = NODES[i + 1]!;
        const s = seg(a, b, future);
        return (
          <motion.path
            key={a.id}
            initial={{ pathLength: 0, d: seg(a, b, false).d }}
            animate={{ pathLength: 1, d: s.d, stroke: future ? '#8EE58E' : 'rgb(242 245 228 / 0.42)' }}
            transition={calm ? { duration: 0 } : { pathLength: { duration: 0.5, delay: 0.3 + i * 0.15, ease: EASE }, d: { duration: 0.7, ease: EASE }, stroke: { duration: 0.6 } }}
            fill="none"
            strokeWidth={future ? 2 : 1.5}
            strokeDasharray={future ? '0' : '5 6'}
            filter={future ? 'url(#st-glow)' : undefined}
          />
        );
      })}
      {/* leaks / seals */}
      {NODES.slice(0, -1).map((a, i) => {
        const s = seg(a, NODES[i + 1]!, future);
        const leak = LEAKS[i]!;
        const sameLane = a.lane === NODES[i + 1]!.lane;
        const lx = sameLane ? s.mx : s.mx + 16;
        const ly = sameLane ? s.my + 46 : s.my + 4;
        const anchor = sameLane ? 'middle' : 'start';
        return (
          <g key={`leak-${i}`}>
            <AnimatePresence>
              {leaks && !future && !calm &&
                [0, 1].map((k) => (
                  <motion.circle
                    key={k}
                    cx={s.mx}
                    r={3.2}
                    fill="#FF9C8C"
                    initial={{ cy: s.my, opacity: 0 }}
                    animate={{ cy: [s.my, s.my + 40], opacity: [0, 1, 0] }}
                    exit={{ opacity: 0, transition: { duration: 0.15, repeat: 0 } }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22 + k * 0.7, ease: 'easeIn' }}
                  />
                ))}
            </AnimatePresence>
            <motion.g initial={false} animate={{ opacity: leaks ? 1 : 0 }} transition={tr(0.5, leaks && !future ? 0.15 * i : 0)}>
              <motion.circle cx={s.mx} cy={s.my} r={future ? 9 : 6} initial={false} animate={{ cx: s.mx, cy: s.my, fill: future ? '#8EE58E' : '#0A231E', stroke: future ? '#8EE58E' : '#FF9C8C' }} transition={tr(0.6)} strokeWidth={1.5} />
              {future && <motion.path d={`M ${s.mx - 4} ${s.my} l 3 3 l 5 -6`} stroke="#062018" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={tr(0.4, 0.3 + i * 0.08)} />}
              <motion.g initial={false} animate={{ x: lx, y: ly }} transition={tr(0.6)}>
                <text x={0} y={0} textAnchor={anchor} className="sc-states__leak" fill={future ? '#D1FFD1' : '#FF9C8C'}>
                  {future ? leak.next : leak.now}
                </text>
              </motion.g>
            </motion.g>
          </g>
        );
      })}
      {/* nodes */}
      {NODES.map((n, i) => {
        const x = nodeX(n, future);
        const y = ny(n);
        const sys = future && n.lane === 2;
        return (
          <motion.g key={n.id} initial={calm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tr(0.5, 0.1 + i * 0.08)}>
            <motion.rect
              initial={false}
              animate={{ x: x - BW / 2, fill: sys ? 'rgb(142 229 142 / 0.16)' : '#0E2C26', stroke: sys ? '#8EE58E' : 'rgb(242 245 228 / 0.2)' }}
              transition={tr(0.7)}
              y={y - BH / 2}
              width={BW}
              height={BH}
              rx={12}
            />
            <motion.text initial={false} animate={{ x }} transition={tr(0.7)} y={y + 5} textAnchor="middle" className="sc-states__node" fill={sys ? '#D1FFD1' : '#F2F5E4'}>
              {future ? n.next : n.now}
            </motion.text>
          </motion.g>
        );
      })}
      {/* return leg */}
      <motion.text x={270} y={128} textAnchor="middle" className="sc-states__leak" initial={false} animate={{ opacity: leaks && !loop ? 1 : 0, fill: '#FF9C8C' }} transition={tr(0.4)}>
        {future ? '' : 'Never hears back'}
      </motion.text>
      <motion.path d={LOOP_D} fill="none" stroke="#8EE58E" strokeWidth={2} strokeDasharray="6 6" filter="url(#st-glow)" initial={false} animate={{ pathLength: loop ? 1 : 0, opacity: loop ? 1 : 0 }} transition={tr(0.9)} />
      {loop && (
        <>
          <motion.path d="M 365 160 C 330 140, 300 120, 290 96" fill="none" stroke="#8EE58E" strokeWidth={2} strokeDasharray="6 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={tr(0.5, 0.8)} />
          {!calm && (
            <circle r={5} fill="#D1FFD1" filter="url(#st-glow)">
              <animateMotion dur="2.6s" repeatCount="indefinite" path={LOOP_D} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.65 0 0.35 1" />
            </circle>
          )}
          <motion.g initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={tr(0.5, 0.9)}>
            <rect x={430} y={558} width={420} height={32} rx={16} fill="#0A231E" stroke="#8EE58E" />
            <text x={640} y={579} textAnchor="middle" className="sc-states__loop">SHIPPED → CSM NOTIFIED → CUSTOMER HEARS BACK</text>
          </motion.g>
        </>
      )}
    </svg>
  );
}

const HEAD = [
  { h: <>Today it’s a relay race with <em>no baton.</em></>, l: 'Five handoffs between what a customer says on a call and what a VP hears. Each depends on someone remembering.' },
  { h: <>Every handoff <em>leaks.</em></>, l: 'Nobody is careless. Each step is manual, optional and invisible, so the signal thins out at every one.' },
  { h: <>Seal the leaks with <em>systems,</em> not heroics.</>, l: 'Capture from the call, quote verbatim, ground in code, route by rule, theme by similarity. The CSM stays in the room.' },
  { h: <>Then close the <em>loop.</em></>, l: 'When it ships, the CSM hears first, with a drafted note for the customer. That’s what makes CSMs keep feeding it.' },
];

export function States({ beat }: { beat: number }) {
  const b = Math.min(beat, 3);
  const calm = useCalm();
  return (
    <div className="n-grid sc-states">
      <div className="n-col-7 sc-states__head">
        <AnimatePresence mode="wait">
          <Reveal key={b} className="n-stack">
            <Reveal.Item>
              <Display size="md" as="h2">
                {HEAD[b]!.h}
              </Display>
            </Reveal.Item>
            <Reveal.Item>
              <Lede>{HEAD[b]!.l}</Lede>
            </Reveal.Item>
          </Reveal>
        </AnimatePresence>
      </div>
      <div className="n-col-5 sc-states__stat">
        <AnimatePresence mode="wait">
          {b === 1 && (
            <motion.div key="leak" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.4 }}>
              <Stat value={6} label="leaks between a call and a decision" note="including the one back to the customer" />
            </motion.div>
          )}
          {b >= 2 && (
            <motion.div key="seal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.4 }}>
              <Stat value={0} label="fields the CSM retypes" tone="accent" note="the relationship and the judgement stay with the CSM" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="n-col-12 sc-states__lane-wrap">
        <Swimlane beat={b} />
        <ol className="sc-states__list" aria-hidden="true">
          {NODES.map((n, i) => (
            <li key={n.id} data-future={b >= 2}>
              <b>{b >= 2 ? LANES_NEXT[n.lane] : LANES_NOW[n.lane]}</b>
              <span>{b >= 2 ? n.next : n.now}</span>
              {i < LEAKS.length && b >= 1 && <em>{b >= 2 ? `✓ ${LEAKS[i]!.next}` : `↓ ${LEAKS[i]!.now}`}</em>}
            </li>
          ))}
          {b >= 3 && (
            <li data-future>
              <b>Loop</b>
              <span>Shipped → CSM notified → customer hears back</span>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
