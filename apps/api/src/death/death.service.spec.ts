import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DeathService } from './death.service';

const downed = (over: Record<string, any> = {}) => ({
  id: 'c1',
  isDead: true,
  deathReason: 'oops',
  deathStartedAt: new Date(),
  reviveAvailableAt: new Date(Date.now() - 1000),
  freeReviveAvailable: false,
  deathCount: 0,
  normalMoney: 100,
  staminaMax: 100,
  staminaCurrent: 10,
  ...over,
});

function makeCtx(character: Record<string, any>) {
  const tx = {
    character: { updateMany: vi.fn() },
    deathRecord: { updateMany: vi.fn() },
  } as any;
  const prisma = {
    character: { findUniqueOrThrow: vi.fn().mockResolvedValue(character) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  } as any;
  const economy = { spendNormal: vi.fn() } as any;
  const achievements = { onFirstRevival: vi.fn() } as any;
  const svc = new DeathService(prisma, economy, achievements);
  return { svc, tx, prisma, economy };
}

describe('DeathService.revive', () => {
  it('rejects reviving a character who is not downed', async () => {
    const { svc } = makeCtx(downed({ isDead: false }));
    await expect(svc.revive('c1', { method: 'wait' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('free revive claims with freeReviveAvailable and never spends Clams', async () => {
    const { svc, tx, economy } = makeCtx(downed({ freeReviveAvailable: true }));
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    await svc.revive('c1', { method: 'free' } as any);
    expect(tx.character.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isDead: true, freeReviveAvailable: true }) }),
    );
    expect(economy.spendNormal).not.toHaveBeenCalled();
  });

  it('free revive fails (claim count 0) when no free revive is available', async () => {
    const { svc, tx } = makeCtx(downed({ freeReviveAvailable: false }));
    tx.character.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.revive('c1', { method: 'free' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paid revive charges the deathCount-scaled cost via spendNormal', async () => {
    const { svc, tx, economy } = makeCtx(downed({ deathCount: 2 }));
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    await svc.revive('c1', { method: 'pay' } as any);
    // PAY_BASE_COST(25) + deathCount(2) * PAY_COST_PER_DEATH(15) = 55
    expect(economy.spendNormal).toHaveBeenCalledWith(tx, 'c1', 55, 'revive:pay');
  });

  it('wait revive fails (claim count 0) before the timer elapses', async () => {
    const { svc, tx } = makeCtx(downed({ reviveAvailableAt: new Date(Date.now() + 60_000) }));
    tx.character.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.revive('c1', { method: 'wait' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
