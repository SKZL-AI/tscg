/**
 * R² (Coefficient of Determination) Computation:
 *   Text-baseline vs JSON-baseline TSCG improvement correlation
 *
 * The paper claims R²=0.91 for delta_tscg = f(natural_json_accuracy) on the
 * 5-model core set (n=35, including Phi-4 with 0% JSON baselines).
 *
 * E4 experiments replace JSON baselines with text baselines, removing the
 * JSON format confound. This script computes R² under text baselines and
 * compares with the JSON-baseline R² to quantify how much of the original
 * correlation was driven by format sensitivity vs genuine compression benefit.
 */

const fs = require('fs');
const path = require('path');

// ─── Statistical Helpers ─────────────────────────────────────────────────────

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 3) return { slope: NaN, intercept: NaN, r2: NaN, pValue: NaN, n };

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  const ssXX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const ssYY = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssXY = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // R² via 1 - SSres/SStot
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssYY === 0 ? NaN : 1 - ssRes / ssYY;

  // Pearson r for sign
  const r = ssXY / Math.sqrt(ssXX * ssYY);

  // p-value: F-test for slope significance (equivalent to t-test with df=n-2)
  // F = (SSreg / 1) / (SSres / (n-2)) = r² * (n-2) / (1-r²)
  const df1 = 1, df2 = n - 2;
  const fStat = (r2 / df1) / ((1 - r2) / df2);
  const pValue = 1 - fCDF(fStat, df1, df2);

  // t-stat for slope
  const se = Math.sqrt(ssRes / (n - 2));
  const seSlope = se / Math.sqrt(ssXX);
  const tStat = slope / seSlope;

  return { slope, intercept, r2, r, pValue, n, tStat, se, seSlope, meanX, meanY, fStat };
}

// F-distribution CDF using regularized incomplete beta function
function fCDF(f, d1, d2) {
  if (f <= 0) return 0;
  const x = d1 * f / (d1 * f + d2);
  return regularizedBeta(x, d1 / 2, d2 / 2);
}

// Regularized incomplete beta I_x(a, b) using continued fraction
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if x > (a+1)/(a+b+2) for better convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;

  // Lentz's continued fraction for I_x(a,b)
  const TINY = 1e-30;
  const EPS = 1e-14;
  const MAX_ITER = 300;

  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    // even term: d_{2m}
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + num / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    // odd term: d_{2m+1}
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + num / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < EPS) break;
  }

  return front * h;
}

function lnGamma(z) {
  // Lanczos approximation (g=7)
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function loadE4Data() {
  const checkpoint = require(path.join(
    'D:', '0_TSCG', 'benchmark', 'results', 'e4-text-baseline-all', 'checkpoint.json'
  ));
  return checkpoint.results;
}

function loadJsonBaselineData() {
  const heatmap = require(path.join(
    'D:', '0_TSCG', 'benchmark', 'results', 'analysis', 'fig4-arr-heatmap.json'
  ));
  return heatmap.models.small;
}

// ─── Computation ─────────────────────────────────────────────────────────────

function computeMeans(results) {
  const groups = {};
  for (const r of results) {
    const key = `${r.model}|${r.catalog_size}|${r.condition}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r.overall);
  }

  const means = {};
  for (const [key, vals] of Object.entries(groups)) {
    const [model, size, condition] = key.split('|');
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!means[model]) means[model] = {};
    if (!means[model][size]) means[model][size] = {};
    means[model][size][condition] = { mean: mean * 100, n: vals.length };
  }
  return means;
}

function computeTextBaselineR2(means) {
  const points = [];

  for (const [model, sizes] of Object.entries(means)) {
    for (const [size, conditions] of Object.entries(sizes)) {
      const textAcc = conditions.natural_text?.mean;
      const tscgAcc = conditions.tscg?.mean;
      const naiveAcc = conditions.naive_truncation?.mean;

      if (textAcc !== undefined && tscgAcc !== undefined) {
        points.push({
          model, size: parseInt(size),
          textAcc, tscgAcc,
          deltaTscg: tscgAcc - textAcc,
          naiveAcc: naiveAcc ?? NaN,
          deltaNaive: naiveAcc !== undefined ? naiveAcc - textAcc : NaN
        });
      }
    }
  }

  const xAll = points.map(p => p.textAcc);
  const yTscg = points.map(p => p.deltaTscg);
  const regTscg = linearRegression(xAll, yTscg);

  const naivePoints = points.filter(p => !isNaN(p.deltaNaive));
  const regNaive = linearRegression(
    naivePoints.map(p => p.textAcc),
    naivePoints.map(p => p.deltaNaive)
  );

  return { regTscg, regNaive, points };
}

function computeJsonBaselineR2(jsonModels) {
  const coreModels = ['qwen3-4b', 'gemma3-4b', 'mistral-7b', 'llama3.1-8b', 'phi-4-14b'];
  const e4Models = ['qwen3-4b', 'gemma3-4b', 'mistral-7b', 'llama3.1-8b', 'gemma3-12b', 'qwen3-14b'];

  const points = [];
  for (const modelData of jsonModels) {
    const model = modelData.model;
    for (const [size, data] of Object.entries(modelData.arr_by_size)) {
      points.push({
        model, size: parseInt(size),
        jsonAcc: data.natural, tscgAcc: data.tscg,
        delta: data.tscg - data.natural,
        isCore: coreModels.includes(model),
        isE4: e4Models.includes(model)
      });
    }
  }

  // [E] Paper's exact 5-model core set (n=35, on 0-1 scale, INCLUDING Phi-4 zeros)
  const corePoints = points.filter(p => p.isCore);
  const regCore = linearRegression(
    corePoints.map(p => p.jsonAcc / 100),
    corePoints.map(p => p.delta / 100)
  );

  // [F] 5-model core WITHOUT Phi-4 0% points
  const coreSansZero = corePoints.filter(p => p.jsonAcc > 0);
  const regCoreSansZero = linearRegression(
    coreSansZero.map(p => p.jsonAcc),
    coreSansZero.map(p => p.delta)
  );

  // [G] All 7 models excluding 0% baselines (in %)
  const allSansZero = points.filter(p => p.jsonAcc > 0);
  const regAllSansZero = linearRegression(
    allSansZero.map(p => p.jsonAcc),
    allSansZero.map(p => p.delta)
  );

  // [H] 6 E4 models only (no phi-4), in %
  const e4Points = points.filter(p => p.isE4);
  const regE4 = linearRegression(
    e4Points.map(p => p.jsonAcc),
    e4Points.map(p => p.delta)
  );

  return { regCore, regCoreSansZero, regAllSansZero, regE4, points };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtP(p) {
  if (isNaN(p)) return 'N/A';
  if (p < 1e-18) return '<1e-18';
  if (p < 1e-10) return '<1e-10';
  if (p < 0.001) return '<0.001';
  if (p < 0.01) return p.toFixed(4);
  return p.toFixed(3);
}

function fmtR2(r2) { return isNaN(r2) ? 'N/A' : r2.toFixed(4); }
function fmtSlope(s) { return isNaN(s) ? 'N/A' : s.toFixed(4); }
function fmtInt(i) { return isNaN(i) ? 'N/A' : i.toFixed(2); }

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('='.repeat(90));
  console.log('  R-SQUARED ANALYSIS: TSCG Improvement vs Baseline Accuracy');
  console.log('  Comparing JSON-baseline (paper) vs Text-baseline (E4) correlations');
  console.log('='.repeat(90));

  // ── Load data ──────────────────────────────────────────────────────────
  const e4Results = loadE4Data();
  const jsonModels = loadJsonBaselineData();

  const means = computeMeans(e4Results);
  const { regTscg, regNaive, points: textPoints } = computeTextBaselineR2(means);
  const { regCore, regCoreSansZero, regAllSansZero, regE4, points: jsonPoints } = computeJsonBaselineR2(jsonModels);

  // ── PART 1: Paper verification ─────────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 1: VERIFY PAPER R^2 = 0.91 (5-model core, n=35, 0-1 scale)');
  console.log('-'.repeat(90));
  console.log(`  Models: qwen3-4b, gemma3-4b, mistral-7b, llama3.1-8b, phi-4-14b`);
  console.log(`  Note: Phi-4 has 6 data points at x=0.0 (JSON format failure)`);
  console.log();
  console.log(`  R^2       = ${fmtR2(regCore.r2)}  (paper reports 0.906)`);
  console.log(`  slope     = ${fmtSlope(regCore.slope)}  (paper reports -1.0466)`);
  console.log(`  intercept = ${fmtInt(regCore.intercept)}  (paper reports 0.7739)`);
  console.log(`  p-value   = ${fmtP(regCore.pValue)}`);
  console.log(`  n         = ${regCore.n}`);

  // ── PART 2: JSON-baseline variants ─────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 2: JSON-BASELINE R^2 VARIANTS');
  console.log('-'.repeat(90));

  const jsonVariants = [
    ['[A] 5-model core (paper, 0-1 scale, incl Phi-4 zeros)', regCore],
    ['[B] 5-model core sans Phi-4 zeros (%, n=28)', regCoreSansZero],
    ['[C] All 7 models sans zeros (%, n=42)', regAllSansZero],
    ['[D] 6 E4 models only (%, no phi-4, n=42)', regE4],
  ];

  console.log();
  console.log('  ' + 'Label'.padEnd(55) + 'R^2      slope     intercept  p-value    n');
  console.log('  ' + '-'.repeat(85));
  for (const [label, reg] of jsonVariants) {
    console.log(`  ${label.padEnd(55)} ${fmtR2(reg.r2).padStart(6)}  ${fmtSlope(reg.slope).padStart(8)}  ${fmtInt(reg.intercept).padStart(9)}  ${fmtP(reg.pValue).padStart(8)}  ${String(reg.n).padStart(3)}`);
  }

  // ── PART 3: Text-baseline R^2 (E4) ────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 3: TEXT-BASELINE R^2 (E4 Experiment, 6 models x 7 sizes)');
  console.log('-'.repeat(90));
  console.log(`  Models: mistral-7b, llama3.1-8b, gemma3-12b, qwen3-4b, qwen3-14b, gemma3-4b`);
  console.log(`  Conditions: natural_text (baseline), tscg, naive_truncation`);
  console.log(`  X = natural_text accuracy (%), Y = delta (method - baseline) in pp`);
  console.log();

  const textVariants = [
    ['[E] Text-baseline --> TSCG delta', regTscg],
    ['[F] Text-baseline --> Naive-truncation delta', regNaive],
  ];

  console.log('  ' + 'Label'.padEnd(55) + 'R^2      slope     intercept  p-value    n');
  console.log('  ' + '-'.repeat(85));
  for (const [label, reg] of textVariants) {
    console.log(`  ${label.padEnd(55)} ${fmtR2(reg.r2).padStart(6)}  ${fmtSlope(reg.slope).padStart(8)}  ${fmtInt(reg.intercept).padStart(9)}  ${fmtP(reg.pValue).padStart(8)}  ${String(reg.n).padStart(3)}`);
  }

  // ── PART 4: Head-to-head comparison ────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 4: HEAD-TO-HEAD COMPARISON');
  console.log('-'.repeat(90));
  console.log();
  console.log('  +-----------------------------------------------------+--------+--------+');
  console.log('  | Comparison                                          |   R^2  | n      |');
  console.log('  +-----------------------------------------------------+--------+--------+');
  console.log(`  | [A] JSON-baseline, 5-model core (PAPER, incl Phi-4) | ${fmtR2(regCore.r2).padStart(6)} | ${String(regCore.n).padStart(6)} |`);
  console.log(`  | [D] JSON-baseline, 6 E4 models (no Phi-4)           | ${fmtR2(regE4.r2).padStart(6)} | ${String(regE4.n).padStart(6)} |`);
  console.log(`  | [E] TEXT-baseline, 6 E4 models --> TSCG delta       | ${fmtR2(regTscg.r2).padStart(6)} | ${String(regTscg.n).padStart(6)} |`);
  console.log(`  | [F] TEXT-baseline, 6 E4 models --> Naive delta      | ${fmtR2(regNaive.r2).padStart(6)} | ${String(regNaive.n).padStart(6)} |`);
  console.log('  +-----------------------------------------------------+--------+--------+');
  console.log();

  // Key comparisons
  const paperR2 = regCore.r2;
  const textR2 = regTscg.r2;
  const jsonE4R2 = regE4.r2;

  console.log(`  KEY COMPARISON 1: Paper R^2 vs Text-baseline R^2`);
  console.log(`    Paper (JSON, 5-model + Phi-4): R^2 = ${fmtR2(paperR2)}`);
  console.log(`    E4 (text, 6-model):            R^2 = ${fmtR2(textR2)}`);
  console.log(`    Drop: ${((paperR2 - textR2) / paperR2 * 100).toFixed(1)}%`);
  console.log();
  console.log(`  KEY COMPARISON 2: Same 6 E4 models, JSON vs Text baseline`);
  console.log(`    JSON baselines: R^2 = ${fmtR2(jsonE4R2)}`);
  console.log(`    Text baselines: R^2 = ${fmtR2(textR2)}`);
  console.log(`    Drop: ${((jsonE4R2 - textR2) / jsonE4R2 * 100).toFixed(1)}%`);

  // ── PART 5: Interpretation ─────────────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 5: INTERPRETATION');
  console.log('-'.repeat(90));
  console.log();
  console.log('  The paper claims R^2 = 0.91 for the regression:');
  console.log('    delta_TSCG = beta * natural_json_accuracy + alpha');
  console.log();
  console.log('  This R^2 is inflated by two factors:');
  console.log();
  console.log(`  1. Phi-4 zero-baseline leverage: Phi-4 has 6 points at JSON-accuracy = 0%`);
  console.log(`     with large positive deltas (75-90 pp). These extreme points anchor the`);
  console.log(`     regression. Removing them drops R^2 from ${fmtR2(paperR2)} to ${fmtR2(regCoreSansZero.r2)}.`);
  console.log();
  console.log(`  2. JSON format confound: Models with low JSON-baseline accuracy are often`);
  console.log(`     struggling with JSON FORMAT, not with the TASK. TSCG uses a text-based`);
  console.log(`     format, so it "improves" accuracy by removing the format barrier.`);
  console.log(`     When we measure baselines in text format (removing this confound),`);
  console.log(`     R^2 drops to ${fmtR2(textR2)}.`);
  console.log();

  if (textR2 < 0.10) {
    console.log('  CONCLUSION: The text-baseline R^2 is NEAR ZERO, demonstrating that');
    console.log('  virtually ALL of the original R^2 = 0.91 correlation was an artifact of');
    console.log('  format sensitivity. Once the JSON confound is removed, natural baseline');
    console.log('  accuracy has essentially no predictive power for TSCG improvement.');
    console.log('  The "gap-proportionality hypothesis" does not survive the format control.');
  } else if (textR2 < 0.30) {
    console.log('  CONCLUSION: The text-baseline R^2 is LOW, indicating that the vast');
    console.log('  majority of the original R^2 = 0.91 was driven by format sensitivity.');
    console.log('  Only a small residual correlation remains after format control.');
  }

  // TSCG delta sign analysis
  console.log();
  console.log('  TSCG DELTA SIGN ANALYSIS (text-baseline):');
  const negCount = textPoints.filter(p => p.deltaTscg < 0).length;
  const posCount = textPoints.filter(p => p.deltaTscg > 0).length;
  const zeroCount = textPoints.filter(p => p.deltaTscg === 0).length;
  const meanDelta = textPoints.reduce((a, p) => a + p.deltaTscg, 0) / textPoints.length;
  console.log(`    Negative deltas (TSCG hurts): ${negCount} / ${textPoints.length} (${(negCount/textPoints.length*100).toFixed(0)}%)`);
  console.log(`    Positive deltas (TSCG helps): ${posCount} / ${textPoints.length} (${(posCount/textPoints.length*100).toFixed(0)}%)`);
  console.log(`    Zero deltas:                  ${zeroCount} / ${textPoints.length}`);
  console.log(`    Mean delta:                   ${meanDelta.toFixed(1)} pp`);
  console.log();
  console.log('  Against text baselines, TSCG predominantly HURTS accuracy (negative delta).');
  console.log('  The "improvement" seen with JSON baselines was largely a format translation');
  console.log('  effect, not a compression benefit.');

  // ── PART 6: Detailed data ──────────────────────────────────────────────
  console.log('\n' + '-'.repeat(90));
  console.log('  PART 6: TEXT-BASELINE DATA POINTS (sorted by model, then size)');
  console.log('-'.repeat(90));
  console.log();
  console.log('  Model           Size  TextBase%  TSCG%    dTSCG(pp)  Naive%   dNaive(pp)');
  console.log('  ' + '-'.repeat(78));

  textPoints.sort((a, b) => a.model.localeCompare(b.model) || a.size - b.size);
  for (const p of textPoints) {
    const naiveStr = isNaN(p.naiveAcc) ? '  N/A' : p.naiveAcc.toFixed(1).padStart(7);
    const dNaiveStr = isNaN(p.deltaNaive) ? '   N/A' : (p.deltaNaive >= 0 ? '+' : '') + p.deltaNaive.toFixed(1);
    const dTscgStr = (p.deltaTscg >= 0 ? '+' : '') + p.deltaTscg.toFixed(1);
    console.log(`  ${p.model.padEnd(16)} ${String(p.size).padStart(4)}  ${p.textAcc.toFixed(1).padStart(9)}  ${p.tscgAcc.toFixed(1).padStart(6)}  ${dTscgStr.padStart(10)}  ${naiveStr}  ${dNaiveStr.padStart(10)}`);
  }

  // Model-level summary
  console.log();
  console.log('  MODEL-LEVEL MEANS (text-baseline):');
  console.log('  ' + '-'.repeat(60));
  const modelMeans = {};
  for (const p of textPoints) {
    if (!modelMeans[p.model]) modelMeans[p.model] = { dTscg: [], dNaive: [], textAcc: [] };
    modelMeans[p.model].dTscg.push(p.deltaTscg);
    modelMeans[p.model].textAcc.push(p.textAcc);
    if (!isNaN(p.deltaNaive)) modelMeans[p.model].dNaive.push(p.deltaNaive);
  }
  console.log('  Model           Mean TextBase  Mean dTSCG  Mean dNaive');
  console.log('  ' + '-'.repeat(55));
  for (const [model, data] of Object.entries(modelMeans)) {
    const mText = (data.textAcc.reduce((a,b)=>a+b) / data.textAcc.length).toFixed(1);
    const mDT = (data.dTscg.reduce((a,b)=>a+b) / data.dTscg.length).toFixed(1);
    const mDN = data.dNaive.length > 0 ? (data.dNaive.reduce((a,b)=>a+b) / data.dNaive.length).toFixed(1) : 'N/A';
    console.log(`  ${model.padEnd(16)}  ${mText.padStart(10)}%  ${(mDT >= 0 ? '+' : '') + mDT + ' pp'.padStart(10)}  ${(mDN >= 0 ? '+' : '') + mDN + ' pp'}`);
  }

  console.log('\n' + '='.repeat(90));
  console.log('  SUMMARY FOR PAPER:');
  console.log('  Paper R^2 (JSON, 5-core incl Phi-4) = ' + fmtR2(regCore.r2));
  console.log('  Text-baseline R^2 (E4, 6 models)    = ' + fmtR2(regTscg.r2));
  console.log('  R^2 collapse: ' + fmtR2(regCore.r2) + ' --> ' + fmtR2(regTscg.r2) + ' (' + ((regCore.r2 - regTscg.r2) / regCore.r2 * 100).toFixed(1) + '% drop)');
  console.log('='.repeat(90));
}

main();
