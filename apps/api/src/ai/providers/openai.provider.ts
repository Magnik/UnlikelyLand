import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../common/config';
import type { AiPrompt, AiProvider, AiProviderSettings } from './ai-provider.interface';

/**
 * OpenAI-compatible provider (Chat Completions). Uses JSON mode
 * (`response_format: { type: 'json_object' }`) so the model is constrained to emit a
 * single JSON object — the gateway still validates it against encounter.v1 and
 * moderates it; this provider, like Ollama's, only returns raw parsed JSON and never
 * decides game outcomes. The API key is read from the environment (never committed),
 * and a hard AbortController timeout lets the gateway fall back to seeded content if
 * the API hangs. Works with api.openai.com or any OpenAI-compatible base URL.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(private readonly config: AppConfig) {}

  async generateJson(prompt: AiPrompt, settings: AiProviderSettings): Promise<unknown> {
    const apiKey = this.config.ai.openai.apiKey;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.9,
          // Requires the word "json" in the prompt — the system prompt already asks
          // for "a single JSON object".
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      });

      if (!res.ok) {
        // Include a short slice of the body for debugging (e.g. invalid key, model).
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenAI responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned empty content');

      return JSON.parse(content);
    } finally {
      clearTimeout(timer);
    }
  }
}
