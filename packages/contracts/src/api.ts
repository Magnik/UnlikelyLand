import { z } from 'zod';
import {
  type ActivityType,
  type ConsumableEffectType,
  ContentRatingSchema,
  type CurrencyType,
  type EncounterType,
  type EquipmentSlot,
  ExpeditionTypeSchema,
  type GuildRole,
  type ItemSlot,
  ItemSlotSchema,
  type ModerationActionType,
  type ModerationStatus,
  type Rarity,
  RaritySchema,
  type ReportReason,
  ReportReasonSchema,
  type ReportStatus,
  ReportStatusSchema,
  type ReportTargetType,
  ReportTargetTypeSchema,
  type RiskLevel,
  type RewardProfile,
  type StatCategory,
  type StatKey,
  StatKeySchema,
  type StoryStyleTag,
  StoryStyleTagSchema,
  type UserRole,
} from './enums';
import type { StatBlock } from './stats';

/** A partial map of stat → signed modifier (an equipped item's contribution). */
export type StatModifier = Partial<Record<StatKey, number>>;

/**
 * Request DTOs (zod, validated at the controller boundary) and response view
 * types (plain TS, shared with the web client). Keeping these in one place
 * lets the frontend import the exact shapes the server returns.
 */

// ── Auth ─────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'username may contain letters, numbers, underscore'),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(32).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  username: z.string().min(1).max(24),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface AuthResponse {
  /** Short-lived access token (Bearer). */
  token: string;
  /** Longer-lived refresh token; exchange at POST /auth/refresh for a new access token. */
  refreshToken: string;
  user: SessionUser;
}

export const RefreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof RefreshSchema>;

// ── Character ────────────────────────────────────────────────────────────────

export const UpdateCharacterSchema = z.object({
  // Trim and cap the bio; server also moderates it before persisting.
  bio: z
    .string()
    .max(500)
    .transform((s) => s.trim())
    .optional(),
  contentRating: ContentRatingSchema.optional(),
  // Structured story-style toggles (deduped, capped). Replaces the old free-form
  // string so player text never reaches the AI prompt verbatim.
  storyStyleTags: z.array(StoryStyleTagSchema).max(10).optional(),
  // Selected cosmetic title: an unlocked PUBLIC achievement key, or null to clear.
  // The server rejects any key the character has not actually unlocked.
  title: z.string().max(80).nullable().optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;

export interface CharacterView {
  id: string;
  displayName: string;
  bio: string;
  /** Selected cosmetic title (unlocked public achievement name), or null. */
  title: string | null;
  level: number;
  xp: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  currencies: Record<CurrencyType, number>;
  stamina: { current: number; max: number; regenPerHour: number; nextPointInSeconds: number | null };
  stats: StatBlock;
  regionSet: { id: string; name: string; blurb: string };
  contentRating: 'family' | 'pg13' | 'r';
  storyStyleTags: StoryStyleTag[];
  death: {
    isDead: boolean;
    deathReason: string | null;
    reviveAvailableAt: string | null;
    reviveInSeconds: number | null;
    freeReviveAvailable: boolean;
    deathCount: number;
    payToReviveCost: number;
  };
  createdAt: string;
}

// ── Expeditions ──────────────────────────────────────────────────────────────

export const StartExpeditionSchema = z.object({
  type: ExpeditionTypeSchema,
});
export type StartExpeditionInput = z.infer<typeof StartExpeditionSchema>;

export interface ExpeditionView {
  id: string;
  type: z.infer<typeof ExpeditionTypeSchema>;
  status: 'active' | 'completed' | 'abandoned' | 'failed';
  step: number;
  maxSteps: number;
  staminaPerStep: number;
  /** One-time scene-set + objective + locked region for this run (quest header). */
  premise: string | null;
  goal: string | null;
  regionName: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
}

// ── Encounters ───────────────────────────────────────────────────────────────

/** Choice as shown to the player — reward details are intentionally vague. */
export interface ChoiceView {
  id: string;
  label: string;
  description: string;
  statCategory: StatCategory;
  statFocus: StatKey;
  statFocusLabel: string;
  riskLevel: RiskLevel;
  rewardProfile: RewardProfile;
  mayStartCombat: boolean;
  isHiddenConsequence: boolean;
  visibleHint: string | null;
}

export interface EncounterView {
  id: string;
  title: string;
  description: string;
  encounterType: EncounterType;
  allowGoHome: boolean;
  goHomeLabel: string | null;
  source: 'ai' | 'fallback';
  resolved: boolean;
  choices: ChoiceView[];
}

export const ResolveChoiceSchema = z.object({
  encounterId: z.string().uuid(),
  choiceId: z.string().regex(/^[a-z0-9_]{2,40}$/),
  // Optional client-generated id so a double-tap / retry can't resolve twice.
  clientRequestId: z.string().uuid().optional(),
});
export type ResolveChoiceInput = z.infer<typeof ResolveChoiceSchema>;

export const GoHomeSchema = z.object({
  expeditionId: z.string().uuid(),
});
export type GoHomeInput = z.infer<typeof GoHomeSchema>;

/**
 * Advance to the next step of an active expedition: charges stamina and generates
 * the next encounter. Split out of `resolve` so the player sees their outcome
 * immediately while this (potentially slow AI) call runs in the background.
 * Idempotent: returns the already-generated encounter if one exists for the step.
 */
export const AdvanceExpeditionSchema = z.object({
  expeditionId: z.string().uuid(),
});
export type AdvanceExpeditionInput = z.infer<typeof AdvanceExpeditionSchema>;

export interface AdvanceExpeditionView {
  expedition: ExpeditionView;
  /** The next encounter, or null if the expedition ended (e.g. out of stamina). */
  encounter: EncounterView | null;
}

export interface CombatRoundView {
  round: number;
  attacker: 'player' | 'enemy';
  text: string;
  damage: number;
  hit: boolean;
  crit: boolean;
  playerHpAfter: number;
  enemyHpAfter: number;
}

export interface CombatView {
  enemyName: string;
  playerMaxHp: number;
  enemyMaxHp: number;
  rounds: CombatRoundView[];
  playerWon: boolean;
  playerHpRemaining: number;
}

export interface RewardView {
  xp: number;
  currencies: Partial<Record<CurrencyType, number>>;
  items: { name: string; rarity: Rarity; slot: ItemSlot }[];
}

export interface StatNudgeView {
  stat: StatKey;
  statLabel: string;
  delta: number;
}

export interface ResolutionView {
  encounterId: string;
  choiceId: string;
  narrative: string;
  check: {
    statFocus: StatKey;
    statValue: number;
    difficulty: number;
    roll: number;
    total: number;
    success: boolean;
    margin: number;
  };
  combat: CombatView | null;
  rewards: RewardView;
  statNudges: StatNudgeView[];
  died: boolean;
  deathReason: string | null;
  expeditionCompleted: boolean;
  completionBonus: RewardView | null;
  character: CharacterView;
  expedition: ExpeditionView | null;
  /**
   * The next encounter, when it is already available (e.g. an idempotent replay).
   * On a fresh resolve this is null and `nextStepPending` is true — the client
   * calls POST /expeditions/advance to generate it while showing this outcome.
   */
  nextEncounter: EncounterView | null;
  /** True when the expedition continues and the next encounter must still be fetched. */
  nextStepPending: boolean;
}

// ── Death ────────────────────────────────────────────────────────────────────

export interface DeathStatusView {
  isDead: boolean;
  deathReason: string | null;
  diedAt: string | null;
  reviveAvailableAt: string | null;
  reviveInSeconds: number | null;
  freeReviveAvailable: boolean;
  payToReviveCost: number;
  canAffordPaidRevive: boolean;
  deathCount: number;
}

export const ReviveSchema = z.object({
  method: z.enum(['wait', 'pay', 'free']),
});
export type ReviveInput = z.infer<typeof ReviveSchema>;

// ── Admin ────────────────────────────────────────────────────────────────────

export const AiSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  forceFallback: z.boolean().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});
export type AiSettingsUpdateInput = z.infer<typeof AiSettingsUpdateSchema>;

export interface AiSettingsView {
  enabled: boolean;
  forceFallback: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  effectivelyOn: boolean;
}

// ── Admin: item-concept review ───────────────────────────────────────────────

/** Bounded numeric query param for admin list endpoints. */
export const AdminLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const ConceptStatusFilterSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'auto_approved']).optional(),
});

/** Approve a concept, optionally editing fields first. Server re-validates. */
export const ApproveConceptSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).optional(),
  rarity: RaritySchema.optional(),
  slot: ItemSlotSchema.optional(),
});
export type ApproveConceptInput = z.infer<typeof ApproveConceptSchema>;

export const RejectConceptSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type RejectConceptInput = z.infer<typeof RejectConceptSchema>;

export const PromoteNpcBodySchema = z.object({
  status: z.enum(['private', 'shared_candidate', 'shared', 'global']),
});

/** A pending/approved/rejected AI item concept, with its validation verdict. */
export interface ItemConceptView {
  id: string;
  name: string;
  description: string;
  narrativePurpose: string;
  intendedSlot: ItemSlot;
  intendedRarity: Rarity;
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  reviewNotes: string | null;
  createdItemId: string | null;
  proposedByCharacterId: string | null;
  createdAt: string;
  /** Rule-based validation result computed at review time (not persisted). */
  validation: {
    valid: boolean;
    autoApprovable: boolean;
    powerBudget: number;
    statModifiers: StatModifier;
    issues: string[];
  };
}

/** An ItemDefinition row for the admin catalog browser. */
export interface ItemDefinitionView {
  id: string;
  key: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: Rarity;
  statModifiers: StatModifier;
  powerBudget: number;
  source: string;
  consumableEffect: ConsumableEffectView | null;
  createdAt: string;
}

/** A character's inventory as seen by an admin (includes ids for debugging). */
export interface AdminInventoryView {
  characterId: string;
  displayName: string;
  items: InventoryItemView[];
  stats: EffectiveStatsView;
}

// ── Inventory actions ────────────────────────────────────────────────────────

export const ItemActionSchema = z.object({
  inventoryItemId: z.string().uuid(),
  // Optional idempotency key so a double-tapped "use" can't consume twice.
  clientRequestId: z.string().uuid().optional(),
});
export type ItemActionInput = z.infer<typeof ItemActionSchema>;

export interface ConsumableEffectView {
  type: ConsumableEffectType;
  /** Magnitude of the effect (e.g. stamina points restored). */
  power: number;
  /** Short human description, e.g. "Restores 25 stamina". */
  label: string;
}

export interface InventoryItemView {
  id: string;
  itemKey: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: Rarity;
  quantity: number;
  equipped: boolean;
  /** The paperdoll position this item occupies when equipped (e.g. ring1), or null. */
  equippedSlot: EquipmentSlot | null;
  statModifiers: StatModifier;
  /** Present only for consumable items. */
  consumableEffect: ConsumableEffectView | null;
}

/** One stat's base value, equipped contribution, and resulting effective value. */
export interface EffectiveStatEntry {
  stat: StatKey;
  label: string;
  category: StatCategory;
  base: number;
  modifier: number;
  effective: number;
}

export interface EffectiveStatsView {
  base: StatBlock;
  effective: StatBlock;
  /** Per-stat breakdown for display; only stats with a non-zero modifier are interesting. */
  entries: EffectiveStatEntry[];
}

/** What a player sees on their own inventory screen. */
export interface InventoryView {
  items: InventoryItemView[];
  /** inventoryItemId currently equipped in each paperdoll position (if any). */
  equippedBySlot: Partial<Record<EquipmentSlot, string>>;
  stats: EffectiveStatsView;
}

// ── Player profile (public) ──────────────────────────────────────────────────

/** A single equipped item summarised for a public profile (no internal ids). */
export interface PublicEquipmentEntry {
  slot: ItemSlot;
  name: string;
  rarity: Rarity;
}

/** The viewer's relationship to the profile being viewed (drives action buttons). */
export interface ProfileRelationship {
  isSelf: boolean;
  isFriend: boolean;
  requestIncoming: boolean;
  requestOutgoing: boolean;
  isBlocked: boolean;
}

/** A public activity-feed entry (achievement, level milestone, guild, escape). */
export interface ActivityEventView {
  id: string;
  type: ActivityType;
  characterId: string;
  displayName: string;
  title: string;
  detail: string;
  createdAt: string;
}

/**
 * Public-only projection of a character. Deliberately excludes Story Memory,
 * private expedition details, AI events, messages, exact economy history, and
 * hidden personality values.
 */
export interface PublicProfileView {
  characterId: string;
  displayName: string;
  /** Selected cosmetic title (unlocked public achievement name), or null. */
  title: string | null;
  bio: string;
  level: number;
  regionSet: { id: string; name: string };
  guild: { id: string; name: string; tag: string | null; role: GuildRole } | null;
  achievements: { key: string; name: string; description: string; unlockedAt: string }[];
  /** Coarse public stat summary (combat/social totals + top personality trait). */
  statSummary: { combat: number; social: number; topTrait: string | null };
  equipment: PublicEquipmentEntry[];
  combatVictories: number;
  escapeCount: number;
  joinedAt: string;
  /** A handful of the player's most recent public activity events. */
  recentActivity: ActivityEventView[];
  /** The viewing player's relationship to this character. */
  relationship: ProfileRelationship;
}

// ── Leaderboards ─────────────────────────────────────────────────────────────

export const LeaderboardTypeSchema = z.enum([
  'level',
  'wealth',
  'reputation',
  'victories',
  'achievements',
]);
export type LeaderboardType = z.infer<typeof LeaderboardTypeSchema>;

/** Human labels + the unit each board ranks by. */
export const LEADERBOARD_META: Record<LeaderboardType, { label: string; unit: string }> = {
  level: { label: 'Level', unit: 'level' },
  wealth: { label: 'Wealth', unit: 'Clams' },
  reputation: { label: 'Reputation', unit: 'Notoriety' },
  victories: { label: 'Combat victories', unit: 'wins' },
  achievements: { label: 'Achievements', unit: 'unlocked' },
};

/** Page query for a leaderboard (bounded). regionSetId scopes the board to one region set. */
export const LeaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  regionSetId: z.string().uuid().optional(),
});
export type LeaderboardQueryInput = z.infer<typeof LeaderboardQuerySchema>;

export interface LeaderboardEntry {
  rank: number;
  characterId: string;
  displayName: string;
  guildTag: string | null;
  level: number;
  value: number;
  mine: boolean;
}

/** A page of a leaderboard plus the viewer's own rank (even when off-page). */
export interface LeaderboardView {
  type: LeaderboardType;
  label: string;
  unit: string;
  page: number;
  pageSize: number;
  total: number;
  entries: LeaderboardEntry[];
  /** The viewer's own ranked row, or null if they have no rankable value. */
  me: LeaderboardEntry | null;
}

// ── Guilds ───────────────────────────────────────────────────────────────────

/** Guild names: trimmed, 3-32 chars; tag: 2-5 uppercase alphanumerics, optional. */
export const CreateGuildSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(3).max(32)),
  tag: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,5}$/, 'tag must be 2-5 letters/numbers'))
    .optional(),
  description: z.string().max(300).optional(),
});
export type CreateGuildInput = z.infer<typeof CreateGuildSchema>;

/** Update a guild's description/tag (owner/officer). */
export const UpdateGuildSchema = z.object({
  description: z.string().max(300).optional(),
  tag: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,5}$/, 'tag must be 2-5 letters/numbers'))
    .nullable()
    .optional(),
});
export type UpdateGuildInput = z.infer<typeof UpdateGuildSchema>;

/** Target a member within the caller's guild (promote/demote/kick/transfer). */
export const GuildMemberActionSchema = z.object({ characterId: z.string().uuid() });
export type GuildMemberActionInput = z.infer<typeof GuildMemberActionSchema>;

/** Deposit/withdraw Oddments (crafting currency) to/from the guild bank. */
export const GuildBankActionSchema = z.object({ amount: z.number().int().min(1).max(1_000_000) });
export type GuildBankActionInput = z.infer<typeof GuildBankActionSchema>;

export const GuildSearchSchema = z.object({
  q: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
});

export interface GuildMemberView {
  characterId: string;
  displayName: string;
  role: GuildRole;
  level: number;
  joinedAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  tag: string | null;
  description: string;
  ownerCharacterId: string;
  memberCount: number;
  /** Oddments held in the guild bank. */
  bankBalance: number;
  /** Guild XP and the level derived from it. */
  xp: number;
  level: number;
  createdAt: string;
  members: GuildMemberView[];
  isMine: boolean;
  /** The viewer's role in this guild, or null if not a member. */
  myRole: GuildRole | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  tag: string | null;
  description: string;
  memberCount: number;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

/** Channels a player can post to / read (the 'system' channel is server-only). */
export const ChatChannelSchema = z.enum(['global', 'region', 'guild']);
export type ChatChannel = z.infer<typeof ChatChannelSchema>;

export const SendChatSchema = z.object({
  body: z.string().min(1).max(300),
  channel: ChatChannelSchema.default('global'),
});
export type SendChatInput = z.infer<typeof SendChatSchema>;

/** Query for the chat feed: channel + page size + an optional "before" cursor. */
export const ChatListQuerySchema = z.object({
  channel: ChatChannelSchema.default('global'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().uuid().optional(),
});
export type ChatListQueryInput = z.infer<typeof ChatListQuerySchema>;

export interface ChatMessageView {
  id: string;
  /** Public player handle (character id) — used for profile links, blocking, reporting. */
  characterId: string;
  displayName: string;
  /** Short guild tag shown next to the name, e.g. "CRAB", or null. */
  guildTag: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
}

/** A page of chat messages (oldest→newest) plus whether older history exists. */
export interface ChatPageView {
  messages: ChatMessageView[];
  /** The id to pass as `before` to fetch the previous page, or null at the start. */
  olderCursor: string | null;
  hasOlder: boolean;
}

// ── Market ───────────────────────────────────────────────────────────────────

export const CreateListingSchema = z.object({
  inventoryItemId: z.string().uuid(),
  priceAmount: z.number().int().min(1).max(1_000_000),
  quantity: z.number().int().min(1).max(999).default(1),
});
export type CreateListingInput = z.infer<typeof CreateListingSchema>;

export const ListingActionSchema = z.object({ listingId: z.string().uuid() });
export type ListingActionInput = z.infer<typeof ListingActionSchema>;

export interface MarketListingView {
  id: string;
  itemName: string;
  itemSlot: ItemSlot;
  itemRarity: Rarity;
  quantity: number;
  priceAmount: number;
  priceCurrency: 'normal';
  sellerCharacterId: string;
  sellerName: string;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  mine: boolean;
}

// ── Social: friends, requests, blocking, directory search ────────────────────

export const TargetCharacterSchema = z.object({ characterId: z.string().uuid() });
export type TargetCharacterInput = z.infer<typeof TargetCharacterSchema>;

export const FriendRequestActionSchema = z.object({ requestId: z.string().uuid() });
export type FriendRequestActionInput = z.infer<typeof FriendRequestActionSchema>;

export interface DirectoryEntry {
  characterId: string;
  displayName: string;
  level: number;
}

export interface FriendRequestView {
  id: string;
  characterId: string;
  displayName: string;
  createdAt: string;
}

export interface SocialView {
  friends: DirectoryEntry[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  blocked: DirectoryEntry[];
}

// ── Mail ─────────────────────────────────────────────────────────────────────

export const SendMailSchema = z
  .object({
    // Prefer addressing by characterId (unambiguous); recipientName is a fallback
    // for the compose form and is resolved by exact, case-insensitive unique name.
    recipientCharacterId: z.string().uuid().optional(),
    recipientName: z.string().min(1).max(32).optional(),
    subject: z.string().max(120).optional(),
    body: z.string().min(1).max(2000),
  })
  .refine((v) => v.recipientCharacterId || v.recipientName, {
    message: 'A recipient is required',
  });
export type SendMailInput = z.infer<typeof SendMailSchema>;

export const MailActionSchema = z.object({ mailId: z.string().uuid() });
export type MailActionInput = z.infer<typeof MailActionSchema>;

export interface MailView {
  id: string;
  subject: string;
  body: string;
  otherCharacterId: string;
  otherName: string;
  direction: 'in' | 'out';
  read: boolean;
  createdAt: string;
}

export interface MailboxView {
  inbox: MailView[];
  outbox: MailView[];
  unread: number;
}

// ── Achievements ─────────────────────────────────────────────────────────────

export interface AchievementView {
  key: string;
  name: string;
  description: string;
  unlockedAt: string | null;
}

// ── Prestige / escape ────────────────────────────────────────────────────────

export interface EscapeStatusView {
  eligible: boolean;
  requiredLevel: number;
  level: number;
  escapeCount: number;
  legacyLevel: number;
}

export interface EscapeResultView {
  escaped: boolean;
  escapeCount: number;
  legacyLevel: number;
  character: CharacterView;
}

// ── Admin: NPC promotion ─────────────────────────────────────────────────────

export const PromoteNpcSchema = z.object({
  npcId: z.string().uuid(),
  status: z.enum(['private', 'shared_candidate', 'shared', 'global']),
});
export type PromoteNpcInput = z.infer<typeof PromoteNpcSchema>;

// ── Reporting (player-facing) ────────────────────────────────────────────────

/**
 * File a report. For chat/mail the targetMessageId identifies the message; for
 * profile/guild the targetCharacterId/targetGuildId identifies the subject. The
 * server derives the offending author and prevents duplicate reports.
 */
export const CreateReportSchema = z
  .object({
    targetType: ReportTargetTypeSchema,
    targetMessageId: z.string().uuid().optional(),
    targetCharacterId: z.string().uuid().optional(),
    targetGuildId: z.string().uuid().optional(),
    reason: ReportReasonSchema,
    note: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      (v.targetType === 'chat' || v.targetType === 'mail' ? !!v.targetMessageId : true) &&
      (v.targetType === 'profile' ? !!v.targetCharacterId : true) &&
      (v.targetType === 'guild' ? !!v.targetGuildId : true),
    { message: 'Report is missing its target id' },
  );
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

// ── Moderation (moderator/admin) ─────────────────────────────────────────────

/** Bounded query for moderation lists. */
export const ModerationListQuerySchema = z.object({
  status: ReportStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const ModerationMessageActionSchema = z.object({
  messageId: z.string().uuid(),
  targetType: z.enum(['chat', 'mail']).default('chat'),
  reason: z.string().max(300).optional(),
});
export type ModerationMessageActionInput = z.infer<typeof ModerationMessageActionSchema>;

export const MuteUserSchema = z.object({
  characterId: z.string().uuid(),
  minutes: z.number().int().min(1).max(60 * 24 * 30),
  reason: z.string().max(300).optional(),
});
export type MuteUserInput = z.infer<typeof MuteUserSchema>;

export const WarnUserSchema = z.object({
  characterId: z.string().uuid(),
  reason: z.string().max(300),
});
export type WarnUserInput = z.infer<typeof WarnUserSchema>;

export const BanUserSchema = z.object({
  characterId: z.string().uuid(),
  reason: z.string().max(300),
});
export type BanUserInput = z.infer<typeof BanUserSchema>;

export const TargetCharacterIdSchema = z.object({ characterId: z.string().uuid() });

export const ResolveReportSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(['actioned', 'dismissed', 'reviewing']),
  note: z.string().max(500).optional(),
});
export type ResolveReportInput = z.infer<typeof ResolveReportSchema>;

/** A reported message/profile as seen by a moderator (includes the offending text). */
export interface ReportView {
  id: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  reporterDisplayName: string;
  reportCount: number;
  targetMessageId: string | null;
  targetCharacterId: string | null;
  targetGuildId: string | null;
  /** Display name of the reported player, when known. */
  targetDisplayName: string | null;
  /** The reported message body (chat/mail), when applicable. */
  messageBody: string | null;
  messageStatus: ModerationStatus | null;
  createdAt: string;
}

/** A row in the moderation audit trail. */
export interface ModerationActionView {
  id: string;
  actionType: ModerationActionType;
  moderatorName: string;
  targetType: string;
  targetCharacterId: string | null;
  targetDisplayName: string | null;
  reason: string;
  createdAt: string;
}

/** A moderatable chat message row for the admin/mod chat view. */
export interface ModChatMessageView {
  id: string;
  characterId: string;
  displayName: string;
  body: string;
  moderationStatus: ModerationStatus;
  reportCount: number;
  createdAt: string;
}

/** Lightweight moderation summary for the admin dashboard. */
export interface ModerationStatsView {
  openReports: number;
  hiddenMessages: number;
  mutedPlayers: number;
  bannedPlayers: number;
  actionsLast7d: number;
}

/** A player as seen in the moderator user-search / lookup. */
export interface ModeratedUserView {
  characterId: string;
  displayName: string;
  level: number;
  role: UserRole;
  mutedUntil: string | null;
  warningCount: number;
  banned: boolean;
  bannedReason: string | null;
  reportsAgainst: number;
}

// ── Activity feed ────────────────────────────────────────────────────────────

export const ActivityFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
