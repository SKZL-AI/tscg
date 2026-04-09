/**
 * TAB Schema Collector — Baseline Data Import (LUECKE 3 FIX)
 *
 * Imports existing benchmark data from Phase 3 as reference points:
 *   - tscg-results/*.json  (35 files with multi-model results)
 *   - data/accuracy-results.json (30 test cases x 4 conditions)
 *   - src/benchmark/tool-cases.ts (25 existing tools, 30 tests)
 *
 * The 70-74% tool-compression results from Phase 3 are imported as
 * "Known Good" reference points for validating TAB benchmark results.
 *
 * This module is designed to work without external API calls.
 * It reads local files and parses them into structured BaselineData.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

import type {
  BaselineData,
  AccuracyResultRow,
  TscgResultFile,
  StrategyResultSummary,
  ResultFileMeta,
} from '../types.js';

// ============================================================
// Path Configuration
// ============================================================

/** Project root — resolve relative to this file's location */
const PROJECT_ROOT = join(import.meta.dirname ?? '.', '..', '..', '..');

const PATHS = {
  tscgResults: join(PROJECT_ROOT, 'tscg-results'),
  accuracyResults: join(PROJECT_ROOT, 'data', 'accuracy-results.json'),
  toolCases: join(PROJECT_ROOT, 'src', 'benchmark', 'tool-cases.ts'),
} as const;

// ============================================================
// Known Good Metrics (Phase 3 validated values)
// ============================================================

/**
 * These are the compression and accuracy metrics validated during Phase 3
 * across multiple models. They serve as regression guardrails for TAB.
 */
const KNOWN_GOOD_METRICS = {
  /** TSCG tool-description compression range (percentage saved) */
  compressionRange: [70, 74] as [number, number],

  /** Whether accuracy was maintained at or above natural-language baseline */
  accuracyMaintained: true,

  /** Models validated during Phase 3 benchmarking */
  modelsValidated: [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001',
    'gpt-4o-2024-11-20',
    'gpt-4o',
    'gpt-5.2',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'moonshot-v1-8k',
  ],
} as const;

// ============================================================
// File Readers
// ============================================================

/**
 * Read and parse accuracy-results.json.
 * Returns empty array if file not found (graceful degradation).
 */
function readAccuracyResults(): AccuracyResultRow[] {
  if (!existsSync(PATHS.accuracyResults)) {
    console.warn(
      `[baseline-import] accuracy-results.json not found at ${PATHS.accuracyResults}`,
    );
    return [];
  }

  const raw = readFileSync(PATHS.accuracyResults, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    console.warn('[baseline-import] accuracy-results.json is not an array');
    return [];
  }

  return parsed.map((row: Record<string, unknown>) => ({
    test_id: String(row['test_id'] ?? ''),
    category: String(row['category'] ?? ''),
    name: String(row['name'] ?? ''),
    condition: String(row['condition'] ?? ''),
    condition_name: String(row['condition_name'] ?? ''),
    expected: String(row['expected'] ?? ''),
    response: String(row['response'] ?? ''),
    correct: Boolean(row['correct']),
    latency_ms: Number(row['latency_ms'] ?? 0),
  }));
}

/**
 * Read and parse all tscg-results/*.json files.
 * Groups results by model name extracted from the filename.
 */
function readModelResults(): Record<string, TscgResultFile> {
  if (!existsSync(PATHS.tscgResults)) {
    console.warn(
      `[baseline-import] tscg-results/ directory not found at ${PATHS.tscgResults}`,
    );
    return {};
  }

  const files = readdirSync(PATHS.tscgResults).filter((f) =>
    f.endsWith('.json'),
  );
  const results: Record<string, TscgResultFile> = {};

  for (const file of files) {
    const filePath = join(PATHS.tscgResults, file);

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Extract model name from filename: tscg-{model}-{timestamp}.json
      const modelMatch = basename(file).match(
        /^tscg-(.+?)-\d{4}-\d{2}-\d{2}T/,
      );
      const modelName = modelMatch
        ? modelMatch[1]
        : basename(file, '.json');

      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      const summaries = parsed['summaries'] as
        | Record<string, Record<string, unknown>>
        | undefined;
      const categoryBreakdown = parsed['categoryBreakdown'] as
        | Record<string, Record<string, { correct: number; total: number }>>
        | undefined;

      if (!meta || !summaries) {
        console.warn(
          `[baseline-import] Skipping ${file}: missing meta or summaries`,
        );
        continue;
      }

      const parsedMeta: ResultFileMeta = {
        model: String(meta['model'] ?? ''),
        timestamp: String(meta['timestamp'] ?? ''),
        totalTests: Number(meta['totalTests'] ?? 0),
        totalStrategies: Number(meta['totalStrategies'] ?? 0),
        totalApiCalls: Number(meta['totalApiCalls'] ?? 0),
        durationMs: Number(meta['durationMs'] ?? 0),
        provider: meta['provider'] ? String(meta['provider']) : undefined,
      };

      const parsedSummaries: Record<string, StrategyResultSummary> = {};
      for (const [stratName, strat] of Object.entries(summaries)) {
        const s = strat as Record<string, unknown>;
        parsedSummaries[stratName] = {
          name: String(s['name'] ?? stratName),
          correct: Number(s['correct'] ?? 0),
          total: Number(s['total'] ?? 0),
          accuracy: Number(s['accuracy'] ?? 0),
          ci95: Array.isArray(s['ci95'])
            ? [Number(s['ci95'][0]), Number(s['ci95'][1])]
            : [0, 0],
          avgInputTokens: Number(s['avgInputTokens'] ?? 0),
          avgOutputTokens: Number(s['avgOutputTokens'] ?? 0),
          avgLatencyMs: Number(s['avgLatencyMs'] ?? 0),
          accuracyPerToken: Number(s['accuracyPerToken'] ?? 0),
        };
      }

      // Use the most recent result per model (later files overwrite)
      const resultKey = `${modelName}__${parsedMeta.timestamp}`;
      results[resultKey] = {
        meta: parsedMeta,
        summaries: parsedSummaries,
        categoryBreakdown,
      };
    } catch (err) {
      console.warn(
        `[baseline-import] Error parsing ${file}: ${String(err)}`,
      );
    }
  }

  return results;
}

/**
 * Count the number of tool definitions in tool-cases.ts.
 * We parse the file to count TOOL_DEFINITIONS array entries.
 */
function countExistingTools(): number {
  if (!existsSync(PATHS.toolCases)) {
    console.warn(
      `[baseline-import] tool-cases.ts not found at ${PATHS.toolCases}`,
    );
    return 0;
  }

  const content = readFileSync(PATHS.toolCases, 'utf-8');

  // Count occurrences of "name: '" in the TOOL_DEFINITIONS array
  // This is a simple heuristic — each tool has exactly one "name:" field
  const nameMatches = content.match(/^\s+name:\s+'/gm);
  return nameMatches ? nameMatches.length : 0;
}

// ============================================================
// Public API
// ============================================================

/**
 * Import all baseline data from Phase 3 benchmark results.
 *
 * Reads:
 * - tscg-results/*.json (35 multi-model result files)
 * - data/accuracy-results.json (30 test cases x 4 conditions)
 * - src/benchmark/tool-cases.ts (25 tool definitions)
 *
 * The returned BaselineData includes "Known Good" reference metrics
 * (70-74% compression with maintained accuracy) for regression testing.
 */
export function importBaselineData(): BaselineData {
  const accuracyResults = readAccuracyResults();
  const modelResults = readModelResults();
  const existingToolCount = countExistingTools();

  return {
    accuracyResults,
    modelResults,
    existingToolCount,
    knownGoodMetrics: {
      compressionRange: [...KNOWN_GOOD_METRICS.compressionRange],
      accuracyMaintained: KNOWN_GOOD_METRICS.accuracyMaintained,
      modelsValidated: [...KNOWN_GOOD_METRICS.modelsValidated],
    },
  };
}

/**
 * Get a summary of the imported baseline data for logging/reporting.
 */
export function getBaselineSummary(data: BaselineData): string {
  const modelKeys = Object.keys(data.modelResults);
  const uniqueModels = new Set(
    modelKeys.map((k) => k.split('__')[0]),
  );

  return [
    '=== Baseline Data Summary ===',
    `Accuracy results: ${data.accuracyResults.length} rows`,
    `Model result files: ${modelKeys.length}`,
    `Unique models: ${uniqueModels.size} (${[...uniqueModels].join(', ')})`,
    `Existing tool definitions: ${data.existingToolCount}`,
    `Known-good compression: ${data.knownGoodMetrics.compressionRange[0]}-${data.knownGoodMetrics.compressionRange[1]}%`,
    `Accuracy maintained: ${data.knownGoodMetrics.accuracyMaintained}`,
    `Models validated: ${data.knownGoodMetrics.modelsValidated.length}`,
  ].join('\n');
}
