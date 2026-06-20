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

/**
 * Ordinal rank of each rating (family is the most restrictive / lowest). Used to
 * decide whether a piece of content (with a minimum rating) is permitted for a
 * player's chosen rating: show iff CONTENT_RATING_RANK[content] <= player rank.
 */
export const CONTENT_RATING_RANK: Record<ContentRating, number> = {
  family: 0,
  pg13: 1,
  r: 2,
};

// ── Story-style preferences (structured, not free-form) ──────────────────────
// A closed set of toggles the player can enable. Stored as an array; the server
// translates them into bounded prompt hints and fallback-selection bias. Keeping
// this an enum (rather than free text) closes an AI prompt-injection vector.

export const StoryStyleTagSchema = z.enum([
  'more_comedy',
  'more_mystery',
  'more_combat',
  'more_social',
  'more_exploration',
  'more_weirdness',
  'less_combat',
  'less_danger',
  'more_recurring_npcs',
  'more_strange_items',
]);
export type StoryStyleTag = z.infer<typeof StoryStyleTagSchema>;
export const STORY_STYLE_TAGS = StoryStyleTagSchema.options;

/** Player-facing labels for the structured story-style toggles. */
export const STORY_STYLE_LABEL: Record<StoryStyleTag, string> = {
  more_comedy: 'More comedy',
  more_mystery: 'More mystery',
  more_combat: 'More combat',
  more_social: 'More social encounters',
  more_exploration: 'More exploration',
  more_weirdness: 'More weirdness',
  less_combat: 'Less combat',
  less_danger: 'Less danger',
  more_recurring_npcs: 'More recurring NPCs',
  more_strange_items: 'More strange items',
};

// ── Consumable effects ───────────────────────────────────────────────────────
// Closed set of mechanical effects a consumable item can have. Kept small and
// server-interpreted; the AI never supplies an effect (the server assigns one).

export const ConsumableEffectTypeSchema = z.enum(['stamina', 'none']);
export type ConsumableEffectType = z.infer<typeof ConsumableEffectTypeSchema>;

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

// ── Social: chat channels, moderation, reporting, guild roles ─────────────────

/** Chat channel scopes. global is required; region/guild are scaffolded. */
export const ChannelTypeSchema = z.enum(['global', 'region', 'guild', 'system']);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

/** Lifecycle status of a chat/mail message after moderation. */
export const ModerationStatusSchema = z.enum(['visible', 'hidden', 'removed']);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;

/** What kind of thing a player report targets. */
export const ReportTargetTypeSchema = z.enum(['chat', 'mail', 'profile', 'guild']);
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;

/** Player-facing report reason categories. */
export const ReportReasonSchema = z.enum([
  'spam',
  'harassment',
  'hate_or_discrimination',
  'sexual_content',
  'threats',
  'scam_or_phishing',
  'other',
]);
export type ReportReason = z.infer<typeof ReportReasonSchema>;
export const REPORT_REASONS = ReportReasonSchema.options;

/** Human labels for report reasons (UI). */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate_or_discrimination: 'Hate or discrimination',
  sexual_content: 'Sexual content',
  threats: 'Threats',
  scam_or_phishing: 'Scam or phishing',
  other: 'Other',
};

/** Lifecycle of a moderation report. */
export const ReportStatusSchema = z.enum(['open', 'reviewing', 'actioned', 'dismissed']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/** Auditable moderation/admin action types. */
export const ModerationActionTypeSchema = z.enum([
  'hide_message',
  'delete_message',
  'restore_message',
  'mute',
  'unmute',
  'warn',
  'ban',
  'unban',
  'guild_disband',
  'guild_rename',
  'resolve_report',
  'promote',
  'demote',
  'transfer_owner',
]);
export type ModerationActionType = z.infer<typeof ModerationActionTypeSchema>;

/** Guild membership roles (owner == founder). */
export const GuildRoleSchema = z.enum(['owner', 'officer', 'member']);
export type GuildRole = z.infer<typeof GuildRoleSchema>;

/** Public activity-feed event kinds. */
export const ActivityTypeSchema = z.enum(['achievement', 'level', 'guild', 'escape', 'victory']);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
