/**
 * All scenario cards: 48 hand-authored featured cards + ~220 programmatic backfill cards.
 * Assigns folders and human-facing call ids (by date; C-1042 is pinned).
 * Run directly to write data/scenarios/cards.json for inspection:
 *   node --env-file=.env scripts/data/scenarios.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Card } from './lib/types.ts';
import { buildBackfillCards } from './scenarios/backfill.ts';
import { FEATURED_CARDS, TOUR_FILES } from './scenarios/featured.ts';
import { DATA_DIR } from './world.ts';

export { TOUR_FILES };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** The local calendar date in the card's own offset. */
function localDate(startedAt: string): Date {
  return new Date(`${startedAt.slice(0, 10)}T12:00:00Z`);
}

export function folderFor(card: Card): string {
  const d = localDate(card.startedAt);
  switch (card.render) {
    case 'md':
    case 'txt_dump':
      return `Notes/${MONTHS[d.getUTCMonth()]}`;
    case 'eml':
      return 'Email';
    case 'chat_slack':
      return 'Slack exports';
    default:
      return `Calls/Week ${isoWeek(d)}`;
  }
}

export function allCards(): Card[] {
  const cards = [...FEATURED_CARDS, ...buildBackfillCards()].map((c) => ({ ...c, folder: c.folder || folderFor(c) }));

  // Ids and filenames must be unique.
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.fileId)) throw new Error(`duplicate fileId ${c.fileId}`);
    ids.add(c.fileId);
    const key = `${c.folder}/${c.filename}`;
    if (names.has(key)) throw new Error(`duplicate path ${key}`);
    names.add(key);
  }

  // Call ids by start time; C-1042 is pinned and the rest number outward from it.
  const pinned = cards.find((c) => c.callId === 'C-1042');
  if (!pinned) throw new Error('C-1042 card missing');
  const pinnedT = new Date(pinned.startedAt).getTime();
  const others = cards.filter((c) => c !== pinned).sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.fileId.localeCompare(b.fileId));
  const before = others.filter((c) => new Date(c.startedAt).getTime() <= pinnedT);
  const after = others.filter((c) => new Date(c.startedAt).getTime() > pinnedT);
  const fmt = (n: number): string => `C-${String(n).padStart(4, '0')}`;
  before.reverse().forEach((c, i) => (c.callId = fmt(1041 - i)));
  after.forEach((c, i) => (c.callId = fmt(1043 + i)));
  return cards;
}

if (import.meta.main) {
  const cards = allCards();
  const dir = join(DATA_DIR, 'scenarios');
  mkdirSync(dir, { recursive: true });
  const slim = cards.map(({ handAuthored: _h, ...rest }) => rest);
  writeFileSync(join(dir, 'cards.json'), JSON.stringify(slim, null, 2) + '\n');
  const featured = cards.filter((c) => c.featured).length;
  const insights = cards.reduce((s, c) => s + c.insights.length, 0);
  console.log(`cards: ${cards.length} (${featured} featured, ${cards.length - featured} backfill), ${insights} planted insights`);
  const byTheme = new Map<string, number>();
  for (const c of cards) for (const i of c.insights) if (i.themeId) byTheme.set(i.themeId, (byTheme.get(i.themeId) ?? 0) + 1);
  console.log([...byTheme.entries()].map(([k, v]) => `${k}:${v}`).join('  '));
}
