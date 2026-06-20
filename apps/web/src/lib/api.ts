import type {
  AchievementView,
  ActivityEventView,
  AdminInventoryView,
  AiSettingsView,
  AuthResponse,
  ChatMessageView,
  ChatPageView,
  CharacterView,
  ChatChannel,
  ContentRating,
  CreateReportInput,
  DeathStatusView,
  DirectoryEntry,
  EffectiveStatsView,
  EncounterView,
  EscapeResultView,
  EscapeStatusView,
  ExpeditionView,
  GuildSummary,
  GuildView,
  InventoryView,
  ItemConceptView,
  ItemDefinitionView,
  LeaderboardType,
  LeaderboardView,
  MailView,
  MailboxView,
  MarketListingView,
  ModChatMessageView,
  ModeratedUserView,
  ModerationActionView,
  ModerationStatsView,
  PublicProfileView,
  ReportView,
  ResolutionView,
  SocialView,
  StoryStyleTag,
} from '@unlikelyland/contracts';

/**
 * Thin typed client for the game API. All calls go to same-origin /api/* which
 * Next.js proxies to the backend. The JWT lives in localStorage and is attached
 * as a Bearer token. Errors surface as ApiError with the server's message.
 */

const TOKEN_KEY = 'ul_token';
const REFRESH_KEY = 'ul_refresh';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
/** Persist both halves of a session (access + refresh). */
export function setSession(token: string, refreshToken: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Single in-flight refresh shared across concurrent 401s, so a burst of requests
// triggers only one /auth/refresh.
let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { token: string; refreshToken: string };
        setSession(data.token, data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })();
  }
  const ok = await refreshing;
  refreshing = null;
  return ok;
}

const NO_REFRESH = new Set(['/auth/refresh', '/auth/login', '/auth/register']);

async function req<T>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 204) return null as T;

  // On an expired access token, refresh once and retry transparently.
  if (res.status === 401 && !retried && !NO_REFRESH.has(path)) {
    if (await tryRefresh()) return req<T>(path, opts, true);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = (data && (data.message ?? data.error)) ?? res.statusText;
    const message = Array.isArray(raw) ? raw.join(', ') : String(raw);
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export interface ExpeditionTypeInfo {
  type: ExpeditionView['type'];
  label: string;
  staminaPerStep: number;
  steps: number;
}

export interface ActiveExpedition {
  expedition: ExpeditionView | null;
  encounter: EncounterView | null;
}

export interface StartExpeditionResponse {
  expedition: ExpeditionView;
  encounter: EncounterView;
}

export const api = {
  register: (body: { username: string; password: string; displayName?: string }) =>
    req<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    req<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => req<{ id: string; username: string; role: 'player' | 'moderator' | 'admin' }>('/auth/me'),
  character: () => req<CharacterView>('/characters/me'),
  updateCharacter: (body: { bio?: string; contentRating?: ContentRating; storyStyleTags?: StoryStyleTag[]; title?: string | null }) =>
    req<CharacterView>('/characters/me', { method: 'PATCH', body: JSON.stringify(body) }),
  inventory: () => req<InventoryView>('/characters/me/inventory'),
  effectiveStats: () => req<EffectiveStatsView>('/characters/me/effective-stats'),
  publicProfile: (characterId: string) => req<PublicProfileView>(`/characters/${characterId}/profile`),
  equip: (inventoryItemId: string) =>
    req<CharacterView>('/characters/equip', { method: 'POST', body: JSON.stringify({ inventoryItemId }) }),
  unequip: (inventoryItemId: string) =>
    req<CharacterView>('/characters/unequip', { method: 'POST', body: JSON.stringify({ inventoryItemId }) }),
  useItem: (inventoryItemId: string) =>
    req<CharacterView>('/characters/use', { method: 'POST', body: JSON.stringify({ inventoryItemId }) }),

  leaderboard: (type: LeaderboardType, page = 1, regionSetId?: string) =>
    req<LeaderboardView>(`/leaderboards/${type}?page=${page}${regionSetId ? `&regionSetId=${regionSetId}` : ''}`),
  activityFeed: () => req<ActivityEventView[]>('/achievements/feed'),

  report: (body: CreateReportInput) => req<{ reported: boolean }>('/reports', { method: 'POST', body: JSON.stringify(body) }),

  guilds: {
    list: (q?: string) => req<GuildSummary[]>(`/guilds${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    mine: () => req<GuildView | null>('/guilds/mine'),
    view: (id: string) => req<GuildView>(`/guilds/${id}`),
    create: (body: { name: string; tag?: string; description?: string }) =>
      req<GuildView>('/guilds', { method: 'POST', body: JSON.stringify(body) }),
    update: (body: { description?: string; tag?: string | null }) =>
      req<GuildView>('/guilds/update', { method: 'POST', body: JSON.stringify(body) }),
    join: (id: string) => req<GuildView>(`/guilds/${id}/join`, { method: 'POST' }),
    leave: () => req<{ left: boolean }>('/guilds/leave', { method: 'POST' }),
    promote: (characterId: string) => req<GuildView>('/guilds/promote', { method: 'POST', body: JSON.stringify({ characterId }) }),
    demote: (characterId: string) => req<GuildView>('/guilds/demote', { method: 'POST', body: JSON.stringify({ characterId }) }),
    kick: (characterId: string) => req<GuildView>('/guilds/kick', { method: 'POST', body: JSON.stringify({ characterId }) }),
    transfer: (characterId: string) => req<GuildView>('/guilds/transfer', { method: 'POST', body: JSON.stringify({ characterId }) }),
    deposit: (amount: number) => req<GuildView>('/guilds/bank/deposit', { method: 'POST', body: JSON.stringify({ amount }) }),
    withdraw: (amount: number) => req<GuildView>('/guilds/bank/withdraw', { method: 'POST', body: JSON.stringify({ amount }) }),
  },

  chat: {
    list: (channel: ChatChannel = 'global', before?: string) => {
      const params = new URLSearchParams({ channel });
      if (before) params.set('before', before);
      return req<ChatPageView>(`/chat?${params.toString()}`);
    },
    send: (body: string, channel: ChatChannel = 'global') =>
      req<ChatMessageView>('/chat', { method: 'POST', body: JSON.stringify({ body, channel }) }),
  },

  achievements: () => req<AchievementView[]>('/achievements'),

  market: {
    list: () => req<MarketListingView[]>('/market'),
    mine: () => req<MarketListingView[]>('/market/mine'),
    create: (body: { inventoryItemId: string; priceAmount: number; quantity: number }) =>
      req<MarketListingView>('/market', { method: 'POST', body: JSON.stringify(body) }),
    buy: (listingId: string) => req<MarketListingView>('/market/buy', { method: 'POST', body: JSON.stringify({ listingId }) }),
    cancel: (listingId: string) => req<{ cancelled: boolean }>('/market/cancel', { method: 'POST', body: JSON.stringify({ listingId }) }),
  },

  social: {
    overview: () => req<SocialView>('/social'),
    search: (q: string) => req<DirectoryEntry[]>(`/social/search?q=${encodeURIComponent(q)}`),
    request: (characterId: string) => req<unknown>('/social/request', { method: 'POST', body: JSON.stringify({ characterId }) }),
    accept: (requestId: string) => req<unknown>('/social/accept', { method: 'POST', body: JSON.stringify({ requestId }) }),
    reject: (requestId: string) => req<unknown>('/social/reject', { method: 'POST', body: JSON.stringify({ requestId }) }),
    remove: (characterId: string) => req<unknown>('/social/remove', { method: 'POST', body: JSON.stringify({ characterId }) }),
    block: (characterId: string) => req<unknown>('/social/block', { method: 'POST', body: JSON.stringify({ characterId }) }),
    unblock: (characterId: string) => req<unknown>('/social/unblock', { method: 'POST', body: JSON.stringify({ characterId }) }),
  },

  mail: {
    box: () => req<MailboxView>('/mail'),
    send: (body: { recipientName?: string; recipientCharacterId?: string; subject?: string; body: string }) =>
      req<MailView>('/mail', { method: 'POST', body: JSON.stringify(body) }),
    read: (mailId: string) => req<unknown>('/mail/read', { method: 'POST', body: JSON.stringify({ mailId }) }),
    remove: (mailId: string) => req<unknown>('/mail/delete', { method: 'POST', body: JSON.stringify({ mailId }) }),
  },

  prestige: {
    status: () => req<EscapeStatusView>('/prestige/status'),
    escape: () => req<EscapeResultView>('/prestige/escape', { method: 'POST' }),
  },

  expeditionTypes: () => req<ExpeditionTypeInfo[]>('/expeditions/types'),
  activeExpedition: () => req<ActiveExpedition>('/expeditions/active'),
  startExpedition: (type: string) => req<StartExpeditionResponse>('/expeditions/start', { method: 'POST', body: JSON.stringify({ type }) }),
  goHome: (expeditionId: string) => req<{ expedition: ExpeditionView }>('/expeditions/go-home', { method: 'POST', body: JSON.stringify({ expeditionId }) }),

  currentEncounter: () => req<EncounterView | null>('/encounters/current'),
  resolve: (body: { encounterId: string; choiceId: string; clientRequestId?: string }) =>
    req<ResolutionView>('/encounters/resolve', { method: 'POST', body: JSON.stringify(body) }),

  deathStatus: () => req<DeathStatusView>('/death/status'),
  revive: (method: 'wait' | 'pay' | 'free') => req<DeathStatusView>('/death/revive', { method: 'POST', body: JSON.stringify({ method }) }),

  // Moderator/admin moderation tooling (role-gated server-side).
  moderation: {
    reports: (status?: string) => req<ReportView[]>(`/moderation/reports${status ? `?status=${status}` : ''}`),
    resolveReport: (reportId: string, status: 'actioned' | 'dismissed' | 'reviewing', note?: string) =>
      req<{ resolved: boolean }>('/moderation/reports/resolve', { method: 'POST', body: JSON.stringify({ reportId, status, note }) }),
    hide: (messageId: string, targetType: 'chat' | 'mail' = 'chat') =>
      req<{ ok: boolean }>('/moderation/messages/hide', { method: 'POST', body: JSON.stringify({ messageId, targetType }) }),
    remove: (messageId: string, targetType: 'chat' | 'mail' = 'chat') =>
      req<{ ok: boolean }>('/moderation/messages/delete', { method: 'POST', body: JSON.stringify({ messageId, targetType }) }),
    restore: (messageId: string, targetType: 'chat' | 'mail' = 'chat') =>
      req<{ ok: boolean }>('/moderation/messages/restore', { method: 'POST', body: JSON.stringify({ messageId, targetType }) }),
    mute: (characterId: string, minutes: number, reason?: string) =>
      req<{ ok: boolean }>('/moderation/mute', { method: 'POST', body: JSON.stringify({ characterId, minutes, reason }) }),
    unmute: (characterId: string) => req<{ ok: boolean }>('/moderation/unmute', { method: 'POST', body: JSON.stringify({ characterId }) }),
    warn: (characterId: string, reason: string) =>
      req<{ ok: boolean }>('/moderation/warn', { method: 'POST', body: JSON.stringify({ characterId, reason }) }),
    searchUsers: (q: string) => req<ModeratedUserView[]>(`/moderation/users/search?q=${encodeURIComponent(q)}`),
    audit: () => req<ModerationActionView[]>('/moderation/audit'),
    stats: () => req<ModerationStatsView>('/moderation/stats'),
    chat: () => req<ModChatMessageView[]>('/moderation/chat'),
    ban: (characterId: string, reason: string) =>
      req<{ ok: boolean }>('/moderation/ban', { method: 'POST', body: JSON.stringify({ characterId, reason }) }),
    unban: (characterId: string) => req<{ ok: boolean }>('/moderation/unban', { method: 'POST', body: JSON.stringify({ characterId }) }),
    setRole: (characterId: string, role: 'player' | 'moderator') =>
      req<{ ok: boolean }>('/moderation/role', { method: 'POST', body: JSON.stringify({ characterId, role }) }),
    disbandGuild: (guildId: string, reason?: string) =>
      req<{ ok: boolean }>('/moderation/guild/disband', { method: 'POST', body: JSON.stringify({ guildId, reason }) }),
  },

  admin: {
    aiSettings: () => req<AiSettingsView>('/admin/ai/settings'),
    updateAi: (body: Partial<{ enabled: boolean; forceFallback: boolean; model: string; timeoutMs: number }>) =>
      req<AiSettingsView>('/admin/ai/settings', { method: 'POST', body: JSON.stringify(body) }),
    aiLogs: () => req<Array<Record<string, unknown>>>('/admin/ai/logs'),
    players: () => req<Array<Record<string, unknown>>>('/admin/players'),
    economy: () => req<Array<Record<string, unknown>>>('/admin/economy'),
    items: () => req<ItemDefinitionView[]>('/admin/items'),
    itemConcepts: (status?: string) =>
      req<ItemConceptView[]>(`/admin/item-concepts${status ? `?status=${status}` : ''}`),
    approveConcept: (id: string, edits: { name?: string; description?: string; rarity?: string; slot?: string } = {}) =>
      req<ItemDefinitionView>(`/admin/item-concepts/${id}/approve`, { method: 'POST', body: JSON.stringify(edits) }),
    rejectConcept: (id: string, notes?: string) =>
      req<unknown>(`/admin/item-concepts/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
    characterInventory: (characterId: string) =>
      req<AdminInventoryView>(`/admin/players/${characterId}/inventory`),
  },
};
