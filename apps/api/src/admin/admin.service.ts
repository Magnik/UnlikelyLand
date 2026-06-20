import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ItemDefinition, PendingItemConcept, Prisma } from '@prisma/client';
import {
  NpcStatusSchema,
  type AdminInventoryView,
  type AiSettingsUpdateInput,
  type ApproveConceptInput,
  type ConsumableEffectType,
  type ItemConceptView,
  type ItemDefinitionView,
  type ItemSlot,
  type Rarity,
  type StatModifier,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { validateItemConcept } from '../ai/item-validator';
import { CharactersService } from '../characters/characters.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
    private readonly characters: CharactersService,
  ) {}

  aiSettings() {
    return this.ai.getSettingsView();
  }

  updateAiSettings(dto: AiSettingsUpdateInput) {
    return this.ai.updateSettings(dto);
  }

  aiLogs(limit = 50) {
    return this.prisma.aiGenerationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async players() {
    const characters = await this.prisma.character.findMany({
      include: { user: { select: { username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return characters.map((c) => ({
      id: c.id,
      username: c.user.username,
      role: c.user.role,
      displayName: c.displayName,
      level: c.level,
      xp: c.xp,
      normalMoney: c.normalMoney,
      reputation: c.reputation,
      isDead: c.isDead,
      deathCount: c.deathCount,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async playerStoryMemory(characterId: string) {
    const memories = await this.prisma.storyMemory.findMany({
      where: { characterId },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    if (memories.length === 0) {
      // Distinguish "no memories" from "no such character".
      const exists = await this.prisma.character.findUnique({ where: { id: characterId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Character not found');
    }
    return memories;
  }

  /** A character's inventory + effective stats, for debugging. */
  async characterInventory(characterId: string): Promise<AdminInventoryView> {
    const c = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, displayName: true },
    });
    if (!c) throw new NotFoundException('Character not found');
    const [items, stats] = await Promise.all([
      this.characters.getInventory(characterId),
      this.characters.getEffectiveStatsView(characterId),
    ]);
    return { characterId: c.id, displayName: c.displayName, items, stats };
  }

  economy(limit = 100) {
    return this.prisma.economyTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  chat(limit = 100) {
    return this.prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  // ── Item catalog ───────────────────────────────────────────────────────────

  async itemsCatalog(limit = 200): Promise<ItemDefinitionView[]> {
    const items = await this.prisma.itemDefinition.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return items.map((i) => this.toItemDefinitionView(i));
  }

  // ── Item-concept review ──────────────────────────────────────────────────────

  /**
   * List item concepts (optionally filtered by status), each annotated with a
   * freshly-computed validation verdict so the admin sees the current rule status,
   * the server-generated stat block that *would* be minted, and any issues.
   */
  async itemConcepts(status?: string): Promise<ItemConceptView[]> {
    const concepts = await this.prisma.pendingItemConcept.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return concepts.map((c) => this.toItemConceptView(c));
  }

  /**
   * Approve a concept (optionally editing fields first). The server re-validates
   * and re-derives the stat block; a concept that fails moderation/validation
   * cannot be approved (the admin must edit it or reject it). Minting the item and
   * updating the concept happen atomically; re-approving an already-minted concept
   * is rejected.
   */
  async approveConcept(id: string, edits: ApproveConceptInput = {}): Promise<ItemDefinition> {
    const concept = await this.prisma.pendingItemConcept.findUnique({ where: { id } });
    if (!concept) throw new NotFoundException('Concept not found');
    if (concept.createdItemId) throw new BadRequestException('Concept already minted into an item');

    const merged = {
      name: edits.name ?? concept.name,
      description: edits.description ?? concept.description,
      narrativePurpose: concept.narrativePurpose,
      intendedSlot: edits.slot ?? concept.intendedSlot,
      intendedRarity: edits.rarity ?? concept.intendedRarity,
    };
    const v = validateItemConcept(merged);
    if (!v.valid) {
      throw new BadRequestException(`Cannot approve — fails validation: ${v.issues.join('; ')}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemDefinition.create({
        data: {
          key: `ai-${concept.id.slice(0, 12)}`,
          name: v.normalized.name,
          description: v.normalized.description,
          slot: v.normalized.slot,
          rarity: v.normalized.rarity,
          statModifiers: v.normalized.statModifiers as Prisma.InputJsonValue,
          powerBudget: v.normalized.powerBudget,
          consumableEffectType: v.normalized.consumableEffectType,
          consumableEffectPower: v.normalized.consumableEffectPower,
          source: 'ai_approved',
        },
      });
      await tx.pendingItemConcept.update({
        where: { id },
        data: {
          status: v.autoApprovable ? 'auto_approved' : 'approved',
          createdItemId: item.id,
          name: merged.name,
          description: merged.description,
          intendedSlot: merged.intendedSlot,
          intendedRarity: merged.intendedRarity,
          proposedStatModifiers: v.normalized.statModifiers as Prisma.InputJsonValue,
          proposedPowerBudget: v.normalized.powerBudget,
          autoApprovable: v.autoApprovable,
          validationIssues: JSON.stringify(v.issues),
        },
      });
      return item;
    });
  }

  async rejectConcept(id: string, notes?: string) {
    const concept = await this.prisma.pendingItemConcept.findUnique({ where: { id } });
    if (!concept) throw new NotFoundException('Concept not found');
    return this.prisma.pendingItemConcept.update({
      where: { id },
      data: { status: 'rejected', reviewNotes: notes?.slice(0, 500) },
    });
  }

  npcs(status?: string) {
    return this.prisma.npcRecord.findMany({
      where: status ? { status } : undefined,
      orderBy: { referenceCount: 'desc' },
      take: 200,
    });
  }

  /** Promote (or demote) an NPC's shared-world status: private → shared_candidate → shared → global. */
  async promoteNpc(id: string, status: string) {
    const npc = await this.prisma.npcRecord.findUnique({ where: { id } });
    if (!npc) throw new NotFoundException('NPC not found');
    const parsed = NpcStatusSchema.catch('shared_candidate').parse(status);
    return this.prisma.npcRecord.update({ where: { id }, data: { status: parsed } });
  }

  // ── Mappers ──────────────────────────────────────────────────────────────────

  private toItemDefinitionView(i: ItemDefinition): ItemDefinitionView {
    return {
      id: i.id,
      key: i.key,
      name: i.name,
      description: i.description,
      slot: i.slot as ItemSlot,
      rarity: i.rarity as Rarity,
      statModifiers: (i.statModifiers ?? {}) as StatModifier,
      powerBudget: i.powerBudget,
      source: i.source,
      consumableEffect:
        i.slot === 'consumable'
          ? {
              type: i.consumableEffectType as ConsumableEffectType,
              power: i.consumableEffectPower,
              label:
                i.consumableEffectType === 'stamina'
                  ? `Restores ${i.consumableEffectPower} stamina`
                  : 'No mechanical effect',
            }
          : null,
      createdAt: i.createdAt.toISOString(),
    };
  }

  private toItemConceptView(c: PendingItemConcept): ItemConceptView {
    const v = validateItemConcept({
      name: c.name,
      description: c.description,
      narrativePurpose: c.narrativePurpose,
      intendedSlot: c.intendedSlot,
      intendedRarity: c.intendedRarity,
    });
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      narrativePurpose: c.narrativePurpose,
      intendedSlot: c.intendedSlot as ItemSlot,
      intendedRarity: c.intendedRarity as Rarity,
      status: c.status as ItemConceptView['status'],
      reviewNotes: c.reviewNotes,
      createdItemId: c.createdItemId,
      proposedByCharacterId: c.proposedByCharacterId,
      createdAt: c.createdAt.toISOString(),
      validation: {
        valid: v.valid,
        autoApprovable: v.autoApprovable,
        powerBudget: v.normalized.powerBudget,
        statModifiers: v.normalized.statModifiers as StatModifier,
        issues: v.issues,
      },
    };
  }
}
