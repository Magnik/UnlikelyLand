import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "IDEMPOTENCY_REQUIRED",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_PAYLOAD_MISMATCH",
  "ACTION_INELIGIBLE",
  "COOLDOWN_ACTIVE",
  "INSUFFICIENT_STAMINA",
  "EVENT_UNAVAILABLE",
  "EVENT_EXPIRED",
  "INVALID_CHOICE",
  "ITEM_UNAVAILABLE",
  "GENERATION_PENDING",
  "RATE_LIMITED"
]);

export const apiErrorSchema = z.object({
  schemaVersion: z.literal("1"),
  code: apiErrorCodeSchema,
  message: z.string().min(1).max(256),
  requestId: z.string().min(1).max(128)
}).strict();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
