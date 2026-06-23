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
import { findLocation } from '../content/locations';
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
   * Deterministic idempotency key for a generated step encounter. Reusing the
   * existing `@@unique([characterId, clientRequestId])` constraint makes a second
   * concurrent generation of the SAME step collide (P2002) instead of inserting a
   * duplicate row — the cheap serializer that lets advance charge+create atomically.
   */
  static stepKey(expeditionId: string, stepIndex: number): string {
    return `step:${expeditionId}:${stepIndex}`;
  }

  /**
   * Generate + persist the encounter for a step (used to open an expedition, where
   * stamina was already charged in the start transaction). For the in-flight
   * "advance" path, callers use generateStepContent + createStepEncounter so the
   * charge and the create commit (or roll back) together.
   */
  async generateForStep(characterId: string, expeditionId: string, stepIndex: number): Promise<EncounterView> {
    const content = await this.generateStepContent(characterId, expeditionId, stepIndex);
    const view = await this.createStepEncounter(this.prisma, characterId, expeditionId, stepIndex, content);
    await this.ingestItemConcepts(characterId, content.encounter.itemConceptSuggestions);
    return view;
  }

  /**
   * Build the validated encounter for a step. Pure generation — NO database writes,
   * so the (slow, AI-backed) call happens outside any transaction.
   */
  async generateStepContent(
    characterId: string,
    expeditionId: string,
    stepIndex: number,
  ): Promise<{ encounter: Encounter; source: 'ai' | 'fallback'; regionSetId: string }> {
    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: { stats: true, regionSet: true },
    });
    const expedition = await this.prisma.expedition.findUniqueOrThrow({ where: { id: expeditionId } });
    const cfg = EXPEDITIONS[expedition.type as ExpeditionType];
    const stats = this.characters.statBlockFromRow(character.stats as never);
    const storyStyleTags = await this.characters.getStoryStyleTags(characterId);
    const memories = await this.memory.recentForPrompt(characterId);

    // Region is locked for the whole expedition (set at start). Fall back to the
    // old per-step rotation only for expeditions created before that field existed.
    let regionName = expedition.regionName ?? '';
    if (!regionName) {
      const regions = await this.prisma.region.findMany({
        where: { regionSetId: character.regionSetId },
        select: { name: true },
      });
      regionName = regions.length ? regions[stepIndex % regions.length].name : '';
    }

    // Re-derive the locked location's vibe from the hardcoded catalog so it can be
    // pinned in the prompt (no need to persist the blurb on the expedition row).
    const location = findLocation(character.regionSet.key, regionName);

    // "Previously" — the prior resolved encounter of THIS expedition, so the next
    // step reads as a continuation rather than an unrelated scene.
    const previously = await this.priorStepRecap(expeditionId);

    const { encounter, source } = await this.ai.generateEncounter({
      characterId,
      characterName: character.displayName,
      premise: expedition.premise,
      goal: expedition.goal,
      previously,
      regionSetName: character.regionSet.name,
      regionSetBlurb: character.regionSet.blurb,
      location: regionName || null,
      locationBlurb: location?.blurb ?? null,
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

    return { encounter, source, regionSetId: character.regionSetId };
  }

  /**
   * Persist a generated step encounter via the given client (the caller's tx, so it
   * commits/rolls back together with the stamina charge). The deterministic
   * clientRequestId makes a concurrent duplicate insert throw P2002 — the caller
   * treats that as "another advance already claimed this step".
   */
  async createStepEncounter(
    client: Prisma.TransactionClient,
    characterId: string,
    expeditionId: string,
    stepIndex: number,
    content: { encounter: Encounter; source: 'ai' | 'fallback'; regionSetId: string },
  ): Promise<EncounterView> {
    const row = await client.encounter.create({
      data: {
        characterId,
        expeditionId,
        regionSetId: content.regionSetId,
        source: content.source,
        encounterType: content.encounter.encounterType,
        payload: content.encounter as unknown as object,
        clientRequestId: EncountersService.stepKey(expeditionId, stepIndex),
      },
      select: { id: true, source: true, resolved: true, payload: true },
    });
    return this.toView(row);
  }

  /** Ingest the AI item-concept proposals from a generated encounter (best-effort). */
  async ingestStepConcepts(characterId: string, suggestions: ItemConceptSuggestion[]): Promise<void> {
    await this.ingestItemConcepts(characterId, suggestions);
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

  /**
   * The current unresolved encounter for a SPECIFIC expedition. Used by advance so a
   * dangling encounter from a different (e.g. abandoned) expedition can never be
   * mistaken for this expedition's pending step.
   */
  async currentEncounterForExpedition(characterId: string, expeditionId: string): Promise<EncounterView | null> {
    const row = await this.prisma.encounter.findFirst({
      where: { characterId, expeditionId, resolved: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, source: true, resolved: true, payload: true },
    });
    return row ? this.toView(row) : null;
  }

  /**
   * The previous resolved encounter of an expedition, distilled to a one-line
   * recap (title, chosen action, outcome) for the next encounter's prompt so the
   * story connects step to step. Null on the opening step.
   */
  private async priorStepRecap(
    expeditionId: string,
  ): Promise<{ title: string; choiceLabel: string | null; outcome: string | null } | null> {
    const prior = await this.prisma.encounter.findFirst({
      where: { expeditionId, resolved: true },
      orderBy: { resolvedAt: 'desc' },
      select: { payload: true, resolvedChoiceId: true, resolution: true },
    });
    if (!prior) return null;
    const payload = prior.payload as Encounter;
    const choice = payload.choices.find((c) => c.id === prior.resolvedChoiceId);
    const outcome = (prior.resolution as { narrative?: string } | null)?.narrative ?? null;
    return { title: payload.title, choiceLabel: choice?.label ?? null, outcome };
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
