/**
 * TSCG Provider Abstraction Layer
 * Multi-model LLM provider implementations with unified interface.
 * Each provider makes a single fetch call - no retries. The RateLimiter handles retries.
 */

import type { ProviderName } from './types.js';

// === Interfaces ===

export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  timeoutMs?: number;
}

export interface ProviderRateLimits {
  inputTokensPerMinute: number;
  requestsPerMinute: number;
}

export interface ProviderResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error: string | null;
  statusCode?: number;
  rateLimitHeaders?: {
    retryAfterMs?: number;
    remainingTokens?: number;
    remainingRequests?: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  readonly rateLimits: ProviderRateLimits;
  call(prompt: string, config: ProviderConfig): Promise<ProviderResponse>;
}

// === OpenAI-Compatible Helper ===

/**
 * Shared request/response handler for OpenAI-compatible APIs (OpenAI, Moonshot).
 * Both use the same chat completions format.
 */
async function callOpenAICompatible(
  baseUrl: string,
  prompt: string,
  config: ProviderConfig,
): Promise<ProviderResponse> {
  const t0 = Date.now();
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        // GPT-5+ and o-series models use max_completion_tokens instead of max_tokens
        ...(config.model.startsWith('gpt-5') || config.model.startsWith('o')
          ? { max_completion_tokens: config.maxTokens }
          : { max_tokens: config.maxTokens }),
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs || 30000),
    });

    const latencyMs = Date.now() - t0;
    const data = await res.json() as Record<string, unknown>;

    // Parse rate limit headers
    const rateLimitHeaders: ProviderResponse['rateLimitHeaders'] = {};
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) {
      rateLimitHeaders.retryAfterMs = parseFloat(retryAfter) * 1000;
    }
    const remainingTokens = res.headers.get('x-ratelimit-remaining-tokens');
    if (remainingTokens) {
      rateLimitHeaders.remainingTokens = parseInt(remainingTokens, 10);
    }
    const remainingRequests = res.headers.get('x-ratelimit-remaining-requests');
    if (remainingRequests) {
      rateLimitHeaders.remainingRequests = parseInt(remainingRequests, 10);
    }

    if (!res.ok || data.error) {
      const errObj = data.error as Record<string, string> | undefined;
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        error: errObj?.message || `HTTP ${res.status}`,
        statusCode: res.status,
        rateLimitHeaders,
      };
    }

    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const text = choices?.[0]?.message?.content || '';
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

    return {
      text,
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
      latencyMs,
      error: null,
      statusCode: res.status,
      rateLimitHeaders,
    };
  } catch (e) {
    return {
      text: '',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// === Provider Implementations ===

class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly rateLimits: ProviderRateLimits = {
    inputTokensPerMinute: 30000,
    requestsPerMinute: 60,
  };

  async call(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          system: config.systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(config.timeoutMs || 30000),
      });

      const latencyMs = Date.now() - t0;
      const data = await res.json() as Record<string, unknown>;

      // Parse rate limit headers
      const rateLimitHeaders: ProviderResponse['rateLimitHeaders'] = {};
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        rateLimitHeaders.retryAfterMs = parseFloat(retryAfter) * 1000;
      }
      const remainingTokens = res.headers.get('x-ratelimit-remaining-tokens');
      if (remainingTokens) {
        rateLimitHeaders.remainingTokens = parseInt(remainingTokens, 10);
      }
      const remainingRequests = res.headers.get('x-ratelimit-remaining-requests');
      if (remainingRequests) {
        rateLimitHeaders.remainingRequests = parseInt(remainingRequests, 10);
      }

      if (!res.ok || data.error) {
        const errObj = data.error as Record<string, string> | undefined;
        return {
          text: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          error: errObj?.message || `HTTP ${res.status}`,
          statusCode: res.status,
          rateLimitHeaders,
        };
      }

      const content = data.content as Array<{ text?: string }> | undefined;
      const text = (content || []).map((b) => b.text || '').join('');
      const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;

      return {
        text,
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
        latencyMs,
        error: null,
        statusCode: res.status,
        rateLimitHeaders,
      };
    } catch (e) {
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly rateLimits: ProviderRateLimits = {
    inputTokensPerMinute: 200000,
    requestsPerMinute: 500,
  };

  async call(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    return callOpenAICompatible(
      'https://api.openai.com/v1/chat/completions',
      prompt,
      config,
    );
  }
}

class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly rateLimits: ProviderRateLimits = {
    inputTokensPerMinute: 1000000,
    requestsPerMinute: 15,
  };

  async call(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    const t0 = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: config.systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: config.maxTokens },
        }),
        signal: AbortSignal.timeout(config.timeoutMs || 30000),
      });

      const latencyMs = Date.now() - t0;
      const data = await res.json() as Record<string, unknown>;

      // Parse rate limit headers
      const rateLimitHeaders: ProviderResponse['rateLimitHeaders'] = {};
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        rateLimitHeaders.retryAfterMs = parseFloat(retryAfter) * 1000;
      }

      if (!res.ok || data.error) {
        const errObj = data.error as Record<string, string> | undefined;
        return {
          text: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          error: errObj?.message || `HTTP ${res.status}`,
          statusCode: res.status,
          rateLimitHeaders,
        };
      }

      const candidates = data.candidates as Array<{
        content?: { parts?: Array<{ text?: string }> };
      }> | undefined;
      const text = candidates?.[0]?.content?.parts?.[0]?.text || '';

      const usageMetadata = data.usageMetadata as {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      } | undefined;

      return {
        text,
        inputTokens: usageMetadata?.promptTokenCount || 0,
        outputTokens: usageMetadata?.candidatesTokenCount || 0,
        latencyMs,
        error: null,
        statusCode: res.status,
        rateLimitHeaders,
      };
    } catch (e) {
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

class MoonshotProvider implements LLMProvider {
  readonly name = 'moonshot';
  readonly rateLimits: ProviderRateLimits = {
    inputTokensPerMinute: 100000,
    requestsPerMinute: 60,
  };

  async call(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    return callOpenAICompatible(
      'https://api.moonshot.cn/v1/chat/completions',
      prompt,
      config,
    );
  }
}

// === Factory ===

/**
 * Create an LLM provider instance by name.
 */
export function createProvider(name: ProviderName): LLMProvider {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'moonshot':
      return new MoonshotProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
