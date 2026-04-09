/**
 * TAB (TSCG-Agentic-Bench) Harness Types
 *
 * Core type definitions for the benchmark execution engine.
 * These types define the configuration, execution, and result structures
 * for running TAB evaluations across multiple models and conditions.
 */

// === Scenario & Condition ===

/** TAB evaluation scenarios: A-E are tool-use, GSM8K is math reasoning */
export type Scenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'GSM8K';

/** Experimental conditions: natural baseline, TSCG compressed, TSCG+SAD anchored, natural_text (text-only baseline), tscg_conservative (SDM-only ablation) */
export type Condition = 'natural' | 'natural_text' | 'tscg' | 'tscg_sad' | 'tscg_conservative';

// === Run Configuration ===

export interface RunConfig {
  scenario: Scenario;
  models: ModelConfig[];
  conditions: Condition[];
  runsPerCondition: number;
  outputDir: string;
  checkpoint?: string;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface ModelConfig {
  name: string;
  provider: 'anthropic' | 'openai' | 'ollama' | 'together';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

// === Task Result ===

export interface TaskResult {
  result_id: string;
  task_id: string;
  model: string;
  condition: Condition;
  run: number;
  response: ParsedResponse;
  scores: Scores;
  metrics: RunMetrics;
  timestamp: string;
}

export interface ParsedResponse {
  raw_output: string;
  parsed_tool_call?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  parsed_sequence?: Array<{ name: string; arguments: Record<string, unknown> }>;
  parse_success: boolean;
}

// === Scoring ===

export interface Scores {
  tool_selection_accuracy: number;
  parameter_f1: number;
  overall: number;
  no_tool_correct?: boolean;
  gsm8k_correct?: boolean;
}

// === Metrics ===

export interface RunMetrics {
  input_tokens: number;
  output_tokens: number;
  time_to_first_token_ms?: number;
  total_latency_ms: number;
  cost_usd: number;
}

// === Ground Truth ===

export type GroundTruthType = 'single_tool' | 'multi_tool' | 'no_tool' | 'gsm8k';

export interface GroundTruth {
  type: GroundTruthType;
  /** Expected tool name (single_tool) or undefined */
  tool_name?: string;
  /** Expected parameters (single_tool) */
  parameters?: Record<string, unknown>;
  /** Expected tool sequence (multi_tool) */
  sequence?: Array<{ name: string; parameters?: Record<string, unknown> }>;
  /** Expected numeric answer (gsm8k) */
  answer?: number;
}

// === Benchmark Task (loaded from task definitions) ===

/**
 * A benchmark task in the harness execution format.
 *
 * Note: benchmark/tasks/types.ts defines BenchmarkTask with `query` field.
 * The runner accepts both `user_message` and `query` for compatibility.
 * Use adaptTask() to convert from tasks/types.BenchmarkTask to this format.
 */
export interface BenchmarkTask {
  task_id: string;
  scenario: Scenario;
  /** The user message to send to the model */
  user_message: string;
  ground_truth: GroundTruth;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * Adapt a task from benchmark/tasks/types.ts format to harness format.
 * Maps `query` to `user_message` and normalizes ground truth.
 */
export function adaptTask(task: {
  task_id: string;
  scenario: string;
  query?: string;
  user_message?: string;
  category?: string;
  difficulty?: string;
  ground_truth: {
    tool_name?: string;
    parameters?: Record<string, unknown>;
    sequence?: Array<{ tool_name: string; parameters: Record<string, unknown> }>;
    action?: string;
    answer?: number;
  };
}): BenchmarkTask {
  // Infer ground truth type
  // Priority: gsm8k > no_tool > multi_tool > single_tool
  // GSM8K tasks may have both action='no_tool_call' AND a numeric answer;
  // the answer field takes precedence so scoring checks the math result.
  let type: GroundTruthType = 'single_tool';
  if (task.ground_truth.answer !== undefined) {
    type = 'gsm8k';
  } else if (task.ground_truth.action === 'no_tool_call') {
    type = 'no_tool';
  } else if (task.ground_truth.sequence && task.ground_truth.sequence.length > 0) {
    type = 'multi_tool';
  }

  return {
    task_id: task.task_id,
    scenario: task.scenario as Scenario,
    user_message: task.user_message ?? task.query ?? '',
    category: task.category,
    difficulty: task.difficulty as BenchmarkTask['difficulty'],
    ground_truth: {
      type,
      tool_name: task.ground_truth.tool_name,
      parameters: task.ground_truth.parameters,
      sequence: task.ground_truth.sequence?.map(s => ({
        name: s.tool_name,
        parameters: s.parameters,
      })),
      answer: task.ground_truth.answer,
    },
  };
}

// === Compressed Schema Set ===

export interface CompressedSchemaSet {
  natural: string;
  tscg: string;
  tscg_sad: string;
  tscg_conservative?: string;
}

// === Benchmark Report ===

export interface BenchmarkReport {
  meta: {
    scenario: Scenario;
    models: string[];
    conditions: Condition[];
    runs_per_condition: number;
    total_tasks: number;
    total_api_calls: number;
    start_time: string;
    end_time: string;
    duration_ms: number;
  };
  results: TaskResult[];
  aggregates: AggregateMetrics[];
}

// === Aggregate Metrics ===

export interface AggregateMetrics {
  model: string;
  condition: Condition;
  scenario: Scenario;
  accuracy: { mean: number; ci95: [number, number] };
  tool_selection_accuracy: { mean: number; ci95: [number, number] };
  parameter_f1: { mean: number; ci95: [number, number] };
  arr: number;
  token_savings_pct: number;
  cost_savings_pct: number;
  n_tasks: number;
}

// === LUECKE 2: Thinking models blacklist ===

/**
 * Models that use internal chain-of-thought ("thinking models") are excluded
 * from TAB evaluation. These models produce reasoning traces that interfere
 * with structured tool-call output parsing.
 *
 * See LUECKE 2 documentation for details.
 */
export const THINKING_MODEL_PATTERNS: readonly string[] = [
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'o4-mini',
  'deepseek-r1',
  'deepseek-reasoner',
  'qwq',
] as const;

/**
 * Check if a model identifier matches a known thinking model pattern.
 * Returns the matching pattern if found, or null if the model is allowed.
 */
export function isThinkingModel(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  for (const pattern of THINKING_MODEL_PATTERNS) {
    // Match exact name or name with version suffix (e.g., "o1-2024-12-17")
    if (lower === pattern || lower.startsWith(pattern + '-') || lower.startsWith(pattern + ':')) {
      return pattern;
    }
  }
  return null;
}
