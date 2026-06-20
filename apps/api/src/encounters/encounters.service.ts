import { Injectable } from '@nestjs/common';
import {
  categoryForStat,
  type EncounterView,
  type Encounter,
  type ChoiceView,
  type ItemConceptSuggestion,
} from '@unlikelyland/contracts';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { validateItemConcept } from '../ai/item-validator';
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
    const storyStyleTags = await this.characters.getStoryStyleTags(characterId);
    const memories = await this.memory.recentForPrompt(characterId);
    const regions = await this.prisma.region.findMany({
      where: { regionSetId: character.regionSetId },
      select: { name: true },
    });
    const regionName = regions.length ? regions[stepIndex % regions.length].name : '';

    const { encounter, source } = await this.ai.generateEncounter({
      characterId,
      regionSetName: character.regionSet.name,
      regionSetBlurb: regionName
        ? `${character.regionSet.blurb} You're somewhere around ${regionName}.`
        : character.regionSet.blurb,
      expeditionType: expedition.type as ExpeditionType,
      desiredEncounterType: cfg.encounterType,
      fallbackPool: cfg.fallbackPool,
      contentRating: character.contentRating as 'family' | 'pg13' | 'r',
      personalitySummary: this.characters.personalitySummary(stats),
      recentMemories: memories,
      storyStyleTags,
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

    await this.ingestItemConcepts(characterId, encounter.itemConceptSuggestions);
    return this.toView(row);
  }

  /**
   * Persist AI item-concept proposals through the central validator. The AI never
   * supplies stat numbers and its text is moderated at the family floor; the
   * server derives a balanced, budget-capped stat block. A concept is only
   * auto-approved (minted into the global catalog) when it is a low-power
   * common/uncommon that passes every validation rule — everything else is left
   * `pending` for admin review. Concept + item creation run in one transaction so
   * a half-approved concept can never exist.
   */
  private async ingestItemConcepts(characterId: string, suggestions: ItemConceptSuggestion[]): Promise<void> {
    for (const s of suggestions.slice(0, 2)) {
      try {
        const v = validateItemConcept({
          name: s.name,
          description: s.description,
          narrativePurpose: s.narrativePurpose,
          intendedSlot: s.intendedSlot,
          intendedRarity: s.intendedRarity,
        });

        await this.prisma.$transaction(async (tx) => {
          const concept = await tx.pendingItemConcept.create({
            data: {
              proposedByCharacterId: characterId,
              name: s.name,
              description: s.description,
              intendedRarity: s.intendedRarity,
              intendedSlot: s.intendedSlot,
              narrativePurpose: s.narrativePurpose,
              status: 'pending',
              proposedStatModifiers: v.normalized.statModifiers as Prisma.InputJsonValue,
              proposedPowerBudget: v.normalized.powerBudget,
              autoApprovable: v.autoApprovable,
              validationIssues: JSON.stringify(v.issues),
            },
          });

          if (v.autoApprovable) {
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
              where: { id: concept.id },
              data: { status: 'auto_approved', createdItemId: item.id },
            });
          }
        });
      } catch {
        // best-effort — a concept failing to ingest must not break encounter generation
      }
    }
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
