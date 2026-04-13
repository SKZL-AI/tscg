/**
 * @tscg/core — Public API
 *
 * Deterministic prompt compiler for tool-schema compression.
 * Reduces LLM tool-definition overhead by 71.7%.
 * Zero runtime dependencies. <1ms compression time.
 *
 * @packageDocumentation
 */

// === Core Compiler ===
export { TSCGCompiler } from './compiler.js';

// === Convenience Functions ===
export { compress, compressToolSchema, compressBatch } from './compress.js';

// === Types ===
export type {
  // Tool definitions
  ToolDefinition,
  AnthropicToolDefinition,
  AnyToolDefinition,
  JSONSchema,
  JSONSchemaProperty,

  // Options & results
  CompilerOptions,
  CompressedResult,
  CompressionMetrics,
  PerToolMetric,

  // Model targets
  ModelTarget,

  // Tokenizer
  TokenizerProfile,
} from './types.js';

// === Tokenizer Profiles ===
export { getTokenizerProfile, listProfiles } from './profiles.js';

// === Utilities ===
export { estimateTokens, formatSavings } from './utils.js';

// === Re-export individual transforms from engine bridge ===
// These allow advanced users to apply specific TSCG principles directly.
// All 8 paper operators are exported (v1.3.0):
//   SDM, TAS, DRO, CFL, CFO, CAS, SAD, CCP
export {
  applyToolSDM,
  applyToolTAS,
  applyToolDRO,
  applyToolCFL,
  applyToolCFO,
  applyToolCAS,
  applyToolSAD,
  applyToolCCP,
  optimizeToolDefinitions,
} from './_engine.js';

export type {
  ToolParameter,
  ToolDefinition as InternalToolDefinition,
  OptimizedToolDefs,
} from './_engine.js';
