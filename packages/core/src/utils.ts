/**
 * @tscg/core — Utility Functions
 *
 * Zero-dependency utilities for token estimation and result formatting.
 */

import type { ModelTarget, CompressionMetrics } from './types.js';
import { getTokenizerProfile } from './profiles.js';

// ============================================================
// Content Type Detection
// ============================================================

type ContentType = 'text' | 'code';

/**
 * Detect whether content is primarily code/JSON or natural text.
 * Used to select the appropriate chars-per-token ratio.
 */
function detectContentType(text: string): ContentType {
  // Heuristic: if >30% of chars are JSON/code indicators, treat as code
  const codeChars = (text.match(/[{}[\]:,"]/g) || []).length;
  const ratio = codeChars / text.length;
  return ratio > 0.15 ? 'code' : 'text';
}

// ============================================================
// Token Estimation
// ============================================================

/**
 * Estimate token count for a text string.
 *
 * Uses empirically-derived character-to-token ratios per model family.
 * Accuracy: +/-5% for English text, +/-10% for code/JSON.
 *
 * Zero dependencies -- no tokenizer library required.
 *
 * @param text  - The text to estimate tokens for
 * @param model - Target model (affects ratio). Defaults to 'auto'.
 * @returns Estimated token count
 *
 * @example
 * ```ts
 * import { estimateTokens } from '@tscg/core';
 *
 * const tokens = estimateTokens('Hello, world!', 'claude-sonnet');
 * console.log(tokens); // 4
 * ```
 */
export function estimateTokens(text: string, model: ModelTarget = 'auto'): number {
  if (text.length === 0) return 0;

  const profile = getTokenizerProfile(model);
  const contentType = detectContentType(text);
  const ratio = contentType === 'code' ? profile.charsPerTokenCode : profile.charsPerToken;

  return Math.ceil(text.length / ratio);
}

// ============================================================
// Formatting
// ============================================================

/**
 * Format compression metrics as a human-readable string.
 *
 * @example
 * ```ts
 * const result = compress(tools);
 * console.log(formatSavings(result.metrics));
 * // "1,240 -> 352 tokens (-71.6%, saved 888 tokens) in 0.3ms"
 * ```
 */
export function formatSavings(metrics: CompressionMetrics): string {
  const { tokens, compressionTimeMs } = metrics;
  const origFmt = tokens.original.toLocaleString('en-US');
  const compFmt = tokens.compressed.toLocaleString('en-US');
  const savedFmt = tokens.savings.toLocaleString('en-US');
  const pctFmt = tokens.savingsPercent.toFixed(1);
  const timeFmt = compressionTimeMs.toFixed(1);

  return `${origFmt} -> ${compFmt} tokens (-${pctFmt}%, saved ${savedFmt} tokens) in ${timeFmt}ms`;
}
