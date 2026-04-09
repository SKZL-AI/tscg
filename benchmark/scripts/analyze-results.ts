#!/usr/bin/env npx tsx
/**
 * TAB Benchmark -- Combined Results Analyzer
 *
 * Reads all result files from benchmark/results/ and computes aggregate
 * statistics across all scenarios, models, and conditions.
 *
 * Statistical methods:
 *   - Mean accuracy with 95% Wilson confidence intervals
 *   - Cohen's d effect size (TSCG vs natural)
 *   - Paired t-test for statistical significance
 *   - ARR (Accuracy Retention Rate) per model/condition
 *
 * Output:
 *   - benchmark/results/analysis/aggregate-summary.json
 *   - benchmark/results/analysis/statistical-tests.json
 *   - benchmark/results/analysis/aggregate-tables.tex
 *   - benchmark/results/analysis/aggregate-results.csv
 *
 * Usage:
 *   npx tsx benchmark/scripts/analyze-results.ts
 *   npx tsx benchmark/scripts/analyze-results.ts --input benchmark/results
 *   npx tsx benchmark/scripts/analyze-results.ts --output benchmark/results/analysis
 */

import { resolve, join, basename } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

import type {
  TaskResult,
  BenchmarkReport,
  AggregateMetrics,
  Condition,
  Scenario,
} from '../harness/types.js';

import { aggregateResults, computeARR } from '../harness/aggregate.js';
import { saveLatexReport } from '../harness/reporters/latex-reporter.js';

// ============================================================
// CLI Options
// ============================================================

interface AnalyzeOptions {
  inputDir: string;
  outputDir: string;
  verbose: boolean;
}

function parseCliArgs(): AnalyzeOptions {
  const args = process.argv.slice(2);
  const opts: AnalyzeOptions = {
    inputDir: resolve('benchmark/results'),
    outputDir: resolve('benchmark/results/analysis'),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--input':
        opts.inputDir = resolve(next);
        i++;
        break;
      case '--output':
        opts.outputDir = resolve(next);
        i++;
        break;
      case '--verbose':
      case '-v':
        opts.verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return opts;
}

function printUsage(): void {
  console.log(`
  TAB Results Analyzer

  Reads all result files from benchmark/results/ and produces aggregate
  statistics with statistical significance tests.

  Usage: npx tsx benchmark/scripts/analyze-results.ts [options]

  Options:
    --input <dir>    Input directory containing result JSON files (default: benchmark/results)
    --output <dir>   Output directory for analysis files (default: benchmark/results/analysis)
    --verbose, -v    Show detailed output during processing
    --help, -h       Show this help

  Output Files:
    aggregate-summary.json      Combined aggregate metrics across all scenarios
    statistical-tests.json      Cohen's d, paired t-test, CI95 for all comparisons
    aggregate-tables.tex        LaTeX tables for the paper
    aggregate-results.csv       CSV for R/Python analysis
  `);
}

// ============================================================
// File Discovery
// ============================================================

interface DiscoveredResult {
  filepath: string;
  scenario: string;
  source: string;
  results: TaskResult[];
}

/**
 * Recursively discover all result JSON files under the input directory.
 * Looks for:
 *   - *-results.json   (full benchmark reports with results array)
 *   - checkpoint.json   (raw TaskResult arrays from checkpoint manager)
 */
function discoverResultFiles(inputDir: string, verbose: boolean): DiscoveredResult[] {
  const discovered: DiscoveredResult[] = [];

  if (!existsSync(inputDir)) {
    console.warn(`  Warning: Input directory does not exist: ${inputDir}`);
    return discovered;
  }

  // Look in subdirectories (bfcl/, scenario-a/, etc.)
  const entries = readdirSync(inputDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(inputDir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const subResults = discoverResultFilesInDir(fullPath, entry.name, verbose);
      discovered.push(...subResults);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Check files in root results dir
      const results = tryLoadResults(fullPath, verbose);
      if (results.length > 0) {
        discovered.push({
          filepath: fullPath,
          scenario: inferScenarioFromPath(fullPath),
          source: basename(fullPath, '.json'),
          results,
        });
      }
    }
  }

  return discovered;
}

function discoverResultFilesInDir(
  dir: string,
  scenarioHint: string,
  verbose: boolean,
): DiscoveredResult[] {
  const discovered: DiscoveredResult[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const fullPath = join(dir, entry.name);

      // Skip analysis output files to avoid circular reads
      if (entry.name.startsWith('aggregate-') || entry.name.startsWith('statistical-')) continue;
      // Skip dry-run summaries
      if (entry.name.includes('dry-run')) continue;

      const results = tryLoadResults(fullPath, verbose);
      if (results.length > 0) {
        discovered.push({
          filepath: fullPath,
          scenario: scenarioHint,
          source: basename(fullPath, '.json'),
          results,
        });
      }
    }
  } catch (err) {
    if (verbose) {
      console.warn(`  Warning: Could not read directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return discovered;
}

/**
 * Try to load TaskResult[] from a JSON file.
 * Handles both full BenchmarkReport format and raw TaskResult arrays.
 */
function tryLoadResults(filepath: string, verbose: boolean): TaskResult[] {
  try {
    const raw = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw) as unknown;

    // Check if it's a BenchmarkReport with results array
    if (
      data !== null &&
      typeof data === 'object' &&
      'results' in data &&
      Array.isArray((data as Record<string, unknown>).results)
    ) {
      const report = data as BenchmarkReport;
      if (report.results.length > 0 && isTaskResult(report.results[0])) {
        if (verbose) {
          console.log(`    Found ${report.results.length} results in ${basename(filepath)} (report format)`);
        }
        return report.results;
      }
    }

    // Check if it's a raw array of TaskResults
    if (Array.isArray(data) && data.length > 0 && isTaskResult(data[0])) {
      if (verbose) {
        console.log(`    Found ${data.length} results in ${basename(filepath)} (array format)`);
      }
      return data as TaskResult[];
    }
  } catch {
    // Not a valid results file, skip silently
  }

  return [];
}

function isTaskResult(obj: unknown): obj is TaskResult {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.task_id === 'string' &&
    typeof r.model === 'string' &&
    typeof r.condition === 'string' &&
    typeof r.run === 'number' &&
    r.scores !== undefined &&
    r.metrics !== undefined
  );
}

function inferScenarioFromPath(filepath: string): string {
  const lower = filepath.toLowerCase();
  if (lower.includes('bfcl')) return 'D';
  if (lower.includes('gsm8k')) return 'GSM8K';
  if (lower.includes('scenario-a') || lower.includes('claude-code')) return 'A';
  if (lower.includes('scenario-b') || lower.includes('mcp')) return 'B';
  if (lower.includes('scenario-c') || lower.includes('synthetic')) return 'C';
  if (lower.includes('scenario-d')) return 'D';
  if (lower.includes('scenario-e')) return 'E';
  return 'unknown';
}

// ============================================================
// Statistical Functions
// ============================================================

/** Arithmetic mean */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation (sample) */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSqDiff = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(sumSqDiff / (values.length - 1));
}

/**
 * Wilson score confidence interval for proportions.
 * More accurate than Wald CI for small sample sizes.
 */
function wilsonCI(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const d = 1 + (z * z) / total;
  const c = (p + (z * z) / (2 * total)) / d;
  const h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * 95% confidence interval for mean using t-distribution approximation.
 * For larger samples (n >= 30), this is very close to using z = 1.96.
 * For smaller samples, uses a lookup table for t-critical values.
 */
function meanCI95(values: number[]): [number, number] {
  const n = values.length;
  if (n < 2) return [mean(values), mean(values)];

  const m = mean(values);
  const s = stddev(values);
  const se = s / Math.sqrt(n);

  // t-critical value approximation for 95% CI
  // For n >= 30, t ~ 1.96; for smaller n, use lookup
  const tCritical = n >= 30 ? 1.96 : getTCritical(n - 1);

  return [m - tCritical * se, m + tCritical * se];
}

/**
 * Approximate t-critical value for common degrees of freedom.
 */
function getTCritical(df: number): number {
  // Two-tailed 95% t-critical values
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000,
    120: 1.980,
  };

  // Exact match
  if (table[df] !== undefined) return table[df];

  // Interpolate or use closest
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (df < keys[0]) return table[keys[0]];
  if (df > keys[keys.length - 1]) return 1.96;

  // Find surrounding values
  for (let i = 0; i < keys.length - 1; i++) {
    if (df >= keys[i] && df <= keys[i + 1]) {
      const lower = keys[i];
      const upper = keys[i + 1];
      const frac = (df - lower) / (upper - lower);
      return table[lower] + frac * (table[upper] - table[lower]);
    }
  }

  return 1.96;
}

/**
 * Cohen's d effect size.
 * Measures the standardized difference between two groups.
 *
 * d = (mean1 - mean2) / pooled_std
 *
 * Interpretation:
 *   |d| < 0.2: negligible
 *   |d| < 0.5: small
 *   |d| < 0.8: medium
 *   |d| >= 0.8: large
 */
function cohensD(group1: number[], group2: number[]): number {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) return 0;

  const m1 = mean(group1);
  const m2 = mean(group2);
  const s1 = stddev(group1);
  const s2 = stddev(group2);

  // Pooled standard deviation
  const pooled = Math.sqrt(
    ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2),
  );

  if (pooled === 0) return 0;
  return (m1 - m2) / pooled;
}

function interpretCohensD(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}

/**
 * Paired t-test (two-tailed).
 *
 * Tests whether the mean difference between paired observations is
 * significantly different from zero.
 *
 * Returns t-statistic, degrees of freedom, and approximate p-value.
 */
function pairedTTest(group1: number[], group2: number[]): {
  t_statistic: number;
  df: number;
  p_value: number;
  significant_at_05: boolean;
  significant_at_01: boolean;
} {
  const n = Math.min(group1.length, group2.length);
  if (n < 2) {
    return { t_statistic: 0, df: 0, p_value: 1, significant_at_05: false, significant_at_01: false };
  }

  // Compute differences
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(group1[i] - group2[i]);
  }

  const meanDiff = mean(diffs);
  const sdDiff = stddev(diffs);
  const seDiff = sdDiff / Math.sqrt(n);

  if (seDiff === 0) {
    return {
      t_statistic: 0,
      df: n - 1,
      p_value: meanDiff === 0 ? 1 : 0,
      significant_at_05: meanDiff !== 0,
      significant_at_01: meanDiff !== 0,
    };
  }

  const tStat = meanDiff / seDiff;
  const df = n - 1;

  // Approximate p-value using normal distribution for large samples
  // For small samples, this is a rough approximation
  const pValue = approximateTwoTailedPValue(Math.abs(tStat), df);

  return {
    t_statistic: tStat,
    df,
    p_value: pValue,
    significant_at_05: pValue < 0.05,
    significant_at_01: pValue < 0.01,
  };
}

/**
 * Approximate two-tailed p-value for t-distribution.
 * Uses a simplified approximation suitable for reporting.
 */
function approximateTwoTailedPValue(absT: number, df: number): number {
  // For large df, approximate with standard normal
  // For small df, this is a rough approximation
  // Using the fact that t -> N(0,1) as df -> infinity
  const adjustedT = absT * Math.sqrt(df / (df + absT * absT));

  // Standard normal CDF approximation (Abramowitz and Stegun)
  const z = adjustedT;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);
  const t = 1 / (1 + p * absZ);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);
  const normalCdf = 0.5 * (1 + sign * y);

  // Two-tailed p-value
  return 2 * (1 - normalCdf);
}

// ============================================================
// Analysis Engine
// ============================================================

interface StatisticalComparison {
  model: string;
  scenario: string;
  natural_condition: string;
  tscg_condition: string;
  natural_accuracy_mean: number;
  tscg_accuracy_mean: number;
  arr: number;
  arr_pct: number;
  arr_meets_target: boolean;
  cohens_d: number;
  cohens_d_interpretation: string;
  paired_t_test: {
    t_statistic: number;
    df: number;
    p_value: number;
    significant_at_05: boolean;
    significant_at_01: boolean;
  };
  natural_ci95: [number, number];
  tscg_ci95: [number, number];
  n_pairs: number;
}

/**
 * Run statistical comparisons between natural and TSCG conditions.
 */
function computeStatisticalComparisons(
  allResults: TaskResult[],
): StatisticalComparison[] {
  const comparisons: StatisticalComparison[] = [];

  // Group results by (model, scenario, condition)
  const groups = new Map<string, TaskResult[]>();
  for (const r of allResults) {
    const scenario = inferScenarioFromTaskId(r.task_id);
    const key = `${r.model}::${scenario}::${r.condition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // Find all (model, scenario) pairs
  const pairs = new Map<string, Set<string>>();
  for (const key of groups.keys()) {
    const [model, scenario, condition] = key.split('::');
    const pairKey = `${model}::${scenario}`;
    if (!pairs.has(pairKey)) pairs.set(pairKey, new Set());
    pairs.get(pairKey)!.add(condition);
  }

  // For each pair, compare natural vs tscg conditions
  for (const [pairKey, conditions] of pairs) {
    const [model, scenario] = pairKey.split('::');

    if (!conditions.has('natural')) continue;

    const naturalResults = groups.get(`${model}::${scenario}::natural`) ?? [];
    const naturalScores = naturalResults.map(r => r.scores.overall);

    for (const cond of ['tscg', 'tscg_sad'] as Condition[]) {
      if (!conditions.has(cond)) continue;

      const tscgResults = groups.get(`${model}::${scenario}::${cond}`) ?? [];
      const tscgScores = tscgResults.map(r => r.scores.overall);

      // Need at least 2 paired observations for meaningful statistics
      const nPairs = Math.min(naturalScores.length, tscgScores.length);
      if (nPairs < 2) continue;

      const naturalMean = mean(naturalScores);
      const tscgMean = mean(tscgScores);
      const arr = naturalMean > 0 ? tscgMean / naturalMean : 0;

      comparisons.push({
        model,
        scenario,
        natural_condition: 'natural',
        tscg_condition: cond,
        natural_accuracy_mean: naturalMean,
        tscg_accuracy_mean: tscgMean,
        arr,
        arr_pct: arr * 100,
        arr_meets_target: arr * 100 >= 99.5,
        cohens_d: cohensD(tscgScores, naturalScores),
        cohens_d_interpretation: interpretCohensD(cohensD(tscgScores, naturalScores)),
        paired_t_test: pairedTTest(tscgScores, naturalScores),
        natural_ci95: meanCI95(naturalScores),
        tscg_ci95: meanCI95(tscgScores),
        n_pairs: nPairs,
      });
    }
  }

  return comparisons;
}

function inferScenarioFromTaskId(taskId: string): string {
  const upper = taskId.toUpperCase();
  if (upper.startsWith('GSM8K') || upper.startsWith('GSM')) return 'GSM8K';
  if (upper.startsWith('D-') || upper.startsWith('D_') || upper.startsWith('TAB-D')) return 'D';
  if (upper.startsWith('A-') || upper.startsWith('A_') || upper.startsWith('TAB-A')) return 'A';
  if (upper.startsWith('B-') || upper.startsWith('B_') || upper.startsWith('TAB-B')) return 'B';
  if (upper.startsWith('C-') || upper.startsWith('C_') || upper.startsWith('TAB-C')) return 'C';
  if (upper.startsWith('E-') || upper.startsWith('E_') || upper.startsWith('TAB-E')) return 'E';
  const first = upper.charAt(0);
  if ('ABCDE'.includes(first)) return first;
  return 'unknown';
}

// ============================================================
// Report Generation
// ============================================================

interface AnalysisSummary {
  timestamp: string;
  input_dir: string;
  files_processed: number;
  total_results: number;
  scenarios_found: string[];
  models_found: string[];
  conditions_found: string[];
  aggregates: AggregateMetrics[];
  comparisons: StatisticalComparison[];
  overall_summary: {
    mean_arr_tscg: number;
    mean_arr_tscg_sad: number;
    all_arr_targets_met: boolean;
    mean_token_savings_tscg: number;
    mean_token_savings_tscg_sad: number;
  };
}

function buildAnalysisSummary(
  discovered: DiscoveredResult[],
  allResults: TaskResult[],
  aggregates: AggregateMetrics[],
  comparisons: StatisticalComparison[],
  inputDir: string,
): AnalysisSummary {
  const scenarios = [...new Set(allResults.map(r => inferScenarioFromTaskId(r.task_id)))];
  const models = [...new Set(allResults.map(r => r.model))];
  const conditions = [...new Set(allResults.map(r => r.condition))];

  // Compute overall ARR means
  const tscgComps = comparisons.filter(c => c.tscg_condition === 'tscg');
  const tscgSadComps = comparisons.filter(c => c.tscg_condition === 'tscg_sad');

  const meanArrTscg = tscgComps.length > 0
    ? mean(tscgComps.map(c => c.arr_pct))
    : 0;
  const meanArrTscgSad = tscgSadComps.length > 0
    ? mean(tscgSadComps.map(c => c.arr_pct))
    : 0;

  const tscgAggs = aggregates.filter(a => a.condition === 'tscg');
  const tscgSadAggs = aggregates.filter(a => a.condition === 'tscg_sad');

  return {
    timestamp: new Date().toISOString(),
    input_dir: inputDir,
    files_processed: discovered.length,
    total_results: allResults.length,
    scenarios_found: scenarios,
    models_found: models,
    conditions_found: conditions,
    aggregates,
    comparisons,
    overall_summary: {
      mean_arr_tscg: meanArrTscg,
      mean_arr_tscg_sad: meanArrTscgSad,
      all_arr_targets_met: comparisons.every(c => c.arr_meets_target),
      mean_token_savings_tscg: tscgAggs.length > 0
        ? mean(tscgAggs.map(a => a.token_savings_pct))
        : 0,
      mean_token_savings_tscg_sad: tscgSadAggs.length > 0
        ? mean(tscgSadAggs.map(a => a.token_savings_pct))
        : 0,
    },
  };
}

/**
 * Generate CSV output for all results (suitable for R/Python).
 */
function buildResultsCSV(allResults: TaskResult[]): string {
  const headers = [
    'result_id', 'task_id', 'scenario', 'model', 'condition', 'run',
    'tool_selection_accuracy', 'parameter_f1', 'overall_score',
    'input_tokens', 'output_tokens', 'total_latency_ms', 'cost_usd',
    'parse_success', 'timestamp',
  ];

  const rows = allResults.map(r => {
    const scenario = inferScenarioFromTaskId(r.task_id);
    return [
      csvEscape(r.result_id),
      csvEscape(r.task_id),
      scenario,
      csvEscape(r.model),
      r.condition,
      r.run.toString(),
      r.scores.tool_selection_accuracy.toFixed(4),
      r.scores.parameter_f1.toFixed(4),
      r.scores.overall.toFixed(4),
      r.metrics.input_tokens.toString(),
      r.metrics.output_tokens.toString(),
      r.metrics.total_latency_ms.toString(),
      r.metrics.cost_usd.toFixed(6),
      r.response.parse_success.toString(),
      csvEscape(r.timestamp),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n') + '\n';
}

/**
 * Generate CSV for statistical comparisons.
 */
function buildComparisonsCSV(comparisons: StatisticalComparison[]): string {
  const headers = [
    'model', 'scenario', 'condition', 'natural_acc', 'tscg_acc',
    'arr', 'arr_pct', 'arr_target_met',
    'cohens_d', 'cohens_d_interp',
    't_statistic', 'df', 'p_value', 'sig_05', 'sig_01',
    'natural_ci95_low', 'natural_ci95_high',
    'tscg_ci95_low', 'tscg_ci95_high',
    'n_pairs',
  ];

  const rows = comparisons.map(c => [
    csvEscape(c.model),
    c.scenario,
    c.tscg_condition,
    c.natural_accuracy_mean.toFixed(4),
    c.tscg_accuracy_mean.toFixed(4),
    c.arr.toFixed(4),
    c.arr_pct.toFixed(1),
    c.arr_meets_target.toString(),
    c.cohens_d.toFixed(4),
    c.cohens_d_interpretation,
    c.paired_t_test.t_statistic.toFixed(4),
    c.paired_t_test.df.toString(),
    c.paired_t_test.p_value.toFixed(6),
    c.paired_t_test.significant_at_05.toString(),
    c.paired_t_test.significant_at_01.toString(),
    c.natural_ci95[0].toFixed(4),
    c.natural_ci95[1].toFixed(4),
    c.tscg_ci95[0].toFixed(4),
    c.tscg_ci95[1].toFixed(4),
    c.n_pairs.toString(),
  ].join(','));

  return [headers.join(','), ...rows].join('\n') + '\n';
}

/**
 * Generate aggregate LaTeX table content covering all scenarios.
 */
function buildAggregateLatex(
  aggregates: AggregateMetrics[],
  comparisons: StatisticalComparison[],
): string {
  const lines: string[] = [
    '% Auto-generated by TAB analyze-results.ts',
    `% Generated: ${new Date().toISOString()}`,
    '',
  ];

  // Table 1: Overall results
  lines.push(
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{TAB Aggregate Results Across All Scenarios}',
    '  \\label{tab:aggregate-results}',
    '  \\begin{tabular}{llcccccr}',
    '    \\toprule',
    '    Scenario & Model & Condition & Accuracy & ARR & Tool Sel. & Param F1 & $n$ \\\\',
    '    \\midrule',
  );

  let lastScenario = '';
  for (const a of aggregates) {
    if (lastScenario && a.scenario !== lastScenario) {
      lines.push('    \\addlinespace');
    }
    lastScenario = a.scenario;

    const condDisplay = a.condition === 'natural' ? 'Natural'
      : a.condition === 'tscg' ? 'TSCG'
      : 'TSCG+SAD';
    const acc = `${(a.accuracy.mean * 100).toFixed(1)}\\%`;
    const arrStr = a.arr === 0 ? '---' : `${(a.arr * 100).toFixed(1)}\\%`;
    const toolSel = `${(a.tool_selection_accuracy.mean * 100).toFixed(1)}\\%`;
    const paramF1 = `${(a.parameter_f1.mean * 100).toFixed(1)}\\%`;

    lines.push(
      `    ${a.scenario} & ${escapeLatex(a.model)} & ${condDisplay} & ${acc} & ${arrStr} & ${toolSel} & ${paramF1} & ${a.n_tasks} \\\\`,
    );
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
    '',
  );

  // Table 2: Statistical significance
  if (comparisons.length > 0) {
    lines.push(
      '\\begin{table}[htbp]',
      '  \\centering',
      '  \\caption{Statistical Significance: TSCG vs Natural Baseline}',
      '  \\label{tab:statistical-significance}',
      '  \\begin{tabular}{llccccc}',
      '    \\toprule',
      '    Scenario & Condition & ARR & Cohen\'s $d$ & $t$ & $p$ & Sig. \\\\',
      '    \\midrule',
    );

    for (const c of comparisons) {
      const arrStr = `${c.arr_pct.toFixed(1)}\\%`;
      const dStr = `${c.cohens_d.toFixed(3)}`;
      const tStr = `${c.paired_t_test.t_statistic.toFixed(3)}`;
      const pStr = c.paired_t_test.p_value < 0.001 ? '$<$0.001' : `${c.paired_t_test.p_value.toFixed(3)}`;
      const sigStr = c.paired_t_test.significant_at_01 ? '**'
        : c.paired_t_test.significant_at_05 ? '*'
        : 'n.s.';
      const condDisplay = c.tscg_condition === 'tscg' ? 'TSCG' : 'TSCG+SAD';

      lines.push(
        `    ${c.scenario} & ${condDisplay} & ${arrStr} & ${dStr} & ${tStr} & ${pStr} & ${sigStr} \\\\`,
      );
    }

    lines.push(
      '    \\bottomrule',
      '  \\end{tabular}',
      '  \\vspace{2mm}',
      '  \\footnotesize{$*$ $p < 0.05$, $**$ $p < 0.01$, n.s. = not significant}',
      '\\end{table}',
    );
  }

  return lines.join('\n');
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, match => '\\' + match)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================
// Console Output
// ============================================================

function printAnalysisSummary(summary: AnalysisSummary): void {
  const width = 90;
  console.log('\n' + '='.repeat(width));
  console.log('  TAB AGGREGATE ANALYSIS');
  console.log('='.repeat(width));

  console.log(`\n  Files processed:    ${summary.files_processed}`);
  console.log(`  Total results:      ${summary.total_results}`);
  console.log(`  Scenarios:          ${summary.scenarios_found.join(', ')}`);
  console.log(`  Models:             ${summary.models_found.join(', ')}`);
  console.log(`  Conditions:         ${summary.conditions_found.join(', ')}`);

  // Aggregates table
  if (summary.aggregates.length > 0) {
    console.log('\n  ' + '-'.repeat(width - 2));
    console.log('  AGGREGATE METRICS');
    console.log('  ' + '-'.repeat(width - 2));

    const header = `  ${'Scenario'.padEnd(10)} ${'Model'.padEnd(20)} ${'Cond'.padEnd(10)} ${'Acc'.padStart(8)} ${'ARR'.padStart(8)} ${'N'.padStart(5)}`;
    console.log(header);
    console.log('  ' + '-'.repeat(header.length - 2));

    for (const a of summary.aggregates) {
      const accStr = `${(a.accuracy.mean * 100).toFixed(1)}%`;
      const arrStr = a.arr === 0 ? 'N/A' : `${(a.arr * 100).toFixed(1)}%`;
      console.log(
        `  ${a.scenario.padEnd(10)} ${a.model.padEnd(20)} ${a.condition.padEnd(10)} ${accStr.padStart(8)} ${arrStr.padStart(8)} ${a.n_tasks.toString().padStart(5)}`,
      );
    }
  }

  // Statistical comparisons
  if (summary.comparisons.length > 0) {
    console.log('\n  ' + '-'.repeat(width - 2));
    console.log('  STATISTICAL COMPARISONS (TSCG vs Natural)');
    console.log('  ' + '-'.repeat(width - 2));

    const header2 = `  ${'Scenario'.padEnd(10)} ${'Condition'.padEnd(12)} ${'ARR'.padStart(8)} ${"Cohen's d".padStart(10)} ${'p-value'.padStart(10)} ${'Sig'.padStart(6)}`;
    console.log(header2);
    console.log('  ' + '-'.repeat(header2.length - 2));

    for (const c of summary.comparisons) {
      const arrStr = `${c.arr_pct.toFixed(1)}%`;
      const dStr = `${c.cohens_d.toFixed(3)} (${c.cohens_d_interpretation.charAt(0)})`;
      const pStr = c.paired_t_test.p_value < 0.001 ? '<.001' : c.paired_t_test.p_value.toFixed(3);
      const sigStr = c.paired_t_test.significant_at_01 ? '**'
        : c.paired_t_test.significant_at_05 ? '*'
        : 'n.s.';

      console.log(
        `  ${c.scenario.padEnd(10)} ${c.tscg_condition.padEnd(12)} ${arrStr.padStart(8)} ${dStr.padStart(10)} ${pStr.padStart(10)} ${sigStr.padStart(6)}`,
      );
    }
  }

  // Overall summary
  console.log('\n  ' + '-'.repeat(width - 2));
  console.log('  OVERALL');
  console.log('  ' + '-'.repeat(width - 2));
  console.log(`  Mean ARR (TSCG):      ${summary.overall_summary.mean_arr_tscg.toFixed(1)}%`);
  console.log(`  Mean ARR (TSCG+SAD):  ${summary.overall_summary.mean_arr_tscg_sad.toFixed(1)}%`);
  console.log(`  All ARR targets met:  ${summary.overall_summary.all_arr_targets_met ? 'YES' : 'NO'}`);
  console.log(`  Token savings (TSCG): ${summary.overall_summary.mean_token_savings_tscg.toFixed(1)}%`);
  console.log(`  Token savings (SAD):  ${summary.overall_summary.mean_token_savings_tscg_sad.toFixed(1)}%`);

  console.log('\n' + '='.repeat(width) + '\n');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const opts = parseCliArgs();

  console.log('\n  TAB Results Analyzer');
  console.log('  ' + '-'.repeat(40));
  console.log(`  Input:  ${opts.inputDir}`);
  console.log(`  Output: ${opts.outputDir}`);

  // Step 1: Discover result files
  console.log('\n  [1/4] Discovering result files...');
  const discovered = discoverResultFiles(opts.inputDir, opts.verbose);

  if (discovered.length === 0) {
    console.log('  No result files found in ' + opts.inputDir);
    console.log('  Run benchmarks first:');
    console.log('    npx tsx benchmark/scripts/run-bfcl.ts --dry-run');
    console.log('    npx tsx benchmark/scripts/run-bfcl.ts');
    process.exit(0);
  }

  console.log(`  Found ${discovered.length} result file(s)`);
  for (const d of discovered) {
    console.log(`    - ${d.source}: ${d.results.length} results (scenario ${d.scenario})`);
  }

  // Step 2: Combine all results
  console.log('\n  [2/4] Aggregating results...');
  const allResults: TaskResult[] = [];
  for (const d of discovered) {
    allResults.push(...d.results);
  }
  console.log(`  Total results: ${allResults.length}`);

  // Deduplicate by result_id
  const seen = new Set<string>();
  const dedupResults: TaskResult[] = [];
  for (const r of allResults) {
    if (!seen.has(r.result_id)) {
      seen.add(r.result_id);
      dedupResults.push(r);
    }
  }
  if (dedupResults.length < allResults.length) {
    console.log(`  Deduplicated: ${allResults.length} -> ${dedupResults.length} results`);
  }

  const aggregates = aggregateResults(dedupResults);
  console.log(`  Computed ${aggregates.length} aggregate groups`);

  // Step 3: Statistical comparisons
  console.log('\n  [3/4] Computing statistical tests...');
  const comparisons = computeStatisticalComparisons(dedupResults);
  console.log(`  Computed ${comparisons.length} comparisons`);

  // Step 4: Generate outputs
  console.log('\n  [4/4] Generating output files...');
  mkdirSync(opts.outputDir, { recursive: true });

  // Build summary
  const summary = buildAnalysisSummary(discovered, dedupResults, aggregates, comparisons, opts.inputDir);

  // JSON: aggregate summary
  const summaryPath = join(opts.outputDir, 'aggregate-summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`  [JSON] Summary: ${summaryPath}`);

  // JSON: statistical tests
  const statsPath = join(opts.outputDir, 'statistical-tests.json');
  writeFileSync(statsPath, JSON.stringify({
    timestamp: summary.timestamp,
    comparisons: summary.comparisons,
    overall: summary.overall_summary,
  }, null, 2), 'utf-8');
  console.log(`  [JSON] Statistics: ${statsPath}`);

  // CSV: all results
  const csvResultsPath = join(opts.outputDir, 'aggregate-results.csv');
  writeFileSync(csvResultsPath, buildResultsCSV(dedupResults), 'utf-8');
  console.log(`  [CSV]  Results: ${csvResultsPath}`);

  // CSV: comparisons
  const csvComparisonsPath = join(opts.outputDir, 'statistical-comparisons.csv');
  writeFileSync(csvComparisonsPath, buildComparisonsCSV(comparisons), 'utf-8');
  console.log(`  [CSV]  Comparisons: ${csvComparisonsPath}`);

  // LaTeX: aggregate tables
  const latexPath = join(opts.outputDir, 'aggregate-tables.tex');
  writeFileSync(latexPath, buildAggregateLatex(aggregates, comparisons), 'utf-8');
  console.log(`  [TeX]  Tables: ${latexPath}`);

  // Print to console
  printAnalysisSummary(summary);
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(`\n  Stack trace:\n${err.stack}`);
  }
  process.exit(1);
});
