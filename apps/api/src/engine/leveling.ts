import { LEVELING } from './rules';

/** XP required to advance from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  return Math.round(LEVELING.BASE * Math.pow(level, LEVELING.EXP));
}

export interface LevelState {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
}

/** Resolve a cumulative XP total into level + progress. */
export function levelFromXp(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));

  while (level < LEVELING.MAX_LEVEL) {
    const needed = xpForNextLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level += 1;
  }

  if (level >= LEVELING.MAX_LEVEL) {
    return { level: LEVELING.MAX_LEVEL, xpIntoLevel: 0, xpForNext: xpForNextLevel(LEVELING.MAX_LEVEL) };
  }

  return { level, xpIntoLevel: remaining, xpForNext: xpForNextLevel(level) };
}
