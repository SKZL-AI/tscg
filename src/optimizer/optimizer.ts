/**
 * TSCG Prompt Optimizer
 * Main orchestrator — takes a raw NL prompt and produces an optimized TSCG prompt.
 *
 * Two modes:
 *   1. LOCAL (default) — Pure deterministic transforms, no API calls needed
 *   2. HYBRID — Uses Claude API for NL→TSCG compilation, then applies local transforms
 *
 * Pipeline order (based on benchmark evidence):
 *   Pass 1: Analysis    → Classify prompt, extract structure
 *   Pass 2: SDM         → Strip filler (semantic density)
 *   Pass 3: DRO         → Optimize delimiters (key:value, |, →)
 *   Pass 4: CFL         → Prepend output constraint at position 0
 *   Pass 5: CFO         → Reorder into causal chain
 *   Pass 6: TAS         → Tokenizer-aligned syntax cleanup
 *   Pass 7: MC-COMPACT  → Compact multiple choice (if applicable)
 *   Pass 8: CTX-WRAP    → Wrap context blocks (if applicable)
 *   Pass 9: CCP         → Append causal closure block
 *   Pass 10: CAS        → Verify causal access ordering
 *   Pass 11: SAD-F      → Selective anchor duplication
 */

import { analyzePrompt, type PromptAnalysis, type PromptType } from './analyzer.js';
import {
  applySDM, applyCFL, applyCFO, applyDRO, applyTAS,
  applyCCP, applyCAS, applySADF, wrapContext, compactMultipleChoice,
  type TransformResult, type TransformPipeline,
} from './transforms.js';
import { compileTscg } from '../compiler/compiler.js';
import type { TscgConfig, ProviderName } from '../core/types.js';
import { getModelProfile } from '../core/types.js';

// === Optimization Profiles ===

export type OptimizationProfile =
  | 'balanced'      // Best balance of compression + accuracy (default)
  | 'max_compress'  // Maximum token reduction, slight accuracy risk
  | 'max_accuracy'  // Maximum accuracy, minimal compression
  | 'minimal'       // Only SDM + CFL (lightest touch)
  | 'full';         // All transforms including SAD-F and CCP

export interface OptimizerOptions {
  profile: OptimizationProfile;
  enableSADF: boolean;
  enableCCP: boolean;
  sadTopK: number;
  verbose: boolean;
  provider?: ProviderName;
  model?: string;
}

export const DEFAULT_OPTIMIZER_OPTIONS: OptimizerOptions = {
  profile: 'balanced',
  enableSADF: true,
  enableCCP: true,
  sadTopK: 4,
  verbose: false,
};

// Profile-specific transform enablement
const PROFILE_TRANSFORMS: Record<OptimizationProfile, string[]> = {
  minimal:      ['SDM', 'CFL'],
  balanced:     ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP'],
  max_compress: ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP'],
  max_accuracy: ['SDM', 'CFL', 'DRO', 'TAS', 'MC-COMPACT', 'CTX-WRAP', 'CCP', 'SAD-F'],
  full:         ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP', 'CCP', 'CAS', 'SAD-F'],
};

// === Main Optimizer Function ===

export interface OptimizeResult {
  original: string;
  optimized: string;
  analysis: PromptAnalysis;
  pipeline: TransformPipeline;
  profile: OptimizationProfile;
  metrics: OptimizeMetrics;
}

export interface OptimizeMetrics {
  originalChars: number;
  optimizedChars: number;
  originalTokensEst: number;
  optimizedTokensEst: number;
  compressionRatio: number;
  tokensRemoved: number;
  tokensSaved: number;
  transformsApplied: number;
  transformsSkipped: number;
  promptType: PromptType;
  outputFormat: string;
}

/**
 * Optimize a prompt using TSCG principles (local, deterministic).
 * No API calls required.
 */
export function optimizePrompt(
  prompt: string,
  options: Partial<OptimizerOptions> = {}
): OptimizeResult {
  const opts: OptimizerOptions = { ...DEFAULT_OPTIMIZER_OPTIONS, ...options };
  const enabledTransforms = new Set(PROFILE_TRANSFORMS[opts.profile]);

  // Override with explicit options
  if (opts.enableSADF && !enabledTransforms.has('SAD-F')) {
    enabledTransforms.add('SAD-F');
  }
  if (!opts.enableSADF) {
    enabledTransforms.delete('SAD-F');
  }
  if (opts.enableCCP && !enabledTransforms.has('CCP')) {
    enabledTransforms.add('CCP');
  }
  if (!opts.enableCCP) {
    enabledTransforms.delete('CCP');
  }

  // Pass 1: Analyze
  const analysis = analyzePrompt(prompt);

  if (opts.verbose) {
    console.log(`\n  [Analyzer] Type: ${analysis.type} | Format: ${analysis.outputFormat}`);
    console.log(`  [Analyzer] Words: ${analysis.wordCount} | Sentences: ${analysis.sentenceCount}`);
    console.log(`  [Analyzer] Parameters: ${analysis.parameters.length} | Operations: ${analysis.operations.length}`);
    console.log(`  [Analyzer] Filler words: ${analysis.fillerWords.length} (${analysis.fillerWords.join(', ')})`);
    console.log(`  [Analyzer] Constraints: ${analysis.constraints.length}`);
    if (analysis.hasMultipleChoice) console.log(`  [Analyzer] Multiple choice: ${analysis.mcOptions.length} options`);
  }

  // Execute transform pipeline
  const transforms: TransformResult[] = [];
  let current = prompt;

  // Dynamic analysis that updates as transforms change the text
  let currentAnalysis = analysis;

  const runTransform = (name: string, fn: () => TransformResult) => {
    if (!enabledTransforms.has(name)) return;
    const result = fn();
    transforms.push(result);
    if (result.applied) {
      current = result.output;
      if (opts.verbose) {
        console.log(`  [${name}] ${result.description}`);
      }
    } else if (opts.verbose) {
      console.log(`  [${name}] Skipped: ${result.description}`);
    }
  };

  // Pass 2-11: Execute transforms in order
  runTransform('SDM', () => applySDM(current, currentAnalysis));
  runTransform('DRO', () => applyDRO(current, currentAnalysis));
  runTransform('CFL', () => applyCFL(current, currentAnalysis));
  runTransform('CFO', () => applyCFO(current, currentAnalysis));
  runTransform('TAS', () => applyTAS(current, currentAnalysis));
  runTransform('MC-COMPACT', () => compactMultipleChoice(current, currentAnalysis));
  runTransform('CTX-WRAP', () => wrapContext(current, currentAnalysis));
  runTransform('CCP', () => applyCCP(current, currentAnalysis));
  runTransform('CAS', () => applyCAS(current, currentAnalysis));
  runTransform('SAD-F', () => applySADF(current, currentAnalysis, opts.sadTopK));

  // Model-aware CFL/SAD stripping (v1.2.0)
  if (opts.provider && opts.model) {
    const profile = getModelProfile(opts.provider, opts.model);
    if (!profile.enableCFL) {
      current = current.replace(/\[ANSWER:[^\]]*\]\s*/g, '').replace(/\[CLASSIFY:[^\]]*\]\s*/g, '').trim();
    }
    if (!profile.enableSAD) {
      current = current.replace(/\s*\[ANCHOR:[^\]]*\]/g, '').trim();
    }
  }

  // Build pipeline result
  const applied = transforms.filter((t) => t.applied);
  const skipped = transforms.filter((t) => !t.applied);
  const totalTokensBefore = Math.ceil(prompt.length / 4);
  const totalTokensAfter = Math.ceil(current.length / 4);

  const pipeline: TransformPipeline = {
    transforms,
    original: prompt,
    optimized: current,
    totalTokensBefore,
    totalTokensAfter,
    compressionRatio: current.length / prompt.length,
  };

  const metrics: OptimizeMetrics = {
    originalChars: prompt.length,
    optimizedChars: current.length,
    originalTokensEst: totalTokensBefore,
    optimizedTokensEst: totalTokensAfter,
    compressionRatio: totalTokensAfter / totalTokensBefore,
    tokensRemoved: totalTokensBefore - totalTokensAfter,
    tokensSaved: Math.max(0, totalTokensBefore - totalTokensAfter),
    transformsApplied: applied.length,
    transformsSkipped: skipped.length,
    promptType: analysis.type,
    outputFormat: analysis.outputFormat,
  };

  return {
    original: prompt,
    optimized: current,
    analysis,
    pipeline,
    profile: opts.profile,
    metrics,
  };
}

/**
 * Optimize a prompt using hybrid mode (Claude API for NL→TSCG + local transforms).
 * Requires API key.
 */
export async function optimizePromptHybrid(
  prompt: string,
  config: TscgConfig,
  options: Partial<OptimizerOptions> = {}
): Promise<OptimizeResult> {
  const opts: OptimizerOptions = { ...DEFAULT_OPTIMIZER_OPTIONS, ...options };

  // Step 1: Analyze locally
  const analysis = analyzePrompt(prompt);

  if (opts.verbose) {
    console.log(`\n  [Hybrid Mode] Using Claude API for NL→TSCG compilation`);
    console.log(`  [Analyzer] Type: ${analysis.type} | Format: ${analysis.outputFormat}`);
  }

  // Step 2: Compile NL → TSCG via Claude API
  const compiled = await compileTscg(prompt, config);
  let current = compiled.tscg;

  if (opts.verbose) {
    console.log(`  [Compiler] API compiled to: ${current.slice(0, 100)}...`);
    console.log(`  [Compiler] Compression: ${(compiled.compressionRatio * 100).toFixed(1)}%`);
  }

  // Step 3: Apply local post-processing transforms on the compiled output
  const transforms: TransformResult[] = [];

  // Re-analyze the compiled output
  const compiledAnalysis = analyzePrompt(current);
  // Merge fragility info from original analysis
  compiledAnalysis.parameters = [
    ...compiledAnalysis.parameters,
    ...analysis.parameters.filter((p) =>
      !compiledAnalysis.parameters.some((cp) => cp.key === p.key)
    ),
  ];

  const runTransform = (name: string, fn: () => TransformResult) => {
    const result = fn();
    transforms.push(result);
    if (result.applied) {
      current = result.output;
      if (opts.verbose) console.log(`  [${name}] ${result.description}`);
    }
  };

  // Only apply post-compilation transforms
  runTransform('TAS', () => applyTAS(current, compiledAnalysis));

  if (opts.enableCCP) {
    runTransform('CCP', () => applyCCP(current, compiledAnalysis));
  }

  if (opts.enableSADF) {
    runTransform('SAD-F', () => applySADF(current, compiledAnalysis, opts.sadTopK));
  }

  const applied = transforms.filter((t) => t.applied);
  const totalTokensBefore = Math.ceil(prompt.length / 4);
  const totalTokensAfter = Math.ceil(current.length / 4);

  const pipeline: TransformPipeline = {
    transforms,
    original: prompt,
    optimized: current,
    totalTokensBefore,
    totalTokensAfter,
    compressionRatio: current.length / prompt.length,
  };

  const metrics: OptimizeMetrics = {
    originalChars: prompt.length,
    optimizedChars: current.length,
    originalTokensEst: totalTokensBefore,
    optimizedTokensEst: totalTokensAfter,
    compressionRatio: totalTokensAfter / totalTokensBefore,
    tokensRemoved: totalTokensBefore - totalTokensAfter,
    tokensSaved: Math.max(0, totalTokensBefore - totalTokensAfter),
    transformsApplied: applied.length,
    transformsSkipped: transforms.length - applied.length,
    promptType: analysis.type,
    outputFormat: analysis.outputFormat,
  };

  return {
    original: prompt,
    optimized: current,
    analysis,
    pipeline,
    profile: opts.profile,
    metrics,
  };
}

/**
 * Batch optimize multiple prompts
 */
export function batchOptimize(
  prompts: string[],
  options: Partial<OptimizerOptions> = {}
): OptimizeResult[] {
  return prompts.map((p) => optimizePrompt(p, options));
}
