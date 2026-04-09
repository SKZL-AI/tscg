/**
 * TAB CLI Entry Point
 *
 * Command-line interface for the TSCG-Agentic-Bench (TAB) harness.
 *
 * Commands:
 *   npx tab collect    -- Run schema collectors from target APIs
 *   npx tab compress   -- Apply TSCG compression to collected schemas
 *   npx tab generate   -- Generate test tasks from templates
 *   npx tab run        -- Execute benchmark against configured models
 *   npx tab analyze    -- Aggregate results and generate reports
 *
 * Usage:
 *   npx tab run --scenario A --model claude-sonnet-4 --runs 3
 *   npx tab analyze --input results/ --format latex
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  RunConfig,
  ModelConfig,
  Scenario,
  Condition,
  BenchmarkTask,
  CompressedSchemaSet,
} from './types.js';
import { BenchmarkRunner } from './runner.js';
import { aggregateResults } from './aggregate.js';
import {
  saveJsonReport,
  saveCsvReport,
  saveLatexReport,
  printReport,
} from './reporters/index.js';

// === Argument Parsing ===

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const command = argv[2] ?? 'help';
  const flags: Record<string, string> = {};

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      flags[key] = value;
    }
  }

  return { command, flags };
}

// === Command Handlers ===

async function handleCollect(flags: Record<string, string>): Promise<void> {
  console.log('\n  TAB: Schema Collection');
  console.log('  ' + '-'.repeat(40));
  console.log('  This command will collect tool schemas from target APIs.');
  console.log('  Not yet implemented -- use benchmark/schemas/ files directly.');
  console.log('  See task-2.1 and task-2.2 for schema collection/compression.\n');
}

async function handleCompress(flags: Record<string, string>): Promise<void> {
  console.log('\n  TAB: Schema Compression');
  console.log('  ' + '-'.repeat(40));
  console.log('  This command will apply TSCG compression to collected schemas.');
  console.log('  Not yet implemented -- use benchmark/schemas/ files directly.');
  console.log('  See task-2.2 for TSCG compression pipeline.\n');
}

async function handleGenerate(flags: Record<string, string>): Promise<void> {
  console.log('\n  TAB: Task Generation');
  console.log('  ' + '-'.repeat(40));
  console.log('  This command will generate benchmark tasks from templates.');
  console.log('  Not yet implemented -- use benchmark/tasks/ files directly.');
  console.log('  See task-2.3 for task generation pipeline.\n');
}

async function handleRun(flags: Record<string, string>): Promise<void> {
  console.log('\n  TAB: Benchmark Run');
  console.log('  ' + '-'.repeat(40));

  // Parse configuration from flags
  const scenario = (flags.scenario ?? 'A') as Scenario;
  const runsPerCondition = parseInt(flags.runs ?? '3', 10);
  const outputDir = flags.output ?? './tab-results';
  const maxConcurrent = parseInt(flags.concurrent ?? '1', 10);
  const configPath = flags.config;

  let models: ModelConfig[] = [];
  let conditions: Condition[] = ['natural', 'tscg', 'tscg_sad'];

  // Load config from file if specified
  if (configPath && existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as Partial<RunConfig>;
      if (config.models) models = config.models;
      if (config.conditions) conditions = config.conditions;
    } catch (err) {
      console.error(`  Error reading config: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // Default model if none configured
  if (models.length === 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('  Error: No models configured and ANTHROPIC_API_KEY not set.');
      console.error('  Provide --config <path> or set ANTHROPIC_API_KEY environment variable.');
      process.exit(1);
    }
    models = [
      {
        name: 'claude-sonnet-4',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey,
      },
    ];
  }

  if (flags.conditions) {
    conditions = flags.conditions.split(',').map(c => c.trim()) as Condition[];
  }

  const runConfig: RunConfig = {
    scenario,
    models,
    conditions,
    runsPerCondition,
    outputDir,
    maxConcurrent,
    retryAttempts: parseInt(flags.retries ?? '3', 10),
    retryDelayMs: parseInt(flags.delay ?? '2000', 10),
  };

  // Load tasks and schemas
  const tasks = loadTasks(scenario, flags);
  const schemas = loadSchemas(scenario, flags);

  if (tasks.length === 0) {
    console.error('  Error: No tasks found for scenario ' + scenario);
    console.error('  Generate tasks first with: npx tab generate --scenario ' + scenario);
    process.exit(1);
  }

  // Run benchmark
  const runner = new BenchmarkRunner(runConfig);
  const report = await runner.run(tasks, schemas);

  // Save reports
  saveJsonReport(report, { outputDir });
  saveCsvReport(report, { outputDir });

  if (flags.latex === 'true') {
    saveLatexReport(report, { outputDir });
  }

  printReport(report);
}

async function handleAnalyze(flags: Record<string, string>): Promise<void> {
  console.log('\n  TAB: Results Analysis');
  console.log('  ' + '-'.repeat(40));

  const inputDir = flags.input ?? './tab-results';
  const outputDir = flags.output ?? inputDir;
  const format = flags.format ?? 'all';

  // Find JSON result files
  const checkpointPath = join(inputDir, 'checkpoint.json');
  if (!existsSync(checkpointPath)) {
    console.error(`  Error: No checkpoint.json found in ${inputDir}`);
    console.error('  Run the benchmark first with: npx tab run');
    process.exit(1);
  }

  try {
    const raw = readFileSync(checkpointPath, 'utf-8');
    const results = JSON.parse(raw) as import('./types.js').TaskResult[];

    console.log(`  Loaded ${results.length} results from checkpoint`);

    const aggregates = aggregateResults(results);

    // Build a synthetic report for the reporters
    const report: import('./types.js').BenchmarkReport = {
      meta: {
        scenario: 'A' as Scenario, // Will be overridden by task inference
        models: [...new Set(results.map(r => r.model))],
        conditions: [...new Set(results.map(r => r.condition))] as Condition[],
        runs_per_condition: 0,
        total_tasks: 0,
        total_api_calls: results.length,
        start_time: results[0]?.timestamp ?? new Date().toISOString(),
        end_time: results[results.length - 1]?.timestamp ?? new Date().toISOString(),
        duration_ms: 0,
      },
      results,
      aggregates,
    };

    if (format === 'all' || format === 'json') {
      saveJsonReport(report, { outputDir });
    }
    if (format === 'all' || format === 'csv') {
      saveCsvReport(report, { outputDir });
    }
    if (format === 'all' || format === 'latex') {
      saveLatexReport(report, { outputDir });
    }
    if (format === 'all' || format === 'console') {
      printReport(report);
    }
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// === Helper: Load tasks and schemas ===

function loadTasks(scenario: Scenario, flags: Record<string, string>): BenchmarkTask[] {
  const tasksPath = flags.tasks ?? join('benchmark', 'tasks', `scenario-${scenario.toLowerCase()}.json`);

  if (existsSync(tasksPath)) {
    try {
      const raw = readFileSync(tasksPath, 'utf-8');
      return JSON.parse(raw) as BenchmarkTask[];
    } catch {
      console.warn(`  Warning: Could not parse tasks from ${tasksPath}`);
    }
  }

  console.warn(`  Warning: Tasks file not found: ${tasksPath}`);
  console.warn('  Generate tasks first with: npx tab generate');
  return [];
}

function loadSchemas(scenario: Scenario, flags: Record<string, string>): CompressedSchemaSet {
  const schemasPath = flags.schemas ?? join('benchmark', 'schemas', `compressed-${scenario.toLowerCase()}.json`);

  if (existsSync(schemasPath)) {
    try {
      const raw = readFileSync(schemasPath, 'utf-8');
      return JSON.parse(raw) as CompressedSchemaSet;
    } catch {
      console.warn(`  Warning: Could not parse schemas from ${schemasPath}`);
    }
  }

  // Return empty schemas as fallback
  console.warn(`  Warning: Schemas file not found: ${schemasPath}`);
  return {
    natural: '[No schemas loaded]',
    tscg: '[No schemas loaded]',
    tscg_sad: '[No schemas loaded]',
  };
}

// === Help ===

function printHelp(): void {
  console.log(`
  TAB -- TSCG-Agentic-Bench

  Usage: npx tab <command> [options]

  Commands:
    collect     Run schema collectors from target APIs
    compress    Apply TSCG compression to collected schemas
    generate    Generate test tasks from templates
    run         Execute benchmark against configured models
    analyze     Aggregate results and generate reports
    help        Show this help message

  Run Options:
    --scenario <A|B|C|D|E|GSM8K>  Evaluation scenario (default: A)
    --runs <n>                     Runs per condition (default: 3)
    --output <dir>                 Output directory (default: ./tab-results)
    --config <path>                JSON config file with models/conditions
    --conditions <list>            Comma-separated conditions (default: natural,tscg,tscg_sad)
    --retries <n>                  Retry attempts per task (default: 3)
    --delay <ms>                   Retry delay in ms (default: 2000)
    --latex                        Also generate LaTeX tables
    --tasks <path>                 Path to tasks JSON file
    --schemas <path>               Path to compressed schemas JSON file

  Analyze Options:
    --input <dir>                  Input directory with checkpoint.json
    --output <dir>                 Output directory for reports
    --format <type>                Report format: json, csv, latex, console, all (default: all)

  Examples:
    npx tab run --scenario A --runs 5
    npx tab run --config tab-config.json --latex
    npx tab analyze --input ./tab-results --format latex
  `);
}

// === Main ===

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'collect':
      return handleCollect(flags);
    case 'compress':
      return handleCompress(flags);
    case 'generate':
      return handleGenerate(flags);
    case 'run':
      return handleRun(flags);
    case 'analyze':
      return handleAnalyze(flags);
    case 'help':
    case '--help':
    case '-h':
      return printHelp();
    default:
      console.error(`  Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
