/**
 * Chapter 2 · Built in 48 hours: what's real. The trust slide: who built it, with the source code
 * right under the headline, what is built and working (all of the AI, the inputs and the
 * outputs), and what is simulated, each with the reason. Both columns are on screen at once.
 * Names and counts come from src/shared/platform.ts (connectors, analyses, REPO_URL),
 * data/library.json (266 files), data/world (14 accounts, 21 people) and data/backfill (218 runs).
 */
import { Badge, ButtonLink, ConnectorMark } from '../../ds';
import { IconBranch, IconExternal } from '../../ds/icons';
import { ANALYSES, CONNECTORS, REPO_URL } from '../../shared/platform';
import { Check, Enter, SceneHead } from '../components';

const REPO_LABEL = REPO_URL.replace('https://', '');

const AI = [
  'Triage by the decision model',
  'Extraction by the main model',
  'The quote check, in code',
  'Scoring and a second opinion',
  'Themes from embeddings and nearest neighbours',
  'The routing rules engine',
  'The review queue',
  'Evals with a promotion gate',
  'A spend cap, then replay',
  'Agent Ops telemetry for this agent',
];

const NOT_BUILT = ANALYSES.filter((a) => a.availability !== 'built').length;
const SHOWN_TOOLS = ['slack', 'jira', 'teams', 'linear', 'salesforce', 'gmail', 'google_drive', 'gong', 'zoom'] as const;
const toolName = (id: string) => CONNECTORS.find((c) => c.id === id)?.name ?? id;
const OTHER_TOOLS = CONNECTORS.length - SHOWN_TOOLS.length;

const SIMULATED: { what: string; why: string; marks?: readonly string[] }[] = [
  {
    what: `Connections to ${SHOWN_TOOLS.map(toolName).join(', ').replace('Microsoft Teams', 'Teams')} and ${OTHER_TOOLS} more`,
    why: 'There is no access to Invoca’s systems, and a demo must never message real people. Routing and tagging still behave exactly as they would.',
    marks: SHOWN_TOOLS,
  },
  { what: 'The data: 14 accounts, 21 people and 266 calls, notes and threads', why: 'Real customer conversations can’t leave Invoca, so every account, person and call here is fictional.' },
  { what: 'Agent Ops’ second agent, the RFP Responder, and six weeks of usage history', why: 'To show the platform with more than one agent. Signal Loop’s own history is 218 real pipeline runs, with simulated users.' },
  { what: `The other ${NOT_BUILT} analyses`, why: 'Listed and marked Not built. Forty-eight hours went into one analysis, done properly.' },
];

export function Real() {
  return (
    <div className="sc sc-real">
      <SceneHead
        title={'Built from scratch in 48 hours. Here’s what’s real.'}
        meta={
          <>
            <span className="sc-real__by">By Hunter Borman</span>
            <ButtonLink
              variant="secondary"
              size="sm"
              to={REPO_URL}
              target="_blank"
              rel="noreferrer"
              icon={<IconBranch size={14} />}
              iconRight={<IconExternal size={14} />}
              className="sc-real__repo"
              data-testid="real-repo"
              aria-label={`Source code on GitHub, ${REPO_LABEL} (opens in a new tab)`}
            >
              <span className="sc-real__repolabel">{REPO_LABEL}</span>
            </ButtonLink>
          </>
        }
        line="All of the AI is built and working: what goes in and what comes out really runs. The connections and the data are simulated, and every screen says so."
      />
      <div className="sc-real__visual">
        <Enter delay={0.06} className="sc-real__card" attrs={{ 'data-testid': 'real-built' }}>
          <div className="sc-real__cardhead">
            <h2 className="sc-real__h">Built and working</h2>
            <Badge tone="success" dot>
              Real
            </Badge>
          </div>
          <section className="sc-real__group" aria-label="All of the AI">
            <h3 className="sc-real__k">All of the AI</h3>
            <ul className="sc-real__ai">
              {AI.map((a) => (
                <li key={a}>
                  <Check />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="sc-real__group" aria-label="Inputs">
            <h3 className="sc-real__k">Inputs</h3>
            <p className="sc-real__p">Upload any file (PDF, Word, slides, spreadsheets, transcripts, email, chat exports), paste text, or pick from the library.</p>
          </section>
          <section className="sc-real__group" aria-label="Outputs">
            <h3 className="sc-real__k">Outputs</h3>
            <p className="sc-real__p">Each delivery’s content, the people tagged and the receipt are generated for real.</p>
          </section>
        </Enter>
        <Enter delay={0.14} className="sc-real__card sc-real__card--sim" attrs={{ 'data-testid': 'real-simulated' }}>
          <div className="sc-real__cardhead">
            <h2 className="sc-real__h">Simulated, and why</h2>
            <Badge tone="neutral" outline>
              Labelled on screen
            </Badge>
          </div>
          <ul className="sc-real__sim">
            {SIMULATED.map((s) => (
              <li key={s.what}>
                <b>{s.what}</b>
                <span>{s.why}</span>
                {s.marks ? (
                  <span className="sc-real__marks" aria-hidden="true">
                    {s.marks.map((m) => (
                      <ConnectorMark key={m} id={m} size={18} />
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Enter>
      </div>
    </div>
  );
}
