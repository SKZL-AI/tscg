#!/usr/bin/env node
/**
 * mt-Task Re-Run Script
 *
 * Strips multi-tool (mt-*) task entries from checkpoint files so that
 * the benchmark runners will re-execute them with the fixed parser.
 *
 * The balanced-brace parser fix (applied to runner.ts) correctly extracts
 * multiple JSON objects from narrative text. The old greedy regex only
 * found the first object, causing all mt-tasks to score 0.00.
 *
 * Usage:
 *   npx tsx benchmark/scripts/rerun-mt-tasks.ts --target frontier
 *   npx tsx benchmark/scripts/rerun-mt-tasks.ts --target small-models
 *   npx tsx benchmark/scripts/rerun-mt-tasks.ts --target all
 *   npx tsx benchmark/scripts/rerun-mt-tasks.ts --target all --dry-run
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { parseArgs } from 'node:util';

// ============================================================
// CLI
// ============================================================

const { values } = parseArgs({
  options: {
    target: { type: 'string', short: 't', default: 'all' },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: false,
});

const target = (values.target as string) ?? 'all';
const dryRun = (values['dry-run'] as boolean) ?? false;

// ============================================================
// Find checkpoint files
// ============================================================

const RESULTS_BASE = resolve('benchmark/results');

function findCheckpoints(targetDir: string): string[] {
  const checkpoints: string[] = [];
  const dirs = target === 'all'
    ? ['frontier', 'small-models']
    : [targetDir];

  for (const dir of dirs) {
    const base = resolve(RESULTS_BASE, dir);
    if (!existsSync(base)) continue;

    // Recursively find checkpoint.json files
    findCheckpointFiles(base, checkpoints);
  }
  return checkpoints;
}

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
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible dirs
  }
}

// ============================================================
// Strip mt-task entries
// ============================================================

interface CheckpointEntry {
  task_id: string;
  model: string;
  condition: string;
  run: number;
  [key: string]: unknown;
}

function stripMtTasks(checkpointPath: string): { removed: number; total: number; kept: number } {
  const raw = readFileSync(checkpointPath, 'utf-8');
  const entries = JSON.parse(raw) as CheckpointEntry[];
  const total = entries.length;

  // Keep everything except mt-* tasks
  const kept = entries.filter(e => !e.task_id.includes('-mt-'));
  const removed = total - kept.length;

  if (removed > 0 && !dryRun) {
    writeFileSync(checkpointPath, JSON.stringify(kept, null, 2), 'utf-8');
  }

  return { removed, total, kept: kept.length };
}

// ============================================================
// Main
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('  mt-Task Checkpoint Cleanup');
console.log('  Target: ' + target);
console.log('  Mode: ' + (dryRun ? 'DRY RUN' : 'LIVE'));
console.log('='.repeat(60));

const checkpoints = findCheckpoints(target);

if (checkpoints.length === 0) {
  console.log('\n  No checkpoint files found. Nothing to do.\n');
  process.exit(0);
}

console.log(`\n  Found ${checkpoints.length} checkpoint files:\n`);

let totalRemoved = 0;
let totalEntries = 0;

for (const cp of checkpoints) {
  const relPath = relative(RESULTS_BASE, cp);
  const { removed, total, kept } = stripMtTasks(cp);
  totalRemoved += removed;
  totalEntries += total;

  if (removed > 0) {
    console.log(`  [STRIP] ${relPath}: ${removed} mt-entries removed (${kept}/${total} kept)`);
  } else {
    console.log(`  [SKIP]  ${relPath}: no mt-entries found (${total} entries)`);
  }
}

console.log(`\n  Summary:`);
console.log(`    Checkpoint files processed: ${checkpoints.length}`);
console.log(`    Total entries scanned: ${totalEntries}`);
console.log(`    mt-task entries removed: ${totalRemoved}`);
console.log(`    ${dryRun ? '(DRY RUN — no files modified)' : 'Files updated on disk'}`);
console.log(`\n  Next step: re-run the benchmark scripts.`);
console.log(`  The runners will re-execute only the removed mt-tasks`);
console.log(`  (all other tasks are still checkpointed).\n`);
