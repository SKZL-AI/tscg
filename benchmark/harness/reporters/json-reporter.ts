/**
 * TAB JSON Reporter
 *
 * Saves benchmark results as a structured JSON file.
 * Output includes full metadata, individual results, and aggregates.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BenchmarkReport } from '../types.js';

export interface JsonReporterOptions {
  /** Output directory for JSON files */
  outputDir: string;
  /** Whether to pretty-print (default: true) */
  pretty?: boolean;
  /** Custom filename (default: auto-generated from timestamp) */
  filename?: string;
}

/**
 * Save a benchmark report as JSON.
 *
 * @returns Path to the saved file
 */
export function saveJsonReport(
  report: BenchmarkReport,
  options: JsonReporterOptions,
): string {
  mkdirSync(options.outputDir, { recursive: true });

  const filename =
    options.filename ??
    `tab-${report.meta.scenario}-${report.meta.start_time.replace(/[:.]/g, '').slice(0, 15)}.json`;

  const filepath = join(options.outputDir, filename);
  const indent = options.pretty !== false ? 2 : undefined;

  writeFileSync(filepath, JSON.stringify(report, null, indent), 'utf-8');

  console.log(`  [JSON] Report saved: ${filepath}`);
  return filepath;
}

/**
 * Save only the aggregate metrics as a separate JSON file.
 * Useful for quick comparison across runs.
 *
 * @returns Path to the saved file
 */
export function saveAggregateJson(
  report: BenchmarkReport,
  options: JsonReporterOptions,
): string {
  mkdirSync(options.outputDir, { recursive: true });

  const filename =
    options.filename ??
    `tab-${report.meta.scenario}-aggregates-${report.meta.start_time.replace(/[:.]/g, '').slice(0, 15)}.json`;

  const filepath = join(options.outputDir, filename);

  const summary = {
    meta: report.meta,
    aggregates: report.aggregates,
  };

  writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`  [JSON] Aggregates saved: ${filepath}`);
  return filepath;
}
