/**
 * Ground (code, not the LLM): every quote the model returns must be found in the redacted
 * transcript. exact substring → normalized substring → sliding-window Levenshtein over word
 * boundaries. Quotes stitched with "..." are grounded piece by piece, in order.
 */
import { distance } from 'fastest-levenshtein';
import { THRESHOLDS, type Evidence, type Turn } from '../shared/contracts.ts';

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm', 'uh-huh']);
const MARKERS = /\[(?:crosstalk|inaudible|laughs?|laughter|pause|silence|music|noise|unintelligible|overlapping|cross talk|background noise)[^\]]*\]/gi;

export type Normalized = { text: string; map: number[] };

/**
 * Lowercase, fold quotes/dashes/diacritics, drop punctuation, filler words and ASR markers,
 * collapse whitespace. `map[i]` is the index in the original string of normalized char i.
 */
export function normalize(input: string): Normalized {
  const chars: string[] = [];
  const map: number[] = [];
  const src = input.replace(MARKERS, (m) => ' '.repeat(m.length));
  let lastSpace = true;
  for (let i = 0; i < src.length; i++) {
    let c = src[i]!;
    c = c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    c = c.toLowerCase();
    if (/[a-z0-9_]/.test(c) || /\p{L}|\p{N}/u.test(c)) {
      chars.push(c);
      map.push(i);
      lastSpace = false;
    } else if (/['’]/.test(c)) {
      // apostrophes vanish: "don't" ≈ "dont"
      continue;
    } else if (!lastSpace) {
      chars.push(' ');
      map.push(i);
      lastSpace = true;
    }
  }
  // Remove filler words (whole tokens) while keeping the map aligned.
  const outChars: string[] = [];
  const outMap: number[] = [];
  let i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && chars[j] !== ' ') j++;
    const word = chars.slice(i, j).join('');
    if (word && !FILLERS.has(word)) {
      for (let k = i; k < j; k++) {
        outChars.push(chars[k]!);
        outMap.push(map[k]!);
      }
      if (j < chars.length) {
        outChars.push(' ');
        outMap.push(map[j]!);
      }
    }
    i = j + 1;
  }
  while (outChars.length && outChars[outChars.length - 1] === ' ') {
    outChars.pop();
    outMap.pop();
  }
  return { text: outChars.join(''), map: outMap };
}

export type GroundHit = { start: number; end: number; score: number; method: Evidence['method'] };

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - distance(a, b) / max;
}

/** Best fuzzy window of `q` inside normalized doc `n` (word-aligned). Returns normalized indices. */
function fuzzyWindow(q: string, n: string): { start: number; end: number; score: number } | null {
  if (!q || !n) return null;
  const starts: number[] = [0];
  for (let i = 1; i < n.length; i++) if (n[i - 1] === ' ') starts.push(i);
  const ends: number[] = [];
  for (let i = 0; i < n.length; i++) if (n[i + 1] === ' ' || i === n.length - 1) ends.push(i + 1);
  const qWords = new Set(q.split(' '));
  const L = q.length;
  const minLen = Math.floor(L * 0.75);
  const maxLen = Math.ceil(L * 1.3);
  let best: { start: number; end: number; score: number } | null = null;
  let e0 = 0;
  for (const s of starts) {
    while (e0 < ends.length && ends[e0]! - s < minLen) e0++;
    // Cheap prefilter: the window must share words with the quote.
    const probe = n.slice(s, Math.min(n.length, s + maxLen));
    let shared = 0;
    for (const w of probe.split(' ')) if (qWords.has(w)) shared++;
    if (shared < Math.min(2, qWords.size) || shared / qWords.size < 0.4) continue;
    for (let k = e0; k < ends.length && ends[k]! - s <= maxLen; k++) {
      const score = similarity(q, n.slice(s, ends[k]!));
      if (!best || score > best.score + 1e-9) best = { start: s, end: ends[k]!, score };
    }
  }
  return best;
}

function toOriginal(norm: Normalized, start: number, end: number, original: string): { start: number; end: number } {
  const s = norm.map[start] ?? 0;
  const e = (norm.map[Math.max(start, end - 1)] ?? original.length - 1) + 1;
  return { start: s, end: Math.min(original.length, e) };
}

/** Ground one quote fragment (no stitching). `docNorm` is normalize(doc), cached by the caller. */
export function groundFragment(quote: string, doc: string, docNorm: Normalized = normalize(doc), threshold: number = THRESHOLDS.grounding): GroundHit & { ok: boolean } {
  const trimmed = quote.trim().replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  if (!trimmed) return { ok: false, start: -1, end: -1, score: 0, method: 'failed' };
  const exact = doc.indexOf(trimmed);
  if (exact >= 0) return { ok: true, start: exact, end: exact + trimmed.length, score: 1, method: 'exact' };
  const qn = normalize(trimmed).text;
  if (!qn) return { ok: false, start: -1, end: -1, score: 0, method: 'failed' };
  const ni = docNorm.text.indexOf(qn);
  if (ni >= 0) {
    const span = toOriginal(docNorm, ni, ni + qn.length, doc);
    return { ok: true, ...span, score: 1, method: 'normalized' };
  }
  const fw = fuzzyWindow(qn, docNorm.text);
  if (fw) {
    const span = toOriginal(docNorm, fw.start, fw.end, doc);
    const score = Math.round(fw.score * 1000) / 1000;
    return { ok: score >= threshold, ...span, score, method: score >= threshold ? 'fuzzy' : 'failed' };
  }
  return { ok: false, start: -1, end: -1, score: 0, method: 'failed' };
}

const METHOD_RANK: Record<Evidence['method'], number> = { exact: 0, normalized: 1, fuzzy: 2, failed: 3 };

/** Ground a model quote (stitched "a ... b" quotes are grounded piecewise, in order). */
export function groundQuote(
  quote: string,
  turnId: string | null,
  doc: string,
  turns: Turn[],
  docNorm: Normalized = normalize(doc),
  threshold: number = THRESHOLDS.grounding,
): Evidence {
  const pieces = quote.split(/\s*(?:\.{3,}|…|\[\.\.\.\])\s*/).map((p) => p.trim()).filter((p) => normalize(p).text.length >= 4);
  let hits: (GroundHit & { ok: boolean })[];
  if (pieces.length > 1) {
    hits = [];
    let cursor = 0;
    for (const p of pieces) {
      // Search from the previous piece onward so pieces stay in order.
      const sub = doc.slice(cursor);
      const h = groundFragment(p, sub, normalize(sub), threshold);
      hits.push(h.ok ? { ...h, start: h.start + cursor, end: h.end + cursor } : h);
      if (h.ok) cursor += h.end;
    }
  } else {
    hits = [groundFragment(quote, doc, docNorm, threshold)];
  }
  const ok = hits.every((h) => h.ok);
  const score = Math.min(...hits.map((h) => h.score));
  if (!ok) {
    return { quote, turnId, start: null, end: null, matchedText: null, score: Math.round(score * 1000) / 1000, method: 'failed' };
  }
  const start = hits[0]!.start;
  const end = hits[hits.length - 1]!.end;
  const method = hits.reduce<Evidence['method']>((m, h) => (METHOD_RANK[h.method] > METHOD_RANK[m] ? h.method : m), 'exact');
  const turn = turns.find((t) => start >= t.start && start < t.end) ?? turns.find((t) => start <= t.end) ?? null;
  return { quote, turnId: turn?.id ?? turnId, start, end, matchedText: doc.slice(start, end), score, method };
}
