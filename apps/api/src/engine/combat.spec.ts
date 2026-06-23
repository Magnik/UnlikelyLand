import { describe, expect, it } from 'vitest';
import { combatDeathChance, makeEnemy, makePlayerCombatant, resolveCombat } from './combat';
import { Rng } from './rng';
import { defaultStatBlock, type StatBlock } from '@unlikelyland/contracts';

function strongStats(): StatBlock {
  return defaultStatBlock(20);
}
function weakStats(): StatBlock {
  return defaultStatBlock(1);
}

describe('resolveCombat', () => {
  it('is deterministic for the same seed', () => {
    const run = () =>
      resolveCombat(makePlayerCombatant(defaultStatBlock(8), 3), makeEnemy('Test Crab', 3, 'medium'), new Rng(7));
    const a = run();
    const b = run();
    expect(a.playerWon).toBe(b.playerWon);
    expect(a.rounds.length).toBe(b.rounds.length);
    expect(a.playerHpRemaining).toBe(b.playerHpRemaining);
  });

  it('a strong, high-level player beats a weak low-tier enemy', () => {
    const player = makePlayerCombatant(strongStats(), 10);
    const enemy = makeEnemy('Mild Goose', 1, 'low');
    const result = resolveCombat(player, enemy, new Rng(123));
    expect(result.playerWon).toBe(true);
    expect(result.playerHpRemaining).toBeGreaterThan(0);
  });

  it('a weak player loses to a much stronger enemy', () => {
    const player = makePlayerCombatant(weakStats(), 1);
    const enemy = makeEnemy('Form Golem', 8, 'ridiculous');
    const result = resolveCombat(player, enemy, new Rng(5));
    expect(result.playerWon).toBe(false);
  });

  it('produces a non-empty, ordered combat log', () => {
    const player = makePlayerCombatant(defaultStatBlock(8), 3);
    const enemy = makeEnemy('Test Crab', 3, 'medium');
    const result = resolveCombat(player, enemy, new Rng(99));
    expect(result.rounds.length).toBeGreaterThan(0);
    for (const r of result.rounds) {
      expect(r.enemyHpAfter).toBeGreaterThanOrEqual(0);
      expect(r.playerHpAfter).toBeGreaterThanOrEqual(0);
      expect(typeof r.text).toBe('string');
    }
  });

  it('early-game enemies hit softer than full-strength ones of the same power', () => {
    // Level 4 is damped (<= EARLY_GAME_MAX_LEVEL); level 5 is not. Compare equal
    // total power: level 4 + medium(tier 1) = 5  vs  level 5 + low(tier 0) = 5.
    const damped = makeEnemy('Soft Crab', 4, 'medium');
    const full = makeEnemy('Hard Crab', 5, 'low');
    expect(damped.attack).toBeLessThan(full.attack);
  });
});

describe('combatDeathChance (losing a fight)', () => {
  it('is forgiving in the early game', () => {
    expect(combatDeathChance(1, 'medium')).toBeLessThan(0.2);
    expect(combatDeathChance(1, 'low')).toBeLessThan(0.1);
  });

  it('escalates with level and is near-certain past the ramp level', () => {
    expect(combatDeathChance(6, 'medium')).toBeGreaterThan(combatDeathChance(1, 'medium'));
    expect(combatDeathChance(12, 'medium')).toBeCloseTo(1.0);
    expect(combatDeathChance(50, 'medium')).toBeCloseTo(1.0); // clamps, never exceeds 1
  });

  it('orders by risk at a fixed level', () => {
    const lvl = 5;
    expect(combatDeathChance(lvl, 'low')).toBeLessThan(combatDeathChance(lvl, 'medium'));
    expect(combatDeathChance(lvl, 'medium')).toBeLessThan(combatDeathChance(lvl, 'high'));
    expect(combatDeathChance(lvl, 'high')).toBeLessThanOrEqual(combatDeathChance(lvl, 'ridiculous'));
  });

  it('caps low-risk lethality below certain death even at high level', () => {
    expect(combatDeathChance(50, 'low')).toBeCloseTo(0.4);
  });
});
