/**
 * The shapes the write-up and Q&A are written in, and the two inline marks they use. Plain data,
 * no React and no Worker imports, so the pages (src/web/pages/writeup) and the Markdown
 * (./markdown.ts, served by the Worker) can both load it.
 *
 * Inline text supports two marks only: **bold** and [label](href). An href is a site route
 * ("/ops"), an anchor on the same page ("#gaps") or an absolute URL.
 */

// ---------------------------------------------------------------- blocks

export type CardItem = {
  /** A small accent label above the title ("In", "Week 0"). */
  kicker?: string;
  /** A large accent figure above the title (a guardrail's target). */
  figure?: string;
  title: string;
  text?: string;
  bullets?: string[];
  numbered?: string[];
  /** Registry rows: a name, its status and a few facts. */
  entries?: { title: string; status: { label: string; tone: 'success' | 'neutral' }; meta: string[] }[];
  /** A quieter closing line under the body: a trade-off, a next step. */
  note?: string;
  /** The recommended or most important card in a group. */
  accent?: boolean;
};

export type TableRow = { head: string; sub?: string; cells: string[] };

export type FlowStep = { title: string; text: string; when?: string; ok?: string; last?: boolean };

export type CostShare = { label: string; share: number; note: string };

export type CostBlock = {
  kind: 'cost';
  /** Recorded values: what the Markdown states and what the page falls back to. */
  recorded: { perCallUsd: number; runs: number; p50Ms: number };
  limitText: string;
  /** What happens at the limit: shown under the figures. */
  replay: { title: string; text: string };
  split: CostShare[];
  splitNote: string;
};

export type Block =
  | { kind: 'p'; text: string }
  /** A quiet line naming where the figures above come from. */
  | { kind: 'source'; text: string }
  | { kind: 'callout'; tone?: 'neutral' | 'warning'; title?: string; text: string }
  | { kind: 'quote'; text: string; cite: string }
  | { kind: 'cards'; cols?: 1 | 2 | 3 | 4; items: CardItem[] }
  | { kind: 'steps'; items: { title: string; text: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'qa'; items: { q: string; a: string }[] }
  | { kind: 'table'; label: string; head: string[]; rows: TableRow[]; accentCol?: number; /** Column widths in percent, for the page. */ widths?: number[] }
  | { kind: 'h3'; text: string }
  | { kind: 'flow'; title: string; summary: string; steps: FlowStep[] }
  | { kind: 'related'; label: string; links: { to: string; label: string }[] }
  | { kind: 'action'; to: string; label: string }
  | CostBlock;

export type Section = {
  /** The anchor on its page. */
  id: string;
  title: string;
  /** The contents entry, when shorter than the title. */
  nav?: string;
  lede?: string;
  blocks: Block[];
};

// ---------------------------------------------------------------- pages

export type ChapterGroup = 'Introduction' | 'The platform' | 'Closing';

/** One page per chapter of the presentation: /write-up/<id>. */
export type ChapterPage = {
  /** The chapter id, also the presentation's (src/tour/script/chapters.ts; a unit test keeps them in step). */
  id: string;
  number: number;
  group: ChapterGroup;
  /** Which of the brief's four questions it answers (./brief.ts). */
  question: 1 | 2 | 3 | 4;
  title: string;
  /** One line for the index. */
  summary: string;
  /** The page's opening: what the chapter is about, in two or three short sentences. */
  lede: string;
  sections: Section[];
};

/** One page per Q&A topic: /backup/<id>. */
export type QuestionPage = {
  /** The topic in BACKUPS (src/tour/script/chapters.ts). */
  id: string;
  number: number;
  title: string;
  /** One line for the indexes. */
  blurb: string;
  lede: string;
  blocks: Block[];
};

// ---------------------------------------------------------------- inline marks

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };

const MARKS = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(MARKS)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: s.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2] ?? '', href: m[3] ?? '' });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}

/** The text without marks: for titles, aria labels and tests. */
export const plain = (s: string): string =>
  parseInline(s)
    .map((p) => p.text)
    .join('');
