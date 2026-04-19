/**
 * @tscg/core — Compress Functions
 *
 * High-level convenience functions for tool-schema compression.
 * These wrap the TSCGCompiler class for one-shot usage.
 */

import { TSCGCompiler } from './compiler.js';
import type {
  AnyToolDefinition,
  CompilerOptions,
  CompressedResult,
  DescriptionOnlyResult,
  ModelTarget,
} from './types.js';

/**
 * Compress a catalog of tool definitions.
 *
 * This is the primary entry point for TSCG compression.
 * It applies all enabled TSCG principles in pipeline order
 * and returns the compressed result with metrics.
 *
 * @param tools   - Array of tool definitions (OpenAI or Anthropic format)
 * @param options - Compression options (model target, profile, principles)
 * @returns Compressed result with metrics
 *
 * @example
 * ```ts
 * import { compress } from '@tscg/core';
 *
 * const tools = [weatherTool, emailTool, calendarTool];
 * const result = compress(tools, { model: 'claude-sonnet', profile: 'balanced' });
 *
 * console.log(result.metrics.tokens.savingsPercent); // ~71%
 * console.log(result.compressed); // Use in system prompt
 * ```
 */
export function compress(
  tools: AnyToolDefinition[],
  options?: CompilerOptions,
): CompressedResult {
  const compiler = new TSCGCompiler(options);
  return compiler.compileMany(tools);
}

/**
 * Compress a single tool schema.
 *
 * Convenience wrapper around `compress()` for single-tool usage.
 *
 * @example
 * ```ts
 * import { compressToolSchema } from '@tscg/core';
 *
 * const result = compressToolSchema(weatherTool, { model: 'claude-sonnet' });
 * console.log(result.metrics.tokens.savingsPercent); // ~65%
 * ```
 */
export function compressToolSchema(
  tool: AnyToolDefinition,
  options?: CompilerOptions,
): CompressedResult {
  const compiler = new TSCGCompiler(options);
  return compiler.compile(tool);
}

/**
 * Compress only the description fields of tool definitions.
 *
 * Preserves JSON tool-calling structure for 100% native API compatibility
 * (OpenAI, Anthropic, MCP, Ollama). Only applies SDM filler stripping
 * to `.description` and parameter `.description` fields.
 *
 * @param tools   - Array of tool definitions (OpenAI or Anthropic format)
 * @param options - Compression options (mode is forced to description-only)
 * @returns Description-only result with tools and metrics
 *
 * @example
 * ```ts
 * import { compressDescriptions } from '@tscg/core';
 *
 * const result = compressDescriptions(mcpTools);
 * // result.tools — same JSON structure, shorter descriptions
 * // result.metrics.descriptions.savingsPercent — e.g. 28%
 * ```
 */
export function compressDescriptions(
  tools: AnyToolDefinition[],
  options?: Omit<CompilerOptions, 'mode'>,
): DescriptionOnlyResult {
  const compiler = new TSCGCompiler(options);
  return compiler.compileDescriptions(tools);
}

/**
 * Batch compression: Compress the same tool catalog for multiple models.
 *
 * Useful for multi-model deployments where different models need
 * different tokenizer-optimized compressions.
 *
 * @param tools  - Array of tool definitions
 * @param models - Array of model targets to compress for
 * @returns Map from model target to compressed result
 *
 * @example
 * ```ts
 * import { compressBatch } from '@tscg/core';
 *
 * const results = compressBatch(tools, ['claude-sonnet', 'gpt-5', 'mistral-7b']);
 *
 * for (const [model, result] of results) {
 *   console.log(`${model}: ${result.metrics.tokens.savingsPercent}%`);
 * }
 * ```
 */
export function compressBatch(
  tools: AnyToolDefinition[],
  models: ModelTarget[],
): Map<ModelTarget, CompressedResult> {
  const results = new Map<ModelTarget, CompressedResult>();
  for (const model of models) {
    results.set(model, compress(tools, { model }));
  }
  return results;
}
