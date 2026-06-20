import { Injectable } from '@nestjs/common';
import type { ProfileRelationship } from '@unlikelyland/contracts';
import { PrismaService } from './prisma.service';

/** Order a pair of ids so each friendship is looked up by its canonical key. */
function pairKey(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * The single source of truth for "what is the relationship between two players".
 * Block-checking and friendship lookups were previously duplicated (and divergent)
 * across chat/mail/social; every social surface now consumes this one service so
 * block semantics — always bidirectional — cannot drift per feature.
 *
 * Lives in the @Global CommonModule, so any service can inject it with no extra
 * module wiring.
 */
@Injectable()
export class RelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  /** True if a block exists in EITHER direction between a and b. */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const row = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { characterId: a, blockedCharacterId: b },
          { characterId: b, blockedCharacterId: a },
        ],
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Every character id in a block relationship with `viewer` (either direction).
   * Used to filter feeds/listings (chat, search) so neither party sees the other.
   */
  async blockedIdsForFeed(viewer: string): Promise<string[]> {
    const rows = await this.prisma.blockedUser.findMany({
      where: { OR: [{ characterId: viewer }, { blockedCharacterId: viewer }] },
      select: { characterId: true, blockedCharacterId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.characterId === viewer ? r.blockedCharacterId : r.characterId);
    }
    ids.delete(viewer);
    return [...ids];
  }

  /** True if a and b are friends (symmetric). */
  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const [x, y] = pairKey(a, b);
    const f = await this.prisma.friendship.findUnique({
      where: { characterAId_characterBId: { characterAId: x, characterBId: y } },
      select: { id: true },
    });
    return f !== null;
  }

  /** Full relationship status of `viewer` toward `target` (drives profile UI controls). */
  async relationshipStatus(viewer: string, target: string): Promise<ProfileRelationship> {
    if (viewer === target) {
      return { isSelf: true, isFriend: false, requestIncoming: false, requestOutgoing: false, isBlocked: false };
    }
    const [friends, blocked, outgoing, incoming] = await Promise.all([
      this.areFriends(viewer, target),
      this.prisma.blockedUser.findUnique({
        where: { characterId_blockedCharacterId: { characterId: viewer, blockedCharacterId: target } },
        select: { id: true },
      }),
      this.prisma.friendRequest.findUnique({
        where: { fromCharacterId_toCharacterId: { fromCharacterId: viewer, toCharacterId: target } },
        select: { status: true },
      }),
      this.prisma.friendRequest.findUnique({
        where: { fromCharacterId_toCharacterId: { fromCharacterId: target, toCharacterId: viewer } },
        select: { status: true },
      }),
    ]);
    return {
      isSelf: false,
      isFriend: friends,
      requestOutgoing: outgoing?.status === 'pending',
      requestIncoming: incoming?.status === 'pending',
      isBlocked: blocked !== null,
    };
  }
}
