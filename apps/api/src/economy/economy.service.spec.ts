import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EconomyService } from './economy.service';

function makeTx() {
  return {
    character: { updateMany: vi.fn(), update: vi.fn() },
    economyTransaction: { create: vi.fn(), createMany: vi.fn() },
  } as any;
}

describe('EconomyService.spendNormal (atomic, race-safe)', () => {
  it('debits with a conditional updateMany gated on a sufficient balance', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    await svc.spendNormal(tx, 'c1', 50, 'market:buy', 'L1');
    expect(tx.character.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', normalMoney: { gte: 50 } },
      data: { normalMoney: { decrement: 50 } },
    });
    expect(tx.economyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'normal', amount: -50 }) }),
    );
  });

  it('throws and writes no ledger row when the balance is insufficient (count 0)', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    tx.character.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.spendNormal(tx, 'c1', 999, 'revive:pay')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.economyTransaction.create).not.toHaveBeenCalled();
  });

  it('is a no-op for non-positive amounts', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    await svc.spendNormal(tx, 'c1', 0, 'noop');
    expect(tx.character.updateMany).not.toHaveBeenCalled();
    expect(tx.economyTransaction.create).not.toHaveBeenCalled();
  });
});

describe('EconomyService.spendCrafting (atomic, race-safe)', () => {
  it('debits the craftingResources column conditionally', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    tx.character.updateMany.mockResolvedValue({ count: 1 });
    await svc.spendCrafting(tx, 'c1', 10, 'guild:deposit', 'g1');
    expect(tx.character.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', craftingResources: { gte: 10 } },
      data: { craftingResources: { decrement: 10 } },
    });
    expect(tx.economyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'crafting', amount: -10 }) }),
    );
  });

  it('rejects an unaffordable deposit', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    tx.character.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.spendCrafting(tx, 'c1', 10, 'guild:deposit')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EconomyService.applyDeltas', () => {
  it('increments only the supplied currencies and logs each as a ledger row', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    await svc.applyDeltas(tx, 'c1', { xp: 10, normal: 5 }, 'encounter:x', 'e1');
    expect(tx.character.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { xp: { increment: 10 }, normalMoney: { increment: 5 } },
    });
    expect(tx.economyTransaction.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.economyTransaction.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
  });

  it('does nothing when all deltas are zero/absent', async () => {
    const svc = new EconomyService();
    const tx = makeTx();
    await svc.applyDeltas(tx, 'c1', {}, 'noop');
    expect(tx.character.update).not.toHaveBeenCalled();
  });
});
