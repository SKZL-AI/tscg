/**
 * TAB Benchmark — Unified Task Generator
 *
 * Combines all individual generators to produce the complete task suite
 * for all TAB scenarios (A through E + GSM8K).
 *
 * Task distribution per schema collection:
 *   - 8 single_tool   (easy: 3, medium: 3, hard: 2)
 *   - 4 multi_tool     (medium: 2, hard: 2)
 *   - 4 param_extract  (medium: 2, hard: 2)
 *   - 4 no_tool        (easy: 2, medium: 2)
 *   = 20 tasks per collection
 *
 * Plus:
 *   - 50 GSM8K questions x 4 load sizes = 200 GSM8K tasks
 */

import type { SchemaCollection, ToolSchema } from '../../schemas/types.js';
import { collectionToSchemas } from '../../schemas/types.js';
import type { BenchmarkTask, Scenario } from '../types.js';

import { generateToolSelectionTasks } from './tool-selection.js';
import { generateMultiToolTasks } from './multi-tool.js';
import { generateParamExtractionTasks } from './param-extract.js';
import { generateNoToolTasks } from './no-tool.js';
import { generateGSM8KLoadTasks } from './gsm8k-load.js';

// ============================================================
// Per-Collection Generator
// ============================================================

/**
 * Generate all tasks for a single schema collection.
 *
 * Produces 20 tasks:
 *   - 8 single_tool selection tasks
 *   - 4 multi_tool sequence tasks
 *   - 4 parameter_extraction tasks
 *   - 4 no_tool rejection tasks
 *
 * @param collection - Schema collection to generate tasks for
 * @param seed       - Base random seed (default: 42)
 * @returns Array of 20 BenchmarkTask objects
 */
export function generateTasksForCollection(
  collection: SchemaCollection,
  seed: number = 42,
): BenchmarkTask[] {
  const tools: ToolSchema[] = collectionToSchemas(collection);
  const scenario: Scenario = collection.scenario;
  const source = collection.id;

  // Use collection-specific seed offset based on collection id hash
  const collectionSeed = seed + hashString(collection.id);

  const tasks: BenchmarkTask[] = [
    ...generateToolSelectionTasks(tools, scenario, source, 8, collectionSeed),
    ...generateMultiToolTasks(tools, scenario, source, 4, collectionSeed),
    ...generateParamExtractionTasks(tools, scenario, source, 4, collectionSeed),
    ...generateNoToolTasks(tools, scenario, source, 4, collectionSeed),
  ];

  return tasks;
}

// ============================================================
// Full Suite Generator
// ============================================================

/**
 * Generate the complete TAB benchmark task suite.
 *
 * Takes all schema collections (from all scenarios) and generates:
 *   - 20 tasks per collection (tool selection, multi-tool, param extraction, no-tool)
 *   - 200 GSM8K-under-load tasks (50 questions x 4 load sizes)
 *
 * @param collections - All schema collections across all scenarios
 * @param seed        - Base random seed for reproducibility
 * @returns Complete array of BenchmarkTask objects
 */
export function generateAllTasks(
  collections: SchemaCollection[],
  seed: number = 42,
): BenchmarkTask[] {
  const allTasks: BenchmarkTask[] = [];

  // Generate tasks for each collection
  for (const collection of collections) {
    const collectionTasks = generateTasksForCollection(collection, seed);
    allTasks.push(...collectionTasks);
  }

  // Add GSM8K-under-load tasks (independent of collections)
  const gsm8kTasks = generateGSM8KLoadTasks();
  allTasks.push(...gsm8kTasks);

  return allTasks;
}

// ============================================================
// Summary / Statistics
// ============================================================

/**
 * Summary statistics for a generated task suite.
 */
export interface TaskSuiteStats {
  totalTasks: number;
  byScenario: Record<string, number>;
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
  collectionsProcessed: number;
  gsm8kTasks: number;
}

/**
 * Compute summary statistics for a set of generated tasks.
 */
export function computeTaskStats(tasks: BenchmarkTask[]): TaskSuiteStats {
  const byScenario: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};

  for (const task of tasks) {
    byScenario[task.scenario] = (byScenario[task.scenario] || 0) + 1;
    byCategory[task.category] = (byCategory[task.category] || 0) + 1;
    byDifficulty[task.difficulty] = (byDifficulty[task.difficulty] || 0) + 1;
  }

  const gsm8kTasks = tasks.filter((t) => t.scenario === 'GSM8K').length;
  const nonGsm8k = tasks.filter((t) => t.scenario !== 'GSM8K');
  const collections = new Set(nonGsm8k.map((t) => t.source));

  return {
    totalTasks: tasks.length,
    byScenario,
    byCategory,
    byDifficulty,
    collectionsProcessed: collections.size,
    gsm8kTasks,
  };
}

// ============================================================
// Utility
// ============================================================

/**
 * Simple string hash for deterministic seed offsets.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================
// Re-exports for convenience
// ============================================================

export { generateToolSelectionTasks } from './tool-selection.js';
export { generateMultiToolTasks } from './multi-tool.js';
export { generateParamExtractionTasks } from './param-extract.js';
export { generateNoToolTasks } from './no-tool.js';
export { generateGSM8KLoadTasks, getGSM8KSubset, getSchemaLoadSizes } from './gsm8k-load.js';
