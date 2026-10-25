/**
 * /write-up: the concise written version of the walkthrough. Four pillars plus how the
 * work maps to the AI Operations role. Editorial dark, long-form, sticky contents.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Arrow, Backdrop, Callout, Chip, Display, Eyebrow, Lede, Mark } from '../../narrative/components';
import { BACKUPS } from '../../tour/script/chapters';
import './writeup.css';

const TOC = [
  { id: 'problem', n: '01', t: 'The problem & the people' },
  { id: 'system', n: '02', t: 'The system' },
  { id: 'rollout', n: '03', t: 'Rollout & adoption' },
  { id: 'next', n: '04', t: 'What’s next' },
  { id: 'role', n: '05', t: 'How this maps to the role' },
];

const STACK: [string, string, string][] = [
  ['Web + API', 'Worker (Hono) + static assets (Vite, React, TS)', 'Vercel (Next.js)'],
  ['Orchestration', 'Cloudflare Workflows', 'Trigger.dev'],
  ['State', 'D1 (+ KV flag)', 'Neon Postgres'],
  ['Similarity', 'Workers AI embeddings + Vectorize', 'pgvector on Neon via AI SDK'],
  ['Raw evidence', 'R2', 'Object storage'],
  ['LLM', 'Vercel AI SDK', 'Same, direct provider keys (BYOK)'],
  ['Analytics at scale', 'D1 rollups', 'ClickHouse + dbt marts'],
  ['Ingestion', 'Upload + library', 'dlt (Gong, Zoom, Salesforce, Zendesk)'],
  ['Long-running stateful work', '—', 'Render (e.g. streaming speech-to-text workers)'],
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
    document.title = 'Write-up · Signal Loop';
  }, []);
  return (
    <main className="sl-n n-page wu-page" data-testid="write-up">
      <Backdrop />
      <header className="wu-top">
        <Mark href={import.meta.env.BASE_URL} />
        <nav className="wu-top__links" aria-label="Elsewhere">
          <Link to="/walkthrough" className="n-btn n-btn--ghost n-btn--sm">Walkthrough</Link>
          <Link to="/app/new" className="n-btn n-btn--quiet n-btn--sm">Open the system</Link>
        </nav>
      </header>

      <section className="wu-hero">
        <Eyebrow num="Option 3">The feedback loop architect · write-up</Eyebrow>
        <Display size="lg">
          Every call is a <em>signal.</em>
        </Display>
        <Lede>
          Signal Loop turns what customers tell Invoca’s CSMs into routed, evidence-backed product insight, then reports into Agent Ops, the platform I’d use to run every agent like a product: owned, measured, observable. This page is the short written version; the walkthrough is the long one.
        </Lede>
        <div className="n-row">
          <Chip tone="accent" dot>Working system, not a mock</Chip>
          <Chip>Synthetic data, labelled</Chip>
          <Chip>Assumptions marked as such</Chip>
        </div>
      </section>

      <div className="wu-layout">
        <aside className="wu-toc" aria-label="Contents">
          <span className="n-label">Contents</span>
          <ol>
            {TOC.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? 'true' : undefined}>
                  <span className="n-mono">{t.n}</span>
                  {t.t}
                </a>
              </li>
            ))}
          </ol>
          <div className="wu-toc__backups">
            <span className="n-label">Q&amp;A backups</span>
            {BACKUPS.map((b) => (
              <Link key={b.topic} to={`/backup/${b.topic}`}>{b.title}</Link>
            ))}
          </div>
        </aside>

        <article className="wu-article">
          {/* ------------------------------------------------ 01 */}
          <section id="problem" className="wu-sec">
            <Eyebrow num="01">Pillar one</Eyebrow>
            <h2 className="wu-h2">The problem &amp; the people</h2>
            <p>
              Customers tell CSMs exactly what to build: what’s broken, what’s missing, what a competitor just offered them. It comes up on every QBR, renewal and check-in. Most of it never reaches the person who could act on it. It lives in a notes field, a Slack thread that scrolls away, or a CSM’s memory.
            </p>
            <Callout tone="assumption">
              <b>Assumption:</b> roughly 4 of 10 pieces of feedback reach an owner today. That’s illustrative, not measured. The first thing I’d do is a 2-week time study with two CSMs to replace it with a real number.
            </Callout>
            <p>Before any architecture, I asked who hires this system and for what:</p>
            <div className="wu-jobs">
              <div><b>CSM</b><span>When a customer tells me something the product team should hear, I want it captured, routed and tracked without retyping it, so I can stay present and show I advocated for them.</span></div>
              <div><b>Product Manager</b><span>When I’m planning next quarter, I want real evidence grouped by theme with ARR attached, so I can prioritise on signal, not volume.</span></div>
              <div><b>VP Product</b><span>When renewals or competitive pressure shift, I want an honest cross-account view, so I can make and defend portfolio calls.</span></div>
              <div><b>Sales · Competitive · Support</b><span>When a competitor, pricing objection or repeat bug comes up, I want it in my channel the same day, so I can act before it costs a deal.</span></div>
            </div>
            <p>
              The emotional job matters most: <em>be the advocate, not the stenographer.</em> CSMs keep the relationship and the judgement; the system takes the data entry and makes their advocacy visible. If it doesn’t do that, CSMs won’t feed it.
            </p>
            <p>
              Why this option: Invoca already turns its customers’ calls into signals. This points the same discipline inward, at Invoca’s own CSM conversations. The data exists, the work is internal and additive, and it can show value in weeks.
            </p>
          </section>

          {/* ------------------------------------------------ 02 */}
          <section id="system" className="wu-sec">
            <Eyebrow num="02">Pillar two</Eyebrow>
            <h2 className="wu-h2">The system</h2>
            <p>Every call runs through a durable workflow with ten steps. Each step writes a row with status, timing, hashes, model, tokens and cost, and the UI animates from those rows, so what you watch is the real execution.</p>
            <ol className="wu-steps">
              <li><b>Ingest</b> hash the raw file; a re-upload is idempotent.</li>
              <li><b>Normalize</b> detect format (vtt, txt, md, eml, chat), parse speakers and turns.</li>
              <li><b>Redact</b> PII and PHI become reversible tokens. Only redacted text reaches a model.</li>
              <li><b>Screen</b> a fast call: actionable? language? injection suspected?</li>
              <li><b>Extract</b> structured output, validated with Zod: type, area, severity, sentiment, verbatim evidence, confidence, rationale.</li>
              <li><b>Ground</b> code, not the model: exact match, then normalised, then a fuzzy window at ≥ 0.90. A quote that doesn’t ground is dropped and counted as a hallucination.</li>
              <li><b>Score &amp; gate</b> 0.80+ routes itself, 0.55–0.80 goes to review, below is held. Sev-1 bugs and churn risk always go to a person.</li>
              <li><b>Theme</b> embeddings and nearest neighbours decide membership; the model only names the theme.</li>
              <li><b>Route</b> an editable rules table (type × area × severity × ARR band → owner and channel). Never the prompt. No match → triage.</li>
              <li><b>Deliver</b> to Slack, Jira, Linear and a weekly digest, with receipts and retries. When a ticket ships, the CSM is told, with a drafted customer note.</li>
            </ol>
            <p>
              <b>Proving it.</b> Evals score precision and recall per insight type and per mess level against 48 hand-labelled golden files, from clean notes to raw speech-to-text and forwarded email threads, plus edge cases (injection, PHI-heavy, nothing actionable). A new prompt is promoted only if every slice holds: the cheaper v5 candidate was blocked because precision fell 29 points (88.6% to 59.7%).
            </p>
            <p>
              <b>Cost and failure.</b> Viewers share a hard $15 live-AI cap enforced by the provider and by an in-app ledger. At the cap, or if a live call fails, runs replay a recorded real execution, labelled on screen, so it never becomes an outage. Schema failures retry once with errors, then fall back to a second model, then land in a dead-letter queue on the Health page.
            </p>
            <div className="n-row">
              <Link to="/backup/cost" className="n-link">Cost model</Link>
              <Link to="/backup/security" className="n-link">Security &amp; PII</Link>
              <Link to="/backup/failure" className="n-link">Failure handling</Link>
            </div>
          </section>

          {/* ------------------------------------------------ 03 */}
          <section id="rollout" className="wu-sec">
            <Eyebrow num="03">Pillar three</Eyebrow>
            <h2 className="wu-h2">Rollout &amp; adoption</h2>
            <p>Trust is earned in phases, and adoption is measured, not surveyed.</p>
            <div className="wu-phases">
              <div><span className="n-mono">Week 0</span><b>Discovery</b><span>Shadow two CSMs. Run the time study. Co-design the taxonomy with CSMs and PMs.</span></div>
              <div><span className="n-mono">Weeks 1–2</span><b>Shadow</b><span>Runs silently; CSMs compare its output with their own notes. Nothing routes.</span></div>
              <div><span className="n-mono">Weeks 3–6</span><b>Champions</b><span>2–3 volunteer CSMs and one PM, with a weekly calibration on misses and noise.</span></div>
              <div><span className="n-mono">Week 7+</span><b>Team</b><span>Auto-routing above threshold; everything else goes to review.</span></div>
            </div>
            <p>
              <b>Trust mechanics:</b> a quote on every insight, a one-click “this is wrong”, precision published weekly, high-stakes items always reviewed, and CSMs credited when their feedback ships.
            </p>
            <p>
              <b>Additive, not replacement.</b> It takes over the data entry, not the judgement. CSMs keep the relationship and the final call.
            </p>
            <p>
              <b>Operating it.</b> Signal Loop reports logs, traces, usage and units of work into Agent Ops. That’s where I’d measure weekly active reviewers, capture rate and time to owner, and report hours returned to executives: Σ(baseline minutes per unit − measured human review minutes), with baselines labelled as assumptions until the time study. It has a named owner, a review cadence, and passes the same nine-check agent standard I’d hold every builder’s agent to.
            </p>
            <div className="n-row">
              <Link to="/backup/metrics" className="n-link">Success metrics</Link>
              <Link to="/backup/agent-ops" className="n-link">Agent Ops</Link>
              <Link to="/ops" className="n-link">Open Agent Ops</Link>
            </div>
          </section>

          {/* ------------------------------------------------ 04 */}
          <section id="next" className="wu-sec">
            <Eyebrow num="04">Pillar four</Eyebrow>
            <h2 className="wu-h2">What’s next</h2>
            <p>Over the next 12–18 months, the same design gets cheaper, faster and closer to the conversation:</p>
            <ul className="wu-list">
              <li>Real-time, in-call capture instead of after-the-fact processing.</li>
              <li>Specialist agents (extractor, critic, router) checking each other.</li>
              <li>Cheaper, faster models making it economical to process every call, not a sample.</li>
              <li>Drafted PRDs and customer replies from a theme, reviewed by the owner.</li>
              <li>Plugging into Invoca’s own Signal AI and conversation data as the long-term home.</li>
            </ul>
            <p>What stays the same: quotes grounded in code, gates on high-stakes output, routing as data, and human judgement where it counts.</p>
            <p><b>POC → production.</b> The POC runs entirely on Cloudflare. The production design keeps the same boundaries on a stack built for scale, all strict TypeScript:</p>
            <div className="wu-table-wrap">
              <table className="wu-table">
                <thead>
                  <tr><th scope="col">Concern</th><th scope="col">POC (deployed)</th><th scope="col">Production</th></tr>
                </thead>
                <tbody>
                  {STACK.map(([c, p, r]) => (
                    <tr key={c}><th scope="row">{c}</th><td>{p}</td><td>{r}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="n-row">
              <Link to="/backup/build-vs-buy" className="n-link">Build vs buy</Link>
              <Link to="/backup/differently" className="n-link">What I’d do differently</Link>
            </div>
          </section>

          {/* ------------------------------------------------ 05 */}
          <section id="role" className="wu-sec">
            <Eyebrow num="05">The role</Eyebrow>
            <h2 className="wu-h2">How this maps to AI Operations</h2>
            <div className="wu-role">
              <div><b>Build agents</b><span>Signal Loop is a working agent: redaction, structured extraction, grounding in code, gates, routing and evals.</span></div>
              <div><b>Own the platform</b><span>Agent Ops: registry, review cadence, usage, logs, traces, SLOs, alerts and cost for every agent, not just mine.</span></div>
              <div><b>Raise the bar for builders</b><span>A nine-check agent standard, templates and office hours, so a Claude or Gumloop build gets to production safely.</span></div>
              <div><b>Report impact</b><span>Adoption, hours returned, what it costs and what it’s worth, with the assumptions labelled.</span></div>
            </div>
          </section>

          <footer className="wu-end">
            <Link to="/walkthrough" className="n-btn n-btn--primary">
              Start the walkthrough <Arrow />
            </Link>
            <Link to="/app/new" className="n-btn n-btn--ghost">Open the system</Link>
            <Link to="/ops" className="n-btn n-btn--quiet">Agent Ops</Link>
          </footer>
        </article>
      </div>
    </main>
  );
}

export default WriteUp;
