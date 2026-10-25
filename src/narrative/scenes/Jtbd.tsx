/**
 * 03 · Jobs to be done. Four persona cards; click (or Enter) to flip: job statement,
 * struggles today, success measure. Beat 2 surfaces the emotional job.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Display, Lede, PersonaCard, Reveal, type Persona } from '../components';
import { useCalm } from '../hooks';

const g = (d: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const PERSONAS: Persona[] = [
  {
    id: 'csm',
    role: 'Customer Success Manager',
    who: 'Owns 15–20 accounts · 15+ customer calls a week',
    glyph: g('M4 18v-1a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v1M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 8v6M20 11h-6'),
    job: { when: 'a customer tells me something the product team should hear', want: 'it captured, routed and tracked without retyping it', so: 'stay present in the conversation and show I advocated for them' },
    struggles: ['Rewrites the same note for Salesforce, Slack and Jira', 'Never learns whether anything happened', 'Admin eats the time meant for customers'],
    success: 'No re-entry, and I hear back when my feedback ships.',
    emotional: 'Be the advocate, not the stenographer.',
  },
  {
    id: 'pm',
    role: 'Product Manager',
    who: 'Owns a product area and its roadmap',
    glyph: g('M4 20V10M10 20V4M16 20v-7M22 20H2'),
    job: { when: 'I’m deciding what goes into next quarter', want: 'real customer evidence, grouped by theme, with ARR attached', so: 'prioritise on signal, not on whoever shouted loudest' },
    struggles: ['Forwarded anecdotes with no context', 'Can’t tell one loud account from a pattern', 'Quotes that can’t be traced to a source'],
    success: 'Every roadmap call cites evidence I can click through to.',
  },
  {
    id: 'vp',
    role: 'VP Product',
    who: 'Accountable for the portfolio and its revenue impact',
    glyph: g('M3 17l6-6 4 4 8-8M15 7h6v6'),
    job: { when: 'renewals or competitive pressure start to shift', want: 'an honest view of what customers say, across every account', so: 'make portfolio calls and defend them to the exec team' },
    struggles: ['Learns about churn drivers after the renewal is lost', 'Signal arrives filtered through three layers', 'Snapshots, never a trend'],
    success: 'High-ARR risk reaches me within a day, with the quote attached.',
  },
  {
    id: 'gtm',
    role: 'Sales · Competitive · Support',
    who: 'Pricing, competitive intel and escalation leads',
    glyph: g('M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z'),
    job: { when: 'a competitor, a pricing objection or a repeat bug comes up', want: 'it in my channel the same day, with the account context', so: 'act before it turns into a lost deal or an escalation' },
    struggles: ['Competitive mentions buried in call notes', 'Pricing friction discovered at renewal', 'The same bug reported five different ways'],
    success: 'Right owner, right channel, same day. No triage meeting.',
  },
];

export function Jtbd({ beat }: { beat: number }) {
  const calm = useCalm();
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const count = Object.values(flipped).filter(Boolean).length;
  return (
    <div className="n-grid sc-jtbd">
      <div className="n-col-12 sc-jtbd__head">
        <Reveal className="n-stack">
          <Reveal.Item>
            <Display size="md" as="h2">
              Four people. Four <em>jobs.</em>
            </Display>
          </Reveal.Item>
          <Reveal.Item>
            <div className="n-row n-row--between" style={{ alignItems: 'flex-end' }}>
              <Lede>Before any architecture: who hires this system, and for what? Flip each card.</Lede>
              <span className="n-label" aria-live="polite">
                Flipped <b style={{ color: 'var(--n-accent)', fontWeight: 500 }}>{count}</b> / 4
              </span>
            </div>
          </Reveal.Item>
        </Reveal>
      </div>
      <Reveal className="n-col-12 sc-jtbd__cards" delay={0.2} each={0.1}>
        {PERSONAS.map((p) => (
          <Reveal.Item key={p.id}>
            <PersonaCard persona={p} flipped={!!flipped[p.id]} onFlip={() => setFlipped((f) => ({ ...f, [p.id]: !f[p.id] }))} />
          </Reveal.Item>
        ))}
      </Reveal>
      <AnimatePresence>
        {beat >= 1 && (
          <motion.div
            className="n-col-12 sc-jtbd__emotional"
            initial={calm ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: calm ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="n-label">The emotional job</span>
            <p className="n-display n-display--sm">
              Be the <em>advocate,</em> not the stenographer.
            </p>
            <p className="n-body">CSMs keep the relationship and the judgement. The system takes the data entry and makes their advocacy visible.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
