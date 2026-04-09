#!/usr/bin/env node
/**
 * N1: 30B Model Benchmark
 *
 * Tests 30B-class models to fill the gap between 14B small models and frontier APIs.
 * Shows whether TSCG benefit scales monotonically with model size.
 *
 * Models: Mistral-Small 24B, Qwen2.5-Coder 32B (both already downloaded in Ollama)
 * Sizes: 3, 5, 10, 15, 20, 30, 50
 * Conditions: natural_text, tscg, naive_truncation
 *
 * Total: 2 models × 7 sizes × 3 conditions × 20 tasks = 840 calls
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-n1-30b-models.ts
 *   npx tsx benchmark/scripts/run-n1-30b-models.ts --dry-run
 *   npx tsx benchmark/scripts/run-n1-30b-models.ts --models mistral-small
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

const OUTPUT_DIR = resolve('benchmark/results/n1-30b-models');
const SEED = 42;
const CATALOG_SIZES = [3, 5, 10, 15, 20, 30, 50];
const ALL_MODELS = [
  { name: 'mistral-small-24b', ollama: 'mistral-small:24b' },
  { name: 'qwen2.5-coder-32b', ollama: 'qwen2.5-coder:32b' },
];
const CONDITIONS = ['natural_text', 'tscg', 'naive_truncation'] as const;

function parseCLI() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'models': { type: 'string', default: '' },
    },
    strict: false,
  });
  const modelFilter = (values['models'] as string || '').split(',').filter(Boolean);
  return { dryRun: (values['dry-run'] as boolean) ?? false, modelFilter };
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

async function runCondition(modelConfig: typeof ALL_MODELS[0], conditionName: string, catalogSize: number, tasks: ReturnType<typeof adaptGeneratedTask>[], systemPrompt: string, evaluator: TABEvaluator): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] ${modelConfig.name.padEnd(22)} ${String(catalogSize).padEnd(4)} ${conditionName.padEnd(18)} | ${task.task_id} ... `);
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

  const models = cli.modelFilter.length > 0
    ? ALL_MODELS.filter(m => cli.modelFilter.some(f => m.name.includes(f)))
    : ALL_MODELS;

  console.log('\n' + '='.repeat(80));
  console.log('  N1: 30B MODEL BENCHMARK — Filling the 14B→Frontier Gap');
  console.log('  Models: ' + models.map(m => `${m.name} (${m.ollama})`).join(', '));
  console.log('  Catalog sizes: ' + CATALOG_SIZES.join(', '));
  console.log('  Conditions: ' + CONDITIONS.join(', '));
  console.log('  Baseline: renderNaturalSchema() (human-readable text, NOT JSON)');
  console.log('='.repeat(80));

  try { const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`); if (!resp.ok) throw new Error(); console.log('\n  Ollama: connected'); } catch { console.error('\n  ERROR: Ollama not running.'); process.exit(1); }

  const totalCalls = models.length * CATALOG_SIZES.length * CONDITIONS.length * 20;
  if (cli.dryRun) {
    console.log(`\n  [DRY RUN] ${models.length} models x ${CATALOG_SIZES.length} sizes x ${CONDITIONS.length} conditions x 20 tasks = ${totalCalls} calls`);
    console.log(`  Cost: $0 (local)`);
    console.log(`  Estimated time: ~${Math.ceil(totalCalls * 15 / 60)} minutes (30B models are slower)\n`);
    return;
  }

  // Load checkpoint if exists
  const checkpointPath = join(OUTPUT_DIR, 'checkpoint.json');
  let allResults: TaskResult[] = [];
  const completedKeys = new Set<string>();

  if (existsSync(checkpointPath)) {
    const cp = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
    allResults = cp.results || [];
    for (const r of allResults) {
      completedKeys.add(`${r.model}|${r.catalog_size}|${r.condition}`);
    }
    console.log(`\n  Loaded checkpoint: ${allResults.length} results, ${completedKeys.size} conditions done`);
  }

  const evaluator = new TABEvaluator();

  for (const model of models) {
    console.log(`\n  ===== Model: ${model.name} (${model.ollama}) =====`);

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

      console.log(`  Text: ${naturalTokens} | TSCG: ${tscgTokens} (${((1-tscgTokens/naturalTokens)*100).toFixed(1)}%) | Naive: ${naiveTokens} (${((1-naiveTokens/naturalTokens)*100).toFixed(1)}%)`);

      const prompts: Record<string, string> = {
        natural_text: buildSystemPrompt(naturalText),
        tscg: buildSystemPrompt(tscgText),
        naive_truncation: buildSystemPrompt(naiveText),
      };

      for (const cond of CONDITIONS) {
        const key = `${model.name}|${size}|${cond}`;
        if (completedKeys.has(key)) {
          console.log(`  --- SKIP (checkpoint): ${model.name} / ${size} / ${cond} ---`);
          continue;
        }

        console.log(`\n  --- ${model.name} / ${size} tools / ${cond} ---`);
        const results = await runCondition(model, cond, size, tasks, prompts[cond], evaluator);
        allResults.push(...results);
        completedKeys.add(key);

        // Save checkpoint after each condition (ensure dir exists)
        mkdirSync(OUTPUT_DIR, { recursive: true });
        writeFileSync(checkpointPath, JSON.stringify({ results: allResults, timestamp: new Date().toISOString() }), 'utf-8');
      }
    }
  }

  // Results Summary
  console.log('\n' + '='.repeat(80));
  console.log('  N1 RESULTS — 30B MODELS');
  console.log('='.repeat(80));

  console.log('\n  Model                 | Tools | Natural-Text | TSCG     | Naive    | Best');
  console.log('  ----------------------|-------|-------------|----------|----------|------');

  for (const model of models) {
    for (const size of CATALOG_SIZES) {
      const natAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'natural_text');
      const tscgAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'tscg');
      const naiveAcc = allResults.filter(r => r.model === model.name && r.catalog_size === size && r.condition === 'naive_truncation');

      if (natAcc.length === 0) continue;

      const natMean = natAcc.reduce((s, r) => s + r.overall, 0) / natAcc.length;
      const tscgMean = tscgAcc.length > 0 ? tscgAcc.reduce((s, r) => s + r.overall, 0) / tscgAcc.length : 0;
      const naiveMean = naiveAcc.length > 0 ? naiveAcc.reduce((s, r) => s + r.overall, 0) / naiveAcc.length : 0;
      const best = tscgMean >= natMean && tscgMean >= naiveMean ? 'TSCG' : naiveMean >= natMean ? 'NAIVE' : 'NAT';

      console.log(
        `  ${model.name.padEnd(22)} | ${String(size).padStart(5)} | ${(natMean * 100).toFixed(1).padStart(5)}%      | ` +
        `${(tscgMean * 100).toFixed(1).padStart(5)}%   | ${(naiveMean * 100).toFixed(1).padStart(5)}%   | ${best}`
      );
    }
  }

  // Save final results
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const aggregates: Array<{ model: string; catalog_size: number; condition: string; accuracy: number; tool_sel: number; n: number }> = [];
  for (const model of models) {
    for (const size of CATALOG_SIZES) {
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
      script: 'run-n1-30b-models.ts',
      models: models.map(m => m.name),
      catalog_sizes: CATALOG_SIZES,
      conditions: [...CONDITIONS],
      seed: SEED,
      baseline_format: 'renderNaturalSchema (human-readable text, NOT JSON)',
      purpose: 'N1: 30B models — fill the 14B→Frontier gap, test size-scaling trend',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    },
    aggregates,
    results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'n1-30b-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Total: ${allResults.length} results`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => { console.error('\nFATAL:', err instanceof Error ? err.message : String(err)); process.exit(1); });
