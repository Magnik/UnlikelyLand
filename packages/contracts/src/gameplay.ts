import { z } from "zod";
import { id, identifier, nonNegativeInteger, timestamp } from "./primitives.js";

export const playerGameplayStateSchema = z.object({
  playerId: id,
  level: z.number().int().positive(),
  experience: nonNegativeInteger,
  currency: nonNegativeInteger,
  staminaStored: nonNegativeInteger,
  staminaCapacity: z.number().int().positive(),
  staminaUpdatedAt: timestamp,
  version: nonNegativeInteger
}).strict().refine((state) => state.staminaStored <= state.staminaCapacity, {
  message: "Stored stamina cannot exceed capacity",
  path: ["staminaStored"]
});

export const assignedEventSchema = z.object({
  id,
  contentVersionId: id,
  status: z.enum(["available", "resolved", "expired"]),
  assignedAt: timestamp,
  expiresAt: timestamp,
  choices: z.array(z.object({
    id: identifier,
    label: z.string().min(1).max(160)
  }).strict()).min(2).max(4),
  resolvedChoiceId: z.string().optional()
}).strict().refine((event) => Date.parse(event.expiresAt) > Date.parse(event.assignedAt), {
  message: "Event expiry must be after assignment",
  path: ["expiresAt"]
}).refine((event) => event.status === "resolved" ? event.resolvedChoiceId !== undefined : event.resolvedChoiceId === undefined, {
  message: "Resolved choice must be present only for resolved events",
  path: ["resolvedChoiceId"]
});

const asyncJobBaseSchema = z.object({
  id,
  type: z.enum(["generate_event", "generate_item"]),
  attempts: nonNegativeInteger
}).strict();

export const asyncJobStatusSchema = z.discriminatedUnion("status", [
  asyncJobBaseSchema.extend({ status: z.literal("queued") }),
  asyncJobBaseSchema.extend({ status: z.literal("running") }),
  asyncJobBaseSchema.extend({ status: z.literal("succeeded"), resultReference: id }),
  asyncJobBaseSchema.extend({ status: z.literal("failed"), errorCode: z.string().min(1).max(128) }),
  asyncJobBaseSchema.extend({ status: z.literal("dead_letter"), errorCode: z.string().min(1).max(128) })
]);

export const idempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().min(1).max(128)
}).strict();

export const eventInstanceParamsSchema = z.object({ eventInstanceId: id }).strict();
export const itemInstanceParamsSchema = z.object({ itemInstanceId: id }).strict();
export const jobParamsSchema = z.object({ jobId: id }).strict();

export const exploreRequestSchema = z.object({ schemaVersion: z.literal("1") }).strict();

export const exploreResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  gameplayState: playerGameplayStateSchema,
  event: assignedEventSchema
}).strict();

export const generationPendingResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  code: z.literal("generation_pending"),
  gameplayState: playerGameplayStateSchema,
  generationJob: asyncJobStatusSchema
}).strict();

export const resolveEventRequestSchema = z.object({ schemaVersion: z.literal("1"), choiceId: identifier }).strict();

export const rewardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("currency"), amount: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("experience"), amount: z.number().int().positive() }).strict(),
  z.object({
    type: z.literal("item"),
    definitionVersionId: id,
    amount: z.number().int().positive()
  }).strict()
]);

export const resolveEventResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  gameplayState: playerGameplayStateSchema,
  event: assignedEventSchema,
  rewards: z.array(rewardSchema).max(16)
}).strict();

export const useItemRequestSchema = z.object({ schemaVersion: z.literal("1") }).strict();

export const inventorySummaryEntrySchema = z.object({
  definitionVersionId: id,
  quantity: z.number().int().positive()
}).strict();

export const gameplayStateResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  gameplayState: playerGameplayStateSchema,
  inventory: z.array(inventorySummaryEntrySchema),
  activeEvent: assignedEventSchema.optional()
}).strict();

export const useItemResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  gameplayState: playerGameplayStateSchema,
  consumed: z.boolean(),
  itemInstanceId: id
}).strict();

export const jobStatusResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  job: asyncJobStatusSchema
}).strict();

export type PlayerGameplayState = z.infer<typeof playerGameplayStateSchema>;
export type AssignedEvent = z.infer<typeof assignedEventSchema>;
export type AsyncJobStatus = z.infer<typeof asyncJobStatusSchema>;
export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>;
export type ExploreRequest = z.infer<typeof exploreRequestSchema>;
export type ExploreResponse = z.infer<typeof exploreResponseSchema>;
export type ResolveEventRequest = z.infer<typeof resolveEventRequestSchema>;
export type ResolveEventResponse = z.infer<typeof resolveEventResponseSchema>;
export type UseItemRequest = z.infer<typeof useItemRequestSchema>;
export type UseItemResponse = z.infer<typeof useItemResponseSchema>;
export type GameplayStateResponse = z.infer<typeof gameplayStateResponseSchema>;
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;
