import { Injectable } from '@nestjs/common';
import {
  categoryForStat,
  type EncounterView,
  type Encounter,
  type ChoiceView,
} from '@unlikelyland/contracts';
import { PrismaService } from '../common/prisma.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { StoryMemoryService } from '../story-memory/story-memory.service';
import { CharactersService } from '../characters/characters.service';
import { EXPEDITIONS } from '../engine/rules';
import type { ExpeditionType } from '@unlikelyland/contracts';

interface EncounterRow {
  id: string;
  source: string;
  resolved: boolean;
  payload: unknown;
}

/**
 * Owns encounter generation (via the AI gateway) and the row→view mapping. The
 * persisted `payload` is the validated encounter.v1 object; the view derives
 * display-only fields (stat category + label) and hides nothing the player
 * shouldn't see (reward numbers are never in the payload).
 */
@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService,
    private readonly memory: StoryMemoryService,
    private readonly characters: CharactersService,
  ) {}

  /**
   * Generate the encounter for a given step of an expedition and persist it.
   * Stamina must already have been charged by the caller.
   */
  async generateForStep(characterId: string, expeditionId: string, stepIndex: number): Promise<EncounterView> {
    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: { stats: true, regionSet: true },
    });
    const expedition = await this.prisma.expedition.findUniqueOrThrow({ where: { id: expeditionId } });
    const cfg = EXPEDITIONS[expedition.type as ExpeditionType];
    const stats = this.characters.statBlockFromRow(character.stats as never);
    const memories = await this.memory.recentForPrompt(characterId);

    const { encounter, source } = await this.ai.generateEncounter({
      characterId,
      regionSetName: character.regionSet.name,
      regionSetBlurb: character.regionSet.blurb,
      expeditionType: expedition.type as ExpeditionType,
      desiredEncounterType: cfg.encounterType,
      fallbackPool: cfg.fallbackPool,
      contentRating: character.contentRating as 'family' | 'pg13' | 'r',
      personalitySummary: this.characters.personalitySummary(stats),
      recentMemories: memories,
      step: stepIndex,
      maxSteps: expedition.maxSteps,
      seedParts: [characterId, expeditionId, stepIndex],
    });

    const row = await this.prisma.encounter.create({
      data: {
        characterId,
        expeditionId,
        regionSetId: character.regionSetId,
        source,
        encounterType: encounter.encounterType,
        payload: encounter as unknown as object,
      },
      select: { id: true, source: true, resolved: true, payload: true },
    });

    return this.toView(row);
  }

  /** The current unresolved encounter for a character, if any. */
  async currentEncounterView(characterId: string): Promise<EncounterView | null> {
    const row = await this.prisma.encounter.findFirst({
      where: { characterId, resolved: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, source: true, resolved: true, payload: true },
    });
    return row ? this.toView(row) : null;
  }

  toView(row: EncounterRow): EncounterView {
    const enc = row.payload as Encounter;
    const choices: ChoiceView[] = enc.choices.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      statCategory: c.statCategory ?? categoryForStat(c.statFocus),
      statFocus: c.statFocus,
      statFocusLabel: this.characters.statLabel(c.statFocus),
      riskLevel: c.riskLevel,
      rewardProfile: c.rewardProfile,
      mayStartCombat: c.mayStartCombat,
      isHiddenConsequence: c.isHiddenConsequence,
      visibleHint: c.visibleHint ?? null,
    }));

    return {
      id: row.id,
      title: enc.title,
      description: enc.description,
      encounterType: enc.encounterType,
      allowGoHome: enc.allowGoHome,
      goHomeLabel: enc.goHomeLabel ?? null,
      source: row.source as 'ai' | 'fallback',
      resolved: row.resolved,
      choices,
    };
  }
}
