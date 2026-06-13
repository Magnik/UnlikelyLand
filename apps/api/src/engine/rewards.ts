import type { EncounterType, Rarity, RewardProfile, RiskLevel } from '@unlikelyland/contracts';
import { REWARDS } from './rules';
import type { Rng } from './rng';

export interface RewardInput {
  riskLevel: RiskLevel;
  rewardProfile: RewardProfile;
  encounterType: EncounterType;
  success: boolean;
  margin: number;
  rng: Rng;
}

export interface RewardResult {
  xp: number;
  normal: number;
  crafting: number;
  reputation: number;
  premium: number;
  itemDrop: { rarity: Rarity } | null;
}

/** Margin multiplier shared by every reward channel, clamped to a sane range. */
function performanceMultiplier(success: boolean, margin: number): number {
  if (!success) return REWARDS.FAILURE_FACTOR;
  const bonus = Math.min(REWARDS.MARGIN_BONUS_CAP, Math.max(0, margin) * REWARDS.MARGIN_BONUS_PER_POINT);
  return 1 + bonus;
}

function rollRarity(rng: Rng): Rarity {
  const weights = REWARDS.RARITY_WEIGHTS;
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let pick = rng.int(1, total);
  for (const [rarity, w] of entries) {
    pick -= w;
    if (pick <= 0) return rarity;
  }
  return 'common';
}

/**
 * Compute the validated reward for a resolved choice. This is the ONLY place
 * rewards are derived — the AI and client never supply numbers. Every channel
 * is clamped to a per-encounter cap (REWARDS.MAX_*) as an exploit ceiling.
 */
export function computeReward(input: RewardInput): RewardResult {
  const { riskLevel, rewardProfile, encounterType, success, margin, rng } = input;
  const mult = performanceMultiplier(success, margin);

  // XP
  const baseXp = REWARDS.BASE_XP[riskLevel];
  const xp = clamp(Math.round(baseXp * mult), 0, REWARDS.MAX_XP_PER_ENCOUNTER);

  // Normal currency (Clams) with ± variance.
  const baseNormal = REWARDS.BASE_NORMAL[rewardProfile];
  const variance = 1 + (rng.next() * 2 - 1) * REWARDS.NORMAL_VARIANCE;
  const normal = clamp(Math.round(baseNormal * mult * variance), 0, REWARDS.MAX_NORMAL_PER_ENCOUNTER);

  // Crafting (Oddments) — only on success, biased toward scavenging/work.
  const baseCrafting = REWARDS.CRAFTING_BY_TYPE[encounterType] ?? REWARDS.CRAFTING_BY_TYPE.default;
  const crafting = success
    ? clamp(Math.round(baseCrafting * mult), 0, REWARDS.MAX_CRAFTING_PER_ENCOUNTER)
    : 0;

  // Reputation (Notoriety) — only on success, biased toward social/mystery.
  const baseRep = REWARDS.BASE_REPUTATION[encounterType] ?? REWARDS.BASE_REPUTATION.default;
  const reputation = success
    ? clamp(Math.round(baseRep * mult), 0, REWARDS.MAX_REPUTATION_PER_ENCOUNTER)
    : 0;

  // Premium currency is never granted from ordinary gameplay in MVP.
  const premium = 0;

  // Item drop — only on success.
  let itemDrop: { rarity: Rarity } | null = null;
  if (success) {
    const dropChance = REWARDS.ITEM_DROP_CHANCE[rewardProfile];
    if (rng.chance(dropChance)) {
      itemDrop = { rarity: rollRarity(rng) };
    }
  }

  return { xp, normal, crafting, reputation, premium, itemDrop };
}

/** Flat completion bonus for finishing every step of an expedition. */
export function expeditionCompletionReward(steps: number): { xp: number; normal: number } {
  return {
    xp: clamp(REWARDS.EXPEDITION_COMPLETE_XP * steps, 0, REWARDS.MAX_XP_PER_ENCOUNTER * 2),
    normal: clamp(REWARDS.EXPEDITION_COMPLETE_NORMAL * steps, 0, REWARDS.MAX_NORMAL_PER_ENCOUNTER * 2),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
