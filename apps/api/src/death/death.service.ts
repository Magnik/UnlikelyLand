import { BadRequestException, Injectable } from '@nestjs/common';
import type { DeathStatusView, ReviveInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { EconomyService } from '../economy/economy.service';
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

    const now = Date.now();
    const payCost = DEATH.PAY_BASE_COST + c.deathCount * DEATH.PAY_COST_PER_DEATH;

    await this.prisma.$transaction(async (tx) => {
      if (dto.method === 'free') {
        if (!c.freeReviveAvailable) throw new BadRequestException('No free revive available');
      } else if (dto.method === 'pay') {
        await this.economy.spendNormal(tx, characterId, payCost, 'revive:pay');
      } else {
        // wait
        if (!c.reviveAvailableAt || c.reviveAvailableAt.getTime() > now) {
          throw new BadRequestException('Revival timer has not elapsed yet');
        }
      }

      await tx.character.update({
        where: { id: characterId },
        data: {
          isDead: false,
          deathReason: null,
          reviveAvailableAt: null,
          deathStartedAt: null,
          freeReviveAvailable: false,
          // Restore a portion of stamina so the player can get going again.
          staminaCurrent: Math.min(c.staminaMax, c.staminaCurrent + Math.floor(c.staminaMax / 2)),
          staminaLastUpdatedAt: new Date(),
        },
      });
      await tx.deathRecord.updateMany({
        where: { characterId, revivedAt: null },
        data: { revivedAt: new Date(), method: dto.method },
      });
    });

    return this.status(characterId);
  }
}
