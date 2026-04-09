/**
 * TAB Benchmark — Schema Types
 *
 * Type definitions for tool schema collections used across TAB scenarios.
 * These define the input format for task generators and compression pipelines.
 */

import type { ToolDefinition } from '../../packages/core/src/types.js';

// Re-export for convenience
export type { ToolDefinition } from '../../packages/core/src/types.js';
export type { JSONSchema, JSONSchemaProperty } from '../../packages/core/src/types.js';

// ============================================================
// Schema Collection Types
// ============================================================

/** Identifies a TAB scenario */
export type Scenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'GSM8K';

/**
 * A collection of tool schemas for a single TAB scenario or sub-scenario.
 *
 * Each collection represents a set of tools that are presented together
 * to the model during benchmark evaluation (e.g., "Claude Code Tools",
 * "MCP Filesystem Server", "Synthetic 50-tool catalog").
 */
export interface SchemaCollection {
  /** Unique identifier, e.g. "claude-code", "mcp-filesystem", "synthetic-50" */
  id: string;

  /** Human-readable label */
  name: string;

  /** Which TAB scenario this collection belongs to */
  scenario: Scenario;

  /** Source of the schemas */
  source: 'claude-code' | 'mcp' | 'bfcl' | 'synthetic';

  /** The tool definitions in OpenAI function-calling format */
  tools: ToolDefinition[];

  /** Optional metadata */
  metadata?: {
    /** For synthetic collections: the target size */
    targetSize?: number;
    /** For MCP collections: the server name */
    mcpServer?: string;
    /** Random seed used for generation (if synthetic) */
    seed?: number;
    /** Domain distribution (for synthetic catalogs) */
    domains?: string[];
    /** Allow additional source-specific metadata */
    [key: string]: unknown;
  };
}

/**
 * A tool schema in a simplified format for internal processing.
 * Used by task generators to create queries and ground truths.
 */
export interface ToolSchema {
  /** Tool function name */
  name: string;
  /** Tool description */
  description: string;
  /** Parameter definitions */
  parameters: ToolSchemaParameter[];
}

export interface ToolSchemaParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

/**
 * Convert an OpenAI ToolDefinition to our simplified ToolSchema format.
 */
export function toToolSchema(tool: ToolDefinition): ToolSchema {
  const fn = tool.function;
  const props = fn.parameters.properties || {};
  const required = fn.parameters.required || [];

  const parameters: ToolSchemaParameter[] = Object.entries(props).map(
    ([name, prop]) => ({
      name,
      type: prop.type,
      description: prop.description || '',
      required: required.includes(name),
      enum: prop.enum,
      default: prop.default,
    }),
  );

  return {
    name: fn.name,
    description: fn.description,
    parameters,
  };
}

/**
 * Convert all tools in a collection to simplified ToolSchema format.
 */
export function collectionToSchemas(collection: SchemaCollection): ToolSchema[] {
  return collection.tools.map(toToolSchema);
}

// ============================================================
// Baseline Data Types (Phase 3 result imports)
// ============================================================

/** A single accuracy result row from data/accuracy-results.json */
export interface AccuracyResultRow {
  test_id: string;
  category: string;
  name: string;
  condition: string;
  condition_name: string;
  expected: string;
  response: string;
  correct: boolean;
  latency_ms: number;
}

/** Summary statistics for one strategy from tscg-results JSON files */
export interface StrategyResultSummary {
  name: string;
  correct: number;
  total: number;
  accuracy: number;
  ci95: [number, number];
  avgInputTokens: number;
  avgOutputTokens: number;
  avgLatencyMs: number;
  accuracyPerToken: number;
}

/** Metadata from a tscg-results JSON file */
export interface ResultFileMeta {
  model: string;
  timestamp: string;
  totalTests: number;
  totalStrategies: number;
  totalApiCalls: number;
  durationMs: number;
  provider?: string;
}

/** Parsed tscg-results file structure */
export interface TscgResultFile {
  meta: ResultFileMeta;
  summaries: Record<string, StrategyResultSummary>;
  categoryBreakdown?: Record<string, Record<string, { correct: number; total: number }>>;
}

/** Aggregated baseline data from Phase 3 */
export interface BaselineData {
  /** accuracy-results.json: 30 test cases x 4 conditions */
  accuracyResults: AccuracyResultRow[];
  /** Parsed tscg-results files grouped by model */
  modelResults: Record<string, TscgResultFile>;
  /** Number of existing tool definitions from tool-cases.ts */
  existingToolCount: number;
  /** Known-good compression metrics from Phase 3 (70-74%) */
  knownGoodMetrics: {
    compressionRange: [number, number];
    accuracyMaintained: boolean;
    modelsValidated: string[];
  };
}

// ============================================================
// Synthetic Generator Types
// ============================================================

/** Domain definition for synthetic tool generation */
export interface SyntheticDomain {
  name: string;
  prefix: string;
  tools: SyntheticToolTemplate[];
}

/** Template for generating a synthetic tool */
export interface SyntheticToolTemplate {
  baseName: string;
  description: string;
  parameters: ToolSchemaParameter[];
  /** If true, this tool may appear in multiple domains (cross-domain overlap) */
  crossDomain?: boolean;
}
