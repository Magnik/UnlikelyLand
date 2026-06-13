import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateListingInput, MarketListingView } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { EconomyService } from '../economy/economy.service';

interface MarketRow {
  id: string;
  quantity: number;
  priceAmount: number;
  sellerCharacterId: string;
  status: string;
  createdAt: Date;
  itemDefinitionId: string;
  itemDefinition: { name: string; slot: string; rarity: string };
  seller: { displayName: string };
}

/**
 * Player-to-player market (normal currency only). Listing escrows the items out
 * of inventory so they can't be used or double-sold; buying transfers Clams via
 * the economy ledger and hands the items to the buyer; cancelling returns them.
 * All mutations are transactional and validate ownership / price / quantity.
 */
@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async list(viewer: string): Promise<MarketListingView[]> {
    const rows = await this.prisma.marketListing.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { itemDefinition: true, seller: { select: { displayName: true } } },
    });
    return rows.map((r) => this.toView(r as MarketRow, viewer));
  }

  async mine(characterId: string): Promise<MarketListingView[]> {
    const rows = await this.prisma.marketListing.findMany({
      where: { sellerCharacterId: characterId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { itemDefinition: true, seller: { select: { displayName: true } } },
    });
    return rows.map((r) => this.toView(r as MarketRow, characterId));
  }

  async create(characterId: string, dto: CreateListingInput): Promise<MarketListingView> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.inventoryItemId } });
      if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');
      if (item.equipped) throw new BadRequestException('Unequip the item before listing it');
      if (item.quantity < dto.quantity) throw new BadRequestException('You do not have that many');

      if (item.quantity > dto.quantity) {
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: dto.quantity } } });
      } else {
        await tx.inventoryItem.delete({ where: { id: item.id } });
      }

      const listing = await tx.marketListing.create({
        data: {
          sellerCharacterId: characterId,
          itemDefinitionId: item.itemDefinitionId,
          quantity: dto.quantity,
          priceCurrencyType: 'normal',
          priceAmount: dto.priceAmount,
          status: 'active',
        },
        include: { itemDefinition: true, seller: { select: { displayName: true } } },
      });
      return this.toView(listing as MarketRow, characterId);
    });
  }

  async buy(buyerId: string, listingId: string): Promise<MarketListingView> {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findUnique({
        where: { id: listingId },
        include: { itemDefinition: true, seller: { select: { displayName: true } } },
      });
      if (!listing || listing.status !== 'active') throw new NotFoundException('Listing not available');
      if (listing.sellerCharacterId === buyerId) throw new BadRequestException('You cannot buy your own listing');

      await this.economy.spendNormal(tx, buyerId, listing.priceAmount, 'market:buy', listing.id);
      await this.economy.applyDeltas(tx, listing.sellerCharacterId, { normal: listing.priceAmount }, 'market:sell', listing.id);
      await tx.inventoryItem.create({
        data: { characterId: buyerId, itemDefinitionId: listing.itemDefinitionId, quantity: listing.quantity },
      });
      const updated = await tx.marketListing.update({
        where: { id: listing.id },
        data: { status: 'sold', buyerCharacterId: buyerId, soldAt: new Date() },
        include: { itemDefinition: true, seller: { select: { displayName: true } } },
      });
      return this.toView(updated as MarketRow, buyerId);
    });
  }

  async cancel(characterId: string, listingId: string): Promise<{ cancelled: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!listing || listing.sellerCharacterId !== characterId) throw new NotFoundException('Listing not found');
      if (listing.status !== 'active') throw new BadRequestException('Listing is not active');
      await tx.inventoryItem.create({
        data: { characterId, itemDefinitionId: listing.itemDefinitionId, quantity: listing.quantity },
      });
      await tx.marketListing.update({ where: { id: listing.id }, data: { status: 'cancelled' } });
      return { cancelled: true };
    });
  }

  private toView(r: MarketRow, viewer: string): MarketListingView {
    return {
      id: r.id,
      itemName: r.itemDefinition.name,
      itemSlot: r.itemDefinition.slot as MarketListingView['itemSlot'],
      itemRarity: r.itemDefinition.rarity as MarketListingView['itemRarity'],
      quantity: r.quantity,
      priceAmount: r.priceAmount,
      priceCurrency: 'normal',
      sellerCharacterId: r.sellerCharacterId,
      sellerName: r.seller.displayName,
      status: r.status as MarketListingView['status'],
      createdAt: r.createdAt.toISOString(),
      mine: r.sellerCharacterId === viewer,
    };
  }
}
