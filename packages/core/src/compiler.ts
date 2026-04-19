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
  DescriptionOnlyResult,
  DescriptionOnlyMetrics,
  PerToolDescriptionMetric,
} from './types.js';
import { estimateTokens } from './utils.js';

// Import transforms from the local engine bridge
import {
  optimizeToolDefinitions,
  applySDMToText,
  type ToolDefinition as InternalToolDef,
  type ToolParameter as InternalToolParam,
} from './_engine.js';

// ============================================================
// Profile-based principle configuration
// ============================================================

/**
 * TSCG Principle Configuration
 *
 * All 8 paper operators are implemented (v1.3.0, auto-scaling v1.4.0):
 *   SDM  → useSDM  (Semantic Density Maximization — strip filler)
 *   CAS  → useCAS  (Causal Access Score — U-shape frequency reorder)
 *   CFO  → useCFO  (Causal-Forward Ordering — read → transform → write)
 *   DRO  → useDRO  (Delimiter-Role Optimization — compact parameter format)
 *   TAS  → useTAS  (Tokenizer-Aligned Syntax — BPE-optimal delimiters)
 *   CFL  → useCFL  (Constraint-First Layout — [ANSWER:...] prepend, Claude-only)
 *   SAD  → useSAD  (Selective Anchor Duplication — [ANCHOR:...] append, Claude-only)
 *   CCP  → useCCP  (Causal Closure Principle — [CLOSURE:...] append)
 */
interface PrincipleConfig {
  sdm: boolean;   // SDM: Semantic Density Maximization
  cas: boolean;   // CAS: Causal Access Score (U-shape)
  cfo: boolean;   // CFO: Causal-Forward Ordering
  dro: boolean;   // DRO: Delimiter-Role Optimization
  tas: boolean;   // TAS: Tokenizer-Aligned Syntax
  cfl: boolean;   // CFL: Constraint-First Layout (Claude-only)
  sad: boolean;   // SAD: Selective Anchor Duplication (Claude-only)
  ccp: boolean;   // CCP: Causal Closure Principle
}

const PROFILE_DEFAULTS: Record<string, Partial<PrincipleConfig>> = {
  conservative: {
    sdm: true, cas: false, cfo: false, dro: false, tas: false,
    cfl: false, sad: false, ccp: false,
  },
  balanced: {
    sdm: true, cas: true, cfo: true, dro: true, tas: true,
    cfl: false, sad: false, ccp: true,
  },
  aggressive: {
    sdm: true, cas: true, cfo: true, dro: true, tas: true,
    cfl: true, sad: true, ccp: true,
  },
  auto: {
    sdm: true, cas: true, cfo: true, dro: true, tas: true,
    cfl: false, sad: false, ccp: true,
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
      cfo: true,
      dro: true,
      tas: true,
      cfl: false,
      sad: false,
      ccp: true,
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

    // CFL (Constraint-First Layout) is also Claude-only.
    // Non-Claude models echo-back the [ANSWER:...] tag into their completions,
    // causing accuracy degradation. Force-disable for non-Claude targets.
    if (!isClaudeModel && this.principles.cfl) {
      this.principles.cfl = false;
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

    // Step 1.5: Build effective principle config (may differ from this.principles)
    const principleConfig: PrincipleConfig = { ...this.principles };

    // Auto profile logic (v1.4.0): select principles based on catalog size
    if (this.options.profile === 'auto') {
      const toolCount = tools.length;
      if (toolCount <= 20) {
        // Small catalogs: conservative is safest
        Object.assign(principleConfig, PROFILE_DEFAULTS['conservative']);
      } else if (toolCount <= 40) {
        // Medium catalogs: balanced WITHOUT CFL/CFO (scale-sensitive)
        Object.assign(principleConfig, PROFILE_DEFAULTS['balanced']);
        principleConfig.cfl = false;
        principleConfig.cfo = false;
      } else {
        // Large catalogs (>40): conservative (safety default)
        Object.assign(principleConfig, PROFILE_DEFAULTS['conservative']);
      }
      // Re-apply any explicit user overrides
      if (this.options.principles) {
        for (const [key, val] of Object.entries(this.options.principles)) {
          if (val !== undefined) {
            (principleConfig as unknown as Record<string, boolean>)[key] = val;
          }
        }
      }
    }

    // Auto-disable CFL/CFO for large catalogs (v1.4.0 finding: harmful at >=43 tools)
    if (tools.length >= 30 && this.options.profile === 'balanced') {
      // Temporarily disable scale-sensitive operators
      principleConfig.cfl = false;
      principleConfig.cfo = false;
    }

    // Step 2: Apply the existing TSCG transform pipeline
    // Maps principle toggles directly to engine transforms (L-23 FIX: 1:1 naming)
    const pipelineResult = optimizeToolDefinitions(internal, {
      useSDM: principleConfig.sdm,
      useCAS: principleConfig.cas,
      useCFO: principleConfig.cfo,
      useDRO: principleConfig.dro,
      useTAS: principleConfig.tas,
      useCFL: principleConfig.cfl,
      useSAD: principleConfig.sad,
      useCCP: principleConfig.ccp,
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

    // Step 4: Determine which principles were applied.
    // Listed in paper Figure 1 composition order (not execution order):
    //   SDM → TAS → DRO → CFL → CFO → CAS → SAD-F → CCP
    // All 8 paper operators now have backing implementations (v1.3.0).
    // Phantom principles (ATA, RKE, CSP) were removed in L-24.
    const appliedPrinciples: string[] = [];
    if (principleConfig.sdm) appliedPrinciples.push('SDM');
    if (principleConfig.tas) appliedPrinciples.push('TAS');
    if (principleConfig.dro) appliedPrinciples.push('DRO');
    if (principleConfig.cfl) appliedPrinciples.push('CFL');
    if (principleConfig.cfo) appliedPrinciples.push('CFO');
    if (principleConfig.cas) appliedPrinciples.push('CAS');
    if (principleConfig.sad) appliedPrinciples.push('SAD');
    if (principleConfig.ccp) appliedPrinciples.push('CCP');

    return {
      compressed: pipelineResult.text,
      metrics,
      appliedPrinciples,
    };
  }

  /**
   * Description-only compression: compress only `.description` fields,
   * preserving JSON tool-calling structure for 100% native API compatibility.
   *
   * Only applies SDM (filler stripping) to descriptions and parameter descriptions.
   * JSON schema structure, property types, enums, etc. remain untouched.
   */
  compileDescriptions(tools: AnyToolDefinition[]): DescriptionOnlyResult {
    const start = performance.now();
    const model = this.options.model;
    const perTool: PerToolDescriptionMetric[] = [];

    let totalOrigDesc = 0;
    let totalCompDesc = 0;

    const compressedTools = tools.map((tool) => {
      if (isOpenAITool(tool)) {
        const origDesc = tool.function.description;
        const compDesc = applySDMToText(origDesc);
        const origTokens = estimateTokens(origDesc, model);
        const compTokens = estimateTokens(compDesc, model);

        let paramCount = 0;
        const newParams = { ...tool.function.parameters };
        if (newParams.properties) {
          const newProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(newParams.properties)) {
            const prop = v as unknown as Record<string, unknown>;
            if (prop.description && typeof prop.description === 'string') {
              newProps[k] = { ...prop, description: applySDMToText(prop.description) };
              paramCount++;
            } else {
              newProps[k] = prop;
            }
          }
          newParams.properties = newProps as unknown as Record<string, import('./types.js').JSONSchemaProperty>;
        }

        totalOrigDesc += origTokens;
        totalCompDesc += compTokens;

        perTool.push({
          name: tool.function.name,
          originalDescriptionTokens: origTokens,
          compressedDescriptionTokens: compTokens,
          savingsPercent: origTokens > 0 ? Math.round(((origTokens - compTokens) / origTokens) * 1000) / 10 : 0,
          paramDescriptionsCompressed: paramCount,
        });

        return {
          ...tool,
          function: { ...tool.function, description: compDesc, parameters: newParams },
        } as AnyToolDefinition;
      } else if (isAnthropicTool(tool)) {
        const origDesc = tool.description;
        const compDesc = applySDMToText(origDesc);
        const origTokens = estimateTokens(origDesc, model);
        const compTokens = estimateTokens(compDesc, model);

        let paramCount = 0;
        const newSchema = { ...tool.input_schema };
        if (newSchema.properties) {
          const newProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(newSchema.properties)) {
            const prop = v as unknown as Record<string, unknown>;
            if (prop.description && typeof prop.description === 'string') {
              newProps[k] = { ...prop, description: applySDMToText(prop.description) };
              paramCount++;
            } else {
              newProps[k] = prop;
            }
          }
          newSchema.properties = newProps as unknown as Record<string, import('./types.js').JSONSchemaProperty>;
        }

        totalOrigDesc += origTokens;
        totalCompDesc += compTokens;

        perTool.push({
          name: tool.name,
          originalDescriptionTokens: origTokens,
          compressedDescriptionTokens: compTokens,
          savingsPercent: origTokens > 0 ? Math.round(((origTokens - compTokens) / origTokens) * 1000) / 10 : 0,
          paramDescriptionsCompressed: paramCount,
        });

        return { ...tool, description: compDesc, input_schema: newSchema } as AnyToolDefinition;
      }
      return tool;
    });

    const elapsed = performance.now() - start;

    // Total schema tokens (description + JSON overhead)
    const origSchemaTokens = estimateTokens(JSON.stringify(tools), model);
    const compSchemaTokens = estimateTokens(JSON.stringify(compressedTools), model);

    const descSavings = totalOrigDesc - totalCompDesc;
    const descSavingsPercent = totalOrigDesc > 0
      ? Math.round((descSavings / totalOrigDesc) * 1000) / 10 : 0;

    const schemaSavings = origSchemaTokens - compSchemaTokens;
    const schemaSavingsPercent = origSchemaTokens > 0
      ? Math.round((schemaSavings / origSchemaTokens) * 1000) / 10 : 0;

    const metrics: DescriptionOnlyMetrics = {
      descriptions: {
        originalTokens: totalOrigDesc,
        compressedTokens: totalCompDesc,
        savings: descSavings,
        savingsPercent: descSavingsPercent,
      },
      totalSchema: {
        originalTokens: origSchemaTokens,
        compressedTokens: compSchemaTokens,
        savings: schemaSavings,
        savingsPercent: schemaSavingsPercent,
      },
      perTool,
      compressionTimeMs: elapsed,
    };

    return {
      tools: compressedTools,
      metrics,
      appliedPrinciples: ['SDM'],
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
