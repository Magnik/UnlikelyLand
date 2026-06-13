/**
 * Provider adapter boundary. The gateway only knows this interface, so the AI
 * backend is swappable: local Ollama now, VPS Ollama or a hosted API later, by
 * adding another implementation. Providers return raw parsed JSON; they never
 * validate game rules — that is the gateway's job.
 */

export interface AiProviderSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface AiPrompt {
  system: string;
  user: string;
}

export interface AiProvider {
  readonly name: string;
  /**
   * Send the prompt and return the parsed JSON object the model produced.
   * Throws on transport error, timeout, or non-JSON output.
   */
  generateJson(prompt: AiPrompt, settings: AiProviderSettings): Promise<unknown>;
}
