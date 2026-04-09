#!/usr/bin/env node
/**
 * TSCG CLI
 * Command-line interface for TSCG benchmark, compiler, and prompt optimizer
 */

import { getAllTests, getTestsBySet, getTestsByCategory } from '../benchmark/test-cases.js';
import { LONG_CONTEXT_NIAH_TESTS } from '../benchmark/long-context-cases.js';
import { RAG_TESTS } from '../benchmark/rag-cases.js';
import { TOOL_TESTS } from '../benchmark/tool-cases.js';
import { runBenchmark } from '../benchmark/runner.js';
import { compileTscg, batchCompile, applySADF } from '../compiler/compiler.js';
import { optimizePrompt, optimizePromptHybrid, batchOptimize, type OptimizationProfile } from '../optimizer/optimizer.js';
import { printReport, printCompact, printComparison, toJSON, toMarkdown } from '../optimizer/report.js';
import type { TscgConfig, StrategyName, ProviderName } from '../core/types.js';
import { DEFAULT_CONFIG } from '../core/types.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

function getConfig(): TscgConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: Set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }
  return {
    ...DEFAULT_CONFIG,
    apiKey,
    model: process.env.TSCG_MODEL || DEFAULT_CONFIG.model,
  };
}

function getConfigOptional(): TscgConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    ...DEFAULT_CONFIG,
    apiKey,
    model: process.env.TSCG_MODEL || DEFAULT_CONFIG.model,
  };
}

function printUsage(): void {
  console.log(`
TSCG - Token-Context Semantic Grammar
======================================

Usage:
  tscg optimize <text>          Optimize a prompt using TSCG (local, no API)
  tscg optimize --file <path>   Optimize a prompt from file
  tscg optimize --hybrid <text> Optimize using Claude API + local transforms
  tscg optimize --compare <text> Compare all profiles side-by-side
  tscg benchmark [options]      Run benchmark suite
  tscg compile <text|file>      Compile NL prompt to TSCG (requires API)
  tscg compile --file <path>    Compile NL prompt from file
  tscg sad <tscg-prompt>        Apply SAD-F to TSCG prompt
  tscg help                     Show this help

Optimize Options:
  --profile=...    Optimization profile (minimal, balanced, max_compress, max_accuracy, full)
                   Default: balanced
  --hybrid         Use Claude API for NL→TSCG compilation + local transforms
  --compare        Run all profiles and compare side-by-side
  --json           Output result as JSON
  --markdown       Output result as Markdown
  --out=<path>     Write result to file
  --no-sadf        Disable SAD-F (anchor duplication)
  --no-ccp         Disable CCP (causal closure)
  --sad-k=<n>      SAD-F anchor count (default: 4)
  --verbose        Show detailed transform pipeline
  --quiet          Only output the optimized prompt

Environment Variables:
  ANTHROPIC_API_KEY  API key for Claude models (default provider)
  OPENAI_API_KEY     API key for GPT models
  GEMINI_API_KEY     API key for Google Gemini models
  MOONSHOT_API_KEY   API key for Kimi/Moonshot models
  TSCG_MODEL         Override default model name

Benchmark Options:
  --provider=NAME  LLM provider: anthropic (default), openai, gemini, moonshot
  --model=NAME     Override model name (default per provider)
  --hard           Run only hard tests (25 challenging tests)
  --all            Run all tests (core + hard combined)
  --long-context   Run long-context NIAH tests (30 needle-in-haystack tests)
  --rag            Run RAG chunk-ordering tests (22 tests)
  --tools          Run tool-selection tests (30 tests)
  --category=...   Run only tests in a specific category
  --long           Include long-context tests (1k-10k tokens)
  --strategies=... Comma-separated list of strategies (natural,repetition,tscg,tscg+sad,tscg+rep,ccp)
  --quiet          Suppress per-test output

Examples:
  tscg optimize "Please help me find the capital city of France"
  tscg optimize --profile=full "A store has 45 apples. They sell 12 and receive 30. How many remain?"
  tscg optimize --file prompt.txt --json --out=optimized.json
  tscg optimize --compare "What is the atomic number of gold?"
  tscg optimize --hybrid "List the top 3 countries by GDP as JSON"
  tscg benchmark
  tscg compile "What is the capital of France?"
`);
}

// === Optimize Command ===

async function cmdOptimize(args: string[]): Promise<void> {
  const isHybrid = args.includes('--hybrid');
  const isCompare = args.includes('--compare');
  const isJson = args.includes('--json');
  const isMarkdown = args.includes('--markdown');
  const isQuiet = args.includes('--quiet');
  const isVerbose = args.includes('--verbose');
  const noSadf = args.includes('--no-sadf');
  const noCcp = args.includes('--no-ccp');

  // Parse profile
  const profileArg = args.find((a) => a.startsWith('--profile='));
  const profile = (profileArg?.replace('--profile=', '') || 'balanced') as OptimizationProfile;
  const validProfiles: OptimizationProfile[] = ['minimal', 'balanced', 'max_compress', 'max_accuracy', 'full'];
  if (!validProfiles.includes(profile)) {
    console.error(`ERROR: Invalid profile "${profile}". Valid: ${validProfiles.join(', ')}`);
    process.exit(1);
  }

  // Parse SAD-K
  const sadKArg = args.find((a) => a.startsWith('--sad-k='));
  const sadTopK = sadKArg ? parseInt(sadKArg.replace('--sad-k=', ''), 10) : 4;

  // Parse output file
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg?.replace('--out=', '');

  const isInteractive = args.includes('--interactive') || args.includes('-i');

  // Interactive REPL mode
  if (isInteractive) {
    await cmdOptimizeInteractive(profile, noSadf, noCcp, sadTopK, isJson, isQuiet);
    return;
  }

  // Get input text — support pipe, file, or args
  let text: string;
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    text = readFileSync(args[fileIdx + 1], 'utf-8');
  } else if (!process.stdin.isTTY) {
    // Pipe mode: read from stdin
    text = await readStdin();
  } else {
    text = args
      .filter((a) => !a.startsWith('--'))
      .join(' ');
  }

  if (!text.trim()) {
    console.error('ERROR: No text provided. Usage: tscg optimize "your prompt"');
    console.error('  Or pipe: echo "prompt" | tscg optimize --quiet');
    console.error('  Or interactive: tscg optimize --interactive');
    process.exit(1);
  }

  // === Compare Mode ===
  if (isCompare) {
    const results = validProfiles.map((p) =>
      optimizePrompt(text, {
        profile: p,
        enableSADF: !noSadf,
        enableCCP: !noCcp,
        sadTopK,
        verbose: false,
      })
    );
    printComparison(results);

    // Also show the best result
    const best = results.reduce((a, b) =>
      a.metrics.compressionRatio < b.metrics.compressionRatio ? a : b
    );
    console.log(`  Best compression: ${best.profile}`);
    printReport(best);
    return;
  }

  // === Hybrid Mode ===
  if (isHybrid) {
    const config = getConfig();
    const result = await optimizePromptHybrid(text, config, {
      profile,
      enableSADF: !noSadf,
      enableCCP: !noCcp,
      sadTopK,
      verbose: isVerbose,
    });

    if (isQuiet) {
      console.log(result.optimized);
    } else if (isJson) {
      const json = JSON.stringify(toJSON(result), null, 2);
      if (outPath) {
        writeFileSync(outPath, json);
        console.log(`  Written to ${outPath}`);
      } else {
        console.log(json);
      }
    } else if (isMarkdown) {
      const md = toMarkdown(result);
      if (outPath) {
        writeFileSync(outPath, md);
        console.log(`  Written to ${outPath}`);
      } else {
        console.log(md);
      }
    } else {
      printReport(result);
    }
    return;
  }

  // === Local Mode (default) ===
  const result = optimizePrompt(text, {
    profile,
    enableSADF: !noSadf,
    enableCCP: !noCcp,
    sadTopK,
    verbose: isVerbose,
  });

  if (isQuiet) {
    console.log(result.optimized);
  } else if (isJson) {
    const json = JSON.stringify(toJSON(result), null, 2);
    if (outPath) {
      writeFileSync(outPath, json);
      console.log(`  Written to ${outPath}`);
    } else {
      console.log(json);
    }
  } else if (isMarkdown) {
    const md = toMarkdown(result);
    if (outPath) {
      writeFileSync(outPath, md);
      console.log(`  Written to ${outPath}`);
    } else {
      console.log(md);
    }
  } else {
    printReport(result);
  }
}

// === Existing Commands ===

async function cmdBenchmark(args: string[]): Promise<void> {
  // Provider selection
  const providerArg = args.find(a => a.startsWith('--provider='));
  const provider = (providerArg?.replace('--provider=', '') || 'anthropic') as ProviderName;

  // Model override
  const modelArg = args.find(a => a.startsWith('--model='));

  // Per-provider env var and default model
  const providerConfig: Record<string, { envKey: string; defaultModel: string }> = {
    anthropic: { envKey: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-20250514' },
    openai: { envKey: 'OPENAI_API_KEY', defaultModel: 'gpt-4o' },
    gemini: { envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.0-flash' },
    moonshot: { envKey: 'MOONSHOT_API_KEY', defaultModel: 'moonshot-v1-8k' },
  };

  const pc = providerConfig[provider];
  if (!pc) {
    console.error(`ERROR: Unknown provider "${provider}". Use: anthropic, openai, gemini, moonshot`);
    process.exit(1);
  }

  const apiKey = process.env[pc.envKey];
  if (!apiKey) {
    console.error(`ERROR: Set ${pc.envKey} environment variable for ${provider} provider`);
    process.exit(1);
  }

  const model = modelArg?.replace('--model=', '') || process.env.TSCG_MODEL || pc.defaultModel;

  const config: TscgConfig = {
    ...DEFAULT_CONFIG,
    provider,
    apiKey,
    model,
  };

  const includeLong = args.includes('--long');
  const quiet = args.includes('--quiet');
  const useHard = args.includes('--hard');
  const useAll = args.includes('--all');
  const useLongContext = args.includes('--long-context');
  const useRag = args.includes('--rag');
  const useTools = args.includes('--tools');
  const categoryArg = args.find((a) => a.startsWith('--category='));
  const category = categoryArg?.replace('--category=', '');

  let strategies: StrategyName[] | undefined;
  const stratArg = args.find((a) => a.startsWith('--strategies='));
  if (stratArg) {
    strategies = stratArg.replace('--strategies=', '').split(',') as StrategyName[];
  }

  // Determine test set
  let tests;
  let setLabel = 'core (19 tests)';
  if (category) {
    tests = getTestsByCategory(category);
    setLabel = `category: ${category} (${tests.length} tests)`;
  } else if (useLongContext) {
    tests = LONG_CONTEXT_NIAH_TESTS;
    setLabel = `long-context NIAH (${tests.length} tests)`;
  } else if (useRag) {
    tests = RAG_TESTS;
    setLabel = `RAG (${tests.length} tests)`;
  } else if (useTools) {
    tests = TOOL_TESTS;
    setLabel = `tool-selection (${tests.length} tests)`;
  } else if (useAll) {
    tests = getTestsBySet('all', includeLong);
    setLabel = `all (${tests.length} tests)`;
  } else if (useHard) {
    tests = getTestsBySet('hard');
    setLabel = `hard (${tests.length} tests)`;
  } else {
    tests = getAllTests(includeLong);
    setLabel = `core (${tests.length} tests${includeLong ? ', incl. long-context' : ''})`;
  }

  if (tests.length === 0) {
    console.error(`ERROR: No tests found for the specified filter.`);
    process.exit(1);
  }

  console.log(`\nTSCG Benchmark`);
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Test set: ${setLabel}`);
  console.log(`  Strategies: ${strategies?.join(', ') || 'all 6'}\n`);

  await runBenchmark({
    tests,
    config,
    strategies,
    verbose: !quiet,
  });
}

async function cmdCompile(args: string[]): Promise<void> {
  const config = getConfig();
  let text: string;

  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    text = readFileSync(args[fileIdx + 1], 'utf-8');
  } else {
    text = args.filter((a) => !a.startsWith('--')).join(' ');
  }

  if (!text.trim()) {
    console.error('ERROR: No text provided. Usage: tscg compile "your prompt"');
    process.exit(1);
  }

  console.log('\nTSCG Compiler');
  console.log('\u2500'.repeat(60));
  console.log(`Input:  ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
  console.log('\u2500'.repeat(60));

  const result = await compileTscg(text, config);

  console.log(`Output: ${result.tscg}`);
  console.log('\u2500'.repeat(60));
  console.log(`  Input chars:    ${result.inputCharCount}`);
  console.log(`  TSCG chars:     ${result.tscgCharCount}`);
  console.log(`  Compression:    ${(result.compressionRatio * 100).toFixed(1)}%`);
  console.log(`  API tokens:     ${result.inputTokens}in / ${result.outputTokens}out`);

  // Also show SAD-F version
  const sad = applySADF(result.tscg);
  console.log(`\n  SAD-F version: ${sad}`);
}

function cmdSad(args: string[]): void {
  const tscg = args.join(' ');
  if (!tscg.trim()) {
    console.error('ERROR: No TSCG prompt provided');
    process.exit(1);
  }
  console.log(applySADF(tscg));
}

// === Pipe Support ===

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// === Interactive REPL Mode ===

async function cmdOptimizeInteractive(
  profile: OptimizationProfile,
  noSadf: boolean,
  noCcp: boolean,
  sadTopK: number,
  isJson: boolean,
  isQuiet: boolean,
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\nTSCG Interactive Optimizer');
  console.log('═'.repeat(50));
  console.log(`  Profile: ${profile} | SAD-F: ${!noSadf} | CCP: ${!noCcp}`);
  console.log('  Type a prompt and press Enter to optimize.');
  console.log('  Commands: :profile <name>, :quit, :help');
  console.log('═'.repeat(50) + '\n');

  let currentProfile = profile;

  const prompt = (): Promise<string> =>
    new Promise((resolve) => rl.question('tscg> ', resolve));

  while (true) {
    const input = await prompt();
    const trimmed = input.trim();

    if (!trimmed) continue;

    // REPL commands
    if (trimmed === ':quit' || trimmed === ':q' || trimmed === ':exit') {
      console.log('Bye!');
      rl.close();
      return;
    }

    if (trimmed === ':help' || trimmed === ':h') {
      console.log('  :profile <name>  Change profile (minimal/balanced/max_compress/max_accuracy/full)');
      console.log('  :compare         Compare all profiles for last prompt');
      console.log('  :quit            Exit interactive mode');
      continue;
    }

    if (trimmed.startsWith(':profile ')) {
      const newProfile = trimmed.replace(':profile ', '').trim() as OptimizationProfile;
      const validProfiles: OptimizationProfile[] = ['minimal', 'balanced', 'max_compress', 'max_accuracy', 'full'];
      if (validProfiles.includes(newProfile)) {
        currentProfile = newProfile;
        console.log(`  Profile changed to: ${currentProfile}`);
      } else {
        console.log(`  Invalid profile. Valid: ${validProfiles.join(', ')}`);
      }
      continue;
    }

    // Optimize the input
    const result = optimizePrompt(trimmed, {
      profile: currentProfile,
      enableSADF: !noSadf,
      enableCCP: !noCcp,
      sadTopK,
      verbose: false,
    });

    if (isQuiet) {
      console.log(result.optimized);
    } else if (isJson) {
      console.log(JSON.stringify(toJSON(result), null, 2));
    } else {
      console.log(`\n  ${result.metrics.promptType} | ${result.metrics.originalTokensEst}→${result.metrics.optimizedTokensEst} tok | ${result.metrics.transformsApplied} transforms`);
      console.log('─'.repeat(50));
      console.log(`  ${result.optimized}`);
      console.log('─'.repeat(50) + '\n');
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'optimize':
    case 'opt':
    case 'o':
      await cmdOptimize(args.slice(1));
      break;
    case 'benchmark':
      await cmdBenchmark(args.slice(1));
      break;
    case 'compile':
      await cmdCompile(args.slice(1));
      break;
    case 'sad':
      cmdSad(args.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
