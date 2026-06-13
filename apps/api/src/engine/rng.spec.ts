import { describe, expect, it } from 'vitest';
import { Rng, rngFor, seedFromString } from './rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const r1 = new Rng(1);
    const r2 = new Rng(2);
    const a = Array.from({ length: 10 }, () => r1.next());
    const b = Array.from({ length: 10 }, () => r2.next());
    expect(a).not.toEqual(b);
  });

  it('int stays within the inclusive range', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('seedFromString is stable and order-sensitive', () => {
    expect(seedFromString('a:b')).toBe(seedFromString('a:b'));
    expect(seedFromString('a:b')).not.toBe(seedFromString('b:a'));
  });

  it('rngFor seeds from joined parts', () => {
    const a = rngFor('enc', 1, 'wrestle');
    const b = rngFor('enc', 1, 'wrestle');
    expect(a.next()).toBe(b.next());
  });
});
