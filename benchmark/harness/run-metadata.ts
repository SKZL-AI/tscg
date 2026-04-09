/**
 * TAB Run Metadata — Provenance tracking for benchmark runs (FIX-04)
 *
 * Automatically captures git commit, experiment plan hash, environment
 * info, and error logs for every benchmark run. Ensures reproducibility
 * and traceability of results.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RunMetadata {
  runId: string;
  startedAt: string;
  completedAt?: string;
  gitCommit: string;
  gitBranch: string;
  gitDirty: boolean;
  experimentPlanHash: string;
  scenario: string;
  models: string[];
  conditions: string[];
  runs: number;
  seed: number;
  nodeVersion: string;
  platform: string;
  errors: Array<{ timestamp: string; message: string; task?: string }>;
  excludedCalls: Array<{ reason: string; count: number }>;
}

export function createRunMetadata(opts: {
  scenario: string;
  models: string[];
  conditions: string[];
  runs: number;
  seed: number;
}): RunMetadata {
  const currentDir = resolve(fileURLToPath(import.meta.url), '..');
  const planPath = join(currentDir, '../../config/experiment-plan.json');
  let planHash = 'unknown';
  try {
    const planContent = readFileSync(planPath, 'utf-8');
    planHash = createHash('sha256').update(planContent).digest('hex').slice(0, 12);
  } catch { /* plan file not found — non-fatal */ }

  let gitCommit = 'unknown';
  let gitBranch = 'unknown';
  let gitDirty = true;
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    gitDirty = execSync('git status --porcelain', { encoding: 'utf-8' }).trim().length > 0;
  } catch { /* git not available — non-fatal */ }

  return {
    runId: `${opts.scenario}-${Date.now()}`,
    startedAt: new Date().toISOString(),
    gitCommit,
    gitBranch,
    gitDirty,
    experimentPlanHash: planHash,
    scenario: opts.scenario,
    models: opts.models,
    conditions: opts.conditions,
    runs: opts.runs,
    seed: opts.seed,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    errors: [],
    excludedCalls: [],
  };
}

export function finalizeRunMetadata(meta: RunMetadata, outputDir: string): void {
  meta.completedAt = new Date().toISOString();
  writeFileSync(
    join(outputDir, 'RUN_METADATA.json'),
    JSON.stringify(meta, null, 2),
  );
}
