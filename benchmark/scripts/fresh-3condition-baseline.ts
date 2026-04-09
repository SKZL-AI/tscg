#!/usr/bin/env node
/**
 * Fresh 3-Condition Baseline — Fair Comparison Script
 *
 * Runs ALL THREE conditions fresh in the IDENTICAL setup (text-mode prompting)
 * to produce a fair, consistent comparison table for the paper.
 *
 * Conditions:
 *   1. Natural-Text:     Full JSON schemas embedded as text in system prompt
 *   2. TSCG:             Compressed with @tscg/core balanced profile
 *   3. Naive-Truncation: tool_name(required_param:type) — no descriptions
 *
 * All conditions use:
 *   - Same system prompt template
 *   - Same task set (Seed 42, 20 tasks)
 *   - Same evaluator (TABEvaluator)
 *   - Same model (Claude Sonnet 4)
 *   - Text-mode (no native tool calling) for all three
 *
 * This eliminates the format confound (native FC vs text-mode) that
 * contaminated the previous naive-truncation comparison.
 *
 * Usage:
 *   npx tsx benchmark/scripts/fresh-3condition-baseline.ts
 *   npx tsx benchmark/scripts/fresh-3condition-baseline.ts --dry-run
 *
 * Output:
 *   benchmark/results/fresh-3condition/fresh-3condition-results.json
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

// === Schema & Task Infrastructure ===
import { collectClaudeCodeTools } from '../schemas/collectors/claude-code.js';
import type { ToolDefinition } from '../../packages/core/src/types.js';

// === Task Generators (same as TAB benchmark) ===
import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { BenchmarkTask as TaskGenTask } from '../tasks/types.js';

// === Compression ===
import { compress } from '../../packages/core/src/compress.js';
import { renderNaturalSchema } from '../compression/natural-renderer.js';
import { countTokens } from '../compression/token-counter.js';
import { naiveTruncate } from '../compression/naive-truncation.js';

// === Evaluator (reuse the existing TAB scoring engine) ===
import { TABEvaluator } from '../harness/evaluator.js';
import { adaptTask } from '../harness/types.js';
import type { ParsedResponse } from '../harness/types.js';

// ============================================================
// Configuration
// ============================================================

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 5000;
const INTER_CALL_DELAY_MS = 700; // Safe rate limit buffer

const OUTPUT_DIR = resolve('benchmark/results/fresh-3condition');

// ============================================================
// CLI
// ============================================================

function parseCLI() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
    strict: false,
  });
  return { dryRun: (values['dry-run'] as boolean) ?? false };
}

// ============================================================
// Anthropic API Client (text-mode only — no native tools)
// ============================================================

interface AnthropicResponse {
  content: Array<{ type: 'text'; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

async function callAnthropic(opts: {
  system: string;
  userMessage: string;
}): Promise<{
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}> {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: opts.system,
    messages: [{ role: 'user', content: opts.userMessage }],
  };

  const t0 = Date.now();

  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const latencyMs = Date.now() - t0;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const contentText = data.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return { content: contentText, usage: data.usage, latencyMs };
}

// ============================================================
// Response Parser (text-mode: extract JSON from text)
// ============================================================

function parseTextResponse(content: string): ParsedResponse {
  // 1. Try JSON array in text
  try {
    const arrayMatch = content.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].name === 'string') {
        if (parsed.length === 1) {
          return {
            raw_output: content,
            parsed_tool_call: {
              name: parsed[0].name as string,
              arguments: (parsed[0].arguments as Record<string, unknown>) ?? {},
            },
            parse_success: true,
          };
        }
        return {
          raw_output: content,
          parsed_sequence: parsed.map(p => ({
            name: p.name as string,
            arguments: (p.arguments as Record<string, unknown>) ?? {},
          })),
          parse_success: true,
        };
      }
    }
  } catch { /* fall through */ }

  // 2. Extract all JSON objects with balanced braces
  const extracted: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = content.slice(start, i + 1);
        try {
          const obj = JSON.parse(candidate) as Record<string, unknown>;
          if (typeof obj.name === 'string') {
            extracted.push({
              name: obj.name as string,
              arguments: (obj.arguments as Record<string, unknown>) ?? {},
            });
          }
        } catch { /* skip */ }
        start = -1;
      }
    }
  }

  if (extracted.length > 1) {
    return { raw_output: content, parsed_sequence: extracted, parse_success: true };
  }
  if (extracted.length === 1) {
    return { raw_output: content, parsed_tool_call: extracted[0], parse_success: true };
  }

  // 3. No tool call found (valid for no_tool tasks)
  return { raw_output: content, parse_success: true };
}

// ============================================================
// Task Adapter
// ============================================================

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
// System Prompt Builder (identical for all conditions)
// ============================================================

function buildSystemPrompt(schemaText: string): string {
  return [
    'You are a helpful assistant with access to the following tools.',
    'When the user request requires a tool, respond with ONLY a JSON tool call object.',
    'Use this exact format: {"name": "tool_name", "arguments": {"param": "value"}}',
    'For multiple sequential tools, output each JSON object on its own line.',
    'If no tool is needed, respond normally in plain text.',
    'IMPORTANT: Output the JSON directly. Do not wrap it in markdown, do not explain.',
    '',
    'Available tools:',
    schemaText,
  ].join('\n');
}

// ============================================================
// Result Types
// ============================================================

interface TaskResult {
  task_id: string;
  category: string;
  difficulty: string;
  condition: string;
  tool_selection_accuracy: number;
  parameter_f1: number;
  overall: number;
  raw_output: string;
  parsed_tool_name: string | null;
  expected_tool_name: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  timestamp: string;
}

// ============================================================
// Main
// ============================================================

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function runCondition(
  conditionName: string,
  tasks: ReturnType<typeof adaptGeneratedTask>[],
  systemPrompt: string,
  evaluator: TABEvaluator,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const progress = `[${i + 1}/${tasks.length}]`;

    process.stdout.write(
      `  ${progress} ${conditionName.padEnd(18)} | ${task.task_id} ... `
    );

    let result: TaskResult | null = null;

    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await callAnthropic({
          system: systemPrompt,
          userMessage: task.user_message,
        });

        const parsed = parseTextResponse(response.content);
        const scores = evaluator.score(parsed, task.ground_truth);

        const parsedToolName = parsed.parsed_tool_call?.name
          ?? parsed.parsed_sequence?.[0]?.name
          ?? null;

        result = {
          task_id: task.task_id,
          category: task.category ?? 'unknown',
          difficulty: task.difficulty ?? 'unknown',
          condition: conditionName,
          tool_selection_accuracy: scores.tool_selection_accuracy,
          parameter_f1: scores.parameter_f1,
          overall: scores.overall,
          raw_output: response.content.slice(0, 500),
          parsed_tool_name: parsedToolName,
          expected_tool_name: task.ground_truth.tool_name ?? null,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          latency_ms: response.latencyMs,
          timestamp: new Date().toISOString(),
        };

        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (attempt < RETRY_ATTEMPTS) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          console.log(`\n    Retry ${attempt + 1}/${RETRY_ATTEMPTS} after ${delay}ms: ${errMsg}`);
          await sleep(delay);
        } else {
          result = {
            task_id: task.task_id,
            category: task.category ?? 'unknown',
            difficulty: task.difficulty ?? 'unknown',
            condition: conditionName,
            tool_selection_accuracy: 0,
            parameter_f1: 0,
            overall: 0,
            raw_output: `ERROR: ${errMsg}`,
            parsed_tool_name: null,
            expected_tool_name: task.ground_truth.tool_name ?? null,
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: 0,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    if (result) {
      results.push(result);
      const symbol = result.overall >= 0.5 ? '+' : '-';
      const toolMatch = result.parsed_tool_name === result.expected_tool_name ? 'OK' : 'MISS';
      console.log(
        `${symbol} overall=${result.overall.toFixed(2)} tool=${toolMatch} ` +
        `(${result.parsed_tool_name ?? 'none'} vs ${result.expected_tool_name ?? 'none'}) ` +
        `${result.latency_ms}ms`
      );
    }

    await sleep(INTER_CALL_DELAY_MS);
  }

  return results;
}

async function main(): Promise<void> {
  const cli = parseCLI();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(80));
  console.log('  FRESH 3-CONDITION BASELINE — Fair Comparison');
  console.log('  Scenario A: Claude Code (16 tools, 20 tasks)');
  console.log('  Model: ' + MODEL);
  console.log('  Mode: ALL text-based (no native FC) — eliminates format confound');
  console.log('='.repeat(80));

  // --- Step 1: Collect schemas ---
  console.log('\n  [1/4] Collecting Claude Code tool schemas...');
  const collection = collectClaudeCodeTools();
  const tools = collection.tools as ToolDefinition[];
  console.log(`         ${tools.length} tools collected`);

  // --- Step 2: Generate tasks (deterministic, seed=42) ---
  console.log('  [2/4] Generating 20 tasks (seed=42)...');
  const genTasks = generateTasksForCollection(collection, 42);
  const tasks = genTasks.map(adaptGeneratedTask);
  console.log(`         ${tasks.length} tasks generated`);
  console.log(`         Categories: ${[...new Set(genTasks.map(t => t.category))].join(', ')}`);

  // --- Step 3: Prepare three schema conditions ---
  console.log('  [3/4] Preparing schema conditions...\n');

  // 3a. Natural-Text: full human-readable schemas
  const naturalText = renderNaturalSchema(tools);
  const naturalTokens = countTokens(naturalText);

  // 3b. TSCG: compressed with balanced profile
  const tscgResult = compress(tools, { profile: 'balanced', model: 'auto', preserveToolNames: true });
  const tscgText = tscgResult.compressed;
  const tscgTokens = countTokens(tscgText);

  // 3c. Naive truncation: tool name + required params + types
  const toolsForNaive = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: {
      type: t.function.parameters.type,
      required: t.function.parameters.required,
      properties: Object.fromEntries(
        Object.entries(t.function.parameters.properties).map(([k, v]) => [
          k,
          { type: v.type, description: v.description },
        ])
      ),
    },
  }));
  const naiveText = naiveTruncate(toolsForNaive);
  const naiveTokens = countTokens(naiveText);

  // Token comparison
  const tscgSavings = ((1 - tscgTokens / naturalTokens) * 100).toFixed(1);
  const naiveSavings = ((1 - naiveTokens / naturalTokens) * 100).toFixed(1);

  console.log(`         Condition           | Tokens | Savings`);
  console.log(`         --------------------|--------|--------`);
  console.log(`         Natural-Text        | ${String(naturalTokens).padStart(6)} | baseline`);
  console.log(`         TSCG (balanced)     | ${String(tscgTokens).padStart(6)} | ${tscgSavings}%`);
  console.log(`         Naive Truncation    | ${String(naiveTokens).padStart(6)} | ${naiveSavings}%`);

  // Dry run
  if (cli.dryRun) {
    const totalCalls = 3 * tasks.length;
    console.log(`\n  [DRY RUN] Plan:`);
    console.log(`    3 conditions × ${tasks.length} tasks = ${totalCalls} API calls`);
    console.log(`    Estimated time: ~${Math.ceil(totalCalls * 8 / 60)} minutes`);
    console.log(`    Estimated cost: ~$${(totalCalls * 0.008).toFixed(2)}`);
    console.log('\n  Remove --dry-run to execute.\n');
    return;
  }

  // --- Step 4: Run all three conditions ---
  console.log('\n  [4/4] Running benchmarks (60 API calls)...');
  const evaluator = new TABEvaluator();
  const allResults: TaskResult[] = [];

  // Build system prompts
  const naturalSystemPrompt = buildSystemPrompt(naturalText);
  const tscgSystemPrompt = buildSystemPrompt(tscgText);
  const naiveSystemPrompt = buildSystemPrompt(naiveText);

  // 4a. Natural-Text
  console.log('\n  --- Condition: NATURAL-TEXT (full schemas as text) ---');
  const naturalResults = await runCondition('natural_text', tasks, naturalSystemPrompt, evaluator);
  allResults.push(...naturalResults);

  // 4b. TSCG
  console.log('\n  --- Condition: TSCG (balanced compression) ---');
  const tscgResults = await runCondition('tscg', tasks, tscgSystemPrompt, evaluator);
  allResults.push(...tscgResults);

  // 4c. Naive Truncation
  console.log('\n  --- Condition: NAIVE TRUNCATION ---');
  const naiveResults = await runCondition('naive_truncation', tasks, naiveSystemPrompt, evaluator);
  allResults.push(...naiveResults);

  // ============================================================
  // Results Aggregation
  // ============================================================

  console.log('\n' + '='.repeat(80));
  console.log('  RESULTS');
  console.log('='.repeat(80));

  const byCondition = new Map<string, TaskResult[]>();
  for (const r of allResults) {
    const arr = byCondition.get(r.condition) ?? [];
    arr.push(r);
    byCondition.set(r.condition, arr);
  }

  interface ConditionAggregate {
    condition: string;
    accuracy_mean: number;
    tool_selection_mean: number;
    parameter_f1_mean: number;
    n_tasks: number;
    avg_input_tokens: number;
    avg_output_tokens: number;
    avg_latency_ms: number;
    token_savings_pct: number;
  }

  const aggregates: ConditionAggregate[] = [];
  const conditionTokens: Record<string, number> = {
    natural_text: naturalTokens,
    tscg: tscgTokens,
    naive_truncation: naiveTokens,
  };

  for (const [condition, results] of byCondition.entries()) {
    const n = results.length;
    const accuracyMean = results.reduce((s, r) => s + r.overall, 0) / n;
    const toolSelMean = results.reduce((s, r) => s + r.tool_selection_accuracy, 0) / n;
    const paramF1Mean = results.reduce((s, r) => s + r.parameter_f1, 0) / n;
    const avgInputTokens = results.reduce((s, r) => s + r.input_tokens, 0) / n;
    const avgOutputTokens = results.reduce((s, r) => s + r.output_tokens, 0) / n;
    const avgLatency = results.reduce((s, r) => s + r.latency_ms, 0) / n;
    const savings = condition === 'natural_text' ? 0 :
      ((1 - (conditionTokens[condition] ?? 0) / naturalTokens) * 100);

    aggregates.push({
      condition,
      accuracy_mean: accuracyMean,
      tool_selection_mean: toolSelMean,
      parameter_f1_mean: paramF1Mean,
      n_tasks: n,
      avg_input_tokens: Math.round(avgInputTokens),
      avg_output_tokens: Math.round(avgOutputTokens),
      avg_latency_ms: Math.round(avgLatency),
      token_savings_pct: parseFloat(savings.toFixed(1)),
    });
  }

  // Print comparison table
  console.log('\n  Condition              | Accuracy | Tool Sel | Param F1 | Savings | N');
  console.log('  -----------------------|----------|----------|----------|---------|----');
  for (const agg of aggregates) {
    console.log(
      `  ${agg.condition.padEnd(22)} | ` +
      `${(agg.accuracy_mean * 100).toFixed(1).padStart(5)}%  | ` +
      `${(agg.tool_selection_mean * 100).toFixed(1).padStart(5)}%  | ` +
      `${(agg.parameter_f1_mean * 100).toFixed(1).padStart(5)}%  | ` +
      `${agg.token_savings_pct > 0 ? agg.token_savings_pct.toFixed(1).padStart(4) + '%' : '  0%  '} | ${agg.n_tasks}`
    );
  }

  // ARR computation
  const naturalAcc = aggregates.find(a => a.condition === 'natural_text')?.accuracy_mean ?? 0;
  const tscgAcc = aggregates.find(a => a.condition === 'tscg')?.accuracy_mean ?? 0;
  const naiveAcc = aggregates.find(a => a.condition === 'naive_truncation')?.accuracy_mean ?? 0;

  const tscgARR = naturalAcc > 0 ? tscgAcc / naturalAcc : 0;
  const naiveARR = naturalAcc > 0 ? naiveAcc / naturalAcc : 0;

  console.log('\n  --- Accuracy Retention Rate (ARR = accuracy / natural_text_accuracy) ---');
  console.log(`  TSCG ARR:              ${(tscgARR * 100).toFixed(1)}%`);
  console.log(`  Naive Truncation ARR:  ${(naiveARR * 100).toFixed(1)}%`);

  // Per-category breakdown
  for (const [condName, results] of byCondition.entries()) {
    const byCategory = new Map<string, TaskResult[]>();
    for (const r of results) {
      const arr = byCategory.get(r.category) ?? [];
      arr.push(r);
      byCategory.set(r.category, arr);
    }

    console.log(`\n  --- ${condName}: Per-Category Breakdown ---`);
    console.log('  Category              | Accuracy | Tool Sel | N');
    console.log('  ----------------------|----------|----------|---');
    for (const [cat, catResults] of byCategory.entries()) {
      const n = catResults.length;
      const acc = catResults.reduce((s, r) => s + r.overall, 0) / n;
      const tsel = catResults.reduce((s, r) => s + r.tool_selection_accuracy, 0) / n;
      console.log(
        `  ${cat.padEnd(22)} | ${(acc * 100).toFixed(1).padStart(5)}%  | ${(tsel * 100).toFixed(1).padStart(5)}%  | ${n}`
      );
    }
  }

  // Key insight
  console.log('\n  --- KEY INSIGHT ---');
  console.log(`  All conditions ran in IDENTICAL text-mode setup.`);
  console.log(`  Natural-Text: ${(naturalAcc * 100).toFixed(1)}% (baseline)`);
  console.log(`  TSCG:         ${(tscgAcc * 100).toFixed(1)}% (${tscgSavings}% savings, ARR=${(tscgARR * 100).toFixed(1)}%)`);
  console.log(`  Naive Trunc:  ${(naiveAcc * 100).toFixed(1)}% (${naiveSavings}% savings, ARR=${(naiveARR * 100).toFixed(1)}%)`);

  if (tscgAcc > naiveAcc) {
    console.log(`  => TSCG beats naive truncation by ${((tscgAcc - naiveAcc) * 100).toFixed(1)}pp`);
    console.log(`     TSCG's semantic preservation matters!`);
  } else {
    console.log(`  => Naive truncation matches/beats TSCG on this scenario.`);
    console.log(`     This is expected for small tool counts (16) with distinctive names.`);
    console.log(`     Run the 50-tool test (Run 2) to show where TSCG pulls ahead.`);
  }

  // ============================================================
  // Save Results
  // ============================================================

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputData = {
    meta: {
      script: 'fresh-3condition-baseline.ts',
      model: MODEL,
      scenario: 'A',
      schema_source: 'claude-code',
      tools_count: tools.length,
      tasks_count: tasks.length,
      mode: 'ALL text-based (no native FC)',
      format_confound_eliminated: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    },
    schema_conditions: {
      natural_text: {
        tokens: naturalTokens,
        savings_pct: 0,
        format: 'Full human-readable tool descriptions embedded in system prompt',
      },
      tscg: {
        tokens: tscgTokens,
        savings_pct: parseFloat(tscgSavings),
        format: 'TSCG balanced profile compression',
        applied_principles: tscgResult.appliedPrinciples,
      },
      naive_truncation: {
        tokens: naiveTokens,
        savings_pct: parseFloat(naiveSavings),
        format: 'tool_name(required_param:type,...) — no descriptions, no optional params',
        sample: naiveText,
      },
    },
    comparison: {
      natural_text_accuracy: naturalAcc,
      tscg_accuracy: tscgAcc,
      naive_accuracy: naiveAcc,
      tscg_arr: tscgARR,
      naive_arr: naiveARR,
      tscg_vs_naive_pp: (tscgAcc - naiveAcc) * 100,
    },
    aggregates,
    results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'fresh-3condition-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Duration: ${durationSec}s`);
  console.log(`  API calls: ${allResults.length}`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('\nFATAL ERROR:');
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
