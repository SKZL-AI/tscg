/**
 * TSCG Benchmark Runner
 * Executes all test cases across all strategies and collects results
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { callClaude, getRateLimiterStats, estimateTokens } from '../core/api.js';
import { STRATEGIES, applyModelProfile } from '../core/strategies.js';
import { wilsonCI, mcnemarExact, fmtPct, fmtCI } from '../core/statistics.js';
import type {
  TscgConfig,
  TestCase,
  BenchmarkResult,
  BenchmarkReport,
  StrategyName,
  StrategySummary,
} from '../core/types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunnerOptions {
  tests: TestCase[];
  config: TscgConfig;
  strategies?: StrategyName[];
  verbose?: boolean;
}

export async function runBenchmark(options: RunnerOptions): Promise<BenchmarkReport> {
  const { tests, config, verbose = true } = options;
  const activeStrategies = options.strategies
    ? STRATEGIES.filter((s) => options.strategies!.includes(s.name))
    : STRATEGIES;

  const total = tests.length * activeStrategies.length;
  const startTime = Date.now();

  mkdirSync(config.resultsDir, { recursive: true });

  if (verbose) {
    console.log('\u2550'.repeat(80));
    console.log(`  TSCG BENCHMARK v1.0 \u2014 Model: ${config.model}`);
    console.log(`  Tests: ${tests.length} \u00d7 Strategies: ${activeStrategies.length} = ${total} API calls`);
    console.log(`  Est. time: ~${Math.ceil((total * (config.delayMs + 1500)) / 60000)} minutes`);
    console.log('\u2550'.repeat(80) + '\n');
  }

  const results: BenchmarkResult[] = [];
  let n = 0;

  for (const test of tests) {
    for (const strategy of activeStrategies) {
      n++;
      let prompt = strategy.transform(test);
      prompt = applyModelProfile(prompt, strategy.name, config.provider, config.model);
      const estimatedToks = estimateTokens(prompt);

      if (verbose) {
        process.stdout.write(
          `  [${String(n).padStart(3)}/${total}] ${test.category.padEnd(14)} ${test.name.padEnd(14)} ${strategy.name.padEnd(10)} (~${estimatedToks}tok) `
        );
      }

      const response = await callClaude(prompt, config);
      const correct = response.error ? false : test.check(response.text);
      const sym = correct ? '\u2713' : response.error ? '\u26a0' : '\u2717';
      const resp = (response.text || response.error || '').replace(/\n/g, ' ').slice(0, 50);

      if (verbose) {
        console.log(
          `${sym}  [${response.inputTokens}in/${response.outputTokens}out ${response.latencyMs}ms] ${resp}`
        );
      }

      results.push({
        id: test.id,
        category: test.category,
        name: test.name,
        strategy: strategy.name,
        correct,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs,
        response: response.text.slice(0, 300),
        error: response.error,
        expected: test.expected,
        promptLength: prompt.length,
      });

    }
  }

  const durationMs = Date.now() - startTime;
  const rateLimitStats = getRateLimiterStats(config);
  const report = buildReport(results, config, tests.length, activeStrategies.length, durationMs, rateLimitStats);

  if (verbose) {
    printReport(report);
  }

  // Save results
  const outFile = join(
    config.resultsDir,
    `tscg-${config.model.replace(/\//g, '-')}-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`
  );
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n  Results saved to: ${outFile}`);

  return report;
}

function buildReport(
  results: BenchmarkResult[],
  config: TscgConfig,
  testCount: number,
  stratCount: number,
  durationMs: number,
  rateLimitStats: { totalCalls: number; totalRetries: number; totalWaitMs: number } | null,
): BenchmarkReport {
  const stratNames = [...new Set(results.map((r) => r.strategy))];

  // Per-strategy summaries
  const summaries: Record<string, StrategySummary> = {};
  for (const name of stratNames) {
    const rs = results.filter((r) => r.strategy === name);
    const correct = rs.filter((r) => r.correct).length;
    const total = rs.length;
    const accuracy = total > 0 ? correct / total : 0;
    const ci = wilsonCI(correct, total);
    const avgIn = rs.reduce((a, r) => a + r.inputTokens, 0) / total;
    const avgOut = rs.reduce((a, r) => a + r.outputTokens, 0) / total;
    const avgLat = rs.reduce((a, r) => a + r.latencyMs, 0) / total;
    const apt = avgIn > 0 ? (accuracy / avgIn) * 1000 : 0;

    summaries[name] = {
      name: name as StrategyName,
      correct,
      total,
      accuracy,
      ci95: ci,
      avgInputTokens: avgIn,
      avgOutputTokens: avgOut,
      avgLatencyMs: avgLat,
      accuracyPerToken: apt,
    };
  }

  // Per-category breakdown
  const categories = [...new Set(results.map((r) => r.category))];
  const categoryBreakdown: Record<string, Record<string, { correct: number; total: number }>> = {};
  for (const cat of categories) {
    categoryBreakdown[cat] = {};
    for (const name of stratNames) {
      const rs = results.filter((r) => r.category === cat && r.strategy === name);
      categoryBreakdown[cat][name] = {
        correct: rs.filter((r) => r.correct).length,
        total: rs.length,
      };
    }
  }

  // McNemar tests vs natural
  const mcnemarTests: Record<string, { b: number; c: number; pValue: number; significant: boolean; direction: string }> = {};
  for (const name of stratNames.filter((s) => s !== 'natural')) {
    let b = 0, c = 0;
    const testIds = [...new Set(results.map((r) => r.id))];
    for (const id of testIds) {
      const rNat = results.find((r) => r.id === id && r.strategy === 'natural');
      const rS = results.find((r) => r.id === id && r.strategy === name);
      if (rNat && rS) {
        if (!rNat.correct && rS.correct) b++;
        if (rNat.correct && !rS.correct) c++;
      }
    }
    const p = mcnemarExact(b, c);
    mcnemarTests[name] = {
      b, c, pValue: p,
      significant: p < 0.05,
      direction: b > c ? 'method better' : b < c ? 'baseline better' : 'no difference',
    };
  }

  // Head-to-head comparisons
  const pairs: [StrategyName, StrategyName][] = [
    ['tscg', 'natural'],
    ['tscg', 'repetition'],
    ['tscg+sad', 'natural'],
    ['tscg+sad', 'repetition'],
    ['ccp', 'natural'],
  ];

  const headToHead = pairs
    .filter(([a, b]) => stratNames.includes(a) && stratNames.includes(b))
    .map(([a, b]) => {
      let wins = 0, losses = 0, ties = 0;
      const testIds = [...new Set(results.map((r) => r.id))];
      for (const id of testIds) {
        const ra = results.find((r) => r.id === id && r.strategy === a);
        const rb = results.find((r) => r.id === id && r.strategy === b);
        if (ra && rb) {
          if (ra.correct && !rb.correct) wins++;
          else if (!ra.correct && rb.correct) losses++;
          else ties++;
        }
      }
      return { a, b, wins, losses, ties };
    });

  // Token cost comparison
  const natAvg = summaries.natural?.avgInputTokens || 1;
  const tokenCost: Record<string, { avgInput: number; ratio: number; savingPct: number }> = {};
  for (const name of stratNames) {
    const s = summaries[name];
    tokenCost[name] = {
      avgInput: s.avgInputTokens,
      ratio: s.avgInputTokens / natAvg,
      savingPct: (1 - s.avgInputTokens / natAvg) * 100,
    };
  }

  return {
    meta: {
      model: config.model,
      timestamp: new Date().toISOString(),
      totalTests: testCount,
      totalStrategies: stratCount,
      totalApiCalls: results.length,
      durationMs,
      provider: config.provider,
      rateLimitStats: rateLimitStats ? { totalRetries: rateLimitStats.totalRetries, totalWaitMs: rateLimitStats.totalWaitMs } : undefined,
    },
    summaries: summaries as Record<StrategyName, StrategySummary>,
    categoryBreakdown,
    mcnemarTests,
    headToHead,
    tokenCost,
    results,
  };
}

function printReport(report: BenchmarkReport): void {
  const stratNames = Object.keys(report.summaries);

  console.log('\n' + '\u2550'.repeat(80));
  console.log('  RESULTS');
  console.log('\u2550'.repeat(80));

  // Strategy summary table
  console.log(
    `\n  ${'Strategy'.padEnd(12)} ${'Acc'.padStart(8)} ${'CI95'.padStart(16)} ${'OK/Tot'.padStart(8)} ${'AvgIn'.padStart(7)} ${'AvgLat'.padStart(8)} ${'ApT'.padStart(8)}`
  );
  console.log('  ' + '\u2500'.repeat(70));

  for (const name of stratNames) {
    const s = report.summaries[name as StrategyName];
    console.log(
      `  ${name.padEnd(12)} ${fmtPct(s.accuracy).padStart(7)} ${fmtCI(s.ci95).padStart(16)} ${`${s.correct}/${s.total}`.padStart(8)} ${s.avgInputTokens.toFixed(0).padStart(7)} ${(s.avgLatencyMs.toFixed(0) + 'ms').padStart(8)} ${s.accuracyPerToken.toFixed(3).padStart(8)}`
    );
  }

  // Category breakdown
  const categories = Object.keys(report.categoryBreakdown);
  console.log(`\n  ${'Category'.padEnd(16)}${stratNames.map((s) => s.padStart(11)).join('')}`);
  console.log('  ' + '\u2500'.repeat(16 + 11 * stratNames.length));
  for (const cat of categories) {
    let row = `  ${cat.padEnd(16)}`;
    for (const name of stratNames) {
      const d = report.categoryBreakdown[cat]?.[name];
      row += d ? `${d.correct}/${d.total}`.padStart(11) : ''.padStart(11);
    }
    console.log(row);
  }

  // McNemar tests
  console.log('\n  McNemar Tests (vs Natural baseline):');
  console.log('  ' + '\u2500'.repeat(60));
  for (const [name, data] of Object.entries(report.mcnemarTests)) {
    const sig = data.significant ? '\u2605' : '';
    console.log(
      `  ${name.padEnd(12)} b=${data.b} c=${data.c} p=${data.pValue.toFixed(4)} ${sig} (${data.direction})`
    );
  }

  // Head to head
  if (report.headToHead.length > 0) {
    console.log('\n  Head-to-Head:');
    console.log('  ' + '\u2500'.repeat(60));
    for (const h of report.headToHead) {
      console.log(`  ${h.a.padEnd(12)} vs ${h.b.padEnd(12)} W:${h.wins} L:${h.losses} T:${h.ties}`);
    }
  }

  // Token cost
  console.log('\n  Token Cost Comparison:');
  console.log('  ' + '\u2500'.repeat(60));
  for (const [name, data] of Object.entries(report.tokenCost)) {
    const label = data.savingPct > 0 ? 'saved' : 'overhead';
    console.log(
      `  ${name.padEnd(12)} AvgIn: ${data.avgInput.toFixed(0).padStart(5)}  (${data.ratio.toFixed(2)}\u00d7 NL, ${Math.abs(data.savingPct).toFixed(1)}% ${label})`
    );
  }

  console.log('\n' + '\u2550'.repeat(80));
  console.log(`  Duration: ${(report.meta.durationMs / 1000).toFixed(1)}s | API calls: ${report.meta.totalApiCalls}`);
  if (report.meta.rateLimitStats && report.meta.rateLimitStats.totalRetries > 0) {
    console.log(`  Rate-limit retries: ${report.meta.rateLimitStats.totalRetries} | Total wait: ${(report.meta.rateLimitStats.totalWaitMs / 1000).toFixed(1)}s`);
  }
  console.log('\u2550'.repeat(80));
}
