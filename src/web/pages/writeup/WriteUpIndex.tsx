/**
 * /write-up: the write-up's front page. What this is, plain answers to the four things the brief
 * asks about, the "For AI assistants" block, then the ten chapters in the presentation's three
 * groups, each linking to its own page, then the Q&A topics.
 * Everything comes from src/shared/writeup, which also renders /write-up.md.
 *
 * Old links into the one-page write-up (/write-up#cost, #rollout) land on the page that now
 * holds that part.
 */
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ButtonLink, Card } from '../../../ds';
import { IconArrowRight, IconDownload, IconFileText, IconPlug } from '../../../ds/icons';
import { SiteBar } from '../../../narrative/components';
import { REPO_URL } from '../../../shared/platform';
import { BRIEF } from '../../../shared/writeup/brief';
import { CHAPTER_GROUPS, CHAPTER_PAGES, chapterPage } from '../../../shared/writeup/chapters';
import { QUESTION_IDS, QUESTION_PAGES, questionPage } from '../../../shared/writeup/questions';
import { HERO, INDEX_COPY, WRITEUP_MD, chapterPath, questionPath } from '../../../shared/writeup/site';
import { BASE, Rich, ZIP_HREF } from './Rich';
import './writeup.css';

/** Where each part of the old one-page write-up went. */
const OLD_PARTS: Record<string, string> = { problem: 'jobs', platform: 'call', system: 'call', rollout: 'trust', next: 'future', role: 'future' };

function useOldAnchors() {
  const { hash, search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    if (QUESTION_IDS.includes(id)) navigate({ pathname: questionPath(id), search }, { replace: true });
    else if (id === 'questions') navigate({ pathname: '/backup', search }, { replace: true });
    else if (OLD_PARTS[id]) navigate({ pathname: chapterPath(OLD_PARTS[id]!), search }, { replace: true });
  }, [hash, search, navigate]);
}

const AI_LINKS = [
  { key: 'zip', icon: <IconDownload size={16} />, title: 'Download for AI', desc: 'Every page and doc as Markdown, in one .zip', href: ZIP_HREF },
  { key: 'markdown', icon: <IconFileText size={16} />, title: 'Markdown of the write-up', desc: 'This index, linking each page’s own file', href: `${BASE}${WRITEUP_MD}` },
  { key: 'claude', icon: <IconPlug size={16} />, title: 'Connect Claude (MCP)', desc: 'Ask questions of the live project and its data', to: '/app/claude' },
] as const;

function ForAi() {
  return (
    <Card
      className="wu-ai"
      title="For AI assistants"
      description="Give Claude or another assistant the whole project as text, or connect it to the live system."
      flush
      attrs={{ 'data-testid': 'writeup-ai' }}
      footer={
        <span className="wu-ai__foot">
          <a className="n-link" href={`${BASE}llms.txt`} data-testid="writeup-llms">
            llms.txt
          </a>
          <a className="n-link" href={REPO_URL} target="_blank" rel="noreferrer" data-testid="writeup-repo">
            Source code on GitHub
          </a>
        </span>
      }
    >
      <ul className="wu-ai__list">
        {AI_LINKS.map((l) => {
          const inner = (
            <>
              <span className="wu-ai__icon" aria-hidden="true">
                {l.icon}
              </span>
              <span className="wu-ai__text">
                <span className="wu-ai__t">{l.title}</span>
                <span className="wu-ai__d">{l.desc}</span>
              </span>
            </>
          );
          return (
            <li key={l.key}>
              {'to' in l ? (
                <Link className="wu-ai__row" to={l.to} data-testid={`writeup-${l.key}`}>
                  {inner}
                </Link>
              ) : (
                <a className="wu-ai__row" href={l.href} data-testid={`writeup-${l.key}`} {...(l.key === 'zip' ? { download: true } : {})}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Row({ to, n, title, text, testid }: { to: string; n?: string; title: string; text: string; testid: string }) {
  return (
    <li>
      <Link className="wu-row" to={to} data-testid={testid} data-plain={n ? undefined : 'true'}>
        {n && <span className="wu-row__n">{n}</span>}
        <span className="wu-row__text">
          <span className="wu-row__t">{title}</span>
          <span className="wu-row__d">{text}</span>
        </span>
        <IconArrowRight size={16} className="wu-row__go" aria-hidden="true" />
      </Link>
    </li>
  );
}

const range = (nums: number[]) => (nums.length > 1 ? `Chapters ${nums[0]} to ${nums[nums.length - 1]}` : `Chapter ${nums[0]}`);

export function WriteUpIndex() {
  useOldAnchors();
  useEffect(() => {
    document.title = 'Write-up · Switchboard';
    window.scrollTo(0, 0);
  }, []);
  return (
    <main className="ds-app sl-n n-page wu-page wu-page--index" data-testid="write-up">
      <SiteBar context="Write-up">
        <ButtonLink variant="ghost" size="sm" to="/walkthrough" className="wu-top__walk">
          Presentation
        </ButtonLink>
        <ButtonLink variant="primary" size="sm" to="/app/overview">
          Open the product
        </ButtonLink>
      </SiteBar>

      <header className="wu-hero">
        <p className="wu-kicker">{HERO.kicker}</p>
        <h1 className="n-display wu-title">{HERO.title}</h1>
        <p className="n-lede wu-lede">{HERO.lede}</p>
        <ul className="wu-facts">
          {HERO.facts.map((f) => (
            <li key={f}>
              <Rich text={f} />
            </li>
          ))}
        </ul>
      </header>

      <div className="wu-index">
        <section className="wu-answers" aria-label="The short version" data-testid="writeup-answers">
          {BRIEF.map((q) => (
            <div key={q.n} className="wu-answer" data-testid={`writeup-answer-${q.n}`}>
              <h2 className="wu-answer__t">{q.title}</h2>
              <p className="wu-answer__d">{q.answer}</p>
              <nav className="wu-links" aria-label={`Read more: ${q.title}`}>
                <span className="wu-links__k">Read more</span>
                {q.chapters.map((id) => (
                  <Link key={id} className="n-link" to={chapterPath(id)}>
                    {chapterPage(id)?.title}
                  </Link>
                ))}
                {q.topics.map((id) => (
                  <Link key={id} className="n-link" to={questionPath(id)}>
                    {questionPage(id)?.title}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </section>

        <ForAi />

        <section className="wu-isec" aria-labelledby="chapters-h" data-testid="writeup-chapters">
          <header className="wu-isec__head">
            <h2 id="chapters-h" className="wu-h2">
              {INDEX_COPY.chaptersTitle}
            </h2>
            <p className="wu-p">{INDEX_COPY.chaptersLede}</p>
          </header>
          {CHAPTER_GROUPS.map((g) => (
            <div key={g.label} className="wu-group">
              <div className="wu-group__label">
                <h3 className="wu-group__t">{g.label}</h3>
                <span className="wu-group__d">{range(g.chapters.map((c) => c.number))}</span>
              </div>
              <ol className="wu-rows">
                {g.chapters.map((c) => (
                  <Row key={c.id} to={chapterPath(c.id)} n={String(c.number)} title={c.title} text={c.summary} testid={`writeup-chapter-${c.id}`} />
                ))}
              </ol>
            </div>
          ))}
        </section>

        <section className="wu-isec" aria-labelledby="questions-h" data-testid="writeup-questions">
          <header className="wu-isec__head">
            <h2 id="questions-h" className="wu-h2">
              {INDEX_COPY.questionsTitle}
            </h2>
            <p className="wu-p">{INDEX_COPY.questionsLede}</p>
          </header>
          <div className="wu-group">
            <div className="wu-group__label">
              <h3 className="wu-group__t">Topics</h3>
              <span className="wu-group__d">One page each</span>
            </div>
            <ol className="wu-rows">
              {QUESTION_PAGES.map((q) => (
                <Row key={q.id} to={questionPath(q.id)} title={q.title} text={q.blurb} testid={`writeup-question-${q.id}`} />
              ))}
            </ol>
          </div>
        </section>

        <footer className="wu-end">
          <ButtonLink variant="primary" to={chapterPath(CHAPTER_PAGES[0]!.id)} iconRight={<IconArrowRight size={16} />}>
            Start reading
          </ButtonLink>
          <ButtonLink variant="secondary" to="/walkthrough">
            Start the presentation
          </ButtonLink>
          <ButtonLink variant="ghost" to="/ops">
            Agent Ops
          </ButtonLink>
        </footer>
      </div>
    </main>
  );
}

export default WriteUpIndex;
