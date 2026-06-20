import { parseEncounter, type Encounter, type EncounterType } from '@unlikelyland/contracts';
import explorationBase from './exploration.json';
import explorationExtra from './exploration-b.json';
import combatBase from './combat.json';
import combatExtra from './combat-b.json';
import socialBase from './social.json';
import socialExtra from './social-b.json';
import trainingBase from './training.json';
import trainingExtra from './training-b.json';
import scavengingBase from './scavenging.json';
import scavengingExtra from './scavenging-b.json';
import mystery from './mystery.json';
import work from './work.json';

/**
 * Central fallback-content loader. Each encounter pool is assembled from one or
 * more modular JSON files (a base file plus themed extras) so new content can be
 * added by dropping in another file and listing it here — no giant file to edit.
 * Every encounter is validated against encounter.v1 at module load, so a malformed
 * fallback fails fast at startup rather than mid-game.
 *
 * `mystery` and `work` now have dedicated pools (previously they aliased
 * exploration/scavenging, which made Investigate/Work play identically offline).
 * They still fold in the broader pool for volume and variety.
 */
function load(...raws: unknown[][]): Encounter[] {
  return raws.flat().map((e) => parseEncounter(e));
}

const exploration = load(explorationBase as unknown[], explorationExtra as unknown[]);
const combat = load(combatBase as unknown[], combatExtra as unknown[]);
const social = load(socialBase as unknown[], socialExtra as unknown[]);
const training = load(trainingBase as unknown[], trainingExtra as unknown[]);
const scavenging = load(scavengingBase as unknown[], scavengingExtra as unknown[]);
const mysteryPool = load(mystery as unknown[]);
const workPool = load(work as unknown[]);

export const FALLBACK_POOLS: Record<EncounterType, Encounter[]> = {
  exploration,
  combat,
  social,
  training,
  scavenging,
  // Dedicated pools, padded with thematically-adjacent content for variety.
  mystery: [...mysteryPool, ...exploration],
  work: [...workPool, ...scavenging],
};

/** Pools that have their own source files (for health/count reporting). */
export const FALLBACK_SOURCE_POOLS: EncounterType[] = [
  'exploration',
  'combat',
  'social',
  'training',
  'scavenging',
  'mystery',
  'work',
];
