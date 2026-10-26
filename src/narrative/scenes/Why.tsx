/**
 * Part 3 · Why this option. Invoca turns its customers' calls into signals; the same idea,
 * pointed at Invoca's own CSM calls. Two flow rows that share a shape (the second arrives on
 * beat 1, label and all), then the four reasons and one line on where it generalises.
 */
import { ProductMark } from '../../ds';
import { Appear, Arrow, Check, SceneHead } from '../components';

type Row = { who: string; from: { t: string; s: string }; engine: string; to: { t: string; s: string } };

const ROWS: Row[] = [
  { who: 'What Invoca sells', from: { t: 'Customers’ calls', s: 'Inbound calls to Invoca’s customers' }, engine: 'Invoca Signal AI', to: { t: 'Signals for their business', s: 'Conversions, intent, coaching' } },
  { who: 'What I built', from: { t: 'Invoca’s own CSM calls', s: 'Reviews, renewals, check-ins' }, engine: 'Signal Loop', to: { t: 'Signals for Invoca’s teams', s: 'Product, VP Product, Sales, Support' } },
];

const REASONS = ['The data already exists', 'Internal and additive, with people reviewing', 'Shows value in weeks, not quarters', 'A path into Signal AI later'];

const HEADS = [
  { title: 'Invoca already turns calls into signals.', line: 'For its customers, every inbound call becomes a conversion, an intent or a coaching moment.' },
  { title: 'The same idea, pointed inward.', line: 'Invoca’s own customer conversations carry the same kind of signal, for Invoca’s own teams.' },
  { title: 'Why I chose the feedback loop.', line: 'It uses data Invoca already has, carries little risk, and can prove itself quickly.' },
];

function FlowRow({ row, built, show, delay = 0 }: { row: Row; built?: boolean; show: boolean; delay?: number }) {
  return (
    <Appear show={show} delay={delay} className="sc-why__row">
      <span className="sc-why__who">{row.who}</span>
      <div className="sc-why__flow">
        <div className="sc-why__box">
          <b>{row.from.t}</b>
          <span>{row.from.s}</span>
        </div>
        <span className="sc-why__arrow" aria-hidden="true">
          <Arrow size={18} />
        </span>
        <div className="sc-why__box sc-why__box--engine" data-built={built ? 'true' : undefined}>
          {built ? <ProductMark product="signal-loop" size={24} /> : null}
          <b>{row.engine}</b>
        </div>
        <span className="sc-why__arrow" aria-hidden="true">
          <Arrow size={18} />
        </span>
        <div className="sc-why__box">
          <b>{row.to.t}</b>
          <span>{row.to.s}</span>
        </div>
      </div>
    </Appear>
  );
}

export function Why({ beat }: { beat: number }) {
  const b = Math.min(beat, 2);
  return (
    <div className="sc sc-why">
      <SceneHead heads={HEADS} active={b} />
      <div className="sc-why__visual">
        <div
          className="sc-why__rows"
          role="img"
          aria-label="Top: customers’ calls go through Invoca Signal AI and become signals for their business. Below, the same shape: Invoca’s own CSM calls go through Signal Loop and become signals for Product, Sales and Support."
        >
          <FlowRow row={ROWS[0]!} show />
          <FlowRow row={ROWS[1]!} built show={b >= 1} delay={0.05} />
        </div>
        <div className="sc-why__why">
          <ul className="sc-why__reasons">
            {REASONS.map((r, i) => (
              <Appear key={r} as="li" show={b >= 2} delay={0.1 + i * 0.08}>
                <Check />
                <span>{r}</span>
              </Appear>
            ))}
          </ul>
          <Appear show={b >= 2} delay={0.45} className="sc-why__general">
            <ProductMark product="switchboard" size={24} />
            <p>
              <b>And it generalises: any conversation in, the right people out.</b> Signal Loop runs inside Switchboard, which can run other analyses the same way.
            </p>
          </Appear>
        </div>
      </div>
    </div>
  );
}
