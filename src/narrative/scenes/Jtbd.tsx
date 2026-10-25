/**
 * Part 3 · Jobs to be done. Four persona cards, each showing its job; click (or Enter) to reveal
 * struggles today and the success measure. Beat 1 names the emotional job in the headline.
 */
import { useState } from 'react';
import { PersonaCard, SceneHead, type Persona } from '../components';

const g = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const count = Object.values(flipped).filter(Boolean).length;
  return (
    <div className="sc-jtbd">
      <div className="sc-jtbd__head">
        <SceneHead
          k={beat >= 1 ? 'b1' : 'b0'}
          title={beat >= 1 ? 'Be the advocate, not the stenographer.' : 'Four people. Four jobs.'}
          line={
            beat >= 1
              ? 'The job underneath all four. CSMs keep the relationship and the judgement; the system takes the data entry and makes their advocacy visible.'
              : 'Before any architecture: who hires this system, and for what? Open each card to see what gets in the way.'
          }
        />
        <span className="sc-jtbd__count" aria-live="polite">
          {count} of 4 opened
        </span>
      </div>
      <div className="sc-jtbd__cards">
        {PERSONAS.map((p) => (
          <PersonaCard key={p.id} persona={p} flipped={!!flipped[p.id]} onFlip={() => setFlipped((f) => ({ ...f, [p.id]: !f[p.id] }))} />
        ))}
      </div>
    </div>
  );
}
