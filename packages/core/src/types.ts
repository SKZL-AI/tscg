/**
 * @tscg/core — Type Definitions
 *
 * These types define the public API surface for @tscg/core.
 * They are designed for the npm package consumer and abstract
 * over the internal TSCG implementation in ../../src/.
 */

// ============================================================
// Tool Definition Types (OpenAI + Anthropic formats)
// ============================================================

/** JSON Schema subset used in tool parameter definitions */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** A tool in OpenAI Function-Calling format */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/** A tool in Anthropic format */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** Union of all supported tool definition formats */
export type AnyToolDefinition = ToolDefinition | AnthropicToolDefinition;

// ============================================================
// Model Targets
// ============================================================

export type ModelTarget =
  | 'claude-sonnet'
  | 'claude-opus'
  | 'claude-haiku'
  | 'gpt-4'
  | 'gpt-5'
  | 'gpt-4o-mini'
  | 'llama-3.1'
  | 'llama-3.2'
  | 'mistral-7b'
  | 'mistral-large'
  | 'gemma-3'
  | 'phi-4'
  | 'qwen-3'
  | 'deepseek-v3'
  | 'auto';

// ============================================================
// Compiler Options
// ============================================================

export interface CompilerOptions {
  /** Target model for tokenizer-specific optimization */
  model?: ModelTarget;

  /** Compression aggressiveness */
  profile?: 'conservative' | 'balanced' | 'aggressive' | 'auto';

  /** Toggle individual TSCG principles. All 8 paper operators are implemented. */
  principles?: {
    sdm?: boolean;  // Semantic Density Maximization (strip filler)
    cas?: boolean;  // Causal Access Score (U-shape frequency reorder)
    cfo?: boolean;  // Causal-Forward Ordering (read → transform → write)
    dro?: boolean;  // Delimiter-Role Optimization (compact params)
    tas?: boolean;  // Tokenizer-Aligned Syntax (BPE delimiters)
    cfl?: boolean;  // Constraint-First Layout (Claude-only; [ANSWER:...] prepend)
    sad?: boolean;  // Selective Anchor Duplication (Claude-only; [ANCHOR:...] append)
    ccp?: boolean;  // Causal Closure Principle ([CLOSURE:tool(req)...] append)
  };

  /** Output format for compressed result */
  outputFormat?: 'json' | 'yaml-like' | 'compact';

  /** Preserve tool names unchanged (for compatibility) */
  preserveToolNames?: boolean;
}

// ============================================================
// Compression Results
// ============================================================

export interface CompressedResult {
  /** Compressed tool definitions as a string */
  compressed: string;

  /** Compressed tools as structured objects (when available) */
  tools?: AnyToolDefinition[];

  /** Compression metrics */
  metrics: CompressionMetrics;

  /** Which TSCG principles were applied */
  appliedPrinciples: string[];
}

export interface CompressionMetrics {
  /** Token counts */
  tokens: {
    original: number;
    compressed: number;
    savings: number;
    savingsPercent: number;
  };

  /** Character counts (less accurate but fast) */
  characters: {
    original: number;
    compressed: number;
  };

  /** Per-tool breakdown */
  perTool: PerToolMetric[];

  /** Time spent compressing (ms) */
  compressionTimeMs: number;
}

export interface PerToolMetric {
  name: string;
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
}

// ============================================================
// Compilation Mode (description-only vs full)
// ============================================================

/** Compilation mode: 'full' for complete TSCG, 'description-only' for JSON-preserving */
export type CompilationMode = 'full' | 'description-only';

/** Result of description-only compression */
export interface DescriptionOnlyResult {
  /** Tools with compressed descriptions (JSON structure preserved) */
  tools: AnyToolDefinition[];
  /** Compression metrics specific to description-only mode */
  metrics: DescriptionOnlyMetrics;
  /** Which TSCG principles were applied */
  appliedPrinciples: string[];
}

export interface DescriptionOnlyMetrics {
  /** Description-level token savings */
  descriptions: {
    originalTokens: number;
    compressedTokens: number;
    savings: number;
    savingsPercent: number;
  };
  /** Total schema token impact (descriptions + JSON overhead) */
  totalSchema: {
    originalTokens: number;
    compressedTokens: number;
    savings: number;
    savingsPercent: number;
  };
  /** Per-tool breakdown */
  perTool: PerToolDescriptionMetric[];
  /** Compression time in ms */
  compressionTimeMs: number;
}

export interface PerToolDescriptionMetric {
  name: string;
  originalDescriptionTokens: number;
  compressedDescriptionTokens: number;
  savingsPercent: number;
  paramDescriptionsCompressed: number;
}

// ============================================================
// Tokenizer Profile
// ============================================================

export interface TokenizerProfile {
  /** Model target this profile is for */
  model: ModelTarget;

  /** Average characters per token for this model */
  charsPerToken: number;

  /** Characters per token for code/JSON content */
  charsPerTokenCode: number;

  /** BPE-optimal delimiter characters */
  delimiters: {
    arrow: string;
    pipe: string;
    dot: string;
  };
}
