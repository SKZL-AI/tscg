/**
 * TAB Benchmark Script — Scenario D: Small-Model Stress-Test
 *
 * Tests how small (<= 8B parameter) models handle increasing tool catalog
 * sizes, comparing natural vs TSCG-compressed schemas.
 *
 * Models (all via Ollama):
 *   - Mistral 7B    (mistral:7b-instruct-v0.3-q4_K_M)
 *   - Phi-4         (phi4:latest)
 *   - Gemma 3 4B    (gemma3:4b)
 *   - Llama 3.1 8B  (llama3.1:8b)
 *   - Qwen3 3B      (qwen3:3b)
 *
 * Experimental design:
 *   - Catalog sizes: 3, 5, 10, 15, 20, 30, 50
 *   - Conditions: natural, tscg (NO tscg_sad for non-Claude models)
 *   - 3 runs per condition
 *   - Temperature: 0
 *
 * Key hypothesis:
 *   7B model + 50 tools + natural schema -> accuracy < 20%
 *   7B model + 50 tools + TSCG schema   -> accuracy > 65%
 *
 * Contingency plans:
 *   Plan B: If ARR < 80% at 50 tools -> focus on 3-25 tools scaling curve
 *   Plan C: If < 5pp improvement -> log warning, continue data collection
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-small-models.ts
 *   npx tsx benchmark/scripts/run-small-models.ts --dry-run
 *   npx tsx benchmark/scripts/run-small-models.ts --models mistral,phi4
 *   npx tsx benchmark/scripts/run-small-models.ts --sizes 3,5,10
 */

import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { BenchmarkRunner } from '../harness/runner.js';
import { isThinkingModel } from '../harness/types.js';
import type {
  RunConfig,
  ModelConfig,
  Condition,
  BenchmarkTask as HarnessBenchmarkTask,
  CompressedSchemaSet as HarnessCompressedSchemaSet,
  BenchmarkReport,
} from '../harness/types.js';
import { adaptTask } from '../harness/types.js';
import { generateSyntheticCatalog } from '../schemas/collectors/synthetic.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';
import { compressCollection } from '../compression/pipeline.js';
import type { CompressedSchemaSet as PipelineCompressedSchemaSet } from '../compression/pipeline.js';

// ============================================================
// Constants
// ============================================================

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'benchmark', 'results', 'small-models');

/** Catalog sizes for the scaling stress test */
const CATALOG_SIZES = [3, 5, 10, 15, 20, 30, 50] as const;

/** Conditions: natural and tscg only (NO tscg_sad for non-Claude models) */
const CONDITIONS: Condition[] = ['natural', 'tscg'];

/** Runs per condition for statistical significance */
const RUNS_PER_CONDITION = 3;

/** Accuracy threshold for "failure" */
const FAILURE_THRESHOLD = 0.50;

// ============================================================
// Model Definitions
// ============================================================

interface SmallModelDef {
  key: string;
  name: string;
  model: string;
  paramSize: string;
}

const SMALL_MODELS: SmallModelDef[] = [
  {
    key: 'mistral',
    name: 'Mistral 7B',
    model: 'mistral:7b-instruct-v0.3-q4_K_M',
    paramSize: '7B',
  },
  {
    key: 'phi4',
    name: 'Phi-4',
    model: 'phi4:latest',
    paramSize: '14B',
  },
  {
    key: 'gemma3',
    name: 'Gemma 3 4B',
    model: 'gemma3:4b',
    paramSize: '4B',
  },
  {
    key: 'llama3.1',
    name: 'Llama 3.1 8B',
    model: 'llama3.1:8b',
    paramSize: '8B',
  },
  {
    key: 'qwen3',
    name: 'Qwen3 4B',
    model: 'qwen3:4b',
    paramSize: '4B',
  },
  {
    key: 'qwen3-14b',
    name: 'Qwen3 14B',
    model: 'qwen3:14b',
    paramSize: '14B',
  },
  {
    key: 'gemma3-12b',
    name: 'Gemma 3 12B',
    model: 'gemma3:12b',
    paramSize: '12B',
  },
];

// ============================================================
// Threshold Analysis Types
// ============================================================

interface ThresholdResult {
  model: string;
  paramSize: string;
  /** Largest catalog size where natural accuracy >= 50% */
  naturalThreshold: number | null;
  /** Largest catalog size where TSCG accuracy >= 50% */
  tscgThreshold: number | null;
  /** Difference in threshold catalog sizes */
  thresholdImprovement: number | null;
  /** Accuracy at 50 tools (natural) */
  naturalAccAt50: number | null;
  /** Accuracy at 50 tools (TSCG) */
  tscgAccAt50: number | null;
  /** Accuracy improvement at 50 tools (pp) */
  improvementAt50pp: number | null;
}

interface ScalingDataPoint {
  model: string;
  catalogSize: number;
  condition: Condition;
  accuracy: number;
  toolSelectionAccuracy: number;
  parameterF1: number;
  nTasks: number;
}

interface SmallModelReport {
  meta: {
    script: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    models: string[];
    catalogSizes: number[];
    conditions: Condition[];
    runsPerCondition: number;
  };
  thresholdAnalysis: ThresholdResult[];
  scalingCurve: ScalingDataPoint[];
  contingency: {
    planBTriggered: boolean;
    planCTriggered: boolean;
    details: string[];
  };
  rawReports: Array<{
    model: string;
    catalogSize: number;
    report: BenchmarkReport;
  }>;
}

// ============================================================
// CLI Argument Parsing
// ============================================================

interface CLIOptions {
  dryRun: boolean;
  models: string[];
  sizes: number[];
  seed: number;
  conditions: Condition[];
}

function parseCLIArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    models: SMALL_MODELS.map(m => m.key),
    sizes: [...CATALOG_SIZES],
    seed: 42,
    conditions: [...CONDITIONS],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--models' && i + 1 < args.length) {
      options.models = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--sizes' && i + 1 < args.length) {
      options.sizes = args[++i].split(',').map(s => parseInt(s.trim(), 10));
    } else if (arg === '--seed' && i + 1 < args.length) {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === '--conditions' && i + 1 < args.length) {
      options.conditions = args[++i].split(',').map(s => s.trim()) as Condition[];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
TAB Scenario D: Small-Model Stress-Test

Usage:
  npx tsx benchmark/scripts/run-small-models.ts [options]

Options:
  --dry-run          Print configuration without running benchmarks
  --models LIST      Comma-separated model keys (default: all)
                     Available: ${SMALL_MODELS.map(m => m.key).join(', ')}
  --sizes LIST       Comma-separated catalog sizes (default: 3,5,10,15,20,30,50)
  --seed N           Random seed for synthetic catalog generation (default: 42)
  --help, -h         Show this help message

Examples:
  npx tsx benchmark/scripts/run-small-models.ts --dry-run
  npx tsx benchmark/scripts/run-small-models.ts --models mistral,phi4 --sizes 3,5,10
  npx tsx benchmark/scripts/run-small-models.ts --seed 123
`);
}

// ============================================================
// Pipeline Compressed -> Harness Compressed Schema Set Adapter
// ============================================================

/**
 * Convert the pipeline's CompressedSchemaSet to the harness's CompressedSchemaSet format.
 * The harness expects { natural: string, tscg: string, tscg_sad: string }.
 * For small models, we exclude tscg_sad but still provide a placeholder.
 */
function adaptSchemaSet(pipelineResult: PipelineCompressedSchemaSet): HarnessCompressedSchemaSet {
  return {
    natural: pipelineResult.conditions.natural.text,
    tscg: pipelineResult.conditions.tscg.text,
    // Small models don't use tscg_sad, but harness type requires it.
    // Use tscg as fallback (will never be selected due to CONDITIONS filter).
    tscg_sad: pipelineResult.conditions.tscg_sad.text,
    tscg_conservative: pipelineResult.conditions.tscg_conservative.text,
  };
}

// ============================================================
// Thinking Model Safety Check
// ============================================================

/**
 * Validate that none of the selected models are thinking models (LUECKE 2).
 * This is a critical safety check -- thinking models produce reasoning traces
 * that interfere with structured output.
 */
function validateModels(models: SmallModelDef[]): SmallModelDef[] {
  const valid: SmallModelDef[] = [];

  for (const model of models) {
    const thinkingPattern = isThinkingModel(model.model);
    if (thinkingPattern) {
      console.warn(
        `\n  WARNING [LUECKE 2]: Excluding thinking model "${model.name}" (${model.model})` +
        `\n  Matched pattern: "${thinkingPattern}"` +
        `\n  Thinking models are excluded from TAB evaluation.\n`,
      );
    } else {
      valid.push(model);
    }
  }

  if (valid.length === 0) {
    throw new Error(
      'All configured models are thinking models. ' +
      'Please add at least one non-thinking model.',
    );
  }

  return valid;
}

// ============================================================
// Threshold Analysis
// ============================================================

/**
 * Compute the catalog-size threshold where accuracy drops below 50%
 * for each model under each condition.
 */
function computeThresholdAnalysis(
  scalingData: ScalingDataPoint[],
  models: SmallModelDef[],
): ThresholdResult[] {
  const results: ThresholdResult[] = [];

  for (const modelDef of models) {
    const modelData = scalingData.filter(d => d.model === modelDef.name);

    // Find threshold for natural condition
    const naturalData = modelData
      .filter(d => d.condition === 'natural')
      .sort((a, b) => a.catalogSize - b.catalogSize);

    let naturalThreshold: number | null = null;
    for (const point of naturalData) {
      if (point.accuracy >= FAILURE_THRESHOLD) {
        naturalThreshold = point.catalogSize;
      }
    }

    // Find threshold for TSCG condition
    const tscgData = modelData
      .filter(d => d.condition === 'tscg')
      .sort((a, b) => a.catalogSize - b.catalogSize);

    let tscgThreshold: number | null = null;
    for (const point of tscgData) {
      if (point.accuracy >= FAILURE_THRESHOLD) {
        tscgThreshold = point.catalogSize;
      }
    }

    // Accuracy at 50 tools
    const naturalAt50 = naturalData.find(d => d.catalogSize === 50);
    const tscgAt50 = tscgData.find(d => d.catalogSize === 50);

    const naturalAccAt50 = naturalAt50?.accuracy ?? null;
    const tscgAccAt50 = tscgAt50?.accuracy ?? null;
    const improvementAt50pp =
      naturalAccAt50 !== null && tscgAccAt50 !== null
        ? (tscgAccAt50 - naturalAccAt50) * 100
        : null;

    const thresholdImprovement =
      naturalThreshold !== null && tscgThreshold !== null
        ? tscgThreshold - naturalThreshold
        : null;

    results.push({
      model: modelDef.name,
      paramSize: modelDef.paramSize,
      naturalThreshold,
      tscgThreshold,
      thresholdImprovement,
      naturalAccAt50,
      tscgAccAt50,
      improvementAt50pp,
    });
  }

  return results;
}

// ============================================================
// Contingency Evaluation
// ============================================================

interface ContingencyResult {
  planBTriggered: boolean;
  planCTriggered: boolean;
  details: string[];
}

/**
 * Evaluate contingency plans based on results.
 *
 * Plan B: If ARR < 80% at 50 tools -> focus on 3-25 tools scaling curve
 * Plan C: If < 5pp improvement -> log warning, continue data collection
 */
function evaluateContingency(
  scalingData: ScalingDataPoint[],
  thresholds: ThresholdResult[],
): ContingencyResult {
  const details: string[] = [];
  let planBTriggered = false;
  let planCTriggered = false;

  // Plan B check: ARR at 50 tools across models
  for (const threshold of thresholds) {
    if (threshold.naturalAccAt50 !== null && threshold.tscgAccAt50 !== null) {
      const arr = threshold.naturalAccAt50 > 0
        ? threshold.tscgAccAt50 / threshold.naturalAccAt50
        : 0;

      if (arr < 0.80) {
        planBTriggered = true;
        details.push(
          `[Plan B] ${threshold.model}: ARR at 50 tools = ${(arr * 100).toFixed(1)}% (< 80%). ` +
          `Focus analysis on 3-25 tools scaling curve.`,
        );
      }
    }
  }

  // Plan C check: < 5pp improvement at any catalog size
  const models = [...new Set(scalingData.map(d => d.model))];
  for (const model of models) {
    const modelData = scalingData.filter(d => d.model === model);

    for (const size of CATALOG_SIZES) {
      const natural = modelData.find(d => d.condition === 'natural' && d.catalogSize === size);
      const tscg = modelData.find(d => d.condition === 'tscg' && d.catalogSize === size);

      if (natural && tscg) {
        const improvementPp = (tscg.accuracy - natural.accuracy) * 100;
        if (improvementPp < 5 && size >= 10) {
          planCTriggered = true;
          details.push(
            `[Plan C] ${model} at ${size} tools: improvement = ${improvementPp.toFixed(1)}pp (< 5pp). ` +
            `Continuing data collection.`,
          );
        }
      }
    }
  }

  return { planBTriggered, planCTriggered, details };
}

// ============================================================
// Main Execution
// ============================================================

async function main(): Promise<void> {
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  const cliOptions = parseCLIArgs();

  // Filter models based on CLI selection
  let selectedModels = SMALL_MODELS.filter(m => cliOptions.models.includes(m.key));
  if (selectedModels.length === 0) {
    console.error(`No valid models selected. Available: ${SMALL_MODELS.map(m => m.key).join(', ')}`);
    process.exit(1);
  }

  // LUECKE 2: Validate no thinking models
  selectedModels = validateModels(selectedModels);

  const selectedSizes = cliOptions.sizes;
  const selectedConditions = cliOptions.conditions;

  // Print configuration
  console.log('\n' + '='.repeat(80));
  console.log('  TAB Scenario D: Small-Model Stress-Test');
  console.log('='.repeat(80));
  console.log(`  Models:          ${selectedModels.map(m => `${m.name} (${m.paramSize})`).join(', ')}`);
  console.log(`  Catalog sizes:   ${selectedSizes.join(', ')}`);
  console.log(`  Conditions:      ${selectedConditions.join(', ')}`);
  console.log(`  Runs/condition:  ${RUNS_PER_CONDITION}`);
  console.log(`  Seed:            ${cliOptions.seed}`);
  console.log(`  Output:          ${OUTPUT_DIR}`);

  // Compute total API calls
  const tasksPerCatalog = 20; // 8 + 4 + 4 + 4 from generators
  const totalCalls = selectedModels.length * selectedSizes.length *
    selectedConditions.length * RUNS_PER_CONDITION * tasksPerCatalog;
  console.log(`  Total API calls: ~${totalCalls}`);
  console.log('='.repeat(80) + '\n');

  if (cliOptions.dryRun) {
    console.log('  [DRY RUN] Configuration printed above. No benchmarks will run.\n');

    // Still generate catalogs and show compression stats
    console.log('  Compression preview (synthetic catalogs):');
    for (const size of selectedSizes) {
      const catalog = generateSyntheticCatalog(size, cliOptions.seed);
      const compressed = compressCollection(catalog);
      console.log(
        `    ${size} tools: natural=${compressed.conditions.natural.tokens} tokens, ` +
        `tscg=${compressed.conditions.tscg.tokens} tokens ` +
        `(${compressed.savings.tscg.percent}% savings)`,
      );
    }
    console.log('');
    return;
  }

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ---- Execute benchmarks ----

  const scalingData: ScalingDataPoint[] = [];
  const rawReports: SmallModelReport['rawReports'] = [];

  for (const size of selectedSizes) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Catalog size: ${size} tools`);
    console.log(`${'─'.repeat(60)}`);

    // Generate synthetic catalog and tasks
    const catalog = generateSyntheticCatalog(size, cliOptions.seed);
    // Override scenario to 'D' for stress-test context
    catalog.scenario = 'D';

    const rawTasks = generateTasksForCollection(catalog, cliOptions.seed);
    const tasks: HarnessBenchmarkTask[] = rawTasks.map(t => adaptTask(t));

    // Compress schemas
    const pipelineSchemas = compressCollection(catalog);
    const harnessSchemas = adaptSchemaSet(pipelineSchemas);

    console.log(
      `  Schemas: natural=${pipelineSchemas.conditions.natural.tokens} tokens, ` +
      `tscg=${pipelineSchemas.conditions.tscg.tokens} tokens ` +
      `(${pipelineSchemas.savings.tscg.percent}% savings)`,
    );
    console.log(`  Tasks generated: ${tasks.length}`);

    // Run each model against this catalog size
    for (const modelDef of selectedModels) {
      const modelConfig: ModelConfig = {
        name: modelDef.name,
        provider: 'ollama',
        model: modelDef.model,
        // Ollama runs locally, no API key needed
        baseUrl: 'http://localhost:11434',
      };

      const runOutputDir = join(
        OUTPUT_DIR,
        `${modelDef.key}_${size}tools`,
      );

      const runConfig: RunConfig = {
        scenario: 'D',
        models: [modelConfig],
        conditions: selectedConditions,
        runsPerCondition: RUNS_PER_CONDITION,
        outputDir: runOutputDir,
        maxConcurrent: 1, // Sequential for local models
        retryAttempts: 2,
        retryDelayMs: 1000,
      };

      console.log(`\n  Running: ${modelDef.name} (${modelDef.paramSize}) x ${size} tools ...`);

      const runner = new BenchmarkRunner(runConfig);
      const report = await runner.run(tasks, harnessSchemas);

      rawReports.push({ model: modelDef.name, catalogSize: size, report });

      // Extract scaling data points from aggregates
      for (const agg of report.aggregates) {
        scalingData.push({
          model: modelDef.name,
          catalogSize: size,
          condition: agg.condition,
          accuracy: agg.accuracy.mean,
          toolSelectionAccuracy: agg.tool_selection_accuracy.mean,
          parameterF1: agg.parameter_f1.mean,
          nTasks: agg.n_tasks,
        });
      }

      // Save individual report
      mkdirSync(runOutputDir, { recursive: true });
      writeFileSync(
        join(runOutputDir, 'report.json'),
        JSON.stringify(report, null, 2),
        'utf-8',
      );
    }
  }

  // ---- Threshold Analysis ----

  console.log('\n' + '='.repeat(80));
  console.log('  THRESHOLD ANALYSIS');
  console.log('='.repeat(80) + '\n');

  const thresholds = computeThresholdAnalysis(scalingData, selectedModels);

  console.log('  Model              | Params | Natural Threshold | TSCG Threshold | Improvement');
  console.log('  ' + '─'.repeat(85));

  for (const t of thresholds) {
    const natStr = t.naturalThreshold !== null ? `${t.naturalThreshold} tools` : 'N/A';
    const tscgStr = t.tscgThreshold !== null ? `${t.tscgThreshold} tools` : 'N/A';
    const impStr = t.thresholdImprovement !== null ? `+${t.thresholdImprovement} tools` : 'N/A';
    console.log(
      `  ${t.model.padEnd(20)} | ${t.paramSize.padEnd(6)} | ${natStr.padEnd(17)} | ${tscgStr.padEnd(14)} | ${impStr}`,
    );
  }

  // Print accuracy at 50 tools (key hypothesis)
  console.log('\n  Accuracy at 50 tools (key hypothesis: natural <20%, TSCG >65%):');
  console.log('  ' + '─'.repeat(70));

  for (const t of thresholds) {
    const natAcc = t.naturalAccAt50 !== null ? `${(t.naturalAccAt50 * 100).toFixed(1)}%` : 'N/A';
    const tscgAcc = t.tscgAccAt50 !== null ? `${(t.tscgAccAt50 * 100).toFixed(1)}%` : 'N/A';
    const impPp = t.improvementAt50pp !== null ? `+${t.improvementAt50pp.toFixed(1)}pp` : 'N/A';
    console.log(
      `  ${t.model.padEnd(20)} | natural=${natAcc.padEnd(8)} | tscg=${tscgAcc.padEnd(8)} | ${impPp}`,
    );
  }

  // ---- Contingency Evaluation ----

  const contingency = evaluateContingency(scalingData, thresholds);

  if (contingency.planBTriggered || contingency.planCTriggered) {
    console.log('\n  CONTINGENCY ALERTS:');
    for (const detail of contingency.details) {
      console.log(`    ${detail}`);
    }
  } else {
    console.log('\n  No contingency plans triggered.');
  }

  // ---- Save Complete Report ----

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const fullReport: SmallModelReport = {
    meta: {
      script: 'benchmark/scripts/run-small-models.ts',
      startTime,
      endTime,
      durationMs,
      models: selectedModels.map(m => m.name),
      catalogSizes: selectedSizes,
      conditions: selectedConditions,
      runsPerCondition: RUNS_PER_CONDITION,
    },
    thresholdAnalysis: thresholds,
    scalingCurve: scalingData,
    contingency,
    rawReports,
  };

  const reportPath = join(OUTPUT_DIR, 'scenario-d-report.json');
  writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), 'utf-8');
  console.log(`\n  Full report saved: ${reportPath}`);

  // Save scaling curve as CSV for easy plotting
  const csvPath = join(OUTPUT_DIR, 'scaling-curve.csv');
  const csvHeader = 'model,catalog_size,condition,accuracy,tool_selection_accuracy,parameter_f1,n_tasks';
  const csvRows = scalingData.map(d =>
    `${d.model},${d.catalogSize},${d.condition},${d.accuracy.toFixed(4)},${d.toolSelectionAccuracy.toFixed(4)},${d.parameterF1.toFixed(4)},${d.nTasks}`,
  );
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf-8');
  console.log(`  Scaling curve CSV: ${csvPath}`);

  // Save threshold analysis as CSV
  const thresholdCsvPath = join(OUTPUT_DIR, 'threshold-analysis.csv');
  const thCsvHeader = 'model,param_size,natural_threshold,tscg_threshold,threshold_improvement,natural_acc_50,tscg_acc_50,improvement_50pp';
  const thCsvRows = thresholds.map(t =>
    `${t.model},${t.paramSize},${t.naturalThreshold ?? ''},${t.tscgThreshold ?? ''},${t.thresholdImprovement ?? ''},${t.naturalAccAt50?.toFixed(4) ?? ''},${t.tscgAccAt50?.toFixed(4) ?? ''},${t.improvementAt50pp?.toFixed(1) ?? ''}`,
  );
  writeFileSync(thresholdCsvPath, [thCsvHeader, ...thCsvRows].join('\n'), 'utf-8');
  console.log(`  Threshold CSV:     ${thresholdCsvPath}`);

  console.log(`\n  Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================
// Entry Point
// ============================================================

main().catch((err) => {
  console.error('\nFatal error in Scenario D benchmark:', err);
  process.exit(1);
});
