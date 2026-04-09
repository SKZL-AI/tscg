#!/usr/bin/env node
/**
 * Run 3b: Small Model Scaling — TSCG vs Naive at 20/50/100 Tools
 *
 * Validates Wave 2.5 findings by testing at multiple tool scales.
 * Shows TSCG's enablement effect grows with tool count.
 *
 * Models: Gemma 3 4B, Mistral 7B
 * Tools: 20, 50, 100 synthetic tools
 * Conditions: Natural-Text, TSCG, Naive-Truncation
 *
 * Usage:
 *   npx tsx benchmark/scripts/run3b-smallmodel-scaling.ts
 *   npx tsx benchmark/scripts/run3b-smallmodel-scaling.ts --dry-run
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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

const OLLAMA_BASE_URL = 'http://localhost:11434';
const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const INTER_CALL_DELAY_MS = 100;

const OUTPUT_DIR = resolve('benchmark/results/run3b-smallmodel-scaling');
const SEED = 42;
const CATALOG_SIZES = [50, 100]; // 20 already done in Run 3
const MODELS = [
  { name: 'gemma3-4b', ollama: 'gemma3:4b' },
  { name: 'mistral-7b', ollama: 'mistral:7b-instruct-v0.3-q4_K_M' },
];
const CONDITIONS = ['natural_text', 'tscg', 'naive_truncation'] as const;

function parseCLI() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } }, strict: false });
  return { dryRun: (values['dry-run'] as boolean) ?? false };
}

interface OllamaResponse { message: { role: string; content: string }; eval_count?: number; prompt_eval_count?: number; }

async function callOllama(model: string, system: string, userMessage: string): Promise<{
  content: string; usage: { input_tokens: number; output_tokens: number }; latencyMs: number;
}> {
  const t0 = Date.now();
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
      stream: false, options: { temperature: TEMPERATURE, num_predict: MAX_TOKENS },
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!response.ok) throw new Error(`Ollama error (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as OllamaResponse;
  return { content: data.message.content, usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0 }, latencyMs };
}

function parseTextResponse(content: string): ParsedResponse {
  try {
    const arrayMatch = content.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].name === 'string') {
        if (parsed.length === 1) return { raw_output: content, parsed_tool_call: { name: parsed[0].name as string, arguments: (parsed[0].arguments as Record<string, unknown>) ?? {} }, parse_success: true };
        return { raw_output: content, parsed_sequence: parsed.map(p => ({ name: p.name as string, arguments: (p.arguments as Record<string, unknown>) ?? {} })), parse_success: true };
      }
    }
  } catch {}
  const extracted: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (content[i] === '}') { depth--; if (depth === 0 && start >= 0) { try { const obj = JSON.parse(content.slice(start, i + 1)) as Record<string, unknown>; if (typeof obj.name === 'string') extracted.push({ name: obj.name as string, arguments: (obj.arguments as Record<string, unknown>) ?? {} }); } catch {} start = -1; } }
  }
  if (extracted.length > 1) return { raw_output: content, parsed_sequence: extracted, parse_success: true };
  if (extracted.length === 1) return { raw_output: content, parsed_tool_call: extracted[0], parse_success: true };
  return { raw_output: content, parse_success: true };
}

function adaptGeneratedTask(task: TaskGenTask) {
  return adaptTask({
    task_id: task.task_id, scenario: task.scenario, query: task.query, category: task.category, difficulty: task.difficulty,
    ground_truth: { tool_name: task.ground_truth.tool_name, parameters: task.ground_truth.parameters, sequence: task.ground_truth.sequence?.map(s => ({ tool_name: s.tool_name, parameters: s.parameters })), action: task.ground_truth.action, answer: task.ground_truth.answer },
  });
}

function buildSystemPrompt(schemaText: string): string {
  return ['You are a helpful assistant with access to the following tools.', 'When the user request requires a tool, respond with ONLY a JSON tool call object.', 'Use this exact format: {"name": "tool_name", "arguments": {"param": "value"}}', 'For multiple sequential tools, output each JSON object on its own line.', 'If no tool is needed, respond normally in plain text.', 'IMPORTANT: Output the JSON directly. Do not wrap it in markdown, do not explain.', '', 'Available tools:', schemaText].join('\n');
}

interface TaskResult {
  task_id: string; category: string; difficulty: string; model: string; condition: string; catalog_size: number;
  tool_selection_accuracy: number; parameter_f1: number; overall: number;
  raw_output: string; parsed_tool_name: string | null; expected_tool_name: string | null;
  input_tokens: number; output_tokens: number; latency_ms: number; timestamp: string;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function runCondition(modelConfig: { name: string; ollama: string }, conditionName: string, catalogSize: number, tasks: ReturnType<typeof adaptGeneratedTask>[], systemPrompt: string, evaluator: TABEvaluator): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] ${modelConfig.name.padEnd(12)} ${String(catalogSize).padEnd(4)} ${conditionName.padEnd(18)} | ${task.task_id} ... `);
    let result: TaskResult | null = null;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await callOllama(modelConfig.ollama, systemPrompt, task.user_message);
        const parsed = parseTextResponse(response.content);
        const scores = evaluator.score(parsed, task.ground_truth);
        result = {
          task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
          model: modelConfig.name, condition: conditionName, catalog_size: catalogSize,
          tool_selection_accuracy: scores.tool_selection_accuracy, parameter_f1: scores.parameter_f1, overall: scores.overall,
          raw_output: response.content.slice(0, 500), parsed_tool_name: parsed.parsed_tool_call?.name ?? parsed.parsed_sequence?.[0]?.name ?? null,
          expected_tool_name: task.ground_truth.tool_name ?? null,
          input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          latency_ms: response.latencyMs, timestamp: new Date().toISOString(),
        };
        break;
      } catch (err) {
        if (attempt < RETRY_ATTEMPTS) { console.log(`\n    Retry: ${err instanceof Error ? err.message : String(err)}`); await sleep(RETRY_DELAY_MS * Math.pow(2, attempt)); }
        else { result = { task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown', model: modelConfig.name, condition: conditionName, catalog_size: catalogSize, tool_selection_accuracy: 0, parameter_f1: 0, overall: 0, raw_output: `ERROR`, parsed_tool_name: null, expected_tool_name: task.ground_truth.tool_name ?? null, input_tokens: 0, output_tokens: 0, latency_ms: 0, timestamp: new Date().toISOString() }; }
      }
    }
    if (result) { results.push(result); console.log(`${result.overall >= 0.5 ? '+' : '-'} ${result.overall.toFixed(2)} (${result.parsed_tool_name ?? 'none'}) ${result.latency_ms}ms`); }
    await sleep(INTER_CALL_DELAY_MS);
  }
  return results;
}

async function main(): Promise<void> {
  const cli = parseCLI();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(80));
  console.log('  RUN 3b: SMALL MODEL SCALING — 50 + 100 Tools');
  console.log('  Models: ' + MODELS.map(m => m.name).join(', '));
  console.log('  Catalog sizes: ' + CATALOG_SIZES.join(', '));
  console.log('  Conditions: ' + CONDITIONS.join(', '));
  console.log('='.repeat(80));

  try { const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`); if (!resp.ok) throw new Error(); console.log('\n  Ollama: connected'); } catch { console.error('\n  ERROR: Ollama not running.'); process.exit(1); }

  const totalCalls = MODELS.length * CATALOG_SIZES.length * CONDITIONS.length * 20;
  if (cli.dryRun) {
    console.log(`\n  [DRY RUN] ${MODELS.length} models × ${CATALOG_SIZES.length} sizes × ${CONDITIONS.length} conditions × 20 tasks = ${totalCalls} calls`);
    console.log(`  Cost: $0 (local)`);
    console.log(`  Estimated time: ~${Math.ceil(totalCalls * 5 / 60)} minutes\n`);
    return;
  }

  const evaluator = new TABEvaluator();
  const allResults: TaskResult[] = [];

  // Load Run 3 (20-tool) results if they exist
  const run3Path = resolve('benchmark/results/run3-smallmodel/run3-smallmodel-results.json');
  if (existsSync(run3Path)) {
    console.log('\n  Loading existing 20-tool results from Run 3...');
    const run3Data = JSON.parse(readFileSync(run3Path, 'utf-8'));
    for (const r of run3Data.results) {
      allResults.push({ ...r, catalog_size: 20 });
    }
    console.log(`  Loaded ${run3Data.results.length} results (20 tools)`);
  }

  for (const size of CATALOG_SIZES) {
    console.log(`\n  ====== Catalog Size: ${size} tools ======`);
    const collection = generateSyntheticCatalog(size, SEED);
    const tools = collection.tools as ToolDefinition[];
    const genTasks = generateTasksForCollection(collection, SEED);
    const tasks = genTasks.map(adaptGeneratedTask);

    const naturalText = renderNaturalSchema(tools);
    const naturalTokens = countTokens(naturalText);
    const tscgResult = compress(tools, { profile: 'balanced', model: 'auto', preserveToolNames: true });
    const tscgText = tscgResult.compressed;
    const tscgTokens = countTokens(tscgText);
    const toolsForNaive = tools.map(t => ({ name: t.function.name, description: t.function.description, parameters: { type: t.function.parameters.type, required: t.function.parameters.required, properties: Object.fromEntries(Object.entries(t.function.parameters.properties).map(([k, v]) => [k, { type: v.type, description: v.description }])) } }));
    const naiveText = naiveTruncate(toolsForNaive);
    const naiveTokens = countTokens(naiveText);

    console.log(`  Natural: ${naturalTokens} tokens | TSCG: ${tscgTokens} (${((1-tscgTokens/naturalTokens)*100).toFixed(1)}%) | Naive: ${naiveTokens} (${((1-naiveTokens/naturalTokens)*100).toFixed(1)}%)`);

    const prompts: Record<string, string> = {
      natural_text: buildSystemPrompt(naturalText),
      tscg: buildSystemPrompt(tscgText),
      naive_truncation: buildSystemPrompt(naiveText),
    };

    for (const model of MODELS) {
      for (const cond of CONDITIONS) {
        console.log(`\n  --- ${model.name} / ${size} tools / ${cond} ---`);
        const results = await runCondition(model, cond, size, tasks, prompts[cond], evaluator);
        allResults.push(...results);
      }
    }
  }

  // ============================================================
  // Results Summary
  // ============================================================

  console.log('\n' + '='.repeat(80));
  console.log('  SCALING RESULTS — ALL SIZES');
  console.log('='.repeat(80));

  // Group by model × size × condition
  const sizes = [20, ...CATALOG_SIZES];
  console.log('\n  Model        | Tools | Natural  | TSCG     | Naive    | TSCG-Naive');
  console.log('  -------------|-------|----------|----------|----------|----------');

  for (const model of MODELS) {
    for (const size of sizes) {
      const natAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'natural_text');
      const tscgAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'tscg');
      const naiveAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'naive_truncation');

      if (natAcc.length === 0 && tscgAcc.length === 0 && naiveAcc.length === 0) continue;

      const natMean = natAcc.length > 0 ? natAcc.reduce((s, r) => s + r.overall, 0) / natAcc.length : 0;
      const tscgMean = tscgAcc.length > 0 ? tscgAcc.reduce((s, r) => s + r.overall, 0) / tscgAcc.length : 0;
      const naiveMean = naiveAcc.length > 0 ? naiveAcc.reduce((s, r) => s + r.overall, 0) / naiveAcc.length : 0;
      const diff = (tscgMean - naiveMean) * 100;

      console.log(
        `  ${model.name.padEnd(12)} | ${String(size).padStart(5)} | ${(natMean * 100).toFixed(1).padStart(5)}%   | ` +
        `${(tscgMean * 100).toFixed(1).padStart(5)}%   | ${(naiveMean * 100).toFixed(1).padStart(5)}%   | ${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`
      );
    }
  }

  // Save
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const aggregates: Array<{ model: string; catalog_size: number; condition: string; accuracy: number; tool_sel: number; n: number }> = [];
  for (const model of MODELS) {
    for (const size of sizes) {
      for (const cond of CONDITIONS) {
        const results = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === cond);
        if (results.length === 0) continue;
        const n = results.length;
        aggregates.push({
          model: model.name, catalog_size: size, condition: cond,
          accuracy: results.reduce((s, r) => s + r.overall, 0) / n,
          tool_sel: results.reduce((s, r) => s + r.tool_selection_accuracy, 0) / n,
          n,
        });
      }
    }
  }

  const outputData = {
    meta: {
      script: 'run3b-smallmodel-scaling.ts', models: MODELS.map(m => m.name),
      catalog_sizes: sizes, conditions: [...CONDITIONS], seed: SEED,
      timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime,
      includes_run3_20tool_data: existsSync(run3Path),
    },
    aggregates, results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'run3b-scaling-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Total: ${allResults.length} results`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => { console.error('\nFATAL:', err instanceof Error ? err.message : String(err)); process.exit(1); });
