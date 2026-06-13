import { describe, expect, it } from 'vitest';
import { levelFromXp, xpForNextLevel } from './leveling';
import { LEVELING } from './rules';

describe('leveling', () => {
  it('starts at level 1 with 0 xp', () => {
    const s = levelFromXp(0);
    expect(s.level).toBe(1);
    expect(s.xpIntoLevel).toBe(0);
    expect(s.xpForNext).toBe(xpForNextLevel(1));
  });

  it('xpForNextLevel increases monotonically', () => {
    for (let l = 1; l < 30; l++) {
      expect(xpForNextLevel(l + 1)).toBeGreaterThan(xpForNextLevel(l));
    }
  });

  it('levels up exactly at the threshold', () => {
    const need = xpForNextLevel(1);
    expect(levelFromXp(need - 1).level).toBe(1);
    expect(levelFromXp(need).level).toBe(2);
    expect(levelFromXp(need).xpIntoLevel).toBe(0);
  });

  it('cumulative xp resolves to the right level and remainder', () => {
    const total = xpForNextLevel(1) + xpForNextLevel(2) + 5;
    const s = levelFromXp(total);
    expect(s.level).toBe(3);
    expect(s.xpIntoLevel).toBe(5);
  });

  it('clamps at MAX_LEVEL', () => {
    const s = levelFromXp(Number.MAX_SAFE_INTEGER);
    expect(s.level).toBe(LEVELING.MAX_LEVEL);
  });
});
