#!/usr/bin/env npx tsx
/**
 * TAB Benchmark -- BFCL Evaluation Runner
 *
 * Runs the BFCL (Berkeley Function Calling Leaderboard) benchmark evaluation
 * using the TAB harness infrastructure.
 *
 * Evaluation methodology:
 *   1. Takes 15 BFCL function definitions (simple, multiple, relevance)
 *   2. Compresses with TSCG (3 conditions: natural, tscg, tscg_sad)
 *   3. Runs tool-selection tasks for each condition
 *   4. 3 runs per condition for statistical significance
 *   5. Target metric: 99.5% ARR at 71.7% token savings
 *
 * BFCL-specific scoring:
 *   - simple_function:      Exact match for function name + parameter extraction
 *   - multiple_function:    Sequence LCS + mean parameter F1
 *   - relevance_detection:  No tool call expected (1.0 if model abstains)
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-bfcl.ts
 *   npx tsx benchmark/scripts/run-bfcl.ts --runs 5
 *   npx tsx benchmark/scripts/run-bfcl.ts --dry-run
 *   npx tsx benchmark/scripts/run-bfcl.ts --model openai --model-name gpt-4o
 *
 * Environment:
 *   ANTHROPIC_API_KEY   - Required for Anthropic provider (default)
 *   OPENAI_API_KEY      - Required for OpenAI provider
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// -- Schema collection
import {
  collectBFCLSchemas,
  getBFCLToolsByCategory,
  BFCL_CATEGORIES,
} from '../schemas/collectors/bfcl.js';

// -- Compression pipeline
import { compressCollection } from '../compression/pipeline.js';
import type { CompressedSchemaSet as PipelineCompressedSchemaSet } from '../compression/pipeline.js';

// -- Task generators
import { generateTasksForCollection } from '../tasks/generators/index.js';

// -- Harness types & runner
import { BenchmarkRunner } from '../harness/runner.js';
import { adaptTask } from '../harness/types.js';
import type {
  RunConfig,
  ModelConfig,
  Condition,
  BenchmarkReport,
  BenchmarkTask as HarnessTask,
  CompressedSchemaSet as HarnessCompressedSchemaSet,
  AggregateMetrics,
} from '../harness/types.js';

// -- Reporters
import { saveJsonReport, saveAggregateJson } from '../harness/reporters/json-reporter.js';
import { saveCsvReport } from '../harness/reporters/csv-reporter.js';
import { saveLatexReport } from '../harness/reporters/latex-reporter.js';
import { printReport } from '../harness/reporters/console-reporter.js';

// -- Aggregation
import { aggregateResults, computeARR } from '../harness/aggregate.js';

// ============================================================
// CLI Argument Parsing
// ============================================================

interface BFCLRunOptions {
  runsPerCondition: number;
  outputDir: string;
  dryRun: boolean;
  provider: 'anthropic' | 'openai' | 'ollama' | 'together';
  modelName: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  retryAttempts: number;
  retryDelayMs: number;
  conditions: Condition[];
  latex: boolean;
  seed: number;
}

function parseCliArgs(): BFCLRunOptions {
  const args = process.argv.slice(2);
  const opts: BFCLRunOptions = {
    runsPerCondition: 3,
    outputDir: resolve('benchmark/results/bfcl'),
    dryRun: false,
    provider: 'anthropic',
    modelName: 'claude-sonnet-4',
    modelId: 'claude-sonnet-4-20250514',
    retryAttempts: 3,
    retryDelayMs: 2000,
    conditions: ['natural', 'tscg', 'tscg_sad'],
    latex: true,
    seed: 42,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--runs':
        opts.runsPerCondition = parseInt(next, 10);
        i++;
        break;
      case '--output':
        opts.outputDir = resolve(next);
        i++;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--provider':
        opts.provider = next as BFCLRunOptions['provider'];
        i++;
        break;
      case '--model-name':
        opts.modelName = next;
        i++;
        break;
      case '--model-id':
        opts.modelId = next;
        i++;
        break;
      case '--api-key':
        opts.apiKey = next;
        i++;
        break;
      case '--base-url':
        opts.baseUrl = next;
        i++;
        break;
      case '--retries':
        opts.retryAttempts = parseInt(next, 10);
        i++;
        break;
      case '--delay':
        opts.retryDelayMs = parseInt(next, 10);
        i++;
        break;
      case '--conditions':
        opts.conditions = next.split(',').map(c => c.trim()) as Condition[];
        i++;
        break;
      case '--no-latex':
        opts.latex = false;
        break;
      case '--seed':
        opts.seed = parseInt(next, 10);
        i++;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return opts;
}

function printUsage(): void {
  console.log(`
  BFCL Benchmark Runner (TAB Scenario D)

  Usage: npx tsx benchmark/scripts/run-bfcl.ts [options]

  Options:
    --runs <n>             Runs per condition (default: 3)
    --output <dir>         Output directory (default: benchmark/results/bfcl)
    --dry-run              Compress and generate tasks without API calls
    --provider <name>      LLM provider: anthropic, openai, ollama, together
    --model-name <name>    Display name for the model
    --model-id <id>        API model identifier
    --api-key <key>        API key (overrides env var)
    --base-url <url>       Custom base URL for API
    --retries <n>          Retry attempts per task (default: 3)
    --delay <ms>           Retry delay in ms (default: 2000)
    --conditions <list>    Comma-separated conditions (default: natural,tscg,tscg_sad)
    --no-latex             Skip LaTeX table generation
    --seed <n>             Random seed for task generation (default: 42)
    --help, -h             Show this help

  Environment Variables:
    ANTHROPIC_API_KEY      API key for Anthropic provider
    OPENAI_API_KEY         API key for OpenAI provider
  `);
}

// ============================================================
// BFCL-Specific Task Generation
// ============================================================

/**
 * Generate BFCL evaluation tasks with BFCL-specific ground truths.
 *
 * Produces tasks across all three BFCL categories:
 *   - simple_function:      8 single-tool selection tasks
 *   - multiple_function:    4 multi-tool + 4 param-extract tasks
 *   - relevance_detection:  4 no-tool tasks
 *
 * Task IDs follow convention: D-{category_prefix}-{number}
 */
function generateBFCLTasks(seed: number): HarnessTask[] {
  const collection = collectBFCLSchemas();

  // Use the unified generator which produces 20 tasks
  // covering single_tool, multi_tool, param_extract, and no_tool
  const rawTasks = generateTasksForCollection(collection, seed);

  // Adapt to harness format (maps 'query' -> 'user_message', normalizes ground truth)
  const harnessTasks: HarnessTask[] = rawTasks.map(task => adaptTask(task));

  return harnessTasks;
}

// ============================================================
// BFCL Compression
// ============================================================

/**
 * Compress BFCL schemas and produce the 3 experimental conditions.
 *
 * Returns both the pipeline result (with detailed metrics) and
 * the harness-compatible CompressedSchemaSet.
 */
function compressBFCLSchemas(): {
  pipeline: PipelineCompressedSchemaSet;
  harness: HarnessCompressedSchemaSet;
} {
  const collection = collectBFCLSchemas();
  const pipeline = compressCollection(collection);

  // Convert to harness format (simple string map)
  const harness: HarnessCompressedSchemaSet = {
    natural: pipeline.conditions.natural.text,
    tscg: pipeline.conditions.tscg.text,
    tscg_sad: pipeline.conditions.tscg_sad.text,
    tscg_conservative: pipeline.conditions.tscg_conservative.text,
  };

  return { pipeline, harness };
}

// ============================================================
// ARR Analysis
// ============================================================

/**
 * Compute detailed ARR (Accuracy Retention Rate) metrics.
 *
 * ARR = accuracy_tscg / accuracy_natural * 100
 * Goal: ARR >= 99.5% means <0.5% accuracy drop
 *
 * @param aggregates - Aggregated benchmark results
 * @returns ARR analysis report
 */
interface ARRAnalysis {
  model: string;
  condition: Condition;
  accuracy_natural: number;
  accuracy_condition: number;
  arr: number;
  arr_pct: number;
  meets_target: boolean;
  token_savings_pct: number;
  cost_savings_pct: number;
}

function computeARRAnalysis(aggregates: AggregateMetrics[]): ARRAnalysis[] {
  const analyses: ARRAnalysis[] = [];

  for (const agg of aggregates) {
    if (agg.condition === 'natural') continue;

    const natural = aggregates.find(
      a => a.model === agg.model && a.scenario === agg.scenario && a.condition === 'natural',
    );

    if (!natural) continue;

    const arr = computeARR(agg.accuracy.mean, natural.accuracy.mean);
    const arrPct = arr * 100;

    analyses.push({
      model: agg.model,
      condition: agg.condition,
      accuracy_natural: natural.accuracy.mean,
      accuracy_condition: agg.accuracy.mean,
      arr,
      arr_pct: arrPct,
      meets_target: arrPct >= 99.5,
      token_savings_pct: agg.token_savings_pct,
      cost_savings_pct: agg.cost_savings_pct,
    });
  }

  return analyses;
}

// ============================================================
// BFCL-Specific Result Summary
// ============================================================

interface BFCLSummary {
  timestamp: string;
  collection: {
    total_tools: number;
    categories: Record<string, number>;
  };
  compression: {
    natural_tokens: number;
    tscg_tokens: number;
    tscg_sad_tokens: number;
    tscg_savings_pct: number;
    tscg_sad_savings_pct: number;
    applied_principles: {
      tscg: string[];
      tscg_sad: string[];
    };
    compression_time_ms: {
      tscg: number;
      tscg_sad: number;
    };
  };
  tasks: {
    total: number;
    by_category: Record<string, number>;
  };
  arr_analysis: ARRAnalysis[];
  target_metrics: {
    arr_target: number;
    token_savings_target: number;
    arr_met: boolean;
    savings_met: boolean;
  };
}

function buildBFCLSummary(
  pipelineResult: PipelineCompressedSchemaSet,
  tasks: HarnessTask[],
  aggregates: AggregateMetrics[],
): BFCLSummary {
  const arrAnalysis = computeARRAnalysis(aggregates);

  // Count tasks by category (infer from task_id pattern)
  const byCategory: Record<string, number> = {};
  for (const task of tasks) {
    const cat = task.category ?? inferCategoryFromTaskId(task.task_id);
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // Check if targets are met
  const bestARR = arrAnalysis.length > 0
    ? Math.max(...arrAnalysis.map(a => a.arr_pct))
    : 0;
  const bestSavings = pipelineResult.savings.tscg.percent;

  return {
    timestamp: new Date().toISOString(),
    collection: {
      total_tools: 15,
      categories: Object.fromEntries(
        BFCL_CATEGORIES.map(c => [c.name, c.toolCount]),
      ),
    },
    compression: {
      natural_tokens: pipelineResult.conditions.natural.tokens,
      tscg_tokens: pipelineResult.conditions.tscg.tokens,
      tscg_sad_tokens: pipelineResult.conditions.tscg_sad.tokens,
      tscg_savings_pct: pipelineResult.savings.tscg.percent,
      tscg_sad_savings_pct: pipelineResult.savings.tscg_sad.percent,
      applied_principles: pipelineResult.appliedPrinciples,
      compression_time_ms: {
        tscg: pipelineResult.timings.tscg_ms,
        tscg_sad: pipelineResult.timings.tscg_sad_ms,
      },
    },
    tasks: {
      total: tasks.length,
      by_category: byCategory,
    },
    arr_analysis: arrAnalysis,
    target_metrics: {
      arr_target: 99.5,
      token_savings_target: 71.7,
      arr_met: bestARR >= 99.5,
      savings_met: bestSavings >= 71.7,
    },
  };
}

function inferCategoryFromTaskId(taskId: string): string {
  if (taskId.includes('-ts-')) return 'single_tool';
  if (taskId.includes('-mt-')) return 'multi_tool';
  if (taskId.includes('-pe-')) return 'parameter_extraction';
  if (taskId.includes('-nt-')) return 'no_tool';
  return 'unknown';
}

// ============================================================
// Dry Run Mode
// ============================================================

/**
 * Execute a dry run: compress schemas and generate tasks without making
 * any API calls. Useful for validating the pipeline and checking
 * compression metrics before committing to API costs.
 */
function executeDryRun(opts: BFCLRunOptions): void {
  console.log('\n' + '='.repeat(80));
  console.log('  BFCL Benchmark -- DRY RUN');
  console.log('  (No API calls will be made)');
  console.log('='.repeat(80));

  // Step 1: Collect and compress
  console.log('\n  [1/3] Collecting BFCL schemas...');
  const collection = collectBFCLSchemas();
  console.log(`    Collected ${collection.tools.length} tools across ${BFCL_CATEGORIES.length} categories`);
  for (const cat of BFCL_CATEGORIES) {
    console.log(`      - ${cat.name}: ${cat.toolCount} tools (${cat.toolNames.join(', ')})`);
  }

  console.log('\n  [2/3] Compressing with TSCG...');
  const { pipeline } = compressBFCLSchemas();
  console.log(`    Natural:  ${pipeline.conditions.natural.tokens} tokens`);
  console.log(`    TSCG:     ${pipeline.conditions.tscg.tokens} tokens (${pipeline.savings.tscg.percent}% savings)`);
  console.log(`    TSCG+SAD: ${pipeline.conditions.tscg_sad.tokens} tokens (${pipeline.savings.tscg_sad.percent}% savings)`);
  console.log(`    Principles (TSCG):     ${pipeline.appliedPrinciples.tscg.join(', ')}`);
  console.log(`    Principles (TSCG+SAD): ${pipeline.appliedPrinciples.tscg_sad.join(', ')}`);
  console.log(`    Compression time: TSCG ${pipeline.timings.tscg_ms}ms, TSCG+SAD ${pipeline.timings.tscg_sad_ms}ms`);

  // Step 2: Generate tasks
  console.log('\n  [3/3] Generating BFCL evaluation tasks...');
  const tasks = generateBFCLTasks(opts.seed);
  console.log(`    Generated ${tasks.length} tasks`);

  const categoryMap: Record<string, number> = {};
  for (const t of tasks) {
    const cat = t.category ?? inferCategoryFromTaskId(t.task_id);
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categoryMap)) {
    console.log(`      - ${cat}: ${count} tasks`);
  }

  // Step 3: Estimate API calls
  const totalCalls = opts.conditions.length * opts.runsPerCondition * tasks.length;
  console.log(`\n  Estimated API calls: ${totalCalls}`);
  console.log(`    Conditions: ${opts.conditions.join(', ')}`);
  console.log(`    Runs per condition: ${opts.runsPerCondition}`);
  console.log(`    Tasks per run: ${tasks.length}`);

  // Step 4: Save dry-run summary
  mkdirSync(opts.outputDir, { recursive: true });
  const summaryPath = join(opts.outputDir, 'dry-run-summary.json');
  const drySummary = {
    mode: 'dry-run',
    timestamp: new Date().toISOString(),
    collection: {
      total_tools: collection.tools.length,
      categories: BFCL_CATEGORIES.map(c => ({ name: c.name, count: c.toolCount })),
    },
    compression: {
      natural_tokens: pipeline.conditions.natural.tokens,
      tscg_tokens: pipeline.conditions.tscg.tokens,
      tscg_sad_tokens: pipeline.conditions.tscg_sad.tokens,
      savings_tscg_pct: pipeline.savings.tscg.percent,
      savings_tscg_sad_pct: pipeline.savings.tscg_sad.percent,
    },
    tasks: {
      total: tasks.length,
      by_category: categoryMap,
    },
    estimated_api_calls: totalCalls,
    target_metrics: {
      arr_target: '99.5%',
      token_savings_target: '71.7%',
    },
  };
  writeFileSync(summaryPath, JSON.stringify(drySummary, null, 2), 'utf-8');
  console.log(`\n  Dry-run summary saved: ${summaryPath}`);

  // Target check
  console.log('\n  Target Assessment:');
  const savingsMet = pipeline.savings.tscg.percent >= 71.7;
  console.log(`    Token savings (TSCG): ${pipeline.savings.tscg.percent}% ${savingsMet ? '[PASS]' : '[BELOW TARGET]'} (target: 71.7%)`);
  console.log('    ARR: requires live evaluation (run without --dry-run)');

  console.log('\n' + '='.repeat(80));
  console.log('  Dry run complete. Remove --dry-run to execute with API calls.');
  console.log('='.repeat(80) + '\n');
}

// ============================================================
// Full Benchmark Execution
// ============================================================

async function executeFullBenchmark(opts: BFCLRunOptions): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('  BFCL Benchmark Runner (TAB Scenario D)');
  console.log('='.repeat(80));

  // Step 1: Resolve API key
  const apiKey = opts.apiKey ?? resolveApiKey(opts.provider);
  if (!apiKey) {
    console.error(`\n  ERROR: No API key found for provider "${opts.provider}".`);
    console.error(`  Set ${getApiKeyEnvVar(opts.provider)} or use --api-key <key>`);
    process.exit(1);
  }

  // Step 2: Collect and compress
  console.log('\n  [1/4] Collecting and compressing BFCL schemas...');
  const { pipeline, harness: schemas } = compressBFCLSchemas();
  console.log(`    Natural:  ${pipeline.conditions.natural.tokens} tokens`);
  console.log(`    TSCG:     ${pipeline.conditions.tscg.tokens} tokens (${pipeline.savings.tscg.percent}% savings)`);
  console.log(`    TSCG+SAD: ${pipeline.conditions.tscg_sad.tokens} tokens (${pipeline.savings.tscg_sad.percent}% savings)`);

  // Step 3: Generate tasks
  console.log('\n  [2/4] Generating BFCL evaluation tasks...');
  const tasks = generateBFCLTasks(opts.seed);
  console.log(`    Generated ${tasks.length} tasks`);

  // Step 4: Configure and run benchmark
  console.log('\n  [3/4] Running benchmark...');

  const modelConfig: ModelConfig = {
    name: opts.modelName,
    provider: opts.provider,
    model: opts.modelId,
    apiKey,
    baseUrl: opts.baseUrl,
  };

  const runConfig: RunConfig = {
    scenario: 'D',
    models: [modelConfig],
    conditions: opts.conditions,
    runsPerCondition: opts.runsPerCondition,
    outputDir: opts.outputDir,
    maxConcurrent: 1,
    retryAttempts: opts.retryAttempts,
    retryDelayMs: opts.retryDelayMs,
  };

  const runner = new BenchmarkRunner(runConfig);
  const report = await runner.run(tasks, schemas);

  // Step 5: Generate reports
  console.log('\n  [4/4] Generating reports...');
  mkdirSync(opts.outputDir, { recursive: true });

  // JSON reports
  const jsonPath = saveJsonReport(report, {
    outputDir: opts.outputDir,
    filename: 'bfcl-results.json',
  });
  saveAggregateJson(report, {
    outputDir: opts.outputDir,
    filename: 'bfcl-aggregates.json',
  });

  // CSV report
  saveCsvReport(report, {
    outputDir: opts.outputDir,
    prefix: 'bfcl',
  });

  // LaTeX report
  if (opts.latex) {
    saveLatexReport(report, {
      outputDir: opts.outputDir,
      prefix: 'bfcl',
      captionPrefix: 'BFCL',
    });
  }

  // BFCL-specific summary
  const summary = buildBFCLSummary(pipeline, tasks, report.aggregates);
  const summaryPath = join(opts.outputDir, 'bfcl-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`  [JSON] BFCL summary saved: ${summaryPath}`);

  // Console report
  printReport(report);

  // Print ARR analysis
  printARRAnalysis(summary);
}

// ============================================================
// Output Formatting
// ============================================================

function printARRAnalysis(summary: BFCLSummary): void {
  console.log('\n' + '='.repeat(80));
  console.log('  BFCL ARR ANALYSIS');
  console.log('='.repeat(80));

  console.log(`\n  Compression Metrics:`);
  console.log(`    Natural tokens:    ${summary.compression.natural_tokens}`);
  console.log(`    TSCG tokens:       ${summary.compression.tscg_tokens} (${summary.compression.tscg_savings_pct}% savings)`);
  console.log(`    TSCG+SAD tokens:   ${summary.compression.tscg_sad_tokens} (${summary.compression.tscg_sad_savings_pct}% savings)`);

  if (summary.arr_analysis.length > 0) {
    console.log(`\n  Accuracy Retention Rate (ARR):`);
    console.log(`    ${'Model'.padEnd(20)} ${'Condition'.padEnd(12)} ${'Natural'.padStart(10)} ${'TSCG'.padStart(10)} ${'ARR'.padStart(10)} ${'Target'.padStart(10)}`);
    console.log('    ' + '-'.repeat(72));

    for (const a of summary.arr_analysis) {
      const arrStr = `${a.arr_pct.toFixed(1)}%`;
      const targetStr = a.meets_target ? 'PASS' : 'FAIL';
      console.log(
        `    ${a.model.padEnd(20)} ${a.condition.padEnd(12)} ${(a.accuracy_natural * 100).toFixed(1).padStart(9)}% ${(a.accuracy_condition * 100).toFixed(1).padStart(9)}% ${arrStr.padStart(10)} ${targetStr.padStart(10)}`,
      );
    }
  } else {
    console.log('\n  No ARR analysis available (no results).');
  }

  console.log(`\n  Target Assessment:`);
  console.log(`    ARR >= 99.5%:           ${summary.target_metrics.arr_met ? 'PASS' : 'NOT MET (requires live evaluation)'}`);
  console.log(`    Token savings >= 71.7%: ${summary.target_metrics.savings_met ? 'PASS' : 'NOT MET'}`);

  console.log('\n' + '='.repeat(80) + '\n');
}

// ============================================================
// Utility
// ============================================================

function resolveApiKey(provider: string): string | undefined {
  const envVarMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    together: 'TOGETHER_API_KEY',
    ollama: 'OLLAMA_API_KEY', // Not typically needed
  };

  const envVar = envVarMap[provider];
  return envVar ? process.env[envVar] : undefined;
}

function getApiKeyEnvVar(provider: string): string {
  const envVarMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    together: 'TOGETHER_API_KEY',
    ollama: 'OLLAMA_API_KEY',
  };
  return envVarMap[provider] ?? `${provider.toUpperCase()}_API_KEY`;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (opts.dryRun) {
    executeDryRun(opts);
  } else {
    await executeFullBenchmark(opts);
  }
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(`\n  Stack trace:\n${err.stack}`);
  }
  process.exit(1);
});
