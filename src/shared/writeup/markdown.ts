/**
 * Every write-up and Q&A page as Markdown, rendered from the same data as the page
 * (./chapters.ts, ./questions.ts, ./site.ts), so the two cannot say different things. Served
 * at each page's URL plus ".md", put in the docs .zip and offered over MCP
 * (src/worker/mcp/docs.ts).
 *
 * Where a page shows a live number, its Markdown states the recorded value and says the page
 * shows it live.
 */
import { BUDGET_LIMIT_USD } from '../contracts.ts';
import { REPO_URL, SITE_URL } from '../platform.ts';
import { BRIEF } from './brief.ts';
import { CHAPTER_GROUPS, CHAPTER_PAGES, chapterPage } from './chapters.ts';
import { QUESTION_PAGES, questionPage } from './questions.ts';
import { HERO, INDEX_COPY, QUESTIONS_MD, QUESTIONS_PATH, QUESTIONS_TITLE, WRITEUP_MD, WRITEUP_PATH, WRITEUP_TITLE, chapterMd, chapterPath, presentationPath, questionMd, questionPath } from './site.ts';
import { parseInline, type Block, type CardItem, type ChapterPage, type CostBlock, type QuestionPage, type Section } from './types.ts';

const url = (path: string) => `${SITE_URL}${path}`;
const mdUrl = (file: string) => `${SITE_URL}/${file}`;
export const ZIP_URL = `${SITE_URL}/switchboard-docs.zip`;

/** Site routes and anchors become absolute: the file is read away from the site. */
export function absoluteHref(href: string, pageUrl = url(WRITEUP_PATH)): string {
  if (href.startsWith('#')) return `${pageUrl}${href}`;
  if (href.startsWith('/')) return `${SITE_URL}${href}`;
  return href;
}

type Ctx = { page: string };

function inline(s: string, c: Ctx): string {
  return parseInline(s)
    .map((p) => (p.kind === 'bold' ? `**${p.text}**` : p.kind === 'link' ? `[${p.text}](${absoluteHref(p.href, c.page)})` : p.text))
    .join('');
}

const cell = (s: string, c: Ctx) => inline(s, c).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const usd = (n: number, d: number) => `$${n.toFixed(d)}`;

const yaml = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

function card(it: CardItem, c: Ctx): string {
  const head = [it.kicker, it.figure].filter(Boolean);
  const title = head.length ? `${head.join(', ')}: ${it.title}` : it.title;
  const rich = it.bullets || it.numbered || it.entries;
  if (!rich) return [`- **${title}.** ${inline(it.text ?? '', c)}`.trimEnd(), ...(it.note ? [`  ${inline(it.note, c)}`] : [])].join('\n');
  const out: string[] = [`**${title}**`, ''];
  if (it.text) out.push(inline(it.text, c), '');
  if (it.entries) for (const e of it.entries) out.push(`- **${e.title}** (${e.status.label}): ${e.meta.join('; ')}`);
  if (it.bullets) for (const b of it.bullets) out.push(`- ${inline(b, c)}`);
  if (it.numbered) it.numbered.forEach((n, i) => out.push(`${i + 1}. ${inline(n, c)}`));
  if (it.note) out.push('', inline(it.note, c));
  return out.join('\n');
}

function cards(items: CardItem[], c: Ctx): string {
  // Simple cards read as one list; richer ones (lists inside) as their own paragraphs.
  const parts: string[] = [];
  let run: string[] = [];
  for (const it of items) {
    if (it.bullets || it.numbered || it.entries) {
      if (run.length) parts.push(run.join('\n'));
      run = [];
      parts.push(card(it, c));
    } else run.push(card(it, c));
  }
  if (run.length) parts.push(run.join('\n'));
  return parts.join('\n\n');
}

function cost(b: CostBlock, c: Ctx): string {
  const r = b.recorded;
  return [
    `The page reads these figures live from this deployment (its runs and its spending ledger). The values below are the recorded ones: the mean cost and median run time of the ${r.runs} recorded runs.`,
    '',
    '| Figure | Recorded value | On the page |',
    '|---|---|---|',
    `| Per call | ${usd(r.perCallUsd, 5)} (mean of the ${r.runs} recorded runs) | Live: the mean of this deployment’s live runs |`,
    `| Per 1,000 calls | ${usd(r.perCallUsd * 1000, 2)}, before volume discounts or caching | Live: the per-call figure times 1,000 |`,
    `| Typical run time | ${(r.p50Ms / 1000).toFixed(1)} seconds, all ten steps end to end (median of the recorded runs) | Live: the median of recent runs |`,
    `| Live AI spent | Not recorded here | Live: spend so far against the $${BUDGET_LIMIT_USD} shared limit |`,
    '',
    `**Live AI spending limit.** ${inline(b.limitText, c)}`,
    '',
    `> **${b.replay.title.replace(/[.:]$/, '')}.** ${inline(b.replay.text, c)}`,
    '',
    '**Where a call’s cost goes**',
    '',
    ...b.split.map((s) => `- ${s.label}: ${Math.round(s.share * 100)}%. ${s.note}.`),
    '',
    inline(b.splitNote, c),
  ].join('\n');
}

function block(b: Block, level: number, c: Ctx): string {
  switch (b.kind) {
    case 'p':
    case 'source':
      return inline(b.text, c);
    case 'callout': {
      const lead = b.title ? `**${b.title.replace(/[.:]$/, '')}.** ` : '';
      return `> ${lead}${inline(b.text, c)}`;
    }
    case 'quote':
      return `> “${inline(b.text, c)}”\n>\n> ${inline(b.cite, c)}`;
    case 'cards':
      return cards(b.items, c);
    case 'steps':
      return b.items.map((s, i) => `${i + 1}. **${s.title}.** ${inline(s.text, c)}`).join('\n');
    case 'list':
      return b.items.map((s) => `- ${inline(s, c)}`).join('\n');
    case 'qa':
      return b.items.map((it) => `**${inline(it.q, c)}** ${inline(it.a, c)}`).join('\n\n');
    case 'table': {
      const head = `| ${b.head.join(' | ')} |`;
      const rule = `|${b.head.map(() => '---').join('|')}|`;
      const rows = b.rows.map((r) => `| **${cell(r.head, c)}**${r.sub ? ` (${cell(r.sub, c)})` : ''} | ${r.cells.map((x) => cell(x, c)).join(' | ')} |`);
      return [head, rule, ...rows].join('\n');
    }
    case 'h3':
      return `${'#'.repeat(level + 1)} ${b.text}`;
    case 'flow':
      return [`**${b.title}.** ${inline(b.summary, c)}`, '', ...b.steps.map((s, i) => `${i + 1}. ${s.when ? `${s.when}: ` : ''}**${s.title}**, ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}.`)].join('\n');
    case 'related':
      return `${b.label}: ${b.links.map((l) => `[${l.label}](${absoluteHref(l.to, c.page)})`).join(', ')}.`;
    case 'action':
      return `[${b.label}](${absoluteHref(b.to, c.page)})`;
    case 'cost':
      return cost(b, c);
  }
}

function blocks(list: Block[], level: number, c: Ctx): string[] {
  return list.flatMap((b) => [block(b, level, c), '']);
}

function section(s: Section, c: Ctx): string {
  const out = [`## ${s.title}`, ''];
  if (s.lede) out.push(inline(s.lede, c), '');
  out.push(...blocks(s.blocks, 2, c));
  return out.join('\n').trimEnd();
}

const tidy = (lines: string[]) =>
  lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');

const frontMatter = (fields: Record<string, string>) => ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${yaml(v)}`), '---', ''];

const AUTHOR = 'Hunter Borman';

// ---------------------------------------------------------------- the write-up's index

/** /write-up.md: what this is, the ten chapters by group and the Q&A, each linked to its page and its Markdown. */
export function writeupIndexMarkdown(): string {
  const c: Ctx = { page: url(WRITEUP_PATH) };
  return tidy([
    ...frontMatter({ title: WRITEUP_TITLE, url: url(WRITEUP_PATH), markdown_url: mdUrl(WRITEUP_MD), author: AUTHOR, source: 'src/shared/writeup/ (the pages and these files are rendered from it)' }),
    `# ${HERO.title}`,
    '',
    `${HERO.kicker}. ${inline(HERO.lede, c)}`,
    '',
    ...HERO.facts.map((f) => `- ${inline(f, c)}`),
    '',
    'This is the index of the write-up as Markdown, for AI assistants. Every chapter and every question has its own page, and each page has its own Markdown file, linked below. They say the same things as the pages.',
    '',
    ...BRIEF.flatMap((q) => [
      `## ${q.title}`,
      '',
      inline(q.answer, c),
      '',
      `Read more: ${[...q.chapters.map((id) => `[${chapterPage(id)?.title}](${url(chapterPath(id))})`), ...q.topics.map((id) => `[${questionPage(id)?.title}](${url(questionPath(id))})`)].join(', ')}.`,
      '',
    ]),
    '## For AI assistants',
    '',
    `- [Every page and doc as Markdown, in one .zip](${ZIP_URL}), with an INDEX.md`,
    `- [llms.txt](${SITE_URL}/llms.txt): every Markdown URL in one list`,
    `- [Connect Claude over MCP](${SITE_URL}/app/claude): ask questions of the live project and its data`,
    `- [Source code on GitHub](${REPO_URL})`,
    '',
    `## ${INDEX_COPY.chaptersTitle}`,
    '',
    inline(INDEX_COPY.chaptersLede, c),
    '',
    ...CHAPTER_GROUPS.flatMap((g) => [`### ${g.label}`, '', ...g.chapters.map((ch) => `${ch.number}. [${ch.title}](${url(chapterPath(ch.id))}) ([Markdown](${mdUrl(chapterMd(ch.id))})): ${inline(ch.summary, c)}`), '']),
    `## ${INDEX_COPY.questionsTitle}`,
    '',
    inline(INDEX_COPY.questionsLede, c),
    '',
    ...QUESTION_PAGES.map((q) => `- [${q.title}](${url(questionPath(q.id))}) ([Markdown](${mdUrl(questionMd(q.id))})): ${inline(q.blurb, c)}`),
  ]);
}

// ---------------------------------------------------------------- a chapter

/** /write-up/<id>.md: one chapter's page. */
export function chapterMarkdown(ch: ChapterPage): string {
  const page = url(chapterPath(ch.id));
  const c: Ctx = { page };
  const i = CHAPTER_PAGES.indexOf(ch);
  const prev = CHAPTER_PAGES[i - 1];
  const next = CHAPTER_PAGES[i + 1];
  const link = (x: ChapterPage) => `[Chapter ${x.number}: ${x.title}](${url(chapterPath(x.id))}) ([Markdown](${mdUrl(chapterMd(x.id))}))`;
  return tidy([
    ...frontMatter({
      title: `Chapter ${ch.number} of ${CHAPTER_PAGES.length}: ${ch.title}`,
      part_of: WRITEUP_TITLE,
      group: ch.group,
      url: page,
      markdown_url: mdUrl(chapterMd(ch.id)),
      presentation_url: url(presentationPath(ch.id)),
      author: AUTHOR,
      source: 'src/shared/writeup/chapters.ts (the page and this file are rendered from it)',
    }),
    `# ${ch.title}`,
    '',
    `Chapter ${ch.number} of ${CHAPTER_PAGES.length}, in ${ch.group}. ${inline(ch.lede, c)}`,
    '',
    '## Contents',
    '',
    ...ch.sections.map((s) => `- [${s.nav ?? s.title}](${page}#${s.id})`),
    '',
    ...ch.sections.flatMap((s) => [section(s, c), '']),
    '---',
    '',
    ...(prev ? [`Previous: ${link(prev)}`, ''] : []),
    ...(next ? [`Next: ${link(next)}`, ''] : []),
    `Open this chapter in the presentation: ${url(presentationPath(ch.id))}`,
    '',
    `The write-up's index: ${url(WRITEUP_PATH)} ([Markdown](${mdUrl(WRITEUP_MD)}))`,
  ]);
}

// ---------------------------------------------------------------- the Q&A

/** /backup.md: the Q&A topics, each linked to its page and its Markdown. */
export function questionsIndexMarkdown(): string {
  const c: Ctx = { page: url(QUESTIONS_PATH) };
  return tidy([
    ...frontMatter({ title: QUESTIONS_TITLE, url: url(QUESTIONS_PATH), markdown_url: mdUrl(QUESTIONS_MD), author: AUTHOR, source: 'src/shared/writeup/questions.ts (the pages and these files are rendered from it)' }),
    `# ${INDEX_COPY.questionsTitle}`,
    '',
    inline(INDEX_COPY.questionsLede, c),
    '',
    ...QUESTION_PAGES.map((q) => `- [${q.title}](${url(questionPath(q.id))}) ([Markdown](${mdUrl(questionMd(q.id))})): ${inline(q.blurb, c)}`),
    '',
    `The write-up, one page per chapter: ${url(WRITEUP_PATH)} ([Markdown](${mdUrl(WRITEUP_MD)}))`,
  ]);
}

/** /backup/<id>.md: one Q&A page. */
export function questionMarkdown(q: QuestionPage): string {
  const page = url(questionPath(q.id));
  const c: Ctx = { page };
  return tidy([
    ...frontMatter({ title: q.title, part_of: QUESTIONS_TITLE, url: page, markdown_url: mdUrl(questionMd(q.id)), author: AUTHOR, source: 'src/shared/writeup/questions.ts (the page and this file are rendered from it)' }),
    `# ${q.title}`,
    '',
    inline(q.lede, c),
    '',
    ...blocks(q.blocks, 1, c),
    '---',
    '',
    'The other questions:',
    '',
    ...QUESTION_PAGES.filter((x) => x !== q).map((x) => `- [${x.title}](${url(questionPath(x.id))}) ([Markdown](${mdUrl(questionMd(x.id))}))`),
  ]);
}
