import { describe, expect, it } from 'vitest';
import { computeReward } from './rewards';
import { REWARDS } from './rules';
import { Rng } from './rng';

describe('computeReward', () => {
  it('a success pays more XP than a failure for the same choice', () => {
    const base = { riskLevel: 'high', rewardProfile: 'risky', encounterType: 'combat', level: 1 } as const;
    const win = computeReward({ ...base, success: true, margin: 5, rng: new Rng(1) });
    const lose = computeReward({ ...base, success: false, margin: -5, rng: new Rng(1) });
    expect(win.xp).toBeGreaterThan(lose.xp);
  });

  it('never grants premium currency from gameplay', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = computeReward({
        riskLevel: 'ridiculous',
        rewardProfile: 'strange',
        encounterType: 'combat',
        success: true,
        margin: 20,
        level: 5,
        rng: new Rng(seed),
      });
      expect(r.premium).toBe(0);
    }
  });

  it('respects per-encounter hard caps for every channel', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = computeReward({
        riskLevel: 'ridiculous',
        rewardProfile: 'risky',
        encounterType: 'scavenging',
        success: true,
        margin: 100,
        level: 10,
        rng: new Rng(seed),
      });
      expect(r.xp).toBeLessThanOrEqual(REWARDS.MAX_XP_PER_ENCOUNTER);
      expect(r.normal).toBeLessThanOrEqual(REWARDS.MAX_NORMAL_PER_ENCOUNTER);
      expect(r.crafting).toBeLessThanOrEqual(REWARDS.MAX_CRAFTING_PER_ENCOUNTER);
      expect(r.reputation).toBeLessThanOrEqual(REWARDS.MAX_REPUTATION_PER_ENCOUNTER);
    }
  });

  it('grants no crafting or reputation on failure', () => {
    const r = computeReward({
      riskLevel: 'medium',
      rewardProfile: 'balanced',
      encounterType: 'scavenging',
      success: false,
      margin: -2,
      level: 1,
      rng: new Rng(3),
    });
    expect(r.crafting).toBe(0);
    expect(r.reputation).toBe(0);
  });

  it('social encounters yield reputation but no crafting on success', () => {
    const r = computeReward({
      riskLevel: 'low',
      rewardProfile: 'safe',
      encounterType: 'social',
      success: true,
      margin: 3,
      level: 1,
      rng: new Rng(8),
    });
    expect(r.crafting).toBe(0);
    expect(r.reputation).toBeGreaterThan(0);
  });
});
