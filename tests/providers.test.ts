/**
 * Tests for TSCG LLM Provider Adapters
 * Covers: createProvider factory, all 4 provider adapters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProvider } from '../src/core/providers.js';
import type { ProviderConfig, LLMProvider } from '../src/core/providers.js';

// === Shared setup ===

const mockFetch = vi.fn();
const defaultConfig: ProviderConfig = {
  apiKey: 'test-key-123',
  model: 'test-model',
  maxTokens: 200,
  systemPrompt: 'You are a test assistant.',
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// === Factory tests ===

describe('createProvider', () => {
  it('creates AnthropicProvider for "anthropic"', () => {
    const p = createProvider('anthropic');
    expect(p.name).toBe('anthropic');
  });

  it('creates OpenAIProvider for "openai"', () => {
    const p = createProvider('openai');
    expect(p.name).toBe('openai');
  });

  it('creates GeminiProvider for "gemini"', () => {
    const p = createProvider('gemini');
    expect(p.name).toBe('gemini');
  });

  it('creates MoonshotProvider for "moonshot"', () => {
    const p = createProvider('moonshot');
    expect(p.name).toBe('moonshot');
  });

  it('throws on unknown provider name', () => {
    expect(() => createProvider('unknown' as any)).toThrow('Unknown provider');
  });
});

// === Anthropic Provider ===

describe('AnthropicProvider', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createProvider('anthropic');
  });

  it('sends correct headers (x-api-key, anthropic-version, Content-Type)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ text: 'hi' }],
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
    });

    await provider.call('test prompt', defaultConfig);

    expect(mockFetch).toHaveBeenCalledOnce();
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('test-key-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('sends correct body format (model, max_tokens, system, messages)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ text: 'hi' }],
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
    });

    await provider.call('hello world', defaultConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('test-model');
    expect(body.max_tokens).toBe(200);
    expect(body.system).toBe('You are a test assistant.');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello world' }]);
  });

  it('parses successful response (text, tokens)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ text: 'Hello world' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.text).toBe('Hello world');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.error).toBeNull();
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles API error response (data.error.message)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({
        error: { message: 'Invalid request: model not found' },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('Invalid request: model not found');
    expect(result.text).toBe('');
    expect(result.statusCode).toBe(400);
  });

  it('handles network error (fetch throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('Network failure');
    expect(result.text).toBe('');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('extracts rate-limit headers (retry-after, x-ratelimit-remaining-tokens)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'retry-after': '30',
        'x-ratelimit-remaining-tokens': '25000',
        'x-ratelimit-remaining-requests': '55',
      }),
      json: async () => ({
        content: [{ text: 'ok' }],
        usage: { input_tokens: 3, output_tokens: 1 },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.rateLimitHeaders).toBeDefined();
    expect(result.rateLimitHeaders!.retryAfterMs).toBe(30000); // 30s * 1000
    expect(result.rateLimitHeaders!.remainingTokens).toBe(25000);
    expect(result.rateLimitHeaders!.remainingRequests).toBe(55);
  });

  it('has correct rate limits (30000 tokens/min, 60 req/min)', () => {
    expect(provider.rateLimits.inputTokensPerMinute).toBe(30000);
    expect(provider.rateLimits.requestsPerMinute).toBe(60);
  });
});

// === OpenAI Provider ===

describe('OpenAIProvider', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createProvider('openai');
  });

  it('sends correct headers (Authorization: Bearer)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      }),
    });

    await provider.call('test', defaultConfig);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-key-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends correct body (messages with system + user roles)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      }),
    });

    await provider.call('hello', defaultConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'hello' },
    ]);
    expect(body.model).toBe('test-model');
    expect(body.max_tokens).toBe(200);
  });

  it('parses successful response (choices[0].message.content, usage.prompt_tokens)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'The answer is 42' } }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.text).toBe('The answer is 42');
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(8);
    expect(result.error).toBeNull();
  });

  it('handles API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({
        error: { message: 'Incorrect API key provided' },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('Incorrect API key provided');
    expect(result.text).toBe('');
    expect(result.statusCode).toBe(401);
  });

  it('handles network error (fetch throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('Connection refused');
    expect(result.text).toBe('');
  });

  it('has correct rate limits (200000 tokens/min, 500 req/min)', () => {
    expect(provider.rateLimits.inputTokensPerMinute).toBe(200000);
    expect(provider.rateLimits.requestsPerMinute).toBe(500);
  });
});

// === Gemini Provider ===

describe('GeminiProvider', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createProvider('gemini');
  });

  it('sends API key in URL query param', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'hi' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    });

    await provider.call('test', defaultConfig);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('key=test-key-123');
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('test-model');
  });

  it('sends correct body (systemInstruction, contents, generationConfig)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'hi' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    });

    await provider.call('hello gemini', defaultConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a test assistant.' }] });
    expect(body.contents).toEqual([{ parts: [{ text: 'hello gemini' }] }]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 200 });
  });

  it('parses successful response (candidates[0].content.parts[0].text)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini response here' }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 12 },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.text).toBe('Gemini response here');
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(12);
    expect(result.error).toBeNull();
  });

  it('handles API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({
        error: { message: 'API key not valid' },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('API key not valid');
    expect(result.text).toBe('');
  });

  it('handles network error (fetch throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

    const result = await provider.call('prompt', defaultConfig);
    expect(result.error).toBe('DNS resolution failed');
    expect(result.text).toBe('');
  });

  it('has correct rate limits (1000000 tokens/min, 15 req/min)', () => {
    expect(provider.rateLimits.inputTokensPerMinute).toBe(1000000);
    expect(provider.rateLimits.requestsPerMinute).toBe(15);
  });
});

// === Moonshot Provider ===

describe('MoonshotProvider', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createProvider('moonshot');
  });

  it('uses correct base URL (api.moonshot.cn)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      }),
    });

    await provider.call('test', defaultConfig);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('api.moonshot.cn');
  });

  it('uses same format as OpenAI (Bearer auth, messages array)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'moonshot response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    });

    await provider.call('hello moonshot', defaultConfig);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-key-123');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'hello moonshot' },
    ]);
    expect(body.model).toBe('test-model');
  });

  it('parses successful response correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: 'moonshot says hi' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }),
    });

    const result = await provider.call('prompt', defaultConfig);
    expect(result.text).toBe('moonshot says hi');
    expect(result.inputTokens).toBe(8);
    expect(result.outputTokens).toBe(4);
    expect(result.error).toBeNull();
  });

  it('has correct rate limits (100000 tokens/min, 60 req/min)', () => {
    expect(provider.rateLimits.inputTokensPerMinute).toBe(100000);
    expect(provider.rateLimits.requestsPerMinute).toBe(60);
  });
});
