import { Injectable, Logger } from '@nestjs/common';
import {
  safeParseEncounter,
  type AiSettingsView,
  type ContentRating,
  type Encounter,
  type EncounterType,
} from '@unlikelyland/contracts';
import { AppConfig } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { FallbackService } from './fallback.service';
import { OllamaProvider } from './providers/ollama.provider';
import { buildEncounterPrompt, type GenerationContext } from './prompt';
import { moderateEncounter } from './moderation';

const SETTINGS_ID = 'singleton';
const MAX_AI_ATTEMPTS = 2;

export interface EncounterGenerationContext extends GenerationContext {
  characterId: string;
  fallbackPool: EncounterType;
  seedParts: (string | number)[];
}

/**
 * The AI gateway is the ONLY bridge between game logic and the model. It owns:
 *  - runtime settings (enabled / forceFallback / model) stored in AiSettings,
 *  - generation with strict schema validation + moderation + one retry,
 *  - guaranteed fallback to seeded content on any failure or when disabled,
 *  - an audit log row per attempt.
 * Game rules never call the provider directly, and AI output is always proposal
 * data — validated and moderated here before it can be persisted or shown.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly provider: OllamaProvider,
    private readonly fallback: FallbackService,
  ) {}

  /** Lazily create the singleton settings row from env defaults. */
  private async ensureSettings() {
    const existing = await this.prisma.aiSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.prisma.aiSettings.create({
      data: {
        id: SETTINGS_ID,
        enabled: this.config.ai.enabled,
        forceFallback: false,
        baseUrl: this.config.ai.baseUrl,
        model: this.config.ai.model,
        timeoutMs: this.config.ai.timeoutMs,
      },
    });
  }

  async getSettingsView(): Promise<AiSettingsView> {
    const s = await this.ensureSettings();
    return {
      enabled: s.enabled,
      forceFallback: s.forceFallback,
      baseUrl: s.baseUrl,
      model: s.model,
      timeoutMs: s.timeoutMs,
      effectivelyOn: s.enabled && !s.forceFallback,
    };
  }

  async updateSettings(patch: Partial<{
    enabled: boolean;
    forceFallback: boolean;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  }>): Promise<AiSettingsView> {
    await this.ensureSettings();
    await this.prisma.aiSettings.update({ where: { id: SETTINGS_ID }, data: patch });
    return this.getSettingsView();
  }

  /**
   * Produce a validated encounter, preferring AI but always succeeding. Returns
   * the encounter plus its source so callers can record provenance.
   */
  async generateEncounter(
    ctx: EncounterGenerationContext,
  ): Promise<{ encounter: Encounter; source: 'ai' | 'fallback' }> {
    const settings = await this.ensureSettings();
    const effectivelyOn = settings.enabled && !settings.forceFallback;

    if (effectivelyOn) {
      const aiEncounter = await this.tryGenerateViaAi(ctx, settings);
      if (aiEncounter) return { encounter: aiEncounter, source: 'ai' };
    }

    // Fallback path — guaranteed playable content.
    const encounter = this.fallback.pick(ctx.fallbackPool, ...ctx.seedParts);
    await this.log(ctx.characterId, settings, 'fallback', 0, null, null);
    return { encounter, source: 'fallback' };
  }

  private async tryGenerateViaAi(
    ctx: EncounterGenerationContext,
    settings: { baseUrl: string; model: string; timeoutMs: number },
  ): Promise<Encounter | null> {
    const prompt = buildEncounterPrompt(ctx);

    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const raw = await this.provider.generateJson(prompt, settings);
        const latency = Date.now() - started;

        const parsed = safeParseEncounter(raw);
        if (!parsed.success) {
          await this.log(ctx.characterId, settings, 'invalid_schema', latency, parsed.error.message, raw);
          continue;
        }

        const moderation = moderateEncounter(parsed.data, ctx.contentRating as ContentRating);
        if (!moderation.safe) {
          await this.log(ctx.characterId, settings, 'unsafe', latency, moderation.reason ?? 'unsafe', raw);
          continue;
        }

        await this.log(ctx.characterId, settings, 'ok', latency, null, raw);
        return parsed.data;
      } catch (err) {
        const latency = Date.now() - started;
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        await this.log(
          ctx.characterId,
          settings,
          isTimeout ? 'timeout' : 'error',
          latency,
          err instanceof Error ? err.message : 'unknown error',
          null,
        );
        // On a transport/timeout error, stop retrying and fall back fast.
        break;
      }
    }
    return null;
  }

  private async log(
    characterId: string | null,
    settings: { model: string },
    outcome: string,
    latencyMs: number,
    validationError: string | null,
    raw: unknown,
  ): Promise<void> {
    try {
      await this.prisma.aiGenerationLog.create({
        data: {
          characterId: characterId ?? undefined,
          kind: 'encounter',
          provider: this.provider.name,
          model: settings.model,
          latencyMs,
          outcome,
          validationError: validationError ?? undefined,
          // Store raw only in non-production to avoid unbounded log growth / leakage.
          rawResponse: this.config.isProd || raw == null ? undefined : JSON.stringify(raw).slice(0, 8000),
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to write AiGenerationLog: ${(e as Error).message}`);
    }
  }
}
