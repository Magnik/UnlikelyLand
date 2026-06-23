import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALL_STATS,
  COMBAT_STATS,
  SOCIAL_STATS,
  PERSONALITY_STATS,
  STAT_LABEL,
  SLOT_POSITIONS,
  StoryStyleTagSchema,
  categoryForStat,
  defaultStatBlock,
  type ActivityEventView,
  type ActivityType,
  type CharacterView,
  type ConsumableEffectView,
  type ContentRating,
  type EffectiveStatsView,
  type EquipmentSlot,
  type GuildRole,
  type InventoryItemView,
  type InventoryView,
  type ItemSlot,
  type PublicProfileView,
  type StatBlock,
  type StatKey,
  type StatModifier,
  type StoryStyleTag,
  type UpdateCharacterInput,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { RelationshipService } from '../common/relationship.service';
import { moderateText } from '../ai/moderation';
import { combineEffectiveStats } from '../engine/effective-stats';
import { computeStamina, regenPerHour } from '../engine/stamina';
import { levelFromXp } from '../engine/leveling';
import { CONSUMABLE, DEATH } from '../engine/rules';

/** Items granted to a new or freshly-wiped character (see gear migration 0009). */
const STARTER_KIT_ITEM_KEYS = ['rusty-island-sword', 'cardboard-aegis'];

/**
 * Pure target-position chooser for equip(). Returns which paperdoll position to
 * equip the item into, or null when it is ALREADY equipped in one of its eligible
 * positions (a no-op — so re-tapping an equipped ring never evicts its sibling).
 * Otherwise prefers an explicit valid position, then the first empty eligible
 * position, then replaces the first.
 */
export function chooseEquipPosition(
  positions: EquipmentSlot[],
  occupied: { id: string; equippedSlot: string | null }[],
  itemId: string,
  explicit?: EquipmentSlot,
): EquipmentSlot | null {
  if (occupied.some((o) => o.id === itemId)) return null;
  if (explicit && positions.includes(explicit)) return explicit;
  const used = new Set(occupied.map((o) => o.equippedSlot));
  return positions.find((p) => !used.has(p)) ?? positions[0];
}

/** Parse the JSON-encoded storyStyleTags column into a validated, deduped list. */
function parseStoryStyleTags(raw: string): StoryStyleTag[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((t): t is StoryStyleTag => StoryStyleTagSchema.safeParse(t).success);
    return Array.from(new Set(valid)).slice(0, 10);
  } catch {
    return [];
  }
}

/** Build the consumable-effect view for an item, or null for non-consumables. */
function consumableEffectViewFor(slot: string, type: string, power: number): ConsumableEffectView | null {
  if (slot !== 'consumable') return null;
  if (type === 'stamina') return { type: 'stamina', power, label: `Restores ${power} stamina` };
  return { type: 'none', power: 0, label: 'No mechanical effect — purely flavour' };
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipService,
  ) {}

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
    await this.grantStarterKit(character.id);
    return character.id;
  }

  /**
   * Hand a fresh (or freshly-wiped) character a tiny starter kit so the bag isn't
   * empty and equipping is immediately discoverable. Best-effort: silently does
   * nothing if the catalog hasn't been seeded yet.
   */
  async grantStarterKit(characterId: string): Promise<void> {
    const defs = await this.prisma.itemDefinition.findMany({
      where: { key: { in: STARTER_KIT_ITEM_KEYS } },
      select: { id: true },
    });
    if (defs.length === 0) return;
    await this.prisma.inventoryItem.createMany({
      data: defs.map((d) => ({ characterId, itemDefinitionId: d.id, quantity: 1 })),
    });
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
      title: c.title,
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
      storyStyleTags: parseStoryStyleTags(c.storyStyleTags),
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

  /**
   * Update editable profile/settings fields. The bio is moderated server-side
   * (PG-13 floor, since profiles are publicly visible) before persisting, and the
   * structured story-style tags are validated and stored as JSON. All validation
   * is server-side; the client cannot bypass it.
   */
  async update(characterId: string, dto: UpdateCharacterInput): Promise<CharacterView> {
    const data: Prisma.CharacterUpdateInput = {};

    if (dto.bio !== undefined) {
      const moderation = moderateText(dto.bio, 'pg13');
      if (!moderation.safe) {
        throw new BadRequestException(`Bio rejected by moderation (${moderation.reason ?? 'unsafe'})`);
      }
      data.bio = dto.bio;
    }
    if (dto.contentRating !== undefined) data.contentRating = dto.contentRating as ContentRating;
    if (dto.storyStyleTags !== undefined) {
      const tags = Array.from(new Set(dto.storyStyleTags)).slice(0, 10);
      data.storyStyleTags = JSON.stringify(tags);
    }
    if (dto.title !== undefined) {
      data.title = await this.resolveTitle(characterId, dto.title);
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.character.update({ where: { id: characterId }, data });
    }
    return this.buildView(characterId);
  }

  /** The character's structured story-style preferences (used by AI + fallback). */
  async getStoryStyleTags(characterId: string): Promise<StoryStyleTag[]> {
    const c = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { storyStyleTags: true },
    });
    return parseStoryStyleTags(c.storyStyleTags);
  }

  async getInventory(characterId: string): Promise<InventoryItemView[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { characterId },
      include: { itemDefinition: true },
      orderBy: { acquiredAt: 'desc' },
    });
    return items.map((i) => this.toInventoryItemView(i, i.itemDefinition));
  }

  private toInventoryItemView(
    row: { id: string; quantity: number; equipped: boolean; equippedSlot?: string | null },
    def: {
      key: string;
      name: string;
      description: string;
      slot: string;
      rarity: string;
      statModifiers: Prisma.JsonValue;
      consumableEffectType: string;
      consumableEffectPower: number;
    },
  ): InventoryItemView {
    return {
      id: row.id,
      itemKey: def.key,
      name: def.name,
      description: def.description,
      slot: def.slot as ItemSlot,
      rarity: def.rarity as InventoryItemView['rarity'],
      quantity: row.quantity,
      equipped: row.equipped,
      equippedSlot: (row.equippedSlot ?? null) as EquipmentSlot | null,
      statModifiers: (def.statModifiers ?? {}) as StatModifier,
      consumableEffect: consumableEffectViewFor(def.slot, def.consumableEffectType, def.consumableEffectPower),
    };
  }

  /** Base stats plus the sum of equipped items' modifiers — used in checks/combat. */
  async getEffectiveStats(characterId: string): Promise<StatBlock> {
    return (await this.getEffectiveStatsView(characterId)).effective;
  }

  /**
   * The ONE reusable effective-stat calculation: base stats plus the sum of
   * equipped items' modifiers, with a per-stat breakdown for the UI. Combat and
   * encounter resolution call getEffectiveStats (which delegates here), so play
   * and display can never diverge.
   */
  async getEffectiveStatsView(characterId: string): Promise<EffectiveStatsView> {
    const c = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: { stats: true, inventory: { where: { equipped: true }, include: { itemDefinition: true } } },
    });
    const base = this.statBlockFromRow(c.stats as unknown as StatsRow);
    const { effective, modTotals } = combineEffectiveStats(
      base,
      c.inventory.map((inv) => (inv.itemDefinition.statModifiers ?? {}) as Record<string, number>),
    );
    const entries = ALL_STATS.map((stat) => ({
      stat,
      label: STAT_LABEL[stat],
      category: categoryForStat(stat),
      base: base[stat],
      modifier: modTotals[stat] ?? 0,
      effective: effective[stat],
    }));
    return { base, effective, entries };
  }

  /** Full inventory screen: items + which item is equipped per slot + effective stats. */
  async getInventoryView(characterId: string): Promise<InventoryView> {
    const items = await this.getInventory(characterId);
    const stats = await this.getEffectiveStatsView(characterId);
    const equippedBySlot: Partial<Record<EquipmentSlot, string>> = {};
    for (const it of items) {
      if (it.equipped && it.equippedSlot) equippedBySlot[it.equippedSlot] = it.id;
    }
    return { items, equippedBySlot, stats };
  }

  /**
   * Validate a requested title: it must be a PUBLIC achievement the character has
   * actually unlocked. Returns the achievement's display name to store (or null to
   * clear). Throws if the key is unknown or not unlocked — the client is never
   * trusted to assert which titles it has earned.
   */
  private async resolveTitle(characterId: string, titleKey: string | null): Promise<string | null> {
    if (titleKey === null) return null;
    const ach = await this.prisma.achievement.findUnique({
      where: { key: titleKey },
      select: { id: true, name: true, isPublic: true },
    });
    if (!ach || !ach.isPublic) throw new BadRequestException('Unknown title');
    const owned = await this.prisma.characterAchievement.findUnique({
      where: { characterId_achievementId: { characterId, achievementId: ach.id } },
      select: { id: true },
    });
    if (!owned) throw new BadRequestException('You have not unlocked that title');
    return ach.name;
  }

  /**
   * Public-only projection of a character. Deliberately omits Story Memory,
   * private expedition details, AI events, messages, exact economy history, and
   * hidden personality values. Used for viewing other players' profiles.
   *
   * Blocking is enforced: if the viewer and target are in a block relationship
   * (either direction) the profile is reported as not-found, so a blocked party
   * cannot see the blocker (and existence is not confirmed).
   */
  async getPublicProfile(viewerCharacterId: string, characterId: string): Promise<PublicProfileView> {
    if (
      viewerCharacterId !== characterId &&
      (await this.relationships.isBlockedEitherWay(viewerCharacterId, characterId))
    ) {
      throw new NotFoundException('Character not found');
    }

    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      include: {
        stats: true,
        regionSet: { select: { id: true, name: true } },
        guildMembership: { include: { guild: { select: { id: true, name: true, tag: true } } } },
        achievements: { include: { achievement: true } },
        escapes: { select: { id: true } },
        inventory: { where: { equipped: true }, include: { itemDefinition: true } },
      },
    });
    if (!c || !c.stats) throw new NotFoundException('Character not found');

    const stats = this.statBlockFromRow(c.stats as unknown as StatsRow);
    const combat = COMBAT_STATS.reduce((sum, s) => sum + stats[s], 0);
    const social = SOCIAL_STATS.reduce((sum, s) => sum + stats[s], 0);
    const topPersonality = [...PERSONALITY_STATS]
      .map((s) => ({ s, v: stats[s] }))
      .sort((a, b) => b.v - a.v)
      .find((r) => r.v > 5);

    const achievements = c.achievements
      .filter((a) => a.achievement.isPublic)
      .map((a) => ({
        key: a.achievement.key,
        name: a.achievement.name,
        description: a.achievement.description,
        unlockedAt: a.unlockedAt.toISOString(),
      }));

    const equipment = c.inventory
      .filter((inv) => inv.itemDefinition.slot !== 'consumable')
      .map((inv) => ({
        slot: inv.itemDefinition.slot as ItemSlot,
        name: inv.itemDefinition.name,
        rarity: inv.itemDefinition.rarity as PublicProfileView['equipment'][number]['rarity'],
      }));

    const activityRows = await this.prisma.activityEvent.findMany({
      where: { characterId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    const recentActivity: ActivityEventView[] = activityRows.map((a) => ({
      id: a.id,
      type: a.type as ActivityType,
      characterId,
      displayName: c.displayName,
      title: a.title,
      detail: a.detail,
      createdAt: a.createdAt.toISOString(),
    }));

    const relationship = await this.relationships.relationshipStatus(viewerCharacterId, characterId);

    return {
      characterId: c.id,
      displayName: c.displayName,
      title: c.title,
      bio: c.bio,
      level: levelFromXp(c.xp).level,
      regionSet: { id: c.regionSet.id, name: c.regionSet.name },
      guild: c.guildMembership?.guild
        ? {
            id: c.guildMembership.guild.id,
            name: c.guildMembership.guild.name,
            tag: c.guildMembership.guild.tag,
            role: c.guildMembership.role as GuildRole,
          }
        : null,
      achievements,
      statSummary: { combat, social, topTrait: topPersonality ? STAT_LABEL[topPersonality.s] : null },
      equipment,
      combatVictories: c.combatVictories,
      escapeCount: c.escapes.length,
      joinedAt: c.createdAt.toISOString(),
      recentActivity,
      relationship,
    };
  }

  /**
   * Equip an item into a paperdoll POSITION, unequipping whatever was there. An
   * item's slot maps to one or more positions (rings/trinkets have two); without an
   * explicit target we fill the first empty eligible position, else replace the first.
   */
  async equip(characterId: string, inventoryItemId: string, position?: EquipmentSlot): Promise<CharacterView> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { itemDefinition: true },
    });
    if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');

    const positions = SLOT_POSITIONS[item.itemDefinition.slot as ItemSlot] ?? [];
    if (positions.length === 0) throw new BadRequestException('That item cannot be equipped');

    await this.prisma.$transaction(async (tx) => {
      // Current occupants of this item's eligible positions.
      const occupied = await tx.inventoryItem.findMany({
        where: { characterId, equipped: true, equippedSlot: { in: positions } },
        select: { id: true, equippedSlot: true },
      });
      // Choose the target position (null = already equipped here, so do nothing).
      // NOTE: this read-then-write isn't a conditional claim, so two truly-concurrent
      // equips into the same group could drop one (a benign, recoverable lost-equip).
      // Acceptable: equip is a single-user action and the UI disables buttons in flight.
      const target = chooseEquipPosition(positions, occupied, inventoryItemId, position);
      if (target === null) return;

      // Vacate the target position (one item per position).
      await tx.inventoryItem.updateMany({
        where: { characterId, equipped: true, equippedSlot: target },
        data: { equipped: false, equippedSlot: null },
      });
      // Equip this item there. Conditional on ownership so a concurrently sold/listed
      // item fails cleanly instead of throwing a raw P2025.
      const equipped = await tx.inventoryItem.updateMany({
        where: { id: inventoryItemId, characterId },
        data: { equipped: true, equippedSlot: target },
      });
      if (equipped.count === 0) throw new NotFoundException('Item not found');
    });
    return this.buildView(characterId);
  }

  async unequip(characterId: string, inventoryItemId: string): Promise<CharacterView> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item || item.characterId !== characterId) throw new NotFoundException('Item not found');
    // updateMany (not update-by-id) so a concurrent delete is a harmless no-op, not a P2025.
    await this.prisma.inventoryItem.updateMany({
      where: { id: inventoryItemId, characterId },
      data: { equipped: false, equippedSlot: null },
    });
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

    // The effect comes from the item definition (server-assigned). A flavour-only
    // consumable (effect 'none') still gets consumed but does nothing mechanical.
    const effectPower =
      item.itemDefinition.consumableEffectType === 'stamina'
        ? item.itemDefinition.consumableEffectPower || CONSUMABLE.STAMINA_RESTORE
        : 0;

    await this.prisma.$transaction(async (tx) => {
      // Claim one unit FIRST with a conditional decrement, so a concurrent double-use
      // (or a use racing a sell/list) can't restore stamina twice from one stack.
      const claim = await tx.inventoryItem.updateMany({
        where: { id: inventoryItemId, characterId, quantity: { gte: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (claim.count === 0) throw new NotFoundException('Item not found');
      // Drop the row once the stack hits zero.
      await tx.inventoryItem.deleteMany({ where: { id: inventoryItemId, quantity: { lte: 0 } } });

      const c = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
        select: { staminaCurrent: true, staminaMax: true, staminaLastUpdatedAt: true },
      });
      const s = computeStamina(c.staminaCurrent, c.staminaMax, c.staminaLastUpdatedAt.getTime(), Date.now());
      const restored = Math.min(c.staminaMax, s.current + effectPower);
      await tx.character.update({
        where: { id: characterId },
        data: { staminaCurrent: restored, staminaLastUpdatedAt: new Date(s.lastUpdatedAtMs) },
      });
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
