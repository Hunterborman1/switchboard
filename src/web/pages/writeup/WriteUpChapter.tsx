/**
 * /write-up/:chapter: one chapter of the presentation as a page you read. The chapter's story,
 * then what the screen leaves out: the decisions and trade-offs, the numbers and their sources,
 * the honest gaps. A contents column for the page's sections and every chapter, previous and next
 * links, a link that opens the chapter in the presentation, and small links to the page's
 * Markdown and the docs .zip. An unknown chapter is the site's not-found page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ButtonLink } from '../../../ds';
import { IconArrowLeft, IconArrowRight, IconDownload, IconFileText, IconPlay } from '../../../ds/icons';
import { SiteBar } from '../../../narrative/components';
import { CHAPTER_PAGES, chapterPage } from '../../../shared/writeup/chapters';
import { QUESTION_PAGES } from '../../../shared/writeup/questions';
import { WRITEUP_PATH, chapterMd, chapterPath, presentationPath, questionPath } from '../../../shared/writeup/site';
import type { ChapterPage, Section } from '../../../shared/writeup/types';
import { NotFound } from '../../NotFound';
import { SectionView } from './blocks';
import { BASE, Rich, ZIP_HREF } from './Rich';
import './writeup.css';

/** The section nearest the top of the reading area, for the contents column. */
function useActive(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    setActive(ids[0] ?? '');
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

/**
 * Contents links go through the router, so its scroll restoration lands on the section. A plain
 * "#id" link would read as a back/forward step and be restored to the top.
 */
function Toc({ chapter, active }: { chapter: ChapterPage; active: string }) {
  const { search } = useLocation();
  return (
    <nav className="wu-toc" aria-label="Contents" data-testid="writeup-toc">
      <div className="wu-toc__group">
        <span className="wu-toc__h">On this page</span>
        <ol>
          {chapter.sections.map((s: Section) => (
            <li key={s.id}>
              <Link to={{ search, hash: s.id }} aria-current={active === s.id ? 'true' : undefined}>
                {s.nav ?? s.title}
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <div className="wu-toc__group wu-toc__group--chapters">
        <span className="wu-toc__h">Chapters</span>
        <ol>
          {CHAPTER_PAGES.map((c) => (
            <li key={c.id}>
              <Link to={chapterPath(c.id)} aria-current={c.id === chapter.id ? 'page' : undefined}>
                <span className="wu-toc__n">{c.number}</span>
                <span className="wu-toc__t">{c.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

function Pager({ chapter }: { chapter: ChapterPage }) {
  const i = CHAPTER_PAGES.indexOf(chapter);
  const prev = CHAPTER_PAGES[i - 1];
  const next = CHAPTER_PAGES[i + 1];
  return (
    <nav className="wu-pager" aria-label="Chapters">
      {prev ? (
        <Link className="wu-pager__link" to={chapterPath(prev.id)} data-testid="writeup-prev">
          <span className="wu-pager__k">
            <IconArrowLeft size={14} />
            Previous chapter
          </span>
          <span className="wu-pager__t">
            {prev.number}. {prev.title}
          </span>
        </Link>
      ) : (
        <Link className="wu-pager__link" to={WRITEUP_PATH} data-testid="writeup-prev">
          <span className="wu-pager__k">
            <IconArrowLeft size={14} />
            The write-up
          </span>
          <span className="wu-pager__t">All chapters and questions</span>
        </Link>
      )}
      {next ? (
        <Link className="wu-pager__link wu-pager__link--next" to={chapterPath(next.id)} data-testid="writeup-next">
          <span className="wu-pager__k">
            Next chapter
            <IconArrowRight size={14} />
          </span>
          <span className="wu-pager__t">
            {next.number}. {next.title}
          </span>
        </Link>
      ) : (
        <Link className="wu-pager__link wu-pager__link--next" to={questionPath(QUESTION_PAGES[0]!.id)} data-testid="writeup-next">
          <span className="wu-pager__k">
            Questions and answers
            <IconArrowRight size={14} />
          </span>
          <span className="wu-pager__t">Start with {QUESTION_PAGES[0]!.title.toLowerCase()}</span>
        </Link>
      )}
    </nav>
  );
}

function ChapterView({ chapter }: { chapter: ChapterPage }) {
  const ids = useMemo(() => chapter.sections.map((s) => s.id), [chapter]);
  const active = useActive(ids);
  useEffect(() => {
    document.title = `${chapter.title} · Write-up · Switchboard`;
  }, [chapter]);
  return (
    <main className="ds-app sl-n n-page wu-page wu-page--chapter" data-testid="write-up-chapter" data-chapter={chapter.id}>
      <SiteBar
        context={
          <Link className="wu-crumb" to={WRITEUP_PATH}>
            Write-up
          </Link>
        }
      >
        <ButtonLink variant="ghost" size="sm" to="/walkthrough" className="wu-top__walk">
          Presentation
        </ButtonLink>
        <ButtonLink variant="primary" size="sm" to="/app/overview">
          Open the product
        </ButtonLink>
      </SiteBar>

      <header className="wu-hero wu-hero--chapter">
        <p className="wu-kicker">
          {chapter.group}, chapter {chapter.number} of {CHAPTER_PAGES.length}
        </p>
        <h1 className="n-display wu-title">{chapter.title}</h1>
        <p className="n-lede wu-lede">
          <Rich text={chapter.lede} />
        </p>
        <div className="wu-actions">
          <ButtonLink variant="secondary" to={presentationPath(chapter.id)} icon={<IconPlay size={14} />} data-testid="writeup-present">
            Open in the presentation
          </ButtonLink>
          <span className="wu-actions__links">
            <a className="wu-actions__link" href={`${BASE}${chapterMd(chapter.id)}`} data-testid="writeup-chapter-md">
              <IconFileText size={14} />
              Markdown of this page
            </a>
            <a className="wu-actions__link" href={ZIP_HREF} download data-testid="writeup-chapter-zip">
              <IconDownload size={14} />
              All pages as a .zip
            </a>
          </span>
        </div>
      </header>

      <div className="wu-layout">
        <aside className="wu-aside">
          <Toc chapter={chapter} active={active} />
        </aside>

        <article className="wu-article">
          {chapter.sections.map((s) => (
            <SectionView key={s.id} s={s} />
          ))}
          <Pager chapter={chapter} />
        </article>
      </div>
    </main>
  );
}

export function WriteUpChapter() {
  const { chapter: id } = useParams();
  const chapter = id ? chapterPage(id) : undefined;
  if (!chapter) return <NotFound />;
  // Keyed, so moving to the next chapter starts fresh (contents, scroll).
  return <ChapterView key={chapter.id} chapter={chapter} />;
}

export default WriteUpChapter;
