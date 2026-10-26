/**
 * Chapter 8 opens here · Under the hood. Three sections side by side (stacked on phones): how the
 * prompts work, what happens when something fails, and how the data is shaped. Every line comes
 * from the code: src/shared/prompts/extract.ts (taxonomy, schema, verbatim quotes, empty answer,
 * transcript as data, versions), src/worker/ai.ts (schema retry with the errors, backup model,
 * 12 s and 4 s time limits), src/worker/workflow.ts and execute.ts (fast path, durable Workflow,
 * step retries with backoff), src/pipeline/run.ts (dropped quotes, dead-letter rows),
 * src/worker/budget.ts (spend cap, replay) and src/shared/contracts.ts (Insight, Evidence,
 * RoutingRule, RunStep, workspaces). Partial delivery as failure is the write-up's rule.
 */
import type { ReactNode } from 'react';
import { Check, Enter, SceneHead } from '../components';

const PROMPTS = [
  'Categories first: six insight types and the product areas, each defined, with examples of what doesn’t count.',
  'A strict form: the model fills a fixed JSON schema, and code checks every field.',
  'Word for word: every insight needs a quote copied exactly from the call. No quote, no insight.',
  'Nothing is a fine answer. If nothing applies, it returns an empty list.',
  'The call is treated as data, never as instructions.',
  'A small decision model sorts each conversation first and gives a second opinion at review.',
  'Prompts are versioned. A new one ships only if it passes the evals.',
];

const ERRORS = [
  'A bad answer is retried once, with the errors fed back. Then the backup model answers.',
  'Every model call has a time limit: about 12 seconds for the main model, 4 for the decision model.',
  'A quote that isn’t in the call is dropped and counted, never shown as fact.',
  'A fast path runs first. If a step fails or runs long, a background job picks up from the last saved step, with retries.',
  'What still fails is saved for a person on the Health page.',
  'Past the $15 spend cap, runs replay a recorded live run, labelled as a replay.',
  'If one tool fails, the delivery reads as failed. Partial is not success.',
];

const DATA = [
  { k: 'The insight', v: 'A typed record: type, product area, severity, the quote and where it sits in the call, confidence, and the owner it went to.' },
  { k: 'Routing rules', v: 'A table. Each rule matches type, area, severity and ARR band, and names an owner and a channel. The lowest priority number wins.' },
  { k: 'Run steps', v: 'Every step is saved as it runs, with its status, timing, model, tokens and cost.' },
  { k: 'Your workspace', v: 'Each viewer gets their own. You see the shared history plus your changes; your changes never reach anyone else.' },
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

export function Hood() {
  return (
    <div className="sc sc-hood">
      <SceneHead title="Under the hood." line="How the prompts work, what happens when something fails, and how the data is shaped. Then the tests that prove it." />
      <div className="sc-prod__grid">
        <Section delay={0.04} title="How the prompts work" testId="hood-prompts">
          <Checks items={PROMPTS} />
        </Section>
        <Section delay={0.14} title="When something fails" testId="hood-errors">
          <Checks items={ERRORS} />
        </Section>
        <Section delay={0.24} title="How the data is shaped" testId="hood-data">
          <ul className="sc-built__how">
            {DATA.map((d) => (
              <li key={d.k}>
                <b>{d.k}</b>
                <span>{d.v}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
