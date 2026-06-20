import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AchievementView,
  ActivityEventView,
  ActivityType,
  Rarity,
  RiskLevel,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { RelationshipService } from '../common/relationship.service';

/** Rarities that count as "rare or better" for the first-rare-item achievement. */
const RARE_OR_BETTER: Rarity[] = ['rare', 'epic', 'legendary', 'absurd'];
/** Levels that produce a public activity-feed milestone. */
const LEVEL_MILESTONES = new Set([5, 10, 15, 20, 25]);

interface AchievementMeta {
  id: string;
  name: string;
}

/**
 * The single place achievements are decided and awarded, and where public
 * activity-feed events are emitted. Awarding is idempotent and transaction-aware;
 * `award` returns the keys that were *newly* unlocked so callers (and the named
 * evaluators) can publish a one-time activity event for each. Decision logic lives
 * in the `evaluate*`/`on*` methods so controllers never sprinkle achievement
 * checks of their own.
 */
@Injectable()
export class AchievementsService {
  private keyToMeta: Map<string, AchievementMeta> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipService,
  ) {}

  private async meta(): Promise<Map<string, AchievementMeta>> {
    if (!this.keyToMeta) {
      const all = await this.prisma.achievement.findMany({ select: { id: true, key: true, name: true } });
      this.keyToMeta = new Map(all.map((a) => [a.key, { id: a.id, name: a.name }]));
    }
    return this.keyToMeta;
  }

  /**
   * Unlock the given achievement keys for a character (idempotent). Returns the
   * subset of keys that were newly unlocked by this call (already-held keys and
   * unknown keys are excluded), so callers can emit activity exactly once.
   */
  async award(tx: Prisma.TransactionClient, characterId: string, keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const meta = await this.meta();
    const wanted = keys.map((k) => ({ key: k, id: meta.get(k)?.id })).filter((w): w is { key: string; id: string } => !!w.id);
    if (wanted.length === 0) return [];

    const already = await tx.characterAchievement.findMany({
      where: { characterId, achievementId: { in: wanted.map((w) => w.id) } },
      select: { achievementId: true },
    });
    const have = new Set(already.map((a) => a.achievementId));

    const newlyKeys: string[] = [];
    for (const w of wanted) {
      if (have.has(w.id)) continue;
      await tx.characterAchievement.upsert({
        where: { characterId_achievementId: { characterId, achievementId: w.id } },
        update: {},
        create: { characterId, achievementId: w.id },
      });
      newlyKeys.push(w.key);
    }
    return newlyKeys;
  }

  /** Append a public activity-feed event (public-safe text only). */
  async emitActivity(
    tx: Prisma.TransactionClient,
    characterId: string,
    type: ActivityType,
    title: string,
    detail = '',
  ): Promise<void> {
    await tx.activityEvent.create({ data: { characterId, type, title, detail } });
  }

  /** Emit an "earned an achievement" feed event for each newly-unlocked key. */
  private async emitAchievementActivity(tx: Prisma.TransactionClient, characterId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const meta = await this.meta();
    for (const key of keys) {
      const name = meta.get(key)?.name ?? key;
      await this.emitActivity(tx, characterId, 'achievement', `Earned "${name}"`);
    }
  }

  /** Central evaluation after an encounter resolves (called inside the resolve tx). */
  async evaluateEncounter(
    tx: Prisma.TransactionClient,
    characterId: string,
    ctx: { died: boolean; riskLevel: RiskLevel; wonCombat: boolean | null; oldLevel: number; newLevel: number; droppedRarity: Rarity | null },
  ): Promise<void> {
    const keys: string[] = ['first-steps'];
    if (ctx.died) keys.push('first-death');
    if (!ctx.died && ctx.riskLevel === 'ridiculous') keys.push('survived-something-ridiculous');
    if (ctx.wonCombat) keys.push('first-victory');
    if (!ctx.died && ctx.newLevel >= 5) keys.push('reached-level-5');
    if (!ctx.died && ctx.newLevel >= 10) keys.push('reached-level-10');
    if (ctx.droppedRarity && RARE_OR_BETTER.includes(ctx.droppedRarity)) keys.push('earned-first-rare-item');

    const newly = await this.award(tx, characterId, keys);
    await this.emitAchievementActivity(tx, characterId, newly);

    if (!ctx.died && ctx.newLevel > ctx.oldLevel && LEVEL_MILESTONES.has(ctx.newLevel)) {
      await this.emitActivity(tx, characterId, 'level', `Reached level ${ctx.newLevel}`);
    }
  }

  async onGuildFounded(tx: Prisma.TransactionClient, characterId: string, guildName: string): Promise<void> {
    const newly = await this.award(tx, characterId, ['founded-a-guild']);
    await this.emitAchievementActivity(tx, characterId, newly);
    await this.emitActivity(tx, characterId, 'guild', `Founded the guild ${guildName}`);
  }

  async onGuildJoined(tx: Prisma.TransactionClient, characterId: string, guildName: string): Promise<void> {
    const newly = await this.award(tx, characterId, ['joined-a-guild']);
    await this.emitAchievementActivity(tx, characterId, newly);
    await this.emitActivity(tx, characterId, 'guild', `Joined the guild ${guildName}`);
  }

  async onFriendMade(tx: Prisma.TransactionClient, aId: string, bId: string): Promise<void> {
    await this.emitAchievementActivity(tx, aId, await this.award(tx, aId, ['made-first-friend']));
    await this.emitAchievementActivity(tx, bId, await this.award(tx, bId, ['made-first-friend']));
  }

  async onMarketSale(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
    await this.emitAchievementActivity(tx, characterId, await this.award(tx, characterId, ['sold-first-item']));
  }

  async onFirstRevival(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
    await this.emitAchievementActivity(tx, characterId, await this.award(tx, characterId, ['first-revival']));
  }

  async onEscape(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
    const newly = await this.award(tx, characterId, ['escaped-the-island']);
    await this.emitAchievementActivity(tx, characterId, newly);
    await this.emitActivity(tx, characterId, 'escape', 'Escaped the island. Allegedly.');
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

  /** Recent public world activity, with blocked players filtered out for the viewer. */
  async recentFeed(viewerCharacterId: string, limit = 30): Promise<ActivityEventView[]> {
    const blocked = await this.relationships.blockedIdsForFeed(viewerCharacterId);
    const rows = await this.prisma.activityEvent.findMany({
      where: blocked.length ? { characterId: { notIn: blocked } } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: { character: { select: { displayName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type as ActivityType,
      characterId: r.characterId,
      displayName: r.character.displayName,
      title: r.title,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
