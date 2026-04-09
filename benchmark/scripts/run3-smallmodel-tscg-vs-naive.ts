#!/usr/bin/env node
/**
 * Run 3: Small Model — TSCG vs Naive Truncation
 *
 * Tests TSCG's semantic preservation advantage on small models
 * where parameter understanding is weaker.
 *
 * Models: Gemma 3 4B, Mistral 7B
 * Tools: 20 synthetic tools (moderate difficulty)
 * Tasks: 20 per condition
 * Conditions: TSCG, Naive-Truncation (+ Natural-Text baseline)
 *
 * Expected: TSCG >> Naive on small models because they need
 * descriptions more than frontier models do.
 *
 * Usage:
 *   npx tsx benchmark/scripts/run3-smallmodel-tscg-vs-naive.ts
 *   npx tsx benchmark/scripts/run3-smallmodel-tscg-vs-naive.ts --dry-run
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { generateSyntheticCatalog } from '../schemas/collectors/synthetic.js';
import type { ToolDefinition } from '../../packages/core/src/types.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { BenchmarkTask as TaskGenTask } from '../tasks/types.js';
import { compress } from '../../packages/core/src/compress.js';
import { renderNaturalSchema } from '../compression/natural-renderer.js';
import { countTokens } from '../compression/token-counter.js';
import { naiveTruncate } from '../compression/naive-truncation.js';
import { TABEvaluator } from '../harness/evaluator.js';
import { adaptTask } from '../harness/types.js';
import type { ParsedResponse } from '../harness/types.js';

// ============================================================
// Configuration
// ============================================================

const OLLAMA_BASE_URL = 'http://localhost:11434';
const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const INTER_CALL_DELAY_MS = 100; // Ollama is local, no rate limiting needed

const OUTPUT_DIR = resolve('benchmark/results/run3-smallmodel');
const CATALOG_SIZE = 20;
const SEED = 42;

const MODELS = [
  { name: 'gemma3-4b', ollama: 'gemma3:4b' },
  { name: 'mistral-7b', ollama: 'mistral:7b-instruct-v0.3-q4_K_M' },
];

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
// Ollama API Client
// ============================================================

interface OllamaResponse {
  message: { role: string; content: string };
  eval_count?: number;
  prompt_eval_count?: number;
}

async function callOllama(model: string, system: string, userMessage: string): Promise<{
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}> {
  const t0 = Date.now();
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: { temperature: TEMPERATURE, num_predict: MAX_TOKENS },
    }),
  });

  const latencyMs = Date.now() - t0;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as OllamaResponse;
  return {
    content: data.message.content,
    usage: {
      input_tokens: data.prompt_eval_count ?? 0,
      output_tokens: data.eval_count ?? 0,
    },
    latencyMs,
  };
}

// ============================================================
// Response Parser
// ============================================================

function parseTextResponse(content: string): ParsedResponse {
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
    task_id: task.task_id, scenario: task.scenario, query: task.query,
    category: task.category, difficulty: task.difficulty,
    ground_truth: {
      tool_name: task.ground_truth.tool_name, parameters: task.ground_truth.parameters,
      sequence: task.ground_truth.sequence?.map(s => ({ tool_name: s.tool_name, parameters: s.parameters })),
      action: task.ground_truth.action, answer: task.ground_truth.answer,
    },
  });
}

// ============================================================
// System Prompt
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
// Types & Helpers
// ============================================================

interface TaskResult {
  task_id: string; category: string; difficulty: string;
  model: string; condition: string;
  tool_selection_accuracy: number; parameter_f1: number; overall: number;
  raw_output: string; parsed_tool_name: string | null; expected_tool_name: string | null;
  input_tokens: number; output_tokens: number; latency_ms: number; timestamp: string;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function runCondition(
  modelConfig: { name: string; ollama: string },
  conditionName: string,
  tasks: ReturnType<typeof adaptGeneratedTask>[],
  systemPrompt: string,
  evaluator: TABEvaluator,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] ${modelConfig.name.padEnd(12)} ${conditionName.padEnd(18)} | ${task.task_id} ... `);

    let result: TaskResult | null = null;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await callOllama(modelConfig.ollama, systemPrompt, task.user_message);
        const parsed = parseTextResponse(response.content);
        const scores = evaluator.score(parsed, task.ground_truth);
        const parsedToolName = parsed.parsed_tool_call?.name ?? parsed.parsed_sequence?.[0]?.name ?? null;

        result = {
          task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
          model: modelConfig.name, condition: conditionName,
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
          console.log(`\n    Retry ${attempt + 1}/${RETRY_ATTEMPTS}: ${errMsg}`);
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        } else {
          result = {
            task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
            model: modelConfig.name, condition: conditionName,
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
      console.log(`${symbol} overall=${result.overall.toFixed(2)} (${result.parsed_tool_name ?? 'none'} vs ${result.expected_tool_name ?? 'none'}) ${result.latency_ms}ms`);
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
  console.log('  RUN 3: SMALL MODEL — TSCG vs NAIVE TRUNCATION');
  console.log('  20 Synthetic Tools, 20 Tasks per condition');
  console.log('  Models: ' + MODELS.map(m => m.name).join(', '));
  console.log('  Conditions: Natural-Text, TSCG, Naive-Truncation');
  console.log('='.repeat(80));

  // Check Ollama
  try {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!resp.ok) throw new Error('Ollama not responding');
    console.log('\n  Ollama: connected');
  } catch {
    console.error('\n  ERROR: Ollama not running. Start with: ollama serve');
    process.exit(1);
  }

  // Step 1: Generate catalog
  console.log('\n  [1/3] Generating 20-tool synthetic catalog (seed=42)...');
  const collection = generateSyntheticCatalog(CATALOG_SIZE, SEED);
  const tools = collection.tools as ToolDefinition[];
  console.log(`         ${tools.length} tools generated`);

  // Step 2: Generate tasks
  console.log('  [2/3] Generating 20 tasks (seed=42)...');
  const genTasks = generateTasksForCollection(collection, SEED);
  const tasks = genTasks.map(adaptGeneratedTask);
  console.log(`         ${tasks.length} tasks generated`);

  // Step 3: Prepare conditions
  console.log('  [3/3] Preparing conditions...\n');

  const naturalText = renderNaturalSchema(tools);
  const naturalTokens = countTokens(naturalText);

  const tscgResult = compress(tools, { profile: 'balanced', model: 'auto', preserveToolNames: true });
  const tscgText = tscgResult.compressed;
  const tscgTokens = countTokens(tscgText);

  const toolsForNaive = tools.map(t => ({
    name: t.function.name, description: t.function.description,
    parameters: {
      type: t.function.parameters.type, required: t.function.parameters.required,
      properties: Object.fromEntries(Object.entries(t.function.parameters.properties).map(([k, v]) => [k, { type: v.type, description: v.description }])),
    },
  }));
  const naiveText = naiveTruncate(toolsForNaive);
  const naiveTokens = countTokens(naiveText);

  const tscgSavings = ((1 - tscgTokens / naturalTokens) * 100).toFixed(1);
  const naiveSavings = ((1 - naiveTokens / naturalTokens) * 100).toFixed(1);

  console.log(`         Natural-Text: ${naturalTokens} tokens`);
  console.log(`         TSCG:         ${tscgTokens} tokens (${tscgSavings}% savings)`);
  console.log(`         Naive:        ${naiveTokens} tokens (${naiveSavings}% savings)`);

  const totalCalls = MODELS.length * 3 * tasks.length;

  if (cli.dryRun) {
    console.log(`\n  [DRY RUN]`);
    console.log(`    ${MODELS.length} models × 3 conditions × ${tasks.length} tasks = ${totalCalls} calls`);
    console.log(`    Cost: $0 (local Ollama)`);
    console.log(`    Estimated time: ~${Math.ceil(totalCalls * 15 / 60)} minutes`);
    console.log('\n  Remove --dry-run to execute.\n');
    return;
  }

  // Run benchmarks
  const evaluator = new TABEvaluator();
  const allResults: TaskResult[] = [];
  const conditions = [
    { name: 'natural_text', prompt: buildSystemPrompt(naturalText) },
    { name: 'tscg', prompt: buildSystemPrompt(tscgText) },
    { name: 'naive_truncation', prompt: buildSystemPrompt(naiveText) },
  ];

  for (const model of MODELS) {
    console.log(`\n  ====== Model: ${model.name} (${model.ollama}) ======`);

    for (const cond of conditions) {
      console.log(`\n  --- ${model.name} / ${cond.name} ---`);
      const results = await runCondition(model, cond.name, tasks, cond.prompt, evaluator);
      allResults.push(...results);
    }
  }

  // ============================================================
  // Results
  // ============================================================

  console.log('\n' + '='.repeat(80));
  console.log('  RESULTS — SMALL MODELS (20 TOOLS)');
  console.log('='.repeat(80));

  // Per-model aggregates
  interface Agg { model: string; condition: string; accuracy: number; tool_sel: number; param_f1: number; n: number; }
  const aggregates: Agg[] = [];

  for (const model of MODELS) {
    for (const cond of conditions) {
      const results = allResults.filter(r => r.model === model.name && r.condition === cond.name);
      if (results.length === 0) continue;
      const n = results.length;
      aggregates.push({
        model: model.name, condition: cond.name,
        accuracy: results.reduce((s, r) => s + r.overall, 0) / n,
        tool_sel: results.reduce((s, r) => s + r.tool_selection_accuracy, 0) / n,
        param_f1: results.reduce((s, r) => s + r.parameter_f1, 0) / n,
        n,
      });
    }
  }

  console.log('\n  Model        | Condition          | Accuracy | Tool Sel | Param F1');
  console.log('  -------------|--------------------|---------:|--------:|--------:');
  for (const agg of aggregates) {
    console.log(
      `  ${agg.model.padEnd(12)} | ${agg.condition.padEnd(18)} | ${(agg.accuracy * 100).toFixed(1).padStart(6)}% | ` +
      `${(agg.tool_sel * 100).toFixed(1).padStart(5)}% | ${(agg.param_f1 * 100).toFixed(1).padStart(5)}%`
    );
  }

  // Key insight per model
  for (const model of MODELS) {
    const tscgAcc = aggregates.find(a => a.model === model.name && a.condition === 'tscg')?.accuracy ?? 0;
    const naiveAcc = aggregates.find(a => a.model === model.name && a.condition === 'naive_truncation')?.accuracy ?? 0;
    const natAcc = aggregates.find(a => a.model === model.name && a.condition === 'natural_text')?.accuracy ?? 0;
    const diff = (tscgAcc - naiveAcc) * 100;
    console.log(`\n  ${model.name}: TSCG ${(tscgAcc * 100).toFixed(1)}% vs Naive ${(naiveAcc * 100).toFixed(1)}% (${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp) | Natural: ${(natAcc * 100).toFixed(1)}%`);
  }

  // Save
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputData = {
    meta: {
      script: 'run3-smallmodel-tscg-vs-naive.ts',
      models: MODELS.map(m => m.name),
      catalog_size: CATALOG_SIZE, tasks_count: tasks.length, seed: SEED,
      conditions: conditions.map(c => c.name),
      timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime,
    },
    schema_conditions: {
      natural_text: { tokens: naturalTokens, savings_pct: 0 },
      tscg: { tokens: tscgTokens, savings_pct: parseFloat(tscgSavings) },
      naive_truncation: { tokens: naiveTokens, savings_pct: parseFloat(naiveSavings) },
    },
    aggregates, results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'run3-smallmodel-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`  Total calls: ${allResults.length}`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
