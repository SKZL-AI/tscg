#!/usr/bin/env node
/**
 * TSCG CLI -- Command-Line Interface
 *
 * Provides commands for compressing tool schemas, running benchmarks,
 * analyzing results, and inspecting TSCG configuration.
 *
 * Commands:
 *   tscg compress   -- Compress a tool schema file
 *   tscg benchmark  -- Run TAB benchmark
 *   tscg analyze    -- Analyze benchmark results
 *   tscg info       -- Show TSCG version, profiles, principles
 *   tscg help       -- Show help message
 *
 * Usage:
 *   npx tsx cli/tscg.ts compress --input tools.json --model claude-sonnet
 *   npx tsx cli/tscg.ts benchmark --scenario A --model claude-sonnet-4
 *   npx tsx cli/tscg.ts analyze --input-dir ./results --output-format json
 *   npx tsx cli/tscg.ts info
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execSync } from 'node:child_process';

// ============================================================
// Version
// ============================================================

const VERSION = '1.2.0';

// ============================================================
// Argument Parsing (zero dependencies)
// ============================================================

interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node + script path
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'help';
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = command === 'help' && !args[0]?.startsWith('-') ? 0 : 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        // --key=value form
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = 'true';
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flags: -m value
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (i > 0) {
      positional.push(arg);
    }
  }

  // Map short flags to long names
  const shortMap: Record<string, string> = {
    m: 'model',
    p: 'profile',
    o: 'output',
    i: 'input',
    s: 'scenario',
    v: 'version',
    h: 'help',
  };
  for (const [short, long] of Object.entries(shortMap)) {
    if (flags[short] && !flags[long]) {
      flags[long] = flags[short];
      delete flags[short];
    }
  }

  return { command, flags, positional };
}

// ============================================================
// Command: compress
// ============================================================

async function handleCompress(flags: Record<string, string>, positional: string[]): Promise<void> {
  const inputPath = flags.input || positional[0];

  if (!inputPath) {
    console.error('Error: No input file specified.');
    console.error('Usage: tscg compress --input <file.json> [--model <model>] [--profile <profile>] [--output <file>]');
    console.error('');
    console.error('The input file should contain an array of tool definitions in OpenAI or Anthropic format.');
    process.exit(1);
  }

  const resolved = resolve(inputPath);
  if (!existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  let tools: unknown[];
  try {
    const raw = readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw);
    tools = Array.isArray(parsed) ? parsed : (parsed.tools ?? [parsed]);
  } catch (err) {
    console.error(`Error: Could not parse JSON from ${resolved}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (tools.length === 0) {
    console.error('Error: No tool definitions found in input file.');
    process.exit(1);
  }

  // Dynamic import of @tscg/core to avoid requiring it at module load
  let coreModule: typeof import('@tscg/core');
  try {
    coreModule = await import('@tscg/core');
  } catch {
    // Fallback: try relative path for monorepo development
    try {
      coreModule = await import('../packages/core/src/index.js');
    } catch (err2) {
      console.error('Error: Could not load @tscg/core. Make sure it is installed.');
      console.error(err2 instanceof Error ? err2.message : String(err2));
      process.exit(1);
    }
  }

  const { compress, formatSavings } = coreModule;

  const model = (flags.model || 'auto') as import('@tscg/core').ModelTarget;
  const profile = (flags.profile || 'balanced') as 'conservative' | 'balanced' | 'aggressive';

  console.log('');
  console.log('  TSCG Compress');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Input:   ${basename(resolved)} (${tools.length} tools)`);
  console.log(`  Model:   ${model}`);
  console.log(`  Profile: ${profile}`);
  console.log('');

  const result = compress(
    tools as import('@tscg/core').AnyToolDefinition[],
    { model, profile },
  );

  // Display metrics
  console.log('  Metrics:');
  console.log(`  ${formatSavings(result.metrics)}`);
  console.log(`  Principles: ${result.appliedPrinciples.join(', ')}`);
  console.log('');

  // Per-tool breakdown
  if (result.metrics.perTool.length > 0) {
    console.log('  Per-tool breakdown:');
    for (const metric of result.metrics.perTool) {
      const name = metric.name.padEnd(30);
      const savings = metric.savingsPercent.toFixed(1).padStart(5);
      console.log(`    ${name} ${metric.originalTokens} -> ${metric.compressedTokens} tokens (${savings}%)`);
    }
    console.log('');
  }

  // Output compressed result
  const outputPath = flags.output;
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    const output = {
      compressed: result.compressed,
      metrics: result.metrics,
      appliedPrinciples: result.appliedPrinciples,
      tools: result.tools,
    };
    writeFileSync(resolvedOutput, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  Output written to: ${resolvedOutput}`);
  } else {
    console.log('  Compressed output:');
    console.log('  ' + '-'.repeat(50));
    console.log(result.compressed);
    console.log('  ' + '-'.repeat(50));
    console.log('');
    console.log('  Tip: Use --output <file.json> to save the result.');
  }

  console.log('');
}

// ============================================================
// Command: benchmark
// ============================================================

async function handleBenchmark(flags: Record<string, string>): Promise<void> {
  const scenario = flags.scenario || 'A';
  const model = flags.model || '';
  const outputDir = flags['output-dir'] || flags.output || './tab-results';

  console.log('');
  console.log('  TSCG Benchmark (TAB)');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Scenario:   ${scenario}`);
  if (model) console.log(`  Model:      ${model}`);
  console.log(`  Output dir: ${outputDir}`);
  console.log('');

  // Determine which benchmark script to run
  const scenarioLower = scenario.toLowerCase();
  let scriptPath: string;

  if (scenarioLower === 'gsm8k') {
    scriptPath = resolve('benchmark/scripts/run-gsm8k.ts');
  } else if (scenarioLower === 'bfcl') {
    scriptPath = resolve('benchmark/scripts/run-bfcl.ts');
  } else if (['a', 'b', 'c'].includes(scenarioLower)) {
    scriptPath = resolve('benchmark/scripts/run-frontier.ts');
  } else if (['d', 'e'].includes(scenarioLower)) {
    scriptPath = resolve('benchmark/scripts/run-small-models.ts');
  } else {
    // Fall back to the TAB CLI
    scriptPath = resolve('benchmark/harness/cli.ts');
  }

  if (!existsSync(scriptPath)) {
    console.error(`  Error: Benchmark script not found: ${scriptPath}`);
    console.error('  Available scenarios:');
    console.error('    A, B, C    -- Frontier model scenarios (run-frontier.ts)');
    console.error('    D, E       -- Small model scenarios (run-small-models.ts)');
    console.error('    GSM8K      -- GSM8K reasoning benchmark (run-gsm8k.ts)');
    console.error('    BFCL       -- Berkeley Function Calling Leaderboard (run-bfcl.ts)');
    process.exit(1);
  }

  // Build the command
  const cmdParts = ['npx', 'tsx', scriptPath];
  if (model) cmdParts.push('--model', model);
  cmdParts.push('--output', outputDir);
  if (flags.scenario) cmdParts.push('--scenario', scenario);
  if (flags.runs) cmdParts.push('--runs', flags.runs);
  if (flags.conditions) cmdParts.push('--conditions', flags.conditions);

  const cmd = cmdParts.join(' ');
  console.log(`  Running: ${cmd}`);
  console.log('');

  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: resolve('.'),
      env: { ...process.env },
    });
  } catch (err) {
    console.error('');
    console.error('  Benchmark execution failed.');
    if (err instanceof Error && 'status' in err) {
      process.exit((err as NodeJS.ErrnoException & { status?: number }).status || 1);
    }
    process.exit(1);
  }
}

// ============================================================
// Command: analyze
// ============================================================

async function handleAnalyze(flags: Record<string, string>): Promise<void> {
  const inputDir = flags['input-dir'] || flags.input || './tab-results';
  const outputFormat = flags['output-format'] || flags.format || 'all';

  console.log('');
  console.log('  TSCG Analyze');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Input dir:     ${inputDir}`);
  console.log(`  Output format: ${outputFormat}`);
  console.log('');

  // Check for analysis scripts
  const analysisScript = resolve('benchmark/scripts/analyze-results.ts');
  const statisticsScript = resolve('benchmark/analysis/statistics.ts');

  if (existsSync(statisticsScript)) {
    console.log('  Running statistical analysis...');
    const cmdParts = ['npx', 'tsx', statisticsScript, '--input', resolve(inputDir)];
    if (flags.output) cmdParts.push('--output', resolve(flags.output));

    try {
      execSync(cmdParts.join(' '), {
        stdio: 'inherit',
        cwd: resolve('.'),
        env: { ...process.env },
      });
    } catch {
      console.warn('  Warning: Statistical analysis script returned errors.');
    }
    console.log('');
  }

  if (existsSync(analysisScript)) {
    console.log('  Running results analysis...');
    const cmdParts = ['npx', 'tsx', analysisScript, '--input', resolve(inputDir)];
    if (flags.format) cmdParts.push('--format', outputFormat);

    try {
      execSync(cmdParts.join(' '), {
        stdio: 'inherit',
        cwd: resolve('.'),
        env: { ...process.env },
      });
    } catch {
      console.warn('  Warning: Analysis script returned errors.');
    }
    console.log('');
  }

  // Also try the TAB CLI analyze command
  const tabCli = resolve('benchmark/harness/cli.ts');
  if (existsSync(tabCli)) {
    console.log('  Running TAB analysis...');
    const cmdParts = [
      'npx', 'tsx', tabCli, 'analyze',
      '--input', resolve(inputDir),
      '--format', outputFormat,
    ];

    try {
      execSync(cmdParts.join(' '), {
        stdio: 'inherit',
        cwd: resolve('.'),
        env: { ...process.env },
      });
    } catch {
      console.warn('  Warning: TAB analyze returned errors.');
    }
  }

  console.log('  Analysis complete.');
  console.log('');
}

// ============================================================
// Command: info
// ============================================================

async function handleInfo(): Promise<void> {
  console.log('');
  console.log('  TSCG -- Token-Saving Context Grammar');
  console.log('  ' + '='.repeat(50));
  console.log(`  Version: ${VERSION}`);
  console.log('');

  // Principles
  console.log('  TSCG Principles:');
  console.log('  ' + '-'.repeat(50));
  const principles = [
    { id: 'ATA', name: 'Abbreviated Type Annotations', desc: 'Replace verbose types with compact notation' },
    { id: 'CFL', name: 'Constraint-First Layout', desc: 'Move constraints to the front of descriptions' },
    { id: 'RKE', name: 'Redundant Key Elimination', desc: 'Remove keys inferrable from context' },
    { id: 'SAD', name: 'Selective Anchor Duplication', desc: 'Duplicate critical anchors for Claude models' },
    { id: 'TAS', name: 'Tokenizer Alignment Scoring', desc: 'Use BPE-optimal delimiters per model' },
    { id: 'DTR', name: 'Description Text Reduction', desc: 'Remove filler words and redundant phrases' },
    { id: 'SCO', name: 'Structural Compression Operators', desc: 'Replace verbose patterns with compact operators' },
    { id: 'CSP', name: 'Context-Sensitive Pruning', desc: 'Prune fields unlikely to affect tool selection' },
  ];
  for (const p of principles) {
    console.log(`    ${p.id}  ${p.name}`);
    console.log(`         ${p.desc}`);
  }
  console.log('');

  // Profiles
  console.log('  Compression Profiles:');
  console.log('  ' + '-'.repeat(50));
  console.log('    conservative   ~50% savings, maximum safety');
  console.log('    balanced       ~65% savings, recommended default');
  console.log('    aggressive     ~75% savings, cost optimization');
  console.log('');

  // Supported models
  console.log('  Supported Model Targets:');
  console.log('  ' + '-'.repeat(50));

  // Try to load profiles dynamically
  try {
    let coreModule: typeof import('@tscg/core');
    try {
      coreModule = await import('@tscg/core');
    } catch {
      coreModule = await import('../packages/core/src/index.js');
    }
    const profiles = coreModule.listProfiles();
    for (const profile of profiles) {
      console.log(
        `    ${profile.model.padEnd(16)} ` +
        `chars/token: ${profile.charsPerToken} (text), ${profile.charsPerTokenCode} (code)`
      );
    }
  } catch {
    // Fallback: list known models
    const models = [
      'claude-sonnet', 'claude-opus', 'claude-haiku',
      'gpt-4', 'gpt-5', 'gpt-4o-mini',
      'llama-3.1', 'llama-3.2',
      'mistral-7b', 'mistral-large',
      'gemma-3', 'phi-4', 'qwen-3', 'deepseek-v3',
    ];
    for (const m of models) {
      console.log(`    ${m}`);
    }
  }
  console.log('    auto             (conservative defaults)');
  console.log('');

  // Package info
  console.log('  Packages:');
  console.log('  ' + '-'.repeat(50));
  console.log('    @tscg/core            Core compiler and transforms');
  console.log('    @tscg/tool-optimizer  Framework integrations (LangChain, Vercel, MCP)');
  console.log('');

  // CLI commands
  console.log('  CLI Commands:');
  console.log('  ' + '-'.repeat(50));
  console.log('    tscg compress    Compress a tool schema file');
  console.log('    tscg benchmark   Run TAB benchmark suite');
  console.log('    tscg analyze     Analyze benchmark results');
  console.log('    tscg info        Show this information');
  console.log('    tscg help        Show usage help');
  console.log('');

  console.log('  Links:');
  console.log('  ' + '-'.repeat(50));
  console.log('    Paper:     See paper/ directory');
  console.log('    Benchmark: See benchmark/ directory');
  console.log('    Docs:      See docs/ directory');
  console.log('');
}

// ============================================================
// Help
// ============================================================

function printHelp(): void {
  console.log(`
  TSCG -- Token-Saving Context Grammar CLI

  Version: ${VERSION}

  Usage: tscg <command> [options]

  Commands:
    compress     Compress a tool schema file
    benchmark    Run TAB benchmark suite
    analyze      Analyze benchmark results
    info         Show TSCG version, profiles, principles
    help         Show this help message

  Compress Options:
    --input, -i <file>       JSON file with tool definitions (required)
    --model, -m <target>     Target model (default: auto)
    --profile, -p <level>    Compression profile: conservative, balanced, aggressive (default: balanced)
    --output, -o <file>      Output file for compressed result (default: stdout)

  Benchmark Options:
    --scenario, -s <id>      Scenario: A, B, C, D, E, GSM8K, BFCL (default: A)
    --model, -m <name>       Model to benchmark (e.g., claude-sonnet-4)
    --output-dir <dir>       Output directory (default: ./tab-results)
    --runs <n>               Runs per condition (default: 3)
    --conditions <list>      Comma-separated conditions (default: natural,tscg,tscg_sad)

  Analyze Options:
    --input-dir <dir>        Directory with benchmark results (default: ./tab-results)
    --output-format <type>   Output format: json, csv, latex, console, all (default: all)

  Examples:
    tscg compress -i tools.json -m claude-sonnet -p balanced
    tscg compress -i tools.json -o compressed.json
    tscg benchmark -s A -m claude-sonnet-4
    tscg benchmark --scenario GSM8K --runs 5
    tscg analyze --input-dir ./tab-results --output-format latex
    tscg info
  `);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const { command, flags, positional } = parseArgs(process.argv);

  // Handle --version flag anywhere
  if (flags.version === 'true') {
    console.log(`tscg ${VERSION}`);
    return;
  }

  // Handle --help flag anywhere
  if (flags.help === 'true' && command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'compress':
      return handleCompress(flags, positional);
    case 'benchmark':
      return handleBenchmark(flags);
    case 'analyze':
      return handleAnalyze(flags);
    case 'info':
      return handleInfo();
    case 'help':
    case '--help':
    case '-h':
      return printHelp();
    case '--version':
    case '-v':
      console.log(`tscg ${VERSION}`);
      return;
    default:
      console.error(`  Unknown command: ${command}`);
      console.error('  Run "tscg help" for usage information.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
