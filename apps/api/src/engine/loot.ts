import { ItemSlotSchema, type ExpeditionType, type ItemSlot, type Rarity, type StatKey } from '@unlikelyland/contracts';
import { ITEM, LOOT, REWARDS } from './rules';
import { Rng } from './rng';

/**
 * Pure loot helpers — no DB, fully deterministic from a seeded {@link Rng}. These
 * decide WHAT kind of reward should drop (rarity, slot bias) and how to generate
 * a balanced, budget-capped stat block for a server-minted item. The DB-touching
 * selection (querying the approved catalog) lives in LootService; keeping the
 * math here makes it unit-testable without a database.
 */

const ALL_SLOTS: ItemSlot[] = [...ItemSlotSchema.options];

/**
 * Rarity weights for a character level. Starts from the reward table and nudges
 * rare/epic up gently with level (capped) so high-level players see slightly
 * better drops without flooding the economy. Legendary/absurd stay at 0 for
 * random drops — those are admin/special-grant only.
 */
export function rarityWeightsForLevel(level: number): Record<Rarity, number> {
  const base = REWARDS.RARITY_WEIGHTS;
  const lvl = Math.max(1, level);
  return {
    common: base.common,
    uncommon: base.uncommon,
    rare: Math.min(LOOT.MAX_RARE_WEIGHT, base.rare + lvl * LOOT.RARE_WEIGHT_PER_LEVEL),
    epic: Math.min(LOOT.MAX_EPIC_WEIGHT, base.epic + lvl * LOOT.EPIC_WEIGHT_PER_LEVEL),
    legendary: base.legendary,
    absurd: base.absurd,
  };
}

/** Weighted pick over a record of key → weight. Returns null if all weights are 0. */
export function pickWeighted<K extends string>(rng: Rng, weights: Record<K, number>): K | null {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let pick = rng.next() * total;
  for (const [key, w] of entries) {
    pick -= w;
    if (pick <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Roll a drop rarity, level-aware. Falls back to common. */
export function rollRarity(rng: Rng, level = 1): Rarity {
  return pickWeighted(rng, rarityWeightsForLevel(level)) ?? 'common';
}

/** Relative slot weight for an expedition type (used to bias which item drops). */
export function slotWeight(expeditionType: ExpeditionType, slot: ItemSlot): number {
  const bias = LOOT.SLOT_BIAS_BY_EXPEDITION[expeditionType];
  if (!bias) return 1;
  return bias[slot] ?? 1;
}

/**
 * Given the slots actually available among candidate drops, pick one biased by
 * the expedition type. Returns null if no candidates.
 */
export function pickSlotForExpedition(
  rng: Rng,
  expeditionType: ExpeditionType,
  availableSlots: ItemSlot[],
): ItemSlot | null {
  const uniq = Array.from(new Set(availableSlots));
  if (uniq.length === 0) return null;
  const weights = {} as Record<ItemSlot, number>;
  for (const s of uniq) weights[s] = Math.max(0, slotWeight(expeditionType, s));
  // If the expedition zeroes every available slot, fall back to uniform.
  const anyPositive = Object.values(weights).some((w) => w > 0);
  if (!anyPositive) for (const s of uniq) weights[s] = 1;
  return pickWeighted(rng, weights);
}

export interface GeneratedModifiers {
  statModifiers: Partial<Record<StatKey, number>>;
  powerBudget: number;
}

/**
 * Deterministically generate a balanced stat block for an item of the given slot
 * and rarity. The total never exceeds the rarity's power budget and no single
 * stat exceeds the per-rarity cap. Consumables get no stat modifiers (their value
 * is the consumable effect). This is how the server — never the AI — assigns the
 * numbers on an approved item concept.
 */
export function generateBalancedModifiers(slot: ItemSlot, rarity: Rarity, seed: number): GeneratedModifiers {
  const affinity = ITEM.SLOT_STAT_AFFINITY[slot] ?? [];
  if (affinity.length === 0) return { statModifiers: {}, powerBudget: 0 };

  const rng = new Rng(seed >>> 0);
  const budget = ITEM.RARITY_POWER_BUDGET[rarity] ?? 3;
  const maxPerStat = ITEM.RARITY_MAX_STAT_MOD[rarity] ?? 1;

  const maxStats = Math.min(affinity.length, Math.max(1, Math.ceil(budget / maxPerStat)), 3);
  const count = rng.int(1, maxStats);

  // Shuffle the affinity list deterministically, then take `count`.
  const pool = [...affinity];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, count);

  const mods: Partial<Record<StatKey, number>> = {};
  let remaining = budget;
  for (let i = 0; i < chosen.length; i++) {
    const slotsLeft = chosen.length - i;
    // Leave at least 1 point for each remaining stat.
    const maxForThis = Math.min(maxPerStat, remaining - (slotsLeft - 1));
    if (maxForThis < 1) break;
    const v = i === chosen.length - 1 ? Math.min(maxPerStat, remaining) : rng.int(1, maxForThis);
    mods[chosen[i]] = (mods[chosen[i]] ?? 0) + v;
    remaining -= v;
  }

  const powerBudget = Object.values(mods).reduce((a, b) => a + Math.abs(b ?? 0), 0);
  return { statModifiers: mods, powerBudget };
}

export { ALL_SLOTS };
