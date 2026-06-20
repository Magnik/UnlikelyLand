import { Injectable } from '@nestjs/common';
import type { ItemDefinition, Prisma } from '@prisma/client';
import type { ExpeditionType, ItemSlot, Rarity } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { pickSlotForExpedition } from '../engine/loot';
import type { Rng } from '../engine/rng';

export interface DropSelectionInput {
  rarity: Rarity;
  /** Null for non-expedition (one-off) encounters. */
  expeditionType: ExpeditionType | null;
  level: number;
  rng: Rng;
}

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Server-authoritative loot selection over the APPROVED item catalog. The rarity
 * is decided upstream (level-aware roll in the reward engine); this service turns
 * that into a concrete ItemDefinition, biasing the slot toward the expedition
 * type so e.g. "Pick a Fight" tends to drop weapons/armor and "Scavenge" tends to
 * drop tools/consumables — without being rigid (overlap is preserved). The AI
 * never chooses the item; only entries already in the catalog can drop.
 */
@Injectable()
export class LootService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pick a catalog item to drop, or null if the catalog is empty. Read-only — the
   * caller persists the inventory row (and reward-audit log) inside its own
   * transaction so the grant stays idempotent with the rest of resolution.
   */
  async pickDrop(input: DropSelectionInput, client: Client = this.prisma): Promise<ItemDefinition | null> {
    let items = await client.itemDefinition.findMany({ where: { rarity: input.rarity } });
    if (items.length === 0) {
      // Degrade gracefully to common so a thin catalog still drops something.
      items = await client.itemDefinition.findMany({ where: { rarity: 'common' } });
    }
    if (items.length === 0) return null;

    if (input.expeditionType) {
      const slots = items.map((i) => i.slot as ItemSlot);
      const slot = pickSlotForExpedition(input.rng, input.expeditionType, slots);
      if (slot) {
        const ofSlot = items.filter((i) => i.slot === slot);
        if (ofSlot.length > 0) items = ofSlot;
      }
    }

    return items[input.rng.int(0, items.length - 1)];
  }
}
