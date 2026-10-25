/**
 * Part 2 · Why this option. Invoca turns its customers' calls into signals; the same idea,
 * pointed at Invoca's own CSM calls. Two flat flow rows, then the four reasons.
 */
import { motion } from 'motion/react';
import { Arrow, Check, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { DUR, EASE } from '../motion';

type Row = { who: string; from: { t: string; s: string }; engine: string; to: { t: string; s: string } };

const ROWS: Row[] = [
  { who: 'What Invoca sells', from: { t: 'Customers’ calls', s: 'Inbound calls to Invoca’s customers' }, engine: 'Invoca Signal AI', to: { t: 'Signals for their business', s: 'Conversions, intent, coaching' } },
  { who: 'What I built', from: { t: 'Invoca’s own CSM calls', s: 'Reviews, renewals, check-ins' }, engine: 'Signal Loop', to: { t: 'Signals for Invoca’s teams', s: 'Product, VP Product, Sales, Support' } },
];

const REASONS = ['The data already exists', 'Internal and additive, with people reviewing', 'Shows value in weeks, not quarters', 'A path into Signal AI later'];

function FlowRow({ row, accent, show, delay = 0 }: { row: Row; accent?: boolean; show: boolean; delay?: number }) {
  const calm = useCalm();
  const t = (i: number) => ({ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm || !show ? 0 : delay + i * 0.12 });
  const parts = [
    <div key="from" className="sc-why__box">
      <b>{row.from.t}</b>
      <span>{row.from.s}</span>
    </div>,
    <span key="a1" className="sc-why__arrow" aria-hidden="true"><Arrow /></span>,
    <div key="engine" className="sc-why__box sc-why__box--engine" data-accent={accent ? 'true' : undefined}>
      <b>{row.engine}</b>
    </div>,
    <span key="a2" className="sc-why__arrow" aria-hidden="true"><Arrow /></span>,
    <div key="to" className="sc-why__box">
      <b>{row.to.t}</b>
      <span>{row.to.s}</span>
    </div>,
  ];
  return (
    <div className="sc-why__row" aria-hidden={!show}>
      <span className="sc-why__who">{row.who}</span>
      <div className="sc-why__flow">
        {parts.map((p, i) => (
          <motion.div key={i} className="sc-why__cell" initial={false} animate={{ opacity: show ? 1 : 0, x: show || calm ? 0 : -4 }} transition={t(i)}>
            {p}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function Why({ beat }: { beat: number }) {
  const calm = useCalm();
  return (
    <div className="sc-why">
      <SceneHead
        k={beat >= 2 ? 'b2' : 'b0'}
        title={beat < 2 ? 'Invoca already turns calls into signals.' : 'The same idea, pointed inward.'}
        line={
          beat < 2
            ? 'For its customers, every inbound call becomes a conversion, an intent or a coaching moment. This option asks for the same discipline on Invoca’s own customer conversations.'
            : 'I chose the feedback loop because it uses data Invoca already has, carries little risk, and can prove itself quickly.'
        }
      />
      <div className="sc-why__rows" role="img" aria-label="Top: customers’ calls go through Invoca Signal AI and become signals for their business. Below, the same shape: Invoca’s own CSM calls go through Signal Loop and become signals for Product, Sales and Support.">
        <FlowRow row={ROWS[0]!} show />
        <FlowRow row={ROWS[1]!} accent show={beat >= 1} delay={0.05} />
      </div>
      <ul className="sc-why__reasons" aria-hidden={beat < 2}>
        {REASONS.map((r, i) => (
          <motion.li key={r} initial={false} animate={{ opacity: beat >= 2 ? 1 : 0, y: beat >= 2 || calm ? 0 : 4 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: beat >= 2 && !calm ? 0.1 + i * 0.08 : 0 }}>
            <span className="sc-why__check"><Check /></span>
            {r}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
