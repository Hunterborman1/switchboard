/**
 * The write-up (one page per chapter) and the Q&A (one page per topic) are rendered, page and
 * Markdown alike, from src/shared/writeup. These checks keep it honest: one page per chapter and
 * per Q&A topic, in the presentation's order; every sentence on a page is in that page's
 * Markdown; every source link points at a file that exists; and the recorded cost figures
 * match the data.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKUPS, CHAPTERS, GROUPS } from '../../../src/tour/script/chapters.ts';
import { BRIEF } from '../../../src/shared/writeup/brief.ts';
import { CHAPTER_GROUPS, CHAPTER_PAGES } from '../../../src/shared/writeup/chapters.ts';
import { QUESTION_PAGES } from '../../../src/shared/writeup/questions.ts';
import { HERO, INDEX_COPY, sourcePaths } from '../../../src/shared/writeup/site.ts';
import { parseInline, plain, type Block, type CostBlock } from '../../../src/shared/writeup/types.ts';
import { absoluteHref, chapterMarkdown, questionMarkdown, questionsIndexMarkdown, writeupIndexMarkdown } from '../../../src/shared/writeup/markdown.ts';
import { SITE_URL } from '../../../src/shared/platform.ts';

const root = new URL('../../../', import.meta.url);

/** The Markdown without its marks, to compare with a page's plain text. */
const unmark = (md: string) => md.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

const headings = (md: string) =>
  md
    .split('\n')
    .filter((l) => /^#{1,6} /.test(l))
    .map((l) => l.replace(/^#+ /, ''));

/** Every piece of prose a block puts on the page. */
function texts(b: Block): string[] {
  switch (b.kind) {
    case 'p':
    case 'source':
      return [b.text];
    case 'callout':
      return [b.text, ...(b.title ? [b.title.replace(/[.:]$/, '')] : [])];
    case 'quote':
      return [b.text, b.cite];
    case 'cards':
      return b.items.flatMap((c) => [c.title, c.kicker, c.figure, c.text, c.note, ...(c.bullets ?? []), ...(c.numbered ?? []), ...(c.entries ?? []).flatMap((e) => [e.title, e.status.label, ...e.meta])].filter((x): x is string => !!x));
    case 'steps':
      return b.items.flatMap((s) => [s.title, s.text]);
    case 'list':
      return b.items;
    case 'qa':
      return b.items.flatMap((it) => [it.q, it.a]);
    case 'table':
      return [...b.head, ...b.rows.flatMap((r) => [r.head, ...(r.sub ? [r.sub] : []), ...r.cells])];
    case 'h3':
      return [b.text];
    case 'flow':
      return [b.title, b.summary, ...b.steps.flatMap((s) => [s.title, ...(s.when ? [s.when] : [])])];
    case 'related':
      return b.links.map((l) => l.label);
    case 'action':
      return [b.label];
    case 'cost':
      return [b.limitText, b.replay.title.replace(/[.:]$/, ''), b.replay.text, b.splitNote, ...b.split.flatMap((s) => [s.label, s.note])];
  }
}

const missingFrom = (md: string, page: string[]) => {
  const flat = unmark(md);
  return page.map(plain).filter((t) => !flat.includes(t));
};

describe('pages', () => {
  it('numbers the ten chapters in order, in three groups, and links each of the four answers to them', () => {
    expect(CHAPTER_PAGES.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(CHAPTER_GROUPS.map((g) => g.label)).toEqual(['Introduction', 'The platform', 'Closing']);
    expect(new Set(CHAPTER_PAGES.map((c) => c.id)).size).toBe(CHAPTER_PAGES.length);
    expect(BRIEF.map((q) => q.n)).toEqual([1, 2, 3, 4]);
    for (const q of BRIEF) {
      for (const id of q.chapters) expect(CHAPTER_PAGES.some((c) => c.id === id), id).toBe(true);
      for (const id of q.topics) expect(QUESTION_PAGES.some((x) => x.id === id), id).toBe(true);
    }
    // Every chapter is reached from at least one of the four answers or the chapter list.
    for (const n of [1, 2, 3, 4] as const) expect(CHAPTER_PAGES.some((c) => c.question === n), String(n)).toBe(true);
  });

  /**
   * The write-up's chapters follow the presentation's. The presentation is moving to the same ten
   * ids (feat/four-questions); until it has, this check waits. Once it has, ids, titles and groups
   * must match exactly.
   */
  const OLD_PRESENTATION = ['signal', 'real', 'why', 'call', 'review', 'routing', 'patterns', 'operate', 'production', 'scorecard'];
  const presentationMoved = CHAPTERS.map((c) => c.id).join() !== OLD_PRESENTATION.join();
  it.skipIf(!presentationMoved)('has one write-up page per chapter of the presentation, in order, with the same titles and groups', () => {
    expect(CHAPTER_PAGES.map((c) => c.id)).toEqual(CHAPTERS.map((c) => c.id));
    for (const page of CHAPTER_PAGES) {
      const ch = CHAPTERS.find((c) => c.id === page.id)!;
      expect(page.title, page.id).toBe(ch.title);
      expect(page.number, page.id).toBe(ch.part);
      expect(GROUPS.find((g) => g.ids.includes(ch.id))?.label, page.id).toBe(page.group);
    }
    expect(CHAPTER_GROUPS.map((g) => g.label)).toEqual(GROUPS.map((g) => g.label));
  });

  it('says no "question N" or "the brief" on the pages', () => {
    const pages = JSON.stringify([CHAPTER_PAGES.map(({ question: _q, ...rest }) => rest), QUESTION_PAGES, BRIEF.map((q) => [q.title, q.answer])]);
    expect(pages).not.toMatch(/question \d|the brief|four questions/i);
  });

  it('has one Q&A page per presentation backup topic, in the same order and numbered', () => {
    expect(QUESTION_PAGES.map((q) => q.id)).toEqual(BACKUPS.map((b) => b.topic));
    QUESTION_PAGES.forEach((q, i) => expect(q.number).toBe(i + 1));
    // The presenter view and the hub use the BACKUPS titles; the pages say the same.
    const same = (s: string) => s.replace(/’/g, "'");
    for (const q of QUESTION_PAGES) expect(same(q.title), q.id).toBe(same(BACKUPS.find((b) => b.topic === q.id)!.title));
  });

  it('gives every section a unique anchor on its page', () => {
    for (const page of CHAPTER_PAGES) {
      const ids = page.sections.map((s) => s.id);
      expect(new Set(ids).size, page.id).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('keeps the Q&A-only blocks (the flow, the live cost) off the chapter pages', () => {
    for (const page of CHAPTER_PAGES) for (const s of page.sections) for (const b of s.blocks) expect(['flow', 'cost'], `${page.id}#${s.id}`).not.toContain(b.kind);
  });

  it('links only to pages that exist', () => {
    const routes = new Set(['/ops', '/app/claude', ...CHAPTER_PAGES.map((c) => `/write-up/${c.id}`), ...QUESTION_PAGES.map((q) => `/backup/${q.id}`)]);
    const links: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') for (const p of parseInline(v)) if (p.kind === 'link' && p.href.startsWith('/')) links.push(p.href);
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(CHAPTER_PAGES);
    walk(QUESTION_PAGES);
    for (const page of [...CHAPTER_PAGES, ...QUESTION_PAGES]) {
      const blocks = 'sections' in page ? page.sections.flatMap((s) => s.blocks) : page.blocks;
      for (const b of blocks) if (b.kind === 'related' || b.kind === 'action') links.push(...(b.kind === 'related' ? b.links.map((l) => l.to) : [b.to]));
    }
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) expect(routes.has(l), l).toBe(true);
  });

  it('cites only source files that exist in the repository', () => {
    const paths = sourcePaths(JSON.stringify([CHAPTER_PAGES, QUESTION_PAGES]));
    expect(paths.length).toBeGreaterThan(20);
    for (const p of paths) expect(existsSync(new URL(p, root)), p).toBe(true);
  });

  it('parses bold and links, and nothing else', () => {
    expect(parseInline('a **b** [c](/d) e')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: '/d' },
      { kind: 'text', text: ' e' },
    ]);
    expect(plain('Each value becomes [PATIENT_1]; the original')).toBe('Each value becomes [PATIENT_1]; the original');
  });
});

describe('Markdown, one file per page', () => {
  it('the index says what the index page says, and links every page and its Markdown', () => {
    const md = writeupIndexMarkdown();
    expect(headings(md)).toContain(HERO.title);
    expect(missingFrom(md, [HERO.kicker, HERO.lede, ...HERO.facts, ...BRIEF.flatMap((q) => [q.title, q.answer]), ...Object.values(INDEX_COPY), ...CHAPTER_PAGES.flatMap((c) => [c.title, c.summary]), ...QUESTION_PAGES.flatMap((q) => [q.title, q.blurb]), ...CHAPTER_GROUPS.map((g) => g.label)])).toEqual([]);
    for (const c of CHAPTER_PAGES) {
      expect(md).toContain(`(${SITE_URL}/write-up/${c.id})`);
      expect(md).toContain(`(${SITE_URL}/write-up/${c.id}.md)`);
    }
    for (const q of QUESTION_PAGES) expect(md).toContain(`(${SITE_URL}/backup/${q.id}.md)`);
  });

  for (const page of CHAPTER_PAGES) {
    it(`chapter ${page.number} (${page.id}) says everything its page says`, () => {
      const md = chapterMarkdown(page);
      expect(md.startsWith('---\n')).toBe(true);
      expect(md).toContain(`url: "${SITE_URL}/write-up/${page.id}"`);
      expect(md).toContain(`presentation_url: "${SITE_URL}/walkthrough/${page.id}"`);
      expect(headings(md)).toContain(page.title);
      for (const s of page.sections) {
        expect(headings(md), s.id).toContain(s.title);
        expect(md, s.id).toContain(`${SITE_URL}/write-up/${page.id}#${s.id}`);
      }
      const text = [page.title, page.lede, ...page.sections.flatMap((s) => [s.title, ...(s.lede ? [s.lede] : []), ...s.blocks.flatMap(texts)])];
      expect(missingFrom(md, text)).toEqual([]);
    });
  }

  it('each chapter links its neighbours', () => {
    CHAPTER_PAGES.forEach((page, i) => {
      const md = chapterMarkdown(page);
      if (i > 0) expect(md).toContain(`Previous: [Chapter ${i}: ${CHAPTER_PAGES[i - 1]!.title}]`);
      if (i < CHAPTER_PAGES.length - 1) expect(md).toContain(`Next: [Chapter ${i + 2}: ${CHAPTER_PAGES[i + 1]!.title}]`);
    });
  });

  it('the Q&A index lists every question with its blurb', () => {
    const md = questionsIndexMarkdown();
    expect(missingFrom(md, [INDEX_COPY.questionsTitle, INDEX_COPY.questionsLede, ...QUESTION_PAGES.flatMap((q) => [q.title, q.blurb])])).toEqual([]);
  });

  for (const q of QUESTION_PAGES) {
    it(`question ${q.number} (${q.id}) says everything its page says`, () => {
      const md = questionMarkdown(q);
      expect(md).toContain(`url: "${SITE_URL}/backup/${q.id}"`);
      expect(headings(md)).toContain(q.title);
      expect(missingFrom(md, [q.title, q.lede, ...q.blocks.flatMap(texts)])).toEqual([]);
    });
  }

  it('states the recorded cost figures and says the page shows them live', () => {
    const q = QUESTION_PAGES.find((x) => x.id === 'cost')!;
    const cost = q.blocks.find((b): b is CostBlock => b.kind === 'cost')!;
    const md = questionMarkdown(q);
    expect(md).toContain(`$${cost.recorded.perCallUsd.toFixed(5)}`);
    expect(md).toContain(`$${(cost.recorded.perCallUsd * 1000).toFixed(2)}`);
    expect(md).toContain(`${(cost.recorded.p50Ms / 1000).toFixed(1)} seconds`);
    expect(md).toMatch(/live from this deployment/);
  });

  it('only links to absolute URLs, since it is read away from the site', () => {
    const all = [writeupIndexMarkdown(), questionsIndexMarkdown(), ...CHAPTER_PAGES.map(chapterMarkdown), ...QUESTION_PAGES.map(questionMarkdown)].join('\n');
    const hrefs = [...all.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(50);
    for (const h of hrefs) expect(h, h).toMatch(/^https:\/\//);
    expect(absoluteHref('#gaps', `${SITE_URL}/write-up/call`)).toBe(`${SITE_URL}/write-up/call#gaps`);
    expect(absoluteHref('/ops')).toBe(`${SITE_URL}/ops`);
  });
});

describe('recorded cost figures', () => {
  it('match the recorded runs in data/replays', () => {
    const dir = new URL('data/replays/', root);
    const runs = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => (JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { run: { costUsd: number; durationMs: number } }).run);
    const cost = QUESTION_PAGES.find((q) => q.id === 'cost')!.blocks.find((b): b is CostBlock => b.kind === 'cost')!;
    const mean = runs.reduce((a, r) => a + r.costUsd, 0) / runs.length;
    const durs = runs.map((r) => r.durationMs).sort((a, b) => a - b);
    expect(cost.recorded.runs).toBe(runs.length);
    expect(cost.recorded.perCallUsd).toBeCloseTo(mean, 5);
    // The same median the page computes from live runs: the middle of the sorted list.
    expect(cost.recorded.p50Ms).toBe(durs[Math.floor(durs.length / 2)]);
  });
});
