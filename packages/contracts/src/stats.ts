import {
  ALL_STATS,
  COMBAT_STATS,
  SOCIAL_STATS,
  PERSONALITY_STATS,
  type StatCategory,
  type StatKey,
} from './enums';

/** Starting value for every stat on a fresh character. */
export const DEFAULT_STAT_VALUE = 5;

/** Personality stats are clamped to this range; choices nudge them slowly. */
export const PERSONALITY_MIN = 0;
export const PERSONALITY_MAX = 100;

/** Map every stat key to its category (combat / social / personality). */
export const STAT_CATEGORY: Record<StatKey, StatCategory> = (() => {
  const map = {} as Record<StatKey, StatCategory>;
  for (const s of COMBAT_STATS) map[s] = 'combat';
  for (const s of SOCIAL_STATS) map[s] = 'social';
  for (const s of PERSONALITY_STATS) map[s] = 'personality';
  return map;
})();

export function categoryForStat(stat: StatKey): StatCategory {
  return STAT_CATEGORY[stat];
}

/** Human-readable labels for UI badges. */
export const STAT_LABEL: Record<StatKey, string> = {
  strength: 'Strength',
  agility: 'Agility',
  toughness: 'Toughness',
  accuracy: 'Accuracy',
  defense: 'Defense',
  charisma: 'Charisma',
  intimidation: 'Intimidation',
  deception: 'Deception',
  empathy: 'Empathy',
  negotiation: 'Negotiation',
  weirdness: 'Weirdness',
  bravery: 'Bravery',
  caution: 'Caution',
  curiosity: 'Curiosity',
  mischief: 'Mischief',
  honor: 'Honor',
};

export type StatBlock = Record<StatKey, number>;

/** Build a fresh stat block with every stat at the default value. */
export function defaultStatBlock(value = DEFAULT_STAT_VALUE): StatBlock {
  const block = {} as StatBlock;
  for (const s of ALL_STATS) block[s] = value;
  return block;
}

export { ALL_STATS, COMBAT_STATS, SOCIAL_STATS, PERSONALITY_STATS };
