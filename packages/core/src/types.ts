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
  profile?: 'conservative' | 'balanced' | 'aggressive';

  /** Toggle individual TSCG principles (only implemented transforms) */
  principles?: {
    sdm?: boolean;  // Semantic Description Minimization
    cas?: boolean;  // Context-Aware Sorting (U-shape tool ordering)
    dro?: boolean;  // Dense Representation Operators (structural compression)
    tas?: boolean;  // Type Abbreviation System
    sad?: boolean;  // Selective Anchor Duplication (Claude-specific)
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
