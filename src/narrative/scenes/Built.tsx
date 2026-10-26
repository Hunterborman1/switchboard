/**
 * Chapter 3 · What I built, and why. One screen: the byline and the GitHub link under the
 * headline; the brief's three options with their verdicts; then how it's built, what is built and
 * working, and what is simulated and why. Names and counts come from src/shared/platform.ts
 * (connectors, analyses, REPO_URL), data/world (14 accounts, 21 people), data/library.json
 * (266 files) and data/backfill (218 runs). Reasons are Hunter's; model facts come from
 * docs/reports/decision-models.md.
 */
import { Badge, ButtonLink } from '../../ds';
import { IconBranch, IconExternal } from '../../ds/icons';
import { ANALYSES, CONNECTORS, REPO_URL } from '../../shared/platform';
import { Check, Enter, SceneHead } from '../components';

const REPO_LABEL = REPO_URL.replace('https://', '');
const NOT_BUILT = ANALYSES.filter((a) => a.availability !== 'built').length;

const OPTIONS = [
  { n: 1, name: 'RFP Responder', verdict: 'Tools like Loopio and Responsive already do this, and a wrong security answer is a compliance risk.', later: 'Simulated in Agent Ops as a second agent.' },
  { n: 2, name: 'Churn Predictor', verdict: 'It needs believable fake data from three systems, and a prediction is hard to defend without real outcomes.', later: 'On the roadmap as Renewal risk.' },
  { n: 3, name: 'Feedback Loop', chosen: true, verdict: 'It’s the work Invoca’s own product does, pointed at Invoca’s own CSM calls. Many people use it, and it can grow.', later: 'Built: Signal Loop, inside Switchboard.' },
];

const HOW = [
  { k: 'TypeScript, not n8n, Gumloop or Zapier', v: 'Checking the AI needs code: quotes checked against the call, a fixed answer format, routing rules, evals, budgets and tests.' },
  { k: 'Three model roles, picked by measuring', v: 'A small decision model reads first and gives a second opinion. A main model extracts. A backup takes over if it fails.' },
  { k: 'One Cloudflare Worker, for now', v: 'Fast to ship and one deploy. The production design comes in chapter 10.' },
];

const AI = ['Triage and a second opinion', 'Extraction with checked quotes', 'Scoring and the review queue', 'Themes and routing rules', 'Evals with a promotion gate', 'A spend cap, with replay past it', 'Agent Ops monitoring'];

const SIMULATED = [
  { what: `Connections to Slack, Jira, Salesforce and ${CONNECTORS.length - 3} more`, why: 'No access to Invoca’s systems, and a demo must never message real people.' },
  { what: 'The data: 14 accounts, 21 people, 266 conversations', why: 'Real customer calls can’t leave Invoca.' },
  { what: 'Agent Ops’ second agent and six weeks of history', why: 'To show the platform with more than one agent.' },
  { what: `The other ${NOT_BUILT} analyses`, why: 'Listed and marked Not built.' },
];

export function Built() {
  return (
    <div className="sc sc-built">
      <SceneHead
        title="What I built, and why."
        meta={
          <>
            <span className="sc-real__by">Built from scratch in 48 hours by Hunter Borman</span>
            <ButtonLink
              variant="secondary"
              size="sm"
              to={REPO_URL}
              target="_blank"
              rel="noreferrer"
              icon={<IconBranch size={14} />}
              iconRight={<IconExternal size={14} />}
              className="sc-real__repo"
              data-testid="built-repo"
              aria-label={`Source code on GitHub, ${REPO_LABEL} (opens in a new tab)`}
            >
              <span className="sc-real__repolabel">{REPO_LABEL}</span>
            </ButtonLink>
          </>
        }
        line="All of the AI is built and works. The connections and the data are simulated, and every screen says so."
      />
      <ol className="sc-built__options" data-testid="built-options">
        {OPTIONS.map((o, i) => (
          <Enter as="li" key={o.n} delay={0.04 + i * 0.06} className="sc-built__option" attrs={o.chosen ? { 'data-chosen': 'true' } : undefined}>
            <div className="sc-built__ohead">
              <span className="sc-built__onum">Option {o.n}</span>
              {o.chosen ? (
                <Badge tone="accent" dot>
                  Chosen
                </Badge>
              ) : (
                <Badge outline>Not chosen</Badge>
              )}
            </div>
            <h2 className="sc-built__oname">{o.name}</h2>
            <p className="sc-built__verdict">{o.verdict}</p>
            <p className="sc-built__later">{o.later}</p>
          </Enter>
        ))}
      </ol>
      <div className="sc-prod__grid">
        <Enter as="section" delay={0.24} className="sc-prod__col" attrs={{ 'aria-label': 'How it’s built', 'data-testid': 'built-how' }}>
          <h2 className="sc-prod__title">How it’s built</h2>
          <ul className="sc-built__how">
            {HOW.map((x) => (
              <li key={x.k}>
                <b>{x.k}</b>
                <span>{x.v}</span>
              </li>
            ))}
          </ul>
        </Enter>
        <Enter as="section" delay={0.32} className="sc-prod__col" attrs={{ 'aria-label': 'Built and working', 'data-testid': 'built-real' }}>
          <div className="sc-built__cardhead">
            <h2 className="sc-prod__title">Built and working</h2>
            <Badge tone="success" dot>
              Real
            </Badge>
          </div>
          <ul className="sc-built__checks">
            {AI.map((a) => (
              <li key={a}>
                <Check />
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <p className="sc-prod__line">What you upload really runs. Each delivery’s content, the people tagged and the receipt are generated for real.</p>
        </Enter>
        <Enter as="section" delay={0.4} className="sc-prod__col sc-built__sim" attrs={{ 'aria-label': 'Simulated, and why', 'data-testid': 'built-simulated' }}>
          <div className="sc-built__cardhead">
            <h2 className="sc-prod__title">Simulated, and why</h2>
            <Badge tone="neutral" outline>
              Labelled on screen
            </Badge>
          </div>
          <ul className="sc-built__how">
            {SIMULATED.map((s) => (
              <li key={s.what}>
                <b>{s.what}</b>
                <span>{s.why}</span>
              </li>
            ))}
          </ul>
        </Enter>
      </div>
    </div>
  );
}
