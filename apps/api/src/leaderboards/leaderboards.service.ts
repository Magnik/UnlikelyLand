import { Injectable } from '@nestjs/common';
import type { LeaderboardEntry, LeaderboardType } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

/**
 * Read-only leaderboards. Backed by the indexed columns on Character
 * (level/xp, normalMoney, reputation). Top 25 per board.
 */
@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async top(type: LeaderboardType): Promise<LeaderboardEntry[]> {
    const orderBy =
      type === 'wealth'
        ? { normalMoney: 'desc' as const }
        : type === 'reputation'
          ? { reputation: 'desc' as const }
          : { xp: 'desc' as const };

    const chars = await this.prisma.character.findMany({
      orderBy,
      take: 25,
      select: { id: true, displayName: true, level: true, xp: true, normalMoney: true, reputation: true },
    });

    return chars.map((c, i) => ({
      rank: i + 1,
      characterId: c.id,
      displayName: c.displayName,
      level: c.level,
      value: type === 'wealth' ? c.normalMoney : type === 'reputation' ? c.reputation : c.xp,
    }));
  }
}
