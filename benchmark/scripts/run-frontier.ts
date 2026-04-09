#!/usr/bin/env node
/**
 * TAB Frontier Model Benchmark Runner
 *
 * Executes the complete TAB benchmark suite against frontier models
 * (Anthropic Claude + OpenAI GPT) across all tool-use scenarios.
 *
 * Scenarios:
 *   A - Claude Code (16 tools)
 *   B - MCP Servers (43 tools)
 *   C - Scaling (3-100 tools)
 *   E - Multi-Collection Stress (combined catalogs)
 *
 * Conditions: natural (baseline), tscg (balanced), tscg_sad (aggressive)
 * Runs per condition: 3
 * Temperature: 0 (deterministic)
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-frontier.ts
 *   npx tsx benchmark/scripts/run-frontier.ts --scenario A
 *   npx tsx benchmark/scripts/run-frontier.ts --scenario A --provider anthropic
 *   npx tsx benchmark/scripts/run-frontier.ts --dry-run
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  - Required for Anthropic models
 *   OPENAI_API_KEY     - Required for OpenAI models
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { BenchmarkRunner } from '../harness/runner.js';
import { adaptTask } from '../harness/types.js';
import type {
  RunConfig,
  ModelConfig,
  Scenario,
  Condition,
  CompressedSchemaSet as HarnessSchemaSet,
} from '../harness/types.js';
import { saveJsonReport, saveAggregateJson } from '../harness/reporters/json-reporter.js';
import { printReport } from '../harness/reporters/console-reporter.js';

import {
  collectClaudeCodeTools,
  collectMCPTools,
  generateAllSyntheticCatalogs,
} from '../schemas/collectors/index.js';
import type { SchemaCollection } from '../schemas/types.js';

import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { BenchmarkTask as TaskGenTask } from '../tasks/types.js';

import { compressCollection } from '../compression/pipeline.js';
import type { CompressedSchemaSet as PipelineSchemaSet } from '../compression/pipeline.js';

// ============================================================
// Configuration
// ============================================================

const RUNS_PER_CONDITION = 3;
const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 5000;

const OUTPUT_BASE = resolve('benchmark/results/frontier');

/** Frontier model definitions */
const FRONTIER_MODELS: ModelConfig[] = [
  {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  {
    name: 'gpt-4o',
    provider: 'openai',
    model: 'gpt-4o-2024-08-06',
    apiKey: process.env.OPENAI_API_KEY,
  },
  {
    name: 'gpt-5.2',
    provider: 'openai',
    model: 'gpt-5.2',
    apiKey: process.env.OPENAI_API_KEY,
  },
];

/** All experimental conditions */
const ALL_CONDITIONS: Condition[] = ['natural', 'tscg', 'tscg_sad'];

/** Scenario-to-collection mapping with per-scenario overrides */
interface ScenarioConfig {
  scenario: Scenario;
  label: string;
  getCollections: () => SchemaCollection[];
  /** Override runs per condition (default: RUNS_PER_CONDITION) */
  runs?: number;
  /** Override models (default: all FRONTIER_MODELS) */
  modelFilter?: (m: ModelConfig) => boolean;
  /** Override conditions (default: ALL_CONDITIONS) */
  conditions?: Condition[];
}

const SCENARIO_CONFIGS: ScenarioConfig[] = [
  {
    scenario: 'A',
    label: 'Claude Code (16 tools)',
    getCollections: () => [collectClaudeCodeTools()],
    // 3 runs, all 3 frontier models, all conditions
    runs: 3,
  },
  {
    scenario: 'B',
    label: 'MCP Servers (43 tools)',
    getCollections: () => collectMCPTools(),
    // 3 runs, all 3 frontier models, all conditions
    runs: 3,
  },
  {
    scenario: 'C',
    label: 'Scaling (3-100 tools)',
    getCollections: () => generateAllSyntheticCatalogs(42),
    // 1 run, Claude + GPT-5.2 (2 frontier models), natural+tscg
    runs: 1,
    modelFilter: (m) => m.name !== 'gpt-4o', // Claude + GPT-5.2
    conditions: ['natural', 'tscg'],
  },
  {
    scenario: 'E',
    label: 'Multi-Collection Stress',
    getCollections: () => {
      // Scenario E uses Claude Code + MCP combined for multi-collection stress evaluation
      const cc = collectClaudeCodeTools();
      const mcp = collectMCPTools();
      // Relabel as scenario E
      return [...[cc], ...mcp].map(c => ({ ...c, scenario: 'E' as Scenario }));
    },
    // 1 run, Claude + GPT-5.2, natural+tscg
    runs: 1,
    modelFilter: (m) => m.name !== 'gpt-4o', // Claude + GPT-5.2
    conditions: ['natural', 'tscg'],
  },
];

// ============================================================
// CLI Argument Parsing
// ============================================================

interface CLIOptions {
  scenario?: string;
  provider?: string;
  runs?: number;
  condition?: string;
  dryRun: boolean;
  outputDir?: string;
}

function parseCLIArgs(): CLIOptions {
  const { values } = parseArgs({
    options: {
      scenario: { type: 'string', short: 's' },
      provider: { type: 'string', short: 'p' },
      runs: { type: 'string', short: 'r' },
      condition: { type: 'string', short: 'c' },
      'dry-run': { type: 'boolean', default: false },
      'output-dir': { type: 'string', short: 'o' },
    },
    strict: false,
  });

  return {
    scenario: values.scenario as string | undefined,
    provider: values.provider as string | undefined,
    runs: values.runs ? parseInt(values.runs as string, 10) : undefined,
    condition: values.condition as string | undefined,
    dryRun: (values['dry-run'] as boolean) ?? false,
    outputDir: values['output-dir'] as string | undefined,
  };
}

// ============================================================
// Bridge: Compression Pipeline -> Harness Types
// ============================================================

/**
 * Convert the compression pipeline's CompressedSchemaSet into the
 * simpler format expected by the harness runner.
 */
function toHarnessSchemaSet(pipelineResult: PipelineSchemaSet): HarnessSchemaSet {
  return {
    natural: pipelineResult.conditions.natural.text,
    tscg: pipelineResult.conditions.tscg.text,
    tscg_sad: pipelineResult.conditions.tscg_sad.text,
    tscg_conservative: pipelineResult.conditions.tscg_conservative.text,
  };
}

/**
 * Adapt a task from task generator format to harness runner format.
 */
function adaptGeneratedTask(task: TaskGenTask) {
  return adaptTask({
    task_id: task.task_id,
    scenario: task.scenario,
    query: task.query,
    category: task.category,
    difficulty: task.difficulty,
    ground_truth: {
      tool_name: task.ground_truth.tool_name,
      parameters: task.ground_truth.parameters,
      sequence: task.ground_truth.sequence?.map(s => ({
        tool_name: s.tool_name,
        parameters: s.parameters,
      })),
      action: task.ground_truth.action,
      answer: task.ground_truth.answer,
    },
  });
}

// ============================================================
// Main Execution
// ============================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  const cli = parseCLIArgs();

  console.log('\n' + '='.repeat(80));
  console.log('  TAB Frontier Model Benchmark');
  console.log('  TSCG-Agentic-Bench v1.0');
  console.log('='.repeat(80));

  // Validate API keys
  const availableModels = FRONTIER_MODELS.filter(m => {
    if (cli.provider && m.provider !== cli.provider) return false;
    if (m.provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      console.warn(`  SKIP: ${m.name} (ANTHROPIC_API_KEY not set)`);
      return false;
    }
    if (m.provider === 'openai' && !process.env.OPENAI_API_KEY) {
      console.warn(`  SKIP: ${m.name} (OPENAI_API_KEY not set)`);
      return false;
    }
    return true;
  });

  if (availableModels.length === 0) {
    console.error('\n  ERROR: No models available. Set API keys:');
    console.error('    export ANTHROPIC_API_KEY=sk-ant-...');
    console.error('    export OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  console.log(`\n  Models: ${availableModels.map(m => m.name).join(', ')}`);

  // Filter scenarios
  const scenarioFilter = cli.scenario?.toUpperCase();
  const scenarios = scenarioFilter
    ? SCENARIO_CONFIGS.filter(s => s.scenario === scenarioFilter)
    : SCENARIO_CONFIGS;

  if (scenarios.length === 0) {
    console.error(`\n  ERROR: Unknown scenario "${scenarioFilter}". Valid: A, B, C, E`);
    process.exit(1);
  }

  const runsPerCondition = cli.runs ?? RUNS_PER_CONDITION;
  const outputBase = cli.outputDir ? resolve(cli.outputDir) : OUTPUT_BASE;

  console.log(`  Scenarios: ${scenarios.map(s => `${s.scenario} (${s.label})`).join(', ')}`);
  console.log(`  Conditions: ${ALL_CONDITIONS.join(', ')}`);
  console.log(`  Runs per condition: ${runsPerCondition}`);
  console.log(`  Output: ${outputBase}`);

  // Dry run: show plan and exit
  if (cli.dryRun) {
    console.log('\n  [DRY RUN] Plan summary:\n');
    let totalCalls = 0;
    for (const scenarioConfig of scenarios) {
      const collections = scenarioConfig.getCollections();
      let taskCount = 0;
      for (const collection of collections) {
        const tasks = generateTasksForCollection(collection);
        taskCount += tasks.length;
      }
      // Apply per-scenario overrides
      const scenarioModels = scenarioConfig.modelFilter
        ? availableModels.filter(scenarioConfig.modelFilter)
        : availableModels;
      const scenarioConditions = cli.condition
      ? [cli.condition as Condition]
      : (scenarioConfig.conditions ?? ALL_CONDITIONS);
      const scenarioRuns = cli.runs ?? scenarioConfig.runs ?? RUNS_PER_CONDITION;
      const calls = scenarioModels.length * scenarioConditions.length * scenarioRuns * taskCount;
      totalCalls += calls;
      console.log(
        `    Scenario ${scenarioConfig.scenario}: ${collections.length} collections, ` +
        `${taskCount} tasks, ${scenarioModels.length} models, ${scenarioConditions.length} conditions, ` +
        `${scenarioRuns} runs → ${calls} API calls`
      );
    }
    console.log(`\n    Total API calls: ${totalCalls}`);
    console.log(`    Estimated cost: ~$${(totalCalls * 0.01).toFixed(2)} (rough)`);
    console.log('\n  Remove --dry-run to execute.\n');
    return;
  }

  // Execute each scenario
  const allReportPaths: string[] = [];

  for (const scenarioConfig of scenarios) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`  SCENARIO ${scenarioConfig.scenario}: ${scenarioConfig.label}`);
    console.log('='.repeat(80));

    // 1. Collect schemas
    console.log('  [1/4] Collecting schemas...');
    const collections = scenarioConfig.getCollections();
    console.log(`         ${collections.length} collections, ${collections.reduce((s, c) => s + c.tools.length, 0)} tools`);

    // 2. Generate tasks and compress schemas per collection
    console.log('  [2/4] Generating tasks & compressing schemas...');

    // Build per-collection task+schema bundles (FIX L-22: each collection
    // gets its own compressed schemas so tasks see the correct tool set)
    const collectionBundles: Array<{
      collectionId: string;
      tasks: ReturnType<typeof adaptGeneratedTask>[];
      harness: HarnessSchemaSet;
      pipeline: PipelineSchemaSet;
    }> = [];

    for (const collection of collections) {
      const genTasks = generateTasksForCollection(collection);
      const adaptedTasks = genTasks.map(adaptGeneratedTask);
      const pipelineResult = compressCollection(collection);
      collectionBundles.push({
        collectionId: collection.id,
        tasks: adaptedTasks,
        harness: toHarnessSchemaSet(pipelineResult),
        pipeline: pipelineResult,
      });
      console.log(
        `         ${collection.id}: ${adaptedTasks.length} tasks, ` +
        `${pipelineResult.savings.tscg.percent}% TSCG savings, ` +
        `${pipelineResult.savings.tscg_sad.percent}% TSCG+SAD savings`
      );
    }

    const totalTaskCount = collectionBundles.reduce((s, b) => s + b.tasks.length, 0);
    console.log(`         ${totalTaskCount} total tasks across ${collections.length} collections`);

    // 3. Run benchmark — per-collection to ensure correct schema routing
    console.log('  [3/4] Running benchmark...');
    const scenarioOutputDir = join(outputBase, scenarioConfig.scenario.toLowerCase());
    mkdirSync(scenarioOutputDir, { recursive: true });

    // Apply per-scenario overrides for models, conditions, runs
    const scenarioModels = scenarioConfig.modelFilter
      ? availableModels.filter(scenarioConfig.modelFilter)
      : availableModels;
    const scenarioConditions = cli.condition
      ? [cli.condition as Condition]
      : (scenarioConfig.conditions ?? ALL_CONDITIONS);
    const scenarioRuns = cli.runs ?? scenarioConfig.runs ?? RUNS_PER_CONDITION;

    console.log(`         Models: ${scenarioModels.map(m => m.name).join(', ')}`);
    console.log(`         Conditions: ${scenarioConditions.join(', ')}`);
    console.log(`         Runs: ${scenarioRuns}`);

    try {
      // For single-collection scenarios (A, C, D), run all tasks at once.
      // For multi-collection scenarios (B, E), run per-collection to ensure
      // each task sees its own collection's compressed schemas. (FIX L-22)
      const mergedResults: import('../harness/types.js').TaskResult[] = [];
      let mergedReport: import('../harness/types.js').BenchmarkReport | null = null;

      for (const bundle of collectionBundles) {
        if (collectionBundles.length > 1) {
          console.log(`\n    --- Collection: ${bundle.collectionId} (${bundle.tasks.length} tasks) ---`);
        }

        const runConfig: RunConfig = {
          scenario: scenarioConfig.scenario,
          models: scenarioModels,
          conditions: scenarioConditions,
          runsPerCondition: scenarioRuns,
          outputDir: scenarioOutputDir,
          maxConcurrent: 1, // Sequential for rate limiting
          retryAttempts: RETRY_ATTEMPTS,
          retryDelayMs: RETRY_DELAY_MS,
        };

        const runner = new BenchmarkRunner(runConfig);
        const report = await runner.run(bundle.tasks, bundle.harness);
        mergedResults.push(...report.results);
        mergedReport = report; // Keep last report for meta structure
      }

      // Build final merged report (re-aggregate across all collections)
      if (mergedReport && collectionBundles.length > 1) {
        const { aggregateResults: reAggregate } = await import('../harness/aggregate.js');
        const finalAggregates = reAggregate(mergedResults);
        mergedReport = {
          meta: {
            ...mergedReport.meta,
            total_tasks: totalTaskCount,
            total_api_calls: mergedResults.length,
          },
          results: mergedResults,
          aggregates: finalAggregates,
        };
      }

      if (mergedReport) {
        // Save results
        const jsonPath = saveJsonReport(mergedReport, { outputDir: scenarioOutputDir });
        saveAggregateJson(mergedReport, { outputDir: scenarioOutputDir });
        allReportPaths.push(jsonPath);

        // Print results to console
        printReport(mergedReport);
      }

      // 4. Save compression metadata alongside results
      const compressionMeta = collectionBundles.map(cb => ({
        collectionId: cb.collectionId,
        savings_tscg_pct: cb.pipeline.savings.tscg.percent,
        savings_tscg_sad_pct: cb.pipeline.savings.tscg_sad.percent,
        tokens_natural: cb.pipeline.conditions.natural.tokens,
        tokens_tscg: cb.pipeline.conditions.tscg.tokens,
        tokens_tscg_sad: cb.pipeline.conditions.tscg_sad.tokens,
        timings: cb.pipeline.timings,
        principles_tscg: cb.pipeline.appliedPrinciples.tscg,
        principles_tscg_sad: cb.pipeline.appliedPrinciples.tscg_sad,
      }));

      writeFileSync(
        join(scenarioOutputDir, 'compression-metadata.json'),
        JSON.stringify(compressionMeta, null, 2),
        'utf-8',
      );
      console.log(`  [META] Compression metadata saved: ${scenarioOutputDir}/compression-metadata.json`);

    } catch (err) {
      console.error(`\n  ERROR in Scenario ${scenarioConfig.scenario}:`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && err.stack) {
        console.error(`  ${err.stack.split('\n').slice(1, 4).join('\n  ')}`);
      }
      // Continue to next scenario instead of aborting everything
      continue;
    }
  }

  // Final summary
  const totalDuration = Date.now() - startTime;
  console.log('\n' + '='.repeat(80));
  console.log('  BENCHMARK COMPLETE');
  console.log('='.repeat(80));
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Reports saved:`);
  for (const path of allReportPaths) {
    console.log(`    - ${path}`);
  }
  console.log(`  Output directory: ${outputBase}`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================
// Entry Point
// ============================================================

main().catch(err => {
  console.error('\nFATAL ERROR:');
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
