#!/usr/bin/env npx tsx
/**
 * TAB Benchmark -- LaTeX Table Generator
 *
 * Reads analysis/statistics.json and generates publication-quality
 * LaTeX tables for inclusion in paper/sections/experiments.tex.
 *
 * Tables generated:
 *   1. Main results table (accuracy, ARR, token savings per model x condition)
 *   2. Statistical significance table (paired t-test, Cohen's d, McNemar)
 *   3. Per-scenario breakdown table
 *   4. Bootstrap CI table
 *   5. Scaling analysis table (Scenario C tool counts)
 *
 * Output: benchmark/results/analysis/paper-tables.tex
 *
 * Usage:
 *   npx tsx benchmark/analysis/generate-latex-tables.ts
 *   npx tsx benchmark/analysis/generate-latex-tables.ts --stats benchmark/results/analysis/statistics.json
 *   npx tsx benchmark/analysis/generate-latex-tables.ts --output paper/sections/generated-tables.tex
 */

import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// ============================================================
// Types (mirrors statistics.ts output)
// ============================================================

interface StatisticsFile {
  timestamp: string;
  data_source: 'real' | 'placeholder';
  models: string[];
  scenarios: string[];
  comparisons: Comparison[];
  per_scenario_summary: ScenarioSummary[];
  overall_summary: OverallSummary;
}

interface Comparison {
  scenario: string;
  model: string;
  condition: string;
  n_tasks: number;
  natural_accuracy: number;
  tscg_accuracy: number;
  paired_t_test: {
    t_statistic: number;
    df: number;
    p_value: number;
    significant_at_05: boolean;
    significant_at_01: boolean;
    mean_difference: number;
  };
  mcnemar: {
    chi_squared: number;
    p_value: number;
    significant_at_05: boolean;
    b: number;
    c: number;
    n_discordant: number;
  };
  bootstrap_accuracy: {
    mean: number;
    ci_lower: number;
    ci_upper: number;
    se: number;
  };
  effect_size: {
    cohens_d: number;
    interpretation: string;
    hedges_g: number;
  };
  arr: {
    arr: number;
    arr_pct: number;
    arr_meets_target: boolean;
    natural_accuracy: number;
    tscg_accuracy: number;
    bootstrap_ci: {
      mean: number;
      ci_lower: number;
      ci_upper: number;
    };
  };
  token_savings_pct: number;
}

interface ScenarioSummary {
  scenario: string;
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
}

// ============================================================
// CLI
// ============================================================

interface CliOptions {
  statsPath: string;
  outputPath: string;
  verbose: boolean;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    statsPath: resolve('benchmark/results/analysis/statistics.json'),
    outputPath: resolve('benchmark/results/analysis/paper-tables.tex'),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--stats':
        opts.statsPath = resolve(next);
        i++;
        break;
      case '--output':
        opts.outputPath = resolve(next);
        i++;
        break;
      case '--verbose':
      case '-v':
        opts.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
  TAB LaTeX Table Generator

  Reads statistics.json and generates LaTeX tables for the paper.

  Usage: npx tsx benchmark/analysis/generate-latex-tables.ts [options]

  Options:
    --stats <path>   Path to statistics.json
    --output <path>  Output .tex file path
    --verbose, -v    Verbose output
    --help, -h       Show this help
        `);
        process.exit(0);
    }
  }

  return opts;
}

// ============================================================
// LaTeX Helpers
// ============================================================

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, match => '\\' + match)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function modelShort(model: string): string {
  return esc(model
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace('claude-sonnet-4', 'Claude Sonnet 4')
    .replace('gpt-4o', 'GPT-4o')
    .replace('gpt-4.1-mini', 'GPT-4.1-mini')
    .replace('gemini-2.5-flash', 'Gemini 2.5 Flash')
    .replace('llama-3.3-70b', 'Llama 3.3 70B')
    .replace('qwen-2.5-72b', 'Qwen 2.5 72B'));
}

function condName(cond: string): string {
  if (cond === 'natural') return 'Natural';
  if (cond === 'tscg') return 'TSCG';
  if (cond === 'tscg_sad') return 'TSCG+SAD';
  return cond;
}

function pStr(p: number): string {
  if (p < 0.001) return '$<$0.001';
  return p.toFixed(3);
}

function sigStr(p: number): string {
  if (p < 0.01) return '\\textbf{**}';
  if (p < 0.05) return '\\textbf{*}';
  return 'n.s.';
}

// ============================================================
// Table Generators
// ============================================================

function generateMainResultsTable(stats: StatisticsFile): string {
  const lines: string[] = [
    '% Table: Main Benchmark Results',
    '\\begin{table*}[htbp]',
    '  \\centering',
    '  \\caption{TAB Benchmark Results: Accuracy Retention and Token Savings}',
    '  \\label{tab:main-results}',
    '  \\small',
    '  \\begin{tabular}{lllcccr}',
    '    \\toprule',
    '    Scenario & Model & Condition & Accuracy & ARR & Token Savings & $n$ \\\\',
    '    \\midrule',
  ];

  // Group comparisons by (scenario, model) for clean table structure
  const scenarios = [...new Set(stats.comparisons.map(c => c.scenario))];

  let lastScenario = '';
  for (const scenario of scenarios) {
    if (lastScenario) {
      lines.push('    \\addlinespace');
    }
    lastScenario = scenario;

    const scenarioComps = stats.comparisons.filter(c => c.scenario === scenario);
    const models = [...new Set(scenarioComps.map(c => c.model))];

    for (const model of models) {
      const modelComps = scenarioComps.filter(c => c.model === model);
      if (modelComps.length === 0) continue;

      // Natural baseline row
      const firstComp = modelComps[0];
      lines.push(
        `    ${scenario} & ${modelShort(model)} & Natural & ${(firstComp.natural_accuracy * 100).toFixed(1)}\\% & --- & --- & ${firstComp.n_tasks} \\\\`,
      );

      // TSCG condition rows
      for (const c of modelComps) {
        const acc = `${(c.tscg_accuracy * 100).toFixed(1)}\\%`;
        const arr = `${c.arr.arr_pct.toFixed(1)}\\%`;
        const savings = `${c.token_savings_pct.toFixed(1)}\\%`;
        const arrStyled = c.arr.arr_meets_target ? `\\textbf{${arr}}` : arr;

        lines.push(
          `    & & ${condName(c.condition)} & ${acc} & ${arrStyled} & ${savings} & ${c.n_tasks} \\\\`,
        );
      }
    }
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '  \\vspace{2mm}',
    '  \\footnotesize{ARR = Accuracy Retention Rate (TSCG accuracy / natural accuracy $\\times$ 100). Bold ARR values meet the $\\geq$99.5\\% target.}',
    '\\end{table*}',
  );

  return lines.join('\n');
}

function generateStatisticalSignificanceTable(stats: StatisticsFile): string {
  const lines: string[] = [
    '% Table: Statistical Significance',
    '\\begin{table*}[htbp]',
    '  \\centering',
    '  \\caption{Statistical Significance of TSCG vs. Natural Baseline}',
    '  \\label{tab:significance}',
    '  \\small',
    '  \\begin{tabular}{llccccccc}',
    '    \\toprule',
    '    Scenario & Model & Cond. & $\\Delta$Acc & Cohen\'s $d$ & $t$ & $p$ (t-test) & $p$ (McNemar) & Sig. \\\\',
    '    \\midrule',
  ];

  let lastScenario = '';
  for (const c of stats.comparisons) {
    if (lastScenario && c.scenario !== lastScenario) {
      lines.push('    \\addlinespace');
    }
    lastScenario = c.scenario;

    const deltaAcc = ((c.tscg_accuracy - c.natural_accuracy) * 100).toFixed(2);
    const deltaPrefix = parseFloat(deltaAcc) >= 0 ? '+' : '';

    lines.push([
      '   ',
      c.scenario,
      '&', modelShort(c.model),
      '&', condName(c.condition),
      '&', `${deltaPrefix}${deltaAcc}`,
      '&', `${c.effect_size.cohens_d.toFixed(3)} (${c.effect_size.interpretation.charAt(0)})`,
      '&', c.paired_t_test.t_statistic.toFixed(2),
      '&', pStr(c.paired_t_test.p_value),
      '&', pStr(c.mcnemar.p_value),
      '&', sigStr(c.paired_t_test.p_value),
      '\\\\',
    ].join(' '));
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '  \\vspace{2mm}',
    '  \\footnotesize{$\\Delta$Acc = accuracy difference (percentage points). Cohen\'s $d$: n=negligible, s=small, m=medium, l=large.}',
    '  \\\\',
    '  \\footnotesize{\\textbf{*} $p < 0.05$, \\textbf{**} $p < 0.01$, n.s. = not significant.}',
    '\\end{table*}',
  );

  return lines.join('\n');
}

function generateScenarioSummaryTable(stats: StatisticsFile): string {
  const lines: string[] = [
    '% Table: Per-Scenario Summary',
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Per-Scenario Summary of TSCG Effectiveness}',
    '  \\label{tab:scenario-summary}',
    '  \\begin{tabular}{lclcccc}',
    '    \\toprule',
    '    Sc. & \\# & Description & ARR (TSCG) & ARR (SAD) & Savings & $\\bar{d}$ \\\\',
    '    \\midrule',
  ];

  for (const s of stats.per_scenario_summary) {
    const arrTscg = s.mean_arr_tscg > 0 ? `${s.mean_arr_tscg.toFixed(1)}\\%` : '---';
    const arrSad = s.mean_arr_tscg_sad > 0 ? `${s.mean_arr_tscg_sad.toFixed(1)}\\%` : '---';
    const savings = `${s.mean_token_savings.toFixed(1)}\\%`;
    const dMean = s.mean_cohens_d.toFixed(3);

    lines.push(
      `    ${s.scenario} & ${s.n_models} & ${esc(s.description)} & ${arrTscg} & ${arrSad} & ${savings} & ${dMean} \\\\`,
    );
  }

  // Overall row
  lines.push(
    '    \\midrule',
    `    \\multicolumn{3}{l}{\\textbf{Overall}} & \\textbf{${stats.overall_summary.mean_arr_all.toFixed(1)}\\%} & --- & \\textbf{${stats.overall_summary.mean_token_savings_all.toFixed(1)}\\%} & ${stats.overall_summary.mean_cohens_d_all.toFixed(3)} \\\\`,
    '    \\bottomrule',
    '  \\end{tabular}',
    '  \\vspace{2mm}',
    '  \\footnotesize{$\\bar{d}$ = mean Cohen\'s $d$ across all model comparisons in scenario.}',
    '\\end{table}',
  );

  return lines.join('\n');
}

function generateBootstrapCITable(stats: StatisticsFile): string {
  const tscgComps = stats.comparisons.filter(c => c.condition === 'tscg');

  const lines: string[] = [
    '% Table: Bootstrap Confidence Intervals',
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Bootstrap 95\\% Confidence Intervals for TSCG Accuracy (1000 resamples)}',
    '  \\label{tab:bootstrap-ci}',
    '  \\begin{tabular}{llccc}',
    '    \\toprule',
    '    Model & Scenario & Accuracy & CI$_{95}$ & ARR CI$_{95}$ \\\\',
    '    \\midrule',
  ];

  let lastModel = '';
  for (const c of tscgComps) {
    if (lastModel && c.model !== lastModel) {
      lines.push('    \\addlinespace');
    }
    lastModel = c.model;

    const acc = `${(c.bootstrap_accuracy.mean * 100).toFixed(1)}\\%`;
    const accCI = `[${(c.bootstrap_accuracy.ci_lower * 100).toFixed(1)}, ${(c.bootstrap_accuracy.ci_upper * 100).toFixed(1)}]`;
    const arrCI = `[${c.arr.bootstrap_ci.ci_lower.toFixed(1)}, ${c.arr.bootstrap_ci.ci_upper.toFixed(1)}]`;

    lines.push(
      `    ${modelShort(c.model)} & ${c.scenario} & ${acc} & ${accCI} & ${arrCI} \\\\`,
    );
  }

  lines.push(
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
  );

  return lines.join('\n');
}

function generateSummaryStatisticsBlock(stats: StatisticsFile): string {
  const lines: string[] = [
    '% Summary statistics for inline use in paper text',
    '% Usage: \\input{generated-tables.tex} then use \\TotalComparisons etc.',
    `\\newcommand{\\TotalComparisons}{${stats.overall_summary.total_comparisons}}`,
    `\\newcommand{\\SigAtFive}{${stats.overall_summary.significant_at_05_count}}`,
    `\\newcommand{\\SigAtOne}{${stats.overall_summary.significant_at_01_count}}`,
    `\\newcommand{\\MeanARR}{${stats.overall_summary.mean_arr_all.toFixed(1)}\\%}`,
    `\\newcommand{\\MeanCohensD}{${stats.overall_summary.mean_cohens_d_all.toFixed(3)}}`,
    `\\newcommand{\\MeanTokenSavings}{${stats.overall_summary.mean_token_savings_all.toFixed(1)}\\%}`,
    `\\newcommand{\\ARRBelowNinetyNine}{${stats.overall_summary.arr_below_99_count}}`,
  ];

  return lines.join('\n');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const opts = parseCliArgs();

  console.log('\n  TAB LaTeX Table Generator');
  console.log('  ' + '-'.repeat(40));
  console.log(`  Stats:  ${opts.statsPath}`);
  console.log(`  Output: ${opts.outputPath}`);

  // Load statistics
  if (!existsSync(opts.statsPath)) {
    console.error(`\n  Error: Statistics file not found: ${opts.statsPath}`);
    console.error('  Run statistics.ts first:');
    console.error('    npx tsx benchmark/analysis/statistics.ts --use-placeholder');
    process.exit(1);
  }

  const raw = readFileSync(opts.statsPath, 'utf-8');
  const stats = JSON.parse(raw) as StatisticsFile;

  console.log(`\n  Data source: ${stats.data_source}`);
  console.log(`  Comparisons: ${stats.comparisons.length}`);
  console.log(`  Models: ${stats.models.length}`);
  console.log(`  Scenarios: ${stats.scenarios.join(', ')}`);

  // Generate all tables
  const sections: string[] = [
    '%% ============================================================',
    '%% TAB Benchmark -- Generated LaTeX Tables',
    `%% Generated: ${new Date().toISOString()}`,
    `%% Data source: ${stats.data_source}`,
    '%% ============================================================',
    '',
    generateSummaryStatisticsBlock(stats),
    '',
    generateMainResultsTable(stats),
    '',
    generateStatisticalSignificanceTable(stats),
    '',
    generateScenarioSummaryTable(stats),
    '',
    generateBootstrapCITable(stats),
    '',
    '%% End of generated tables',
  ];

  const content = sections.join('\n\n');

  // Write output
  mkdirSync(resolve(opts.outputPath, '..'), { recursive: true });
  writeFileSync(opts.outputPath, content, 'utf-8');
  console.log(`\n  [TeX] Written: ${opts.outputPath}`);
  console.log(`  Tables generated: 4`);
  console.log(`  LaTeX commands defined: 7`);

  // Verify
  const lineCount = content.split('\n').length;
  console.log(`  Total lines: ${lineCount}`);

  console.log('\n  Include in paper with:');
  console.log(`    \\input{${opts.outputPath.replace(/\\/g, '/')}}`);
  console.log('');
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
