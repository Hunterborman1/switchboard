/**
 * Chapter 4 · Why this option, and not the others. Beat 0: the brief's three options as cards,
 * each with a one-line verdict; Option 3 chosen, and Switchboard built so 1 and 2 can become
 * analyses later. Beat 1: why it is built the way it is (raw code, three measured model roles,
 * one Worker for the proof of concept). Both visuals share one grid cell, so nothing moves
 * between beats. Reasons are Hunter's recorded ones; facts come from docs/reports/
 * decision-models.md, docs/ARCHITECTURE.md and the Production scene.
 */
import { Badge, ProductMark } from '../../ds';
import { Check, SceneHead } from '../components';
import { useCalm } from '../hooks';
import { motion } from 'motion/react';
import { DUR, EASE } from '../motion';

type Option = { n: number; name: string; what: string; chosen?: boolean; verdict: string; later: string };

const OPTIONS: Option[] = [
  {
    n: 1,
    name: 'RFP Responder',
    what: 'An agent drafts answers to a PDF security questionnaire from internal docs.',
    verdict: 'Mature products already do this (Loopio, Responsive, Vanta, Conveyor), so the first question is why not buy one. And a wrong answer on a security questionnaire is a compliance risk.',
    later: 'Simulated in Agent Ops as a second agent.',
  },
  {
    n: 2,
    name: 'Churn Predictor',
    what: 'A weekly watchdog over Zendesk, Salesforce and usage data that warns leadership before a cancellation.',
    verdict: 'It needs believable data faked from three systems, and a prediction is hard to defend without real outcomes to check it against.',
    later: 'On the roadmap as the Renewal risk analysis.',
  },
  {
    n: 3,
    name: 'Feedback Loop',
    what: 'Read call transcripts and notes, extract structured insights, and route each to the right person.',
    chosen: true,
    verdict: 'It’s the work Invoca’s own product does, pointed at Invoca’s own CSM calls. And it shows all four pillars: several people with different jobs, real engineering, an easy additive pitch (stop retyping it into Jira) and a clear future.',
    later: 'Built: Signal Loop, inside Switchboard.',
  },
];

const BUILD = [
  {
    k: 'Raw TypeScript, not n8n, Gumloop or Zapier',
    v: 'The trust features need code: quotes checked against the transcript, a typed schema validated on every model output, deterministic routing rules, an eval suite with a promotion gate, budgets and replay, and tests.',
  },
  {
    k: 'Three model roles, chosen by measurement',
    v: 'A decision model triages every input and gives a second opinion, a main model extracts, and a backup model takes over if it fails. All on OpenRouter; the decision model was the fastest of 12 candidates with every answer valid and every verdict right.',
  },
  {
    k: 'One Cloudflare Worker for the proof of concept',
    v: 'Fast to ship, one deploy, behind a gate. The production design keeps the same boundaries on Neon, Vercel and Trigger.dev, in chapter 18.',
  },
];

const HEADS = [
  { title: 'Three options. I chose the feedback loop.', line: 'Option 3 is the same work Invoca’s product does, pointed at Invoca’s own customer calls.' },
  { title: 'Why it’s built the way it is.', line: 'Each choice is about trust: the model proposes, code checks, people decide.' },
];

export function Why({ beat }: { beat: number }) {
  const calm = useCalm();
  const b = Math.min(beat, 1);
  const fade = (on: boolean, delay = 0) => ({
    initial: false as const,
    animate: { opacity: on ? 1 : 0, y: on || calm ? 0 : 6 },
    transition: { duration: calm ? 0 : DUR.layout, ease: EASE, delay: on && !calm ? delay : 0 },
    style: { visibility: on ? ('visible' as const) : ('hidden' as const) },
    'aria-hidden': on ? undefined : true,
  });
  return (
    <div className="sc sc-why">
      <SceneHead heads={HEADS} active={b} />
      <div className="sc-why__stage">
        <motion.div className="sc-why__layer" {...fade(b === 0)} data-testid="why-options">
          <ol className="sc-why__options">
            {OPTIONS.map((o) => (
              <li key={o.n} className="sc-why__option" data-chosen={o.chosen ? 'true' : undefined}>
                <div className="sc-why__ohead">
                  <span className="sc-why__onum">Option {o.n}</span>
                  {o.chosen ? (
                    <Badge tone="accent" dot>
                      Chosen
                    </Badge>
                  ) : (
                    <Badge outline>Not chosen</Badge>
                  )}
                </div>
                <h2 className="sc-why__oname">{o.name}</h2>
                <p className="sc-why__owhat">{o.what}</p>
                <p className="sc-why__verdict">{o.verdict}</p>
                <p className="sc-why__later">{o.later}</p>
              </li>
            ))}
          </ol>
          <p className="sc-why__general">
            <ProductMark product="switchboard" size={20} />
            <span>
              <b>Switchboard is built so options 1 and 2 can become analyses on the same platform later.</b> Same intake, same decision model, same delivery.
            </span>
          </p>
        </motion.div>
        <motion.div className="sc-why__layer" {...fade(b === 1, 0.05)} data-testid="why-build">
          <ul className="sc-why__build">
            {BUILD.map((x) => (
              <li key={x.k}>
                <Check />
                <div>
                  <b>{x.k}</b>
                  <span>{x.v}</span>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
