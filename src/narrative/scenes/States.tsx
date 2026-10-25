/**
 * Part 4 · Today and tomorrow (current → future state). A flat swimlane. Beat 0: the relay of handoffs.
 * Beat 1: a leak marker appears at each handoff, one after another. Beat 2: Signal Loop
 * takes the middle lane and every leak becomes a check. Beat 3: the loop closes back to the
 * CSM and the customer.
 */
import { motion } from 'motion/react';
import { Check, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

const W = 1120;
const LANE_H = 80;
const LANES_NOW = ['Customer', 'CSM', 'Notes and Slack', 'Product', 'Leadership'];
const LANES_NEXT = ['Customer', 'CSM', 'Signal Loop', 'Product', 'Leadership'];
const LABEL_W = 132;
const BW = 156;
const BH = 40;
const H = LANES_NOW.length * LANE_H + 64;
const laneY = (i: number) => i * LANE_H + LANE_H / 2;

/** `who` names the actor on the phone layout, where there are no lanes (two nodes share a lane). */
type NodeDef = { id: string; lane: number; x: number; now: string; next: string; whoNow: string; whoNext: string };
/*
 * x positions leave room for every handoff label to sit just right of its marker. The one
 * same-lane handoff (capture → route) has its marker right after the first box, so its label
 * reads exactly like the others.
 */
const NODES: NodeDef[] = [
  { id: 'customer', lane: 0, x: 240, now: 'Says it on a call', next: 'Says it on a call', whoNow: 'Customer', whoNext: 'Customer' },
  { id: 'csm', lane: 1, x: 390, now: 'Hears it', next: 'Stays on the call', whoNow: 'CSM', whoNext: 'CSM' },
  { id: 'capture', lane: 2, x: 550, now: 'Types notes later', next: 'Captures the quote', whoNow: 'Notes and CRM', whoNext: 'Signal Loop: capture' },
  { id: 'route', lane: 2, x: 900, now: 'Maybe posts in Slack', next: 'Sends it to the owner', whoNow: 'Slack', whoNext: 'Signal Loop: routing' },
  { id: 'pm', lane: 3, x: 990, now: 'Maybe sees it', next: 'Ticket with the quote', whoNow: 'Product', whoNext: 'Product' },
  { id: 'vp', lane: 4, x: 1040, now: 'Hears at renewal', next: 'Sees the pattern', whoNow: 'Leadership', whoNext: 'Leadership' },
];
const [CUSTOMER, CSM_NODE, , , , VP] = NODES as [NodeDef, NodeDef, NodeDef, NodeDef, NodeDef, NodeDef];

const LEAKS = [
  { now: 'Never written down', next: 'Recorded and transcribed' },
  { now: 'Half remembered', next: 'Quoted word for word' },
  { now: 'Lost in a notes field', next: 'Checked against the call' },
  { now: 'Scrolls away in Slack', next: 'Routed by an editable rule' },
  { now: 'No pattern, no revenue', next: 'Grouped with revenue' },
];

/**
 * Connector from node a to node b: down out of a, then across into b (or straight across in
 * the same lane). The marker sits where the handoff happens: on the lane boundary, or in the
 * gap between two nodes in the same lane.
 */
function seg(a: NodeDef, b: NodeDef) {
  const ay = laneY(a.lane);
  const by = laneY(b.lane);
  const bl = b.x - BW / 2;
  if (a.lane === b.lane) {
    const ax = a.x + BW / 2;
    return { d: `M ${ax} ${ay} H ${bl - 2}`, mx: ax + 18, my: ay, same: true };
  }
  const r = 8;
  const ax = Math.min(a.x, bl - 24);
  return { d: `M ${ax} ${ay + BH / 2} V ${by - r} Q ${ax} ${by} ${ax + r} ${by} H ${bl - 2}`, mx: ax, my: ay + LANE_H / 2, same: false };
}

const LOOP_Y = LANES_NOW.length * LANE_H + 30;
const LOOP_X = LABEL_W + 18;
const LOOP_D = `M ${VP.x} ${laneY(4) + BH / 2} V ${LOOP_Y - 10} Q ${VP.x} ${LOOP_Y} ${VP.x - 10} ${LOOP_Y} H ${LOOP_X + 10} Q ${LOOP_X} ${LOOP_Y} ${LOOP_X} ${LOOP_Y - 10} V ${laneY(0) + 10} Q ${LOOP_X} ${laneY(0)} ${LOOP_X + 10} ${laneY(0)} H ${CUSTOMER.x - BW / 2 - 3}`;
const LOOP_CSM = `M ${CSM_NODE.x - 50} ${LOOP_Y} V ${laneY(1) + BH / 2 + 3}`;

function Swimlane({ beat }: { beat: number }) {
  const calm = useCalm();
  const future = beat >= 2;
  const leaks = beat >= 1;
  const loop = beat >= 3;
  const t = (d: number = DUR.layout, delay = 0) => (calm ? { duration: 0 } : { duration: d, ease: EASE, delay });
  const lanes = future ? LANES_NEXT : LANES_NOW;
  return (
    <svg className="sc-states__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={future ? 'Future state: Signal Loop sits between the CSM and the owners, and every handoff is checked. When something ships, the CSM and the customer hear back.' : 'Current state: a relay of handoffs from the customer to the CSM, notes, Slack, product and leadership, losing information at every step.'}>
      <defs>
        <marker id="st-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {/* lanes */}
      {LANES_NOW.map((_, i) => {
        const y = laneY(i);
        const sys = i === 2 && future;
        return (
          <g key={i}>
            <rect x={0} y={y - LANE_H / 2} width={W} height={LANE_H} fill={i % 2 ? '#FFFFFF' : '#F7F8F7'} />
            <motion.rect x={0} y={y - LANE_H / 2} width={W} height={LANE_H} fill="#E8F4EF" initial={false} animate={{ opacity: sys ? 1 : 0 }} transition={t(DUR.layout)} />
            <text x={16} y={y + 5} className="sc-states__lane" data-sys={sys ? 'true' : undefined}>
              {lanes[i]}
            </text>
          </g>
        );
      })}
      <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={LANES_NOW.length * LANE_H} stroke="#E3E6E3" />
      {/* connectors */}
      {NODES.slice(0, -1).map((a, i) => {
        const s = seg(a, NODES[i + 1]!);
        return <motion.path key={a.id} d={s.d} fill="none" strokeWidth={1.5} markerEnd="url(#st-arrow)" initial={false} animate={{ stroke: future ? '#008463' : '#9AA39E' }} transition={t(DUR.layout)} />;
      })}
      {/* nodes */}
      {NODES.map((n) => {
        const y = laneY(n.lane);
        const sys = future && n.lane === 2;
        return (
          <g key={n.id}>
            <motion.rect x={n.x - BW / 2} y={y - BH / 2} width={BW} height={BH} rx={6} initial={false} animate={{ fill: sys ? '#008463' : '#FFFFFF', stroke: sys ? '#008463' : '#CDD2CD' }} transition={t(DUR.layout)} />
            <text x={n.x} y={y + 4.5} textAnchor="middle" className="sc-states__node" data-sys={sys ? 'true' : undefined}>
              {future ? n.next : n.now}
            </text>
          </g>
        );
      })}
      {/* leaks, then checks */}
      {NODES.slice(0, -1).map((a, i) => {
        const b = NODES[i + 1]!;
        const s = seg(a, b);
        const leak = LEAKS[i]!;
        // Every label sits just right of its marker; on the same-lane handoff it rides just above the line.
        const lx = s.mx + 14;
        const ly = s.same ? s.my - 7 : s.my + 4;
        return (
          <motion.g key={`leak-${i}`} initial={false} animate={{ opacity: leaks ? 1 : 0 }} transition={t(DUR.ui, leaks && !future && !calm ? 0.1 + i * 0.12 : 0)}>
            <circle cx={s.mx} cy={s.my} r={8} fill={future ? '#008463' : '#FFFFFF'} stroke={future ? '#008463' : '#B42318'} strokeWidth={1.5} />
            {future ? (
              <path d={`M ${s.mx - 3.5} ${s.my + 0.5} l 2.5 2.5 l 4.5 -5`} stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d={`M ${s.mx - 3} ${s.my - 3} l 6 6 M ${s.mx + 3} ${s.my - 3} l -6 6`} stroke="#B42318" strokeWidth={1.6} strokeLinecap="round" />
            )}
            <text x={lx} y={ly} className="sc-states__leak" data-future={future ? 'true' : undefined}>
              {future ? leak.next : leak.now}
            </text>
          </motion.g>
        );
      })}
      {/* the sixth leak: nobody tells the customer */}
      <motion.text x={CUSTOMER.x + BW / 2 + 16} y={laneY(0) + 4.5} className="sc-states__leak" initial={false} animate={{ opacity: leaks && !future ? 1 : 0 }} transition={t(DUR.ui, leaks && !future && !calm ? 0.7 : 0)}>
        Customer never hears back
      </motion.text>
      {/* the loop closes */}
      <motion.path d={LOOP_D} fill="none" stroke="#008463" strokeWidth={1.5} markerEnd="url(#st-arrow)" initial={false} animate={{ pathLength: loop ? 1 : 0, opacity: loop ? 1 : 0 }} transition={calm ? { duration: 0 } : { pathLength: { duration: DUR.data, ease: EASE }, opacity: { duration: DUR.press } }} />
      <motion.path d={LOOP_CSM} fill="none" stroke="#008463" strokeWidth={1.5} markerEnd="url(#st-arrow)" initial={false} animate={{ opacity: loop ? 1 : 0 }} transition={t(DUR.ui, loop && !calm ? 0.45 : 0)} />
      <motion.g initial={false} animate={{ opacity: loop ? 1 : 0 }} transition={t(DUR.ui, loop && !calm ? 0.5 : 0)}>
        <rect x={W / 2 - 230} y={LOOP_Y - 15} width={460} height={30} rx={6} fill="#FFFFFF" stroke="#008463" />
        <text x={W / 2} y={LOOP_Y + 5} textAnchor="middle" className="sc-states__loop">
          When it ships, the CSM is told and the customer hears back
        </text>
      </motion.g>
    </svg>
  );
}

const HEAD = [
  { h: 'Today it’s a relay race with no baton.', l: 'Five handoffs sit between what a customer says on a call and what a VP hears. Each one depends on someone remembering.' },
  { h: 'Every handoff leaks.', l: 'Nobody is careless. Each step is manual, optional and invisible, so six things go missing between the call and a decision.' },
  { h: 'Seal the leaks with a system, not heroics.', l: 'Capture from the call, keep the exact quote, check it against the transcript, route it by rule, group it into themes. The CSM retypes nothing.' },
  { h: 'Then close the loop.', l: 'When it ships, the CSM hears first, with a drafted note for the customer. That’s what keeps CSMs feeding it.' },
];

export function States({ beat }: { beat: number }) {
  const b = Math.min(beat, 3);
  return (
    <div className="sc-states">
      <SceneHead k={b} title={HEAD[b]!.h} line={HEAD[b]!.l} />
      <div className="sc-states__lane-wrap">
        <Swimlane beat={b} />
        <ol className="sc-states__list" aria-hidden="true">
          {NODES.map((n, i) => (
            <li key={n.id} data-future={b >= 2}>
              <b>{b >= 2 ? n.whoNext : n.whoNow}</b>
              <span>{b >= 2 ? n.next : n.now}</span>
              {i < LEAKS.length && b >= 1 && (
                <em>
                  {b >= 2 ? <Check size={12} /> : '×'} {b >= 2 ? LEAKS[i]!.next : LEAKS[i]!.now}
                </em>
              )}
            </li>
          ))}
          {b >= 3 && (
            <li data-future>
              <b>Back to the CSM</b>
              <span>When it ships, the CSM is told and the customer hears back</span>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
