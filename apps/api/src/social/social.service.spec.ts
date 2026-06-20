import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';

function makeTx() {
  return {
    friendRequest: { update: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    friendship: { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({}) },
    blockedUser: { upsert: vi.fn().mockResolvedValue({}) },
  } as any;
}

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    character: { findUnique: vi.fn(), findMany: vi.fn() },
    friendship: { findUnique: vi.fn() },
    friendRequest: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (cb: any) => cb(makeTx())),
    ...over,
  } as any;
}

function makeRelationships() {
  return { isBlockedEitherWay: vi.fn().mockResolvedValue(false), blockedIdsForFeed: vi.fn().mockResolvedValue([]) } as any;
}

const achievements = { onFriendMade: vi.fn().mockResolvedValue(undefined) } as any;

describe('SocialService.sendRequest', () => {
  it('refuses to befriend yourself', async () => {
    const svc = new SocialService(makePrisma(), makeRelationships(), achievements);
    await expect(svc.sendRequest('a', 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the target does not exist', async () => {
    const prisma = makePrisma();
    prisma.character.findUnique.mockResolvedValue(null);
    const svc = new SocialService(prisma, makeRelationships(), achievements);
    await expect(svc.sendRequest('a', 'b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is blocked when either party has a block in place', async () => {
    const prisma = makePrisma();
    prisma.character.findUnique.mockResolvedValue({ id: 'b' });
    const rel = makeRelationships();
    rel.isBlockedEitherWay.mockResolvedValue(true);
    const svc = new SocialService(prisma, rel, achievements);
    await expect(svc.sendRequest('a', 'b')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a duplicate when already friends', async () => {
    const prisma = makePrisma();
    prisma.character.findUnique.mockResolvedValue({ id: 'b' });
    prisma.friendship.findUnique.mockResolvedValue({ id: 'f1' });
    const svc = new SocialService(prisma, makeRelationships(), achievements);
    await expect(svc.sendRequest('a', 'b')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends a pending request in the normal case', async () => {
    const prisma = makePrisma();
    prisma.character.findUnique.mockResolvedValue({ id: 'b' });
    prisma.friendship.findUnique.mockResolvedValue(null);
    prisma.friendRequest.findUnique.mockResolvedValue(null); // no reverse request
    const svc = new SocialService(prisma, makeRelationships(), achievements);
    const res = await svc.sendRequest('a', 'b');
    expect(res).toEqual({ sent: true });
    expect(prisma.friendRequest.upsert).toHaveBeenCalled();
  });
});

describe('SocialService.search', () => {
  it('excludes the searcher and anyone in a block relationship with them', async () => {
    const prisma = makePrisma();
    prisma.character.findMany.mockResolvedValue([{ id: 'y', displayName: 'Yann', level: 3 }]);
    const rel = makeRelationships();
    rel.blockedIdsForFeed.mockResolvedValue(['x']);
    const svc = new SocialService(prisma, rel, achievements);
    await svc.search('me', 'ya');
    const where = prisma.character.findMany.mock.calls[0][0].where;
    expect(where.id.notIn).toEqual(['me', 'x']);
  });

  it('returns nothing for a too-short query', async () => {
    const prisma = makePrisma();
    const svc = new SocialService(prisma, makeRelationships(), achievements);
    expect(await svc.search('me', 'a')).toEqual([]);
    expect(prisma.character.findMany).not.toHaveBeenCalled();
  });
});

describe('SocialService.block', () => {
  it('cannot block yourself', async () => {
    const svc = new SocialService(makePrisma(), makeRelationships(), achievements);
    await expect(svc.block('a', 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tears down friendship + pending requests in a transaction', async () => {
    const tx = makeTx();
    const prisma = makePrisma({ $transaction: vi.fn(async (cb: any) => cb(tx)) });
    const svc = new SocialService(prisma, makeRelationships(), achievements);
    await svc.block('a', 'b');
    expect(tx.blockedUser.upsert).toHaveBeenCalled();
    expect(tx.friendship.deleteMany).toHaveBeenCalled();
    expect(tx.friendRequest.deleteMany).toHaveBeenCalled();
  });
});
