#!/usr/bin/env node
/**
 * N3: Qwen3-14B Conservative SDM Ablation
 *
 * Tests whether Qwen3-14B's systematic degradation under balanced TSCG
 * is eliminated with Conservative mode (SDM only, no structural changes).
 *
 * Model: Qwen3-14B (qwen3:14b via Ollama)
 * Sizes: 10, 20, 50
 * Conditions: natural (JSON), tscg_balanced, tscg_conservative
 * Tasks: 20 per condition × 3 sizes × 3 conditions = 180 calls
 *
 * Expected: Conservative neutral/positive (per Wave 2.14 pattern with Mistral/Gemma)
 *
 * Usage:
 *   npx tsx benchmark/scripts/run-n3-qwen3-14b-conservative.ts
 *   npx tsx benchmark/scripts/run-n3-qwen3-14b-conservative.ts --dry-run
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
import { renderNaturalSchemaJSON } from '../compression/natural-renderer.js';
import { countTokens } from '../compression/token-counter.js';
import { TABEvaluator } from '../harness/evaluator.js';
import { adaptTask } from '../harness/types.js';
import type { ParsedResponse } from '../harness/types.js';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const TEMPERATURE = 0;
const MAX_TOKENS = 1024;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const INTER_CALL_DELAY_MS = 100;

const OUTPUT_DIR = resolve('benchmark/results/n3-qwen3-14b-conservative');
const SEED = 42;
const CATALOG_SIZES = [10, 20, 50];
const MODEL = { name: 'qwen3-14b', ollama: 'qwen3:14b' };

type ConditionConfig = { name: string; getSchema: (tools: ToolDefinition[]) => string };

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

async function runCondition(conditionName: string, catalogSize: number, tasks: ReturnType<typeof adaptGeneratedTask>[], systemPrompt: string, evaluator: TABEvaluator): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    process.stdout.write(`  [${i + 1}/${tasks.length}] qwen3-14b ${String(catalogSize).padEnd(4)} ${conditionName.padEnd(20)} | ${task.task_id} ... `);
    let result: TaskResult | null = null;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await callOllama(MODEL.ollama, systemPrompt, task.user_message);
        const parsed = parseTextResponse(response.content);
        const scores = evaluator.score(parsed, task.ground_truth);
        result = {
          task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown',
          model: MODEL.name, condition: conditionName, catalog_size: catalogSize,
          tool_selection_accuracy: scores.tool_selection_accuracy, parameter_f1: scores.parameter_f1, overall: scores.overall,
          raw_output: response.content.slice(0, 500), parsed_tool_name: parsed.parsed_tool_call?.name ?? parsed.parsed_sequence?.[0]?.name ?? null,
          expected_tool_name: task.ground_truth.tool_name ?? null,
          input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
          latency_ms: response.latencyMs, timestamp: new Date().toISOString(),
        };
        break;
      } catch (err) {
        if (attempt < RETRY_ATTEMPTS) { console.log(`\n    Retry: ${err instanceof Error ? err.message : String(err)}`); await sleep(RETRY_DELAY_MS * Math.pow(2, attempt)); }
        else { result = { task_id: task.task_id, category: task.category ?? 'unknown', difficulty: task.difficulty ?? 'unknown', model: MODEL.name, condition: conditionName, catalog_size: catalogSize, tool_selection_accuracy: 0, parameter_f1: 0, overall: 0, raw_output: `ERROR`, parsed_tool_name: null, expected_tool_name: task.ground_truth.tool_name ?? null, input_tokens: 0, output_tokens: 0, latency_ms: 0, timestamp: new Date().toISOString() }; }
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
  console.log('  N3: QWEN3-14B CONSERVATIVE SDM ABLATION');
  console.log('  Model: qwen3:14b');
  console.log('  Catalog sizes: ' + CATALOG_SIZES.join(', '));
  console.log('  Conditions: natural_json, tscg_balanced, tscg_conservative');
  console.log('='.repeat(80));

  try { const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`); if (!resp.ok) throw new Error(); console.log('\n  Ollama: connected'); } catch { console.error('\n  ERROR: Ollama not running.'); process.exit(1); }

  const totalCalls = CATALOG_SIZES.length * 3 * 20;
  if (cli.dryRun) {
    console.log(`\n  [DRY RUN] 1 model × ${CATALOG_SIZES.length} sizes × 3 conditions × 20 tasks = ${totalCalls} calls`);
    console.log(`  Cost: $0 (local)`);
    console.log(`  Estimated time: ~${Math.ceil(totalCalls * 5 / 60)} minutes\n`);
    return;
  }

  const evaluator = new TABEvaluator();
  const allResults: TaskResult[] = [];

  for (const size of CATALOG_SIZES) {
    console.log(`\n  ====== Catalog Size: ${size} tools ======`);
    const collection = generateSyntheticCatalog(size, SEED);
    const tools = collection.tools as ToolDefinition[];
    const genTasks = generateTasksForCollection(collection, SEED);
    const tasks = genTasks.map(adaptGeneratedTask);

    // Natural JSON baseline (same as Wave 2.5)
    const naturalJSON = renderNaturalSchemaJSON(tools);
    const naturalTokens = countTokens(naturalJSON);

    // TSCG balanced
    const tscgBalanced = compress(tools, { profile: 'balanced', model: 'auto', preserveToolNames: true });
    const balancedTokens = countTokens(tscgBalanced.compressed);

    // TSCG conservative (SDM-only, no structural transforms)
    const tscgConservative = compress(tools, { profile: 'conservative', model: 'auto', preserveToolNames: true });
    const conservativeTokens = countTokens(tscgConservative.compressed);

    console.log(`  Natural-JSON: ${naturalTokens} | Balanced: ${balancedTokens} (${((1-balancedTokens/naturalTokens)*100).toFixed(1)}%) | Conservative: ${conservativeTokens} (${((1-conservativeTokens/naturalTokens)*100).toFixed(1)}%)`);

    const conditions: { name: string; prompt: string }[] = [
      { name: 'natural_json', prompt: buildSystemPrompt(naturalJSON) },
      { name: 'tscg_balanced', prompt: buildSystemPrompt(tscgBalanced.compressed) },
      { name: 'tscg_conservative', prompt: buildSystemPrompt(tscgConservative.compressed) },
    ];

    for (const cond of conditions) {
      console.log(`\n  --- qwen3-14b / ${size} tools / ${cond.name} ---`);
      const results = await runCondition(cond.name, size, tasks, cond.prompt, evaluator);
      allResults.push(...results);
    }
  }

  // Results
  console.log('\n' + '='.repeat(80));
  console.log('  N3 RESULTS — QWEN3-14B CONSERVATIVE SDM');
  console.log('='.repeat(80));

  console.log('\n  Tools | Natural-JSON | Balanced | Conservative | Bal-Nat  | Con-Nat');
  console.log('  ------|-------------|----------|-------------|----------|--------');

  for (const size of CATALOG_SIZES) {
    const nat = allResults.filter(r => r.catalog_size === size && r.condition === 'natural_json');
    const bal = allResults.filter(r => r.catalog_size === size && r.condition === 'tscg_balanced');
    const con = allResults.filter(r => r.catalog_size === size && r.condition === 'tscg_conservative');

    const natMean = nat.reduce((s, r) => s + r.overall, 0) / nat.length;
    const balMean = bal.reduce((s, r) => s + r.overall, 0) / bal.length;
    const conMean = con.reduce((s, r) => s + r.overall, 0) / con.length;

    console.log(
      `  ${String(size).padStart(5)} | ${(natMean * 100).toFixed(1).padStart(5)}%      | ` +
      `${(balMean * 100).toFixed(1).padStart(5)}%   | ${(conMean * 100).toFixed(1).padStart(5)}%       | ` +
      `${((balMean - natMean) * 100 > 0 ? '+' : '')}${((balMean - natMean) * 100).toFixed(1).padStart(5)}pp  | ` +
      `${((conMean - natMean) * 100 > 0 ? '+' : '')}${((conMean - natMean) * 100).toFixed(1).padStart(5)}pp`
    );
  }

  // Save
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputData = {
    meta: {
      script: 'run-n3-qwen3-14b-conservative.ts',
      model: MODEL.name,
      catalog_sizes: CATALOG_SIZES,
      conditions: ['natural_json', 'tscg_balanced', 'tscg_conservative'],
      seed: SEED,
      purpose: 'N3: Test if Conservative mode eliminates Qwen3-14B degradation',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    },
    results: allResults,
  };

  const outputPath = join(OUTPUT_DIR, 'n3-qwen3-14b-conservative-results.json');
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${outputPath}`);
  console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Total: ${allResults.length} results`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => { console.error('\nFATAL:', err instanceof Error ? err.message : String(err)); process.exit(1); });
