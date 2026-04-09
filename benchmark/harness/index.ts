/**
 * TAB (TSCG-Agentic-Bench) Harness
 *
 * Benchmark execution engine for evaluating TSCG compression
 * effectiveness across multiple LLM providers and scenarios.
 *
 * @module benchmark/harness
 */

// Core types
export type {
  Scenario,
  Condition,
  RunConfig,
  ModelConfig,
  TaskResult,
  ParsedResponse,
  Scores,
  RunMetrics,
  GroundTruth,
  GroundTruthType,
  BenchmarkTask,
  CompressedSchemaSet,
  BenchmarkReport,
  AggregateMetrics,
} from './types.js';

export { isThinkingModel, THINKING_MODEL_PATTERNS, adaptTask } from './types.js';

// Runner
export { BenchmarkRunner } from './runner.js';

// Evaluator
export { TABEvaluator } from './evaluator.js';

// Checkpoint
export { CheckpointManager } from './checkpoint.js';

// Aggregation
export { aggregateResults, computeARR } from './aggregate.js';

// Providers
export { createProvider } from './providers/index.js';
export type { ModelProvider, CompletionRequest, CompletionResponse } from './providers/provider.js';

// Reporters
export {
  saveJsonReport,
  saveAggregateJson,
  saveCsvReport,
  saveLatexReport,
  printReport,
  printProgress,
} from './reporters/index.js';
