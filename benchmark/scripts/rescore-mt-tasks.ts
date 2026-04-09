#!/usr/bin/env node
/**
 * mt-Task Re-Scoring Script
 *
 * Re-parses and re-scores multi-tool (mt-*) checkpoint entries using
 * the fixed balanced-brace parser. No new API calls needed — uses
 * the cached raw_output from existing checkpoint files.
 *
 * Steps:
 * 1. Regenerate task ground truth (deterministic seed=42)
 * 2. Load checkpoint entries for mt-tasks
 * 3. Re-parse raw_output with balanced-brace extraction
 * 4. Re-score against ground truth using TABEvaluator
 * 5. Update checkpoint files in-place
 *
 * Usage:
 *   npx tsx benchmark/scripts/rescore-mt-tasks.ts
 *   npx tsx benchmark/scripts/rescore-mt-tasks.ts --target frontier
 *   npx tsx benchmark/scripts/rescore-mt-tasks.ts --target small-models
 *   npx tsx benchmark/scripts/rescore-mt-tasks.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  collectClaudeCodeTools,
  collectMCPTools,
  generateAllSyntheticCatalogs,
} from '../schemas/collectors/index.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';
import type { BenchmarkTask as TaskGenTask } from '../tasks/types.js';
import { TABEvaluator } from '../harness/evaluator.js';
import type { ParsedResponse, GroundTruth, Scores, TaskResult } from '../harness/types.js';

// ============================================================
// CLI
// ============================================================

const { values } = parseArgs({
  options: {
    target: { type: 'string', short: 't', default: 'all' },
    'dry-run': { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
  strict: false,
});

const target = (values.target as string) ?? 'all';
const dryRun = (values['dry-run'] as boolean) ?? false;
const verbose = (values.verbose as boolean) ?? false;

// ============================================================
// Balanced-brace parser (same as runner.ts fix)
// ============================================================

function parseResponseFixed(content: string): ParsedResponse {
  // 1. Try JSON array format: [{"name": ..., "arguments": ...}, ...]
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
  } catch {
    // Not a valid array — fall through
  }

  // 2. Balanced-brace extraction: find ALL top-level { ... } blocks
  const extractedCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
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
            extractedCalls.push({
              name: obj.name as string,
              arguments: (obj.arguments as Record<string, unknown>) ?? {},
            });
          }
        } catch {
          // Not valid JSON — skip
        }
        start = -1;
      }
    }
  }

  if (extractedCalls.length > 1) {
    return { raw_output: content, parsed_sequence: extractedCalls, parse_success: true };
  }
  if (extractedCalls.length === 1) {
    return { raw_output: content, parsed_tool_call: extractedCalls[0], parse_success: true };
  }

  // No tool calls found
  return { raw_output: content, parse_success: true };
}

// ============================================================
// Ground Truth Map Builder
// ============================================================

function buildGroundTruthMap(): Map<string, GroundTruth> {
  const gtMap = new Map<string, GroundTruth>();

  // Collect all tasks from all scenarios (A, B, C)
  // Scenario A: Claude Code
  const ccCollection = collectClaudeCodeTools();
  const ccTasks = generateTasksForCollection(ccCollection);
  for (const t of ccTasks) {
    if (t.task_id.includes('-mt-')) {
      gtMap.set(t.task_id, buildGT(t));
    }
  }

  // Scenario B: MCP Servers
  try {
    const mcpCollections = collectMCPTools();
    for (const col of mcpCollections) {
      const tasks = generateTasksForCollection(col);
      for (const t of tasks) {
        if (t.task_id.includes('-mt-')) {
          gtMap.set(t.task_id, buildGT(t));
        }
      }
    }
  } catch (e) {
    console.warn('  [WARN] Could not load MCP tools for ground truth:', (e as Error).message);
  }

  // Scenario C: Synthetic
  try {
    const synCatalogs = generateAllSyntheticCatalogs(42);
    for (const col of synCatalogs) {
      const tasks = generateTasksForCollection(col);
      for (const t of tasks) {
        if (t.task_id.includes('-mt-')) {
          gtMap.set(t.task_id, buildGT(t));
        }
      }
    }
  } catch (e) {
    console.warn('  [WARN] Could not load synthetic catalogs for ground truth:', (e as Error).message);
  }

  // Scenario D: Same synthetic catalogs (different scenario label, same tasks)
  // Task IDs use 'tab-D-mt-*' prefix
  try {
    const synCatalogs = generateAllSyntheticCatalogs(42);
    for (const col of synCatalogs) {
      const tasks = generateTasksForCollection({ ...col, scenario: 'D' as any });
      for (const t of tasks) {
        if (t.task_id.includes('-mt-')) {
          gtMap.set(t.task_id, buildGT(t));
        }
      }
    }
  } catch (e) {
    console.warn('  [WARN] Could not load Scenario D ground truth:', (e as Error).message);
  }

  return gtMap;
}

function buildGT(task: TaskGenTask): GroundTruth {
  return {
    type: 'multi_tool',
    tool_name: task.ground_truth.tool_name,
    parameters: task.ground_truth.parameters,
    // Map task generator's `tool_name` to harness's `name` (see adaptTask in types.ts)
    sequence: task.ground_truth.sequence?.map(s => ({
      name: s.tool_name,
      parameters: s.parameters,
    })),
  };
}

// ============================================================
// Checkpoint File Discovery
// ============================================================

const RESULTS_BASE = resolve('benchmark/results');

function findCheckpointFiles(dir: string, results: string[]): void {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          findCheckpointFiles(fullPath, results);
        } else if (entry === 'checkpoint.json') {
          results.push(fullPath);
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
}

function findCheckpoints(): string[] {
  const checkpoints: string[] = [];
  const dirs = target === 'all'
    ? ['frontier', 'small-models']
    : [target];

  for (const dir of dirs) {
    const base = resolve(RESULTS_BASE, dir);
    if (!existsSync(base)) continue;
    findCheckpointFiles(base, checkpoints);
  }
  return checkpoints;
}

// ============================================================
// Main
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('  mt-Task Re-Scoring (No API Calls)');
console.log('  Target: ' + target);
console.log('  Mode: ' + (dryRun ? 'DRY RUN' : 'LIVE'));
console.log('='.repeat(60));

// Step 1: Build ground truth
console.log('\n  [1/3] Building ground truth map...');
const gtMap = buildGroundTruthMap();
console.log(`         ${gtMap.size} mt-task ground truths loaded`);

if (verbose) {
  for (const [id, gt] of gtMap) {
    console.log(`         ${id}: ${gt.sequence?.length ?? 0} tools in sequence`);
  }
}

// Step 2: Find and process checkpoints
console.log('  [2/3] Finding checkpoint files...');
const checkpoints = findCheckpoints();
console.log(`         ${checkpoints.length} checkpoint files found`);

// Step 3: Re-score
console.log('  [3/3] Re-scoring mt-tasks...\n');

const evaluator = new TABEvaluator();

let totalRescored = 0;
let totalImproved = 0;
let totalUnchanged = 0;
let totalNoGT = 0;

for (const cpPath of checkpoints) {
  const relPath = relative(RESULTS_BASE, cpPath);
  const raw = readFileSync(cpPath, 'utf-8');
  const entries = JSON.parse(raw) as TaskResult[];

  let modified = false;
  let fileRescored = 0;
  let fileImproved = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.task_id.includes('-mt-')) continue;

    // Find ground truth
    const gt = gtMap.get(entry.task_id);
    if (!gt) {
      totalNoGT++;
      if (verbose) console.log(`    [SKIP] ${entry.task_id} — no ground truth found`);
      continue;
    }

    // Re-parse with fixed parser
    const rawOutput = entry.response?.raw_output ?? '';
    if (!rawOutput || rawOutput.startsWith('ERROR:')) continue;

    const newParsed = parseResponseFixed(rawOutput);
    const oldScores = entry.scores;
    const newScores = evaluator.score(newParsed, gt);

    fileRescored++;
    totalRescored++;

    if (newScores.overall !== oldScores.overall) {
      fileImproved++;
      totalImproved++;
      if (verbose || newScores.overall > 0) {
        console.log(
          `    [FIX] ${relPath} | ${entry.task_id} | ${entry.model} | ${entry.condition} | run ${entry.run}` +
          ` — overall: ${oldScores.overall.toFixed(2)} → ${newScores.overall.toFixed(2)}` +
          ` (tools found: ${newParsed.parsed_sequence?.length ?? (newParsed.parsed_tool_call ? 1 : 0)})`
        );
      }

      // Update the entry
      entries[i] = {
        ...entry,
        response: newParsed,
        scores: newScores,
      };
      modified = true;
    } else {
      totalUnchanged++;
    }
  }

  if (modified && !dryRun) {
    writeFileSync(cpPath, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`  [SAVE] ${relPath}: ${fileRescored} re-scored, ${fileImproved} improved`);
  } else if (fileRescored > 0) {
    console.log(`  [${dryRun ? 'DRY' : 'SKIP'}] ${relPath}: ${fileRescored} re-scored, ${fileImproved} improved`);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('  Re-Scoring Summary');
console.log('='.repeat(60));
console.log(`  Checkpoint files: ${checkpoints.length}`);
console.log(`  mt-tasks re-scored: ${totalRescored}`);
console.log(`  Scores improved: ${totalImproved}`);
console.log(`  Scores unchanged: ${totalUnchanged}`);
console.log(`  Missing ground truth: ${totalNoGT}`);
console.log(`  ${dryRun ? '(DRY RUN — no files modified)' : 'Checkpoint files updated on disk'}`);
console.log('='.repeat(60) + '\n');
