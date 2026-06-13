import { Injectable } from '@nestjs/common';
import type { AiPrompt, AiProvider, AiProviderSettings } from './ai-provider.interface';

/**
 * Ollama-compatible provider. Uses the /api/chat endpoint with `format: 'json'`
 * and `stream: false`, so the model is constrained to emit a single JSON object.
 * A hard timeout via AbortController prevents a hung model from blocking a
 * request — the gateway falls back to seeded content on timeout.
 */
@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';

  async generateJson(prompt: AiPrompt, settings: AiProviderSettings): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          format: 'json',
          options: { temperature: 0.9 },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama responded ${res.status}`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content;
      if (!content) throw new Error('Ollama returned empty content');

      return JSON.parse(content);
    } finally {
      clearTimeout(timer);
    }
  }
}
