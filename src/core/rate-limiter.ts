/**
 * TSCG Rate Limiter
 * Token budget tracking with exponential backoff and retry logic.
 * Wraps an LLMProvider and handles rate limiting transparently.
 */

import type { LLMProvider, ProviderConfig, ProviderResponse } from './providers.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// === Types ===

export interface RateLimiterConfig {
  provider: LLMProvider;
  maxRetries?: number;        // default 5
  baseBackoffMs?: number;     // default 2000
  maxBackoffMs?: number;      // default 120000
  budgetSafetyMargin?: number; // default 0.85
  verbose?: boolean;          // default true, print wait messages
}

export interface RateLimiterStats {
  totalCalls: number;
  totalRetries: number;
  totalWaitMs: number;
}

// === Rate Limiter ===

export class RateLimiter {
  private readonly provider: LLMProvider;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly budgetSafetyMargin: number;
  private readonly verbose: boolean;

  // Token budget tracking
  private tokenBudget: number;
  private windowStartMs: number;
  private readonly windowDurationMs = 60_000; // 1 minute

  private stats: RateLimiterStats = {
    totalCalls: 0,
    totalRetries: 0,
    totalWaitMs: 0,
  };

  constructor(config: RateLimiterConfig) {
    this.provider = config.provider;
    this.maxRetries = config.maxRetries ?? 5;
    this.baseBackoffMs = config.baseBackoffMs ?? 2000;
    this.maxBackoffMs = config.maxBackoffMs ?? 120000;
    this.budgetSafetyMargin = config.budgetSafetyMargin ?? 0.85;
    this.verbose = config.verbose ?? true;

    this.tokenBudget = Math.floor(
      this.provider.rateLimits.inputTokensPerMinute * this.budgetSafetyMargin,
    );
    this.windowStartMs = Date.now();
  }

  /**
   * Execute a call with token budget tracking and retry logic.
   *
   * Algorithm:
   * 1. Estimate tokens from prompt length
   * 2. Check/reset 60-second window
   * 3. If budget insufficient, sleep until window resets
   * 4. Deduct estimated tokens
   * 5. Call provider
   * 6. Adjust budget with actual token counts
   * 7. On rate limit error, exponential backoff with jitter + retry
   */
  async call(prompt: string, config: ProviderConfig): Promise<ProviderResponse> {
    // Step 1: Estimate tokens
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // Step 2: Check if window expired, reset if so
    this.maybeResetWindow();

    // Step 3: If estimated tokens > remaining budget, wait for window reset
    if (estimatedTokens > this.tokenBudget) {
      const elapsed = Date.now() - this.windowStartMs;
      const sleepMs = Math.max(0, this.windowDurationMs - elapsed);
      if (sleepMs > 0) {
        if (this.verbose && sleepMs > 5000) {
          console.log(`  \u23f3 Rate limit: waiting ${(sleepMs / 1000).toFixed(1)}s...`);
        }
        this.stats.totalWaitMs += sleepMs;
        await sleep(sleepMs);
      }
      // Reset after waiting
      this.resetWindow();
    }

    // Step 4: Deduct estimated tokens from budget
    this.tokenBudget -= estimatedTokens;

    this.stats.totalCalls++;

    // Retry loop
    let lastResponse: ProviderResponse | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        this.stats.totalRetries++;
      }

      // Step 5: Call provider
      const response = await this.provider.call(prompt, config);
      lastResponse = response;

      // Step 6: Adjust budget with actual token counts
      if (response.inputTokens > 0) {
        // Add back the estimate, deduct the actual
        this.tokenBudget += estimatedTokens;
        this.tokenBudget -= response.inputTokens;
      }

      // Step 7: Check for rate limit error
      if (this.isRateLimitError(response)) {
        if (attempt >= this.maxRetries) {
          // Exhausted retries, return last response
          break;
        }

        // Calculate backoff with jitter
        let backoffMs: number;

        if (response.rateLimitHeaders?.retryAfterMs && response.rateLimitHeaders.retryAfterMs > 0) {
          // Use server-provided retry-after
          backoffMs = response.rateLimitHeaders.retryAfterMs;
        } else {
          // Exponential backoff with jitter:
          // min(baseBackoffMs * 2^attempt + random(0, baseBackoffMs), maxBackoffMs)
          const jitter = Math.random() * this.baseBackoffMs;
          backoffMs = Math.min(
            this.baseBackoffMs * Math.pow(2, attempt) + jitter,
            this.maxBackoffMs,
          );
        }

        if (this.verbose && backoffMs > 5000) {
          console.log(`  \u23f3 Rate limit: waiting ${(backoffMs / 1000).toFixed(1)}s...`);
        }

        this.stats.totalWaitMs += backoffMs;
        await sleep(backoffMs);

        // Reset token budget window after rate limit
        this.resetWindow();
        continue;
      }

      // Success (or non-rate-limit error)
      return response;
    }

    // Exhausted retries - return last response
    return lastResponse || {
      text: '',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      error: 'Exhausted retries',
    };
  }

  getStats(): RateLimiterStats {
    return { ...this.stats };
  }

  /** Check if the 60-second window has expired and reset if so */
  private maybeResetWindow(): void {
    const now = Date.now();
    if (now - this.windowStartMs >= this.windowDurationMs) {
      this.resetWindow();
    }
  }

  /** Reset the token budget window */
  private resetWindow(): void {
    this.tokenBudget = Math.floor(
      this.provider.rateLimits.inputTokensPerMinute * this.budgetSafetyMargin,
    );
    this.windowStartMs = Date.now();
  }

  /** Check if a response indicates a rate limit error */
  private isRateLimitError(response: ProviderResponse): boolean {
    if (response.statusCode === 429) return true;
    if (response.error && /rate/i.test(response.error)) return true;
    return false;
  }
}
