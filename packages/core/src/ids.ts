/** Small, dependency-free id helper. Deterministic ids are used in tests via `makeIdFactory`. */
export type Id = string;

let counter = 0;

export function newId(prefix = "id"): Id {
  counter += 1;
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rand = c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}

/** Returns a deterministic id factory (for tests and seeded generation). */
export function makeIdFactory(seedPrefix: string): (prefix?: string) => Id {
  let n = 0;
  return (prefix = "id") => {
    n += 1;
    return `${prefix}_${seedPrefix}${n}`;
  };
}
