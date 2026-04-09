#!/usr/bin/env node
/**
 * Run 2: 50-Tool 3-Condition Comparison
 *
 * Tests the hypothesis that naive truncation fails at scale.
 * With 50 tools and similar names across domains, descriptions
 * become essential for disambiguation.
 *
 * Conditions:
 *   1. Natural-Text:     Full schemas as text in system prompt
 *   2. TSCG:             Compressed with balanced profile
 *   3. Naive-Truncation: tool_name(required_param:type) only
 *
 * Setup:
 *   - 50 synthetic tools (Scenario C, seed=42)
 *   - 20 tasks per condition
 *   - Claude Sonnet 4, text-mode, temperature=0
 *
 * Expected: TSCG >> Naive Truncation at 50 tools because
 * descriptions are needed for disambiguation.
 *
 * Usage:
 *   npx tsx benchmark/scripts/run2-50tools-3condition.ts
 *   npx tsx benchmark/scripts/run2-50tools-3condition.ts --dry-run
 *
 * Output:
 *   benchmark/results/run2-50tools/run2-50tools-results.json
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

// === Schema Infrastructure ===
import { generateSyntheticCatalog } from '../schemas/collectors/synthetic.js';
import { collectionToSchemas } from '../schemas/types.js';
import type { ToolDefinition } from '../../packages/core/src/types.js';

// === Task Generators ===
import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { BenchmarkTask as TaskGenTask } from '../tasks/types.js';

// === Compression ===
import { compress } from '../../packages/core/src/compress.js';
import { renderNaturalSchema } from '../compression/natural-renderer.js';
import { countTokens } from '../compression/token-counter.js';
import { naiveTruncate } from '../compression/naive-truncation.js';

// === Evaluator ===
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
const INTER_CALL_DELAY_MS = 700;

const OUTPUT_DIR = resolve('benchmark/results/run2-50tools');
const CATALOG_SIZE = 50;
const SEED = 42;

// ============================================================
// CLI
// ============================================================

function parseCLI() {
  const { values } = parseArgs({
    options: { 'dry-run': { type: 'boolean', default: false } },
    strict: false,
  });
  return { dryRun: (values['dry-run'] as boolean) ?? false };
}

// ============================================================
// Anthropic API (text-mode only)
// ============================================================

interface AnthropicResponse {
  content: Array<{ type: 'text'; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

async function callAnthropic(system: string, userMessage: string): Promise<{
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}> {
  const t0 = Date.now();
  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
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
// Response Parser (text-mode)
// ============================================================

function parseTextResponse(content: string): ParsedResponse {
  // Try JSON array
  try {
    const arrayMatch = content.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].name === 'string') {
        if (parsed.length === 1) {
          return { raw_output: content, parsed_tool_call: { name: parsed[0].name as string, arguments: (parsed[0].arguments as Record<string, unknown>) ?? {} }, parse_success: true };
        }
        return { raw_output: content, parsed_sequence: parsed.map(p => ({ name: p.name as string, arguments: (p.arguments as Record<string, unknown>) ?? {} })), parse_success: true };
      }
    }
  } catch { /* fall through */ }

  // Extract JSON objects with balanced braces
  const extracted: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(content.slice(start, i + 1)) as Record<string, unknown>;
          if (typeof obj.name === 'string') extracted.push({ name: obj.name as string, arguments: (obj.arguments as Record<string, unknown>) ?? {} });
        } catch { /* skip */ }
        start = -1;
      }
    }
  }

  if (extracted.length > 1) return { raw_output: content, parsed_sequence: extracted, parse_success: true };
  if (extracted.length === 1) return { raw_output: content, parsed_tool_call: extracted[0], parse_success: true };
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
      sequence: task.ground_truth.sequence?.map(s => ({ tool_name: s.tool_name, parameters: s.parameters })),
      action: task.ground_truth.action,
      answer: task.ground_truth.answer,
    },
  });
}

// ============================================================
// System Prompt Builder
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ============================================================
// Run Condition
// ============================================================

async function runCondition(
  conditionName: string,
  tasks: ReturnType<typeof adaptGeneratedTask>[],
  systemPrompt: string,
  evaluator: TABEvaluator,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] ${conditionName.padEnd(18)} | ${task.task_id} ... `);

    let result: TaskResult | null = null;

    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await callAnthropic(systemPrompt, task.user_message);
        const parsed = parseTextResponse(response.content);
        const scores = evaluator.score(parsed, task.ground_truth);
        const parsedToolName = parsed.parsed_tool_call?.name ?? parsed.parsed_sequence?.[0]?.name ?? null;

        result = {
          task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
          condition: conditionName,
          tool_selection_accuracy: scores.tool_selection_accuracy, parameter_f1: scores.parameter_f1,
          overall: scores.overall,
          raw_output: response.content.slice(0, 500),
          parsed_tool_name: parsedToolName, expected_tool_name: task.ground_truth.tool_name ?? null,
          input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          latency_ms: response.latencyMs, timestamp: new Date().toISOString(),
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
            task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
            condition: conditionName,
            tool_selection_accuracy: 0, parameter_f1: 0, overall: 0,
            raw_output: `ERROR: ${errMsg}`,
            parsed_tool_name: null, expected_tool_name: task.ground_truth.tool_name ?? null,
            input_tokens: 0, output_tokens: 0, latency_ms: 0, timestamp: new Date().toISOString(),
          };
        }
      }
    }

    if (result) {
      results.push(result);
      const symbol = result.overall >= 0.5 ? '+' : '-';
      const toolMatch = result.parsed_tool_name === result.expected_tool_name ? 'OK' : 'MISS';
      console.log(`${symbol} overall=${result.overall.toFixed(2)} tool=${toolMatch} (${result.parsed_tool_name ?? 'none'} vs ${result.expected_tool_name ?? 'none'}) ${result.latency_ms}ms`);
    }

    await sleep(INTER_CALL_DELAY_MS);
  }

  return results;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const cli = parseCLI();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(80));
  console.log('  RUN 2: 50-TOOL 3-CONDITION COMPARISON');
  console.log('  Scenario C: Synthetic Catalog (50 tools, 20 tasks)');
  console.log('  Model: ' + MODEL);
  console.log('  Mode: ALL text-based — eliminates format confound');
  console.log('  Hypothesis: TSCG >> Naive Truncation at high tool count');
  console.log('='.repeat(80));

  // --- Step 1: Generate 50-tool catalog ---
  console.log('\n  [1/4] Generating 50-tool synthetic catalog (seed=42)...');
  const collection = generateSyntheticCatalog(CATALOG_SIZE, SEED);
  const tools = collection.tools as ToolDefinition[];
  console.log(`         ${tools.length} tools generated`);

  // Show some tool names to demonstrate similarity
  const toolNames = tools.map(t => t.function.name);
  console.log(`         Sample names: ${toolNames.slice(0, 8).join(', ')}...`);

  // --- Step 2: Generate tasks ---
  console.log('  [2/4] Generating 20 tasks (seed=42)...');
  const genTasks = generateTasksForCollection(collection, SEED);
  const tasks = genTasks.map(adaptGeneratedTask);
  console.log(`         ${tasks.length} tasks generated`);
  console.log(`         Categories: ${[...new Set(genTasks.map(t => t.category))].join(', ')}`);

  // --- Step 3: Prepare conditions ---
  console.log('  [3/4] Preparing schema conditions...\n');

  const naturalText = renderNaturalSchema(tools);
  const naturalTokens = countTokens(naturalText);

  const tscgResult = compress(tools, { profile: 'balanced', model: 'auto', preserveToolNames: true });
  const tscgText = tscgResult.compressed;
  const tscgTokens = countTokens(tscgText);

  const toolsForNaive = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: {
      type: t.function.parameters.type,
      required: t.function.parameters.required,
      properties: Object.fromEntries(
        Object.entries(t.function.parameters.properties).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
    },
  }));
  const naiveText = naiveTruncate(toolsForNaive);
  const naiveTokens = countTokens(naiveText);

  const tscgSavings = ((1 - tscgTokens / naturalTokens) * 100).toFixed(1);
  const naiveSavings = ((1 - naiveTokens / naturalTokens) * 100).toFixed(1);

  console.log(`         Condition           | Tokens | Savings`);
  console.log(`         --------------------|--------|--------`);
  console.log(`         Natural-Text        | ${String(naturalTokens).padStart(6)} | baseline`);
  console.log(`         TSCG (balanced)     | ${String(tscgTokens).padStart(6)} | ${tscgSavings}%`);
  console.log(`         Naive Truncation    | ${String(naiveTokens).padStart(6)} | ${naiveSavings}%`);

  // Show naive truncation sample (first 10 tools)
  const naiveLines = naiveText.split('\n');
  console.log(`\n         Naive truncation sample (first 10 of ${naiveLines.length}):`);
  for (const line of naiveLines.slice(0, 10)) {
    console.log(`           ${line}`);
  }

  if (cli.dryRun) {
    const totalCalls = 3 * tasks.length;
    console.log(`\n  [DRY RUN] Plan:`);
    console.log(`    3 conditions × ${tasks.length} tasks = ${totalCalls} API calls`);
    console.log(`    Estimated time: ~${Math.ceil(totalCalls * 8 / 60)} minutes`);
    console.log(`    Estimated cost: ~$${(totalCalls * 0.025).toFixed(2)}`);
    console.log('\n  Remove --dry-run to execute.\n');
    return;
  }

  if (!API_KEY) {
    console.error('\n  ERROR: Set ANTHROPIC_API_KEY environment variable.');
    process.exit(1);
  }

  // --- Step 4: Run all conditions ---
  console.log('\n  [4/4] Running benchmarks (60 API calls)...');
  const evaluator = new TABEvaluator();
  const allResults: TaskResult[] = [];

  console.log('\n  --- Condition: NATURAL-TEXT (full 50-tool schemas) ---');
  allResults.push(...await runCondition('natural_text', tasks, buildSystemPrompt(naturalText), evaluator));

  console.log('\n  --- Condition: TSCG (balanced compression) ---');
  allResults.push(...await runCondition('tscg', tasks, buildSystemPrompt(tscgText), evaluator));

  console.log('\n  --- Condition: NAIVE TRUNCATION ---');
  allResults.push(...await runCondition('naive_truncation', tasks, buildSystemPrompt(naiveText), evaluator));

  // ============================================================
  // Results
  // ============================================================

  console.log('\n' + '='.repeat(80));
  console.log('  RESULTS — 50 TOOLS');
  console.log('='.repeat(80));

  const byCondition = new Map<string, TaskResult[]>();
  for (const r of allResults) {
    const arr = byCondition.get(r.condition) ?? [];
    arr.push(r);
    byCondition.set(r.condition, arr);
  }

  interface Agg {
    condition: string; accuracy_mean: number; tool_selection_mean: number;
    parameter_f1_mean: number; n_tasks: number; token_savings_pct: number;
  }

  const condTokens: Record<string, number> = { natural_text: naturalTokens, tscg: tscgTokens, naive_truncation: naiveTokens };
  const aggregates: Agg[] = [];

  for (const [condition, results] of byCondition.entries()) {
    const n = results.length;
    aggregates.push({
      condition,
      accuracy_mean: results.reduce((s, r) => s + r.overall, 0) / n,
      tool_selection_mean: results.reduce((s, r) => s + r.tool_selection_accuracy, 0) / n,
      parameter_f1_mean: results.reduce((s, r) => s + r.parameter_f1, 0) / n,
      n_tasks: n,
      token_savings_pct: condition === 'natural_text' ? 0 : parseFloat(((1 - (condTokens[condition] ?? 0) / naturalTokens) * 100).toFixed(1)),
    });
  }

  console.log('\n  Condition              | Accuracy | Tool Sel | Param F1 | Savings | N');
  console.log('  -----------------------|----------|----------|----------|---------|----');
  for (const agg of aggregates) {
    console.log(
      `  ${agg.condition.padEnd(22)} | ${(agg.accuracy_mean * 100).toFixed(1).padStart(5)}%  | ` +
      `${(agg.tool_selection_mean * 100).toFixed(1).padStart(5)}%  | ${(agg.parameter_f1_mean * 100).toFixed(1).padStart(5)}%  | ` +
      `${agg.token_savings_pct > 0 ? agg.token_savings_pct.toFixed(1).padStart(4) + '%' : '  0%  '} | ${agg.n_tasks}`
    );
  }

  const naturalAcc = aggregates.find(a => a.condition === 'natural_text')?.accuracy_mean ?? 0;
  const tscgAcc = aggregates.find(a => a.condition === 'tscg')?.accuracy_mean ?? 0;
  const naiveAcc = aggregates.find(a => a.condition === 'naive_truncation')?.accuracy_mean ?? 0;

  console.log('\n  --- KEY INSIGHT (50 TOOLS) ---');
  console.log(`  Natural-Text: ${(naturalAcc * 100).toFixed(1)}%`);
  console.log(`  TSCG:         ${(tscgAcc * 100).toFixed(1)}% (${tscgSavings}% savings)`);
  console.log(`  Naive Trunc:  ${(naiveAcc * 100).toFixed(1)}% (${naiveSavings}% savings)`);
  console.log(`  TSCG vs Naive: ${((tscgAcc - naiveAcc) * 100).toFixed(1)}pp`);

  if (tscgAcc > naiveAcc + 0.05) {
    console.log(`  => CONFIRMED: TSCG's semantic preservation matters at scale!`);
    console.log(`     Naive truncation loses ${((naiveAcc - tscgAcc) * -100).toFixed(1)}pp without descriptions.`);
  }

  // Per-category
  for (const [condName, results] of byCondition.entries()) {
    const byCategory = new Map<string, TaskResult[]>();
    for (const r of results) { const arr = byCategory.get(r.category) ?? []; arr.push(r); byCategory.set(r.category, arr); }
    console.log(`\n  --- ${condName}: Per-Category ---`);
    for (const [cat, catResults] of byCategory.entries()) {
      const n = catResults.length;
      const acc = catResults.reduce((s, r) => s + r.overall, 0) / n;
      console.log(`    ${cat.padEnd(22)} | ${(acc * 100).toFixed(1)}% (n=${n})`);
    }
  }

  // Save
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputData = {
    meta: {
      script: 'run2-50tools-3condition.ts', model: MODEL, scenario: 'C',
      catalog_size: CATALOG_SIZE, tools_count: tools.length, tasks_count: tasks.length,
      mode: 'ALL text-based', seed: SEED,
      timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime,
    },
    schema_conditions: {
      natural_text: { tokens: naturalTokens, savings_pct: 0 },
      tscg: { tokens: tscgTokens, savings_pct: parseFloat(tscgSavings), principles: tscgResult.appliedPrinciples },
      naive_truncation: { tokens: naiveTokens, savings_pct: parseFloat(naiveSavings), sample: naiveText.slice(0, 1000) },
    },
    comparison: {
      natural_text_accuracy: naturalAcc, tscg_accuracy: tscgAcc, naive_accuracy: naiveAcc,
      tscg_vs_naive_pp: (tscgAcc - naiveAcc) * 100,
      tscg_arr: naturalAcc > 0 ? tscgAcc / naturalAcc : 0,
      naive_arr: naturalAcc > 0 ? naiveAcc / naturalAcc : 0,
    },
    aggregates, results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'run2-50tools-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`  API calls: ${allResults.length}`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
