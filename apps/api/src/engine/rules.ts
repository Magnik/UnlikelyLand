import type { EncounterType, ExpeditionType, RewardProfile, RiskLevel } from '@unlikelyland/contracts';

/**
 * Centralised, tunable game constants. ALL gameplay numbers live here so the
 * balance surface is one file, not scattered magic numbers. Services and the
 * engine import from here; nothing hardcodes its own values.
 */

export const STAMINA = {
  /** Default maximum stamina pool for a new character. */
  MAX_DEFAULT: 100,
  /** Milliseconds to regenerate one stamina point (1 point / 5 minutes). */
  REGEN_MS: 5 * 60 * 1000,
} as const;

export const LEVELING = {
  /** xpForNext(level) = round(BASE * level^EXP). Gentle quadratic-ish curve. */
  BASE: 50,
  EXP: 1.45,
  MAX_LEVEL: 100,
} as const;

/**
 * Per-expedition-type configuration. `fallbackPool` is the seeded content pool
 * used when AI is offline (AI may produce a more specific encounterType).
 * Several expedition types map onto the five seeded fallback pools.
 */
export const EXPEDITIONS: Record<
  ExpeditionType,
  { encounterType: EncounterType; fallbackPool: EncounterType; staminaPerStep: number; steps: number; label: string }
> = {
  explore: { encounterType: 'exploration', fallbackPool: 'exploration', staminaPerStep: 12, steps: 3, label: 'Explore' },
  fight: { encounterType: 'combat', fallbackPool: 'combat', staminaPerStep: 14, steps: 3, label: 'Pick a Fight' },
  scavenge: { encounterType: 'scavenging', fallbackPool: 'scavenging', staminaPerStep: 8, steps: 3, label: 'Scavenge' },
  socialize: { encounterType: 'social', fallbackPool: 'social', staminaPerStep: 10, steps: 3, label: 'Socialize' },
  investigate: { encounterType: 'mystery', fallbackPool: 'exploration', staminaPerStep: 12, steps: 3, label: 'Investigate' },
  train: { encounterType: 'training', fallbackPool: 'training', staminaPerStep: 10, steps: 3, label: 'Train' },
  work: { encounterType: 'work', fallbackPool: 'scavenging', staminaPerStep: 10, steps: 3, label: 'Work a Shift' },
};

/** Stat-check difficulty by risk level (roll d20 + stat + level/2 + luck vs this). */
export const DIFFICULTY_BY_RISK: Record<RiskLevel, number> = {
  low: 10,
  medium: 14,
  high: 18,
  ridiculous: 23,
};

export const COMBAT = {
  PLAYER_BASE_HP: 30,
  HP_PER_TOUGHNESS: 3,
  HP_PER_LEVEL: 5,
  PLAYER_BASE_CRIT: 0.05,
  CRIT_PER_ACCURACY: 0.004,

  ENEMY_BASE_HP: 22,
  ENEMY_HP_PER_POWER: 6,
  ENEMY_BASE_ATK: 5,
  ENEMY_ATK_PER_POWER: 1.5,
  ENEMY_BASE_DEF: 2,
  ENEMY_DEF_PER_POWER: 0.8,
  ENEMY_BASE_AGI: 4,
  ENEMY_AGI_PER_POWER: 0.6,
  ENEMY_BASE_ACC: 6,
  ENEMY_ACC_PER_POWER: 0.7,
  ENEMY_CRIT: 0.05,

  /** Hit chance = clamp(BASE_HIT + (acc - agi) * HIT_PER_POINT, MIN_HIT, MAX_HIT). */
  BASE_HIT: 0.6,
  HIT_PER_POINT: 0.03,
  MIN_HIT: 0.1,
  MAX_HIT: 0.95,

  DMG_VARIANCE: 2,
  MAX_ROUNDS: 24,
  /** Risk → enemy power tier added on top of player level. */
  RISK_TIER: { low: 0, medium: 1, high: 3, ridiculous: 5 } as Record<RiskLevel, number>,
} as const;

export const REWARDS = {
  BASE_XP: { low: 8, medium: 14, high: 22, ridiculous: 34 } as Record<RiskLevel, number>,
  /** On failure, rewards shrink to this fraction (you still learn something). */
  FAILURE_FACTOR: 0.35,
  /** Each point of positive margin adds this fraction to rewards (capped). */
  MARGIN_BONUS_PER_POINT: 0.03,
  MARGIN_BONUS_CAP: 0.6,

  /** Base normal-currency (Clams) payout by reward profile. */
  BASE_NORMAL: { safe: 6, balanced: 10, risky: 16, strange: 12 } as Record<RewardProfile, number>,
  NORMAL_VARIANCE: 0.4,

  /** Crafting (Oddments) tends to come from scavenging/work. */
  CRAFTING_BY_TYPE: { scavenging: 3, work: 3, exploration: 1, mystery: 1, combat: 1, social: 0, training: 0, default: 1 } as Record<string, number>,
  /** Reputation (Notoriety) from social/honor-flavoured wins. */
  BASE_REPUTATION: { social: 2, mystery: 1, combat: 1, exploration: 0, scavenging: 0, training: 0, work: 0, default: 0 } as Record<string, number>,

  /** Per-encounter hard caps — abuse / exploit ceiling regardless of formula. */
  MAX_XP_PER_ENCOUNTER: 80,
  MAX_NORMAL_PER_ENCOUNTER: 60,
  MAX_CRAFTING_PER_ENCOUNTER: 12,
  MAX_REPUTATION_PER_ENCOUNTER: 8,

  /** Item drop chance on a successful encounter, before rarity roll. */
  ITEM_DROP_CHANCE: { safe: 0.08, balanced: 0.14, risky: 0.22, strange: 0.18 } as Record<RewardProfile, number>,
  /** Rarity weights for a drop (kept low-power for safe auto-grant). */
  RARITY_WEIGHTS: { common: 62, uncommon: 27, rare: 9, epic: 2, legendary: 0, absurd: 0 } as Record<string, number>,

  /** Completing all steps of an expedition grants this flat bonus * step count. */
  EXPEDITION_COMPLETE_XP: 20,
  EXPEDITION_COMPLETE_NORMAL: 18,
} as const;

export const PERSONALITY = {
  /** How far a single choice nudges a personality stat (clamped 0..100). */
  NUDGE: 1,
  /** Larger nudge for high-conviction (ridiculous) choices. */
  NUDGE_BIG: 2,
} as const;

export const DEATH = {
  /** Base revive wait; grows with death count so repeat deaths sting a little. */
  BASE_WAIT_MS: 10 * 60 * 1000,
  WAIT_GROWTH_PER_DEATH: 0.5,
  MAX_WAIT_MS: 60 * 60 * 1000,
  /** Pay-to-revive cost in normal currency (Clams), scales with death count. */
  PAY_BASE_COST: 25,
  PAY_COST_PER_DEATH: 15,
  /** Chance, rolled at death, that a weird event lets the player revive free. */
  FREE_REVIVE_CHANCE: 0.15,
} as const;

/**
 * Personality stat focuses drift the character's personality when chosen; combat
 * and social focuses don't. This is how "helping NPCs raises honor/empathy,
 * reckless choices raise bravery" emerges from play.
 */
export const PERSONALITY_FOCUS = new Set<string>([
  'weirdness',
  'bravery',
  'caution',
  'curiosity',
  'mischief',
  'honor',
]);
