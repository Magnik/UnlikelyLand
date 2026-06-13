import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_STATS, type EscapeResultView, type EscapeStatusView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { CharactersService } from '../characters/characters.service';
import { AchievementsService } from '../achievements/achievements.service';
import { levelFromXp } from '../engine/leveling';
import { PRESTIGE } from '../engine/rules';

/**
 * Prestige / escape. Once a character reaches the required level they can escape
 * the island: the run resets (level/xp/currencies/death state) but they keep a
 * permanent +1 to every stat per escape and gain Escape Tokens. EscapeRecord
 * tracks the legacy. This is the long-term loop the brief anticipated.
 */
@Injectable()
export class PrestigeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characters: CharactersService,
    private readonly achievements: AchievementsService,
  ) {}

  async status(characterId: string): Promise<EscapeStatusView> {
    const c = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { xp: true } });
    const escapeCount = await this.prisma.escapeRecord.count({ where: { characterId } });
    const level = levelFromXp(c.xp).level;
    return {
      eligible: level >= PRESTIGE.REQUIRED_LEVEL,
      requiredLevel: PRESTIGE.REQUIRED_LEVEL,
      level,
      escapeCount,
      legacyLevel: escapeCount,
    };
  }

  async escape(characterId: string): Promise<EscapeResultView> {
    const c = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const level = levelFromXp(c.xp).level;
    if (level < PRESTIGE.REQUIRED_LEVEL) {
      throw new BadRequestException(`Reach level ${PRESTIGE.REQUIRED_LEVEL} before attempting escape`);
    }
    const newCount = (await this.prisma.escapeRecord.count({ where: { characterId } })) + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.escapeRecord.create({
        data: { characterId, escapeCount: newCount, legacyLevel: newCount, summary: `Escaped at level ${level}.` },
      });

      // Permanent legacy: +1 to every stat.
      const statInc: Record<string, { increment: number }> = {};
      for (const s of ALL_STATS) statInc[s] = { increment: PRESTIGE.LEGACY_STAT_BONUS };
      await tx.characterStats.update({
        where: { characterId },
        data: statInc as unknown as Prisma.CharacterStatsUpdateInput,
      });

      // Reset the run; keep premium and grant Escape Tokens.
      await tx.character.update({
        where: { id: characterId },
        data: {
          xp: 0,
          level: 1,
          normalMoney: 25,
          craftingResources: 0,
          reputation: 0,
          staminaCurrent: c.staminaMax,
          staminaLastUpdatedAt: new Date(),
          isDead: false,
          deathStartedAt: null,
          reviveAvailableAt: null,
          deathReason: null,
          freeReviveAvailable: false,
          deathCount: 0,
          premiumMoney: { increment: PRESTIGE.ESCAPE_TOKENS_PER_ESCAPE * newCount },
        },
      });

      // Wind down any in-flight run state.
      await tx.expedition.updateMany({
        where: { characterId, status: 'active' },
        data: { status: 'completed', endedAt: new Date(), summary: 'Left it all behind to escape.' },
      });
      await tx.encounter.updateMany({
        where: { characterId, resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });

      await this.achievements.award(tx, characterId, ['escaped-the-island']);
      await tx.storyMemory.create({
        data: {
          characterId,
          memoryType: 'summary',
          content: `Escaped the island (run #${newCount}) and started over, a little stronger.`,
          importance: 5,
          regionSetId: c.regionSetId,
        },
      });
    });

    const character = await this.characters.buildView(characterId);
    return { escaped: true, escapeCount: newCount, legacyLevel: newCount, character };
  }
}
