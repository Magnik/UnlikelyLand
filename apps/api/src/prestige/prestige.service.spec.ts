import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_STATS } from '@unlikelyland/contracts';
import { PrestigeService } from './prestige.service';

const HIGH_XP = 1_000_000; // comfortably past the escape level gate

function makeCtx(opts: { xp?: number; escapeCount?: number } = {}) {
  const tx = {
    escapeRecord: { create: vi.fn() },
    characterStats: { update: vi.fn() },
    character: { update: vi.fn() },
    inventoryItem: { deleteMany: vi.fn() },
    expedition: { updateMany: vi.fn() },
    encounter: { updateMany: vi.fn() },
    storyMemory: { create: vi.fn() },
  } as any;
  const prisma = {
    character: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'c1', xp: opts.xp ?? HIGH_XP, staminaMax: 100, regionSetId: 'r1' }) },
    escapeRecord: { count: vi.fn().mockResolvedValue(opts.escapeCount ?? 0) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  } as any;
  const characters = { buildView: vi.fn().mockResolvedValue({}) } as any;
  const achievements = { onEscape: vi.fn() } as any;
  const svc = new PrestigeService(prisma, characters, achievements);
  return { svc, tx, prisma };
}

describe('PrestigeService.escape', () => {
  it('rejects an escape below the required level', async () => {
    const { svc } = makeCtx({ xp: 0 });
    await expect(svc.escape('c1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('grants the permanent +1 to every stat and Escape Tokens scaled by escape count', async () => {
    const { svc, tx } = makeCtx({ escapeCount: 0 });
    await svc.escape('c1');
    // +1 to EVERY stat.
    const statData = tx.characterStats.update.mock.calls[0][0].data;
    expect(Object.keys(statData)).toHaveLength(ALL_STATS.length);
    for (const s of ALL_STATS) expect(statData[s]).toEqual({ increment: 1 });
    // Inventory wiped and tokens granted (newCount = 0 + 1 = 1).
    expect(tx.inventoryItem.deleteMany).toHaveBeenCalledWith({ where: { characterId: 'c1' } });
    expect(tx.character.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ premiumMoney: { increment: 1 } }) }),
    );
  });

  it('maps a concurrent-escape unique violation (P2002) to a ConflictException', async () => {
    const { svc, tx } = makeCtx();
    tx.escapeRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(svc.escape('c1')).rejects.toBeInstanceOf(ConflictException);
  });
});
