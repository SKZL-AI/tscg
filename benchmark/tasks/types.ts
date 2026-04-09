/**
 * TAB Benchmark — Task Type Definitions
 *
 * Defines the structure of benchmark tasks, ground truths, and metadata
 * for all TAB scenarios (A through E + GSM8K).
 */

// ============================================================
// Core Enums
// ============================================================

export type TaskCategory =
  | 'single_tool'
  | 'multi_tool'
  | 'parameter_extraction'
  | 'no_tool';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Scenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'GSM8K';

// ============================================================
// Benchmark Task
// ============================================================

/**
 * A single benchmark task in the TAB suite.
 *
 * Each task represents a user query paired with a set of available tools
 * and a ground truth answer (which tool to call, with what parameters).
 */
export interface BenchmarkTask {
  /** Unique task identifier, e.g. "tab-A-ts-001" */
  task_id: string;

  /** Which TAB scenario this task belongs to */
  scenario: Scenario;

  /** Task category determines the evaluation method */
  category: TaskCategory;

  /** Difficulty level affects scoring expectations */
  difficulty: Difficulty;

  /** Origin of the task data */
  source: string;

  /** Natural language user request */
  query: string;

  /** Tool names available in this task (the model sees these schemas) */
  tools: string[];

  /** Expected correct response */
  ground_truth: GroundTruth;

  /** Task-level metadata for analysis */
  metadata: TaskMetadata;
}

// ============================================================
// Ground Truth
// ============================================================

/**
 * Ground truth for a benchmark task.
 *
 * Exactly ONE of the following patterns applies:
 * - single_tool:           tool_name + parameters
 * - multi_tool:            sequence[]
 * - parameter_extraction:  tool_name + parameters (complex params)
 * - no_tool:               action = 'no_tool_call'
 * - GSM8K:                 answer (numeric)
 */
export interface GroundTruth {
  /** For single_tool and parameter_extraction: the correct tool name */
  tool_name?: string;

  /** For single_tool and parameter_extraction: expected parameters */
  parameters?: Record<string, unknown>;

  /** For multi_tool: ordered sequence of tool calls */
  sequence?: ToolCallSequence[];

  /** For no_tool: indicates no tool should be called */
  action?: 'no_tool_call';

  /** For GSM8K: the numeric answer */
  answer?: number;
}

/**
 * A single step in a multi-tool call sequence.
 */
export interface ToolCallSequence {
  tool_name: string;
  parameters: Record<string, unknown>;
}

// ============================================================
// Task Metadata
// ============================================================

/**
 * Metadata attached to each task for analysis and filtering.
 */
export interface TaskMetadata {
  /** Number of tools available in this task */
  num_tools: number;

  /** Token count of schemas in natural (uncompressed) format */
  schema_tokens_natural?: number;

  /** Token count of schemas after TSCG compression */
  schema_tokens_tscg?: number;

  /** Compression ratio: 1 - (tscg_tokens / natural_tokens) */
  compression_ratio?: number;

  /** For GSM8K: number of tools in the schema load */
  schema_load_tools?: number;

  /** Reference to original source (e.g. BFCL task ID) */
  source_reference?: string;
}
