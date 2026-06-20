import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketService } from './market.service';

/** Build a prisma mock whose $transaction invokes the callback with a tx client. */
function makeCtx(txOver: Record<string, any> = {}) {
  const tx = {
    marketListing: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    inventoryItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    ...txOver,
  };
  const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) } as any;
  const economy = { spendNormal: vi.fn(), applyDeltas: vi.fn() } as any;
  const achievements = { onMarketSale: vi.fn() } as any;
  const svc = new MarketService(prisma, economy, achievements);
  return { svc, tx, economy, achievements };
}

const listingRow = (over: Record<string, any> = {}) => ({
  id: 'L1',
  status: 'active',
  sellerCharacterId: 'seller',
  itemDefinitionId: 'I1',
  priceAmount: 50,
  quantity: 1,
  createdAt: new Date(),
  itemDefinition: { name: 'Thing', slot: 'trinket', rarity: 'common' },
  seller: { displayName: 'Seller' },
  ...over,
});

describe('MarketService.buy race safety', () => {
  it('wins the claim and moves value exactly once when the listing is still active', async () => {
    const { svc, tx, economy } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow());
    tx.marketListing.updateMany.mockResolvedValue({ count: 1 });
    tx.marketListing.findUniqueOrThrow.mockResolvedValue(listingRow({ status: 'sold' }));

    await svc.buy('buyer', 'L1');

    // The atomic claim must run before any value transfer.
    expect(tx.marketListing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'L1', status: 'active' } }),
    );
    expect(economy.spendNormal).toHaveBeenCalledTimes(1);
    expect(economy.applyDeltas).toHaveBeenCalledTimes(1);
    expect(tx.inventoryItem.create).toHaveBeenCalledTimes(1);
  });

  it('loses the claim (count 0) on a concurrent double-buy and transfers NOTHING', async () => {
    const { svc, tx, economy } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow());
    tx.marketListing.updateMany.mockResolvedValue({ count: 0 }); // another buy already claimed it

    await expect(svc.buy('buyer', 'L1')).rejects.toBeInstanceOf(NotFoundException);
    expect(economy.spendNormal).not.toHaveBeenCalled();
    expect(economy.applyDeltas).not.toHaveBeenCalled();
    expect(tx.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('rejects buying your own listing before claiming', async () => {
    const { svc, tx } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow({ sellerCharacterId: 'buyer' }));
    await expect(svc.buy('buyer', 'L1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.marketListing.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-active listing', async () => {
    const { svc, tx } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow({ status: 'sold' }));
    await expect(svc.buy('buyer', 'L1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketService.cancel race safety', () => {
  it('releases the escrow exactly once when the claim wins', async () => {
    const { svc, tx } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow());
    tx.marketListing.updateMany.mockResolvedValue({ count: 1 });
    await expect(svc.cancel('seller', 'L1')).resolves.toEqual({ cancelled: true });
    expect(tx.inventoryItem.create).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-create the item when the claim loses (count 0)', async () => {
    const { svc, tx } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow());
    tx.marketListing.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.cancel('seller', 'L1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.inventoryItem.create).not.toHaveBeenCalled();
  });

  it('rejects cancelling a listing you do not own', async () => {
    const { svc, tx } = makeCtx();
    tx.marketListing.findUnique.mockResolvedValue(listingRow({ sellerCharacterId: 'someone-else' }));
    await expect(svc.cancel('seller', 'L1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketService.create ownership + escrow', () => {
  it('rejects listing an item you do not own', async () => {
    const { svc, tx } = makeCtx();
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'X', characterId: 'someone-else', equipped: false, quantity: 5, itemDefinitionId: 'I1' });
    await expect(svc.create('me', { inventoryItemId: 'X', priceAmount: 10, quantity: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects listing an equipped item', async () => {
    const { svc, tx } = makeCtx();
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'X', characterId: 'me', equipped: true, quantity: 5, itemDefinitionId: 'I1' });
    await expect(svc.create('me', { inventoryItemId: 'X', priceAmount: 10, quantity: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects listing more than you hold', async () => {
    const { svc, tx } = makeCtx();
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'X', characterId: 'me', equipped: false, quantity: 1, itemDefinitionId: 'I1' });
    await expect(svc.create('me', { inventoryItemId: 'X', priceAmount: 10, quantity: 5 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
