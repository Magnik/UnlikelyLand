import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GuildsService, guildLevelFromXp } from './guilds.service';

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    guildMember: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    guild: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    character: { findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
    ...over,
  } as any;
}

const achievements = { onGuildFounded: vi.fn(), onGuildJoined: vi.fn() } as any;
const economy = { applyDeltas: vi.fn(), spendCrafting: vi.fn(), spendNormal: vi.fn() } as any;

describe('GuildsService role enforcement', () => {
  it('promote requires the owner role', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g', role: 'member' });
    const svc = new GuildsService(prisma, achievements, economy);
    await expect(svc.promote('caller', 'target')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an owner cannot kick the owner', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g', role: 'owner' }) // caller
      .mockResolvedValueOnce({ guildId: 'g', role: 'owner' }); // target is also owner
    const svc = new GuildsService(prisma, achievements, economy);
    await expect(svc.kick('caller', 'target')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('GuildsService.leave (founder restriction)', () => {
  it('blocks the owner from leaving a populated guild', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g', role: 'owner' });
    prisma.guildMember.count.mockResolvedValue(3);
    const svc = new GuildsService(prisma, achievements, economy);
    await expect(svc.leave('owner')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('GuildsService.create (moderation)', () => {
  it('rejects a guild name that fails moderation', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique.mockResolvedValue(null); // not already in a guild
    const svc = new GuildsService(prisma, achievements, economy);
    await expect(svc.create('c1', { name: 'Nazi Club' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('GuildsService bank', () => {
  it('rejects a deposit when not in a guild', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique.mockResolvedValue(null);
    const svc = new GuildsService(prisma, achievements, economy);
    await expect(svc.depositToBank('c1', 10)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a deposit larger than the member’s Oddments', async () => {
    const prisma = makePrisma();
    prisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g' });
    // The deposit now debits atomically via economy.spendCrafting inside the tx,
    // which throws when the member can't afford it (race-safe conditional decrement).
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    const economyMock = {
      applyDeltas: vi.fn(),
      spendCrafting: vi.fn().mockRejectedValue(new BadRequestException('Not enough Oddments')),
    } as any;
    const svc = new GuildsService(prisma, achievements, economyMock);
    await expect(svc.depositToBank('c1', 10)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('guildLevelFromXp', () => {
  it('derives a monotonic level from xp', () => {
    expect(guildLevelFromXp(0)).toBe(1);
    expect(guildLevelFromXp(100)).toBe(2);
    expect(guildLevelFromXp(400)).toBe(3);
    expect(guildLevelFromXp(900)).toBe(4);
  });
});
