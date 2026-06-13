import { z } from 'zod';

/**
 * Central enum definitions for UnlikelyLand.
 *
 * Each enum is declared once as a zod schema; the runtime array of allowed
 * values is derived from `.options`, and the static TS type from `z.infer`.
 * This keeps validation, the value list, and the type in lockstep — add a
 * value in exactly one place.
 */

// ── Character stats ──────────────────────────────────────────────────────────
// Combat stats decide battles, social stats decide conversations, and
// personality stats are nudged by player choices and feed future AI prompting.

export const StatKeySchema = z.enum([
  // combat
  'strength',
  'agility',
  'toughness',
  'accuracy',
  'defense',
  // social
  'charisma',
  'intimidation',
  'deception',
  'empathy',
  'negotiation',
  // personality
  'weirdness',
  'bravery',
  'caution',
  'curiosity',
  'mischief',
  'honor',
]);
export type StatKey = z.infer<typeof StatKeySchema>;
export const ALL_STATS = StatKeySchema.options;

export const COMBAT_STATS = [
  'strength',
  'agility',
  'toughness',
  'accuracy',
  'defense',
] as const satisfies readonly StatKey[];

export const SOCIAL_STATS = [
  'charisma',
  'intimidation',
  'deception',
  'empathy',
  'negotiation',
] as const satisfies readonly StatKey[];

export const PERSONALITY_STATS = [
  'weirdness',
  'bravery',
  'caution',
  'curiosity',
  'mischief',
  'honor',
] as const satisfies readonly StatKey[];

export const StatCategorySchema = z.enum(['combat', 'social', 'personality']);
export type StatCategory = z.infer<typeof StatCategorySchema>;

// ── Encounters ───────────────────────────────────────────────────────────────

export const EncounterTypeSchema = z.enum([
  'combat',
  'social',
  'exploration',
  'mystery',
  'work',
  'training',
  'scavenging',
]);
export type EncounterType = z.infer<typeof EncounterTypeSchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'ridiculous']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export const RISK_LEVELS = RiskLevelSchema.options;

export const RewardProfileSchema = z.enum(['safe', 'balanced', 'risky', 'strange']);
export type RewardProfile = z.infer<typeof RewardProfileSchema>;

// ── Expeditions ──────────────────────────────────────────────────────────────

export const ExpeditionTypeSchema = z.enum([
  'explore',
  'fight',
  'scavenge',
  'socialize',
  'investigate',
  'train',
  'work',
]);
export type ExpeditionType = z.infer<typeof ExpeditionTypeSchema>;

export const ExpeditionStatusSchema = z.enum(['active', 'completed', 'abandoned', 'failed']);
export type ExpeditionStatus = z.infer<typeof ExpeditionStatusSchema>;

// ── Items / economy ──────────────────────────────────────────────────────────

export const RaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'absurd',
]);
export type Rarity = z.infer<typeof RaritySchema>;
export const RARITIES = RaritySchema.options;

export const ItemSlotSchema = z.enum([
  'weapon',
  'armor',
  'tool',
  'trinket',
  'consumable',
  'companion',
]);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

/**
 * Currency categories. The DB stores them on the character as four integer
 * columns; these keys map to those columns. Thematic display names live in
 * CURRENCY_LABEL below.
 */
export const CurrencyTypeSchema = z.enum(['normal', 'premium', 'crafting', 'reputation']);
export type CurrencyType = z.infer<typeof CurrencyTypeSchema>;

/** Player-facing currency names (decided for MVP; see docs/GAME-DESIGN.md). */
export const CURRENCY_LABEL: Record<CurrencyType, string> = {
  normal: 'Clams',
  premium: 'Escape Tokens',
  crafting: 'Oddments',
  reputation: 'Notoriety',
};

// ── Story memory ─────────────────────────────────────────────────────────────

export const MemoryTypeSchema = z.enum([
  'decision',
  'consequence',
  'relationship',
  'unresolved_thread',
  'summary',
  'preference',
  'recurring_npc',
  'world_fact',
  'personality',
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

// ── NPCs ─────────────────────────────────────────────────────────────────────

export const NpcStatusSchema = z.enum(['private', 'shared_candidate', 'shared', 'global']);
export type NpcStatus = z.infer<typeof NpcStatusSchema>;

// ── Content rating ───────────────────────────────────────────────────────────

export const ContentRatingSchema = z.enum(['family', 'pg13', 'r']);
export type ContentRating = z.infer<typeof ContentRatingSchema>;

// ── Users / auth ─────────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(['player', 'moderator', 'admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

// ── Market ───────────────────────────────────────────────────────────────────

export const ListingStatusSchema = z.enum(['active', 'sold', 'cancelled', 'expired']);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

// ── Item concept review ──────────────────────────────────────────────────────

export const ConceptStatusSchema = z.enum(['pending', 'approved', 'rejected', 'auto_approved']);
export type ConceptStatus = z.infer<typeof ConceptStatusSchema>;

// ── AI ───────────────────────────────────────────────────────────────────────

export const AiOutcomeSchema = z.enum(['ok', 'invalid_schema', 'unsafe', 'timeout', 'error', 'fallback']);
export type AiOutcome = z.infer<typeof AiOutcomeSchema>;
