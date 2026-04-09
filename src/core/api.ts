/**
 * TSCG API Client
 * Routes calls through provider abstraction layer and rate limiter.
 * Maintains backward compatibility with the callClaude() interface.
 */

import { createProvider } from './providers.js';
import { RateLimiter } from './rate-limiter.js';
import type { ApiResponse, TscgConfig } from './types.js';

// Cache rate limiters per provider+key to reuse token budget state
const limiterCache = new Map<string, RateLimiter>();

function getLimiter(config: TscgConfig): RateLimiter {
  const key = `${config.provider}:${config.apiKey}`;
  if (!limiterCache.has(key)) {
    const provider = createProvider(config.provider);
    limiterCache.set(key, new RateLimiter({ provider }));
  }
  return limiterCache.get(key)!;
}

/**
 * Get rate limiter stats for a specific provider+key combination.
 * Returns null if no limiter has been created for that config.
 */
export function getRateLimiterStats(config: TscgConfig): { totalCalls: number; totalRetries: number; totalWaitMs: number } | null {
  const key = `${config.provider}:${config.apiKey}`;
  return limiterCache.get(key)?.getStats() ?? null;
}

/**
 * Call an LLM provider with the given prompt and config.
 * Routes through the provider abstraction layer and rate limiter.
 *
 * Name kept as callClaude for backward compatibility - now supports
 * any provider via config.provider field.
 */
export async function callClaude(
  prompt: string,
  config: TscgConfig,
): Promise<ApiResponse> {
  const limiter = getLimiter(config);
  const response = await limiter.call(prompt, {
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
  });
  return {
    text: response.text,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    latencyMs: response.latencyMs,
    error: response.error,
  };
}

/** Count tokens approximately (rough heuristic, 1 token ~ 4 chars for English) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
