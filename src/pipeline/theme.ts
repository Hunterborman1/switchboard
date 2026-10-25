/**
 * Theme: deterministic membership. Each insight joins the nearest theme of the same type
 * when cosine similarity ≥ threshold, else starts a candidate theme (which later insights in
 * the same run can join). The LLM only names themes; it never decides membership.
 */
import type { InsightType, ProductArea } from '../shared/contracts.ts';
import { THEME_JOIN_THRESHOLD } from '../shared/scoring.ts';
import type { ThemeCandidate } from './types.ts';
import { fnv1a } from './util.ts';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type ThemeItem = { key: string; type: InsightType; productArea: ProductArea; vector: number[]; summary: string };

export type ThemeAssignment = {
  key: string;
  themeId: string | null; // existing theme joined
  newThemeKey: string | null; // candidate created in this run (key of the founding item)
  score: number;
  matchedName: string | null;
};

/**
 * @param candidates per item key: nearest existing themes (already filtered to the viewer's
 *                   visible workspaces), any order.
 */
export function assignThemes(items: ThemeItem[], candidates: Map<string, ThemeCandidate[]>, threshold: number = THEME_JOIN_THRESHOLD): ThemeAssignment[] {
  const created: ThemeItem[] = [];
  const out: ThemeAssignment[] = [];
  for (const item of items) {
    const existing = (candidates.get(item.key) ?? []).filter((c) => c.type === item.type).sort((a, b) => b.score - a.score || a.themeId.localeCompare(b.themeId));
    const bestExisting = existing[0];
    let bestNew: { item: ThemeItem; score: number } | null = null;
    for (const c of created) {
      if (c.type !== item.type) continue;
      const s = cosine(c.vector, item.vector);
      if (!bestNew || s > bestNew.score) bestNew = { item: c, score: s };
    }
    if (bestExisting && bestExisting.score >= threshold && (!bestNew || bestExisting.score >= bestNew.score)) {
      out.push({ key: item.key, themeId: bestExisting.themeId, newThemeKey: null, score: bestExisting.score, matchedName: bestExisting.name });
    } else if (bestNew && bestNew.score >= threshold) {
      out.push({ key: item.key, themeId: null, newThemeKey: bestNew.item.key, score: bestNew.score, matchedName: null });
    } else {
      created.push(item);
      out.push({ key: item.key, themeId: null, newThemeKey: item.key, score: bestExisting?.score ?? 0, matchedName: null });
    }
  }
  return out;
}

/**
 * Deterministic 768-d feature-hashing embedding (unigrams + bigrams, signed). Used only when
 * Workers AI is unreachable (local dev without credentials, tests); similarity is lexical.
 */
export function hashEmbed(text: string, dims = 768): number[] {
  const v = new Array<number>(dims).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const feats = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)];
  for (const f of feats) {
    const h = fnv1a(f);
    v[h % dims]! += (h >>> 31) & 1 ? -1 : 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Text that represents an insight for embedding. */
export function themeText(i: { type: string; productArea: string; summary: string }): string {
  return `${i.type.replace(/_/g, ' ')} · ${i.productArea.replace(/_/g, ' ')}: ${i.summary}`;
}
