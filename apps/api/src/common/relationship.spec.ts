import { describe, it, expect, vi } from 'vitest';
import { RelationshipService } from './relationship.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    blockedUser: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    friendship: { findUnique: vi.fn() },
    friendRequest: { findUnique: vi.fn() },
    ...overrides,
  } as any;
}

describe('RelationshipService.isBlockedEitherWay', () => {
  it('returns false for the same character without querying', async () => {
    const prisma = makePrisma();
    const svc = new RelationshipService(prisma);
    expect(await svc.isBlockedEitherWay('a', 'a')).toBe(false);
    expect(prisma.blockedUser.findFirst).not.toHaveBeenCalled();
  });

  it('is true when a block exists in either direction', async () => {
    const prisma = makePrisma();
    prisma.blockedUser.findFirst.mockResolvedValue({ id: 'blk1' });
    const svc = new RelationshipService(prisma);
    expect(await svc.isBlockedEitherWay('a', 'b')).toBe(true);
    // The OR query covers both (a blocks b) and (b blocks a).
    const where = prisma.blockedUser.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { characterId: 'a', blockedCharacterId: 'b' },
      { characterId: 'b', blockedCharacterId: 'a' },
    ]);
  });

  it('is false when no block row exists', async () => {
    const prisma = makePrisma();
    prisma.blockedUser.findFirst.mockResolvedValue(null);
    const svc = new RelationshipService(prisma);
    expect(await svc.isBlockedEitherWay('a', 'b')).toBe(false);
  });
});

describe('RelationshipService.blockedIdsForFeed', () => {
  it('collects the OTHER party from blocks in both directions and excludes the viewer', async () => {
    const prisma = makePrisma();
    prisma.blockedUser.findMany.mockResolvedValue([
      { characterId: 'viewer', blockedCharacterId: 'x' }, // viewer blocked x
      { characterId: 'y', blockedCharacterId: 'viewer' }, // y blocked viewer
      { characterId: 'viewer', blockedCharacterId: 'x' }, // duplicate
    ]);
    const svc = new RelationshipService(prisma);
    const ids = await svc.blockedIdsForFeed('viewer');
    expect(ids.sort()).toEqual(['x', 'y']);
    expect(ids).not.toContain('viewer');
  });

  it('returns an empty array when there are no blocks', async () => {
    const prisma = makePrisma();
    prisma.blockedUser.findMany.mockResolvedValue([]);
    const svc = new RelationshipService(prisma);
    expect(await svc.blockedIdsForFeed('viewer')).toEqual([]);
  });
});

describe('RelationshipService.relationshipStatus', () => {
  it('flags self', async () => {
    const svc = new RelationshipService(makePrisma());
    const rel = await svc.relationshipStatus('me', 'me');
    expect(rel).toEqual({ isSelf: true, isFriend: false, requestIncoming: false, requestOutgoing: false, isBlocked: false });
  });

  it('reports friend + outgoing/incoming + blocked state', async () => {
    const prisma = makePrisma();
    prisma.friendship.findUnique.mockResolvedValue({ id: 'f1' }); // areFriends -> true
    prisma.blockedUser.findUnique.mockResolvedValue(null);
    prisma.friendRequest.findUnique
      .mockResolvedValueOnce({ status: 'pending' }) // outgoing
      .mockResolvedValueOnce(null); // incoming
    const svc = new RelationshipService(prisma);
    const rel = await svc.relationshipStatus('me', 'them');
    expect(rel.isSelf).toBe(false);
    expect(rel.isFriend).toBe(true);
    expect(rel.requestOutgoing).toBe(true);
    expect(rel.requestIncoming).toBe(false);
    expect(rel.isBlocked).toBe(false);
  });
});
