/**
 * TAB CSV Reporter
 *
 * Saves benchmark results as CSV files for analysis in spreadsheets or R/Python.
 * Two output files:
 * - results.csv: individual task results
 * - aggregates.csv: per-model/condition summary
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkReport, TaskResult, AggregateMetrics } from '../types.js';

export interface CsvReporterOptions {
  /** Output directory for CSV files */
  outputDir: string;
  /** Field separator (default: comma) */
  separator?: string;
  /** Custom filename prefix (default: "tab") */
  prefix?: string;
}

/**
 * Save benchmark results as CSV files.
 *
 * @returns Object with paths to saved files
 */
export function saveCsvReport(
  report: BenchmarkReport,
  options: CsvReporterOptions,
): { resultsPath: string; aggregatesPath: string } {
  mkdirSync(options.outputDir, { recursive: true });

  const sep = options.separator ?? ',';
  const prefix = options.prefix ?? 'tab';
  const ts = report.meta.start_time.replace(/[:.]/g, '').slice(0, 15);

  // Results CSV
  const resultsPath = join(options.outputDir, `${prefix}-results-${ts}.csv`);
  const resultsCsv = buildResultsCsv(report.results, sep);
  writeFileSync(resultsPath, resultsCsv, 'utf-8');
  console.log(`  [CSV] Results saved: ${resultsPath}`);

  // Aggregates CSV
  const aggregatesPath = join(options.outputDir, `${prefix}-aggregates-${ts}.csv`);
  const aggregatesCsv = buildAggregatesCsv(report.aggregates, sep);
  writeFileSync(aggregatesPath, aggregatesCsv, 'utf-8');
  console.log(`  [CSV] Aggregates saved: ${aggregatesPath}`);

  return { resultsPath, aggregatesPath };
}

/**
 * Build CSV content for individual results.
 */
function buildResultsCsv(results: TaskResult[], sep: string): string {
  const headers = [
    'result_id',
    'task_id',
    'model',
    'condition',
    'run',
    'tool_selection_accuracy',
    'parameter_f1',
    'overall_score',
    'input_tokens',
    'output_tokens',
    'total_latency_ms',
    'cost_usd',
    'parse_success',
    'timestamp',
  ];

  const rows = results.map(r => [
    csvEscape(r.result_id),
    csvEscape(r.task_id),
    csvEscape(r.model),
    csvEscape(r.condition),
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
  ]);

  return [headers.join(sep), ...rows.map(r => r.join(sep))].join('\n') + '\n';
}

/**
 * Build CSV content for aggregate metrics.
 */
function buildAggregatesCsv(aggregates: AggregateMetrics[], sep: string): string {
  const headers = [
    'model',
    'condition',
    'scenario',
    'accuracy_mean',
    'accuracy_ci95_low',
    'accuracy_ci95_high',
    'tool_sel_mean',
    'tool_sel_ci95_low',
    'tool_sel_ci95_high',
    'param_f1_mean',
    'param_f1_ci95_low',
    'param_f1_ci95_high',
    'arr',
    'token_savings_pct',
    'cost_savings_pct',
    'n_tasks',
  ];

  const rows = aggregates.map(a => [
    csvEscape(a.model),
    csvEscape(a.condition),
    csvEscape(a.scenario),
    a.accuracy.mean.toFixed(4),
    a.accuracy.ci95[0].toFixed(4),
    a.accuracy.ci95[1].toFixed(4),
    a.tool_selection_accuracy.mean.toFixed(4),
    a.tool_selection_accuracy.ci95[0].toFixed(4),
    a.tool_selection_accuracy.ci95[1].toFixed(4),
    a.parameter_f1.mean.toFixed(4),
    a.parameter_f1.ci95[0].toFixed(4),
    a.parameter_f1.ci95[1].toFixed(4),
    a.arr.toFixed(4),
    a.token_savings_pct.toFixed(2),
    a.cost_savings_pct.toFixed(2),
    a.n_tasks.toString(),
  ]);

  return [headers.join(sep), ...rows.map(r => r.join(sep))].join('\n') + '\n';
}

/**
 * Escape a CSV field value.
 * Wraps in quotes if it contains the separator, quotes, or newlines.
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
