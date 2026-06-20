import { describe, expect, it } from 'vitest';
import { defaultStatBlock } from '@unlikelyland/contracts';
import { combineEffectiveStats } from './effective-stats';

describe('combineEffectiveStats', () => {
  it('returns base stats unchanged when nothing is equipped', () => {
    const base = defaultStatBlock();
    const { effective, modTotals } = combineEffectiveStats(base, []);
    expect(effective).toEqual(base);
    expect(Object.keys(modTotals)).toHaveLength(0);
  });

  it('sums modifiers from multiple equipped items', () => {
    const base = defaultStatBlock(); // every stat at 5
    const { effective, modTotals } = combineEffectiveStats(base, [
      { strength: 2, accuracy: 1 },
      { strength: 1 },
    ]);
    expect(effective.strength).toBe(8);
    expect(effective.accuracy).toBe(6);
    expect(modTotals.strength).toBe(3);
    expect(modTotals.accuracy).toBe(1);
  });

  it('does not mutate the base stat block', () => {
    const base = defaultStatBlock();
    combineEffectiveStats(base, [{ strength: 5 }]);
    expect(base.strength).toBe(5);
  });

  it('ignores unknown/phantom stat keys (no injection via statModifiers)', () => {
    const base = defaultStatBlock();
    const { effective } = combineEffectiveStats(base, [{ notARealStat: 99, charisma: 2 } as Record<string, number>]);
    expect((effective as Record<string, number>).notARealStat).toBeUndefined();
    expect(effective.charisma).toBe(7);
  });

  it('handles negative modifiers', () => {
    const base = defaultStatBlock();
    const { effective, modTotals } = combineEffectiveStats(base, [{ agility: -2 }]);
    expect(effective.agility).toBe(3);
    expect(modTotals.agility).toBe(-2);
  });
});
