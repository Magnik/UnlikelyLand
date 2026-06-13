import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AchievementView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

/**
 * Public achievements. Awarding is idempotent (composite-unique upsert) and can
 * run inside a resolve transaction. Achievement key→id is memoised so awarding
 * doesn't re-query the catalog every time.
 */
@Injectable()
export class AchievementsService {
  private keyToId: Map<string, string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async ids(): Promise<Map<string, string>> {
    if (!this.keyToId) {
      const all = await this.prisma.achievement.findMany({ select: { id: true, key: true } });
      this.keyToId = new Map(all.map((a) => [a.key, a.id]));
    }
    return this.keyToId;
  }

  /** Unlock the given achievement keys for a character (idempotent). */
  async award(tx: Prisma.TransactionClient, characterId: string, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const map = await this.ids();
    for (const key of keys) {
      const achievementId = map.get(key);
      if (!achievementId) continue;
      await tx.characterAchievement.upsert({
        where: { characterId_achievementId: { characterId, achievementId } },
        update: {},
        create: { characterId, achievementId },
      });
    }
  }

  async list(characterId: string): Promise<AchievementView[]> {
    const [all, unlocked] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.characterAchievement.findMany({ where: { characterId } }),
    ]);
    const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    return all.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      unlockedAt: unlockedMap.has(a.id) ? (unlockedMap.get(a.id) as Date).toISOString() : null,
    }));
  }
}
