/**
 * TAB Benchmark — Token Counter
 *
 * Provides token counting for benchmark measurement.
 * Uses @tscg/core's estimateTokens() for consistent zero-dependency counting.
 * Also stubs exact counting via tiktoken for optional future integration.
 *
 * All benchmark measurements should use countTokens() for consistency
 * across conditions (natural vs TSCG vs TSCG+SAD).
 */

import { estimateTokens } from '../../packages/core/src/utils.js';
import type { ModelTarget } from '../../packages/core/src/types.js';

// Re-export ModelTarget for convenience
export type { ModelTarget } from '../../packages/core/src/types.js';

// ============================================================
// Primary Token Counter
// ============================================================

/**
 * Count tokens in a text string using @tscg/core's estimation.
 *
 * This is the standard token counter for all TAB benchmark measurements.
 * Uses model-specific character-to-token ratios (±5% for text, ±10% for code/JSON).
 *
 * @param text  - Text to count tokens for
 * @param model - Target model for ratio selection (default: 'auto')
 * @returns Estimated token count
 *
 * @example
 * ```ts
 * const natural = countTokens(naturalSchema);  // e.g. 1250
 * const tscg = countTokens(tscgSchema);        // e.g. 356
 * const savings = 1 - tscg / natural;          // 0.715 (71.5%)
 * ```
 */
export function countTokens(text: string, model?: ModelTarget): number {
  if (text.length === 0) return 0;
  return estimateTokens(text, model || 'auto');
}

// ============================================================
// Exact Token Counter (Stub)
// ============================================================

/**
 * Count tokens exactly using tiktoken.
 *
 * STUB: This function is not yet implemented. When implemented, it will
 * use the tiktoken library for exact BPE token counts per model.
 *
 * For now, it falls back to the estimation method.
 *
 * @param text  - Text to count tokens for
 * @param model - Model identifier (e.g., 'gpt-4', 'claude-sonnet')
 * @returns Promise resolving to exact token count
 *
 * @example
 * ```ts
 * const exact = await countTokensExact(schema, 'gpt-4');
 * ```
 */
export async function countTokensExact(
  text: string,
  model: string,
): Promise<number> {
  // TODO: Implement tiktoken integration
  // When implemented:
  //   1. Import tiktoken: import { encoding_for_model } from 'tiktoken';
  //   2. Get encoder for model
  //   3. Return encoder.encode(text).length
  //
  // For now, fall back to estimation
  const modelTarget = mapToModelTarget(model);
  return countTokens(text, modelTarget);
}

// ============================================================
// Batch Token Counter
// ============================================================

/**
 * Count tokens for multiple texts efficiently.
 *
 * @param texts - Array of text strings
 * @param model - Target model
 * @returns Array of token counts (same order as input)
 */
export function countTokensBatch(
  texts: string[],
  model?: ModelTarget,
): number[] {
  return texts.map((text) => countTokens(text, model));
}

/**
 * Count total tokens across multiple texts.
 *
 * @param texts - Array of text strings
 * @param model - Target model
 * @returns Total token count
 */
export function countTokensTotal(
  texts: string[],
  model?: ModelTarget,
): number {
  return texts.reduce((sum, text) => sum + countTokens(text, model), 0);
}

// ============================================================
// Utility
// ============================================================

/**
 * Map a model string (e.g., 'gpt-4', 'claude-3-sonnet') to
 * the ModelTarget enum used by @tscg/core.
 */
function mapToModelTarget(model: string): ModelTarget {
  const lower = model.toLowerCase();

  if (lower.includes('claude') && lower.includes('sonnet')) return 'claude-sonnet';
  if (lower.includes('claude') && lower.includes('opus')) return 'claude-opus';
  if (lower.includes('claude') && lower.includes('haiku')) return 'claude-haiku';
  if (lower.includes('gpt-5')) return 'gpt-5';
  if (lower.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (lower.includes('gpt-4')) return 'gpt-4';
  if (lower.includes('llama') && lower.includes('3.2')) return 'llama-3.2';
  if (lower.includes('llama') && lower.includes('3.1')) return 'llama-3.1';
  if (lower.includes('mistral') && lower.includes('large')) return 'mistral-large';
  if (lower.includes('mistral')) return 'mistral-7b';
  if (lower.includes('gemma')) return 'gemma-3';
  if (lower.includes('phi')) return 'phi-4';
  if (lower.includes('qwen')) return 'qwen-3';
  if (lower.includes('deepseek')) return 'deepseek-v3';

  return 'auto';
}
