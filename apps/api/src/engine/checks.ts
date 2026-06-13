import type { RiskLevel } from '@unlikelyland/contracts';
import { DIFFICULTY_BY_RISK } from './rules';
import type { Rng } from './rng';

export interface CheckResult {
  roll: number;
  statValue: number;
  difficulty: number;
  total: number;
  success: boolean;
  margin: number;
  crit: boolean;
  fumble: boolean;
}

/**
 * Core stat check. Roll d20, add the focused stat, a small level bonus, and a
 * "luck" term from weirdness (weird characters bend probability in their favour).
 *
 *   total = d20 + statValue + floor(level / 2) + floor(weirdness / 25)
 *
 * Natural 20 always succeeds (crit); natural 1 always fails (fumble). Otherwise
 * success is total >= difficulty, where difficulty comes from the choice's risk.
 */
export function resolveCheck(
  statValue: number,
  level: number,
  weirdness: number,
  riskLevel: RiskLevel,
  rng: Rng,
): CheckResult {
  const roll = rng.int(1, 20);
  const luck = Math.floor(weirdness / 25);
  const levelBonus = Math.floor(level / 2);
  const total = roll + statValue + levelBonus + luck;
  const difficulty = DIFFICULTY_BY_RISK[riskLevel];

  const crit = roll === 20;
  const fumble = roll === 1;
  const success = crit || (!fumble && total >= difficulty);

  return {
    roll,
    statValue,
    difficulty,
    total,
    success,
    margin: total - difficulty,
    crit,
    fumble,
  };
}
