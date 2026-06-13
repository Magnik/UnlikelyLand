import type {
  AiSettingsView,
  AuthResponse,
  CharacterView,
  DeathStatusView,
  EncounterView,
  ExpeditionView,
  ResolutionView,
} from '@unlikelyland/contracts';

/**
 * Thin typed client for the game API. All calls go to same-origin /api/* which
 * Next.js proxies to the backend. The JWT lives in localStorage and is attached
 * as a Bearer token. Errors surface as ApiError with the server's message.
 */

const TOKEN_KEY = 'ul_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 204) return null as T;

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
  updateCharacter: (body: { bio?: string; contentRating?: string; storyStylePreferences?: string }) =>
    req<CharacterView>('/characters/me', { method: 'PATCH', body: JSON.stringify(body) }),
  inventory: () =>
    req<Array<{ id: string; name: string; description: string; slot: string; rarity: string; quantity: number; equipped: boolean }>>('/characters/me/inventory'),

  expeditionTypes: () => req<ExpeditionTypeInfo[]>('/expeditions/types'),
  activeExpedition: () => req<ActiveExpedition>('/expeditions/active'),
  startExpedition: (type: string) => req<StartExpeditionResponse>('/expeditions/start', { method: 'POST', body: JSON.stringify({ type }) }),
  goHome: (expeditionId: string) => req<{ expedition: ExpeditionView }>('/expeditions/go-home', { method: 'POST', body: JSON.stringify({ expeditionId }) }),

  currentEncounter: () => req<EncounterView | null>('/encounters/current'),
  resolve: (body: { encounterId: string; choiceId: string; clientRequestId?: string }) =>
    req<ResolutionView>('/encounters/resolve', { method: 'POST', body: JSON.stringify(body) }),

  deathStatus: () => req<DeathStatusView>('/death/status'),
  revive: (method: 'wait' | 'pay' | 'free') => req<DeathStatusView>('/death/revive', { method: 'POST', body: JSON.stringify({ method }) }),

  admin: {
    aiSettings: () => req<AiSettingsView>('/admin/ai/settings'),
    updateAi: (body: Partial<{ enabled: boolean; forceFallback: boolean; model: string; timeoutMs: number }>) =>
      req<AiSettingsView>('/admin/ai/settings', { method: 'POST', body: JSON.stringify(body) }),
    aiLogs: () => req<Array<Record<string, unknown>>>('/admin/ai/logs'),
    players: () => req<Array<Record<string, unknown>>>('/admin/players'),
    economy: () => req<Array<Record<string, unknown>>>('/admin/economy'),
  },
};
