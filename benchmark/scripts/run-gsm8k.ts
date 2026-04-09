/**
 * TAB Benchmark Script — GSM8K-Under-Load
 *
 * Tests whether tool-schema context overhead degrades general math reasoning,
 * and whether TSCG compression reduces that degradation.
 *
 * Experimental design:
 *   - 50 GSM8K math questions (curated subset, easy/medium/hard)
 *   - 3 schema loads: 10, 25, 50 tools (synthetic catalogs)
 *   - 2 conditions: natural, tscg
 *   - 4 models: claude-sonnet, gpt-5.2, mistral:7b, phi4
 *   - Total: 50 questions x 3 loads x 2 conditions x 4 models = 1,200 API calls
 *
 * Key research questions:
 *   1. Does adding tool schemas to the system prompt hurt math reasoning?
 *   2. Does TSCG compression reduce the reasoning degradation?
 *   3. How do small models compare to frontier models under schema load?
 *
 * Output: benchmark/results/gsm8k/
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-gsm8k.ts
 *   npx tsx benchmark/scripts/run-gsm8k.ts --dry-run
 *   npx tsx benchmark/scripts/run-gsm8k.ts --models mistral,phi4
 *   npx tsx benchmark/scripts/run-gsm8k.ts --loads 10,25
 */

import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { BenchmarkRunner } from '../harness/runner.js';
import { isThinkingModel, adaptTask } from '../harness/types.js';
import type {
  RunConfig,
  ModelConfig,
  Condition,
  BenchmarkTask as HarnessBenchmarkTask,
  CompressedSchemaSet as HarnessCompressedSchemaSet,
  BenchmarkReport,
} from '../harness/types.js';
import {
  generateGSM8KLoadTasks,
  getGSM8KSubset,
  getSchemaLoadSizes,
} from '../tasks/generators/gsm8k-load.js';
import { generateSyntheticCatalog } from '../schemas/collectors/synthetic.js';
import { compressCollection } from '../compression/pipeline.js';
import type { CompressedSchemaSet as PipelineCompressedSchemaSet } from '../compression/pipeline.js';

// ============================================================
// Constants
// ============================================================

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'benchmark', 'results', 'gsm8k');

/** Schema load sizes for the GSM8K-under-load test */
const SCHEMA_LOAD_SIZES = [10, 25, 50] as const;

/** Conditions: natural and tscg only */
const CONDITIONS: Condition[] = ['natural', 'tscg'];

/** Single run per condition (GSM8K has 50 questions, provides enough N) */
const RUNS_PER_CONDITION = 1;

// ============================================================
// Model Definitions
// ============================================================

interface GSM8KModelDef {
  key: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'ollama' | 'together';
  model: string;
  tier: 'frontier' | 'small';
  apiKeyEnv?: string;
}

const GSM8K_MODELS: GSM8KModelDef[] = [
  {
    key: 'claude-sonnet',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    tier: 'frontier',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  {
    key: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    model: 'gpt-5.2',
    tier: 'frontier',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    key: 'mistral',
    name: 'Mistral 7B',
    provider: 'ollama',
    model: 'mistral:7b-instruct-v0.3-q4_K_M',
    tier: 'small',
  },
  {
    key: 'phi4',
    name: 'Phi-4',
    provider: 'ollama',
    model: 'phi4:latest',
    tier: 'small',
  },
];

// ============================================================
// Result Types
// ============================================================

interface GSM8KDataPoint {
  model: string;
  tier: 'frontier' | 'small';
  schemaLoad: number;
  condition: Condition;
  accuracy: number;
  meanLatencyMs: number;
  meanInputTokens: number;
  nQuestions: number;
  correctCount: number;
}

interface DegradationAnalysis {
  model: string;
  tier: 'frontier' | 'small';
  condition: Condition;
  /** Accuracy at 0 tools (baseline, no schema load) */
  baselineAccuracy: number | null;
  /** Accuracy drop from baseline to max load (in pp) */
  degradationAt10: number | null;
  degradationAt25: number | null;
  degradationAt50: number | null;
}

interface GSM8KReport {
  meta: {
    script: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    models: string[];
    schemaLoads: number[];
    conditions: Condition[];
    gsm8kQuestionCount: number;
    totalApiCalls: number;
  };
  dataPoints: GSM8KDataPoint[];
  degradationAnalysis: DegradationAnalysis[];
  rawReports: Array<{
    model: string;
    schemaLoad: number;
    report: BenchmarkReport;
  }>;
}

// ============================================================
// CLI Argument Parsing
// ============================================================

interface CLIOptions {
  dryRun: boolean;
  models: string[];
  loads: number[];
  seed: number;
}

function parseCLIArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    models: GSM8K_MODELS.map(m => m.key),
    loads: [...SCHEMA_LOAD_SIZES],
    seed: 42,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--models' && i + 1 < args.length) {
      options.models = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--loads' && i + 1 < args.length) {
      options.loads = args[++i].split(',').map(s => parseInt(s.trim(), 10));
    } else if (arg === '--seed' && i + 1 < args.length) {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
TAB GSM8K-Under-Load Benchmark

Usage:
  npx tsx benchmark/scripts/run-gsm8k.ts [options]

Options:
  --dry-run          Print configuration without running benchmarks
  --models LIST      Comma-separated model keys (default: all)
                     Available: ${GSM8K_MODELS.map(m => m.key).join(', ')}
  --loads LIST       Comma-separated schema load sizes (default: 10,25,50)
  --seed N           Random seed for synthetic catalog generation (default: 42)
  --help, -h         Show this help message

Examples:
  npx tsx benchmark/scripts/run-gsm8k.ts --dry-run
  npx tsx benchmark/scripts/run-gsm8k.ts --models mistral,phi4 --loads 10,25
  npx tsx benchmark/scripts/run-gsm8k.ts --seed 123
`);
}

// ============================================================
// Schema Set Adapter
// ============================================================

/**
 * Convert the pipeline's CompressedSchemaSet to harness format.
 */
function adaptSchemaSet(pipelineResult: PipelineCompressedSchemaSet): HarnessCompressedSchemaSet {
  return {
    natural: pipelineResult.conditions.natural.text,
    tscg: pipelineResult.conditions.tscg.text,
    tscg_sad: pipelineResult.conditions.tscg_sad.text,
  };
}

/**
 * Create an empty schema set (for the 0-tool baseline).
 */
function emptySchemaSet(): HarnessCompressedSchemaSet {
  return {
    natural: '',
    tscg: '',
    tscg_sad: '',
  };
}

// ============================================================
// Model Config Builder
// ============================================================

/**
 * Build a ModelConfig from a GSM8KModelDef, resolving API keys from
 * environment variables.
 */
function buildModelConfig(modelDef: GSM8KModelDef): ModelConfig | null {
  // Check for required API key
  if (modelDef.apiKeyEnv) {
    const apiKey = process.env[modelDef.apiKeyEnv];
    if (!apiKey) {
      console.warn(
        `  WARNING: ${modelDef.name} requires ${modelDef.apiKeyEnv} environment variable. ` +
        `Skipping this model.`,
      );
      return null;
    }
    return {
      name: modelDef.name,
      provider: modelDef.provider,
      model: modelDef.model,
      apiKey,
    };
  }

  // Ollama models: no API key needed
  return {
    name: modelDef.name,
    provider: modelDef.provider,
    model: modelDef.model,
    baseUrl: modelDef.provider === 'ollama' ? 'http://localhost:11434' : undefined,
  };
}

// ============================================================
// Thinking Model Safety Check
// ============================================================

function validateModels(models: GSM8KModelDef[]): GSM8KModelDef[] {
  const valid: GSM8KModelDef[] = [];

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

  return valid;
}

// ============================================================
// Degradation Analysis
// ============================================================

/**
 * Compute reasoning degradation: how much does accuracy drop from baseline
 * (0 tools) when schema load increases?
 */
function computeDegradationAnalysis(
  dataPoints: GSM8KDataPoint[],
  models: GSM8KModelDef[],
): DegradationAnalysis[] {
  const results: DegradationAnalysis[] = [];

  for (const modelDef of models) {
    for (const condition of CONDITIONS) {
      const modelConditionData = dataPoints.filter(
        d => d.model === modelDef.name && d.condition === condition,
      );

      // Baseline: 0-tool accuracy (if available)
      const baseline = modelConditionData.find(d => d.schemaLoad === 0);
      const baselineAcc = baseline?.accuracy ?? null;

      // Degradation at each load size
      const at10 = modelConditionData.find(d => d.schemaLoad === 10);
      const at25 = modelConditionData.find(d => d.schemaLoad === 25);
      const at50 = modelConditionData.find(d => d.schemaLoad === 50);

      results.push({
        model: modelDef.name,
        tier: modelDef.tier,
        condition,
        baselineAccuracy: baselineAcc,
        degradationAt10:
          baselineAcc !== null && at10
            ? (baselineAcc - at10.accuracy) * 100
            : null,
        degradationAt25:
          baselineAcc !== null && at25
            ? (baselineAcc - at25.accuracy) * 100
            : null,
        degradationAt50:
          baselineAcc !== null && at50
            ? (baselineAcc - at50.accuracy) * 100
            : null,
      });
    }
  }

  return results;
}

// ============================================================
// GSM8K Task Filtering
// ============================================================

/**
 * Filter GSM8K tasks to a specific schema load size.
 *
 * The generator produces tasks for all load sizes (0, 10, 25, 50).
 * This function filters to a single load size for focused evaluation.
 */
function filterTasksByLoad(
  allTasks: ReturnType<typeof generateGSM8KLoadTasks>,
  schemaLoad: number,
): HarnessBenchmarkTask[] {
  return allTasks
    .filter(t => t.metadata.schema_load_tools === schemaLoad)
    .map(t => adaptTask(t));
}

// ============================================================
// Main Execution
// ============================================================

async function main(): Promise<void> {
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  const cliOptions = parseCLIArgs();

  // Filter models based on CLI selection
  let selectedModels = GSM8K_MODELS.filter(m => cliOptions.models.includes(m.key));
  if (selectedModels.length === 0) {
    console.error(`No valid models selected. Available: ${GSM8K_MODELS.map(m => m.key).join(', ')}`);
    process.exit(1);
  }

  // LUECKE 2: Validate no thinking models
  selectedModels = validateModels(selectedModels);

  // Include load=0 as baseline (no schema overhead)
  const allLoads = [0, ...cliOptions.loads].filter((v, i, a) => a.indexOf(v) === i);

  const gsm8kSubset = getGSM8KSubset();
  const questionCount = gsm8kSubset.length;

  // Compute total API calls
  const totalApiCalls = selectedModels.length * allLoads.length *
    CONDITIONS.length * RUNS_PER_CONDITION * questionCount;

  // Print configuration
  console.log('\n' + '='.repeat(80));
  console.log('  TAB GSM8K-Under-Load Benchmark');
  console.log('='.repeat(80));
  console.log(`  Models:          ${selectedModels.map(m => `${m.name} [${m.tier}]`).join(', ')}`);
  console.log(`  Schema loads:    ${allLoads.join(', ')} tools`);
  console.log(`  Conditions:      ${CONDITIONS.join(', ')}`);
  console.log(`  GSM8K questions: ${questionCount}`);
  console.log(`  Runs/condition:  ${RUNS_PER_CONDITION}`);
  console.log(`  Total API calls: ~${totalApiCalls}`);
  console.log(`  Seed:            ${cliOptions.seed}`);
  console.log(`  Output:          ${OUTPUT_DIR}`);
  console.log('='.repeat(80) + '\n');

  if (cliOptions.dryRun) {
    console.log('  [DRY RUN] Configuration printed above. No benchmarks will run.\n');

    // Show schema compression preview
    console.log('  Schema compression preview:');
    for (const load of allLoads) {
      if (load === 0) {
        console.log(`    ${load} tools: (no schemas, baseline)`);
        continue;
      }
      const catalog = generateSyntheticCatalog(load, cliOptions.seed);
      const compressed = compressCollection(catalog);
      console.log(
        `    ${load} tools: natural=${compressed.conditions.natural.tokens} tokens, ` +
        `tscg=${compressed.conditions.tscg.tokens} tokens ` +
        `(${compressed.savings.tscg.percent}% savings)`,
      );
    }

    console.log(`\n  GSM8K question distribution:`);
    const easy = gsm8kSubset.filter(q => q.difficulty === 'easy').length;
    const medium = gsm8kSubset.filter(q => q.difficulty === 'medium').length;
    const hard = gsm8kSubset.filter(q => q.difficulty === 'hard').length;
    console.log(`    Easy: ${easy}, Medium: ${medium}, Hard: ${hard}`);
    console.log('');
    return;
  }

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate all GSM8K tasks (all load sizes)
  const allGSM8KTasks = generateGSM8KLoadTasks();

  // Pre-compute schema sets for each load size
  const schemaCache = new Map<number, HarnessCompressedSchemaSet>();
  for (const load of allLoads) {
    if (load === 0) {
      schemaCache.set(0, emptySchemaSet());
    } else {
      const catalog = generateSyntheticCatalog(load, cliOptions.seed);
      const compressed = compressCollection(catalog);
      schemaCache.set(load, adaptSchemaSet(compressed));
    }
  }

  // ---- Execute benchmarks ----

  const dataPoints: GSM8KDataPoint[] = [];
  const rawReports: GSM8KReport['rawReports'] = [];

  for (const modelDef of selectedModels) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Model: ${modelDef.name} [${modelDef.tier}]`);
    console.log(`${'─'.repeat(60)}`);

    const modelConfig = buildModelConfig(modelDef);
    if (!modelConfig) {
      console.log(`  Skipping ${modelDef.name} (no API key)`);
      continue;
    }

    for (const load of allLoads) {
      const tasks = filterTasksByLoad(allGSM8KTasks, load);
      if (tasks.length === 0) {
        console.log(`  No tasks for load=${load}, skipping`);
        continue;
      }

      const schemas = schemaCache.get(load)!;

      const runOutputDir = join(
        OUTPUT_DIR,
        `${modelDef.key}_${load}tools`,
      );

      const runConfig: RunConfig = {
        scenario: 'GSM8K',
        models: [modelConfig],
        conditions: CONDITIONS,
        runsPerCondition: RUNS_PER_CONDITION,
        outputDir: runOutputDir,
        maxConcurrent: 1,
        retryAttempts: 2,
        retryDelayMs: modelDef.provider === 'ollama' ? 500 : 2000,
      };

      console.log(`\n  Running: ${modelDef.name} x ${load} tools x ${tasks.length} GSM8K questions ...`);

      const runner = new BenchmarkRunner(runConfig);
      const report = await runner.run(tasks, schemas);

      rawReports.push({ model: modelDef.name, schemaLoad: load, report });

      // Extract data points
      for (const agg of report.aggregates) {
        // Count GSM8K-specific correct answers
        const gsm8kResults = report.results.filter(
          r => r.model === modelDef.name && r.condition === agg.condition,
        );
        const correctCount = gsm8kResults.filter(r => r.scores.gsm8k_correct === true).length;
        const meanLatency = gsm8kResults.length > 0
          ? gsm8kResults.reduce((s, r) => s + r.metrics.total_latency_ms, 0) / gsm8kResults.length
          : 0;
        const meanInputTokens = gsm8kResults.length > 0
          ? gsm8kResults.reduce((s, r) => s + r.metrics.input_tokens, 0) / gsm8kResults.length
          : 0;

        dataPoints.push({
          model: modelDef.name,
          tier: modelDef.tier,
          schemaLoad: load,
          condition: agg.condition,
          accuracy: agg.accuracy.mean,
          meanLatencyMs: Math.round(meanLatency),
          meanInputTokens: Math.round(meanInputTokens),
          nQuestions: gsm8kResults.length,
          correctCount,
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

  // ---- Degradation Analysis ----

  console.log('\n' + '='.repeat(80));
  console.log('  REASONING DEGRADATION ANALYSIS');
  console.log('='.repeat(80) + '\n');

  const degradation = computeDegradationAnalysis(dataPoints, selectedModels);

  console.log('  Model              | Tier     | Condition | Baseline | @10t  | @25t  | @50t');
  console.log('  ' + '─'.repeat(85));

  for (const d of degradation) {
    const baseStr = d.baselineAccuracy !== null ? `${(d.baselineAccuracy * 100).toFixed(1)}%` : 'N/A';
    const d10Str = d.degradationAt10 !== null ? `${d.degradationAt10 > 0 ? '-' : '+'}${Math.abs(d.degradationAt10).toFixed(1)}pp` : 'N/A';
    const d25Str = d.degradationAt25 !== null ? `${d.degradationAt25 > 0 ? '-' : '+'}${Math.abs(d.degradationAt25).toFixed(1)}pp` : 'N/A';
    const d50Str = d.degradationAt50 !== null ? `${d.degradationAt50 > 0 ? '-' : '+'}${Math.abs(d.degradationAt50).toFixed(1)}pp` : 'N/A';

    console.log(
      `  ${d.model.padEnd(20)} | ${d.tier.padEnd(8)} | ${d.condition.padEnd(9)} | ${baseStr.padEnd(8)} | ${d10Str.padEnd(5)} | ${d25Str.padEnd(5)} | ${d50Str}`,
    );
  }

  // Summary: compare natural vs TSCG degradation
  console.log('\n  Key finding: Does TSCG reduce reasoning degradation at 50 tools?');
  console.log('  ' + '─'.repeat(70));

  for (const modelDef of selectedModels) {
    const natDeg = degradation.find(
      d => d.model === modelDef.name && d.condition === 'natural',
    );
    const tscgDeg = degradation.find(
      d => d.model === modelDef.name && d.condition === 'tscg',
    );

    if (natDeg?.degradationAt50 !== null && tscgDeg?.degradationAt50 !== null &&
        natDeg?.degradationAt50 !== undefined && tscgDeg?.degradationAt50 !== undefined) {
      const protection = natDeg.degradationAt50 - tscgDeg.degradationAt50;
      console.log(
        `  ${modelDef.name.padEnd(20)} | ` +
        `natural: -${natDeg.degradationAt50.toFixed(1)}pp | ` +
        `tscg: -${tscgDeg.degradationAt50.toFixed(1)}pp | ` +
        `TSCG protects ${protection.toFixed(1)}pp`,
      );
    }
  }

  // ---- Save Complete Report ----

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const fullReport: GSM8KReport = {
    meta: {
      script: 'benchmark/scripts/run-gsm8k.ts',
      startTime,
      endTime,
      durationMs,
      models: selectedModels.map(m => m.name),
      schemaLoads: allLoads,
      conditions: CONDITIONS,
      gsm8kQuestionCount: questionCount,
      totalApiCalls,
    },
    dataPoints,
    degradationAnalysis: degradation,
    rawReports,
  };

  const reportPath = join(OUTPUT_DIR, 'gsm8k-report.json');
  writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), 'utf-8');
  console.log(`\n  Full report saved: ${reportPath}`);

  // Save degradation data as CSV for plotting
  const csvPath = join(OUTPUT_DIR, 'gsm8k-data.csv');
  const csvHeader = 'model,tier,schema_load,condition,accuracy,correct_count,n_questions,mean_latency_ms,mean_input_tokens';
  const csvRows = dataPoints.map(d =>
    `${d.model},${d.tier},${d.schemaLoad},${d.condition},${d.accuracy.toFixed(4)},${d.correctCount},${d.nQuestions},${d.meanLatencyMs},${d.meanInputTokens}`,
  );
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf-8');
  console.log(`  Data CSV:          ${csvPath}`);

  // Save degradation analysis as CSV
  const degCsvPath = join(OUTPUT_DIR, 'degradation-analysis.csv');
  const degHeader = 'model,tier,condition,baseline_accuracy,degradation_10t,degradation_25t,degradation_50t';
  const degRows = degradation.map(d =>
    `${d.model},${d.tier},${d.condition},${d.baselineAccuracy?.toFixed(4) ?? ''},${d.degradationAt10?.toFixed(1) ?? ''},${d.degradationAt25?.toFixed(1) ?? ''},${d.degradationAt50?.toFixed(1) ?? ''}`,
  );
  writeFileSync(degCsvPath, [degHeader, ...degRows].join('\n'), 'utf-8');
  console.log(`  Degradation CSV:   ${degCsvPath}`);

  console.log(`\n  Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================
// Entry Point
// ============================================================

main().catch((err) => {
  console.error('\nFatal error in GSM8K-Under-Load benchmark:', err);
  process.exit(1);
});
