/**
 * /write-up: the concise written version of the walkthrough. The problem, Switchboard and the
 * Signal Loop analysis built for the brief, the rollout, what's next, and how the work maps to the
 * AI Operations role. One readable page with sticky contents.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, Callout } from '../../ds';
import { IconArrowRight } from '../../ds/icons';
import { SiteBar } from '../../narrative/components';
import { BACKUPS } from '../../tour/script/chapters';
import './writeup.css';

const TOC = [
  { id: 'problem', n: '1', t: 'The problem and the people' },
  { id: 'platform', n: '2', t: 'Switchboard' },
  { id: 'system', n: '3', t: 'Signal Loop' },
  { id: 'rollout', n: '4', t: 'Rollout and adoption' },
  { id: 'next', n: '5', t: 'What’s next' },
  { id: 'role', n: '6', t: 'How this maps to the role' },
];

const STACK: [string, string, string][] = [
  ['Website and API', 'Cloudflare Worker and a React app', 'Vercel with Next.js'],
  ['AI model calls', 'Vercel AI SDK through a shared router', 'Vercel AI SDK with our own provider keys'],
  ['Deciding what to run', 'A fast decision model via OpenRouter', 'The same, on our own key'],
  ['Long-running jobs', 'Cloudflare Workflows', 'Trigger.dev'],
  ['Database', 'Cloudflare D1', 'Neon Postgres'],
  ['Finding similar feedback', 'Cloudflare Vectorize', 'pgvector on Neon'],
  ['Original files', 'Cloudflare R2', 'Object storage'],
  ['Reporting at scale', 'Daily summaries in D1', 'ClickHouse with dbt models'],
  ['Bringing in conversations', 'Any file, plus connectors (simulated here)', 'dlt from Gong, Zoom, Salesforce and Zendesk, plus direct connectors'],
  ['Sending results', 'In-app previews with receipts (simulated)', 'The Slack, Jira and Salesforce APIs'],
  ['Live transcription', 'Not needed yet', 'Render, streaming speech to text'],
];

function useActive(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const IDS = TOC.map((t) => t.id);

export function WriteUp() {
  const active = useActive(IDS);
  useEffect(() => {
    document.title = 'Write-up · Switchboard';
  }, []);
  return (
    <main className="ds-app sl-n n-page wu-page" data-testid="write-up">
      <SiteBar context="Write-up">
        <ButtonLink variant="ghost" size="sm" to="/walkthrough" className="wu-top__walk">
          Walkthrough
        </ButtonLink>
        <ButtonLink variant="primary" size="sm" to="/app/overview">
          Open the product
        </ButtonLink>
      </SiteBar>

      <section className="wu-hero">
        <p className="wu-kicker">Option 3, the feedback loop</p>
        <h1 className="n-display wu-title">Every call is a signal.</h1>
        <p className="n-lede wu-lede">
          Switchboard reads any customer conversation, decides what it is, runs the analyses that apply and sends the result to the right people in their own tools. Signal Loop is the analysis built for this brief: what customers tell Invoca’s CSMs becomes product insight with the quote attached, sent to the person who can act on it.
        </p>
        <ul className="wu-facts">
          <li>A working system, not a mock-up</li>
          <li>Sample data and simulated connectors, labelled as such</li>
          <li>Assumptions marked on the page</li>
        </ul>
      </section>

      <div className="wu-layout">
        <aside className="wu-toc" aria-label="Contents">
          <span className="wu-toc__h">On this page</span>
          <ol>
            {TOC.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? 'true' : undefined}>
                  <span className="wu-toc__n">{t.n}</span>
                  {t.t}
                </a>
              </li>
            ))}
          </ol>
          <div className="wu-toc__backups">
            <span className="wu-toc__h">Questions</span>
            {BACKUPS.map((b) => (
              <Link key={b.topic} to={`/backup/${b.topic}`}>
                {b.title}
              </Link>
            ))}
          </div>
        </aside>

        <article className="wu-article">
          {/* ------------------------------------------------ 1 */}
          <section id="problem" className="wu-sec">
            <p className="wu-sec__k">Part 1</p>
            <h2 className="wu-h2">The problem and the people</h2>
            <p>
              Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered them. It comes up on every QBR, renewal and check-in. Most of it never reaches the person who could act on it. It lives in a notes field, a Slack thread that scrolls away, or a CSM’s memory.
            </p>
            <Callout tone="warning" title="Assumption">
              Roughly 4 of 10 pieces of feedback reach an owner today. That’s illustrative, not measured. The first thing I’d do is a 2-week time study with two CSMs to replace it with a real number.
            </Callout>
            <p>Before any architecture, I asked who hires this system and for what:</p>
            <div className="wu-jobs">
              <div>
                <b>CSM</b>
                <span>When a customer tells me something the product team should hear, I want it captured, routed and tracked without retyping it, so I can stay present and show I advocated for them.</span>
              </div>
              <div>
                <b>Product Manager</b>
                <span>When I’m planning next quarter, I want real evidence grouped by theme with ARR attached, so I can prioritise on signal, not volume.</span>
              </div>
              <div>
                <b>VP Product</b>
                <span>When renewals or competitive pressure shift, I want an honest cross-account view, so I can make and defend portfolio calls.</span>
              </div>
              <div>
                <b>Sales, competitive and support leads</b>
                <span>When a competitor, pricing objection or repeat bug comes up, I want it in my channel the same day, so I can act before it costs a deal.</span>
              </div>
            </div>
            <p>
              The emotional job matters most: <b>be the advocate, not the stenographer.</b> CSMs keep the relationship and the judgement; the system takes the data entry and makes their advocacy visible. If it doesn’t do that, CSMs won’t feed it.
            </p>
            <p>
              Why this option: Invoca already turns its customers’ calls into signals. This points the same discipline inward, at Invoca’s own CSM conversations. The data exists, the work is internal and additive, and it can show value in weeks.
            </p>
          </section>

          {/* ------------------------------------------------ 2 */}
          <section id="platform" className="wu-sec">
            <p className="wu-sec__k">Part 2</p>
            <h2 className="wu-h2">Switchboard: any conversation in, the right people out</h2>
            <p>
              Feedback doesn’t only arrive on calls. So Signal Loop runs inside a small platform, Switchboard, that does the parts every analysis needs: bring a conversation in, work out what it is, and get the result to the right person.
            </p>
            <div className="wu-flow">
              <div>
                <span className="wu-flow__k">In</span>
                <b>Any conversation</b>
                <span>Connectors for Gong, Zoom, Gmail, Slack and Google Drive, or any uploaded file: PDF, Word, slides, transcripts, email and chat exports. Binary formats are converted to text in the browser.</span>
              </div>
              <div>
                <span className="wu-flow__k">Decide</span>
                <b>A fast decision model reads it first</b>
                <span>What kind of document it is, how messy it is, which analyses apply, and whether anyone is trying to trick the model.</span>
              </div>
              <div>
                <span className="wu-flow__k">Analyse</span>
                <b>Only what applies runs</b>
                <span>Signal Loop is built. Follow-ups, renewal risk, escalations, compliance review and call coaching are listed in the catalog and marked “Not built”.</span>
              </div>
              <div>
                <span className="wu-flow__k">Out</span>
                <b>The right people, in their tools</b>
                <span>Jira, Linear, Slack, Teams, Salesforce, email and Google Drive, tagging each owner by their own handle in that tool.</span>
              </div>
            </div>
            <p>
              <b>Why a decision model.</b> A small, fast model from a different family does the first read on every input: 0.9 seconds at the median in the speed test, run alongside extraction so it adds no time to a run, at about a quarter of the old screen’s cost, and it says more (what the input is, how noisy, which analyses apply). It earns its keep a second time at the review gate: its independent second opinion can send a borderline item straight to its owner when it agrees, or hold an item that would have gone automatically when it disagrees. That means fewer items waiting for review without lowering the bar. High-stakes items (churn risk, critical bugs, flagged files) are always reviewed by a person, and every insight still needs a quote that code finds in the transcript.
            </p>
            <p>
              <b>Connectors and people.</b> The connectors are simulated: connecting one records a workspace connection, and deliveries render as in-app previews with receipts. Nothing leaves the system, and the product says so. A people directory holds each person’s handle in each tool, so a delivery mentions <i>@jordan.reyes</i> in Slack and assigns Nina Patel in Jira, and you can act as anyone in it to see their view.
            </p>
          </section>

          {/* ------------------------------------------------ 3 */}
          <section id="system" className="wu-sec">
            <p className="wu-sec__k">Part 3</p>
            <h2 className="wu-h2">Signal Loop, the analysis built for this brief</h2>
            <p>Every conversation goes through ten steps. Each step records what it did, how long it took and what it cost, and the screen is drawn from those records, so what you watch is the real run.</p>
            <ol className="wu-steps">
              <li>
                <b>Bring in</b>
                <span>The file is fingerprinted, so uploading it twice does nothing new.</span>
              </li>
              <li>
                <b>Read</b>
                <span>Transcripts, notes, emails, chats and documents are split into who said what.</span>
              </li>
              <li>
                <b>Redact</b>
                <span>Personal and health details are replaced before any AI model sees the text.</span>
              </li>
              <li>
                <b>Triage</b>
                <span>The decision model says what it is, which analyses apply, and whether anyone is trying to trick the model.</span>
              </li>
              <li>
                <b>Extract</b>
                <span>Each piece of feedback comes back with its type, area, severity, the exact quote and how confident the model is. Long documents are split and read in parallel.</span>
              </li>
              <li>
                <b>Check the quote</b>
                <span>Code, not the model, looks for every quote in the transcript. A quote it can’t find is dropped and counted.</span>
              </li>
              <li>
                <b>Gate</b>
                <span>Confident items go straight to the owner, uncertain ones go to a person, the rest are held. The decision model’s second opinion can move a borderline item either way. Serious bugs and churn risk always go to a person.</span>
              </li>
              <li>
                <b>Group</b>
                <span>Similar feedback is grouped into themes by meaning; the model only names the theme.</span>
              </li>
              <li>
                <b>Route</b>
                <span>An editable table of rules decides who hears what, never the prompt. Anything without a match goes to triage.</span>
              </li>
              <li>
                <b>Deliver</b>
                <span>To the owner’s tool, tagged by their handle, with receipts and retries (simulated here). When a ticket ships, the CSM is told, with a drafted note for the customer.</span>
              </li>
            </ol>
            <p>
              <b>Proving it.</b> Quality tests measure how often it’s right and how much it finds, against 48 hand-checked sample files, from clean notes to raw speech-to-text and forwarded email threads, plus hard cases: a hidden instruction, a call full of health details, a call with nothing in it. A new prompt goes live only if it holds the bar on accuracy, coverage, the messiest files, quote checks and every safety check, and drops no score by more than 2 points. The latest candidate was blocked: accuracy fell from 88.7% to 59.7%, under the 85% bar. Its quotes were real; it labelled ordinary sentences as feedback. It was also slower and more expensive, which is reported but not yet a blocker.
            </p>
            <p>
              <b>Cost and failure.</b> Viewers share a hard $15 limit on live AI, enforced by the provider and by the app. At the limit, or if a live call fails, runs replay a recorded real run, labelled on screen, so it never becomes an outage. If the model’s answer is malformed, it retries once, then switches to a backup model, then parks the conversation on the Health page for a person.
            </p>
            <nav className="wu-links" aria-label="Related questions">
              <Link to="/backup/cost" className="n-link">
                Cost model
              </Link>
              <Link to="/backup/security" className="n-link">
                Security and PII
              </Link>
              <Link to="/backup/failure" className="n-link">
                Failure handling
              </Link>
            </nav>
          </section>

          {/* ------------------------------------------------ 4 */}
          <section id="rollout" className="wu-sec">
            <p className="wu-sec__k">Part 4</p>
            <h2 className="wu-h2">Rollout and adoption</h2>
            <p>Trust is earned in phases, and adoption is measured, not surveyed.</p>
            <div className="wu-phases">
              <div>
                <span className="wu-phase__wk">Week 0</span>
                <b>Discovery</b>
                <span>Shadow two CSMs. Run the time study. Co-design the taxonomy with CSMs and PMs.</span>
              </div>
              <div>
                <span className="wu-phase__wk">Weeks 1–2</span>
                <b>Shadow mode</b>
                <span>Runs quietly; CSMs compare its output with their own notes. Nothing is sent.</span>
              </div>
              <div>
                <span className="wu-phase__wk">Weeks 3–6</span>
                <b>Champions</b>
                <span>2–3 volunteer CSMs and one PM, with a weekly calibration on misses and noise.</span>
              </div>
              <div>
                <span className="wu-phase__wk">Week 7+</span>
                <b>Whole team</b>
                <span>Confident items go straight to the owner; everything else goes to review.</span>
              </div>
            </div>
            <p>
              <b>Trust mechanics:</b> a quote on every insight, a one-click “this is wrong”, precision published weekly, high-stakes items always reviewed, and CSMs credited when their feedback ships.
            </p>
            <p>
              <b>Additive, not replacement.</b> It takes over the data entry, not the judgement. CSMs keep the relationship and the final call.
            </p>
            <p>
              <b>Operating it.</b> Signal Loop reports its logs, timings, usage and units of work into Agent Ops. That’s where I’d measure weekly active reviewers, capture rate and time to owner, and report hours returned to executives: the time each call used to take, minus the time people now spend reviewing, with the baselines labelled as assumptions until the time study. It has a named owner, a review cadence, and meets the same nine-check agent standard in the build that I’d hold every builder’s agent to; its security review and business-owner sign-off are illustrative until Invoca Security does the real one.
            </p>
            <nav className="wu-links" aria-label="Related questions">
              <Link to="/backup/metrics" className="n-link">
                Success metrics
              </Link>
              <Link to="/backup/agent-ops" className="n-link">
                Agent Ops
              </Link>
              <Link to="/ops" className="n-link">
                Open Agent Ops
              </Link>
            </nav>
          </section>

          {/* ------------------------------------------------ 5 */}
          <section id="next" className="wu-sec">
            <p className="wu-sec__k">Part 5</p>
            <h2 className="wu-h2">What’s next</h2>
            <p>Over the next 12–18 months, the same design gets cheaper, faster and closer to the conversation:</p>
            <ul className="wu-list">
              <li>Cheaper, faster models making it economical to read every call, straight from the recorder and CRM, not a sample.</li>
              <li>Real-time, in-call capture instead of after-the-fact processing.</li>
              <li>More analyses on the same platform: follow-ups, renewal risk and escalations first, then compliance review and call coaching, each with its own tests and owner.</li>
              <li>Specialist agents (extractor, critic, router) checking each other, and drafted specs and customer replies from a theme, reviewed by the owner.</li>
              <li>Plugging into Invoca’s own Signal AI and conversation data as the long-term home.</li>
            </ul>
            <p>What stays the same: quotes grounded in code, gates on high-stakes output, routing as data, and human judgement where it counts.</p>
            <p>
              <b>From proof of concept to production.</b> The proof of concept runs entirely on Cloudflare. The production design keeps the same boundaries on a stack built for scale, all strict TypeScript:
            </p>
            <div className="wu-table-wrap">
              <table className="wu-table">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Today (deployed)</th>
                    <th scope="col">In production</th>
                  </tr>
                </thead>
                <tbody>
                  {STACK.map(([c, p, r]) => (
                    <tr key={c}>
                      <th scope="row">{c}</th>
                      <td>{p}</td>
                      <td>{r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="wu-links" aria-label="Related questions">
              <Link to="/backup/build-vs-buy" className="n-link">
                Build vs buy
              </Link>
              <Link to="/backup/differently" className="n-link">
                What I’d do differently
              </Link>
            </nav>
          </section>

          {/* ------------------------------------------------ 6 */}
          <section id="role" className="wu-sec">
            <p className="wu-sec__k">The role</p>
            <h2 className="wu-h2">How this maps to AI Operations</h2>
            <div className="wu-role">
              <div>
                <b>Build agents</b>
                <span>Signal Loop is a working agent: redaction, a decision model for triage and second opinions, structured extraction, quotes checked in code, review gates, routing and quality tests.</span>
              </div>
              <div>
                <b>Own the platform</b>
                <span>Switchboard for the work (intake, triage, delivery, people) and Agent Ops for operating it: a registry, review dates, usage, logs, reliability targets, alerts and cost for every agent, not just mine.</span>
              </div>
              <div>
                <b>Raise the bar for builders</b>
                <span>A nine-check agent standard, templates and office hours, so a Claude or Gumloop build gets to production safely.</span>
              </div>
              <div>
                <b>Report impact</b>
                <span>Adoption, hours returned, what it costs and what it’s worth, with the assumptions labelled.</span>
              </div>
            </div>
          </section>

          <footer className="wu-end">
            <ButtonLink variant="primary" to="/walkthrough" iconRight={<IconArrowRight size={16} />}>
              Start the walkthrough
            </ButtonLink>
            <ButtonLink variant="secondary" to="/app/overview">
              Open the product
            </ButtonLink>
            <ButtonLink variant="ghost" to="/ops">
              Agent Ops
            </ButtonLink>
          </footer>
        </article>
      </div>
    </main>
  );
}

export default WriteUp;
