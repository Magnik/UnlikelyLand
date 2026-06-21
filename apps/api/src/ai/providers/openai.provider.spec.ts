import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from './openai.provider';

const cfg = (over: Record<string, unknown> = {}) =>
  ({ ai: { openai: { apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', ...over } } }) as any;

const prompt = { system: 'sys', user: 'usr' };
const settings = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', timeoutMs: 5000 };

afterEach(() => vi.unstubAllGlobals());

describe('OpenAiProvider', () => {
  it('calls chat/completions with auth + json mode and returns the parsed content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"schemaVersion":"encounter.v1","title":"x"}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await new OpenAiProvider(cfg()).generateJson(prompt, settings);

    expect(out).toEqual({ schemaVersion: 'encounter.v1', title: 'x' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('throws when the API key is missing (never silently calls the API)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OpenAiProvider(cfg({ apiKey: '' })).generateJson(prompt, settings)).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response so the gateway can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' }));
    await expect(new OpenAiProvider(cfg()).generateJson(prompt, settings)).rejects.toThrow(/OpenAI responded 401/);
  });

  it('throws on empty content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: {} }] }) }));
    await expect(new OpenAiProvider(cfg()).generateJson(prompt, settings)).rejects.toThrow(/empty content/);
  });
});
