import type { EncounterType, ExpeditionType, ItemSlot, Rarity, RewardProfile, RiskLevel, StatKey } from '@unlikelyland/contracts';

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
  {
    encounterType: EncounterType;
    fallbackPool: EncounterType;
    staminaPerStep: number;
    steps: number;
    label: string;
    /**
     * Whether this type is offered in the picker. Non-selectable types stay VALID
     * (back-compat for in-flight expeditions + the loot/reward tables keyed by type)
     * but can no longer be started — their flavour is folded into a selectable pillar.
     */
    selectable: boolean;
    /** Picker identity, so each option reads as its own thing. */
    icon: string;
    specialty: string;
    rewardHint: string;
    /** Accent colour used for the picker card's edge + specialty chip. */
    accent: string;
    /** One-line picker hint: what this activity is. */
    description: string;
    /**
     * Scene-set + objective templates resolved once at expedition start. `{region}`
     * is replaced with the locked region name. premise sets the stage; goal states
     * the through-line. Both are shown to the player and injected into every prompt.
     */
    premise: string;
    goal: string;
  }
> = {
  // ── The four selectable pillars (each a distinct fantasy) ──
  explore: {
    encounterType: 'exploration', fallbackPool: 'exploration', staminaPerStep: 12, steps: 3, label: 'Explore',
    selectable: true, icon: '🧭', specialty: 'Discovery', rewardHint: 'Maps, oddities, the occasional mystery.', accent: '#36c5b0',
    description: "Strike out into the unknown — and pull at whatever doesn't add up.",
    premise: "You set out to explore {region}, chasing the parts of it that don't quite make sense.",
    goal: 'Map {region} and get to the bottom of at least one of its mysteries.',
  },
  fight: {
    encounterType: 'combat', fallbackPool: 'combat', staminaPerStep: 14, steps: 3, label: 'Pick a Fight',
    selectable: true, icon: '⚔️', specialty: 'Combat', rewardHint: 'XP and gear — if you win.', accent: '#e0524f',
    description: 'Go looking for a fight. The island is happy to provide one.',
    premise: "Something in {region} has been asking for it, and today you've decided to oblige.",
    goal: 'Win your fights across {region} and walk away (mostly) intact.',
  },
  scavenge: {
    encounterType: 'scavenging', fallbackPool: 'scavenging', staminaPerStep: 8, steps: 4, label: 'Scavenge',
    selectable: true, icon: '🪣', specialty: 'Loot', rewardHint: 'Materials, clams, and useful junk.', accent: '#d8a23a',
    description: "Scrounge the area for loot, scrap, and an honest-ish day's pay.",
    premise: '{region} is full of things people dropped, abandoned, or are technically still using. You are collecting.',
    goal: 'Haul as much out of {region} as you can carry.',
  },
  socialize: {
    encounterType: 'social', fallbackPool: 'social', staminaPerStep: 9, steps: 3, label: 'Socialize',
    selectable: true, icon: '💬', specialty: 'People', rewardHint: 'Notoriety, allies, and gossip.', accent: '#9b6cd6',
    description: 'Work the locals — for friends, favours, or at least fewer enemies.',
    premise: 'You head into {region} to charm, bargain, and gossip your way through its residents.',
    goal: 'Leave {region} with more allies than grudges.',
  },
  // ── Folded-in types: kept valid for old expeditions, no longer offered ──
  investigate: {
    encounterType: 'mystery', fallbackPool: 'exploration', staminaPerStep: 12, steps: 3, label: 'Investigate',
    selectable: false, icon: '🔍', specialty: 'Mystery', rewardHint: 'Answers, mostly.', accent: '#6c8fd6',
    description: 'Chase a mystery to its strange conclusion.',
    premise: "Something about {region} doesn't add up, and the not-adding-up is keeping you awake.",
    goal: 'Get to the bottom of whatever {region} is hiding.',
  },
  train: {
    encounterType: 'training', fallbackPool: 'training', staminaPerStep: 10, steps: 3, label: 'Train',
    selectable: false, icon: '💪', specialty: 'Training', rewardHint: 'A sharper you.', accent: '#7aa86f',
    description: 'Push yourself; nudge your stats.',
    premise: 'You retreat into {region} to train, sweat, and become a marginally more dangerous person.',
    goal: 'Train hard in {region} and come back sharper.',
  },
  work: {
    encounterType: 'work', fallbackPool: 'scavenging', staminaPerStep: 10, steps: 3, label: 'Work a Shift',
    selectable: false, icon: '🧾', specialty: 'Wages', rewardHint: 'Steady pay.', accent: '#b9883f',
    description: 'Do a shift for steady pay.',
    premise: "There's an honest day's work to be had in {region}, allegedly, for honest pay, allegedly.",
    goal: 'Clock in around {region} and clock out richer.',
  },
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
  /**
   * Early-game mercy: at or below this level, enemy attack is scaled down so new
   * players can actually win fights. Higher levels fight enemies at full strength
   * (difficulty escalates with progression).
   */
  EARLY_GAME_MAX_LEVEL: 4,
  EARLY_GAME_ENEMY_ATK_DAMP: 0.65,
} as const;

/**
 * How likely LOSING a fight is to kill you, rather than just leave you beaten up.
 * Forgiving at low levels, escalating with level and risk — by RAMP_TO_LEVEL a lost
 * medium/high/ridiculous fight is almost certainly fatal. Tuned so that, with a
 * roughly even win rate, a medium-risk fight past ~level 10 carries about 50/50
 * odds of death overall. P(die|lose) = lerp(start, end, min(1, level/RAMP_TO_LEVEL)).
 */
export const COMBAT_DEATH = {
  RAMP_TO_LEVEL: 12,
  BY_RISK: {
    low: { start: 0.0, end: 0.4 },
    medium: { start: 0.05, end: 1.0 },
    high: { start: 0.15, end: 1.0 },
    ridiculous: { start: 0.3, end: 1.0 },
  } as Record<RiskLevel, { start: number; end: number }>,
  /** Chance a ridiculous, fumbled NON-combat choice ends fatally. */
  RIDICULOUS_FUMBLE_DEATH: 0.15,
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

/**
 * Item balance constants. The power budget is the total stat-modifier weight an
 * item of a given rarity may carry; the per-stat cap bounds any single stat. The
 * server (never the AI) derives an item's modifiers from these, so an approved
 * AI concept can never create a broken stat combination.
 */
export const ITEM = {
  /** Total stat-modifier budget by rarity (sum of |modifier| across stats). */
  RARITY_POWER_BUDGET: { common: 3, uncommon: 6, rare: 12, epic: 20, legendary: 32, absurd: 50 } as Record<Rarity, number>,
  /** Largest single-stat modifier allowed at each rarity. */
  RARITY_MAX_STAT_MOD: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, absurd: 6 } as Record<Rarity, number>,
  /** Rarities eligible for automatic approval (everything else needs an admin). */
  AUTO_APPROVE_RARITIES: new Set<Rarity>(['common', 'uncommon']),
  /** An auto-approved item may not exceed this power budget. */
  AUTO_APPROVE_MAX_POWER: 6,
  NAME_MAX: 80,
  DESC_MAX: 400,
  /**
   * Which stats each slot favours when the server generates an item's modifiers.
   * Consumables carry no stat modifiers (they have a consumable effect instead).
   */
  SLOT_STAT_AFFINITY: {
    weapon: ['strength', 'agility', 'accuracy'],
    head: ['defense', 'curiosity', 'accuracy'],
    shoulders: ['defense', 'toughness'],
    neck: ['charisma', 'empathy', 'negotiation'],
    cloak: ['agility', 'defense', 'weirdness'],
    chest: ['defense', 'toughness'],
    wrist: ['accuracy', 'agility'],
    waist: ['toughness', 'strength'],
    legs: ['defense', 'agility'],
    feet: ['agility', 'toughness'],
    ring: ['weirdness', 'mischief', 'deception', 'charisma'],
    trinket: ['charisma', 'deception', 'weirdness', 'mischief', 'empathy'],
    companion: ['empathy', 'bravery', 'weirdness'],
    consumable: [],
  } as Record<ItemSlot, StatKey[]>,
} as const;

/**
 * Loot selection tuning. Rarity weighting starts from the reward table and is
 * nudged upward (mildly) by character level. Slot bias makes a given expedition
 * type tend toward thematically-appropriate drops without being rigid.
 */
export const LOOT = {
  /** Extra weight added to rare/epic per character level (keeps rare+ scarce). */
  RARE_WEIGHT_PER_LEVEL: 0.4,
  EPIC_WEIGHT_PER_LEVEL: 0.08,
  /** Caps so high level can't flood the economy with rares. */
  MAX_RARE_WEIGHT: 22,
  MAX_EPIC_WEIGHT: 6,
  /**
   * Per-expedition relative slot weighting for which kind of item tends to drop.
   * Partial — any slot not listed defaults to weight 1 (see loot.slotWeight), so we
   * only call out the emphasis/de-emphasis for each activity.
   */
  SLOT_BIAS_BY_EXPEDITION: {
    explore: { trinket: 2, ring: 2, neck: 2, companion: 2, cloak: 2 },
    fight: { weapon: 3, chest: 3, shoulders: 2, head: 2, legs: 2 },
    scavenge: { consumable: 3, ring: 2, trinket: 2, waist: 2, wrist: 2 },
    socialize: { neck: 3, trinket: 3, ring: 2, companion: 2, weapon: 0, chest: 0 },
    investigate: { trinket: 3, ring: 2, head: 2, neck: 2 },
    train: { weapon: 2, chest: 2, legs: 2, feet: 2, waist: 2 },
    work: { consumable: 2, ring: 2, waist: 2, wrist: 2 },
  } as Record<ExpeditionType, Partial<Record<ItemSlot, number>>>,
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

export const CONSUMABLE = {
  /** Stamina restored when a consumable item is used. */
  STAMINA_RESTORE: 25,
} as const;

export const PRESTIGE = {
  /** Level required before a character may attempt to escape the island. */
  REQUIRED_LEVEL: 10,
  /** Permanent stat bonus to every stat per successful escape. */
  LEGACY_STAT_BONUS: 1,
  /** Escape Tokens granted per escape (scaled by escape count). */
  ESCAPE_TOKENS_PER_ESCAPE: 1,
  /** Starting Clams a post-escape run resets to (matches a new character). */
  RESET_NORMAL_MONEY: 25,
} as const;

export const MEMORY = {
  /** Above this many non-summary memories, the oldest are compacted. */
  MAX_BEFORE_COMPACT: 40,
  /** How many old memories fold into one summary per compaction. */
  COMPACT_BATCH: 20,
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
