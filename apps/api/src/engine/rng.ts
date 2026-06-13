/**
 * Deterministic, seedable PRNG (mulberry32). Every gameplay roll — stat checks,
 * combat, reward variance, drop rolls — runs through one of these seeded from a
 * stable string (e.g. `${encounterId}:${choiceId}`), so an outcome is fully
 * reproducible for debugging and auditing. Never use Math.random() in the engine.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [minInclusive, maxInclusive]. */
  int(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) return minInclusive;
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean {
    return this.next() < Math.max(0, Math.min(1, p));
  }

  /** Uniformly pick one element. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

/** FNV-1a string hash → 32-bit seed. */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(...parts: (string | number)[]): Rng {
  return new Rng(seedFromString(parts.join(':')));
}
