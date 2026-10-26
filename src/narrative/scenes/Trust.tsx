/**
 * Chapter 9 · Earning trust: rollout and adoption. Three sections side by side (stacked on
 * phones): how it rolls out, how it stays helpful rather than replacing anyone, and why people
 * can trust it. From the old Rollout scene and the Making it real "Roll it out" column; the hours
 * figure is an assumption and says so.
 */
import type { ReactNode } from 'react';
import { Callout } from '../../ds';
import { Check, Enter, SceneHead, Stat } from '../components';

const PHASES = [
  { wk: 'Week 0', name: 'Discovery', line: 'A two-week time study with two CSMs.' },
  { wk: 'Weeks 1–2', name: 'Shadow mode', line: 'Runs on real calls. Nothing is sent.' },
  { wk: 'Weeks 3–6', name: 'Champions', line: 'Two or three CSMs and a PM tune it.' },
  { wk: 'Week 7+', name: 'Whole team', line: 'High stakes stay reviewed. The rest routes.' },
];

const HELPFUL = [
  'The CSM stays the advocate, not the note-taker.',
  'When feedback ships, the credit goes back to the CSM.',
  'It drafts the note to the customer. The CSM edits it and sends it.',
  'People make the high-stakes calls. Churn risk and severe bugs always wait for review.',
];

const TRUST = [
  'Every quote is checked against the call.',
  'Anything uncertain waits for a person, with the reason.',
  'Every decision is logged, with who made it.',
  'A new prompt ships only if it passes the evals.',
  'A hard spend cap, then replay.',
  'Adoption is measured from usage, not surveys.',
];

function Section({ delay, title, children, testId }: { delay: number; title: string; children: ReactNode; testId: string }) {
  return (
    <Enter as="section" delay={delay} className="sc-prod__col" attrs={{ 'aria-label': title, 'data-testid': testId }}>
      <h2 className="sc-prod__title">{title}</h2>
      {children}
    </Enter>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="sc-built__checks sc-hood__list">
      {items.map((t) => (
        <li key={t}>
          <Check />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function Trust() {
  return (
    <div className="sc sc-trust">
      <SceneHead title="Earning trust." line="Roll it out in steps. Make the CSM’s day easier, not their job smaller. Give people reasons to trust it." />
      <div className="sc-prod__grid">
        <Section delay={0.04} title="Roll it out" testId="trust-rollout">
          <ol className="sc-prod__phases">
            {PHASES.map((p, i) => (
              <li key={p.name}>
                <span className="sc-prod__node" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="sc-prod__phase">
                  <span className="sc-prod__when">{p.wk}</span>
                  <b>{p.name}</b>
                  <span className="sc-prod__line">{p.line}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="sc-prod__hours">
            <Stat value={1.75} decimals={2} suffix="hours" label="back to each CSM every week, about 2,730 a year across 30 CSMs" tone="accent" size="sm" />
            <Callout tone="warning" title="Assumption">
              10 minutes of admin per call, 15 calls a week, 70% removed. The time study replaces it.
            </Callout>
          </div>
        </Section>
        <Section delay={0.14} title="Helpful, not replacing" testId="trust-helpful">
          <Checks items={HELPFUL} />
        </Section>
        <Section delay={0.24} title="Reasons to trust it" testId="trust-reasons">
          <Checks items={TRUST} />
        </Section>
      </div>
    </div>
  );
}
