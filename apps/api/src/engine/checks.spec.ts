import { describe, expect, it } from 'vitest';
import { resolveCheck } from './checks';
import { Rng } from './rng';

/** Minimal Rng stub with a fixed `next()` value, to force a specific d20 roll. */
function stubRng(nextValue: number): Rng {
  const next = () => nextValue;
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[0],
  } as unknown as Rng;
}

describe('resolveCheck', () => {
  it('natural 20 always succeeds, even against a brutal difficulty', () => {
    const r = resolveCheck(1, 1, 0, 'ridiculous', stubRng(0.999));
    expect(r.roll).toBe(20);
    expect(r.crit).toBe(true);
    expect(r.success).toBe(true);
  });

  it('natural 1 always fails, even with huge stats', () => {
    const r = resolveCheck(99, 50, 100, 'low', stubRng(0));
    expect(r.roll).toBe(1);
    expect(r.fumble).toBe(true);
    expect(r.success).toBe(false);
  });

  it('is deterministic for a given rng', () => {
    const a = resolveCheck(8, 4, 10, 'medium', new Rng(42));
    const b = resolveCheck(8, 4, 10, 'medium', new Rng(42));
    expect(a).toEqual(b);
  });

  it('higher stat yields more successes across many seeds', () => {
    let lowWins = 0;
    let highWins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (resolveCheck(3, 1, 0, 'medium', new Rng(seed)).success) lowWins++;
      if (resolveCheck(15, 1, 0, 'medium', new Rng(seed)).success) highWins++;
    }
    expect(highWins).toBeGreaterThan(lowWins);
  });
});
