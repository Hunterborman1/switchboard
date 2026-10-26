/**
 * The write-up page and its Markdown (/write-up.md, the docs .zip, MCP read_doc) are rendered
 * from one module, src/shared/writeup/content.ts. These checks keep it honest: every section and
 * Q&A topic on the page has a heading in the Markdown, every sentence on the page is in it, the
 * Q&A topics match the presentation's backups, and the recorded cost figures match the data.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKUPS } from '../../../src/tour/script/chapters.ts';
import { HERO, QUESTION_IDS, QUESTIONS, SECTIONS, parseInline, plain, type Block, type CostBlock } from '../../../src/shared/writeup/content.ts';
import { absoluteHref, writeupMarkdown } from '../../../src/shared/writeup/markdown.ts';
import { SITE_URL } from '../../../src/shared/platform.ts';

const md = writeupMarkdown();
const headings = md
  .split('\n')
  .filter((l) => /^#{1,6} /.test(l))
  .map((l) => l.replace(/^#+ /, ''));
// The Markdown without its marks, to compare with the page's plain text.
const mdPlain = md.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

/** Every piece of prose a block puts on the page. */
function texts(b: Block): string[] {
  switch (b.kind) {
    case 'p':
      return [b.text];
    case 'callout':
      return [b.text, ...(b.title ? [b.title.replace(/[.:]$/, '')] : [])];
    case 'cards':
      return b.items.flatMap((c) => [c.title, c.kicker, c.figure, c.text, c.note, ...(c.bullets ?? []), ...(c.numbered ?? []), ...(c.entries ?? []).flatMap((e) => [e.title, e.status.label, ...e.meta])].filter((x): x is string => !!x));
    case 'steps':
      return b.items.flatMap((s) => [s.title, s.text]);
    case 'list':
      return b.items;
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

describe('write-up content', () => {
  it('has one Q&A section per presentation backup topic, in the same order', () => {
    expect(QUESTION_IDS).toEqual(BACKUPS.map((b) => b.topic));
  });

  it('gives every section a unique anchor', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
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

describe('write-up Markdown', () => {
  it('has a heading for every section and Q&A topic on the page', () => {
    expect(headings).toContain(HERO.title);
    for (const s of SECTIONS) expect(headings, s.id).toContain(s.title);
  });

  it('nests the Q&A topics under the Q&A heading', () => {
    for (const q of QUESTIONS) expect(md).toContain(`\n### ${q.title}\n`);
  });

  it('links every section to its anchor on the page', () => {
    for (const s of SECTIONS) expect(md).toContain(`${SITE_URL}/write-up#${s.id}`);
  });

  it('says everything the page says', () => {
    const page = [HERO.kicker, HERO.lede, ...HERO.facts, ...SECTIONS.flatMap((s) => [s.title, ...(s.lede ? [s.lede] : []), ...s.blocks.flatMap(texts)])].filter(Boolean);
    const missing = page.map(plain).filter((t) => !mdPlain.includes(t));
    expect(missing).toEqual([]);
  });

  it('states the recorded cost figures and says the page shows them live', () => {
    const cost = QUESTIONS.find((q) => q.id === 'cost')!.blocks.find((b): b is CostBlock => b.kind === 'cost')!;
    expect(md).toContain(`$${cost.recorded.perCallUsd.toFixed(5)}`);
    expect(md).toContain(`$${(cost.recorded.perCallUsd * 1000).toFixed(2)}`);
    expect(md).toContain(`${(cost.recorded.p50Ms / 1000).toFixed(1)} seconds`);
    expect(md).toMatch(/live from this deployment/);
  });

  it('only links to absolute URLs, since it is read away from the site', () => {
    const hrefs = [...md.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const h of hrefs) expect(h, h).toMatch(/^https:\/\//);
    expect(absoluteHref('#cost')).toBe(`${SITE_URL}/write-up#cost`);
    expect(absoluteHref('/ops')).toBe(`${SITE_URL}/ops`);
  });
});

describe('recorded cost figures', () => {
  it('match the recorded runs in data/replays', () => {
    const dir = new URL('../../../data/replays/', import.meta.url);
    const runs = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => (JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { run: { costUsd: number; durationMs: number } }).run);
    const cost = QUESTIONS.find((q) => q.id === 'cost')!.blocks.find((b): b is CostBlock => b.kind === 'cost')!;
    const mean = runs.reduce((a, r) => a + r.costUsd, 0) / runs.length;
    const durs = runs.map((r) => r.durationMs).sort((a, b) => a - b);
    expect(cost.recorded.runs).toBe(runs.length);
    expect(cost.recorded.perCallUsd).toBeCloseTo(mean, 5);
    // The same median the page computes from live runs: the middle of the sorted list.
    expect(cost.recorded.p50Ms).toBe(durs[Math.floor(durs.length / 2)]);
  });
});
