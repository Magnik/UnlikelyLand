import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MemorySuggestion, NpcSuggestion } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { MEMORY } from '../engine/rules';

/**
 * Hidden, server-side Story Memory. Players never read or edit it directly; it
 * feeds future AI prompting and is visible only to admins for debugging. We keep
 * the most important + most recent facts and surface a compact slice for prompts.
 */
@Injectable()
export class StoryMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record the player's decision as a memory (inside the resolve transaction). */
  async recordDecision(
    tx: Prisma.TransactionClient,
    characterId: string,
    content: string,
    regionSetId: string,
  ): Promise<void> {
    await tx.storyMemory.create({
      data: { characterId, memoryType: 'decision', content, importance: 2, regionSetId },
    });
  }

  /** Persist AI/fallback memory suggestions (already validated + moderated). */
  async recordSuggestions(
    tx: Prisma.TransactionClient,
    characterId: string,
    suggestions: MemorySuggestion[],
    regionSetId: string,
  ): Promise<void> {
    if (!suggestions.length) return;
    await tx.storyMemory.createMany({
      data: suggestions.map((m) => ({
        characterId,
        memoryType: m.memoryType,
        content: m.content,
        importance: m.importance ?? 1,
        regionSetId,
      })),
    });
  }

  /** Upsert lightweight NPC records from suggestions (private by default). */
  async upsertNpcs(
    tx: Prisma.TransactionClient,
    characterId: string,
    npcs: NpcSuggestion[],
    regionSetId: string,
  ): Promise<void> {
    for (const npc of npcs) {
      const existing = await tx.npcRecord.findFirst({
        where: { characterId, name: npc.name },
        select: { id: true, referenceCount: true },
      });
      if (existing) {
        await tx.npcRecord.update({
          where: { id: existing.id },
          data: { referenceCount: { increment: 1 } },
        });
      } else {
        await tx.npcRecord.create({
          data: {
            characterId,
            name: npc.name,
            description: npc.description,
            role: npc.role,
            status: npc.privateOrSharedPotential === 'shared_candidate' ? 'shared_candidate' : 'private',
            regionSetId,
          },
        });
      }
    }
  }

  /** Compact memory slice for the AI prompt: highest-importance, most recent. */
  async recentForPrompt(characterId: string, limit = 6): Promise<string[]> {
    const memories = await this.prisma.storyMemory.findMany({
      where: { characterId },
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: { content: true },
    });
    return memories.map((m) => m.content);
  }

  /**
   * Keep Story Memory bounded: once non-summary memories exceed a threshold,
   * fold the oldest low-importance ones into a single compressed summary.
   */
  async compactIfNeeded(characterId: string): Promise<void> {
    const total = await this.prisma.storyMemory.count({
      where: { characterId, memoryType: { not: 'summary' } },
    });
    if (total <= MEMORY.MAX_BEFORE_COMPACT) return;

    const oldest = await this.prisma.storyMemory.findMany({
      where: { characterId, memoryType: { not: 'summary' } },
      orderBy: [{ importance: 'asc' }, { createdAt: 'asc' }],
      take: MEMORY.COMPACT_BATCH,
      select: { id: true, regionSetId: true },
    });
    if (oldest.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.storyMemory.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
      await tx.storyMemory.create({
        data: {
          characterId,
          memoryType: 'summary',
          content: `Earlier adventures, condensed: ${oldest.length} smaller moments now blur into a general sense of having Been Through Things.`,
          importance: 2,
          regionSetId: oldest[0].regionSetId ?? undefined,
        },
      });
    });
  }
}
