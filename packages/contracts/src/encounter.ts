import { z } from 'zod';
import {
  EncounterTypeSchema,
  MemoryTypeSchema,
  RaritySchema,
  RewardProfileSchema,
  RiskLevelSchema,
  ItemSlotSchema,
  StatCategorySchema,
  StatKeySchema,
} from './enums';

/**
 * encounter.v1 — the contract the AI must return and that fallback content
 * also conforms to. The server NEVER trusts anything outside this shape:
 * no rewards, no stat deltas, no inventory grants, no death commands. The AI
 * proposes narrative + choices; the engine decides all outcomes.
 *
 * Length caps double as a cheap abuse/cost guard on AI output.
 */

export const ENCOUNTER_SCHEMA_VERSION = 'encounter.v1' as const;

export const ChoiceSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_]{2,40}$/, 'choice id must be snake_case, 2-40 chars'),
    label: z.string().min(1).max(120),
    description: z.string().max(400).default(''),
    // statCategory is optional in AI/fallback output; the server derives it
    // from statFocus when absent (see deriveChoiceCategory in the engine).
    statCategory: StatCategorySchema.optional(),
    statFocus: StatKeySchema,
    riskLevel: RiskLevelSchema,
    rewardProfile: RewardProfileSchema,
    mayStartCombat: z.boolean().default(false),
    isHiddenConsequence: z.boolean().default(false),
    visibleHint: z.string().max(160).optional(),
  })
  .strict();
export type EncounterChoice = z.infer<typeof ChoiceSchema>;

export const NpcSuggestionSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(400).default(''),
    role: z.string().max(80).default(''),
    privateOrSharedPotential: z.enum(['private', 'shared_candidate']).default('private'),
  })
  .strict();
export type NpcSuggestion = z.infer<typeof NpcSuggestionSchema>;

export const MemorySuggestionSchema = z
  .object({
    memoryType: MemoryTypeSchema,
    content: z.string().min(1).max(300),
    importance: z.number().int().min(1).max(5).default(1),
  })
  .strict();
export type MemorySuggestion = z.infer<typeof MemorySuggestionSchema>;

export const ItemConceptSuggestionSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(400).default(''),
    intendedRarity: RaritySchema,
    intendedSlot: ItemSlotSchema,
    narrativePurpose: z.string().max(300).default(''),
  })
  .strict();
export type ItemConceptSuggestion = z.infer<typeof ItemConceptSuggestionSchema>;

export const EncounterSchema = z
  .object({
    schemaVersion: z.literal(ENCOUNTER_SCHEMA_VERSION).default(ENCOUNTER_SCHEMA_VERSION),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(1200),
    encounterType: EncounterTypeSchema,
    allowGoHome: z.boolean().default(false),
    goHomeLabel: z.string().max(80).optional(),
    choices: z.array(ChoiceSchema).min(2).max(4),
    npcSuggestions: z.array(NpcSuggestionSchema).max(4).default([]),
    memorySuggestions: z.array(MemorySuggestionSchema).max(6).default([]),
    itemConceptSuggestions: z.array(ItemConceptSuggestionSchema).max(4).default([]),
    // Present on fallback content for auditing; AI output omits it.
    templateId: z.string().max(120).optional(),
  })
  .strict()
  .superRefine((enc, ctx) => {
    const ids = new Set<string>();
    for (const c of enc.choices) {
      if (ids.has(c.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate choice id: ${c.id}`,
          path: ['choices'],
        });
      }
      ids.add(c.id);
    }
  });
export type Encounter = z.infer<typeof EncounterSchema>;

/** Parse loosely-typed content (AI or fallback JSON) into a validated Encounter. */
export function parseEncounter(input: unknown): Encounter {
  return EncounterSchema.parse(input);
}

export function safeParseEncounter(input: unknown) {
  return EncounterSchema.safeParse(input);
}
