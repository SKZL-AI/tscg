#!/usr/bin/env npx tsx
/**
 * TAB Benchmark -- Deep Statistical Analysis
 *
 * Provides publication-quality statistical analysis of benchmark results,
 * extending the basic aggregate analysis with:
 *   - Paired t-tests (natural vs TSCG accuracy per model)
 *   - McNemar's test (binary correct/incorrect comparison)
 *   - Bootstrap confidence intervals (1000 resamples, 95% CI)
 *   - Cohen's d effect size (magnitude of TSCG improvement)
 *   - ARR (Accuracy Retention Rate) with confidence bands
 *   - Per-scenario breakdown (A-E + GSM8K)
 *
 * Input:  benchmark/results/ (JSON result files from benchmark runs)
 * Output: benchmark/results/analysis/statistics.json
 *         benchmark/results/analysis/statistics-tables.tex
 *
 * Usage:
 *   npx tsx benchmark/analysis/statistics.ts
 *   npx tsx benchmark/analysis/statistics.ts --input benchmark/results
 *   npx tsx benchmark/analysis/statistics.ts --use-placeholder
 */

import { resolve, join, basename } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

import type {
  TaskResult,
  BenchmarkReport,
  Condition,
  Scenario,
} from '../harness/types.js';

// ============================================================
// Types
// ============================================================

/** Models included in the benchmark */
const BENCHMARK_MODELS = [
  'claude-sonnet-4-20250514',
  'gpt-4o-2024-11-20',
  'gpt-4.1-mini-2025-04-14',
  'gemini-2.5-flash',
  'llama-3.3-70b',
  'qwen-2.5-72b',
] as const;

/** Scenarios in the TAB suite */
const SCENARIOS: Scenario[] = ['A', 'B', 'C', 'D', 'E', 'GSM8K'];

/** Tool counts used in Scenario C scaling tests */
const SCALING_TOOL_COUNTS = [3, 5, 10, 15, 20, 30, 50, 75, 100] as const;

/** Tool counts used in GSM8K schema-load tests */
const GSM8K_TOOL_COUNTS = [0, 10, 25, 50] as const;

interface PairedTTestResult {
  t_statistic: number;
  df: number;
  p_value: number;
  significant_at_05: boolean;
  significant_at_01: boolean;
  mean_difference: number;
  se_difference: number;
}

interface McNemarResult {
  chi_squared: number;
  p_value: number;
  significant_at_05: boolean;
  /** Count: natural correct, TSCG wrong */
  b: number;
  /** Count: natural wrong, TSCG correct */
  c: number;
  /** Total discordant pairs */
  n_discordant: number;
}

interface BootstrapCI {
  mean: number;
  ci_lower: number;
  ci_upper: number;
  se: number;
  n_resamples: number;
}

interface EffectSize {
  cohens_d: number;
  interpretation: 'negligible' | 'small' | 'medium' | 'large';
  /** Hedges' g (bias-corrected Cohen's d) */
  hedges_g: number;
}

interface ARRResult {
  arr: number;
  arr_pct: number;
  arr_meets_target: boolean;
  natural_accuracy: number;
  tscg_accuracy: number;
  bootstrap_ci: BootstrapCI;
}

interface ScenarioComparison {
  scenario: Scenario;
  model: string;
  condition: Condition;
  n_tasks: number;
  natural_accuracy: number;
  tscg_accuracy: number;
  paired_t_test: PairedTTestResult;
  mcnemar: McNemarResult;
  bootstrap_accuracy: BootstrapCI;
  effect_size: EffectSize;
  arr: ARRResult;
  token_savings_pct: number;
}

interface HolmBonferroniResult {
  id: string;
  p_raw: number;
  p_corrected: number;
  significant: boolean;
}

interface MultipleComparisons {
  method: 'Holm-Bonferroni';
  totalTests: number;
  significantAfterCorrection: number;
  tests: HolmBonferroniResult[];
}

interface OverallStatistics {
  timestamp: string;
  data_source: 'real' | 'placeholder';
  models: string[];
  scenarios: Scenario[];
  comparisons: ScenarioComparison[];
  per_scenario_summary: ScenarioSummary[];
  overall_summary: OverallSummary;
  multipleComparisons: MultipleComparisons;
}

interface ScenarioSummary {
  scenario: Scenario;
  description: string;
  n_models: number;
  mean_arr_tscg: number;
  mean_arr_tscg_sad: number;
  mean_token_savings: number;
  all_significant: boolean;
  mean_cohens_d: number;
}

interface OverallSummary {
  total_comparisons: number;
  significant_at_05_count: number;
  significant_at_01_count: number;
  mean_arr_all: number;
  mean_cohens_d_all: number;
  mean_token_savings_all: number;
  arr_below_99_count: number;
  largest_effect: { model: string; scenario: string; cohens_d: number };
  smallest_effect: { model: string; scenario: string; cohens_d: number };
}

// ============================================================
// CLI Options
// ============================================================

interface CliOptions {
  inputDir: string;
  outputDir: string;
  usePlaceholder: boolean;
  verbose: boolean;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    inputDir: resolve('benchmark/results'),
    outputDir: resolve('benchmark/results/analysis'),
    usePlaceholder: false,
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
      case '--use-placeholder':
        opts.usePlaceholder = true;
        break;
      case '--verbose':
      case '-v':
        opts.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
  TAB Deep Statistical Analysis

  Usage: npx tsx benchmark/analysis/statistics.ts [options]

  Options:
    --input <dir>       Input directory with result JSON files
    --output <dir>      Output directory for analysis files
    --use-placeholder   Generate analysis with placeholder data
    --verbose, -v       Verbose output
    --help, -h          Show this help
        `);
        process.exit(0);
    }
  }

  return opts;
}

// ============================================================
// Core Statistical Functions
// ============================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Paired t-test (two-tailed).
 *
 * Tests H0: mean difference between paired observations = 0.
 * Requires equal-length arrays where element i in both arrays
 * corresponds to the same task.
 */
function pairedTTest(natural: number[], tscg: number[]): PairedTTestResult {
  const n = Math.min(natural.length, tscg.length);
  if (n < 2) {
    return {
      t_statistic: 0, df: 0, p_value: 1,
      significant_at_05: false, significant_at_01: false,
      mean_difference: 0, se_difference: 0,
    };
  }

  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(tscg[i] - natural[i]);
  }

  const meanDiff = mean(diffs);
  const sdDiff = stddev(diffs);
  const seDiff = sdDiff / Math.sqrt(n);

  if (seDiff === 0) {
    return {
      t_statistic: 0, df: n - 1,
      p_value: meanDiff === 0 ? 1 : 0,
      significant_at_05: meanDiff !== 0,
      significant_at_01: meanDiff !== 0,
      mean_difference: meanDiff, se_difference: 0,
    };
  }

  const tStat = meanDiff / seDiff;
  const df = n - 1;
  const pValue = approxTwoTailedP(Math.abs(tStat), df);

  return {
    t_statistic: round4(tStat),
    df,
    p_value: round6(pValue),
    significant_at_05: pValue < 0.05,
    significant_at_01: pValue < 0.01,
    mean_difference: round4(meanDiff),
    se_difference: round4(seDiff),
  };
}

/**
 * McNemar's test for paired binary outcomes.
 *
 * Compares whether the disagreements between two conditions are symmetric.
 * Uses the chi-squared approximation with continuity correction.
 *
 * @param naturalCorrect - Boolean array: was natural correct per task?
 * @param tscgCorrect - Boolean array: was TSCG correct per task?
 */
function mcnemarsTest(naturalCorrect: boolean[], tscgCorrect: boolean[]): McNemarResult {
  const n = Math.min(naturalCorrect.length, tscgCorrect.length);

  // Count discordant pairs
  // b: natural correct, TSCG wrong (regression)
  // c: natural wrong, TSCG correct (improvement)
  let b = 0;
  let c = 0;

  for (let i = 0; i < n; i++) {
    if (naturalCorrect[i] && !tscgCorrect[i]) b++;
    if (!naturalCorrect[i] && tscgCorrect[i]) c++;
  }

  const nDiscordant = b + c;

  if (nDiscordant === 0) {
    return {
      chi_squared: 0, p_value: 1, significant_at_05: false,
      b, c, n_discordant: 0,
    };
  }

  // McNemar's chi-squared with continuity correction (Edwards)
  const chiSq = (Math.abs(b - c) - 1) ** 2 / (b + c);

  // p-value from chi-squared with 1 df (approximate via normal)
  const pValue = 1 - normalCDF(Math.sqrt(chiSq));
  const twoTailedP = 2 * pValue;

  return {
    chi_squared: round4(chiSq),
    p_value: round6(Math.min(1, twoTailedP)),
    significant_at_05: twoTailedP < 0.05,
    b,
    c,
    n_discordant: nDiscordant,
  };
}

/**
 * Bootstrap confidence interval.
 *
 * Resamples with replacement to estimate the sampling distribution
 * of the mean accuracy. Uses the percentile method for CI bounds.
 *
 * @param scores - Array of accuracy scores (0 or 1)
 * @param nResamples - Number of bootstrap resamples (default: 1000)
 * @param alpha - Significance level (default: 0.05 for 95% CI)
 */
function bootstrapCI(
  scores: number[],
  nResamples = 1000,
  alpha = 0.05,
): BootstrapCI {
  const n = scores.length;
  if (n === 0) {
    return { mean: 0, ci_lower: 0, ci_upper: 0, se: 0, n_resamples: nResamples };
  }

  const originalMean = mean(scores);

  // Seeded PRNG for reproducibility (simple LCG)
  let seed = 42;
  function nextRand(): number {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const bootstrapMeans: number[] = [];

  for (let r = 0; r < nResamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRand() * n);
      sum += scores[idx];
    }
    bootstrapMeans.push(sum / n);
  }

  // Sort for percentile method
  bootstrapMeans.sort((a, b) => a - b);

  const lowerIdx = Math.floor((alpha / 2) * nResamples);
  const upperIdx = Math.floor((1 - alpha / 2) * nResamples) - 1;

  const bootstrapSE = stddev(bootstrapMeans);

  return {
    mean: round4(originalMean),
    ci_lower: round4(bootstrapMeans[Math.max(0, lowerIdx)]),
    ci_upper: round4(bootstrapMeans[Math.min(nResamples - 1, upperIdx)]),
    se: round4(bootstrapSE),
    n_resamples: nResamples,
  };
}

/**
 * Cohen's d effect size with Hedges' g correction.
 *
 * Cohen's d measures the standardized difference between two group means.
 * Hedges' g applies a correction factor for small-sample bias.
 */
function computeEffectSize(natural: number[], tscg: number[]): EffectSize {
  const n1 = natural.length;
  const n2 = tscg.length;

  if (n1 < 2 || n2 < 2) {
    return { cohens_d: 0, interpretation: 'negligible', hedges_g: 0 };
  }

  const m1 = mean(natural);
  const m2 = mean(tscg);
  const s1 = stddev(natural);
  const s2 = stddev(tscg);

  // Pooled standard deviation
  const pooled = Math.sqrt(
    ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2),
  );

  if (pooled === 0) {
    return { cohens_d: 0, interpretation: 'negligible', hedges_g: 0 };
  }

  const d = (m2 - m1) / pooled;

  // Hedges' g correction factor: J = 1 - 3 / (4(n1+n2-2) - 1)
  const df = n1 + n2 - 2;
  const J = 1 - 3 / (4 * df - 1);
  const g = d * J;

  const absD = Math.abs(d);
  let interpretation: EffectSize['interpretation'] = 'negligible';
  if (absD >= 0.8) interpretation = 'large';
  else if (absD >= 0.5) interpretation = 'medium';
  else if (absD >= 0.2) interpretation = 'small';

  return {
    cohens_d: round4(d),
    interpretation,
    hedges_g: round4(g),
  };
}

/**
 * Compute ARR (Accuracy Retention Rate) with bootstrap CI.
 *
 * ARR = accuracy_tscg / accuracy_natural * 100
 * Target: >= 99.5%
 */
function computeARRWithCI(
  naturalScores: number[],
  tscgScores: number[],
): ARRResult {
  const naturalAcc = mean(naturalScores);
  const tscgAcc = mean(tscgScores);
  const arr = naturalAcc > 0 ? tscgAcc / naturalAcc : 0;
  const arrPct = arr * 100;

  // Bootstrap CI for ARR
  const n = Math.min(naturalScores.length, tscgScores.length);
  let seed = 137;
  function nextRand(): number {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const bootstrapARRs: number[] = [];
  const nResamples = 1000;

  for (let r = 0; r < nResamples; r++) {
    let natSum = 0;
    let tscgSum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRand() * n);
      natSum += naturalScores[idx];
      tscgSum += tscgScores[idx];
    }
    const natMean = natSum / n;
    const tscgMean = tscgSum / n;
    bootstrapARRs.push(natMean > 0 ? (tscgMean / natMean) * 100 : 0);
  }

  bootstrapARRs.sort((a, b) => a - b);
  const lowerIdx = Math.floor(0.025 * nResamples);
  const upperIdx = Math.floor(0.975 * nResamples) - 1;

  return {
    arr: round4(arr),
    arr_pct: round2(arrPct),
    arr_meets_target: arrPct >= 99.5,
    natural_accuracy: round4(naturalAcc),
    tscg_accuracy: round4(tscgAcc),
    bootstrap_ci: {
      mean: round2(arrPct),
      ci_lower: round2(bootstrapARRs[Math.max(0, lowerIdx)]),
      ci_upper: round2(bootstrapARRs[Math.min(nResamples - 1, upperIdx)]),
      se: round4(stddev(bootstrapARRs)),
      n_resamples: nResamples,
    },
  };
}

// ============================================================
// Utility Functions
// ============================================================

function round2(x: number): number { return Math.round(x * 100) / 100; }
function round4(x: number): number { return Math.round(x * 10000) / 10000; }
function round6(x: number): number { return Math.round(x * 1000000) / 1000000; }

/** Standard normal CDF approximation (Abramowitz & Stegun 26.2.17) */
function normalCDF(x: number): number {
  if (x < 0) return 1 - normalCDF(-x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + y);
}

/**
 * Approximate two-tailed p-value from t-distribution.
 * Uses the relationship between t and normal for larger df.
 */
function approxTwoTailedP(absT: number, df: number): number {
  // Convert t to z via Cornish-Fisher approximation
  const z = absT * Math.sqrt(df / (df + absT * absT));
  return 2 * (1 - normalCDF(z));
}

/**
 * Holm-Bonferroni multiple comparison correction (FIX-02).
 *
 * Adjusts p-values for multiple hypothesis testing. Sorts tests by p-value,
 * multiplies each by (m - rank), enforces monotonicity, and marks significance
 * at alpha = 0.05 on corrected values.
 */
function holmBonferroni(tests: Array<{ id: string; p: number }>): HolmBonferroniResult[] {
  const sorted = [...tests].sort((a, b) => a.p - b.p);
  const m = sorted.length;

  const results: HolmBonferroniResult[] = sorted.map((test, i) => {
    const corrected = Math.min(1, test.p * (m - i));
    return {
      id: test.id,
      p_raw: round6(test.p),
      p_corrected: round6(corrected),
      significant: corrected < 0.05,
    };
  });

  // Enforce monotonicity: corrected p-values must be non-decreasing
  for (let i = 1; i < results.length; i++) {
    results[i].p_corrected = Math.max(results[i].p_corrected, results[i - 1].p_corrected);
    results[i].significant = results[i].p_corrected < 0.05;
  }

  return results;
}

function inferScenarioFromTaskId(taskId: string): Scenario {
  const upper = taskId.toUpperCase();
  if (upper.startsWith('GSM8K') || upper.startsWith('GSM')) return 'GSM8K';
  for (const s of ['A', 'B', 'C', 'D', 'E'] as Scenario[]) {
    if (upper.startsWith(`${s}-`) || upper.startsWith(`${s}_`) || upper.startsWith(`TAB-${s}`)) return s;
  }
  const first = upper.charAt(0);
  if ('ABCDE'.includes(first)) return first as Scenario;
  return 'A';
}

// ============================================================
// Result Loading
// ============================================================

function loadAllResults(inputDir: string, verbose: boolean): TaskResult[] {
  const results: TaskResult[] = [];

  if (!existsSync(inputDir)) {
    if (verbose) console.log(`  Input directory not found: ${inputDir}`);
    return results;
  }

  const entries = readdirSync(inputDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(inputDir, entry.name);

    if (entry.isDirectory() && entry.name !== 'analysis') {
      // Recurse into subdirectories
      try {
        const subEntries = readdirSync(fullPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isFile() && sub.name.endsWith('.json') && !sub.name.includes('dry-run')) {
            const loaded = tryParseResults(join(fullPath, sub.name), verbose);
            results.push(...loaded);
          }
        }
      } catch { /* skip unreadable dirs */ }
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('dry-run')) {
      const loaded = tryParseResults(fullPath, verbose);
      results.push(...loaded);
    }
  }

  // Deduplicate by result_id
  const seen = new Set<string>();
  const deduped: TaskResult[] = [];
  for (const r of results) {
    if (!seen.has(r.result_id)) {
      seen.add(r.result_id);
      deduped.push(r);
    }
  }

  return deduped;
}

function tryParseResults(filepath: string, verbose: boolean): TaskResult[] {
  try {
    const raw = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw) as unknown;

    if (data && typeof data === 'object' && 'results' in data) {
      const report = data as BenchmarkReport;
      if (Array.isArray(report.results) && report.results.length > 0) {
        if (verbose) console.log(`    Loaded ${report.results.length} results from ${basename(filepath)}`);
        return report.results;
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      if (verbose) console.log(`    Loaded ${data.length} results from ${basename(filepath)}`);
      return data as TaskResult[];
    }
  } catch { /* skip invalid files */ }

  return [];
}

// ============================================================
// Placeholder Data Generation
// ============================================================

/**
 * Generate realistic placeholder data when no real results exist.
 *
 * Simulates expected outcomes based on paper targets:
 *   - Frontier models: 95-100% accuracy on natural, ARR > 99.5%
 *   - Small models: 70-90% accuracy, slight ARR reduction at scale
 *   - Token savings: 65-75% depending on scenario
 */
function generatePlaceholderResults(): TaskResult[] {
  const results: TaskResult[] = [];
  let seed = 12345;

  function seededRandom(): number {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const modelProfiles: Record<string, {
    baseAccuracy: number;
    tscgRetention: number;
    scaleDegradation: number;
    tokenMultiplier: number;
  }> = {
    'claude-sonnet-4-20250514':  { baseAccuracy: 0.98, tscgRetention: 0.995, scaleDegradation: 0.002, tokenMultiplier: 1.0 },
    'gpt-4o-2024-11-20':         { baseAccuracy: 0.96, tscgRetention: 0.993, scaleDegradation: 0.003, tokenMultiplier: 1.0 },
    'gpt-4.1-mini-2025-04-14':   { baseAccuracy: 0.88, tscgRetention: 0.990, scaleDegradation: 0.008, tokenMultiplier: 0.6 },
    'gemini-2.5-flash':          { baseAccuracy: 0.92, tscgRetention: 0.992, scaleDegradation: 0.005, tokenMultiplier: 0.8 },
    'llama-3.3-70b':             { baseAccuracy: 0.82, tscgRetention: 0.985, scaleDegradation: 0.012, tokenMultiplier: 0.5 },
    'qwen-2.5-72b':              { baseAccuracy: 0.80, tscgRetention: 0.983, scaleDegradation: 0.015, tokenMultiplier: 0.5 },
  };

  const scenarioToolCounts: Record<string, number> = {
    A: 16,    // Claude Code
    B: 43,    // MCP
    C: 50,    // Synthetic (median)
    D: 15,    // BFCL
    E: 20,    // Multi-agent
    GSM8K: 25, // Schema load (median)
  };

  const conditions: Condition[] = ['natural', 'tscg', 'tscg_sad'];
  const tasksPerCondition = 20;

  for (const model of BENCHMARK_MODELS) {
    const profile = modelProfiles[model];
    if (!profile) continue;

    for (const scenario of SCENARIOS) {
      const toolCount = scenarioToolCounts[scenario] || 20;
      const scaleFactor = Math.max(0, 1 - profile.scaleDegradation * Math.log2(toolCount / 10));

      for (const condition of conditions) {
        // Skip tscg_sad for non-Claude models (Decision D16)
        if (condition === 'tscg_sad' && !model.includes('claude')) continue;

        for (let t = 0; t < tasksPerCondition; t++) {
          const baseAcc = profile.baseAccuracy * scaleFactor;
          let accuracy: number;

          if (condition === 'natural') {
            accuracy = seededRandom() < baseAcc ? 1 : 0;
          } else {
            const retention = condition === 'tscg_sad' ? profile.tscgRetention + 0.002 : profile.tscgRetention;
            accuracy = seededRandom() < (baseAcc * retention) ? 1 : 0;
          }

          const naturalTokens = toolCount * 150 * profile.tokenMultiplier;
          const savingsRate = condition === 'natural' ? 0 : (condition === 'tscg' ? 0.70 : 0.75);
          const inputTokens = Math.round(naturalTokens * (1 - savingsRate));

          results.push({
            result_id: `placeholder-${model}-${scenario}-${condition}-${t}`,
            task_id: `${scenario}-${String(t + 1).padStart(3, '0')}`,
            model,
            condition,
            run: 1,
            response: {
              raw_output: '[placeholder]',
              parse_success: true,
            },
            scores: {
              tool_selection_accuracy: accuracy,
              parameter_f1: accuracy * (0.85 + seededRandom() * 0.15),
              overall: accuracy,
              ...(scenario === 'GSM8K' ? { gsm8k_correct: accuracy === 1 } : {}),
            },
            metrics: {
              input_tokens: inputTokens,
              output_tokens: Math.round(50 + seededRandom() * 100),
              total_latency_ms: Math.round(200 + seededRandom() * 800),
              cost_usd: inputTokens * 0.000003 + 75 * 0.000015,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  return results;
}

// ============================================================
// Analysis Engine
// ============================================================

function runAnalysis(results: TaskResult[], dataSource: 'real' | 'placeholder'): OverallStatistics {
  // Group results by (model, scenario, condition)
  const groups = new Map<string, TaskResult[]>();
  for (const r of results) {
    const scenario = inferScenarioFromTaskId(r.task_id);
    const key = `${r.model}::${scenario}::${r.condition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // Find all unique (model, scenario) pairs
  const modelScenarioPairs = new Map<string, Set<string>>();
  for (const key of groups.keys()) {
    const [model, scenario, condition] = key.split('::');
    const pairKey = `${model}::${scenario}`;
    if (!modelScenarioPairs.has(pairKey)) modelScenarioPairs.set(pairKey, new Set());
    modelScenarioPairs.get(pairKey)!.add(condition);
  }

  const comparisons: ScenarioComparison[] = [];

  for (const [pairKey, conditions] of modelScenarioPairs) {
    const [model, scenario] = pairKey.split('::');
    if (!conditions.has('natural')) continue;

    const naturalResults = groups.get(`${model}::${scenario}::natural`) ?? [];
    const naturalScores = naturalResults.map(r => r.scores.overall);
    const naturalCorrect = naturalResults.map(r => r.scores.overall >= 0.5);

    for (const cond of ['tscg', 'tscg_sad'] as Condition[]) {
      if (!conditions.has(cond)) continue;

      const tscgResults = groups.get(`${model}::${scenario}::${cond}`) ?? [];
      const tscgScores = tscgResults.map(r => r.scores.overall);
      const tscgCorrect = tscgResults.map(r => r.scores.overall >= 0.5);

      const nPairs = Math.min(naturalScores.length, tscgScores.length);
      if (nPairs < 2) continue;

      // Token savings
      const naturalTokens = naturalResults.reduce((s, r) => s + r.metrics.input_tokens, 0);
      const tscgTokens = tscgResults.reduce((s, r) => s + r.metrics.input_tokens, 0);
      const tokenSavings = naturalTokens > 0
        ? ((naturalTokens - tscgTokens) / naturalTokens) * 100
        : 0;

      comparisons.push({
        scenario: scenario as Scenario,
        model,
        condition: cond,
        n_tasks: nPairs,
        natural_accuracy: round4(mean(naturalScores)),
        tscg_accuracy: round4(mean(tscgScores)),
        paired_t_test: pairedTTest(naturalScores, tscgScores),
        mcnemar: mcnemarsTest(naturalCorrect, tscgCorrect),
        bootstrap_accuracy: bootstrapCI(tscgScores),
        effect_size: computeEffectSize(naturalScores, tscgScores),
        arr: computeARRWithCI(naturalScores, tscgScores),
        token_savings_pct: round2(tokenSavings),
      });
    }
  }

  // Per-scenario summary
  const scenarioDescriptions: Record<string, string> = {
    A: 'Claude Code (16 tools)',
    B: 'MCP Servers (43 tools)',
    C: 'Scaling (3-100 tools)',
    D: 'BFCL (15 tools)',
    E: 'Multi-Collection Stress',
    GSM8K: 'Math Reasoning Under Schema Load',
  };

  const perScenarioSummary: ScenarioSummary[] = [];

  for (const scenario of SCENARIOS) {
    const scenarioComps = comparisons.filter(c => c.scenario === scenario);
    if (scenarioComps.length === 0) continue;

    const tscgComps = scenarioComps.filter(c => c.condition === 'tscg');
    const tscgSadComps = scenarioComps.filter(c => c.condition === 'tscg_sad');

    perScenarioSummary.push({
      scenario,
      description: scenarioDescriptions[scenario] || scenario,
      n_models: new Set(scenarioComps.map(c => c.model)).size,
      mean_arr_tscg: tscgComps.length > 0 ? round2(mean(tscgComps.map(c => c.arr.arr_pct))) : 0,
      mean_arr_tscg_sad: tscgSadComps.length > 0 ? round2(mean(tscgSadComps.map(c => c.arr.arr_pct))) : 0,
      mean_token_savings: round2(mean(scenarioComps.map(c => c.token_savings_pct))),
      all_significant: scenarioComps.every(c => c.paired_t_test.significant_at_05 || c.paired_t_test.p_value >= 0.05),
      mean_cohens_d: round4(mean(scenarioComps.map(c => c.effect_size.cohens_d))),
    });
  }

  // Overall summary
  const allModels = [...new Set(comparisons.map(c => c.model))];
  const allScenarios = [...new Set(comparisons.map(c => c.scenario))];

  let largest = { model: '', scenario: '', cohens_d: -Infinity };
  let smallest = { model: '', scenario: '', cohens_d: Infinity };
  for (const c of comparisons) {
    if (Math.abs(c.effect_size.cohens_d) > Math.abs(largest.cohens_d)) {
      largest = { model: c.model, scenario: c.scenario, cohens_d: c.effect_size.cohens_d };
    }
    if (Math.abs(c.effect_size.cohens_d) < Math.abs(smallest.cohens_d)) {
      smallest = { model: c.model, scenario: c.scenario, cohens_d: c.effect_size.cohens_d };
    }
  }

  // Holm-Bonferroni correction across all McNemar p-values (FIX-02)
  const mcnemarTests = comparisons.map(c => ({
    id: `${c.scenario}::${c.model}::${c.condition}`,
    p: c.mcnemar.p_value,
  }));
  const correctedTests = holmBonferroni(mcnemarTests);
  const multipleComparisons: MultipleComparisons = {
    method: 'Holm-Bonferroni',
    totalTests: correctedTests.length,
    significantAfterCorrection: correctedTests.filter(t => t.significant).length,
    tests: correctedTests,
  };

  return {
    timestamp: new Date().toISOString(),
    data_source: dataSource,
    models: allModels,
    scenarios: allScenarios as Scenario[],
    comparisons,
    per_scenario_summary: perScenarioSummary,
    multipleComparisons,
    overall_summary: {
      total_comparisons: comparisons.length,
      significant_at_05_count: comparisons.filter(c => c.paired_t_test.significant_at_05).length,
      significant_at_01_count: comparisons.filter(c => c.paired_t_test.significant_at_01).length,
      mean_arr_all: round2(mean(comparisons.map(c => c.arr.arr_pct))),
      mean_cohens_d_all: round4(mean(comparisons.map(c => c.effect_size.cohens_d))),
      mean_token_savings_all: round2(mean(comparisons.map(c => c.token_savings_pct))),
      arr_below_99_count: comparisons.filter(c => c.arr.arr_pct < 99).length,
      largest_effect: comparisons.length > 0 ? largest : { model: '', scenario: '', cohens_d: 0 },
      smallest_effect: comparisons.length > 0 ? smallest : { model: '', scenario: '', cohens_d: 0 },
    },
  };
}

// ============================================================
// LaTeX Table Generation
// ============================================================

function generateStatisticsLatex(stats: OverallStatistics): string {
  const lines: string[] = [
    '% Auto-generated by TAB statistics.ts',
    `% Generated: ${stats.timestamp}`,
    `% Data source: ${stats.data_source}`,
    '',
  ];

  // Table 1: Per-scenario paired t-test and effect sizes
  lines.push(
    '\\begin{table*}[htbp]',
    '  \\centering',
    '  \\caption{Statistical Significance of TSCG Compression on Accuracy Retention}',
    '  \\label{tab:statistical-tests}',
    '  \\small',
    '  \\begin{tabular}{llcccccccc}',
    '    \\toprule',
    '    Scenario & Model & Cond. & Nat. Acc. & TSCG Acc. & ARR & $d$ & $t$ & $p$ & McNemar \\\\',
    '    \\midrule',
  );

  let lastScenario = '';
  for (const c of stats.comparisons) {
    if (lastScenario && c.scenario !== lastScenario) {
      lines.push('    \\addlinespace');
    }
    lastScenario = c.scenario;

    const condStr = c.condition === 'tscg' ? 'TSCG' : 'TSCG+SAD';
    const natAcc = `${(c.natural_accuracy * 100).toFixed(1)}\\%`;
    const tscgAcc = `${(c.tscg_accuracy * 100).toFixed(1)}\\%`;
    const arrStr = `${c.arr.arr_pct.toFixed(1)}\\%`;
    const dStr = `${c.effect_size.cohens_d.toFixed(3)}`;
    const tStr = `${c.paired_t_test.t_statistic.toFixed(2)}`;
    const pStr = c.paired_t_test.p_value < 0.001 ? '$<$0.001'
      : `${c.paired_t_test.p_value.toFixed(3)}`;
    const mcnStr = c.mcnemar.p_value < 0.001 ? '$<$0.001'
      : `${c.mcnemar.p_value.toFixed(3)}`;

    const modelShort = escapeLatex(c.model.replace(/-\d{4}-\d{2}-\d{2}$/, ''));

    lines.push(
      `    ${c.scenario} & ${modelShort} & ${condStr} & ${natAcc} & ${tscgAcc} & ${arrStr} & ${dStr} & ${tStr} & ${pStr} & ${mcnStr} \\\\`,
    );
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '  \\vspace{2mm}',
    '  \\footnotesize{$d$ = Cohen\'s $d$ effect size. McNemar = McNemar\'s test $p$-value for binary accuracy.}',
    '\\end{table*}',
    '',
  );

  // Table 2: Per-scenario ARR summary
  lines.push(
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Accuracy Retention Rate (ARR) by Scenario}',
    '  \\label{tab:arr-scenario}',
    '  \\begin{tabular}{lcccc}',
    '    \\toprule',
    '    Scenario & \\# Models & ARR (TSCG) & ARR (SAD) & Token Savings \\\\',
    '    \\midrule',
  );

  for (const s of stats.per_scenario_summary) {
    const arrTscg = s.mean_arr_tscg > 0 ? `${s.mean_arr_tscg.toFixed(1)}\\%` : '---';
    const arrSad = s.mean_arr_tscg_sad > 0 ? `${s.mean_arr_tscg_sad.toFixed(1)}\\%` : '---';
    const savings = `${s.mean_token_savings.toFixed(1)}\\%`;
    lines.push(`    ${s.scenario} & ${s.n_models} & ${arrTscg} & ${arrSad} & ${savings} \\\\`);
  }

  lines.push(
    '    \\midrule',
    `    \\textbf{Overall} & --- & \\textbf{${stats.overall_summary.mean_arr_all.toFixed(1)}\\%} & --- & \\textbf{${stats.overall_summary.mean_token_savings_all.toFixed(1)}\\%} \\\\`,
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
    '',
  );

  // Table 3: Bootstrap CI for key comparisons
  lines.push(
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Bootstrap 95\\% Confidence Intervals for Accuracy (1000 resamples)}',
    '  \\label{tab:bootstrap-ci}',
    '  \\begin{tabular}{llccc}',
    '    \\toprule',
    '    Model & Scenario & Mean Acc. & CI$_{95}$ Lower & CI$_{95}$ Upper \\\\',
    '    \\midrule',
  );

  // Only show TSCG condition bootstrap CIs
  const tscgComparisons = stats.comparisons.filter(c => c.condition === 'tscg');
  for (const c of tscgComparisons) {
    const modelShort = escapeLatex(c.model.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
    const meanAcc = `${(c.bootstrap_accuracy.mean * 100).toFixed(1)}\\%`;
    const ciLow = `${(c.bootstrap_accuracy.ci_lower * 100).toFixed(1)}\\%`;
    const ciHigh = `${(c.bootstrap_accuracy.ci_upper * 100).toFixed(1)}\\%`;
    lines.push(`    ${modelShort} & ${c.scenario} & ${meanAcc} & ${ciLow} & ${ciHigh} \\\\`);
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
  );

  return lines.join('\n');
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, match => '\\' + match)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// ============================================================
// Console Output
// ============================================================

function printStatisticsSummary(stats: OverallStatistics): void {
  const w = 90;
  console.log('\n' + '='.repeat(w));
  console.log('  TAB DEEP STATISTICAL ANALYSIS');
  console.log('='.repeat(w));

  console.log(`\n  Data source:      ${stats.data_source}`);
  console.log(`  Models:           ${stats.models.length}`);
  console.log(`  Scenarios:        ${stats.scenarios.join(', ')}`);
  console.log(`  Comparisons:      ${stats.comparisons.length}`);

  // Per-scenario summary
  console.log('\n  ' + '-'.repeat(w - 2));
  console.log('  PER-SCENARIO ARR');
  console.log('  ' + '-'.repeat(w - 2));

  for (const s of stats.per_scenario_summary) {
    const arrStr = s.mean_arr_tscg > 0 ? `${s.mean_arr_tscg.toFixed(1)}%` : 'N/A';
    console.log(`  ${s.scenario.padEnd(8)} ${s.description.padEnd(35)} ARR: ${arrStr.padStart(7)}  Savings: ${s.mean_token_savings.toFixed(1)}%`);
  }

  // Overall
  console.log('\n  ' + '-'.repeat(w - 2));
  console.log('  OVERALL');
  console.log('  ' + '-'.repeat(w - 2));
  console.log(`  Mean ARR (all):           ${stats.overall_summary.mean_arr_all.toFixed(1)}%`);
  console.log(`  Mean Cohen's d:           ${stats.overall_summary.mean_cohens_d_all.toFixed(4)}`);
  console.log(`  Mean token savings:       ${stats.overall_summary.mean_token_savings_all.toFixed(1)}%`);
  console.log(`  Significant at p<0.05:    ${stats.overall_summary.significant_at_05_count}/${stats.overall_summary.total_comparisons}`);
  console.log(`  Significant at p<0.01:    ${stats.overall_summary.significant_at_01_count}/${stats.overall_summary.total_comparisons}`);
  console.log(`  ARR below 99%:            ${stats.overall_summary.arr_below_99_count}`);

  if (stats.overall_summary.largest_effect.model) {
    console.log(`  Largest effect:           ${stats.overall_summary.largest_effect.model} / ${stats.overall_summary.largest_effect.scenario} (d=${stats.overall_summary.largest_effect.cohens_d.toFixed(3)})`);
  }

  console.log('\n' + '='.repeat(w) + '\n');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const opts = parseCliArgs();

  console.log('\n  TAB Deep Statistical Analysis');
  console.log('  ' + '-'.repeat(40));
  console.log(`  Input:  ${opts.inputDir}`);
  console.log(`  Output: ${opts.outputDir}`);

  // Load or generate results
  let results: TaskResult[];
  let dataSource: 'real' | 'placeholder';

  if (opts.usePlaceholder) {
    console.log('\n  [1/3] Generating placeholder data...');
    results = generatePlaceholderResults();
    dataSource = 'placeholder';
    console.log(`  Generated ${results.length} placeholder results`);
  } else {
    console.log('\n  [1/3] Loading result files...');
    results = loadAllResults(opts.inputDir, opts.verbose);

    if (results.length === 0) {
      console.log('  No real results found. Using placeholder data.');
      console.log('  (Run with --use-placeholder to suppress this message)');
      results = generatePlaceholderResults();
      dataSource = 'placeholder';
      console.log(`  Generated ${results.length} placeholder results`);
    } else {
      dataSource = 'real';
      console.log(`  Loaded ${results.length} results`);
    }
  }

  // Run analysis
  console.log('\n  [2/3] Running statistical analysis...');
  const stats = runAnalysis(results, dataSource);
  console.log(`  Computed ${stats.comparisons.length} comparisons across ${stats.models.length} models`);

  // Write outputs
  console.log('\n  [3/3] Writing output files...');
  mkdirSync(opts.outputDir, { recursive: true });

  const statsPath = join(opts.outputDir, 'statistics.json');
  writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  console.log(`  [JSON] ${statsPath}`);

  const latexPath = join(opts.outputDir, 'statistics-tables.tex');
  writeFileSync(latexPath, generateStatisticsLatex(stats), 'utf-8');
  console.log(`  [TeX]  ${latexPath}`);

  // Console output
  printStatisticsSummary(stats);
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
