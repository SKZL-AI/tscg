/**
 * @tscg/core — TSCGCompiler
 *
 * The main compiler class that orchestrates TSCG compression principles.
 * Uses the TSCG transform engine (_engine.ts) which mirrors the algorithms
 * from the existing src/optimizer/transforms-tools.ts.
 *
 * The _engine.ts module contains the same deterministic, pure transforms
 * (SDM, DRO, CAS, TAS) that power the main TSCG pipeline.
 */

import type {
  AnyToolDefinition,
  ToolDefinition,
  AnthropicToolDefinition,
  CompilerOptions,
  CompressedResult,
  CompressionMetrics,
  PerToolMetric,
  ModelTarget,
} from './types.js';
import { estimateTokens } from './utils.js';

// Import transforms from the local engine bridge
import {
  optimizeToolDefinitions,
  type ToolDefinition as InternalToolDef,
  type ToolParameter as InternalToolParam,
} from './_engine.js';

// ============================================================
// Profile-based principle configuration
// ============================================================

/**
 * TSCG Principle Configuration
 *
 * Implemented transforms (mapped to _engine.ts):
 *   SDM  → useSDM  (Semantic Description Minimization)
 *   CAS  → useCAS  (Context-Aware Sorting — U-shape tool ordering)
 *   DRO  → useDRO  (Dense Representation Operators — structural compression)
 *   TAS  → useTAS  (Type Abbreviation System)
 *   SAD  → useSAD  (Selective Anchor Duplication — Claude-specific)
 *
 * NOT yet implemented (future work):
 *   CFL  (Constraint-First Layout — parameter reordering by required/optional)
 *   ATA  (Adaptive Token Allocation)
 *   RKE  (Redundant Knowledge Elimination)
 *   CSP  (Context-Sensitive Pruning)
 */
interface PrincipleConfig {
  sdm: boolean;   // SDM: Semantic Description Minimization (was: dtr)
  cas: boolean;   // CAS: Context-Aware Sorting (was: cfl — L-23 FIX)
  dro: boolean;   // DRO: Dense Representation Operators (was: sco)
  tas: boolean;   // TAS: Type Abbreviation System
  sad: boolean;   // SAD: Selective Anchor Duplication
}

const PROFILE_DEFAULTS: Record<string, Partial<PrincipleConfig>> = {
  conservative: {
    sdm: true, cas: false, dro: false, tas: false, sad: false,
  },
  balanced: {
    sdm: true, cas: true, dro: true, tas: true, sad: false,
  },
  aggressive: {
    sdm: true, cas: true, dro: true, tas: true, sad: true,
  },
};

// ============================================================
// Normalization: Convert any tool format to internal format
// ============================================================

function isAnthropicTool(tool: AnyToolDefinition): tool is AnthropicToolDefinition {
  return 'input_schema' in tool;
}

function isOpenAITool(tool: AnyToolDefinition): tool is ToolDefinition {
  return 'function' in tool && tool.type === 'function';
}

/**
 * Normalize any tool definition format to the internal ToolDefinition
 * format used by the TSCG transforms engine.
 */
function normalizeToInternal(tool: AnyToolDefinition): InternalToolDef {
  let name: string;
  let description: string;
  let schema: Record<string, unknown>;

  if (isOpenAITool(tool)) {
    name = tool.function.name;
    description = tool.function.description;
    schema = tool.function.parameters as unknown as Record<string, unknown>;
  } else if (isAnthropicTool(tool)) {
    name = tool.name;
    description = tool.description;
    schema = tool.input_schema as unknown as Record<string, unknown>;
  } else {
    // Fallback: try to extract from generic shape
    const t = tool as Record<string, unknown>;
    name = (t['name'] as string) || 'unknown';
    description = (t['description'] as string) || '';
    schema = (t['parameters'] || t['input_schema'] || {}) as Record<string, unknown>;
  }

  // Convert JSON Schema properties to flat ToolParameter[]
  const parameters: InternalToolParam[] = [];
  const props = (schema?.properties || {}) as Record<string, Record<string, unknown>>;
  const required = (schema?.required || []) as string[];

  for (const [paramName, paramDef] of Object.entries(props)) {
    parameters.push({
      name: paramName,
      type: (paramDef.type as string) || 'string',
      description: (paramDef.description as string) || '',
      required: required.includes(paramName),
      enum: paramDef.enum as string[] | undefined,
    });
  }

  return { name, description, parameters };
}

// ============================================================
// TSCGCompiler
// ============================================================

/**
 * The TSCG Compiler.
 *
 * Applies deterministic compression principles to tool schemas,
 * reducing token overhead by 60-75% while preserving tool-use accuracy.
 *
 * @example
 * ```ts
 * import { TSCGCompiler } from '@tscg/core';
 *
 * const compiler = new TSCGCompiler({ model: 'claude-sonnet', profile: 'balanced' });
 * const result = compiler.compile(weatherTool);
 * console.log(result.metrics.tokens.savingsPercent); // ~71%
 * ```
 */
export class TSCGCompiler {
  private readonly options: Required<CompilerOptions>;
  private readonly principles: PrincipleConfig;

  constructor(options?: CompilerOptions) {
    const profile = options?.profile ?? 'balanced';
    const profileDefaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS['balanced'];
    const model = options?.model ?? 'auto';

    this.principles = {
      sdm: true,
      cas: true,
      dro: true,
      tas: true,
      sad: false,
      ...profileDefaults,
      ...options?.principles,
    };

    // KORREKTUR 3 (SAD-F Model-Schutz):
    // SAD (Selective Anchor Duplication) is only effective on Claude models.
    // On GPT-4o, Gemini, and small models, SAD causes degradation (echo-back).
    // Force-disable SAD for non-Claude models even if explicitly requested.
    const isClaudeModel = model === 'auto' ||
      model.startsWith('claude') ||
      model === 'claude-sonnet' ||
      model === 'claude-opus' ||
      model === 'claude-haiku';

    if (!isClaudeModel && this.principles.sad) {
      this.principles.sad = false;
    }

    this.options = {
      model,
      profile,
      principles: { ...this.principles },
      outputFormat: options?.outputFormat ?? 'compact',
      preserveToolNames: options?.preserveToolNames ?? true,
    };
  }

  /**
   * Compile (compress) a single tool definition.
   */
  compile(tool: AnyToolDefinition): CompressedResult {
    return this.compileMany([tool]);
  }

  /**
   * Compile (compress) a catalog of tool definitions.
   * Leverages cross-tool redundancies for higher compression.
   */
  compileMany(tools: AnyToolDefinition[]): CompressedResult {
    const start = performance.now();

    // Step 1: Normalize all tools to internal format
    const internal = tools.map(normalizeToInternal);

    // Step 2: Apply the existing TSCG transform pipeline
    // Maps principle toggles directly to engine transforms (L-23 FIX: 1:1 naming)
    const pipelineResult = optimizeToolDefinitions(internal, {
      useSDM: this.principles.sdm,
      useCAS: this.principles.cas,
      useDRO: this.principles.dro,
      useTAS: this.principles.tas,
      useSAD: this.principles.sad,
    });

    const elapsed = performance.now() - start;

    // Step 3: Calculate metrics
    const originalText = tools.map((t) => JSON.stringify(t)).join('\n');
    const originalTokens = estimateTokens(originalText, this.options.model);
    const compressedTokens = estimateTokens(pipelineResult.text, this.options.model);

    const perTool: PerToolMetric[] = internal.map((t) => {
      const origStr = JSON.stringify(t);
      const origTok = estimateTokens(origStr, this.options.model);
      // Approximate per-tool savings based on overall ratio
      const ratio = pipelineResult.optimizedTokenEstimate / Math.max(pipelineResult.originalTokenEstimate, 1);
      const compTok = Math.ceil(origTok * ratio);
      return {
        name: t.name,
        originalTokens: origTok,
        compressedTokens: compTok,
        savingsPercent: origTok > 0 ? Math.round(((origTok - compTok) / origTok) * 1000) / 10 : 0,
      };
    });

    const tokenSavings = originalTokens - compressedTokens;
    const savingsPercent = originalTokens > 0
      ? Math.round(((tokenSavings) / originalTokens) * 1000) / 10
      : 0;

    const metrics: CompressionMetrics = {
      tokens: {
        original: originalTokens,
        compressed: compressedTokens,
        savings: tokenSavings,
        savingsPercent,
      },
      characters: {
        original: originalText.length,
        compressed: pipelineResult.text.length,
      },
      perTool,
      compressionTimeMs: elapsed,
    };

    // Step 4: Determine which principles were applied
    // L-24 FIX: Only report transforms that have actual implementations.
    // Removed phantom principles (ATA, RKE, CSP) that had no backing code.
    const appliedPrinciples: string[] = [];
    if (this.principles.sdm) appliedPrinciples.push('SDM');
    if (this.principles.cas) appliedPrinciples.push('CAS');
    if (this.principles.dro) appliedPrinciples.push('DRO');
    if (this.principles.tas) appliedPrinciples.push('TAS');
    if (this.principles.sad) appliedPrinciples.push('SAD');

    return {
      compressed: pipelineResult.text,
      metrics,
      appliedPrinciples,
    };
  }

  /**
   * Get the current compiler configuration.
   */
  getMetrics(): { model: ModelTarget; profile: string; principles: PrincipleConfig } {
    return {
      model: this.options.model,
      profile: this.options.profile,
      principles: { ...this.principles },
    };
  }
}
