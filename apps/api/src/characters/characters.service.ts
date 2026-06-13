import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALL_STATS,
  PERSONALITY_STATS,
  STAT_LABEL,
  defaultStatBlock,
  type CharacterView,
  type ContentRating,
  type StatBlock,
  type UpdateCharacterInput,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { computeStamina, regenPerHour } from '../engine/stamina';
import { levelFromXp } from '../engine/leveling';
import { CONSUMABLE, DEATH } from '../engine/rules';

type StatsRow = Record<string, number> & { id: string; characterId: string };

const PERSONALITY_ADJECTIVE: Record<string, string> = {
  weirdness: 'weird',
  bravery: 'brave',
  caution: 'cautious',
  curiosity: 'curious',
  mischief: 'mischievous',
  honor: 'honourable',
};

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a character + stats + arrival memory for a freshly-registered user. */
  async createForUser(userId: string, displayName: string): Promise<string> {
    const regionSets = await this.prisma.regionSet.findMany({ select: { id: true, name: true } });
    if (regionSets.length === 0) {
      throw new BadRequestException('World not seeded — run the seed script');
    }
    // Random region-set assignment (shard-like grouping).
    const region = regionSets[Math.floor(Math.random() * regionSets.length)];

    const character = await this.prisma.character.create({
      data: {
        userId,
        displayName,
        regionSetId: region.id,
        stats: { create: {} },
        memories: {
          create: {
            memoryType: 'world_fact',
            content: `Washed up in ${region.name} with no memory of how, and a strong sense of being unwelcome.`,
            importance: 3,
            regionSetId: region.id,
          },
        },
      },
      select: { id: true },
    });
    return character.id;
  }

  statBlockFromRow(stats: StatsRow): StatBlock {
    const block = defaultStatBlock();
    for (const key of ALL_STATS) block[key] = stats[key] ?? block[key];
    return block;
  }

  /** Short personality descriptor used in AI prompts and profiles. */
  personalitySummary(stats: StatBlock): string {
    const ranked = [...PERSONALITY_STATS]
      .map((s) => ({ s, v: stats[s] }))
      .sort((a, b) => b.v - a.v);
    const notable = ranked.filter((r) => r.v > 5).slice(0, 2);
    if (notable.length === 0) return 'still figuring themselves out';
    return notable.map((r) => PERSONALITY_ADJECTIVE[r.s]).join(' and ');
  }

  /**
   * Build the full client-facing character view. Stamina is recomputed live for
   * display (not persisted here — persistence happens only when stamina is
   * actually consumed, in `consumeStamina`).
   */
  async buildView(characterId: string): Promise<CharacterView> {
    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      include: { stats: true, regionSet: true },
    });
    if (!c || !c.stats) throw new NotFoundException('Character not found');

    const now = Date.now();
    const stamina = computeStamina(c.staminaCurrent, c.staminaMax, c.staminaLastUpdatedAt.getTime(), now);
    const level = levelFromXp(c.xp);
    const payToReviveCost = DEATH.PAY_BASE_COST + c.deathCount * DEATH.PAY_COST_PER_DEATH;
    const reviveInSeconds = c.reviveAvailableAt
      ? Math.max(0, Math.ceil((c.reviveAvailableAt.getTime() - now) / 1000))
      : null;

    return {
      id: c.id,
      displayName: c.displayName,
      bio: c.bio,
      level: level.level,
      xp: c.xp,
      xpForNextLevel: level.xpForNext,
      xpIntoLevel: level.xpIntoLevel,
      currencies: {
        normal: c.normalMoney,
        premium: c.premiumMoney,
        crafting: c.craftingResources,
        reputation: c.reputation,
      },
      stamina: {
        current: stamina.current,
        max: c.staminaMax,
        regenPerHour: regenPerHour(),
        nextPointInSeconds: stamina.nextPointInSeconds,
      },
      stats: this.statBlockFromRow(c.stats as unknown as StatsRow),
      regionSet: { id: c.regionSet.id, name: c.regionSet.name, blurb: c.regionSet.blurb },
      contentRating: c.contentRating as 'family' | 'pg13' | 'r',
      storyStylePreferences: c.storyStylePreferences,
      death: {
        isDead: c.isDead,
        deathReason: c.deathReason,
        reviveAvailableAt: c.reviveAvailableAt ? c.reviveAvailableAt.toISOString() : null,
        reviveInSeconds,
        freeReviveAvailable: c.freeReviveAvailable,
        deathCount: c.deathCount,
        payToReviveCost,
      },
      createdAt: c.createdAt.toISOString(),
    };
  }

  async update(characterId: string, dto: UpdateCharacterInput): Promise<CharacterView> {
    await this.prisma.character.update({
      where: { id: characterId },
      data: {
        bio: dto.bio,
        contentRating: dto.contentRating as ContentRating | undefined,
        storyStylePreferences: dto.storyStylePreferences,
      },
    });
    return this.buildView(characterId);
  }

  async getInventory(characterId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { characterId },
      include: { itemDefinition: true },
      orderBy: { acquiredAt: 'desc' },
    });
    return items.map((i) => ({
      id: i.id,
      name: i.itemDefinition.name,
      description: i.itemDefinition.description,
      slot: i.itemDefinition.slot,
      rarity: i.itemDefinition.rarity,
      quantity: i.quantity,
      equipped: i.equipped,
      statModifiers: (i.itemDefinition.statModifiers ?? {}) as Record<string, number>,
    }));
  }

  /** Base stats plus the sum of equipped items' modifiers — used in checks/combat. */
  async getEffectiveStats(characterId: string): Promise<StatBlock> {
    const c = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: { stats: true, inventory: { where: { equipped: true }, include: { itemDefinition: true } } },
    });
    const block = this.statBlockFromRow(c.stats as unknown as StatsRow);
    for (const inv of c.inventory) {
      const mods = (inv.itemDefinition.statModifiers ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(mods)) {
        if (k in block) block[k as keyof StatBlock] += v;
      }
    }
    return block;
  }

  /** Equip an item, unequipping anything else already in that slot. */
  async equip(characterId: string, inventoryItemId: string): Promise<CharacterView> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { itemDefinition: true },
    });
    if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');
    if (item.itemDefinition.slot === 'consumable') throw new BadRequestException('Consumables are used, not equipped');

    await this.prisma.$transaction(async (tx) => {
      const sameSlot = await tx.inventoryItem.findMany({
        where: { characterId, equipped: true, itemDefinition: { slot: item.itemDefinition.slot } },
        select: { id: true },
      });
      for (const s of sameSlot) {
        await tx.inventoryItem.update({ where: { id: s.id }, data: { equipped: false } });
      }
      await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { equipped: true } });
    });
    return this.buildView(characterId);
  }

  async unequip(characterId: string, inventoryItemId: string): Promise<CharacterView> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');
    await this.prisma.inventoryItem.update({ where: { id: inventoryItemId }, data: { equipped: false } });
    return this.buildView(characterId);
  }

  /** Use a consumable: restore stamina and decrement (or remove) the stack. */
  async useConsumable(characterId: string, inventoryItemId: string): Promise<CharacterView> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { itemDefinition: true },
    });
    if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');
    if (item.itemDefinition.slot !== 'consumable') throw new BadRequestException('That item is not consumable');

    await this.prisma.$transaction(async (tx) => {
      const c = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
        select: { staminaCurrent: true, staminaMax: true, staminaLastUpdatedAt: true },
      });
      const s = computeStamina(c.staminaCurrent, c.staminaMax, c.staminaLastUpdatedAt.getTime(), Date.now());
      const restored = Math.min(c.staminaMax, s.current + CONSUMABLE.STAMINA_RESTORE);
      await tx.character.update({
        where: { id: characterId },
        data: { staminaCurrent: restored, staminaLastUpdatedAt: new Date(s.lastUpdatedAtMs) },
      });
      if (item.quantity > 1) {
        await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantity: { decrement: 1 } } });
      } else {
        await tx.inventoryItem.delete({ where: { id: inventoryItemId } });
      }
    });
    return this.buildView(characterId);
  }

  /**
   * Atomically regenerate then spend stamina inside an existing transaction.
   * Throws 400 if the player can't afford the cost. Persists the regen anchor so
   * partial progress is never lost.
   */
  async consumeStamina(tx: Prisma.TransactionClient, characterId: string, amount: number): Promise<void> {
    const c = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { staminaCurrent: true, staminaMax: true, staminaLastUpdatedAt: true },
    });
    const s = computeStamina(c.staminaCurrent, c.staminaMax, c.staminaLastUpdatedAt.getTime(), Date.now());
    if (s.current < amount) {
      throw new BadRequestException('Not enough stamina');
    }
    await tx.character.update({
      where: { id: characterId },
      data: {
        staminaCurrent: s.current - amount,
        staminaLastUpdatedAt: new Date(s.lastUpdatedAtMs),
      },
    });
  }

  /** Live stamina value without persisting (for affordability pre-checks). */
  async currentStamina(characterId: string): Promise<number> {
    const c = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { staminaCurrent: true, staminaMax: true, staminaLastUpdatedAt: true },
    });
    return computeStamina(c.staminaCurrent, c.staminaMax, c.staminaLastUpdatedAt.getTime(), Date.now()).current;
  }

  statLabel(stat: string): string {
    return STAT_LABEL[stat as keyof typeof STAT_LABEL] ?? stat;
  }
}
