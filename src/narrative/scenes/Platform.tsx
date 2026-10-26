/**
 * Chapter 4 opens here · The platform. "Signal Loop runs inside Switchboard." One diagram, all on
 * screen at once, its four columns arriving left to right: In (any conversation, from anywhere),
 * Decide (the decision model reads it first), Analyse (Signal Loop, built, beside the roadmap
 * analyses, not built) and Out (the right people, in their own tools, tagged by their own
 * handle). Names come from the platform catalog and the people directory, so the scene says what
 * the product does.
 */
import type { ReactNode } from 'react';
import { Badge, ConnectorMark, ProductMark } from '../../ds';
import { IconFileText, IconLayers, IconScale, IconShield } from '../../ds/icons';
import { ANALYSES, connectorById, personHandle, type ConnectorId } from '../../shared/platform';
import type { Person } from '../../shared/contracts';
import peopleJson from '../../../data/world/people.json';
import { Arrow, Enter, SceneHead } from '../components';

const PEOPLE = peopleJson as unknown as Person[];
const person = (id: string) => PEOPLE.find((p) => p.id === id);
const nameOf = (id: ConnectorId) => connectorById(id)?.name ?? id;

const IN: { id: ConnectorId; what: string }[] = [
  { id: 'gong', what: 'Call recordings' },
  { id: 'zoom', what: 'Meeting transcripts' },
  { id: 'gmail', what: 'Email threads' },
  { id: 'slack', what: 'Customer channels' },
  { id: 'google_drive', what: 'Notes, decks and PDFs' },
];

const DECIDE: { icon: ReactNode; k: string; v: string }[] = [
  { icon: <IconFileText size={16} />, k: 'What it is', v: 'Call, notes, email, chat, ticket or document' },
  { icon: <IconLayers size={16} />, k: 'What applies', v: 'Only the analyses that fit it run' },
  { icon: <IconShield size={16} />, k: 'Whether it’s safe', v: 'Hidden instructions are flagged first' },
  { icon: <IconScale size={16} />, k: 'A second opinion', v: 'Later, on borderline items at review' },
];

/**
 * Where the Brightline signals go, tagged the way each tool tags people (personHandle): the
 * routing rules send competitor mentions to competitive intel in Slack, product work to the PM in
 * Jira, the account task to the CSM in Salesforce and the digest to the VP Product by email.
 */
const OUT: { id: ConnectorId; label: string; who: string | null; verb?: string; to?: string }[] = [
  { id: 'jira', label: 'Jira', who: 'ppl_nina', verb: 'Assigned to' },
  { id: 'slack', label: 'Slack', who: 'ppl_jordan', verb: 'Mentions' },
  { id: 'salesforce', label: 'Salesforce', who: 'ppl_marcus', verb: 'Task for' },
  { id: 'gmail', label: 'Email', who: 'ppl_elena' },
  { id: 'google_drive', label: 'Google Drive', who: null, to: 'Voice-of-customer doc' },
];

/** Let an email address wrap before the @, never mid-word. */
function breakAtSign(handle: string): ReactNode {
  const i = handle.indexOf('@');
  if (i <= 0) return handle;
  return (
    <>
      {handle.slice(0, i)}
      <wbr />
      {handle.slice(i)}
    </>
  );
}

const BUILT = ANALYSES.find((a) => a.availability === 'built');
const ROADMAP = ANALYSES.filter((a) => a.availability === 'not_built');

/** Column n arrives at COL[n - 1] seconds: left to right, settled within about half a second. */
const COL = [0.04, 0.14, 0.24, 0.34];

function Column({ n, step, title, children, className }: { n: number; step: string; title: string; children: ReactNode; className?: string }) {
  return (
    <Enter delay={COL[n - 1]} as="section" className={`sc-plat__col ${className ?? ''}`} attrs={{ 'aria-label': `${step}: ${title}`, 'data-col': String(n) }}>
      <header className="sc-plat__colhead">
        <span className="sc-plat__step">{step}</span>
        <h2 className="sc-plat__title">{title}</h2>
      </header>
      {children}
    </Enter>
  );
}

/** The arrow into column n, arriving with it. */
function Joint({ n }: { n: number }) {
  return (
    <Enter delay={COL[n - 1]} className="sc-plat__joint" y={0}>
      <Arrow size={18} />
    </Enter>
  );
}

export function Platform() {
  return (
    <div className="sc sc-plat">
      <SceneHead
        title="Signal Loop runs inside Switchboard."
        line="Any conversation comes in. A fast model reads it first. Only the analyses that apply run, and the results reach the right people in their own tools."
      />
      <div className="sc-plat__diagram" role="group" aria-label="How Switchboard works: in, decide, analyse, out">
        <Column n={1} step="In" title="Any conversation">
          <ul className="sc-plat__list">
            {IN.map((s) => (
              <li key={s.id} className="sc-plat__item">
                <ConnectorMark id={s.id} size={24} />
                <span className="sc-plat__text">
                  <b>{nameOf(s.id)}</b>
                  <span>{s.what}</span>
                </span>
              </li>
            ))}
            <li className="sc-plat__item sc-plat__item--upload">
              <ConnectorMark id="upload" size={24} />
              <span className="sc-plat__text">
                <b>Upload any file</b>
                <span>PDF, Word, slides, transcripts, email and chat exports</span>
              </span>
            </li>
          </ul>
        </Column>

        <Joint n={2} />

        <Column n={2} step="Decide" title="Read it first">
          <ul className="sc-plat__list">
            {DECIDE.map((d) => (
              <li key={d.k} className="sc-plat__item">
                <span className="sc-plat__icon">{d.icon}</span>
                <span className="sc-plat__text">
                  <b>{d.k}</b>
                  <span>{d.v}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="sc-plat__foot">A small, fast model on OpenRouter: 0.9 s median in testing</p>
        </Column>

        <Joint n={3} />

        <Column n={3} step="Analyse" title="Run what applies">
          {BUILT ? (
            <div className="sc-plat__built">
              <ProductMark product="signal-loop" size={24} />
              <span className="sc-plat__text">
                <b>
                  {BUILT.name}
                  <Badge tone="accent" className="sc-plat__badge">
                    Built
                  </Badge>
                </b>
                <span>Product feedback, with the customer’s words, sent to its owner</span>
              </span>
            </div>
          ) : null}
          <span className="sc-plat__group">Not built yet</span>
          <ul className="sc-plat__roadmap">
            {ROADMAP.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
          <p className="sc-plat__foot">Long documents are split and read in parallel</p>
        </Column>

        <Joint n={4} />

        <Column n={4} step="Out" title="The right people">
          <ul className="sc-plat__list">
            {OUT.map((o) => {
              const p = o.who ? person(o.who) : undefined;
              const handle = p ? `${o.verb ? `${o.verb} ` : ''}${personHandle(p, o.id)}` : (o.to ?? '');
              return (
                <li key={o.label} className="sc-plat__item">
                  <ConnectorMark id={o.id} size={24} />
                  <span className="sc-plat__text">
                    <b>{o.label}</b>
                    <span className="sc-plat__handle" title={handle}>
                      {breakAtSign(handle)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="sc-plat__foot">Connectors are simulated in this demo</p>
        </Column>
      </div>
    </div>
  );
}
