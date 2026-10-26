/**
 * Chunked extraction for long inputs. The redacted turns are split into overlapping windows
 * (each window re-reads the end of the previous one, so an insight that spans a boundary is
 * seen whole at least once), every window is extracted in parallel, and the results are merged:
 * the same insight found in two windows (same type, and a near-identical summary or overlapping
 * evidence) is kept once, at its higher confidence. Turn ids are the document's own, so
 * grounding still runs against the full document.
 */
import type { ExtractionOutput, Turn } from '../shared/contracts.ts';
import { EXTRACT_CHUNKING } from '../shared/scoring.ts';

export type ChunkOptions = { thresholdChars: number; windowChars: number; overlapChars: number };
export type WindowTurn = Pick<Turn, 'id' | 'speaker' | 'role' | 'text'>;
export type ExtractWindow = { index: number; turns: WindowTurn[]; from: string; to: string; chars: number };
export type Candidate = ExtractionOutput['insights'][number];

/** Length of a turn as rendered for the model ("[t001] Speaker (role): text\n"). */
export function renderedChars(t: WindowTurn): number {
  return t.id.length + t.speaker.length + t.text.length + (t.role === 'unknown' ? 6 : 16);
}

/**
 * A turn longer than a whole window (a document with no paragraph breaks) is cut on sentence
 * boundaries into pieces that keep its id, so no single window is oversized.
 */
function pieces(t: WindowTurn, max: number): WindowTurn[] {
  if (renderedChars(t) <= max) return [t];
  const budget = Math.max(200, max - (renderedChars(t) - t.text.length));
  const out: WindowTurn[] = [];
  let rest = t.text;
  while (rest.length > budget) {
    const slice = rest.slice(0, budget);
    const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '), slice.lastIndexOf('\n'));
    const at = cut > budget * 0.5 ? cut + 1 : slice.lastIndexOf(' ') > budget * 0.5 ? slice.lastIndexOf(' ') : budget;
    out.push({ ...t, text: rest.slice(0, at).trim() });
    rest = rest.slice(at).trim();
  }
  if (rest) out.push({ ...t, text: rest });
  return out;
}

/** Overlapping windows of turns; a single window when the input is under the threshold. */
export function splitTurns(turns: WindowTurn[], opts: ChunkOptions = EXTRACT_CHUNKING): ExtractWindow[] {
  const total = turns.reduce((s, t) => s + renderedChars(t), 0);
  const make = (index: number, ts: WindowTurn[]): ExtractWindow => ({ index, turns: ts, from: ts[0]?.id ?? '', to: ts[ts.length - 1]?.id ?? '', chars: ts.reduce((s, t) => s + renderedChars(t), 0) });
  if (total <= opts.thresholdChars || !turns.length) return [make(0, turns)];
  const units = turns.flatMap((t) => pieces(t, opts.windowChars));
  const windows: ExtractWindow[] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let chars = 0;
    while (end < units.length && (end === start || chars + renderedChars(units[end]!) <= opts.windowChars)) chars += renderedChars(units[end++]!);
    windows.push(make(windows.length, units.slice(start, end)));
    if (end >= units.length) break;
    // The next window starts far enough back to re-read at least overlapChars, and always moves on.
    let back = end;
    let overlap = 0;
    while (back > start + 1 && overlap < opts.overlapChars) overlap += renderedChars(units[--back]!);
    start = back;
  }
  return windows;
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'be', 'it', 'its', 'their', 'they', 'that', 'this', 'as', 'at', 'by', 'from', 'not', 'no']);

function words(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}

/** Content-word Jaccard similarity of two summaries (0..1). */
export function summarySimilarity(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Two quotes overlap when one contains the other, or they share most of the shorter one's words. */
export function quotesOverlap(a: string, b: string): boolean {
  const na = words(a).join(' ');
  const nb = words(b).join(' ');
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const A = new Set(na.split(' '));
  const B = new Set(nb.split(' '));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.7;
}

/** The same insight found twice: same type, and a near-identical summary or overlapping evidence. */
export function sameInsight(a: Candidate, b: Candidate): boolean {
  if (a.type !== b.type) return false;
  if (summarySimilarity(a.summary, b.summary) >= 0.6) return true;
  return a.evidence.some((x) => b.evidence.some((y) => (!x.turn_id || !y.turn_id || x.turn_id === y.turn_id) && quotesOverlap(x.quote, y.quote)));
}

/** Merge per-window extractions in window order, keeping the higher-confidence copy of a duplicate. */
export function mergeExtractions(parts: ExtractionOutput[]): { insights: Candidate[]; duplicates: number } {
  const kept: Candidate[] = [];
  let duplicates = 0;
  for (const ins of parts.flatMap((p) => p.insights)) {
    const i = kept.findIndex((k) => sameInsight(k, ins));
    if (i < 0) {
      kept.push(ins);
      continue;
    }
    duplicates++;
    if (ins.confidence > kept[i]!.confidence) kept[i] = ins;
  }
  return { insights: kept, duplicates };
}
