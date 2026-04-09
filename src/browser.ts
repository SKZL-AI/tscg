/**
 * TSCG Browser Entry Point
 * Browser-safe exports for Chrome Extension and Web App.
 * No Node.js dependencies (no fs, path, process).
 */

// === Core Optimizer (Local, No API) ===
export {
  optimizePrompt,
  batchOptimize,
  DEFAULT_OPTIMIZER_OPTIONS,
} from './optimizer/optimizer.js';

export type {
  OptimizationProfile,
  OptimizerOptions,
  OptimizeResult,
  OptimizeMetrics,
} from './optimizer/optimizer.js';

// === Hybrid Optimizer (Requires API Key) ===
export { optimizePromptHybrid } from './optimizer/optimizer.js';

// === Analyzer ===
export { analyzePrompt } from './optimizer/analyzer.js';

export type {
  PromptType,
  OutputFormat,
  PromptConstraint,
  PromptParameter,
  PromptOperation,
  PromptAnalysis,
} from './optimizer/analyzer.js';

// === Individual Transforms ===
export {
  applySDM,
  applyCFL,
  applyCFO,
  applyDRO,
  applyTAS,
  applyCCP,
  applyCAS,
  applySADF,
  wrapContext,
  compactMultipleChoice,
} from './optimizer/transforms.js';

export type {
  TransformResult,
  TransformPipeline,
} from './optimizer/transforms.js';

// === Report Generators (JSON/Markdown) ===
export {
  toJSON as optimizeResultToJSON,
  toMarkdown as optimizeResultToMarkdown,
} from './optimizer/report.js';

// === API Client (for Hybrid BYOK mode) ===
export { callClaude, estimateTokens } from './core/api.js';
export { compileTscg } from './compiler/compiler.js';

// === Types ===
export type {
  TscgConfig,
  ApiResponse,
  CompilerOptions,
} from './core/types.js';

export { DEFAULT_CONFIG, DEFAULT_COMPILER_OPTIONS } from './core/types.js';

// === Version ===
export const TSCG_VERSION = '0.2.0';
