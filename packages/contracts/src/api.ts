import { z } from 'zod';
import {
  ContentRatingSchema,
  type CurrencyType,
  type EncounterType,
  ExpeditionTypeSchema,
  type ItemSlot,
  type Rarity,
  type RiskLevel,
  type RewardProfile,
  type StatCategory,
  type StatKey,
  type UserRole,
} from './enums';
import type { StatBlock } from './stats';

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
  token: string;
  user: SessionUser;
}

// ── Character ────────────────────────────────────────────────────────────────

export const UpdateCharacterSchema = z.object({
  bio: z.string().max(500).optional(),
  contentRating: ContentRatingSchema.optional(),
  storyStylePreferences: z.string().max(500).optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;

export interface CharacterView {
  id: string;
  displayName: string;
  bio: string;
  level: number;
  xp: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  currencies: Record<CurrencyType, number>;
  stamina: { current: number; max: number; regenPerHour: number; nextPointInSeconds: number | null };
  stats: StatBlock;
  regionSet: { id: string; name: string; blurb: string };
  contentRating: 'family' | 'pg13' | 'r';
  storyStylePreferences: string;
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
  nextEncounter: EncounterView | null;
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

// ── Inventory actions ────────────────────────────────────────────────────────

export const ItemActionSchema = z.object({
  inventoryItemId: z.string().uuid(),
});
export type ItemActionInput = z.infer<typeof ItemActionSchema>;

export interface InventoryItemView {
  id: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: Rarity;
  quantity: number;
  equipped: boolean;
  statModifiers: Partial<Record<StatKey, number>>;
}

// ── Leaderboards ─────────────────────────────────────────────────────────────

export const LeaderboardTypeSchema = z.enum(['level', 'wealth', 'reputation']);
export type LeaderboardType = z.infer<typeof LeaderboardTypeSchema>;

export interface LeaderboardEntry {
  rank: number;
  characterId: string;
  displayName: string;
  level: number;
  value: number;
}

// ── Guilds ───────────────────────────────────────────────────────────────────

export const CreateGuildSchema = z.object({
  name: z.string().min(3).max(32),
  description: z.string().max(300).optional(),
});
export type CreateGuildInput = z.infer<typeof CreateGuildSchema>;

export interface GuildMemberView {
  characterId: string;
  displayName: string;
  role: 'owner' | 'officer' | 'member';
  level: number;
  joinedAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  description: string;
  ownerCharacterId: string;
  memberCount: number;
  createdAt: string;
  members: GuildMemberView[];
  isMine: boolean;
}

export interface GuildSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export const SendChatSchema = z.object({
  body: z.string().min(1).max(300),
});
export type SendChatInput = z.infer<typeof SendChatSchema>;

export interface ChatMessageView {
  id: string;
  characterId: string;
  displayName: string;
  body: string;
  createdAt: string;
  mine: boolean;
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

export const SendMailSchema = z.object({
  recipientName: z.string().min(1).max(32),
  subject: z.string().max(120).optional(),
  body: z.string().min(1).max(2000),
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
