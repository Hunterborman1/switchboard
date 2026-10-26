/**
 * The write-up and Q&A as Markdown, rendered from the same content as the page (./content.ts),
 * so the two cannot say different things. Served at /write-up.md, put in the docs .zip and
 * offered over MCP (src/worker/mcp/docs.ts).
 *
 * Where the page shows a live number, this states the recorded value and says it is live on
 * the page.
 */
import { BUDGET_LIMIT_USD } from '../contracts.ts';
import { SITE_URL } from '../platform.ts';
import { HERO, PARTS, QUESTIONS, QUESTIONS_INTRO, WRITEUP_TITLE, parseInline, type Block, type CardItem, type CostBlock, type Section } from './content.ts';

const PAGE_URL = `${SITE_URL}/write-up`;

/** Site routes and page anchors become absolute: the file is read away from the site. */
export function absoluteHref(href: string): string {
  if (href.startsWith('#')) return `${PAGE_URL}${href}`;
  if (href.startsWith('/')) return `${SITE_URL}${href}`;
  return href;
}

function inline(s: string): string {
  return parseInline(s)
    .map((p) => (p.kind === 'bold' ? `**${p.text}**` : p.kind === 'link' ? `[${p.text}](${absoluteHref(p.href)})` : p.text))
    .join('');
}

const cell = (s: string) => inline(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const usd = (n: number, d: number) => `$${n.toFixed(d)}`;

function card(c: CardItem): string {
  const head = [c.kicker, c.figure ? `${c.figure}` : undefined].filter(Boolean);
  const title = head.length ? `${head.join(', ')}: ${c.title}` : c.title;
  const rich = c.bullets || c.numbered || c.entries;
  if (!rich) return `- **${title}.** ${inline(c.text ?? '')}`.trimEnd();
  const out: string[] = [`**${title}**`, ''];
  if (c.text) out.push(inline(c.text), '');
  if (c.entries) for (const e of c.entries) out.push(`- **${e.title}** (${e.status.label}): ${e.meta.join('; ')}`);
  if (c.bullets) for (const b of c.bullets) out.push(`- ${inline(b)}`);
  if (c.numbered) c.numbered.forEach((n, i) => out.push(`${i + 1}. ${inline(n)}`));
  if (c.note) out.push('', inline(c.note));
  return out.join('\n');
}

function cards(items: CardItem[]): string {
  // Simple cards read as one list; richer ones (lists inside) as their own paragraphs.
  const parts: string[] = [];
  let run: string[] = [];
  for (const c of items) {
    if (c.bullets || c.numbered || c.entries) {
      if (run.length) parts.push(run.join('\n'));
      run = [];
      parts.push(card(c));
    } else run.push(card(c));
  }
  if (run.length) parts.push(run.join('\n'));
  return parts.join('\n\n');
}

function cost(b: CostBlock): string {
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
    `**Live AI spending limit.** ${inline(b.limitText)}`,
    '',
    `> **${b.replay.title.replace(/[.:]$/, '')}.** ${inline(b.replay.text)}`,
    '',
    '**Where a call’s cost goes**',
    '',
    ...b.split.map((s) => `- ${s.label}: ${Math.round(s.share * 100)}%. ${s.note}.`),
    '',
    inline(b.splitNote),
  ].join('\n');
}

function block(b: Block, level: number): string {
  switch (b.kind) {
    case 'p':
      return inline(b.text);
    case 'callout': {
      const lead = b.title ? `**${b.title.replace(/[.:]$/, '')}.** ` : '';
      return `> ${lead}${inline(b.text)}`;
    }
    case 'cards':
      return cards(b.items);
    case 'steps':
      return b.items.map((s, i) => `${i + 1}. **${s.title}.** ${inline(s.text)}`).join('\n');
    case 'list':
      return b.items.map((s) => `- ${inline(s)}`).join('\n');
    case 'table': {
      const head = `| ${b.head.join(' | ')} |`;
      const rule = `|${b.head.map(() => '---').join('|')}|`;
      const rows = b.rows.map((r) => `| **${cell(r.head)}**${r.sub ? ` (${cell(r.sub)})` : ''} | ${r.cells.map(cell).join(' | ')} |`);
      return [head, rule, ...rows].join('\n');
    }
    case 'h3':
      return `${'#'.repeat(level + 1)} ${b.text}`;
    case 'flow':
      return [`**${b.title}.** ${inline(b.summary)}`, '', ...b.steps.map((s, i) => `${i + 1}. ${s.when ? `${s.when}: ` : ''}**${s.title}**, ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}.`)].join('\n');
    case 'related':
      return `${b.label}: ${b.links.map((l) => `[${l.label}](${absoluteHref(l.to)})`).join(', ')}.`;
    case 'action':
      return `[${b.label}](${absoluteHref(b.to)})`;
    case 'cost':
      return cost(b);
  }
}

function section(s: Section, level: number): string {
  const out = [`${'#'.repeat(level)} ${s.title}`, ''];
  if (s.lede) out.push(inline(s.lede), '');
  for (const b of s.blocks) out.push(block(b, level), '');
  return out.join('\n').trimEnd();
}

/** The whole page as one Markdown document. */
export function writeupMarkdown(): string {
  const contents = [
    ...PARTS.map((p) => `- [${p.nav ?? p.title}](${PAGE_URL}#${p.id})`),
    `- [${QUESTIONS_INTRO.title}](${PAGE_URL}#${QUESTIONS_INTRO.id})`,
    ...QUESTIONS.map((q) => `  - [${q.title}](${PAGE_URL}#${q.id})`),
  ];
  return [
    '---',
    `title: "${WRITEUP_TITLE}"`,
    `url: "${PAGE_URL}"`,
    `markdown_url: "${SITE_URL}/write-up.md"`,
    'author: "Hunter Borman"',
    'source: "src/shared/writeup/content.ts (the page and this file are rendered from it)"',
    '---',
    '',
    `# ${HERO.title}`,
    '',
    `${HERO.kicker}. ${inline(HERO.lede)}`,
    '',
    ...HERO.facts.map((f) => `- ${inline(f)}`),
    '',
    'This is the write-up page as Markdown, for AI assistants. It says the same things as the page; where the page shows a live number, this file gives the recorded value and says it is live on the page. Each heading has an anchor on the page, listed under Contents.',
    '',
    '## Contents',
    '',
    ...contents,
    '',
    ...PARTS.map((p) => `${section(p, 2)}\n`),
    section(QUESTIONS_INTRO, 2),
    '',
    ...QUESTIONS.map((q) => `${section(q, 3)}\n`),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}
