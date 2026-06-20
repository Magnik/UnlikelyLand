import type { StatBlock, StatKey } from '@unlikelyland/contracts';

export interface EffectiveStatsResult {
  effective: StatBlock;
  /** Per-stat total contributed by the supplied modifier maps. */
  modTotals: Partial<Record<StatKey, number>>;
}

/**
 * The ONE place base stats and equipped-item modifiers are combined. Pure and
 * DB-free so it is trivially unit-testable; CharactersService.getEffectiveStatsView
 * delegates here, and combat/encounter resolution use that, so the numbers a
 * player sees and the numbers the engine rolls against can never diverge.
 *
 * Unknown modifier keys (anything not a real stat) are ignored, so a malformed or
 * hostile statModifiers blob can't introduce phantom stats.
 */
export function combineEffectiveStats(
  base: StatBlock,
  modifierMaps: Array<Record<string, number> | null | undefined>,
): EffectiveStatsResult {
  const effective: StatBlock = { ...base };
  const modTotals: Partial<Record<StatKey, number>> = {};
  for (const mods of modifierMaps) {
    if (!mods) continue;
    for (const [k, v] of Object.entries(mods)) {
      if (k in effective && typeof v === 'number') {
        const key = k as StatKey;
        effective[key] += v;
        modTotals[key] = (modTotals[key] ?? 0) + v;
      }
    }
  }
  return { effective, modTotals };
}
