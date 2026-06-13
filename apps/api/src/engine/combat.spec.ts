import { describe, expect, it } from 'vitest';
import { makeEnemy, makePlayerCombatant, resolveCombat } from './combat';
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
});
