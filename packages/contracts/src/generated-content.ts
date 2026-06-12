import { z } from "zod";
import { identifier } from "./primitives.js";

const tags = z.array(identifier).max(12);

export const generatedEventCandidateSchema = z.object({
  schemaVersion: z.literal("1"),
  title: z.string().trim().min(1).max(120),
  narrative: z.string().trim().min(1).max(4000),
  tags,
  choices: z.array(z.object({
    id: identifier,
    label: z.string().trim().min(1).max(160),
    outcomeIntent: identifier
  }).strict()).min(2).max(4),
  moderation: z.object({
    rating: z.enum(["everyone", "teen"]),
    flags: tags
  }).strict()
}).strict().superRefine((event, context) => {
  const ids = event.choices.map((choice) => choice.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "Choice IDs must be unique" });
  }
});

export const generatedItemCandidateSchema = z.object({
  schemaVersion: z.literal("1"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  category: z.enum(["consumable", "equipment", "material"]),
  rarity: z.enum(["common", "uncommon", "rare", "epic"]),
  tags,
  proposedEffects: z.array(z.object({
    stat: identifier,
    operation: z.enum(["add", "multiply"]),
    value: z.number().finite().min(-100).max(100)
  }).strict()).max(4)
}).strict();

export type GeneratedEventCandidate = z.infer<typeof generatedEventCandidateSchema>;
export type GeneratedItemCandidate = z.infer<typeof generatedItemCandidateSchema>;
