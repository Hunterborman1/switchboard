/**
 * Quote relocation: find where a golden quote ended up in the final (corrupted) text and return
 * the exact substring. Exact → normalized → fuzzy sliding window (fastest-levenshtein).
 * Pure functions; unit tested in tests/unit/data/relocate.test.ts.
 */
import { distance } from 'fastest-levenshtein';

export type Located = { start: number; end: number; text: string; score: number; method: 'exact' | 'normalized' | 'fuzzy' };

const KEEP = /[\p{L}\p{N}]/u;

/** Lowercase, fold curly quotes/accents-insensitive-ish, keep letters and digits, single spaces; with a map back to original offsets. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (KEEP.test(ch)) {
      if (pendingSpace && norm.length > 0) {
        norm += ' ';
        map.push(i);
      }
      pendingSpace = false;
      const lower = ch.toLowerCase();
      for (const part of lower) {
        norm += part;
        map.push(i);
      }
    } else if (ch === "'" || ch === '’') {
      // drop apostrophes inside words: "don't" → "dont"
      continue;
    } else {
      pendingSpace = true;
    }
  }
  return { norm, map };
}

export function normalize(text: string): string {
  return normalizeWithMap(text).norm;
}

export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

type Word = { w: string; start: number; end: number };

function words(text: string): Word[] {
  const out: Word[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
  for (const m of text.matchAll(re)) {
    const w = normalize(m[0]);
    if (w) out.push({ w, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function locateQuote(text: string, quote: string, minScore = 0.72): Located | null {
  const q = quote.trim();
  if (!q) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length, text: q, score: 1, method: 'exact' };

  const { norm, map } = normalizeWithMap(text);
  const nq = normalize(q);
  if (!nq) return null;
  const ni = norm.indexOf(nq);
  if (ni >= 0) {
    const start = map[ni] as number;
    const endIdx = map[ni + nq.length - 1] as number;
    // extend the end over the rest of a multi-unit char
    const end = endIdx + 1;
    return { start, end, text: text.slice(start, end), score: 1, method: 'normalized' };
  }

  const ws = words(text);
  const qw = nq.split(' ');
  const n = qw.length;
  if (!ws.length) return null;
  const join = (i: number, len: number): string => ws.slice(i, i + len).map((x) => x.w).join(' ');

  // pass 1: same-length windows
  const coarse: { i: number; s: number }[] = [];
  for (let i = 0; i + Math.min(n, ws.length) <= ws.length; i++) coarse.push({ i, s: similarity(join(i, n), nq) });
  coarse.sort((a, b) => b.s - a.s);
  const seeds = coarse.slice(0, 8);

  // pass 2: refine start and length around the best seeds
  let best: { i: number; len: number; s: number } | null = null;
  const slack = Math.max(2, Math.ceil(n * 0.35));
  for (const seed of seeds) {
    for (let di = -3; di <= 3; di++) {
      const i = seed.i + di;
      if (i < 0 || i >= ws.length) continue;
      for (let len = Math.max(1, n - slack); len <= n + slack; len++) {
        if (i + len > ws.length) break;
        const s = similarity(join(i, len), nq);
        if (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) < 1e-9 && Math.abs(len - n) < Math.abs(best.len - n))) best = { i, len, s };
      }
    }
  }
  if (!best || best.s < minScore) return null;
  const start = (ws[best.i] as Word).start;
  const end = (ws[best.i + best.len - 1] as Word).end;
  return { start, end, text: text.slice(start, end), score: best.s, method: 'fuzzy' };
}
