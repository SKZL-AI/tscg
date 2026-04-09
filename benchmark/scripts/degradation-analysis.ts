#!/usr/bin/env npx tsx
/**
 * Wave 2.11 Degradation Analysis: Comprehensive TSCG impact profiling
 *
 * Purpose:
 *   Deep-dive into WHY certain small models degrade under TSCG compression.
 *   Goes beyond the ablation (Wave 2.9) to produce a full degradation profile
 *   per model, identifying the specific task types, catalog sizes, and
 *   individual tasks where TSCG hurts rather than helps.
 *
 * Input:
 *   - All Scenario D checkpoint files: 5 models x 7 catalog sizes
 *   - Each checkpoint: 20 tasks x 2 conditions x 3 runs = 120 entries
 *
 * Analysis dimensions:
 *   1. Per-task-type accuracy delta (ts, mt, pe, nt) x (natural vs tscg)
 *   2. Per-catalog-size accuracy delta (3, 5, 10, 15, 20, 30, 50 tools)
 *   3. Per-task consistency: which specific tasks degrade under TSCG
 *   4. Degradation profile: attribution of loss to dimensions
 *   5. Score decomposition: tool_selection vs param_f1 vs overall
 *
 * Output:
 *   - Console: detailed tables and findings
 *   - JSON: benchmark/results/small-models/degradation-analysis.json
 *   - CSV:  benchmark/results/small-models/degradation-analysis.csv
 *
 * Usage:
 *   npx tsx benchmark/scripts/degradation-analysis.ts
 *   npx tsx benchmark/scripts/degradation-analysis.ts --verbose
 */

import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// ============================================================
// Types
// ============================================================

interface CheckpointEntry {
  result_id: string;
  task_id: string;
  model: string;
  condition: 'natural' | 'tscg';
  run: number;
  response: {
    raw_output: string;
    parsed_tool_call?: { name: string; arguments: Record<string, unknown> };
    parsed_sequence?: Array<{ name: string; arguments: Record<string, unknown> }>;
    parse_success: boolean;
  };
  scores: {
    tool_selection_accuracy: number;
    parameter_f1: number;
    overall: number;
    no_tool_correct?: boolean;
  };
  metrics: {
    input_tokens: number;
    output_tokens: number;
    total_latency_ms: number;
    cost_usd: number;
  };
  timestamp: string;
}

type TaskType = 'ts' | 'mt' | 'pe' | 'nt';

interface TaskTypeInfo {
  code: TaskType;
  label: string;
  filter: (id: string) => boolean;
}

interface ScoreMetrics {
  overall: number;
  tool_selection: number;
  param_f1: number;
  n: number;
}

/** Per-model x per-task-type x per-catalog-size cell */
interface AnalysisCell {
  model: string;
  taskType: TaskType;
  catalogSize: number;
  natural: ScoreMetrics;
  tscg: ScoreMetrics;
  delta_overall: number;
  delta_tool_sel: number;
  delta_param_f1: number;
}

/** Per-task degradation record: a specific task_id that consistently fails under TSCG */
interface TaskDegradation {
  task_id: string;
  taskType: TaskType;
  catalogSize: number;
  natural_avg_overall: number;
  tscg_avg_overall: number;
  delta: number;
  natural_pass_rate: number;   // fraction of runs with overall >= 0.5
  tscg_pass_rate: number;
  degradation_type: 'tool_sel' | 'param_f1' | 'both' | 'no_tool';
}

/** Model-level degradation profile */
interface DegradationProfile {
  model: string;
  category: 'benefits' | 'neutral' | 'degrades';
  overall_delta_pp: number;  // weighted average delta in pp

  // Per dimension attributions
  by_task_type: Array<{
    taskType: TaskType;
    label: string;
    natural_acc: number;
    tscg_acc: number;
    delta_pp: number;
    n_tasks: number;
    contribution_pct: number;  // % of total degradation attributable to this type
  }>;

  by_catalog_size: Array<{
    catalogSize: number;
    natural_acc: number;
    tscg_acc: number;
    delta_pp: number;
    n_tasks: number;
  }>;

  // Score decomposition
  score_decomposition: {
    tool_sel_delta_pp: number;
    param_f1_delta_pp: number;
    overall_delta_pp: number;
  };

  // Top degraded tasks
  top_degraded_tasks: TaskDegradation[];

  // Scaling behavior
  scaling: {
    small_catalog_delta_pp: number;    // avg delta for sizes 3, 5
    medium_catalog_delta_pp: number;   // avg delta for sizes 10, 15
    large_catalog_delta_pp: number;    // avg delta for sizes 20, 30, 50
    tscg_scaling_advantage: boolean;   // true if large > small (TSCG helps at scale)
  };
}

// ============================================================
// Constants
// ============================================================

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const RESULTS_DIR = join(PROJECT_ROOT, 'benchmark', 'results', 'small-models');

const MODELS = ['Mistral 7B', 'Phi-4', 'Gemma 3 4B', 'Llama 3.1 8B', 'Qwen3 4B'];
const MODEL_DIR_PREFIXES: Record<string, string> = {
  'Mistral 7B': 'mistral',
  'Phi-4': 'phi4',
  'Gemma 3 4B': 'gemma3',
  'Llama 3.1 8B': 'llama3.1',
  'Qwen3 4B': 'qwen3',
};
const CATALOG_SIZES = [3, 5, 10, 15, 20, 30, 50];
const CONDITIONS: Array<'natural' | 'tscg'> = ['natural', 'tscg'];

const TASK_TYPES: TaskTypeInfo[] = [
  { code: 'ts', label: 'Tool Selection', filter: (id: string) => id.includes('-ts-') },
  { code: 'mt', label: 'Multi-Tool',     filter: (id: string) => id.includes('-mt-') },
  { code: 'pe', label: 'Param Extract',  filter: (id: string) => id.includes('-pe-') },
  { code: 'nt', label: 'No-Tool',        filter: (id: string) => id.includes('-nt-') },
];

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ============================================================
// Helpers
// ============================================================

function computeMetrics(entries: CheckpointEntry[]): ScoreMetrics {
  if (entries.length === 0) {
    return { overall: 0, tool_selection: 0, param_f1: 0, n: 0 };
  }
  const n = entries.length;
  const overall = entries.reduce((s, e) => s + e.scores.overall, 0) / n;
  const tool_selection = entries.reduce((s, e) => s + e.scores.tool_selection_accuracy, 0) / n;
  const param_f1 = entries.reduce((s, e) => s + e.scores.parameter_f1, 0) / n;
  return { overall, tool_selection, param_f1, n };
}

function getTaskType(taskId: string): TaskType {
  if (taskId.includes('-ts-')) return 'ts';
  if (taskId.includes('-mt-')) return 'mt';
  if (taskId.includes('-pe-')) return 'pe';
  if (taskId.includes('-nt-')) return 'nt';
  return 'ts'; // fallback
}

function fmtPct(val: number): string {
  return (val * 100).toFixed(1) + '%';
}

function fmtPp(val: number): string {
  const pp = val * 100;
  const sign = pp >= 0 ? '+' : '';
  return sign + pp.toFixed(1) + 'pp';
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

function loadCheckpoint(model: string, catalogSize: number): CheckpointEntry[] {
  const prefix = MODEL_DIR_PREFIXES[model];
  const dirName = `${prefix}_${catalogSize}tools`;
  const cpPath = join(RESULTS_DIR, dirName, 'checkpoint.json');

  if (!existsSync(cpPath)) {
    if (VERBOSE) console.warn(`  WARNING: Missing checkpoint: ${cpPath}`);
    return [];
  }

  return JSON.parse(readFileSync(cpPath, 'utf-8'));
}

// ============================================================
// Phase 1: Load ALL checkpoint data
// ============================================================

function loadAllData(): Map<string, CheckpointEntry[]> {
  /** Key: "model|catalogSize" -> entries */
  const dataMap = new Map<string, CheckpointEntry[]>();
  let totalEntries = 0;

  for (const model of MODELS) {
    for (const size of CATALOG_SIZES) {
      const entries = loadCheckpoint(model, size);
      if (entries.length > 0) {
        dataMap.set(`${model}|${size}`, entries);
        totalEntries += entries.length;
      }
    }
  }

  console.log(`  Loaded ${totalEntries} entries across ${dataMap.size} checkpoints`);
  console.log(`  (${MODELS.length} models x ${CATALOG_SIZES.length} sizes x ~120 entries each)`);
  return dataMap;
}

// ============================================================
// Phase 2: Compute per-cell analysis (model x taskType x catalogSize)
// ============================================================

function computeAnalysisCells(dataMap: Map<string, CheckpointEntry[]>): AnalysisCell[] {
  const cells: AnalysisCell[] = [];

  for (const model of MODELS) {
    for (const tt of TASK_TYPES) {
      for (const size of CATALOG_SIZES) {
        const entries = dataMap.get(`${model}|${size}`) ?? [];
        if (entries.length === 0) continue;

        const natEntries = entries.filter(e => e.condition === 'natural' && tt.filter(e.task_id));
        const tscEntries = entries.filter(e => e.condition === 'tscg' && tt.filter(e.task_id));

        const natural = computeMetrics(natEntries);
        const tscg = computeMetrics(tscEntries);

        cells.push({
          model,
          taskType: tt.code,
          catalogSize: size,
          natural,
          tscg,
          delta_overall: tscg.overall - natural.overall,
          delta_tool_sel: tscg.tool_selection - natural.tool_selection,
          delta_param_f1: tscg.param_f1 - natural.param_f1,
        });
      }
    }
  }

  return cells;
}

// ============================================================
// Phase 3: Identify per-task degradation (specific tasks that fail under TSCG)
// ============================================================

function computeTaskDegradations(
  dataMap: Map<string, CheckpointEntry[]>
): Map<string, TaskDegradation[]> {
  /** Key: model -> list of degraded tasks */
  const modelDegradations = new Map<string, TaskDegradation[]>();

  for (const model of MODELS) {
    const degradations: TaskDegradation[] = [];

    for (const size of CATALOG_SIZES) {
      const entries = dataMap.get(`${model}|${size}`) ?? [];
      if (entries.length === 0) continue;

      // Get unique task_ids
      const taskIds = [...new Set(entries.map(e => e.task_id))];

      for (const taskId of taskIds) {
        const natEntries = entries.filter(e => e.task_id === taskId && e.condition === 'natural');
        const tscEntries = entries.filter(e => e.task_id === taskId && e.condition === 'tscg');

        if (natEntries.length === 0 || tscEntries.length === 0) continue;

        const natAvgOverall = natEntries.reduce((s, e) => s + e.scores.overall, 0) / natEntries.length;
        const tscAvgOverall = tscEntries.reduce((s, e) => s + e.scores.overall, 0) / tscEntries.length;
        const delta = tscAvgOverall - natAvgOverall;

        // Only record if TSCG is worse
        if (delta < -0.05) {
          const natAvgToolSel = natEntries.reduce((s, e) => s + e.scores.tool_selection_accuracy, 0) / natEntries.length;
          const tscAvgToolSel = tscEntries.reduce((s, e) => s + e.scores.tool_selection_accuracy, 0) / tscEntries.length;
          const natAvgParam = natEntries.reduce((s, e) => s + e.scores.parameter_f1, 0) / natEntries.length;
          const tscAvgParam = tscEntries.reduce((s, e) => s + e.scores.parameter_f1, 0) / tscEntries.length;

          const toolSelDegraded = tscAvgToolSel < natAvgToolSel - 0.05;
          const paramDegraded = tscAvgParam < natAvgParam - 0.05;
          const taskType = getTaskType(taskId);
          const isNoTool = taskType === 'nt';

          let degradation_type: TaskDegradation['degradation_type'];
          if (isNoTool) degradation_type = 'no_tool';
          else if (toolSelDegraded && paramDegraded) degradation_type = 'both';
          else if (toolSelDegraded) degradation_type = 'tool_sel';
          else degradation_type = 'param_f1';

          const natPassRate = natEntries.filter(e => e.scores.overall >= 0.5).length / natEntries.length;
          const tscPassRate = tscEntries.filter(e => e.scores.overall >= 0.5).length / tscEntries.length;

          degradations.push({
            task_id: taskId,
            taskType,
            catalogSize: size,
            natural_avg_overall: natAvgOverall,
            tscg_avg_overall: tscAvgOverall,
            delta,
            natural_pass_rate: natPassRate,
            tscg_pass_rate: tscPassRate,
            degradation_type,
          });
        }
      }
    }

    // Sort by worst delta first
    degradations.sort((a, b) => a.delta - b.delta);
    modelDegradations.set(model, degradations);
  }

  return modelDegradations;
}

// ============================================================
// Phase 4: Compute degradation profiles
// ============================================================

function computeProfiles(
  cells: AnalysisCell[],
  taskDegradations: Map<string, TaskDegradation[]>
): DegradationProfile[] {
  const profiles: DegradationProfile[] = [];

  for (const model of MODELS) {
    const modelCells = cells.filter(c => c.model === model);

    // --- Overall delta ---
    const allNatOverall = modelCells.reduce((s, c) => s + c.natural.overall * c.natural.n, 0);
    const allNatN = modelCells.reduce((s, c) => s + c.natural.n, 0);
    const allTscOverall = modelCells.reduce((s, c) => s + c.tscg.overall * c.tscg.n, 0);
    const allTscN = modelCells.reduce((s, c) => s + c.tscg.n, 0);

    const natWeightedOverall = allNatN > 0 ? allNatOverall / allNatN : 0;
    const tscWeightedOverall = allTscN > 0 ? allTscOverall / allTscN : 0;
    const overall_delta = tscWeightedOverall - natWeightedOverall;
    const overall_delta_pp = overall_delta * 100;

    // --- Category ---
    let category: DegradationProfile['category'];
    if (overall_delta_pp > 2) category = 'benefits';
    else if (overall_delta_pp < -2) category = 'degrades';
    else category = 'neutral';

    // --- By task type ---
    const by_task_type = TASK_TYPES.map(tt => {
      const ttCells = modelCells.filter(c => c.taskType === tt.code);
      const natTotal = ttCells.reduce((s, c) => s + c.natural.overall * c.natural.n, 0);
      const natN = ttCells.reduce((s, c) => s + c.natural.n, 0);
      const tscTotal = ttCells.reduce((s, c) => s + c.tscg.overall * c.tscg.n, 0);
      const tscN = ttCells.reduce((s, c) => s + c.tscg.n, 0);

      const natAcc = natN > 0 ? natTotal / natN : 0;
      const tscAcc = tscN > 0 ? tscTotal / tscN : 0;
      const delta_pp = (tscAcc - natAcc) * 100;

      return {
        taskType: tt.code,
        label: tt.label,
        natural_acc: natAcc,
        tscg_acc: tscAcc,
        delta_pp,
        n_tasks: natN,
        contribution_pct: 0, // computed below
      };
    });

    // Compute contribution: how much of the total degradation is from each type
    // Only consider negative deltas for degradation attribution
    const totalNegativeDelta = by_task_type
      .filter(t => t.delta_pp < 0)
      .reduce((s, t) => s + Math.abs(t.delta_pp) * t.n_tasks, 0);

    if (totalNegativeDelta > 0) {
      for (const t of by_task_type) {
        if (t.delta_pp < 0) {
          t.contribution_pct = (Math.abs(t.delta_pp) * t.n_tasks / totalNegativeDelta) * 100;
        }
      }
    }

    // --- By catalog size ---
    const by_catalog_size = CATALOG_SIZES.map(size => {
      const sizeCells = modelCells.filter(c => c.catalogSize === size);
      const natTotal = sizeCells.reduce((s, c) => s + c.natural.overall * c.natural.n, 0);
      const natN = sizeCells.reduce((s, c) => s + c.natural.n, 0);
      const tscTotal = sizeCells.reduce((s, c) => s + c.tscg.overall * c.tscg.n, 0);
      const tscN = sizeCells.reduce((s, c) => s + c.tscg.n, 0);

      const natAcc = natN > 0 ? natTotal / natN : 0;
      const tscAcc = tscN > 0 ? tscTotal / tscN : 0;

      return {
        catalogSize: size,
        natural_acc: natAcc,
        tscg_acc: tscAcc,
        delta_pp: (tscAcc - natAcc) * 100,
        n_tasks: natN,
      };
    });

    // --- Score decomposition ---
    const allNatToolSel = modelCells.reduce((s, c) => s + c.natural.tool_selection * c.natural.n, 0);
    const allTscToolSel = modelCells.reduce((s, c) => s + c.tscg.tool_selection * c.tscg.n, 0);
    const allNatParam = modelCells.reduce((s, c) => s + c.natural.param_f1 * c.natural.n, 0);
    const allTscParam = modelCells.reduce((s, c) => s + c.tscg.param_f1 * c.tscg.n, 0);

    const score_decomposition = {
      tool_sel_delta_pp: allNatN > 0
        ? ((allTscToolSel / allTscN) - (allNatToolSel / allNatN)) * 100
        : 0,
      param_f1_delta_pp: allNatN > 0
        ? ((allTscParam / allTscN) - (allNatParam / allNatN)) * 100
        : 0,
      overall_delta_pp,
    };

    // --- Top degraded tasks ---
    const allDegradations = taskDegradations.get(model) ?? [];
    const top_degraded_tasks = allDegradations.slice(0, 10); // top 10

    // --- Scaling behavior ---
    const smallSizes = by_catalog_size.filter(s => s.catalogSize <= 5);
    const mediumSizes = by_catalog_size.filter(s => s.catalogSize >= 10 && s.catalogSize <= 15);
    const largeSizes = by_catalog_size.filter(s => s.catalogSize >= 20);

    const avgDelta = (arr: typeof by_catalog_size) =>
      arr.length > 0 ? arr.reduce((s, a) => s + a.delta_pp, 0) / arr.length : 0;

    const small_delta = avgDelta(smallSizes);
    const medium_delta = avgDelta(mediumSizes);
    const large_delta = avgDelta(largeSizes);

    const scaling = {
      small_catalog_delta_pp: small_delta,
      medium_catalog_delta_pp: medium_delta,
      large_catalog_delta_pp: large_delta,
      tscg_scaling_advantage: large_delta > small_delta + 5, // significant improvement at scale
    };

    profiles.push({
      model,
      category,
      overall_delta_pp,
      by_task_type,
      by_catalog_size,
      score_decomposition,
      top_degraded_tasks,
      scaling,
    });
  }

  return profiles;
}

// ============================================================
// Phase 5: Print tables and findings
// ============================================================

function printDetailedCellTable(cells: AnalysisCell[]) {
  console.log();
  console.log('-'.repeat(120));
  console.log('  DETAILED CELL TABLE: Model x TaskType x CatalogSize');
  console.log('-'.repeat(120));
  console.log();

  const hdr = [
    padRight('Model', 14),
    padLeft('Type', 4),
    padLeft('CatSz', 5),
    padLeft('Nat_Acc', 8),
    padLeft('TSCG_Acc', 9),
    padLeft('Delta', 8),
    padLeft('Nat_TS', 7),
    padLeft('TSCG_TS', 8),
    padLeft('dTS', 8),
    padLeft('Nat_PF', 7),
    padLeft('TSCG_PF', 8),
    padLeft('dPF', 8),
    padLeft('N', 3),
  ].join(' | ');
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const model of MODELS) {
    const modelCells = cells.filter(c => c.model === model);
    for (const c of modelCells) {
      const row = [
        padRight(c.model, 14),
        padLeft(c.taskType, 4),
        padLeft(String(c.catalogSize), 5),
        padLeft(fmtPct(c.natural.overall), 8),
        padLeft(fmtPct(c.tscg.overall), 9),
        padLeft(fmtPp(c.delta_overall), 8),
        padLeft(fmtPct(c.natural.tool_selection), 7),
        padLeft(fmtPct(c.tscg.tool_selection), 8),
        padLeft(fmtPp(c.delta_tool_sel), 8),
        padLeft(fmtPct(c.natural.param_f1), 7),
        padLeft(fmtPct(c.tscg.param_f1), 8),
        padLeft(fmtPp(c.delta_param_f1), 8),
        padLeft(String(c.natural.n), 3),
      ].join(' | ');
      console.log(row);
    }
    console.log('-'.repeat(hdr.length));
  }
}

function printProfiles(profiles: DegradationProfile[]) {
  // --- Model classification ---
  console.log();
  console.log('='.repeat(100));
  console.log('  MODEL CLASSIFICATION');
  console.log('='.repeat(100));
  console.log();

  const classHdr = [
    padRight('Model', 14),
    padLeft('Category', 10),
    padLeft('Overall_dpp', 12),
    padLeft('ToolSel_dpp', 12),
    padLeft('ParamF1_dpp', 12),
    padLeft('Scale_Adv', 10),
  ].join(' | ');
  console.log(classHdr);
  console.log('-'.repeat(classHdr.length));

  for (const p of profiles) {
    const cat = p.category.toUpperCase();
    const row = [
      padRight(p.model, 14),
      padLeft(cat, 10),
      padLeft(fmtPp(p.overall_delta_pp / 100), 12),
      padLeft(fmtPp(p.score_decomposition.tool_sel_delta_pp / 100), 12),
      padLeft(fmtPp(p.score_decomposition.param_f1_delta_pp / 100), 12),
      padLeft(p.scaling.tscg_scaling_advantage ? 'YES' : 'no', 10),
    ].join(' | ');
    console.log(row);
  }

  // --- Per-task-type breakdown per model ---
  console.log();
  console.log('='.repeat(100));
  console.log('  DEGRADATION BY TASK TYPE (per model)');
  console.log('='.repeat(100));
  console.log();

  const ttHdr = [
    padRight('Model', 14),
    padRight('Task Type', 16),
    padLeft('Nat_Acc', 8),
    padLeft('TSCG_Acc', 9),
    padLeft('Delta_pp', 9),
    padLeft('N', 5),
    padLeft('Contrib%', 9),
  ].join(' | ');
  console.log(ttHdr);
  console.log('-'.repeat(ttHdr.length));

  for (const p of profiles) {
    for (const tt of p.by_task_type) {
      const row = [
        padRight(p.model, 14),
        padRight(tt.label, 16),
        padLeft(fmtPct(tt.natural_acc), 8),
        padLeft(fmtPct(tt.tscg_acc), 9),
        padLeft(fmtPp(tt.delta_pp / 100), 9),
        padLeft(String(tt.n_tasks), 5),
        padLeft(tt.contribution_pct > 0 ? tt.contribution_pct.toFixed(1) + '%' : '-', 9),
      ].join(' | ');
      console.log(row);
    }
    console.log('-'.repeat(ttHdr.length));
  }

  // --- Per-catalog-size breakdown ---
  console.log();
  console.log('='.repeat(100));
  console.log('  DEGRADATION BY CATALOG SIZE (per model)');
  console.log('='.repeat(100));
  console.log();

  const szHdr = [
    padRight('Model', 14),
    padLeft('CatSize', 7),
    padLeft('Nat_Acc', 8),
    padLeft('TSCG_Acc', 9),
    padLeft('Delta_pp', 9),
    padLeft('N', 5),
  ].join(' | ');
  console.log(szHdr);
  console.log('-'.repeat(szHdr.length));

  for (const p of profiles) {
    for (const sz of p.by_catalog_size) {
      const row = [
        padRight(p.model, 14),
        padLeft(String(sz.catalogSize), 7),
        padLeft(fmtPct(sz.natural_acc), 8),
        padLeft(fmtPct(sz.tscg_acc), 9),
        padLeft(fmtPp(sz.delta_pp / 100), 9),
        padLeft(String(sz.n_tasks), 5),
      ].join(' | ');
      console.log(row);
    }
    console.log('-'.repeat(szHdr.length));
  }

  // --- Scaling summary ---
  console.log();
  console.log('='.repeat(100));
  console.log('  SCALING BEHAVIOR: TSCG delta at small vs medium vs large catalog sizes');
  console.log('='.repeat(100));
  console.log();

  const scHdr = [
    padRight('Model', 14),
    padLeft('Small(3,5)', 12),
    padLeft('Med(10,15)', 12),
    padLeft('Large(20+)', 12),
    padLeft('Scale Adv?', 10),
    padLeft('Category', 10),
  ].join(' | ');
  console.log(scHdr);
  console.log('-'.repeat(scHdr.length));

  for (const p of profiles) {
    const row = [
      padRight(p.model, 14),
      padLeft(fmtPp(p.scaling.small_catalog_delta_pp / 100), 12),
      padLeft(fmtPp(p.scaling.medium_catalog_delta_pp / 100), 12),
      padLeft(fmtPp(p.scaling.large_catalog_delta_pp / 100), 12),
      padLeft(p.scaling.tscg_scaling_advantage ? 'YES' : 'no', 10),
      padLeft(p.category.toUpperCase(), 10),
    ].join(' | ');
    console.log(row);
  }

  // --- Top degraded tasks per model ---
  console.log();
  console.log('='.repeat(100));
  console.log('  TOP-5 MOST DEGRADED TASKS PER MODEL');
  console.log('='.repeat(100));
  console.log();

  for (const p of profiles) {
    const top5 = p.top_degraded_tasks.slice(0, 5);
    if (top5.length === 0) {
      console.log(`  ${p.model}: No degraded tasks (delta > -5pp) -- TSCG does not hurt!`);
      console.log();
      continue;
    }

    console.log(`  ${p.model} [${p.category.toUpperCase()}]:`);
    const tdHdr = [
      padRight('  Task ID', 20),
      padLeft('Type', 4),
      padLeft('CatSz', 5),
      padLeft('Nat_Acc', 8),
      padLeft('TSCG_Acc', 9),
      padLeft('Delta_pp', 9),
      padLeft('Nat_Pass', 9),
      padLeft('TSCG_Pass', 10),
      padLeft('Cause', 10),
    ].join(' | ');
    console.log(tdHdr);

    for (const td of top5) {
      const row = [
        padRight('  ' + td.task_id, 20),
        padLeft(td.taskType, 4),
        padLeft(String(td.catalogSize), 5),
        padLeft(fmtPct(td.natural_avg_overall), 8),
        padLeft(fmtPct(td.tscg_avg_overall), 9),
        padLeft(fmtPp(td.delta), 9),
        padLeft(fmtPct(td.natural_pass_rate), 9),
        padLeft(fmtPct(td.tscg_pass_rate), 10),
        padLeft(td.degradation_type, 10),
      ].join(' | ');
      console.log(row);
    }
    console.log();
  }
}

function printKeyFindings(profiles: DegradationProfile[]) {
  console.log();
  console.log('='.repeat(100));
  console.log('  KEY FINDINGS: DEGRADATION ROOT CAUSE ANALYSIS');
  console.log('='.repeat(100));
  console.log();

  // 1. Which models degrade?
  const degraded = profiles.filter(p => p.category === 'degrades');
  const neutral = profiles.filter(p => p.category === 'neutral');
  const benefits = profiles.filter(p => p.category === 'benefits');

  console.log('  1. MODEL CATEGORIES:');
  console.log(`     Benefits (>+2pp):  ${benefits.map(p => `${p.model} (${fmtPp(p.overall_delta_pp / 100)})`).join(', ') || 'none'}`);
  console.log(`     Neutral (-2..+2pp): ${neutral.map(p => `${p.model} (${fmtPp(p.overall_delta_pp / 100)})`).join(', ') || 'none'}`);
  console.log(`     Degrades (<-2pp):   ${degraded.map(p => `${p.model} (${fmtPp(p.overall_delta_pp / 100)})`).join(', ') || 'none'}`);
  console.log();

  // 2. For degraded models: what causes the degradation?
  if (degraded.length > 0) {
    console.log('  2. DEGRADATION ROOT CAUSES:');
    for (const p of degraded) {
      console.log(`     ${p.model}:`);

      // Find the task type with worst contribution
      const worstType = [...p.by_task_type].sort((a, b) => a.delta_pp - b.delta_pp)[0];
      const worstContrib = [...p.by_task_type].sort((a, b) => b.contribution_pct - a.contribution_pct)[0];

      console.log(`       Worst task type:     ${worstType.label} (${fmtPp(worstType.delta_pp / 100)})`);
      console.log(`       Biggest contributor: ${worstContrib.label} (${worstContrib.contribution_pct.toFixed(1)}% of degradation)`);

      // Score decomposition
      const sd = p.score_decomposition;
      if (Math.abs(sd.tool_sel_delta_pp) > Math.abs(sd.param_f1_delta_pp)) {
        console.log(`       Primary mechanism:   Tool selection loss (${fmtPp(sd.tool_sel_delta_pp / 100)})`);
      } else {
        console.log(`       Primary mechanism:   Parameter extraction loss (${fmtPp(sd.param_f1_delta_pp / 100)})`);
      }

      // Scaling
      if (p.scaling.tscg_scaling_advantage) {
        console.log(`       Scaling note:        TSCG helps at large catalogs despite overall degradation`);
      } else {
        console.log(`       Scaling note:        Degradation persists across catalog sizes`);
      }

      // Top 3 specific tasks
      const top3 = p.top_degraded_tasks.slice(0, 3);
      if (top3.length > 0) {
        console.log(`       Top failed tasks:`);
        for (const t of top3) {
          console.log(`         - ${t.task_id} @ ${t.catalogSize} tools: ${fmtPct(t.natural_avg_overall)} -> ${fmtPct(t.tscg_avg_overall)} (${fmtPp(t.delta)}, cause: ${t.degradation_type})`);
        }
      }
      console.log();
    }
  }

  // 3. Cross-model patterns
  console.log('  3. CROSS-MODEL PATTERNS:');

  // Which task type is most problematic across models?
  const typeDeltas: Record<string, number[]> = { ts: [], mt: [], pe: [], nt: [] };
  for (const p of profiles) {
    for (const tt of p.by_task_type) {
      typeDeltas[tt.taskType].push(tt.delta_pp);
    }
  }

  const typeAvgs = Object.entries(typeDeltas).map(([type, deltas]) => ({
    type,
    avg: deltas.reduce((s, d) => s + d, 0) / deltas.length,
    min: Math.min(...deltas),
    max: Math.max(...deltas),
  }));
  typeAvgs.sort((a, b) => a.avg - b.avg);

  console.log('     Average delta by task type across all models:');
  for (const ta of typeAvgs) {
    const label = TASK_TYPES.find(t => t.code === ta.type)?.label ?? ta.type;
    console.log(`       ${padRight(label, 16)}: avg ${fmtPp(ta.avg / 100)}, range [${fmtPp(ta.min / 100)} .. ${fmtPp(ta.max / 100)}]`);
  }
  console.log();

  // 4. Scaling universality
  console.log('  4. SCALING BEHAVIOR:');
  const scaleAdvCount = profiles.filter(p => p.scaling.tscg_scaling_advantage).length;
  console.log(`     ${scaleAdvCount}/${profiles.length} models show TSCG scaling advantage at large catalogs`);
  for (const p of profiles) {
    console.log(`       ${padRight(p.model, 14)}: small=${fmtPp(p.scaling.small_catalog_delta_pp / 100)} -> large=${fmtPp(p.scaling.large_catalog_delta_pp / 100)} ${p.scaling.tscg_scaling_advantage ? '[SCALING ADV]' : ''}`);
  }
}

// ============================================================
// Phase 6: Write output files
// ============================================================

function writeOutputs(
  cells: AnalysisCell[],
  profiles: DegradationProfile[],
  taskDegradations: Map<string, TaskDegradation[]>
) {
  // --- JSON ---
  const jsonOutput = {
    meta: {
      analysis: 'degradation-analysis',
      description: 'Comprehensive TSCG degradation profiling for Scenario D small models',
      generatedAt: new Date().toISOString(),
      models: MODELS,
      catalogSizes: CATALOG_SIZES,
      taskTypes: TASK_TYPES.map(t => ({ code: t.code, label: t.label })),
      conditions: CONDITIONS,
      runsPerCondition: 3,
      tasksPerCondition: 20,
    },
    profiles: profiles.map(p => ({
      model: p.model,
      category: p.category,
      overall_delta_pp: round(p.overall_delta_pp, 2),
      score_decomposition: {
        tool_sel_delta_pp: round(p.score_decomposition.tool_sel_delta_pp, 2),
        param_f1_delta_pp: round(p.score_decomposition.param_f1_delta_pp, 2),
        overall_delta_pp: round(p.score_decomposition.overall_delta_pp, 2),
      },
      by_task_type: p.by_task_type.map(tt => ({
        taskType: tt.taskType,
        label: tt.label,
        natural_acc: round(tt.natural_acc, 4),
        tscg_acc: round(tt.tscg_acc, 4),
        delta_pp: round(tt.delta_pp, 2),
        n_tasks: tt.n_tasks,
        contribution_pct: round(tt.contribution_pct, 1),
      })),
      by_catalog_size: p.by_catalog_size.map(sz => ({
        catalogSize: sz.catalogSize,
        natural_acc: round(sz.natural_acc, 4),
        tscg_acc: round(sz.tscg_acc, 4),
        delta_pp: round(sz.delta_pp, 2),
        n_tasks: sz.n_tasks,
      })),
      scaling: {
        small_catalog_delta_pp: round(p.scaling.small_catalog_delta_pp, 2),
        medium_catalog_delta_pp: round(p.scaling.medium_catalog_delta_pp, 2),
        large_catalog_delta_pp: round(p.scaling.large_catalog_delta_pp, 2),
        tscg_scaling_advantage: p.scaling.tscg_scaling_advantage,
      },
      top_degraded_tasks: p.top_degraded_tasks.slice(0, 5).map(td => ({
        task_id: td.task_id,
        taskType: td.taskType,
        catalogSize: td.catalogSize,
        natural_avg_overall: round(td.natural_avg_overall, 4),
        tscg_avg_overall: round(td.tscg_avg_overall, 4),
        delta_pp: round(td.delta * 100, 2),
        natural_pass_rate: round(td.natural_pass_rate, 2),
        tscg_pass_rate: round(td.tscg_pass_rate, 2),
        degradation_type: td.degradation_type,
      })),
    })),
    cells: cells.map(c => ({
      model: c.model,
      taskType: c.taskType,
      catalogSize: c.catalogSize,
      natural_acc: round(c.natural.overall, 4),
      tscg_acc: round(c.tscg.overall, 4),
      delta_pp: round(c.delta_overall * 100, 2),
      natural_tool_sel: round(c.natural.tool_selection, 4),
      tscg_tool_sel: round(c.tscg.tool_selection, 4),
      natural_param_f1: round(c.natural.param_f1, 4),
      tscg_param_f1: round(c.tscg.param_f1, 4),
      n: c.natural.n,
    })),
  };

  const jsonPath = join(RESULTS_DIR, 'degradation-analysis.json');
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log();
  console.log(`  JSON output: ${jsonPath}`);

  // --- CSV: Main cell table ---
  const csvHeader = [
    'model', 'task_type', 'catalog_size',
    'natural_acc', 'tscg_acc', 'delta_pp',
    'natural_tool_sel', 'tscg_tool_sel', 'delta_tool_sel_pp',
    'natural_param_f1', 'tscg_param_f1', 'delta_param_f1_pp',
    'n',
  ].join(',');

  const csvRows = [csvHeader];
  for (const c of cells) {
    csvRows.push([
      c.model,
      c.taskType,
      c.catalogSize,
      round(c.natural.overall, 4),
      round(c.tscg.overall, 4),
      round(c.delta_overall * 100, 2),
      round(c.natural.tool_selection, 4),
      round(c.tscg.tool_selection, 4),
      round(c.delta_tool_sel * 100, 2),
      round(c.natural.param_f1, 4),
      round(c.tscg.param_f1, 4),
      round(c.delta_param_f1 * 100, 2),
      c.natural.n,
    ].join(','));
  }

  const csvPath = join(RESULTS_DIR, 'degradation-analysis.csv');
  writeFileSync(csvPath, csvRows.join('\n') + '\n');
  console.log(`  CSV output:  ${csvPath}`);

  // --- CSV: Summary profiles ---
  const summCsvHeader = [
    'model', 'category', 'overall_delta_pp',
    'tool_sel_delta_pp', 'param_f1_delta_pp',
    'ts_delta_pp', 'mt_delta_pp', 'pe_delta_pp', 'nt_delta_pp',
    'small_cat_delta_pp', 'medium_cat_delta_pp', 'large_cat_delta_pp',
    'tscg_scaling_advantage',
  ].join(',');

  const summCsvRows = [summCsvHeader];
  for (const p of profiles) {
    const ttMap: Record<string, number> = {};
    for (const tt of p.by_task_type) {
      ttMap[tt.taskType] = tt.delta_pp;
    }

    summCsvRows.push([
      p.model,
      p.category,
      round(p.overall_delta_pp, 2),
      round(p.score_decomposition.tool_sel_delta_pp, 2),
      round(p.score_decomposition.param_f1_delta_pp, 2),
      round(ttMap['ts'] ?? 0, 2),
      round(ttMap['mt'] ?? 0, 2),
      round(ttMap['pe'] ?? 0, 2),
      round(ttMap['nt'] ?? 0, 2),
      round(p.scaling.small_catalog_delta_pp, 2),
      round(p.scaling.medium_catalog_delta_pp, 2),
      round(p.scaling.large_catalog_delta_pp, 2),
      p.scaling.tscg_scaling_advantage ? 'yes' : 'no',
    ].join(','));
  }

  const summCsvPath = join(RESULTS_DIR, 'degradation-profiles.csv');
  writeFileSync(summCsvPath, summCsvRows.join('\n') + '\n');
  console.log(`  Profiles CSV: ${summCsvPath}`);
}

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ============================================================
// Main
// ============================================================

function main() {
  console.log('='.repeat(100));
  console.log('  WAVE 2.11 DEGRADATION ANALYSIS');
  console.log('  Comprehensive TSCG impact profiling for Scenario D small models');
  console.log('='.repeat(100));
  console.log();

  // Phase 1: Load data
  console.log('  Phase 1: Loading checkpoint data...');
  const dataMap = loadAllData();
  console.log();

  // Phase 2: Compute analysis cells
  console.log('  Phase 2: Computing per-cell analysis (Model x TaskType x CatalogSize)...');
  const cells = computeAnalysisCells(dataMap);
  console.log(`  Generated ${cells.length} analysis cells`);
  console.log();

  // Phase 3: Identify task-level degradations
  console.log('  Phase 3: Identifying per-task degradation patterns...');
  const taskDegradations = computeTaskDegradations(dataMap);
  let totalDegTasks = 0;
  for (const [model, degs] of taskDegradations) {
    console.log(`  ${padRight(model, 14)}: ${degs.length} degraded task instances`);
    totalDegTasks += degs.length;
  }
  console.log(`  Total: ${totalDegTasks} task instances where TSCG < natural by >5pp`);
  console.log();

  // Phase 4: Compute profiles
  console.log('  Phase 4: Computing degradation profiles...');
  const profiles = computeProfiles(cells, taskDegradations);
  console.log();

  // Phase 5: Print detailed tables (optional with --verbose)
  if (VERBOSE) {
    printDetailedCellTable(cells);
  }

  // Phase 5b: Print profiles and findings
  printProfiles(profiles);
  printKeyFindings(profiles);

  // Phase 6: Write outputs
  console.log();
  console.log('='.repeat(100));
  console.log('  WRITING OUTPUT FILES');
  console.log('='.repeat(100));
  writeOutputs(cells, profiles, taskDegradations);

  console.log();
  console.log('='.repeat(100));
  console.log('  DONE');
  console.log('='.repeat(100));
}

main();
