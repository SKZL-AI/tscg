#!/usr/bin/env npx tsx
/**
 * Wave 2.9 Ablation Analysis: Scenario D without Multi-Tool Tasks
 *
 * Purpose:
 *   Tests whether small-model accuracy degradation under TSCG compression
 *   is driven by multi-tool task difficulty rather than compression quality.
 *
 * Method:
 *   1. Loads all Scenario D checkpoint files (per model x catalog size)
 *   2. Filters OUT results where task_id contains "-mt-" (multi-tool tasks)
 *   3. Recalculates per-model, per-condition, per-catalog-size accuracy
 *   4. Compares natural vs tscg delta WITH and WITHOUT multi-tool tasks
 *
 * Task ID patterns:
 *   tab-D-ts-NNN  = tool selection (8 per set)  -- KEPT
 *   tab-D-mt-NNN  = multi-tool     (4 per set)  -- EXCLUDED
 *   tab-D-pe-NNN  = param extract  (4 per set)  -- KEPT
 *   tab-D-nt-NNN  = no-tool        (4 per set)  -- KEPT
 *
 * After filtering: 16 tasks per condition (was 20), 3 runs = 48 results per condition
 *
 * Output:
 *   - Console table: Model | CatSize | Cond | Acc(all) | Acc(no-mt) | Delta
 *   - Console summary: aggregate deltas per model
 *   - JSON output: benchmark/results/small-models/ablation-no-mt.json
 *   - CSV output:  benchmark/results/small-models/ablation-no-mt.csv
 *
 * Usage:
 *   npx tsx benchmark/scripts/ablation-no-mt.ts
 *   npx tsx benchmark/scripts/ablation-no-mt.ts --verbose
 */

import { resolve, join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

// ============================================================
// Types
// ============================================================

interface CheckpointEntry {
  result_id: string;
  task_id: string;
  model: string;
  condition: string;
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
  };
  metrics: {
    input_tokens: number;
    output_tokens: number;
    total_latency_ms: number;
    cost_usd: number;
  };
  timestamp: string;
}

interface AccuracyMetrics {
  overall: number;
  tool_selection: number;
  param_f1: number;
  n: number;
}

interface ComparisonRow {
  model: string;
  catalogSize: number;
  condition: string;
  accAll: AccuracyMetrics;
  accNoMt: AccuracyMetrics;
}

interface AblationSummary {
  model: string;
  avgDeltaAll: number;      // avg (tscg - natural) across catalog sizes, ALL tasks
  avgDeltaNoMt: number;     // avg (tscg - natural) across catalog sizes, NO mt tasks
  shift: number;            // avgDeltaNoMt - avgDeltaAll (positive = mt tasks were hurting)
  perSize: Array<{
    catalogSize: number;
    deltaAll: number;
    deltaNoMt: number;
    shift: number;
  }>;
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
const CONDITIONS = ['natural', 'tscg'];

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ============================================================
// Helpers
// ============================================================

function isMultiToolTask(taskId: string): boolean {
  return taskId.includes('-mt-');
}

function computeMetrics(entries: CheckpointEntry[]): AccuracyMetrics {
  if (entries.length === 0) {
    return { overall: 0, tool_selection: 0, param_f1: 0, n: 0 };
  }
  const n = entries.length;
  const overall = entries.reduce((s, e) => s + e.scores.overall, 0) / n;
  const tool_selection = entries.reduce((s, e) => s + e.scores.tool_selection_accuracy, 0) / n;
  const param_f1 = entries.reduce((s, e) => s + e.scores.parameter_f1, 0) / n;
  return { overall, tool_selection, param_f1, n };
}

function fmt(val: number, decimals = 4): string {
  return val.toFixed(decimals);
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

// ============================================================
// Main
// ============================================================

function main() {
  console.log('='.repeat(90));
  console.log('  ABLATION ANALYSIS: Scenario D without Multi-Tool Tasks');
  console.log('  Wave 2.9 -- Does multi-tool difficulty drive small-model degradation?');
  console.log('='.repeat(90));
  console.log();

  const allRows: ComparisonRow[] = [];
  const summaries: AblationSummary[] = [];

  // Phase 1: Load all checkpoint data and compute per-cell metrics
  for (const model of MODELS) {
    const prefix = MODEL_DIR_PREFIXES[model];
    const modelSizeData: Array<{
      catalogSize: number;
      naturalAll: AccuracyMetrics;
      tscgAll: AccuracyMetrics;
      naturalNoMt: AccuracyMetrics;
      tscgNoMt: AccuracyMetrics;
    }> = [];

    for (const size of CATALOG_SIZES) {
      const dirName = `${prefix}_${size}tools`;
      const cpPath = join(RESULTS_DIR, dirName, 'checkpoint.json');

      if (!existsSync(cpPath)) {
        console.warn(`  WARNING: Missing checkpoint: ${cpPath}`);
        continue;
      }

      const raw = readFileSync(cpPath, 'utf-8');
      const entries: CheckpointEntry[] = JSON.parse(raw);

      for (const cond of CONDITIONS) {
        // All tasks
        const allForCond = entries.filter(e => e.condition === cond);
        const accAll = computeMetrics(allForCond);

        // Without multi-tool tasks
        const noMtForCond = allForCond.filter(e => !isMultiToolTask(e.task_id));
        const accNoMt = computeMetrics(noMtForCond);

        allRows.push({ model, catalogSize: size, condition: cond, accAll, accNoMt });

        if (VERBOSE) {
          const mtCount = allForCond.length - noMtForCond.length;
          console.log(
            `  ${padRight(model, 14)} ${padLeft(String(size), 2)}tools ${padRight(cond, 8)} ` +
            `all=${fmtPct(accAll.overall)} (n=${accAll.n}) ` +
            `noMt=${fmtPct(accNoMt.overall)} (n=${accNoMt.n}) ` +
            `[removed ${mtCount} mt results]`
          );
        }
      }

      // Collect for summary
      const naturalAllRows = allRows.filter(r => r.model === model && r.catalogSize === size && r.condition === 'natural');
      const tscgAllRows = allRows.filter(r => r.model === model && r.catalogSize === size && r.condition === 'tscg');

      if (naturalAllRows.length > 0 && tscgAllRows.length > 0) {
        const natAll = naturalAllRows[0].accAll;
        const tscAll = tscgAllRows[0].accAll;
        const natNoMt = naturalAllRows[0].accNoMt;
        const tscNoMt = tscgAllRows[0].accNoMt;

        modelSizeData.push({
          catalogSize: size,
          naturalAll: natAll,
          tscgAll: tscAll,
          naturalNoMt: natNoMt,
          tscgNoMt: tscNoMt,
        });
      }
    }

    // Compute summary for this model
    if (modelSizeData.length > 0) {
      const perSize = modelSizeData.map(d => {
        const deltaAll = d.tscgAll.overall - d.naturalAll.overall;
        const deltaNoMt = d.tscgNoMt.overall - d.naturalNoMt.overall;
        return {
          catalogSize: d.catalogSize,
          deltaAll,
          deltaNoMt,
          shift: deltaNoMt - deltaAll,
        };
      });

      const avgDeltaAll = perSize.reduce((s, p) => s + p.deltaAll, 0) / perSize.length;
      const avgDeltaNoMt = perSize.reduce((s, p) => s + p.deltaNoMt, 0) / perSize.length;

      summaries.push({
        model,
        avgDeltaAll,
        avgDeltaNoMt,
        shift: avgDeltaNoMt - avgDeltaAll,
        perSize,
      });
    }
  }

  // ============================================================
  // Phase 2: Print detailed per-size comparison table
  // ============================================================

  console.log();
  console.log('-'.repeat(110));
  console.log('  DETAILED COMPARISON: natural vs tscg delta, with and without multi-tool tasks');
  console.log('-'.repeat(110));
  console.log();

  const hdr = [
    padRight('Model', 14),
    padLeft('CatSz', 5),
    padLeft('Nat(all)', 10),
    padLeft('TSCG(all)', 10),
    padLeft('Delta(all)', 11),
    padLeft('Nat(noMt)', 10),
    padLeft('TSCG(noMt)', 11),
    padLeft('Delta(noMt)', 12),
    padLeft('Shift', 8),
  ].join(' | ');
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const model of MODELS) {
    const summary = summaries.find(s => s.model === model);
    if (!summary) continue;

    for (const pd of summary.perSize) {
      const naturalAll = allRows.find(r => r.model === model && r.catalogSize === pd.catalogSize && r.condition === 'natural');
      const tscgAll = allRows.find(r => r.model === model && r.catalogSize === pd.catalogSize && r.condition === 'tscg');
      if (!naturalAll || !tscgAll) continue;

      const row = [
        padRight(model, 14),
        padLeft(String(pd.catalogSize), 5),
        padLeft(fmtPct(naturalAll.accAll.overall), 10),
        padLeft(fmtPct(tscgAll.accAll.overall), 10),
        padLeft(fmtPp(pd.deltaAll), 11),
        padLeft(fmtPct(naturalAll.accNoMt.overall), 10),
        padLeft(fmtPct(tscgAll.accNoMt.overall), 11),
        padLeft(fmtPp(pd.deltaNoMt), 12),
        padLeft(fmtPp(pd.shift), 8),
      ].join(' | ');
      console.log(row);
    }
    console.log('-'.repeat(hdr.length));
  }

  // ============================================================
  // Phase 3: Print aggregate summary table
  // ============================================================

  console.log();
  console.log('='.repeat(90));
  console.log('  AGGREGATE SUMMARY: Average TSCG effect (tscg - natural) per model');
  console.log('='.repeat(90));
  console.log();

  const summHdr = [
    padRight('Model', 14),
    padLeft('Avg Delta(all)', 15),
    padLeft('Avg Delta(noMt)', 16),
    padLeft('Shift', 10),
    padLeft('Interpretation', 50),
  ].join(' | ');
  console.log(summHdr);
  console.log('-'.repeat(summHdr.length));

  for (const s of summaries) {
    let interpretation: string;
    if (s.shift > 0.01) {
      interpretation = `MT tasks hurt by ${fmtPp(s.shift)}; TSCG less negative w/o MT`;
    } else if (s.shift < -0.01) {
      interpretation = `MT tasks helped by ${fmtPp(-s.shift)}; TSCG better w/ MT`;
    } else {
      interpretation = 'Negligible MT effect on TSCG delta';
    }

    const row = [
      padRight(s.model, 14),
      padLeft(fmtPp(s.avgDeltaAll), 15),
      padLeft(fmtPp(s.avgDeltaNoMt), 16),
      padLeft(fmtPp(s.shift), 10),
      padRight(interpretation, 50),
    ].join(' | ');
    console.log(row);
  }

  // ============================================================
  // Phase 4: Per-task-type breakdown (ts, pe, nt separately)
  // ============================================================

  console.log();
  console.log('='.repeat(90));
  console.log('  PER-TASK-TYPE BREAKDOWN: Average accuracy across all catalog sizes');
  console.log('='.repeat(90));
  console.log();

  const taskTypes = [
    { label: 'Tool Selection (ts)', filter: (id: string) => id.includes('-ts-') },
    { label: 'Multi-Tool (mt)',     filter: (id: string) => id.includes('-mt-') },
    { label: 'Param Extract (pe)',  filter: (id: string) => id.includes('-pe-') },
    { label: 'No-Tool (nt)',        filter: (id: string) => id.includes('-nt-') },
  ];

  const ttHdr = [
    padRight('Model', 14),
    padRight('Task Type', 22),
    padLeft('Nat Acc', 9),
    padLeft('TSCG Acc', 9),
    padLeft('Delta', 9),
  ].join(' | ');
  console.log(ttHdr);
  console.log('-'.repeat(ttHdr.length));

  // We need to load all checkpoint data again for per-type analysis
  // (or we can collect it during the first pass -- let's just re-iterate)
  for (const model of MODELS) {
    const prefix = MODEL_DIR_PREFIXES[model];

    for (const tt of taskTypes) {
      let natTotal = 0, natCount = 0;
      let tscTotal = 0, tscCount = 0;

      for (const size of CATALOG_SIZES) {
        const dirName = `${prefix}_${size}tools`;
        const cpPath = join(RESULTS_DIR, dirName, 'checkpoint.json');
        if (!existsSync(cpPath)) continue;

        const entries: CheckpointEntry[] = JSON.parse(readFileSync(cpPath, 'utf-8'));

        const natEntries = entries.filter(e => e.condition === 'natural' && tt.filter(e.task_id));
        const tscEntries = entries.filter(e => e.condition === 'tscg' && tt.filter(e.task_id));

        natTotal += natEntries.reduce((s, e) => s + e.scores.overall, 0);
        natCount += natEntries.length;
        tscTotal += tscEntries.reduce((s, e) => s + e.scores.overall, 0);
        tscCount += tscEntries.length;
      }

      const natAcc = natCount > 0 ? natTotal / natCount : 0;
      const tscAcc = tscCount > 0 ? tscTotal / tscCount : 0;
      const delta = tscAcc - natAcc;

      const row = [
        padRight(model, 14),
        padRight(tt.label, 22),
        padLeft(fmtPct(natAcc), 9),
        padLeft(fmtPct(tscAcc), 9),
        padLeft(fmtPp(delta), 9),
      ].join(' | ');
      console.log(row);
    }
    console.log('-'.repeat(ttHdr.length));
  }

  // ============================================================
  // Phase 5: Key findings
  // ============================================================

  console.log();
  console.log('='.repeat(90));
  console.log('  KEY FINDINGS');
  console.log('='.repeat(90));
  console.log();

  // Find models where shift is most significant
  const sortedByShift = [...summaries].sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  for (const s of sortedByShift) {
    const direction = s.shift > 0 ? 'IMPROVES' : 'WORSENS';
    console.log(
      `  ${padRight(s.model, 14)}: Removing MT tasks ${direction} TSCG delta by ${fmtPp(Math.abs(s.shift))}` +
      `  (${fmtPp(s.avgDeltaAll)} -> ${fmtPp(s.avgDeltaNoMt)})`
    );
  }

  // Overall
  const overallShift = summaries.reduce((s, m) => s + m.shift, 0) / summaries.length;
  console.log();
  console.log(`  Average shift across all models: ${fmtPp(overallShift)}`);
  if (overallShift > 0.01) {
    console.log('  => Multi-tool tasks ARE a significant driver of apparent TSCG degradation');
    console.log('  => Small models struggle with multi-tool orchestration REGARDLESS of compression');
  } else if (overallShift < -0.01) {
    console.log('  => Multi-tool tasks actually HELP the TSCG condition (unexpected)');
    console.log('  => Degradation is driven by other task types');
  } else {
    console.log('  => Multi-tool tasks have NEGLIGIBLE effect on TSCG delta');
    console.log('  => Degradation is consistent across task types');
  }

  // ============================================================
  // Phase 6: Write output files
  // ============================================================

  // JSON output
  const jsonOutput = {
    meta: {
      analysis: 'ablation-no-mt',
      description: 'Scenario D accuracy with and without multi-tool tasks',
      generatedAt: new Date().toISOString(),
      models: MODELS,
      catalogSizes: CATALOG_SIZES,
      taskTypesExcluded: ['mt (multi-tool)'],
      taskTypesKept: ['ts (tool selection)', 'pe (param extract)', 'nt (no-tool)'],
      tasksPerConditionAll: 20,
      tasksPerConditionNoMt: 16,
      runsPerCondition: 3,
    },
    summaries,
    detailedRows: allRows.map(r => ({
      model: r.model,
      catalogSize: r.catalogSize,
      condition: r.condition,
      overall_all: r.accAll.overall,
      tool_selection_all: r.accAll.tool_selection,
      param_f1_all: r.accAll.param_f1,
      n_all: r.accAll.n,
      overall_noMt: r.accNoMt.overall,
      tool_selection_noMt: r.accNoMt.tool_selection,
      param_f1_noMt: r.accNoMt.param_f1,
      n_noMt: r.accNoMt.n,
    })),
  };

  const jsonPath = join(RESULTS_DIR, 'ablation-no-mt.json');
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log();
  console.log(`  JSON output: ${jsonPath}`);

  // CSV output
  const csvHeader = [
    'model', 'catalog_size', 'condition',
    'overall_all', 'tool_sel_all', 'param_f1_all', 'n_all',
    'overall_noMt', 'tool_sel_noMt', 'param_f1_noMt', 'n_noMt',
    'overall_delta_all', 'overall_delta_noMt', 'shift',
  ].join(',');

  const csvRows: string[] = [csvHeader];
  for (const model of MODELS) {
    for (const size of CATALOG_SIZES) {
      const natural = allRows.find(r => r.model === model && r.catalogSize === size && r.condition === 'natural');
      const tscg = allRows.find(r => r.model === model && r.catalogSize === size && r.condition === 'tscg');
      if (!natural || !tscg) continue;

      const deltaAll = tscg.accAll.overall - natural.accAll.overall;
      const deltaNoMt = tscg.accNoMt.overall - natural.accNoMt.overall;
      const shift = deltaNoMt - deltaAll;

      for (const r of [natural, tscg]) {
        csvRows.push([
          r.model,
          r.catalogSize,
          r.condition,
          fmt(r.accAll.overall),
          fmt(r.accAll.tool_selection),
          fmt(r.accAll.param_f1),
          r.accAll.n,
          fmt(r.accNoMt.overall),
          fmt(r.accNoMt.tool_selection),
          fmt(r.accNoMt.param_f1),
          r.accNoMt.n,
          fmt(deltaAll),
          fmt(deltaNoMt),
          fmt(shift),
        ].join(','));
      }
    }
  }

  const csvPath = join(RESULTS_DIR, 'ablation-no-mt.csv');
  writeFileSync(csvPath, csvRows.join('\n') + '\n');
  console.log(`  CSV output:  ${csvPath}`);

  // ============================================================
  // Phase 7: LaTeX-ready table for paper appendix
  // ============================================================

  console.log();
  console.log('='.repeat(90));
  console.log('  LATEX TABLE (for paper appendix)');
  console.log('='.repeat(90));
  console.log();

  console.log('\\begin{table}[h]');
  console.log('\\centering');
  console.log('\\caption{Ablation: Scenario D accuracy with multi-tool tasks removed}');
  console.log('\\label{tab:ablation-no-mt}');
  console.log('\\begin{tabular}{lrrrrr}');
  console.log('\\toprule');
  console.log('Model & $\\Delta$(all) & $\\Delta$(no-mt) & Shift & Interpretation \\\\');
  console.log('\\midrule');

  for (const s of summaries) {
    const interpretation = s.shift > 0.01
      ? 'MT tasks hurt TSCG'
      : s.shift < -0.01
        ? 'MT tasks help TSCG'
        : 'Negligible';
    console.log(
      `${s.model} & ${fmtPp(s.avgDeltaAll)} & ${fmtPp(s.avgDeltaNoMt)} & ${fmtPp(s.shift)} & ${interpretation} \\\\`
    );
  }

  const overallDeltaAll = summaries.reduce((s, m) => s + m.avgDeltaAll, 0) / summaries.length;
  const overallDeltaNoMt = summaries.reduce((s, m) => s + m.avgDeltaNoMt, 0) / summaries.length;
  console.log('\\midrule');
  console.log(
    `\\textbf{Average} & ${fmtPp(overallDeltaAll)} & ${fmtPp(overallDeltaNoMt)} & ${fmtPp(overallShift)} & -- \\\\`
  );
  console.log('\\bottomrule');
  console.log('\\end{tabular}');
  console.log('\\end{table}');

  console.log();
  console.log('Done.');
}

main();
