/**
 * Seeded pseudo-random generator (mulberry32). Used wherever the core must be
 * reproducible: shop inventories, encounter rolls, fixture generation.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Weighted pick; weights must be non-negative and not all zero. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
}

export function hashSeed(input: string | number): number {
  if (typeof input === "number") return input >>> 0;
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function createRng(seed: string | number): Rng {
  let a = hashSeed(seed);
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error("pick() on empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[j] as (typeof out)[number];
        out[j] = tmp;
      }
      return out;
    },
    weighted(items) {
      const total = items.reduce((s, e) => s + Math.max(0, e.weight), 0);
      if (total <= 0) throw new Error("weighted() needs a positive total weight");
      let r = next() * total;
      for (const e of items) {
        r -= Math.max(0, e.weight);
        if (r <= 0) return e.item;
      }
      return (items[items.length - 1] as (typeof items)[number]).item;
    },
  };
  return rng;
}
