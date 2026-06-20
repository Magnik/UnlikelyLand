import { Injectable } from '@nestjs/common';
import {
  LEADERBOARD_META,
  type LeaderboardEntry,
  type LeaderboardQueryInput,
  type LeaderboardType,
  type LeaderboardView,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { levelFromXp } from '../engine/leveling';

/** The indexed Character column each ranked board sorts by. */
const COLUMN: Record<Exclude<LeaderboardType, 'achievements'>, 'xp' | 'normalMoney' | 'reputation' | 'combatVictories'> = {
  level: 'xp',
  wealth: 'normalMoney',
  reputation: 'reputation',
  victories: 'combatVictories',
};

const DEFAULT_PAGE_SIZE = 25;

/**
 * Read-only public leaderboards. Premium currency is never exposed (wealth ranks
 * on normalMoney only). Boards paginate, include the viewer's own rank even when
 * off-page, and tie-break deterministically by character id so ranks are stable.
 * Players who opt out (hiddenFromLeaderboards) are excluded from every board.
 */
@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async board(type: LeaderboardType, viewerCharacterId: string, query: LeaderboardQueryInput): Promise<LeaderboardView> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 100);
    const meta = LEADERBOARD_META[type];

    const regionSetId = query.regionSetId;
    const { entries, total, me } =
      type === 'achievements'
        ? await this.achievementsBoard(viewerCharacterId, page, pageSize, regionSetId)
        : await this.columnBoard(type, viewerCharacterId, page, pageSize, regionSetId);

    return { type, label: meta.label, unit: meta.unit, page, pageSize, total, entries, me };
  }

  /** Boards backed by a single indexed Character column. Optionally region-scoped. */
  private async columnBoard(
    type: Exclude<LeaderboardType, 'achievements'>,
    viewer: string,
    page: number,
    pageSize: number,
    regionSetId?: string,
  ): Promise<{ entries: LeaderboardEntry[]; total: number; me: LeaderboardEntry | null }> {
    const col = COLUMN[type];
    const where = { hiddenFromLeaderboards: false, ...(regionSetId ? { regionSetId } : {}) };

    const [total, rows, meRow] = await Promise.all([
      this.prisma.character.count({ where }),
      this.prisma.character.findMany({
        where,
        orderBy: [{ [col]: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, displayName: true, xp: true, normalMoney: true, reputation: true, combatVictories: true },
      }),
      this.prisma.character.findUnique({
        where: { id: viewer },
        select: { id: true, displayName: true, xp: true, normalMoney: true, reputation: true, combatVictories: true },
      }),
    ]);

    const valueOf = (r: { xp: number; normalMoney: number; reputation: number; combatVictories: number }): number =>
      type === 'level'
        ? levelFromXp(r.xp).level
        : type === 'wealth'
          ? r.normalMoney
          : type === 'reputation'
            ? r.reputation
            : r.combatVictories;
    const sortValOf = (r: { xp: number; normalMoney: number; reputation: number; combatVictories: number }): number => r[col];

    const tags = await this.guildTagsFor(rows.map((r) => r.id).concat(meRow ? [meRow.id] : []));
    const startRank = (page - 1) * pageSize;
    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: startRank + i + 1,
      characterId: r.id,
      displayName: r.displayName,
      guildTag: tags.get(r.id) ?? null,
      level: levelFromXp(r.xp).level,
      value: valueOf(r),
      mine: r.id === viewer,
    }));

    let me: LeaderboardEntry | null = null;
    if (meRow) {
      const myVal = sortValOf(meRow);
      // Rank = (players strictly ahead) + 1, tie-broken by id asc to match orderBy.
      const ahead = await this.prisma.character.count({
        where: {
          hiddenFromLeaderboards: false,
          ...(regionSetId ? { regionSetId } : {}),
          OR: [{ [col]: { gt: myVal } }, { [col]: myVal, id: { lt: meRow.id } }],
        },
      });
      me = {
        rank: ahead + 1,
        characterId: meRow.id,
        displayName: meRow.displayName,
        guildTag: tags.get(meRow.id) ?? null,
        level: levelFromXp(meRow.xp).level,
        value: valueOf(meRow),
        mine: true,
      };
    }

    return { entries, total, me };
  }

  /**
   * Public-achievement-count board. Ranks by the number of unlocked PUBLIC
   * achievements. Computed in application code (player count is small for MVP);
   * private achievements never affect the rank.
   */
  private async achievementsBoard(
    viewer: string,
    page: number,
    pageSize: number,
    regionSetId?: string,
  ): Promise<{ entries: LeaderboardEntry[]; total: number; me: LeaderboardEntry | null }> {
    const publicIds = (await this.prisma.achievement.findMany({ where: { isPublic: true }, select: { id: true } })).map(
      (a) => a.id,
    );
    const grouped = publicIds.length
      ? await this.prisma.characterAchievement.groupBy({
          by: ['characterId'],
          where: { achievementId: { in: publicIds } },
          _count: { characterId: true },
        })
      : [];

    // Attach display info, drop opted-out + out-of-region players, sort by count desc then id asc.
    const ids = grouped.map((g) => g.characterId);
    const chars = await this.prisma.character.findMany({
      where: { id: { in: ids }, hiddenFromLeaderboards: false, ...(regionSetId ? { regionSetId } : {}) },
      select: { id: true, displayName: true, xp: true },
    });
    const charMap = new Map(chars.map((c) => [c.id, c]));
    const ranked = grouped
      .filter((g) => charMap.has(g.characterId))
      .map((g) => ({ id: g.characterId, value: g._count.characterId }))
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));

    const total = ranked.length;
    const slice = ranked.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    const tags = await this.guildTagsFor(ranked.map((r) => r.id));

    const entries: LeaderboardEntry[] = slice.map((r, i) => {
      const c = charMap.get(r.id)!;
      return {
        rank: (page - 1) * pageSize + i + 1,
        characterId: r.id,
        displayName: c.displayName,
        guildTag: tags.get(r.id) ?? null,
        level: levelFromXp(c.xp).level,
        value: r.value,
        mine: r.id === viewer,
      };
    });

    const myIndex = ranked.findIndex((r) => r.id === viewer);
    let me: LeaderboardEntry | null = null;
    if (myIndex >= 0) {
      const c = charMap.get(viewer)!;
      me = {
        rank: myIndex + 1,
        characterId: viewer,
        displayName: c.displayName,
        guildTag: tags.get(viewer) ?? null,
        level: levelFromXp(c.xp).level,
        value: ranked[myIndex].value,
        mine: true,
      };
    }

    return { entries, total, me };
  }

  private async guildTagsFor(characterIds: string[]): Promise<Map<string, string>> {
    if (characterIds.length === 0) return new Map();
    const members = await this.prisma.guildMember.findMany({
      where: { characterId: { in: characterIds } },
      select: { characterId: true, guild: { select: { tag: true } } },
    });
    const map = new Map<string, string>();
    for (const m of members) if (m.guild.tag) map.set(m.characterId, m.guild.tag);
    return map;
  }
}
