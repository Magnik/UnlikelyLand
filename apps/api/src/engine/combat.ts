import type { StatBlock } from '@unlikelyland/contracts';
import type { RiskLevel } from '@unlikelyland/contracts';
import { COMBAT } from './rules';
import type { Rng } from './rng';

export interface Combatant {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  accuracy: number;
  agility: number;
  crit: number;
}

export interface CombatRound {
  round: number;
  attacker: 'player' | 'enemy';
  text: string;
  damage: number;
  hit: boolean;
  crit: boolean;
  playerHpAfter: number;
  enemyHpAfter: number;
}

export interface CombatResult {
  enemyName: string;
  playerMaxHp: number;
  enemyMaxHp: number;
  rounds: CombatRound[];
  playerWon: boolean;
  playerHpRemaining: number;
}

const HIT_FLAVOR = ['connects', 'lands a solid hit', 'strikes true', 'gets through'];
const MISS_FLAVOR = ['whiffs', 'misjudges the distance', 'is dodged', 'swings at empty air'];
const CRIT_FLAVOR = ['lands a devastating blow', 'finds the perfect opening', 'hits something important'];

export function makePlayerCombatant(stats: StatBlock, level: number): Combatant {
  const maxHp = COMBAT.PLAYER_BASE_HP + stats.toughness * COMBAT.HP_PER_TOUGHNESS + level * COMBAT.HP_PER_LEVEL;
  return {
    name: 'You',
    hp: maxHp,
    maxHp,
    attack: stats.strength + Math.floor(stats.accuracy / 2),
    defense: stats.defense,
    accuracy: stats.accuracy,
    agility: stats.agility,
    crit: COMBAT.PLAYER_BASE_CRIT + stats.accuracy * COMBAT.CRIT_PER_ACCURACY,
  };
}

/** Build a scaled enemy. `power` = player level + risk tier. */
export function makeEnemy(name: string, level: number, risk: RiskLevel): Combatant {
  const power = Math.max(1, level + COMBAT.RISK_TIER[risk]);
  const maxHp = Math.round(COMBAT.ENEMY_BASE_HP + power * COMBAT.ENEMY_HP_PER_POWER);
  return {
    name,
    hp: maxHp,
    maxHp,
    attack: Math.round(COMBAT.ENEMY_BASE_ATK + power * COMBAT.ENEMY_ATK_PER_POWER),
    defense: Math.round(COMBAT.ENEMY_BASE_DEF + power * COMBAT.ENEMY_DEF_PER_POWER),
    accuracy: Math.round(COMBAT.ENEMY_BASE_ACC + power * COMBAT.ENEMY_ACC_PER_POWER),
    agility: Math.round(COMBAT.ENEMY_BASE_AGI + power * COMBAT.ENEMY_AGI_PER_POWER),
    crit: COMBAT.ENEMY_CRIT,
  };
}

interface Swing {
  hit: boolean;
  crit: boolean;
  damage: number;
}

function swing(attacker: Combatant, defender: Combatant, rng: Rng): Swing {
  const hitChance = Math.max(
    COMBAT.MIN_HIT,
    Math.min(COMBAT.MAX_HIT, COMBAT.BASE_HIT + (attacker.accuracy - defender.agility) * COMBAT.HIT_PER_POINT),
  );
  if (!rng.chance(hitChance)) {
    return { hit: false, crit: false, damage: 0 };
  }
  const crit = rng.chance(attacker.crit);
  const base = Math.max(1, attacker.attack - Math.floor(defender.defense / 2));
  const variance = rng.int(-COMBAT.DMG_VARIANCE, COMBAT.DMG_VARIANCE);
  const damage = Math.max(1, base + variance) * (crit ? 2 : 1);
  return { hit: true, crit, damage };
}

function flavorLine(attacker: Combatant, defender: Combatant, s: Swing, rng: Rng): string {
  if (!s.hit) return `${attacker.name} ${rng.pick(MISS_FLAVOR)} against ${defender.name}.`;
  if (s.crit) return `${attacker.name} ${rng.pick(CRIT_FLAVOR)} on ${defender.name} for ${s.damage}.`;
  return `${attacker.name} ${rng.pick(HIT_FLAVOR)} on ${defender.name} for ${s.damage}.`;
}

/**
 * Turn-based combat. Player swings first each round; if the enemy survives it
 * swings back. Continues until someone reaches 0 HP or MAX_ROUNDS, after which
 * the higher remaining HP fraction wins (a stalemate favours the player only if
 * genuinely ahead). Fully deterministic given the seeded `rng`.
 */
export function resolveCombat(player: Combatant, enemy: Combatant, rng: Rng): CombatResult {
  const rounds: CombatRound[] = [];
  let roundNo = 1;

  while (player.hp > 0 && enemy.hp > 0 && roundNo <= COMBAT.MAX_ROUNDS) {
    const ps = swing(player, enemy, rng);
    enemy.hp = Math.max(0, enemy.hp - ps.damage);
    rounds.push({
      round: roundNo,
      attacker: 'player',
      text: flavorLine(player, enemy, ps, rng),
      damage: ps.damage,
      hit: ps.hit,
      crit: ps.crit,
      playerHpAfter: player.hp,
      enemyHpAfter: enemy.hp,
    });

    if (enemy.hp <= 0) break;

    const es = swing(enemy, player, rng);
    player.hp = Math.max(0, player.hp - es.damage);
    rounds.push({
      round: roundNo,
      attacker: 'enemy',
      text: flavorLine(enemy, player, es, rng),
      damage: es.damage,
      hit: es.hit,
      crit: es.crit,
      playerHpAfter: player.hp,
      enemyHpAfter: enemy.hp,
    });

    roundNo += 1;
  }

  let playerWon: boolean;
  if (enemy.hp <= 0) playerWon = true;
  else if (player.hp <= 0) playerWon = false;
  else playerWon = player.hp / player.maxHp >= enemy.hp / enemy.maxHp;

  return {
    enemyName: enemy.name,
    playerMaxHp: player.maxHp,
    enemyMaxHp: enemy.maxHp,
    rounds,
    playerWon,
    playerHpRemaining: player.hp,
  };
}
