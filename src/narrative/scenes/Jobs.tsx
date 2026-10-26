/**
 * Chapter 2 · Jobs to be done, today and tomorrow. Everything on one screen: the four people
 * Signal Loop works for and the job each hires it to do (wording from the write-up's Part 1,
 * src/shared/writeup/content.ts), the CSM's underlying job, then today's workflow beside
 * tomorrow's as two step-by-step rows.
 */
import { IconArrowRight, IconBarChart, IconBolt, IconLayers, IconMessage } from '../../ds/icons';
import type { ReactNode } from 'react';
import { Enter, SceneHead } from '../components';

const PEOPLE: { role: string; icon: ReactNode; job: string }[] = [
  { role: 'CSM', icon: <IconMessage size={16} />, job: 'When a customer tells me something the product team should hear, I want it captured and tracked without retyping it, so I can stay present on the call.' },
  { role: 'Product Manager', icon: <IconLayers size={16} />, job: 'When I plan next quarter, I want real evidence grouped by theme, with ARR attached, so I can prioritise on signal, not volume.' },
  { role: 'VP Product', icon: <IconBarChart size={16} />, job: 'When renewals or competitive pressure shift, I want an honest view across every account, so I can make and defend the call.' },
  { role: 'Sales, competitive and support leads', icon: <IconBolt size={16} />, job: 'When a competitor, a pricing objection or a repeat bug comes up, I want it in my channel the same day.' },
];

const TODAY = ['A customer says it on a call', 'Maybe the CSM writes it down', 'Maybe it lands in Slack', 'It’s lost'];
const TOMORROW = ['The call comes in', 'Signal Loop reads it', 'An insight with a checked quote', 'The owner gets it in their own tool', 'The CSM hears when it ships'];

function Flow({ label, steps, tone, testId }: { label: string; steps: string[]; tone: 'today' | 'tomorrow'; testId: string }) {
  return (
    <div className="sc-jobs__flow" data-tone={tone} data-testid={testId}>
      <span className="sc-jobs__flowlabel">{label}</span>
      <ol className="sc-jobs__steps">
        {steps.map((s, i) => (
          <li key={s} data-last={i === steps.length - 1 ? 'true' : undefined}>
            <span className="sc-jobs__step">{s}</span>
            {i < steps.length - 1 ? <IconArrowRight size={14} className="sc-jobs__arrow" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Jobs() {
  return (
    <div className="sc sc-jobs">
      <SceneHead title="Four people, four jobs." line="Before any architecture: who needs this, and what for. Then how the work goes today, and how it goes with Signal Loop." />
      <ul className="sc-jobs__people" data-testid="jobs-people">
        {PEOPLE.map((p, i) => (
          <Enter as="li" key={p.role} delay={0.04 + i * 0.06} className="sc-jobs__person">
            <span className="sc-jobs__who">
              <span className="sc-jobs__icon" aria-hidden="true">
                {p.icon}
              </span>
              <b>{p.role}</b>
            </span>
            <p>{p.job}</p>
          </Enter>
        ))}
      </ul>
      <Enter delay={0.3} className="sc-jobs__core">
        <b>The job under all four: be the advocate, not the note-taker.</b> CSMs keep the relationship and the judgement. The system does the data entry.
      </Enter>
      <Enter as="section" delay={0.4} className="sc-jobs__flows" attrs={{ 'aria-label': 'Today and tomorrow' }}>
        <Flow label="Today" steps={TODAY} tone="today" testId="jobs-today" />
        <Flow label="With Signal Loop" steps={TOMORROW} tone="tomorrow" testId="jobs-tomorrow" />
      </Enter>
    </div>
  );
}
