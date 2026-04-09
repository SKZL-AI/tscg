/**
 * TAB Console Reporter
 *
 * Pretty-prints benchmark results and progress to the terminal.
 * Uses Unicode box-drawing characters for aligned tables.
 */

import type { BenchmarkReport, AggregateMetrics, Condition } from '../types.js';

/**
 * Print a full benchmark report to the console.
 */
export function printReport(report: BenchmarkReport): void {
  const width = 90;

  console.log('\n' + '='.repeat(width));
  console.log('  TAB BENCHMARK RESULTS');
  console.log('='.repeat(width));

  // Meta information
  console.log(`  Scenario:    ${report.meta.scenario}`);
  console.log(`  Models:      ${report.meta.models.join(', ')}`);
  console.log(`  Conditions:  ${report.meta.conditions.join(', ')}`);
  console.log(`  Runs/cond:   ${report.meta.runs_per_condition}`);
  console.log(`  Total tasks: ${report.meta.total_tasks}`);
  console.log(`  API calls:   ${report.meta.total_api_calls}`);
  console.log(`  Duration:    ${(report.meta.duration_ms / 1000).toFixed(1)}s`);

  // Aggregate results table
  if (report.aggregates.length > 0) {
    console.log('\n' + '-'.repeat(width));
    console.log('  AGGREGATE METRICS');
    console.log('-'.repeat(width));

    printAggregateTable(report.aggregates);

    // ARR and savings comparison
    const tscgAggs = report.aggregates.filter(a => a.condition !== 'natural');
    if (tscgAggs.length > 0) {
      console.log('\n' + '-'.repeat(width));
      console.log('  TSCG vs NATURAL COMPARISON');
      console.log('-'.repeat(width));

      printComparisonTable(tscgAggs);
    }
  }

  console.log('\n' + '='.repeat(width));
}

/**
 * Print the main aggregate metrics table.
 */
function printAggregateTable(aggregates: AggregateMetrics[]): void {
  const header =
    `  ${'Model'.padEnd(20)} ${'Cond'.padEnd(10)} ${'Acc'.padStart(8)} ${'CI95'.padStart(18)} ${'ToolSel'.padStart(8)} ${'ParamF1'.padStart(8)} ${'N'.padStart(5)}`;
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const a of aggregates) {
    const ci = `[${(a.accuracy.ci95[0] * 100).toFixed(1)}-${(a.accuracy.ci95[1] * 100).toFixed(1)}]`;
    console.log(
      `  ${a.model.padEnd(20)} ${a.condition.padEnd(10)} ${(a.accuracy.mean * 100).toFixed(1).padStart(7)}% ${ci.padStart(18)} ${(a.tool_selection_accuracy.mean * 100).toFixed(1).padStart(7)}% ${(a.parameter_f1.mean * 100).toFixed(1).padStart(7)}% ${a.n_tasks.toString().padStart(5)}`,
    );
  }
}

/**
 * Print TSCG vs natural comparison table.
 */
function printComparisonTable(tscgAggregates: AggregateMetrics[]): void {
  const header =
    `  ${'Model'.padEnd(20)} ${'Condition'.padEnd(10)} ${'ARR'.padStart(8)} ${'TokSave'.padStart(10)} ${'$Save'.padStart(10)}`;
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const a of tscgAggregates) {
    const arrStr = a.arr === 0 ? 'N/A' : (a.arr * 100).toFixed(1) + '%';
    const tokStr = a.token_savings_pct.toFixed(1) + '%';
    const costStr = a.cost_savings_pct.toFixed(1) + '%';

    console.log(
      `  ${a.model.padEnd(20)} ${a.condition.padEnd(10)} ${arrStr.padStart(8)} ${tokStr.padStart(10)} ${costStr.padStart(10)}`,
    );
  }
}

/**
 * Print a progress bar during benchmark execution.
 */
export function printProgress(
  current: number,
  total: number,
  modelName: string,
  condition: Condition,
  barWidth = 30,
): void {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const bar = '#'.repeat(filled) + '.'.repeat(empty);
  const pctStr = (pct * 100).toFixed(1) + '%';

  process.stdout.write(
    `\r  [${bar}] ${pctStr.padStart(6)} | ${modelName} ${condition} (${current}/${total})`,
  );

  if (current === total) {
    process.stdout.write('\n');
  }
}
