/**
 * TAB Benchmark — Compression Pipeline
 *
 * Takes a SchemaCollection and produces 3 conditions:
 *   1. natural:   Uncompressed (OpenAI JSON format baseline)
 *   2. tscg:      TSCG compression with balanced profile
 *   3. tscg_sad:  TSCG compression with aggressive profile (includes SAD)
 *
 * Uses @tscg/core's compress() function for TSCG conditions and
 * the natural renderer for the baseline. Token counting uses
 * @tscg/core's estimateTokens() for consistency.
 *
 * Output: CompressedSchemaSet with all 3 conditions, token counts, and savings.
 */

import { compress } from '../../packages/core/src/compress.js';
import type { CompilerOptions, ToolDefinition } from '../../packages/core/src/types.js';
import type { SchemaCollection } from '../schemas/types.js';
import { renderNaturalSchemaJSON, renderNaturalSchema } from './natural-renderer.js';
import { countTokens } from './token-counter.js';

// ============================================================
// Compression Result Types
// ============================================================

/**
 * A single compression condition result.
 */
export interface ConditionResult {
  /** Compressed (or natural) text output */
  text: string;
  /** Token count for this condition */
  tokens: number;
}

/**
 * Complete compressed schema set with all 3 conditions.
 */
export interface CompressedSchemaSet {
  /** Collection identifier */
  collectionId: string;

  /** Results for each condition */
  conditions: {
    natural: ConditionResult;
    tscg: ConditionResult;
    tscg_sad: ConditionResult;
    tscg_conservative: ConditionResult;
  };

  /** Token savings relative to natural baseline */
  savings: {
    tscg: { tokens: number; percent: number };
    tscg_sad: { tokens: number; percent: number };
  };

  /** TSCG principles applied in each condition */
  appliedPrinciples: {
    tscg: string[];
    tscg_sad: string[];
  };

  /** Compression time in ms */
  timings: {
    tscg_ms: number;
    tscg_sad_ms: number;
  };
}

// ============================================================
// Compression Options
// ============================================================

/** TSCG balanced profile options */
const TSCG_BALANCED_OPTIONS: CompilerOptions = {
  profile: 'balanced',
  model: 'auto',
  preserveToolNames: true,
};

/** TSCG aggressive profile options (includes SAD) */
const TSCG_AGGRESSIVE_OPTIONS: CompilerOptions = {
  profile: 'aggressive',
  model: 'auto',
  preserveToolNames: true,
};

/** TSCG conservative profile options (SDM-only, no structural compression) */
const TSCG_CONSERVATIVE_OPTIONS: CompilerOptions = {
  profile: 'conservative',
  model: 'auto',
  preserveToolNames: true,
};

// ============================================================
// Single Collection Compression
// ============================================================

/**
 * Compress a single schema collection, producing all 3 conditions.
 *
 * @param collection - The schema collection to compress
 * @returns CompressedSchemaSet with natural, tscg, and tscg_sad conditions
 *
 * @example
 * ```ts
 * const result = compressCollection(claudeCodeCollection);
 * console.log(result.savings.tscg.percent);     // ~71.7
 * console.log(result.savings.tscg_sad.percent);  // ~76.2
 * ```
 */
export function compressCollection(collection: SchemaCollection): CompressedSchemaSet {
  const tools = collection.tools;

  // Condition 1: Natural (uncompressed baseline)
  // Use JSON format as the baseline -- this is what models actually receive
  const naturalText = renderNaturalSchemaJSON(tools);
  const naturalTokens = countTokens(naturalText);

  // Condition 2: TSCG (balanced profile)
  const tscgResult = compress(tools, TSCG_BALANCED_OPTIONS);
  const tscgText = tscgResult.compressed;
  const tscgTokens = countTokens(tscgText);

  // Condition 3: TSCG+SAD (aggressive profile)
  const tscgSadResult = compress(tools, TSCG_AGGRESSIVE_OPTIONS);
  const tscgSadText = tscgSadResult.compressed;
  const tscgSadTokens = countTokens(tscgSadText);

  // Condition 4: TSCG Conservative (SDM-only, no structural compression)
  const tscgConsResult = compress(tools, TSCG_CONSERVATIVE_OPTIONS);
  const tscgConsText = tscgConsResult.compressed;
  const tscgConsTokens = countTokens(tscgConsText);

  // Calculate savings
  const tscgSavingsTokens = naturalTokens - tscgTokens;
  const tscgSavingsPercent = naturalTokens > 0
    ? Math.round((tscgSavingsTokens / naturalTokens) * 1000) / 10
    : 0;

  const tscgSadSavingsTokens = naturalTokens - tscgSadTokens;
  const tscgSadSavingsPercent = naturalTokens > 0
    ? Math.round((tscgSadSavingsTokens / naturalTokens) * 1000) / 10
    : 0;

  return {
    collectionId: collection.id,
    conditions: {
      natural: { text: naturalText, tokens: naturalTokens },
      tscg: { text: tscgText, tokens: tscgTokens },
      tscg_sad: { text: tscgSadText, tokens: tscgSadTokens },
      tscg_conservative: { text: tscgConsText, tokens: tscgConsTokens },
    },
    savings: {
      tscg: { tokens: tscgSavingsTokens, percent: tscgSavingsPercent },
      tscg_sad: { tokens: tscgSadSavingsTokens, percent: tscgSadSavingsPercent },
    },
    appliedPrinciples: {
      tscg: tscgResult.appliedPrinciples,
      tscg_sad: tscgSadResult.appliedPrinciples,
    },
    timings: {
      tscg_ms: tscgResult.metrics.compressionTimeMs,
      tscg_sad_ms: tscgSadResult.metrics.compressionTimeMs,
    },
  };
}

// ============================================================
// Batch Compression
// ============================================================

/**
 * Compress all schema collections, producing CompressedSchemaSet for each.
 *
 * @param collections - Array of schema collections
 * @returns Array of CompressedSchemaSet objects (same order as input)
 *
 * @example
 * ```ts
 * const results = compressAllCollections(allCollections);
 * for (const r of results) {
 *   console.log(`${r.collectionId}: ${r.savings.tscg.percent}% savings`);
 * }
 * ```
 */
export function compressAllCollections(
  collections: SchemaCollection[],
): CompressedSchemaSet[] {
  return collections.map((collection) => compressCollection(collection));
}

// ============================================================
// Summary Statistics
// ============================================================

/**
 * Aggregate compression statistics across all collections.
 */
export interface CompressionSummary {
  totalCollections: number;
  totalTools: number;
  averageSavings: {
    tscg: { tokens: number; percent: number };
    tscg_sad: { tokens: number; percent: number };
  };
  totalTokens: {
    natural: number;
    tscg: number;
    tscg_sad: number;
  };
  averageCompressionTime: {
    tscg_ms: number;
    tscg_sad_ms: number;
  };
}

/**
 * Compute aggregate compression statistics from a set of results.
 *
 * @param results - Array of CompressedSchemaSet objects
 * @returns Summary statistics
 */
export function summarizeCompression(
  results: CompressedSchemaSet[],
): CompressionSummary {
  if (results.length === 0) {
    return {
      totalCollections: 0,
      totalTools: 0,
      averageSavings: {
        tscg: { tokens: 0, percent: 0 },
        tscg_sad: { tokens: 0, percent: 0 },
      },
      totalTokens: { natural: 0, tscg: 0, tscg_sad: 0 },
      averageCompressionTime: { tscg_ms: 0, tscg_sad_ms: 0 },
    };
  }

  const totalNatural = results.reduce((s, r) => s + r.conditions.natural.tokens, 0);
  const totalTscg = results.reduce((s, r) => s + r.conditions.tscg.tokens, 0);
  const totalTscgSad = results.reduce((s, r) => s + r.conditions.tscg_sad.tokens, 0);

  const avgTscgPercent = results.reduce((s, r) => s + r.savings.tscg.percent, 0) / results.length;
  const avgTscgSadPercent = results.reduce((s, r) => s + r.savings.tscg_sad.percent, 0) / results.length;

  const avgTscgTokens = results.reduce((s, r) => s + r.savings.tscg.tokens, 0) / results.length;
  const avgTscgSadTokens = results.reduce((s, r) => s + r.savings.tscg_sad.tokens, 0) / results.length;

  const avgTscgTime = results.reduce((s, r) => s + r.timings.tscg_ms, 0) / results.length;
  const avgTscgSadTime = results.reduce((s, r) => s + r.timings.tscg_sad_ms, 0) / results.length;

  return {
    totalCollections: results.length,
    totalTools: 0, // Would need collection data to compute
    averageSavings: {
      tscg: {
        tokens: Math.round(avgTscgTokens),
        percent: Math.round(avgTscgPercent * 10) / 10,
      },
      tscg_sad: {
        tokens: Math.round(avgTscgSadTokens),
        percent: Math.round(avgTscgSadPercent * 10) / 10,
      },
    },
    totalTokens: {
      natural: totalNatural,
      tscg: totalTscg,
      tscg_sad: totalTscgSad,
    },
    averageCompressionTime: {
      tscg_ms: Math.round(avgTscgTime * 100) / 100,
      tscg_sad_ms: Math.round(avgTscgSadTime * 100) / 100,
    },
  };
}
