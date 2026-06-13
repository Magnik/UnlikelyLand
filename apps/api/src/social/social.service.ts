import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DirectoryEntry, SocialView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

/** Order a pair of ids so each friendship is stored once. */
function pairKey(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Friends, friend requests, and blocking. Blocking removes any existing
 * friendship + pending requests and prevents new requests/mail; chat already
 * hides blocked users' messages.
 */
@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(characterId: string): Promise<SocialView> {
    const [friendships, incoming, outgoing, blocked] = await Promise.all([
      this.prisma.friendship.findMany({ where: { OR: [{ characterAId: characterId }, { characterBId: characterId }] } }),
      this.prisma.friendRequest.findMany({ where: { toCharacterId: characterId, status: 'pending' } }),
      this.prisma.friendRequest.findMany({ where: { fromCharacterId: characterId, status: 'pending' } }),
      this.prisma.blockedUser.findMany({ where: { characterId } }),
    ]);

    const friendIds = friendships.map((f) => (f.characterAId === characterId ? f.characterBId : f.characterAId));
    const otherIds = Array.from(
      new Set([
        ...friendIds,
        ...incoming.map((r) => r.fromCharacterId),
        ...outgoing.map((r) => r.toCharacterId),
        ...blocked.map((b) => b.blockedCharacterId),
      ]),
    );
    const chars = await this.prisma.character.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, displayName: true, level: true },
    });
    const map = new Map(chars.map((c) => [c.id, c]));
    const entry = (id: string): DirectoryEntry => ({
      characterId: id,
      displayName: map.get(id)?.displayName ?? 'Unknown',
      level: map.get(id)?.level ?? 1,
    });

    return {
      friends: friendIds.map(entry),
      incoming: incoming.map((r) => ({
        id: r.id,
        characterId: r.fromCharacterId,
        displayName: map.get(r.fromCharacterId)?.displayName ?? 'Unknown',
        createdAt: r.createdAt.toISOString(),
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        characterId: r.toCharacterId,
        displayName: map.get(r.toCharacterId)?.displayName ?? 'Unknown',
        createdAt: r.createdAt.toISOString(),
      })),
      blocked: blocked.map((b) => entry(b.blockedCharacterId)),
    };
  }

  async search(characterId: string, q: string): Promise<DirectoryEntry[]> {
    if (!q || q.trim().length < 2) return [];
    const chars = await this.prisma.character.findMany({
      where: { displayName: { contains: q.trim(), mode: 'insensitive' }, id: { not: characterId } },
      select: { id: true, displayName: true, level: true },
      take: 20,
      orderBy: { displayName: 'asc' },
    });
    return chars.map((c) => ({ characterId: c.id, displayName: c.displayName, level: c.level }));
  }

  async sendRequest(fromId: string, toId: string) {
    if (fromId === toId) throw new BadRequestException('You cannot befriend yourself');
    const target = await this.prisma.character.findUnique({ where: { id: toId }, select: { id: true } });
    if (!target) throw new NotFoundException('Character not found');

    const blocked = await this.prisma.blockedUser.findFirst({
      where: { OR: [{ characterId: fromId, blockedCharacterId: toId }, { characterId: toId, blockedCharacterId: fromId }] },
    });
    if (blocked) throw new BadRequestException('Cannot send a request to this player');

    const [a, b] = pairKey(fromId, toId);
    const already = await this.prisma.friendship.findUnique({
      where: { characterAId_characterBId: { characterAId: a, characterBId: b } },
    });
    if (already) throw new BadRequestException('You are already friends');

    // If they already requested us, accept instead of creating a mirror request.
    const reverse = await this.prisma.friendRequest.findUnique({
      where: { fromCharacterId_toCharacterId: { fromCharacterId: toId, toCharacterId: fromId } },
    });
    if (reverse && reverse.status === 'pending') {
      await this.prisma.$transaction(async (tx) => {
        await tx.friendRequest.update({ where: { id: reverse.id }, data: { status: 'accepted' } });
        await tx.friendship.upsert({
          where: { characterAId_characterBId: { characterAId: a, characterBId: b } },
          update: {},
          create: { characterAId: a, characterBId: b },
        });
      });
      return { friends: true };
    }

    await this.prisma.friendRequest.upsert({
      where: { fromCharacterId_toCharacterId: { fromCharacterId: fromId, toCharacterId: toId } },
      update: { status: 'pending' },
      create: { fromCharacterId: fromId, toCharacterId: toId, status: 'pending' },
    });
    return { sent: true };
  }

  async acceptRequest(characterId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req || req.toCharacterId !== characterId || req.status !== 'pending') throw new NotFoundException('Request not found');
    const [a, b] = pairKey(req.fromCharacterId, req.toCharacterId);
    await this.prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({ where: { id: req.id }, data: { status: 'accepted' } });
      await tx.friendship.upsert({
        where: { characterAId_characterBId: { characterAId: a, characterBId: b } },
        update: {},
        create: { characterAId: a, characterBId: b },
      });
    });
    return { accepted: true };
  }

  async rejectRequest(characterId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req || req.toCharacterId !== characterId) throw new NotFoundException('Request not found');
    await this.prisma.friendRequest.update({ where: { id: req.id }, data: { status: 'rejected' } });
    return { rejected: true };
  }

  async removeFriend(characterId: string, otherId: string) {
    const [a, b] = pairKey(characterId, otherId);
    await this.prisma.friendship.deleteMany({ where: { characterAId: a, characterBId: b } });
    return { removed: true };
  }

  async block(characterId: string, targetId: string) {
    if (characterId === targetId) throw new BadRequestException('You cannot block yourself');
    const [a, b] = pairKey(characterId, targetId);
    await this.prisma.$transaction(async (tx) => {
      await tx.blockedUser.upsert({
        where: { characterId_blockedCharacterId: { characterId, blockedCharacterId: targetId } },
        update: {},
        create: { characterId, blockedCharacterId: targetId },
      });
      await tx.friendship.deleteMany({ where: { characterAId: a, characterBId: b } });
      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { fromCharacterId: characterId, toCharacterId: targetId },
            { fromCharacterId: targetId, toCharacterId: characterId },
          ],
        },
      });
    });
    return { blocked: true };
  }

  async unblock(characterId: string, targetId: string) {
    await this.prisma.blockedUser.deleteMany({ where: { characterId, blockedCharacterId: targetId } });
    return { unblocked: true };
  }
}
