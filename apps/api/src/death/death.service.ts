import { BadRequestException, Injectable } from '@nestjs/common';
import type { DeathStatusView, ReviveInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { EconomyService } from '../economy/economy.service';
import { AchievementsService } from '../achievements/achievements.service';
import { DEATH } from '../engine/rules';

/**
 * Death is inconvenient, not catastrophic. A downed player waits out a timer,
 * pays Clams to skip it, or — if a weird event rolled in their favour at death —
 * revives for free. Revival never wipes progression.
 */
@Injectable()
export class DeathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly achievements: AchievementsService,
  ) {}

  async status(characterId: string): Promise<DeathStatusView> {
    const c = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const now = Date.now();
    const payCost = DEATH.PAY_BASE_COST + c.deathCount * DEATH.PAY_COST_PER_DEATH;
    const reviveInSeconds = c.reviveAvailableAt
      ? Math.max(0, Math.ceil((c.reviveAvailableAt.getTime() - now) / 1000))
      : null;
    return {
      isDead: c.isDead,
      deathReason: c.deathReason,
      diedAt: c.deathStartedAt ? c.deathStartedAt.toISOString() : null,
      reviveAvailableAt: c.reviveAvailableAt ? c.reviveAvailableAt.toISOString() : null,
      reviveInSeconds,
      freeReviveAvailable: c.freeReviveAvailable,
      payToReviveCost: payCost,
      canAffordPaidRevive: c.normalMoney >= payCost,
      deathCount: c.deathCount,
    };
  }

  async revive(characterId: string, dto: ReviveInput): Promise<DeathStatusView> {
    const c = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.isDead) throw new BadRequestException('You are not downed');

    const payCost = DEATH.PAY_BASE_COST + c.deathCount * DEATH.PAY_COST_PER_DEATH;
    const restoredStamina = Math.min(c.staminaMax, c.staminaCurrent + Math.floor(c.staminaMax / 2));

    await this.prisma.$transaction(async (tx) => {
      // Each revive is a one-shot, claimed atomically inside the tx so concurrent
      // requests (double-tap, free+pay race) cannot both succeed. The method-specific
      // predicate re-checks eligibility against the live row, not the pre-tx snapshot.
      const where: { id: string; isDead: true; freeReviveAvailable?: true; reviveAvailableAt?: { lte: Date } } = {
        id: characterId,
        isDead: true,
      };
      if (dto.method === 'free') {
        where.freeReviveAvailable = true;
      } else if (dto.method === 'pay') {
        // Atomic, race-safe spend; rolls back with the rest if the claim below fails.
        await this.economy.spendNormal(tx, characterId, payCost, 'revive:pay');
      } else {
        where.reviveAvailableAt = { lte: new Date() };
      }

      const claim = await tx.character.updateMany({
        where,
        data: {
          isDead: false,
          deathReason: null,
          reviveAvailableAt: null,
          deathStartedAt: null,
          freeReviveAvailable: false,
          // Restore a portion of stamina so the player can get going again.
          staminaCurrent: restoredStamina,
          staminaLastUpdatedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        if (dto.method === 'free') throw new BadRequestException('No free revive available');
        if (dto.method === 'wait') throw new BadRequestException('Revival timer has not elapsed yet');
        throw new BadRequestException('Unable to revive right now');
      }

      await tx.deathRecord.updateMany({
        where: { characterId, revivedAt: null },
        data: { revivedAt: new Date(), method: dto.method },
      });
      await this.achievements.onFirstRevival(tx, characterId);
    });

    return this.status(characterId);
  }
}
