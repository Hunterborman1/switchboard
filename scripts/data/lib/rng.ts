/** Seeded, deterministic randomness for the data build. Same seed ⇒ same sequence. */

export type Rng = {
  /** Uniform float in [0, 1). */
  next: () => number;
  int: (minInclusive: number, maxInclusive: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  weighted: <T>(items: readonly T[], weights: readonly number[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
  /** Derive an independent child stream (stable for a given label). */
  fork: (label: string) => Rng;
};

/** FNV-1a 32-bit hash: turns any string into a seed. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  const base = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  let a = base;
  const next = (): number => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const rng: Rng = {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items, weights) => {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i] ?? 0;
        if (r < 0) return items[i] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    fork: (label) => createRng(hashSeed(`${base}:${label}`)),
  };
  return rng;
}
