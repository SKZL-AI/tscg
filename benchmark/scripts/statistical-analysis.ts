/**
 * Wave 3.1 / 2.15: Comprehensive Statistical Analysis
 *
 * Computes for ALL model × scenario × condition pairs:
 * - Bootstrap 95% CIs (1000 resamples, seed=42)
 * - McNemar's test (paired binary outcomes)
 * - Cohen's d effect sizes
 * - Holm-Bonferroni corrected p-values
 *
 * Output: benchmark/results/analysis/statistics-v2.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Types
// ============================================================

interface TaskResult {
  task_id: string;
  model: string;
  condition: string;
  run: number;
  accuracy: number; // binary 0/1
  param_f1: number;
  overall: number;
  scenario: string;
  source: string; // frontier, small-models, bfcl, gsm8k, etc.
  catalog_size?: number;
}

interface PairComparison {
  model: string;
  scenario: string;
  catalog_size?: number;
  condition_a: string;
  condition_b: string;
  n_tasks: number;
  accuracy_a: number;
  accuracy_b: number;
  delta_pp: number;
  bootstrap_ci_delta: [number, number];
  mcnemar_p: number;
  cohens_d: number;
  effect_label: string; // small, medium, large
}

interface StatisticsOutput {
  meta: {
    generated_at: string;
    seed: number;
    n_bootstrap: number;
    total_comparisons: number;
    total_results_loaded: number;
  };
  comparisons: PairComparison[];
  holm_bonferroni: {
    comparison_id: string;
    raw_p: number;
    adjusted_p: number;
    significant: boolean;
  }[];
  summary: {
    total_significant: number;
    total_comparisons: number;
    alpha: number;
  };
}

// ============================================================
// Seeded RNG (Mulberry32)
// ============================================================

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Data Loading
// ============================================================

function loadResults(baseDir: string): TaskResult[] {
  const all: TaskResult[] = [];

  // 1. Frontier results (Scenarios A, B, C, E)
  for (const scenario of ['a', 'b', 'c', 'e']) {
    const dir = path.join(baseDir, 'frontier', scenario);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('tab-') && f.endsWith('.json') && !f.includes('aggregates'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (data.results) {
        for (const r of data.results) {
          all.push({
            task_id: r.task_id,
            model: r.model,
            condition: r.condition,
            run: r.run,
            accuracy: r.scores?.tool_selection_accuracy ?? 0,
            param_f1: r.scores?.parameter_f1 ?? 0,
            overall: r.scores?.overall ?? 0,
            scenario: scenario.toUpperCase(),
            source: 'frontier',
          });
        }
      }
    }
  }

  // 2. Frontier natural-text results
  for (const scenario of ['a', 'b']) {
    const dir = path.join(baseDir, 'frontier-natural-text', scenario, scenario);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('tab-') && f.endsWith('.json') && !f.includes('aggregates'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (data.results) {
        for (const r of data.results) {
          all.push({
            task_id: r.task_id,
            model: r.model,
            condition: r.condition,
            run: r.run,
            accuracy: r.scores?.tool_selection_accuracy ?? 0,
            param_f1: r.scores?.parameter_f1 ?? 0,
            overall: r.scores?.overall ?? 0,
            scenario: scenario.toUpperCase(),
            source: 'frontier-natural-text',
          });
        }
      }
    }
  }

  // 3. Small-models results
  const smallDir = path.join(baseDir, 'small-models');
  if (fs.existsSync(smallDir)) {
    const subdirs = fs.readdirSync(smallDir).filter(d => {
      const full = path.join(smallDir, d);
      return fs.statSync(full).isDirectory() && d.includes('_');
    });
    for (const subdir of subdirs) {
      const match = subdir.match(/^(.+?)_(\d+)tools$/);
      if (!match) continue;
      const catalogSize = parseInt(match[2]);
      const reportPath = path.join(smallDir, subdir, 'report.json');
      if (!fs.existsSync(reportPath)) continue;
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      if (data.results) {
        for (const r of data.results) {
          all.push({
            task_id: r.task_id,
            model: r.model,
            condition: r.condition,
            run: r.run,
            accuracy: r.scores?.tool_selection_accuracy ?? 0,
            param_f1: r.scores?.parameter_f1 ?? 0,
            overall: r.scores?.overall ?? 0,
            scenario: 'D',
            source: 'small-models',
            catalog_size: catalogSize,
          });
        }
      }
    }
  }

  // 4. BFCL results
  const bfclPath = path.join(baseDir, 'bfcl', 'bfcl-results.json');
  if (fs.existsSync(bfclPath)) {
    const data = JSON.parse(fs.readFileSync(bfclPath, 'utf-8'));
    if (data.results) {
      for (const r of data.results) {
        all.push({
          task_id: r.task_id,
          model: r.model,
          condition: r.condition,
          run: r.run,
          accuracy: r.scores?.tool_selection_accuracy ?? 0,
          param_f1: r.scores?.parameter_f1 ?? 0,
          overall: r.scores?.overall ?? 0,
          scenario: 'BFCL',
          source: 'bfcl',
        });
      }
    }
  }

  // 5. GSM8K results
  const gsm8kDir = path.join(baseDir, 'gsm8k');
  if (fs.existsSync(gsm8kDir)) {
    const subdirs = fs.readdirSync(gsm8kDir).filter(d => {
      const full = path.join(gsm8kDir, d);
      return fs.statSync(full).isDirectory();
    });
    for (const subdir of subdirs) {
      const reportPath = path.join(gsm8kDir, subdir, 'report.json');
      if (!fs.existsSync(reportPath)) continue;
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      if (data.results) {
        for (const r of data.results) {
          const correct = r.scores?.gsm8k_correct ?? r.scores?.overall ?? 0;
          all.push({
            task_id: r.task_id,
            model: r.model,
            condition: r.condition,
            run: r.run,
            accuracy: typeof correct === 'boolean' ? (correct ? 1 : 0) : correct,
            param_f1: 0,
            overall: typeof correct === 'boolean' ? (correct ? 1 : 0) : correct,
            scenario: 'GSM8K',
            source: 'gsm8k',
          });
        }
      }
    }
  }

  return all;
}

// ============================================================
// Statistical Functions
// ============================================================

/** Bootstrap 95% CI for a mean */
function bootstrapCI(
  values: number[],
  nResamples: number,
  rng: () => number,
): [number, number] {
  if (values.length === 0) return [0, 0];
  const means: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      sum += values[Math.floor(rng() * values.length)];
    }
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(nResamples * 0.025)];
  const hi = means[Math.floor(nResamples * 0.975)];
  return [Math.round(lo * 10000) / 10000, Math.round(hi * 10000) / 10000];
}

/** Bootstrap 95% CI for a difference in means */
function bootstrapDeltaCI(
  valuesA: number[],
  valuesB: number[],
  nResamples: number,
  rng: () => number,
): [number, number] {
  if (valuesA.length === 0 || valuesB.length === 0) return [0, 0];
  const deltas: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    let sumA = 0, sumB = 0;
    for (let j = 0; j < valuesA.length; j++) {
      sumA += valuesA[Math.floor(rng() * valuesA.length)];
    }
    for (let j = 0; j < valuesB.length; j++) {
      sumB += valuesB[Math.floor(rng() * valuesB.length)];
    }
    deltas.push(sumB / valuesB.length - sumA / valuesA.length);
  }
  deltas.sort((a, b) => a - b);
  const lo = deltas[Math.floor(nResamples * 0.025)];
  const hi = deltas[Math.floor(nResamples * 0.975)];
  return [Math.round(lo * 10000) / 10000, Math.round(hi * 10000) / 10000];
}

/** McNemar's test for paired binary outcomes */
function mcnemarTest(
  pairsA: number[],
  pairsB: number[],
): number {
  // Count discordant pairs
  let b = 0; // A wrong, B right
  let c = 0; // A right, B wrong
  const n = Math.min(pairsA.length, pairsB.length);
  for (let i = 0; i < n; i++) {
    if (pairsA[i] === 0 && pairsB[i] === 1) b++;
    if (pairsA[i] === 1 && pairsB[i] === 0) c++;
  }
  if (b + c === 0) return 1.0; // No discordant pairs
  // McNemar with continuity correction
  const chi2 = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  // Approximate p-value from chi-squared(1) using normal approximation
  return chi2ToPValue(chi2);
}

/** Chi-squared(1) to p-value approximation */
function chi2ToPValue(chi2: number): number {
  if (chi2 <= 0) return 1.0;
  // Using the normal approximation: p = 2*(1-Phi(sqrt(chi2)))
  const z = Math.sqrt(chi2);
  return 2 * (1 - normalCDF(z));
}

/** Standard normal CDF approximation (Abramowitz and Stegun) */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

/** Cohen's d effect size */
function cohensD(valuesA: number[], valuesB: number[]): number {
  const meanA = valuesA.reduce((s, v) => s + v, 0) / valuesA.length;
  const meanB = valuesB.reduce((s, v) => s + v, 0) / valuesB.length;
  const varA = valuesA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (valuesA.length - 1);
  const varB = valuesB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (valuesB.length - 1);
  const pooledSD = Math.sqrt((varA + varB) / 2);
  if (pooledSD === 0) return 0;
  return (meanB - meanA) / pooledSD;
}

function effectLabel(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}

/** Holm-Bonferroni correction (with running-max monotonicity enforcement) */
function holmBonferroni(
  pValues: { id: string; p: number }[],
  alpha: number = 0.05,
): { id: string; raw_p: number; adjusted_p: number; significant: boolean }[] {
  const sorted = [...pValues].sort((a, b) => a.p - b.p);
  const m = sorted.length;
  const results: { id: string; raw_p: number; adjusted_p: number; significant: boolean }[] = [];
  for (let i = 0; i < m; i++) {
    let adjusted = Math.min(sorted[i].p * (m - i), 1.0);
    // Enforce monotonicity: adjusted p-values must be non-decreasing
    if (i > 0 && adjusted < results[i - 1].adjusted_p) {
      adjusted = results[i - 1].adjusted_p;
    }
    results.push({
      id: sorted[i].id,
      raw_p: sorted[i].p,
      adjusted_p: Math.round(adjusted * 100000) / 100000,
      significant: adjusted < alpha,
    });
  }
  return results;
}

// ============================================================
// Main Analysis
// ============================================================

function main() {
  const SEED = 42;
  const N_BOOTSTRAP = 1000;
  const rng = mulberry32(SEED);

  const resultsDir = path.resolve('benchmark/results');
  console.log('Loading results from:', resultsDir);

  const allResults = loadResults(resultsDir);
  console.log(`Loaded ${allResults.length} total task results`);

  // Group results
  type GroupKey = string;
  const groups = new Map<GroupKey, TaskResult[]>();

  for (const r of allResults) {
    const key = `${r.model}|${r.scenario}|${r.condition}|${r.catalog_size ?? 'all'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  console.log(`Found ${groups.size} unique model×scenario×condition groups`);

  // Build comparisons: for each model×scenario×catalog_size, compare all condition pairs
  const comparisons: PairComparison[] = [];
  const modelScenarios = new Map<string, Set<string>>();

  for (const [key] of groups) {
    const [model, scenario, , catalogSize] = key.split('|');
    const msKey = `${model}|${scenario}|${catalogSize}`;
    if (!modelScenarios.has(msKey)) modelScenarios.set(msKey, new Set());
    const condition = key.split('|')[2];
    modelScenarios.get(msKey)!.add(condition);
  }

  // Standard comparison pairs
  const COMPARISON_PAIRS: [string, string][] = [
    ['natural', 'tscg'],
    ['natural', 'tscg_sad'],
    ['natural', 'natural_text'],
    ['natural_text', 'tscg'],
    ['natural', 'tscg_conservative'],
    ['tscg_conservative', 'tscg'],
  ];

  for (const [msKey, conditions] of modelScenarios) {
    const [model, scenario, catalogSize] = msKey.split('|');

    for (const [condA, condB] of COMPARISON_PAIRS) {
      if (!conditions.has(condA) || !conditions.has(condB)) continue;

      const keyA = `${model}|${scenario}|${condA}|${catalogSize}`;
      const keyB = `${model}|${scenario}|${condB}|${catalogSize}`;
      const resultsA = groups.get(keyA) ?? [];
      const resultsB = groups.get(keyB) ?? [];

      if (resultsA.length === 0 || resultsB.length === 0) continue;

      // Use composite overall score (0.6×TSA + 0.4×param_F1) to match paper definition (main.tex:199)
      const accA = resultsA.map(r => r.overall);
      const accB = resultsB.map(r => r.overall);
      const meanA = accA.reduce((s, v) => s + v, 0) / accA.length;
      const meanB = accB.reduce((s, v) => s + v, 0) / accB.length;

      // McNemar: need paired per-task results (average across runs first)
      const taskAccA = new Map<string, number>();
      const taskAccB = new Map<string, number>();
      for (const r of resultsA) {
        taskAccA.set(r.task_id, (taskAccA.get(r.task_id) ?? 0) + r.overall);
      }
      for (const r of resultsB) {
        taskAccB.set(r.task_id, (taskAccB.get(r.task_id) ?? 0) + r.overall);
      }
      // Majority vote across runs for McNemar (binary)
      const runsA = resultsA.filter(r => r.task_id === resultsA[0].task_id).length || 1;
      const runsB = resultsB.filter(r => r.task_id === resultsB[0].task_id).length || 1;
      const pairedTasks = [...new Set([...taskAccA.keys()].filter(t => taskAccB.has(t)))];
      const binaryA = pairedTasks.map(t => (taskAccA.get(t)! / runsA) >= 0.5 ? 1 : 0);
      const binaryB = pairedTasks.map(t => (taskAccB.get(t)! / runsB) >= 0.5 ? 1 : 0);

      const p = mcnemarTest(binaryA, binaryB);
      const d = cohensD(accA, accB);
      const deltaCI = bootstrapDeltaCI(accA, accB, N_BOOTSTRAP, rng);

      comparisons.push({
        model,
        scenario,
        catalog_size: catalogSize !== 'all' ? parseInt(catalogSize) : undefined,
        condition_a: condA,
        condition_b: condB,
        n_tasks: pairedTasks.length,
        accuracy_a: Math.round(meanA * 10000) / 10000,
        accuracy_b: Math.round(meanB * 10000) / 10000,
        delta_pp: Math.round((meanB - meanA) * 1000) / 10,
        bootstrap_ci_delta: deltaCI,
        mcnemar_p: Math.round(p * 100000) / 100000,
        cohens_d: Math.round(d * 1000) / 1000,
        effect_label: effectLabel(d),
      });
    }
  }

  console.log(`Computed ${comparisons.length} pairwise comparisons`);

  // Holm-Bonferroni correction
  const pValues = comparisons.map((c, i) => ({
    id: `${c.model}|${c.scenario}|${c.catalog_size ?? 'all'}|${c.condition_a}_vs_${c.condition_b}`,
    p: c.mcnemar_p,
  }));
  const corrected = holmBonferroni(pValues, 0.05);
  const totalSignificant = corrected.filter(c => c.significant).length;

  console.log(`Holm-Bonferroni: ${totalSignificant}/${corrected.length} significant at alpha=0.05`);

  // Build output
  const output: StatisticsOutput = {
    meta: {
      generated_at: new Date().toISOString(),
      seed: SEED,
      n_bootstrap: N_BOOTSTRAP,
      total_comparisons: comparisons.length,
      total_results_loaded: allResults.length,
    },
    comparisons,
    holm_bonferroni: corrected,
    summary: {
      total_significant: totalSignificant,
      total_comparisons: corrected.length,
      alpha: 0.05,
    },
  };

  // Write output
  const outPath = path.join(resultsDir, 'analysis', 'statistics-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nResults written to: ${outPath}`);

  // Print summary table
  console.log('\n' + '='.repeat(100));
  console.log('  STATISTICAL ANALYSIS SUMMARY');
  console.log('='.repeat(100));
  console.log(`  Total results loaded: ${allResults.length}`);
  console.log(`  Unique groups: ${groups.size}`);
  console.log(`  Pairwise comparisons: ${comparisons.length}`);
  console.log(`  Significant (Holm-Bonferroni α=0.05): ${totalSignificant}/${corrected.length}`);
  console.log('');

  // Print top comparisons
  const sorted = [...comparisons].sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp));
  console.log('  TOP 20 COMPARISONS BY |Δ|:');
  console.log('  ' + '-'.repeat(98));
  console.log('  Model                | Scenario | Size | A→B                    | Δpp    | CI95 Δ          | McNemar p | d     | Sig');
  console.log('  ' + '-'.repeat(98));
  for (const c of sorted.slice(0, 20)) {
    const sig = corrected.find(x => x.id.includes(`${c.model}|${c.scenario}|${c.catalog_size ?? 'all'}|${c.condition_a}_vs_${c.condition_b}`));
    console.log(
      `  ${c.model.padEnd(22)}| ${c.scenario.padEnd(9)}| ${String(c.catalog_size ?? '-').padEnd(5)}| ${c.condition_a}→${c.condition_b}`.padEnd(75) +
      `| ${(c.delta_pp >= 0 ? '+' : '') + c.delta_pp.toFixed(1)}pp`.padEnd(9) +
      `| [${c.bootstrap_ci_delta[0].toFixed(3)}, ${c.bootstrap_ci_delta[1].toFixed(3)}]`.padEnd(18) +
      `| ${c.mcnemar_p.toFixed(4)}`.padEnd(12) +
      `| ${c.cohens_d.toFixed(2)}`.padEnd(8) +
      `| ${sig?.significant ? '***' : 'n.s.'}`
    );
  }
  console.log('  ' + '-'.repeat(98));
}

main();
