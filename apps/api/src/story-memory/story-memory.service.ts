import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MemorySuggestion, NpcSuggestion } from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';

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
}
