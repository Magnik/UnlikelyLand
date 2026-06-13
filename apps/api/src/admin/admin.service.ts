import { Injectable, NotFoundException } from '@nestjs/common';
import type { AiSettingsUpdateInput } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { RARITIES } from '@unlikelyland/contracts';

/** Power budget granted to an auto-created item, by rarity tier. */
const POWER_BY_RARITY: Record<string, number> = {
  common: 3,
  uncommon: 6,
  rare: 12,
  epic: 20,
  legendary: 32,
  absurd: 50,
};

/** Rarities safe to auto-approve without human review. */
const AUTO_APPROVE_RARITIES = new Set(['common', 'uncommon']);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
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

  itemConcepts(status?: string) {
    return this.prisma.pendingItemConcept.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Approve a pending concept and mint an ItemDefinition with a capped power budget. */
  async approveConcept(id: string) {
    const concept = await this.prisma.pendingItemConcept.findUnique({ where: { id } });
    if (!concept) throw new NotFoundException('Concept not found');

    const rarity = RARITIES.includes(concept.intendedRarity as never) ? concept.intendedRarity : 'common';
    const item = await this.prisma.itemDefinition.create({
      data: {
        key: `ai-${concept.id.slice(0, 8)}`,
        name: concept.name,
        description: concept.description,
        slot: concept.intendedSlot,
        rarity,
        powerBudget: POWER_BY_RARITY[rarity] ?? 3,
        source: 'ai_approved',
      },
    });
    await this.prisma.pendingItemConcept.update({
      where: { id },
      data: {
        status: AUTO_APPROVE_RARITIES.has(rarity) ? 'auto_approved' : 'approved',
        createdItemId: item.id,
      },
    });
    return item;
  }

  async rejectConcept(id: string, notes?: string) {
    const concept = await this.prisma.pendingItemConcept.findUnique({ where: { id } });
    if (!concept) throw new NotFoundException('Concept not found');
    return this.prisma.pendingItemConcept.update({
      where: { id },
      data: { status: 'rejected', reviewNotes: notes },
    });
  }
}
