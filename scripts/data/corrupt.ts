/**
 * Seeded, deterministic corruption that takes a clean transcript to a target mess level.
 * Pure functions: same input + level + seed ⇒ same output. Noise grows monotonically with level.
 *
 *   1–2  none (clean notes / tidy transcript)
 *   3    light disfluency: fillers, stutters
 *   4    raw speech-to-text: homophones of product names, dropped punctuation and casing,
 *        [inaudible], [crosstalk], diarization bleed across turn boundaries
 *   5    level 4, heavier, plus merged turns and a truncated start
 *
 * Protected quotes (golden evidence) never get fillers, stutters, [inaudible] or a turn split
 * inside them; they do get homophones, casing and punctuation loss, like everything else.
 */
import { createRng, type Rng } from './lib/rng.ts';
import type { GenTurn } from './lib/types.ts';
import { distance } from 'fastest-levenshtein';
import { normalize } from './relocate.ts';

export type CorruptParams = {
  filler: number; // per sentence/clause start
  stutter: number; // per word
  inaudible: number; // per word
  crosstalk: number; // per turn boundary
  bleed: number; // per turn boundary: words drift to the neighbouring speaker
  merge: number; // per turn boundary: two turns collapse into one
  lowercase: number; // per turn
  punctDrop: number; // per punctuation mark
  homophone: number; // per product-name occurrence
  truncateStart: boolean;
};

const ZERO: CorruptParams = { filler: 0, stutter: 0, inaudible: 0, crosstalk: 0, bleed: 0, merge: 0, lowercase: 0, punctDrop: 0, homophone: 0, truncateStart: false };

export const LEVEL_PARAMS: Record<1 | 2 | 3 | 4 | 5, CorruptParams> = {
  1: ZERO,
  2: ZERO,
  3: { ...ZERO, filler: 0.05, stutter: 0.008 },
  4: { filler: 0.09, stutter: 0.02, inaudible: 0.006, crosstalk: 0.12, bleed: 0.1, merge: 0, lowercase: 0.92, punctDrop: 0.75, homophone: 0.85, truncateStart: false },
  5: { filler: 0.11, stutter: 0.03, inaudible: 0.014, crosstalk: 0.2, bleed: 0.16, merge: 0.08, lowercase: 1, punctDrop: 0.9, homophone: 0.95, truncateStart: true },
};

export function paramsFor(level: number): CorruptParams {
  const l = Math.max(1, Math.min(5, Math.round(level))) as 1 | 2 | 3 | 4 | 5;
  return LEVEL_PARAMS[l];
}

/** How speech-to-text mishears product, partner and competitor names. */
export const HOMOPHONES: [RegExp, string[]][] = [
  [/\bInvoca\b/g, ['in vocal', 'invoke a', 'in voca', 'invoka']],
  [/\bCallRail\b/g, ['call rail', 'Call Rail', 'car rail']],
  [/\bPreSense\b/g, ['presence', 'pre sense', 'pre-sense']],
  [/\bSignal AI\b/g, ['signal a eye', 'signal A.I.', 'single AI', 'signal ai']],
  [/\bSignal Discovery\b/g, ['signal discovery', 'single discovery']],
  [/\bSalesforce\b/g, ['sales force', 'salesforce']],
  [/\bGoogle Ads\b/g, ['google adds', 'Google ads', 'google ad']],
  [/\bSmart Bidding\b/g, ['smart bidding', 'smart betting']],
  [/\bGenesys\b/g, ['genesis', 'Genesis']],
  [/\bFive9\b/g, ['five nine', '5 9']],
  [/\bMarchex\b/g, ['mar checks', 'marquex', 'mark ex']],
  [/\bCallTrackingMetrics\b/g, ['call tracking metrics']],
  [/\bWhatConverts\b/g, ['what converts']],
  [/\bDNI\b/g, ['d n i', 'DMI']],
  [/\bGCLID\b/g, ['g clid', 'gee click id']],
  [/\bHIPAA\b/g, ['hippa', 'HIPPA']],
  [/\bQBR\b/g, ['q b r', 'QVR']],
  [/\bQM\b/g, ['q m', 'Q.M.', 'QM']],
  [/\bLooker\b/g, ['luker', 'looker']],
  [/\bGong\b/g, ['gone', 'gong']],
  [/\bCPA\b/g, ['c p a', 'CPA']],
  [/\bIVR\b/g, ['i v r', 'IVR']],
  [/\bAmazon Connect\b/g, ['amazon connect']],
  [/\bAI\b/g, ['a i', 'AI', 'A.I.']],
];

const FILLERS = ['um', 'uh', 'like', 'you know', 'I mean', 'so', 'uh,', 'um,'];
const COMMON_START = new Set(
  'the a an and but so we our it its it\'s that that\'s this they there you your my he she his her what when where how if well yeah yes no okay ok right just then also took got been was is are do does did can could would honestly actually like now one'.split(' '),
);
const STUTTER_OK = /^(i|we|the|it|so|and|that|but|they|you|it's|that's|our|my|a|to)$/i;

type Tok = { text: string; space: boolean; protected: boolean };

/** Word tokens plus a protected flag for words inside any protected quote. */
function tokenize(text: string, protect: string[]): Tok[] {
  const words = text.split(/\s+/).filter(Boolean);
  const toks: Tok[] = words.map((w) => ({ text: w, space: true, protected: false }));
  const norms = words.map((w) => normalize(w));
  for (const q of protect) {
    const qn = normalize(q).split(' ').filter(Boolean);
    if (!qn.length) continue;
    for (let i = 0; i < norms.length; i++) {
      // match ignoring empty-normalized tokens
      let j = 0;
      let k = i;
      while (k < norms.length && j < qn.length) {
        const n = norms[k] as string;
        if (!n) {
          k++;
          continue;
        }
        // a token may normalize to several words ("don't" → "dont", "e-mail" → "e mail")
        const parts = n.split(' ');
        let ok = true;
        for (const p of parts) {
          if (qn[j] !== p) {
            ok = false;
            break;
          }
          j++;
        }
        if (!ok) break;
        k++;
      }
      if (j >= qn.length) {
        for (let x = i; x < k; x++) (toks[x] as Tok).protected = true;
        break;
      }
    }
  }
  return toks;
}

function joinToks(toks: Tok[]): string {
  return toks.map((t) => t.text).join(' ');
}

export function turnIsProtected(text: string, protect: string[]): boolean {
  const n = normalize(text);
  return protect.some((q) => {
    const qn = normalize(q);
    return qn.length > 0 && n.includes(qn);
  });
}

export function applyHomophones(text: string, rng: Rng, p: number): string {
  if (p <= 0) return text;
  let out = text;
  for (const [re, variants] of HOMOPHONES) out = out.replace(re, (m) => (rng.chance(p) ? rng.pick(variants) : m));
  return out;
}

function dropPunctuation(text: string, rng: Rng, p: number): string {
  if (p <= 0) return text;
  return text.replace(/[.,!;:?](?=\s|$)/g, (m) => (m === '?' ? (rng.chance(p * 0.5) ? '' : m) : rng.chance(p) ? '' : m));
}

function lowercase(text: string): string {
  // keep bracketed markers as-is
  return text.replace(/\[[^\]]*\]|[^[]+/g, (seg) => (seg.startsWith('[') ? seg : seg.toLowerCase()));
}

/** Word-level noise on one turn (fillers, stutters, inaudible) with protected words skipped. */
function noiseWords(text: string, rng: Rng, p: CorruptParams, protect: string[]): string {
  if (!p.filler && !p.stutter && !p.inaudible) return text;
  const toks = tokenize(text, protect);
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok;
    const prev = out[out.length - 1];
    const clauseStart = i === 0 || /[.,?!]$/.test(prev?.text ?? '');
    if (!t.protected && !(prev?.protected && (toks[i + 1]?.protected ?? false))) {
      if (rng.chance(clauseStart ? p.filler : p.filler * 0.12)) {
        const f = rng.pick(FILLERS);
        const comma = f.endsWith(',') ? '' : ',';
        const sentenceStart = i === 0 || /[.?!]$/.test(prev?.text ?? '');
        out.push({ text: sentenceStart ? f.charAt(0).toUpperCase() + f.slice(1) + comma : f + comma, space: true, protected: false });
        // the original first word is no longer sentence-initial
        if (sentenceStart && COMMON_START.has(t.text.replace(/[^\w']/g, '').toLowerCase()) && /^[A-Z][a-z]/.test(t.text)) t.text = t.text.charAt(0).toLowerCase() + t.text.slice(1);
      }
      if (STUTTER_OK.test(t.text.replace(/[^\w']/g, '')) && rng.chance(p.stutter * 2.5)) {
        out.push({ text: t.text.replace(/[.,?!]$/, ''), space: true, protected: false });
      }
      if (rng.chance(p.inaudible)) {
        const n = rng.int(1, 2);
        let k = 0;
        while (k < n && i + k < toks.length && !(toks[i + k] as Tok).protected) k++;
        if (k > 0) {
          const last = toks[i + k - 1] as Tok;
          const trail = /[.,?!]$/.test(last.text) ? last.text.slice(-1) : '';
          out.push({ text: `[inaudible]${trail}`, space: true, protected: false });
          i += k - 1;
          continue;
        }
      }
    }
    out.push(t);
  }
  return joinToks(out);
}

/** Corrupt speaker turns to the target level. */
export function corruptTurns(turns: GenTurn[], level: number, seed: string, protect: string[] = []): GenTurn[] {
  const p = paramsFor(level);
  const rng = createRng(`turns:${seed}:${level}`);
  let out: GenTurn[] = turns.map((t) => ({ speaker: t.speaker, text: t.text }));
  if (p === ZERO) return out;

  // 1. word-level noise
  out = out.map((t) => ({ speaker: t.speaker, text: noiseWords(t.text, rng, p, protect) }));

  // 2. structure: merges, diarization bleed, crosstalk
  if (p.merge || p.bleed || p.crosstalk) {
    const res: GenTurn[] = [];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i] as GenTurn;
      const next = out[i + 1];
      if (next && rng.chance(p.merge)) {
        res.push({ speaker: cur.speaker, text: `${cur.text} ${next.text}` });
        i++;
        continue;
      }
      if (next && rng.chance(p.bleed)) {
        const curProt = turnIsProtected(cur.text, protect);
        const nextProt = turnIsProtected(next.text, protect);
        const cw = cur.text.split(' ');
        const nw = next.text.split(' ');
        const k = rng.int(1, 4);
        if (rng.chance(0.5) && !curProt && cw.length > k + 3) {
          // tail of this turn heard as the next speaker
          out[i + 1] = { speaker: next.speaker, text: `${cw.slice(-k).join(' ')} ${next.text}` };
          res.push({ speaker: cur.speaker, text: cw.slice(0, -k).join(' ') });
          continue;
        }
        if (!nextProt && nw.length > k + 3) {
          // head of the next turn heard as this speaker
          res.push({ speaker: cur.speaker, text: `${cur.text} ${nw.slice(0, k).join(' ')}` });
          out[i + 1] = { speaker: next.speaker, text: nw.slice(k).join(' ') };
          continue;
        }
      }
      if (next && rng.chance(p.crosstalk)) {
        res.push({ speaker: cur.speaker, text: `${cur.text} [crosstalk]` });
        continue;
      }
      res.push(cur);
    }
    out = res;
  }

  // 3. truncated start (recording began mid-sentence)
  if (p.truncateStart && out.length > 2) {
    const first = out[0] as GenTurn;
    const w = first.text.split(' ');
    if (!turnIsProtected(first.text, protect) && w.length > 6) out[0] = { speaker: first.speaker, text: `... ${w.slice(rng.int(2, Math.min(5, w.length - 3))).join(' ')}` };
  }

  // 4. surface: homophones, punctuation, casing
  out = out.map((t) => {
    let text = applyHomophones(t.text, rng, p.homophone);
    text = dropPunctuation(text, rng, p.punctDrop);
    if (rng.chance(p.lowercase)) text = lowercase(text);
    return { speaker: t.speaker, text: text.replace(/\s+/g, ' ').trim() };
  });
  return out.filter((t) => t.text.length > 0);
}

const ABBREV: [RegExp, string][] = [
  [/\bbecause\b/gi, 'b/c'], [/\bwith\b/gi, 'w/'], [/\bwithout\b/gi, 'w/o'], [/\baccount\b/gi, 'acct'], [/\bcustomer\b/gi, 'cust'],
  [/\bright now\b/gi, 'rn'], [/\bto be honest\b/gi, 'tbh'], [/\bplease\b/gi, 'pls'], [/\bthanks\b/gi, 'thx'], [/\btransfer(s)?\b/gi, 'xfer$1'],
  [/\bmeeting\b/gi, 'mtg'], [/\bbetween\b/gi, 'btwn'], [/\btomorrow\b/gi, 'tmrw'], [/\band\b/gi, '&'], [/\bconversations?\b/gi, 'convo'],
];

function typo(word: string, rng: Rng): string {
  if (word.length < 5 || !/^[a-z]+$/i.test(word)) return word;
  const i = rng.int(1, word.length - 3);
  return rng.chance(0.5)
    ? word.slice(0, i) + (word[i + 1] ?? '') + (word[i] ?? '') + word.slice(i + 2) // swap
    : word.slice(0, i) + word.slice(i + 1); // drop
}

/** Written shorthand noise for Slack messages and scratch notes. */
export function corruptShorthand(text: string, level: number, seed: string, protect: string[] = []): string {
  if (level < 5) return text;
  const rng = createRng(`short:${seed}:${level}`);
  const lines = text.split('\n').map((line) => {
    if (!line.trim()) return line;
    const toks = tokenize(line, protect);
    const words = toks.map((t) => (t.protected || !rng.chance(0.012) ? t.text : typo(t.text, rng)));
    let l = line.match(/^\s*/)?.[0] + words.join(' ');
    for (const [re, rep] of ABBREV) l = l.replace(re, (m, g1?: string) => (rng.chance(0.55) ? rep.replace('$1', typeof g1 === 'string' ? g1 : '') : m));
    if (rng.chance(0.45)) l = lowercase(l);
    return l;
  });
  return lines.join('\n');
}

/** Normalized edit distance between two renderings (0 = identical). */
export function noiseScore(clean: string, noisy: string): number {
  if (!clean.length && !noisy.length) return 0;
  return distance(clean, noisy) / Math.max(clean.length, noisy.length);
}

/** Timeline in seconds for each turn: start offset, speaking rate, gaps; drift and overlap at level 4+. */
export function timeline(turns: GenTurn[], level: number, seed: string): { start: number; end: number }[] {
  const rng = createRng(`time:${seed}`);
  let t = 2 + rng.next() * 6;
  const drift = level >= 4;
  return turns.map((turn) => {
    const words = turn.text.split(/\s+/).length;
    const dur = Math.max(0.8, (words / 2.6) * (0.85 + rng.next() * 0.3));
    let start = t;
    if (drift) start += (rng.next() - 0.5) * 1.6; // timestamps wander, sometimes overlapping
    const span = { start: Math.max(0, start), end: Math.max(0, start) + dur };
    t += dur + 0.2 + rng.next() * 1.3;
    if (drift && rng.chance(0.05)) t += 4 + rng.next() * 8; // a gap where the recorder lost audio
    return span;
  });
}
