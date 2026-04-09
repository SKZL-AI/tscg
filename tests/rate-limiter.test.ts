/**
 * Tests for TSCG Rate Limiter
 * Covers: token budget tracking, retry logic, exponential backoff, stats
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';
import type { LLMProvider, ProviderConfig, ProviderResponse } from '../src/core/providers.js';

// === Mock Provider Factory ===

function createMockProvider(responses?: ProviderResponse[]): LLMProvider & { callCount: number } {
  let callIdx = 0;
  const defaultResponse: ProviderResponse = {
    text: 'mock response',
    inputTokens: 50,
    outputTokens: 10,
    latencyMs: 100,
    error: null,
  };
  return {
    name: 'mock',
    rateLimits: { inputTokensPerMinute: 30000, requestsPerMinute: 60 },
    callCount: 0,
    async call() {
      this.callCount++;
      if (responses && callIdx < responses.length) return responses[callIdx++];
      return defaultResponse;
    },
  };
}

const defaultProviderConfig: ProviderConfig = {
  apiKey: 'test-key',
  model: 'test-model',
  maxTokens: 200,
  systemPrompt: 'Test system prompt.',
};

// === Setup ===

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// === Tests ===

describe('RateLimiter', () => {

  describe('basic functionality', () => {
    it('makes a successful call and returns response', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      const resultPromise = limiter.call('short prompt', defaultProviderConfig);
      // Advance timers for any internal sleeps (budget waits, etc.)
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.text).toBe('mock response');
      expect(result.error).toBeNull();
    });

    it('increments totalCalls stat', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      const p1 = limiter.call('prompt one', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p1;

      const p2 = limiter.call('prompt two', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p2;

      expect(limiter.getStats().totalCalls).toBe(2);
    });

    it('returns provider response without modification', async () => {
      const customResponse: ProviderResponse = {
        text: 'custom text',
        inputTokens: 42,
        outputTokens: 7,
        latencyMs: 250,
        error: null,
        statusCode: 200,
      };
      const provider = createMockProvider([customResponse]);
      const limiter = new RateLimiter({ provider, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.text).toBe('custom text');
      expect(result.inputTokens).toBe(42);
      expect(result.outputTokens).toBe(7);
      expect(result.latencyMs).toBe(250);
    });
  });

  describe('token budget tracking', () => {
    it('deducts estimated tokens from budget', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      // Budget = floor(30000 * 0.85) = 25500
      // "a".repeat(400) = 400 chars / 4 = 100 tokens estimated
      const prompt = 'a'.repeat(400);
      const p = limiter.call(prompt, defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p;

      // Provider was called once (budget was sufficient)
      expect(provider.callCount).toBe(1);
    });

    it('waits when budget is insufficient for large prompt', async () => {
      // Use responses with realistic (high) inputTokens so budget adjustment
      // does not give back tokens. Budget = floor(30000 * 0.85) = 25500.
      const bigResponse: ProviderResponse = {
        text: 'big response',
        inputTokens: 25000, // close to estimated, so budget stays depleted
        outputTokens: 10,
        latencyMs: 100,
        error: null,
      };
      const smallResponse: ProviderResponse = {
        text: 'small response',
        inputTokens: 1000,
        outputTokens: 5,
        latencyMs: 50,
        error: null,
      };
      const provider = createMockProvider([bigResponse, smallResponse]);
      const limiter = new RateLimiter({ provider, verbose: false });

      // First call: 100000 chars / 4 = 25000 tokens estimated
      // Budget 25500 >= 25000, so no wait. Deduct: 25500-25000=500
      // After response: +25000-25000=500 (still 500 remaining)
      const bigPrompt = 'x'.repeat(100000);
      const p1 = limiter.call(bigPrompt, defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p1;

      // Second call: 4000 chars / 4 = 1000 tokens
      // Budget is 500 < 1000, so it must wait for window reset
      const p2Promise = limiter.call('y'.repeat(4000), defaultProviderConfig);

      // Advance time by window duration (60 seconds) to trigger reset
      await vi.advanceTimersByTimeAsync(60_000);
      await p2Promise;

      expect(provider.callCount).toBe(2);
      expect(limiter.getStats().totalWaitMs).toBeGreaterThan(0);
    });

    it('resets budget after 60-second window expires', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      // Consume budget
      const bigPrompt = 'x'.repeat(100000); // ~25000 tokens
      const p1 = limiter.call(bigPrompt, defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p1;

      // Advance past the window
      await vi.advanceTimersByTimeAsync(61_000);

      // Now a new call should work without waiting for window reset
      // (the window will be detected as expired and reset)
      const p2 = limiter.call('small prompt', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p2;

      expect(provider.callCount).toBe(2);
    });

    it('uses safety margin (85% of limit by default)', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      // 30000 * 0.85 = 25500 token budget
      // A prompt of exactly 25500 tokens (102000 chars) should fit
      const fitPrompt = 'a'.repeat(25500 * 4); // exactly 25500 tokens
      const p1 = limiter.call(fitPrompt, defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p1;

      expect(provider.callCount).toBe(1);
    });

    it('custom safety margin is respected', async () => {
      const provider = createMockProvider();
      // With safety margin 0.5, budget = floor(30000 * 0.5) = 15000
      const limiter = new RateLimiter({ provider, budgetSafetyMargin: 0.5, verbose: false });

      // 16000 tokens (64000 chars) > 15000 budget -> should wait
      const oversizedPrompt = 'a'.repeat(64000);
      const pPromise = limiter.call(oversizedPrompt, defaultProviderConfig);

      // Advance past the window for the reset
      await vi.advanceTimersByTimeAsync(60_000);
      await pPromise;

      // The wait should have been recorded
      expect(limiter.getStats().totalWaitMs).toBeGreaterThan(0);
    });
  });

  describe('rate limit retry', () => {
    it('retries on 429 status code with exponential backoff', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };
      const successResponse: ProviderResponse = {
        text: 'success after retry',
        inputTokens: 20,
        outputTokens: 5,
        latencyMs: 100,
        error: null,
      };

      const provider = createMockProvider([rateLimitResponse, rateLimitResponse, successResponse]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('hello', defaultProviderConfig);
      // Run all timers to completion (handles backoff sleeps)
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.text).toBe('success after retry');
      expect(provider.callCount).toBe(3);
      expect(limiter.getStats().totalRetries).toBe(2);
    });

    it('retries on error containing "rate"', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'Rate limit exceeded',
      };
      const successResponse: ProviderResponse = {
        text: 'ok now',
        inputTokens: 10,
        outputTokens: 3,
        latencyMs: 80,
        error: null,
      };

      const provider = createMockProvider([rateLimitResponse, successResponse]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.text).toBe('ok now');
      expect(limiter.getStats().totalRetries).toBe(1);
    });

    it('respects retry-after header when present', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
        rateLimitHeaders: {
          retryAfterMs: 5000,
        },
      };
      const successResponse: ProviderResponse = {
        text: 'after retry-after',
        inputTokens: 15,
        outputTokens: 5,
        latencyMs: 90,
        error: null,
      };

      const provider = createMockProvider([rateLimitResponse, successResponse]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.text).toBe('after retry-after');
      // The wait should include the 5000ms retry-after
      expect(limiter.getStats().totalWaitMs).toBeGreaterThanOrEqual(5000);
    });

    it('gives up after maxRetries (default 5)', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };

      // All responses are rate limit errors
      const responses = Array(10).fill(rateLimitResponse);
      const provider = createMockProvider(responses);
      const limiter = new RateLimiter({ provider, maxRetries: 5, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should have tried: 1 initial + 5 retries = 6 calls
      expect(provider.callCount).toBe(6);
      expect(result.error).toContain('429');
    });

    it('increments totalRetries stat on each retry', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };
      const successResponse: ProviderResponse = {
        text: 'ok',
        inputTokens: 10,
        outputTokens: 3,
        latencyMs: 80,
        error: null,
      };

      const provider = createMockProvider([
        rateLimitResponse,
        rateLimitResponse,
        rateLimitResponse,
        successResponse,
      ]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(limiter.getStats().totalRetries).toBe(3);
    });

    it('returns error response after exhausting retries', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'Too many requests',
        statusCode: 429,
      };

      const responses = Array(10).fill(rateLimitResponse);
      const provider = createMockProvider(responses);
      const limiter = new RateLimiter({ provider, maxRetries: 2, baseBackoffMs: 100, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.error).toBeTruthy();
      expect(result.text).toBe('');
    });

    it('uses exponential backoff with increasing delays', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };

      // All fail
      const responses = Array(10).fill(rateLimitResponse);
      const provider = createMockProvider(responses);
      // Seed Math.random for predictable jitter
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const limiter = new RateLimiter({ provider, maxRetries: 3, baseBackoffMs: 1000, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await resultPromise;

      // With random=0: backoff = 1000*2^0+0=1000, 1000*2^1+0=2000, 1000*2^2+0=4000
      // Total wait from backoff alone >= 7000
      const stats = limiter.getStats();
      expect(stats.totalRetries).toBe(3);
      expect(stats.totalWaitMs).toBeGreaterThanOrEqual(7000);
    });
  });

  describe('stats tracking', () => {
    it('getStats returns correct totalCalls count', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      for (let i = 0; i < 3; i++) {
        const p = limiter.call('prompt', defaultProviderConfig);
        await vi.runAllTimersAsync();
        await p;
      }

      expect(limiter.getStats().totalCalls).toBe(3);
    });

    it('getStats returns correct totalRetries count', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };
      const successResponse: ProviderResponse = {
        text: 'ok',
        inputTokens: 10,
        outputTokens: 3,
        latencyMs: 80,
        error: null,
      };

      const provider = createMockProvider([rateLimitResponse, successResponse]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 100, verbose: false });

      const p = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p;

      expect(limiter.getStats().totalRetries).toBe(1);
    });

    it('getStats returns totalWaitMs > 0 when waiting occurred', async () => {
      const rateLimitResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'HTTP 429',
        statusCode: 429,
      };
      const successResponse: ProviderResponse = {
        text: 'ok',
        inputTokens: 10,
        outputTokens: 3,
        latencyMs: 80,
        error: null,
      };

      const provider = createMockProvider([rateLimitResponse, successResponse]);
      const limiter = new RateLimiter({ provider, baseBackoffMs: 1000, verbose: false });

      const p = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p;

      expect(limiter.getStats().totalWaitMs).toBeGreaterThan(0);
    });

    it('getStats returns a copy (not a reference)', async () => {
      const provider = createMockProvider();
      const limiter = new RateLimiter({ provider, verbose: false });

      const p = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      await p;

      const stats1 = limiter.getStats();
      const stats2 = limiter.getStats();
      expect(stats1).toEqual(stats2);
      expect(stats1).not.toBe(stats2); // different object references
    });
  });

  describe('non-rate-limit errors', () => {
    it('does not retry on non-rate-limit errors', async () => {
      const errorResponse: ProviderResponse = {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 50,
        error: 'Invalid API key',
        statusCode: 401,
      };

      const provider = createMockProvider([errorResponse]);
      const limiter = new RateLimiter({ provider, verbose: false });

      const resultPromise = limiter.call('test', defaultProviderConfig);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should not retry -- only 1 call
      expect(provider.callCount).toBe(1);
      expect(result.error).toBe('Invalid API key');
      expect(limiter.getStats().totalRetries).toBe(0);
    });
  });
});
