#!/usr/bin/env node
/**
 * Smoke test: Verify native tool calling works for the `natural` condition.
 *
 * Runs a single task (ts-001) against GPT-4o for each condition:
 * - natural: should use native tools → expect tool_calls in response
 * - tscg: text-based → expect JSON in raw_output
 * - tscg_sad: text-based → expect JSON in raw_output
 *
 * This validates the runner fix before running the full benchmark.
 */

import { collectClaudeCodeTools } from '../schemas/collectors/index.js';
import { compressCollection } from '../compression/pipeline.js';
import { BenchmarkRunner } from '../harness/runner.js';
import { adaptTask } from '../harness/types.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { Condition, RunConfig } from '../harness/types.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

async function main() {
  // 1. Collect schemas and generate tasks
  const collection = collectClaudeCodeTools();
  const pipeline = compressCollection(collection);

  const schemas = {
    natural: pipeline.conditions.natural.text,
    tscg: pipeline.conditions.tscg.text,
    tscg_sad: pipeline.conditions.tscg_sad.text,
  };

  // 2. Generate tasks and pick just ts-001 (single tool selection)
  const rawTasks = generateTasksForCollection(collection);
  const allTasks = rawTasks.map(adaptTask);
  const tsTask = allTasks.find(t => t.task_id.includes('-ts-001'));
  const ntTask = allTasks.find(t => t.task_id.includes('-nt-001'));

  if (!tsTask || !ntTask) {
    console.error('Could not find test tasks');
    process.exit(1);
  }

  console.log('=== Smoke Test: Native Tool Calling Fix ===\n');
  console.log(`Tool task: ${tsTask.task_id}`);
  console.log(`  query: ${tsTask.user_message}`);
  console.log(`  expected: ${tsTask.ground_truth.tool_name}`);
  console.log(`No-tool task: ${ntTask.task_id}`);
  console.log(`  query: ${ntTask.user_message}\n`);

  // Verify natural schema is parseable as tool definitions
  try {
    const tools = JSON.parse(schemas.natural);
    console.log(`Natural schema: ${tools.length} tools parsed as JSON ✓`);
    console.log(`  First tool: ${tools[0]?.function?.name ?? '(unknown)'}\n`);
  } catch (e) {
    console.error('FAIL: Natural schema is not parseable JSON!');
    process.exit(1);
  }

  // 3. Run each condition with GPT-4o
  const conditions: Condition[] = ['natural', 'tscg', 'tscg_sad'];

  for (const condition of conditions) {
    console.log(`\n--- Condition: ${condition} ---`);

    const config: RunConfig = {
      scenario: 'A',
      models: [{
        name: 'GPT-4o',
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        apiKey: OPENAI_KEY,
      }],
      conditions: [condition],
      runsPerCondition: 1,
      outputDir: 'D:/0_TSCG/benchmark/results/smoke-native',
      checkpoint: 'D:/0_TSCG/benchmark/results/smoke-native/smoke-checkpoint.json',
      maxConcurrent: 1,
      retryAttempts: 1,
      retryDelayMs: 2000,
    };

    const runner = new BenchmarkRunner(config);
    const report = await runner.run([tsTask, ntTask], schemas);

    for (const result of report.results) {
      const tc = result.response.parsed_tool_call;
      const seq = result.response.parsed_sequence;
      const raw = result.response.raw_output?.substring(0, 200);

      console.log(`  ${result.task_id}:`);
      console.log(`    overall: ${result.scores.overall.toFixed(3)}`);
      console.log(`    tool_selection: ${result.scores.tool_selection_accuracy.toFixed(3)}`);
      console.log(`    param_f1: ${result.scores.parameter_f1.toFixed(3)}`);
      if (tc) {
        console.log(`    parsed_tool: ${tc.name}(${JSON.stringify(tc.arguments)})`);
      } else if (seq) {
        console.log(`    parsed_sequence: ${seq.map(s => s.name).join(' -> ')}`);
      } else {
        console.log(`    no tool call parsed`);
      }
      console.log(`    raw: ${raw}`);
    }
  }

  console.log('\n=== Smoke Test Complete ===');
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
