/**
 * TSCG - Token-Context Semantic Grammar
 * Public API exports
 */

// Core types
export type {
  TscgAtom,
  AtomType,
  TscgPrompt,
  StrategyName,
  Strategy,
  TestCase,
  TestCategory,
  ApiResponse,
  BenchmarkResult,
  StrategySummary,
  BenchmarkReport,
  CompilerOptions,
  TscgConfig,
  ProviderName,
} from './core/types.js';

export { DEFAULT_COMPILER_OPTIONS, DEFAULT_CONFIG } from './core/types.js';
export { getModelProfile, getModelFamily, MODEL_PROFILES } from './core/types.js';
export type { ModelFamily, ModelProfile } from './core/types.js';

// Compiler
export { compileTscg, batchCompile, applySADF, applyCCP } from './compiler/compiler.js';

// Strategies
export { STRATEGIES, getStrategy, getStrategyNames, applyModelProfile } from './core/strategies.js';

// Statistics
export { wilsonCI, mcnemarExact, cohensH, fmtPct, fmtCI } from './core/statistics.js';

// Providers
export { createProvider } from './core/providers.js';
export type { ProviderConfig, ProviderRateLimits, ProviderResponse, LLMProvider } from './core/providers.js';
export { RateLimiter } from './core/rate-limiter.js';
export type { RateLimiterConfig } from './core/rate-limiter.js';

// API
export { callClaude, estimateTokens, getRateLimiterStats } from './core/api.js';

// Benchmark
export { getAllTests, getTestsByCategory, CORE_TESTS, LONG_CONTEXT_TESTS } from './benchmark/test-cases.js';
export { runBenchmark } from './benchmark/runner.js';

// Optimizer
export { analyzePrompt } from './optimizer/analyzer.js';
export type {
  PromptType,
  OutputFormat,
  PromptConstraint,
  PromptParameter,
  PromptOperation,
  PromptAnalysis,
} from './optimizer/analyzer.js';

export {
  applySDM, applyCFL as applyCFLTransform, applyCFO, applyDRO, applyTAS,
  applyCCP as applyCCPTransform, applyCAS, applySADF as applySADFTransform,
  wrapContext, compactMultipleChoice,
} from './optimizer/transforms.js';
export type { TransformResult, TransformPipeline } from './optimizer/transforms.js';

export {
  optimizePrompt, optimizePromptHybrid, batchOptimize,
  DEFAULT_OPTIMIZER_OPTIONS,
} from './optimizer/optimizer.js';
export type {
  OptimizationProfile,
  OptimizerOptions,
  OptimizeResult,
  OptimizeMetrics,
} from './optimizer/optimizer.js';

export { printReport as printOptimizeReport, toJSON, toMarkdown, printComparison } from './optimizer/report.js';
