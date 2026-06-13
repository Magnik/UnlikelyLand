import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  categoryForStat,
  type CurrencyType,
  type Encounter,
  type EncounterChoice,
  type ResolutionView,
  type ResolveChoiceInput,
  type RewardView,
  type StatNudgeView,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { CharactersService } from '../characters/characters.service';
import { EconomyService } from '../economy/economy.service';
import { StoryMemoryService } from '../story-memory/story-memory.service';
import { EncountersService } from './encounters.service';
import { rngFor } from '../engine/rng';
import { resolveCheck } from '../engine/checks';
import { makeEnemy, makePlayerCombatant, resolveCombat, type CombatResult } from '../engine/combat';
import { computeReward, expeditionCompletionReward } from '../engine/rewards';
import { buildOutcomeNarrative, buildOutcomeSummary } from '../engine/outcome-text';
import { levelFromXp } from '../engine/leveling';
import { DEATH, PERSONALITY, PERSONALITY_FOCUS } from '../engine/rules';
import type { ExpeditionType } from '@unlikelyland/contracts';

/** Static outcome portion stored on the encounter for idempotent replay. */
interface ResolutionSnapshot {
  narrative: string;
  check: ResolutionView['check'];
  combat: ResolutionView['combat'];
  rewards: RewardView;
  statNudges: StatNudgeView[];
  died: boolean;
  deathReason: string | null;
}

/**
 * The heart of the game loop: turn a chosen option into a validated outcome,
 * atomically. Server-authoritative throughout — the AI/client never supply
 * rewards or stat changes. Resolution is idempotent (a duplicate submit with the
 * same clientRequestId replays the stored outcome) and race-safe (the encounter
 * is claimed with a conditional update inside the transaction).
 *
 * External AI calls (generating the NEXT encounter) happen AFTER the DB
 * transaction commits, never inside it.
 */
@Injectable()
export class ResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characters: CharactersService,
    private readonly economy: EconomyService,
    private readonly memory: StoryMemoryService,
    private readonly encounters: EncountersService,
  ) {}

  async resolve(characterId: string, dto: ResolveChoiceInput): Promise<ResolutionView> {
    const encounter = await this.prisma.encounter.findUnique({ where: { id: dto.encounterId } });
    if (!encounter || encounter.characterId !== characterId) {
      throw new NotFoundException('Encounter not found');
    }

    // Idempotent replay / double-submit guard.
    if (encounter.resolved) {
      if (dto.clientRequestId && encounter.clientRequestId === dto.clientRequestId && encounter.resolution) {
        return this.rebuildView(characterId, encounter.id, encounter.resolution as unknown as ResolutionSnapshot, encounter.expeditionId);
      }
      throw new ConflictException('This encounter was already resolved');
    }

    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: { stats: true },
    });
    if (character.isDead) {
      throw new BadRequestException('You are downed — revive before continuing');
    }

    const payload = encounter.payload as Encounter;
    const choice = payload.choices.find((c) => c.id === dto.choiceId);
    if (!choice) throw new BadRequestException('Unknown choice for this encounter');

    // Effective stats include equipped-item modifiers.
    const stats = await this.characters.getEffectiveStats(characterId);
    const level = levelFromXp(character.xp).level;
    const rng = rngFor(encounter.id, choice.id);

    // 1. Stat check.
    const statValue = stats[choice.statFocus];
    const check = resolveCheck(statValue, level, stats.weirdness, choice.riskLevel, rng);

    // 2. Optional combat.
    let combat: CombatResult | null = null;
    if (choice.mayStartCombat) {
      const enemyName = this.enemyName(payload);
      const enemy = makeEnemy(enemyName, level, choice.riskLevel);
      const player = makePlayerCombatant(stats, level);
      combat = resolveCombat(player, enemy, rng);
    }

    // 3. Death — losing a fight downs you; a ridiculous fumble can also be fatal.
    let died = false;
    let deathReason: string | null = null;
    if (combat && !combat.playerWon) {
      died = true;
      deathReason = `Bested by ${combat.enemyName}`;
    } else if (!combat && check.fumble && choice.riskLevel === 'ridiculous' && rng.chance(0.25)) {
      died = true;
      deathReason = 'A ridiculous idea, pursued to its natural conclusion';
    }

    // 4. Rewards (none on death). Combat success overrides the stat check for
    //    reward purposes; otherwise the check decides.
    const rewardSuccess = combat ? combat.playerWon : check.success;
    const reward = died
      ? { xp: 0, normal: 0, crafting: 0, reputation: 0, premium: 0, itemDrop: null }
      : computeReward({
          riskLevel: choice.riskLevel,
          rewardProfile: choice.rewardProfile,
          encounterType: payload.encounterType,
          success: rewardSuccess,
          margin: check.margin,
          rng,
        });

    // 5. Personality drift.
    const statNudges = this.computePersonalityNudges(choice);

    // 6. Resolve an item drop against the seeded catalog (read before the tx).
    const droppedItem = reward.itemDrop ? await this.pickDropItem(reward.itemDrop.rarity, rng) : null;

    // 7. Narrative (engine fallback text — deterministic, on-tone).
    const narrative = buildOutcomeNarrative({ choice, check, combat, died }, rng);

    const rewardView: RewardView = {
      xp: reward.xp,
      currencies: this.rewardCurrencies(reward),
      items: droppedItem ? [{ name: droppedItem.name, rarity: droppedItem.rarity as never, slot: droppedItem.slot as never }] : [],
    };

    const snapshot: ResolutionSnapshot = {
      narrative,
      check: {
        statFocus: choice.statFocus,
        statValue,
        difficulty: check.difficulty,
        roll: check.roll,
        total: check.total,
        success: check.success,
        margin: check.margin,
      },
      combat: combat
        ? {
            enemyName: combat.enemyName,
            playerMaxHp: combat.playerMaxHp,
            enemyMaxHp: combat.enemyMaxHp,
            rounds: combat.rounds,
            playerWon: combat.playerWon,
            playerHpRemaining: combat.playerHpRemaining,
          }
        : null,
      rewards: rewardView,
      statNudges,
      died,
      deathReason,
    };

    // 8. Commit everything atomically.
    let expeditionCompleted = false;
    let completionBonus: RewardView | null = null;

    await this.prisma.$transaction(async (tx) => {
      // Claim the encounter — conditional update prevents a concurrent double-resolve.
      const claim = await tx.encounter.updateMany({
        where: { id: encounter.id, characterId, resolved: false },
        data: {
          resolved: true,
          resolvedChoiceId: choice.id,
          resolvedAt: new Date(),
          clientRequestId: dto.clientRequestId ?? undefined,
          resolution: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      if (claim.count === 0) throw new ConflictException('This encounter was already resolved');

      // Rewards.
      if (!died) {
        await this.economy.applyDeltas(
          tx,
          characterId,
          { xp: reward.xp, normal: reward.normal, crafting: reward.crafting, reputation: reward.reputation },
          `encounter:${choice.id}`,
          encounter.id,
        );
      }

      // Personality drift.
      for (const nudge of statNudges) {
        await tx.characterStats.update({
          where: { characterId },
          data: { [nudge.stat]: { increment: nudge.delta } },
        });
      }

      // Item grant.
      if (droppedItem) {
        await tx.inventoryItem.create({
          data: { characterId, itemDefinitionId: droppedItem.id, quantity: 1 },
        });
      }

      // Death.
      if (died) {
        const waitMs = Math.min(
          DEATH.MAX_WAIT_MS,
          DEATH.BASE_WAIT_MS * (1 + character.deathCount * DEATH.WAIT_GROWTH_PER_DEATH),
        );
        const freeRevive = rng.chance(DEATH.FREE_REVIVE_CHANCE);
        await tx.character.update({
          where: { id: characterId },
          data: {
            isDead: true,
            deathStartedAt: new Date(),
            reviveAvailableAt: new Date(Date.now() + waitMs),
            deathReason,
            deathCount: { increment: 1 },
            freeReviveAvailable: freeRevive,
          },
        });
        await tx.deathRecord.create({
          data: { characterId, reason: deathReason ?? 'unknown', freeReviveAvailable: freeRevive },
        });
      }

      // Story memory.
      await this.memory.recordDecision(tx, characterId, buildOutcomeSummary({ choice, check, combat }), character.regionSetId);
      await this.memory.recordSuggestions(tx, characterId, payload.memorySuggestions, character.regionSetId);
      await this.memory.upsertNpcs(tx, characterId, payload.npcSuggestions, character.regionSetId);

      // Expedition advancement (terminal states only; next encounter is generated
      // outside the transaction because it may call the AI provider).
      if (encounter.expeditionId) {
        const expedition = await tx.expedition.findUniqueOrThrow({ where: { id: encounter.expeditionId } });
        const newStep = expedition.step + 1;
        if (died) {
          await tx.expedition.update({
            where: { id: expedition.id },
            data: { step: newStep, status: 'failed', endedAt: new Date(), summary: deathReason },
          });
        } else if (newStep >= expedition.maxSteps) {
          const bonus = expeditionCompletionReward(expedition.maxSteps);
          await this.economy.applyDeltas(tx, characterId, { xp: bonus.xp, normal: bonus.normal }, 'expedition:complete', expedition.id);
          await tx.expedition.update({
            where: { id: expedition.id },
            data: { step: newStep, status: 'completed', endedAt: new Date(), summary: 'Made it through in one piece.' },
          });
          expeditionCompleted = true;
          completionBonus = { xp: bonus.xp, currencies: { normal: bonus.normal }, items: [] };
        } else {
          await tx.expedition.update({ where: { id: expedition.id }, data: { step: newStep } });
        }
      }
    });

    // 9. Generate the next encounter (outside the transaction) if the expedition
    //    continues and the player can still afford a step.
    let nextEncounter = null;
    if (encounter.expeditionId && !died && !expeditionCompleted) {
      nextEncounter = await this.advanceToNextStep(characterId, encounter.expeditionId);
    }

    const characterView = await this.characters.buildView(characterId);
    const expeditionView = encounter.expeditionId ? await this.expeditionView(encounter.expeditionId) : null;

    return {
      encounterId: encounter.id,
      choiceId: choice.id,
      narrative: snapshot.narrative,
      check: snapshot.check,
      combat: snapshot.combat,
      rewards: snapshot.rewards,
      statNudges: snapshot.statNudges,
      died,
      deathReason,
      expeditionCompleted,
      completionBonus,
      character: characterView,
      expedition: expeditionView,
      nextEncounter,
    };
  }

  /** Charge stamina for the next step and generate it; end the expedition if exhausted. */
  private async advanceToNextStep(characterId: string, expeditionId: string) {
    const expedition = await this.prisma.expedition.findUniqueOrThrow({ where: { id: expeditionId } });
    if (expedition.status !== 'active') return null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.characters.consumeStamina(tx, characterId, expedition.staminaPerStep);
      });
    } catch {
      // Out of stamina — the expedition ends early without the completion bonus.
      await this.prisma.expedition.update({
        where: { id: expeditionId },
        data: { status: 'completed', endedAt: new Date(), summary: 'Ran out of steam and headed back.' },
      });
      return null;
    }

    return this.encounters.generateForStep(characterId, expeditionId, expedition.step + 1);
  }

  private computePersonalityNudges(choice: EncounterChoice): StatNudgeView[] {
    if (!PERSONALITY_FOCUS.has(choice.statFocus)) return [];
    const delta = choice.riskLevel === 'ridiculous' ? PERSONALITY.NUDGE_BIG : PERSONALITY.NUDGE;
    return [{ stat: choice.statFocus, statLabel: this.characters.statLabel(choice.statFocus), delta }];
  }

  private rewardCurrencies(reward: { normal: number; crafting: number; reputation: number; premium: number }): Partial<Record<CurrencyType, number>> {
    const out: Partial<Record<CurrencyType, number>> = {};
    if (reward.normal) out.normal = reward.normal;
    if (reward.crafting) out.crafting = reward.crafting;
    if (reward.reputation) out.reputation = reward.reputation;
    if (reward.premium) out.premium = reward.premium;
    return out;
  }

  private enemyName(payload: Encounter): string {
    const enemyNpc = payload.npcSuggestions.find((n) => /enemy|foe|beast|monster/i.test(n.role));
    if (enemyNpc) return enemyNpc.name;
    if (payload.npcSuggestions[0]) return payload.npcSuggestions[0].name;
    return payload.title;
  }

  private async pickDropItem(rarity: string, rng: { int: (a: number, b: number) => number }) {
    let items = await this.prisma.itemDefinition.findMany({ where: { rarity } });
    if (items.length === 0) {
      items = await this.prisma.itemDefinition.findMany({ where: { rarity: 'common' } });
    }
    if (items.length === 0) return null;
    return items[rng.int(0, items.length - 1)];
  }

  private async expeditionView(expeditionId: string) {
    const e = await this.prisma.expedition.findUniqueOrThrow({ where: { id: expeditionId } });
    return {
      id: e.id,
      type: e.type as ExpeditionType,
      status: e.status as 'active' | 'completed' | 'abandoned' | 'failed',
      step: e.step,
      maxSteps: e.maxSteps,
      staminaPerStep: e.staminaPerStep,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt ? e.endedAt.toISOString() : null,
      summary: e.summary,
    };
  }

  /** Rebuild a full view from a stored snapshot for an idempotent replay. */
  private async rebuildView(
    characterId: string,
    encounterId: string,
    snapshot: ResolutionSnapshot,
    expeditionId: string | null,
  ): Promise<ResolutionView> {
    const character = await this.characters.buildView(characterId);
    const expedition = expeditionId ? await this.expeditionView(expeditionId) : null;
    const nextEncounter = await this.encounters.currentEncounterView(characterId);
    return {
      encounterId,
      choiceId: '',
      narrative: snapshot.narrative,
      check: snapshot.check,
      combat: snapshot.combat,
      rewards: snapshot.rewards,
      statNudges: snapshot.statNudges,
      died: snapshot.died,
      deathReason: snapshot.deathReason,
      expeditionCompleted: expedition?.status === 'completed',
      completionBonus: null,
      character,
      expedition,
      nextEncounter,
    };
  }
}
