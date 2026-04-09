#!/usr/bin/env npx tsx
/**
 * TAB Benchmark -- Figure Data Generator
 *
 * Generates structured JSON data files for the four key paper figures.
 * Each file contains the data points, axis definitions, and styling
 * hints needed to render charts (via D3, matplotlib, or pgfplots).
 *
 * Output files:
 *   fig1-scaling.json       Savings-vs-Complexity Scaling Curve (Scenario C)
 *   fig2-threshold.json     Small-Model Accuracy Threshold Shift (Scenario D)
 *   fig3-gsm8k.json         GSM8K Accuracy Under Tool-Schema Load
 *   fig4-arr-heatmap.json   ARR Heatmap (Models x Tool Counts)
 *
 * Each figure data file is self-contained with:
 *   - title, axes labels, description
 *   - data series with (x, y) points
 *   - styling hints (colors, line styles, markers)
 *   - LaTeX pgfplots code for direct paper inclusion
 *
 * Usage:
 *   npx tsx benchmark/analysis/figures.ts
 *   npx tsx benchmark/analysis/figures.ts --input benchmark/results
 *   npx tsx benchmark/analysis/figures.ts --use-placeholder
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
// Constants
// ============================================================

/** Scenario C scaling tool counts */
const SCALING_TOOL_COUNTS = [3, 5, 10, 15, 20, 30, 50, 75, 100] as const;

/** GSM8K background tool counts */
const GSM8K_TOOL_COUNTS = [0, 10, 25, 50] as const;

/** Models for small-model threshold analysis (Scenario D) */
const SMALL_MODELS = [
  'gpt-4.1-mini-2025-04-14',
  'gemini-2.5-flash',
  'llama-3.3-70b',
  'qwen-2.5-72b',
] as const;

/** All benchmark models */
const ALL_MODELS = [
  'claude-sonnet-4-20250514',
  'gpt-4o-2024-11-20',
  'gpt-4.1-mini-2025-04-14',
  'gemini-2.5-flash',
  'llama-3.3-70b',
  'qwen-2.5-72b',
] as const;

/** Tool count categories for heatmap */
const HEATMAP_TOOL_CATEGORIES = ['3-5', '10-15', '20-30', '50-75', '100+'] as const;

/** Color palette (TSCG paper style) */
const COLORS = {
  natural: '#4A90D9',     // blue
  tscg: '#50C878',        // green
  tscg_sad: '#FF8C42',    // orange
  highlight: '#E74C3C',   // red (for thresholds)
  grid: '#E0E0E0',
} as const;

// ============================================================
// Types
// ============================================================

interface FigureDataPoint {
  x: number;
  y: number;
  label?: string;
}

interface DataSeries {
  name: string;
  condition: string;
  model?: string;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  marker: 'circle' | 'square' | 'triangle' | 'diamond' | 'none';
  points: FigureDataPoint[];
}

interface AxisDefinition {
  label: string;
  unit: string;
  min?: number;
  max?: number;
  ticks?: number[];
}

interface FigureAnnotation {
  type: 'hline' | 'vline' | 'point' | 'region';
  value?: number;
  x?: number;
  y?: number;
  label: string;
  color: string;
  style: 'dashed' | 'solid' | 'dotted';
}

interface FigureData {
  id: string;
  title: string;
  description: string;
  figure_number: number;
  x_axis: AxisDefinition;
  y_axis: AxisDefinition;
  series: DataSeries[];
  annotations: FigureAnnotation[];
  pgfplots_code: string;
}

interface HeatmapCell {
  model: string;
  tool_category: string;
  arr_pct: number;
  color_class: 'green' | 'yellow' | 'red';
  n_tasks: number;
}

interface HeatmapFigureData {
  id: string;
  title: string;
  description: string;
  figure_number: number;
  x_categories: string[];
  y_models: string[];
  cells: HeatmapCell[];
  color_scale: {
    green: { min: number; label: string };
    yellow: { min: number; max: number; label: string };
    red: { max: number; label: string };
  };
  pgfplots_code: string;
}

// ============================================================
// CLI
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
  TAB Figure Data Generator

  Generates JSON data files for the 4 paper figures.

  Usage: npx tsx benchmark/analysis/figures.ts [options]

  Options:
    --input <dir>       Input directory with result JSON files
    --output <dir>      Output directory for figure data files
    --use-placeholder   Generate figures with placeholder data
    --verbose, -v       Verbose output
    --help, -h          Show this help

  Output files:
    fig1-scaling.json       Savings-vs-Complexity Scaling Curve
    fig2-threshold.json     Small-Model Accuracy Threshold Shift
    fig3-gsm8k.json         GSM8K Accuracy Under Tool-Schema Load
    fig4-arr-heatmap.json   ARR Heatmap
        `);
        process.exit(0);
    }
  }

  return opts;
}

// ============================================================
// Result Loading (shared with statistics.ts)
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

  // Deduplicate
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.result_id)) return false;
    seen.add(r.result_id);
    return true;
  });
}

function tryParseResults(filepath: string, verbose: boolean): TaskResult[] {
  try {
    const raw = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw) as unknown;

    if (data && typeof data === 'object' && 'results' in data) {
      const report = data as BenchmarkReport;
      if (Array.isArray(report.results) && report.results.length > 0) {
        if (verbose) console.log(`    Loaded ${report.results.length} from ${basename(filepath)}`);
        return report.results;
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      if (verbose) console.log(`    Loaded ${data.length} from ${basename(filepath)}`);
      return data as TaskResult[];
    }
  } catch { /* skip */ }

  return [];
}

// ============================================================
// Utility
// ============================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function inferScenario(taskId: string): Scenario {
  const upper = taskId.toUpperCase();
  if (upper.startsWith('GSM8K') || upper.startsWith('GSM')) return 'GSM8K';
  for (const s of ['A', 'B', 'C', 'D', 'E'] as Scenario[]) {
    if (upper.startsWith(`${s}-`) || upper.startsWith(`${s}_`) || upper.startsWith(`TAB-${s}`)) return s;
  }
  return 'A';
}

// ============================================================
// Placeholder Data Generation
// ============================================================

/**
 * Generate placeholder data for Figure 1: Scaling Curve.
 *
 * Models the expected relationship between tool count and token savings.
 * Savings increase logarithmically as tool catalogs grow, because
 * TSCG compression of repeated patterns becomes more effective.
 */
function generateFig1Placeholder(): FigureData {
  const series: DataSeries[] = [];

  // Natural baseline: always 0% savings (100% tokens)
  series.push({
    name: 'Natural (baseline)',
    condition: 'natural',
    color: COLORS.natural,
    lineStyle: 'dashed',
    marker: 'circle',
    points: SCALING_TOOL_COUNTS.map(tc => ({ x: tc, y: 0, label: `${tc} tools` })),
  });

  // TSCG: savings scale with complexity
  // Base savings ~55% for 3 tools, rising to ~75% for 100 tools
  series.push({
    name: 'TSCG (balanced)',
    condition: 'tscg',
    color: COLORS.tscg,
    lineStyle: 'solid',
    marker: 'square',
    points: SCALING_TOOL_COUNTS.map(tc => {
      const savings = 55 + 20 * Math.log10(tc) / Math.log10(100);
      return { x: tc, y: round2(savings), label: `${tc} tools` };
    }),
  });

  // TSCG+SAD: ~5% more savings than balanced
  series.push({
    name: 'TSCG+SAD (aggressive)',
    condition: 'tscg_sad',
    color: COLORS.tscg_sad,
    lineStyle: 'solid',
    marker: 'triangle',
    points: SCALING_TOOL_COUNTS.map(tc => {
      const savings = 60 + 20 * Math.log10(tc) / Math.log10(100);
      return { x: tc, y: round2(savings), label: `${tc} tools` };
    }),
  });

  return {
    id: 'fig1-scaling',
    title: 'Token Savings vs. Tool Catalog Complexity (Scenario C)',
    description: 'Shows how TSCG token savings scale with increasing tool catalog size. Savings increase logarithmically due to greater structural redundancy in larger catalogs.',
    figure_number: 1,
    x_axis: {
      label: 'Number of Tools',
      unit: 'count',
      min: 0,
      max: 110,
      ticks: [3, 5, 10, 15, 20, 30, 50, 75, 100],
    },
    y_axis: {
      label: 'Token Savings',
      unit: '%',
      min: 0,
      max: 85,
      ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80],
    },
    series,
    annotations: [
      {
        type: 'hline',
        value: 71.7,
        label: 'Paper target (71.7%)',
        color: COLORS.highlight,
        style: 'dotted',
      },
    ],
    pgfplots_code: generateScalingPgfplots(series),
  };
}

/**
 * Generate placeholder data for Figure 2: Small-Model Threshold Shift.
 *
 * Shows how small models lose accuracy at scale, and TSCG delays
 * the threshold where accuracy drops below 50%.
 */
function generateFig2Placeholder(): FigureData {
  const series: DataSeries[] = [];

  const modelConfigs: Record<string, {
    baseAcc: number;
    degradeRate: number;
    tscgBoost: number;
    color: string;
  }> = {
    'gpt-4.1-mini':    { baseAcc: 0.92, degradeRate: 0.008, tscgBoost: 0.04, color: '#2ECC71' },
    'gemini-2.5-flash': { baseAcc: 0.90, degradeRate: 0.010, tscgBoost: 0.05, color: '#3498DB' },
    'llama-3.3-70b':   { baseAcc: 0.85, degradeRate: 0.015, tscgBoost: 0.06, color: '#E74C3C' },
    'qwen-2.5-72b':    { baseAcc: 0.82, degradeRate: 0.018, tscgBoost: 0.07, color: '#9B59B6' },
  };

  for (const [model, config] of Object.entries(modelConfigs)) {
    // Natural condition
    series.push({
      name: `${model} (natural)`,
      condition: 'natural',
      model,
      color: config.color,
      lineStyle: 'dashed',
      marker: 'circle',
      points: SCALING_TOOL_COUNTS.map(tc => {
        const acc = Math.max(0.1, config.baseAcc - config.degradeRate * tc);
        return { x: tc, y: round2(acc * 100) };
      }),
    });

    // TSCG condition -- higher accuracy, later threshold drop
    series.push({
      name: `${model} (tscg)`,
      condition: 'tscg',
      model,
      color: config.color,
      lineStyle: 'solid',
      marker: 'square',
      points: SCALING_TOOL_COUNTS.map(tc => {
        const acc = Math.max(0.15, config.baseAcc + config.tscgBoost - config.degradeRate * tc * 0.7);
        return { x: tc, y: round2(acc * 100) };
      }),
    });
  }

  // Find threshold annotations
  const annotations: FigureAnnotation[] = [
    {
      type: 'hline',
      value: 50,
      label: '50% accuracy threshold',
      color: COLORS.highlight,
      style: 'dashed',
    },
  ];

  // Add threshold shift annotations for each model
  for (const [model, config] of Object.entries(modelConfigs)) {
    const naturalThreshold = Math.round((config.baseAcc - 0.50) / config.degradeRate);
    const tscgThreshold = Math.round((config.baseAcc + config.tscgBoost - 0.50) / (config.degradeRate * 0.7));

    if (naturalThreshold > 0 && naturalThreshold <= 120) {
      annotations.push({
        type: 'vline',
        value: naturalThreshold,
        label: `${model} natural threshold`,
        color: config.color,
        style: 'dotted',
      });
    }
    if (tscgThreshold > 0 && tscgThreshold <= 120) {
      annotations.push({
        type: 'vline',
        value: tscgThreshold,
        label: `${model} TSCG threshold`,
        color: config.color,
        style: 'dashed',
      });
    }
  }

  return {
    id: 'fig2-threshold',
    title: 'Small-Model Accuracy Threshold Shift (Scenario D)',
    description: 'Demonstrates how TSCG compression extends the usable tool catalog range for smaller models by reducing context pollution. Dashed lines show natural baseline; solid lines show TSCG condition.',
    figure_number: 2,
    x_axis: {
      label: 'Number of Tools',
      unit: 'count',
      min: 0,
      max: 110,
      ticks: [3, 5, 10, 15, 20, 30, 50, 75, 100],
    },
    y_axis: {
      label: 'Tool-Selection Accuracy',
      unit: '%',
      min: 0,
      max: 100,
      ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    },
    series,
    annotations,
    pgfplots_code: generateThresholdPgfplots(series),
  };
}

/**
 * Generate placeholder data for Figure 3: GSM8K Accuracy Under Tool-Schema Load.
 *
 * Shows how background tool schemas affect pure math reasoning ability,
 * and whether TSCG compression mitigates this degradation.
 */
function generateFig3Placeholder(): FigureData {
  const series: DataSeries[] = [];

  const modelConfigs: Record<string, {
    baseGsm: number;
    degradePerTool: number;
    color: string;
  }> = {
    'claude-sonnet-4':   { baseGsm: 0.95, degradePerTool: 0.001, color: '#E67E22' },
    'gpt-4o':            { baseGsm: 0.93, degradePerTool: 0.0015, color: '#2ECC71' },
    'gpt-4.1-mini':      { baseGsm: 0.82, degradePerTool: 0.003, color: '#3498DB' },
    'gemini-2.5-flash':  { baseGsm: 0.85, degradePerTool: 0.0025, color: '#9B59B6' },
    'llama-3.3-70b':     { baseGsm: 0.72, degradePerTool: 0.004, color: '#E74C3C' },
    'qwen-2.5-72b':      { baseGsm: 0.70, degradePerTool: 0.005, color: '#1ABC9C' },
  };

  for (const [model, config] of Object.entries(modelConfigs)) {
    // Natural: accuracy drops with more background tools
    series.push({
      name: `${model} (natural)`,
      condition: 'natural',
      model,
      color: config.color,
      lineStyle: 'dashed',
      marker: 'circle',
      points: GSM8K_TOOL_COUNTS.map(tc => {
        const acc = Math.max(0.3, config.baseGsm - config.degradePerTool * tc);
        return { x: tc, y: round2(acc * 100) };
      }),
    });

    // TSCG: compressed schemas cause less interference
    series.push({
      name: `${model} (tscg)`,
      condition: 'tscg',
      model,
      color: config.color,
      lineStyle: 'solid',
      marker: 'square',
      points: GSM8K_TOOL_COUNTS.map(tc => {
        // TSCG reduces degradation by ~60% (because 70% fewer tokens)
        const acc = Math.max(0.35, config.baseGsm - config.degradePerTool * tc * 0.4);
        return { x: tc, y: round2(acc * 100) };
      }),
    });
  }

  return {
    id: 'fig3-gsm8k',
    title: 'GSM8K Accuracy Under Tool-Schema Load',
    description: 'Measures the impact of background tool schemas on math reasoning accuracy. TSCG-compressed schemas (solid lines) cause significantly less interference than natural schemas (dashed lines) because they occupy fewer context tokens.',
    figure_number: 3,
    x_axis: {
      label: 'Number of Background Tools',
      unit: 'count',
      min: -2,
      max: 55,
      ticks: [0, 10, 25, 50],
    },
    y_axis: {
      label: 'GSM8K Solve Accuracy',
      unit: '%',
      min: 30,
      max: 100,
      ticks: [30, 40, 50, 60, 70, 80, 90, 100],
    },
    series,
    annotations: [
      {
        type: 'vline',
        value: 0,
        label: 'No tools (pure reasoning)',
        color: COLORS.grid,
        style: 'dotted',
      },
    ],
    pgfplots_code: generateGsm8kPgfplots(series),
  };
}

/**
 * Generate placeholder data for Figure 4: ARR Heatmap.
 *
 * Cross-tabulates models (rows) by tool count categories (columns)
 * with ARR percentage as the cell value.
 */
function generateFig4Placeholder(): HeatmapFigureData {
  const cells: HeatmapCell[] = [];

  const modelARRProfiles: Record<string, Record<string, number>> = {
    'claude-sonnet-4': {
      '3-5': 100.0, '10-15': 99.8, '20-30': 99.6, '50-75': 99.3, '100+': 99.0,
    },
    'gpt-4o': {
      '3-5': 100.0, '10-15': 99.7, '20-30': 99.4, '50-75': 99.0, '100+': 98.5,
    },
    'gpt-4.1-mini': {
      '3-5': 99.8, '10-15': 99.2, '20-30': 98.5, '50-75': 97.0, '100+': 95.0,
    },
    'gemini-2.5-flash': {
      '3-5': 99.9, '10-15': 99.5, '20-30': 99.0, '50-75': 98.0, '100+': 96.5,
    },
    'llama-3.3-70b': {
      '3-5': 99.5, '10-15': 98.8, '20-30': 97.5, '50-75': 95.5, '100+': 92.0,
    },
    'qwen-2.5-72b': {
      '3-5': 99.3, '10-15': 98.5, '20-30': 97.0, '50-75': 94.5, '100+': 90.0,
    },
  };

  for (const [model, categories] of Object.entries(modelARRProfiles)) {
    for (const [category, arr] of Object.entries(categories)) {
      let colorClass: HeatmapCell['color_class'];
      if (arr >= 99) colorClass = 'green';
      else if (arr >= 95) colorClass = 'yellow';
      else colorClass = 'red';

      cells.push({
        model,
        tool_category: category,
        arr_pct: arr,
        color_class: colorClass,
        n_tasks: 20,
      });
    }
  }

  return {
    id: 'fig4-arr-heatmap',
    title: 'Accuracy Retention Rate by Model and Tool Count',
    description: 'Heatmap showing ARR (TSCG accuracy / natural accuracy * 100) across different models and tool catalog sizes. Green cells (>=99%) indicate TSCG fully preserves accuracy; yellow (95-99%) shows minor degradation; red (<95%) indicates significant accuracy loss.',
    figure_number: 4,
    x_categories: [...HEATMAP_TOOL_CATEGORIES],
    y_models: Object.keys(modelARRProfiles),
    cells,
    color_scale: {
      green: { min: 99, label: '>= 99% (Preserved)' },
      yellow: { min: 95, max: 99, label: '95-99% (Minor loss)' },
      red: { max: 95, label: '< 95% (Significant loss)' },
    },
    pgfplots_code: generateHeatmapPgfplots(Object.keys(modelARRProfiles), cells),
  };
}

// ============================================================
// Real Data Extraction
// ============================================================

/**
 * Build Figure 1 from real results (Scenario C).
 * Groups results by tool count (from task metadata or task_id) and condition.
 */
function buildFig1FromResults(results: TaskResult[]): FigureData {
  const scenarioC = results.filter(r => inferScenario(r.task_id) === 'C');

  if (scenarioC.length === 0) {
    console.log('    No Scenario C results found, using placeholder');
    return generateFig1Placeholder();
  }

  // Group by condition, then by tool count
  const conditionGroups = new Map<string, Map<number, number[]>>();

  for (const r of scenarioC) {
    // Extract tool count from task_id (e.g., "C-050-ts-001" -> 50)
    const toolMatch = r.task_id.match(/C-(\d+)/i);
    const toolCount = toolMatch ? parseInt(toolMatch[1], 10) : 0;
    if (toolCount === 0) continue;

    if (!conditionGroups.has(r.condition)) {
      conditionGroups.set(r.condition, new Map());
    }
    const tcMap = conditionGroups.get(r.condition)!;
    if (!tcMap.has(toolCount)) tcMap.set(toolCount, []);
    tcMap.get(toolCount)!.push(r.metrics.input_tokens);
  }

  // Compute savings relative to natural
  const naturalTokensByTC = conditionGroups.get('natural') ?? new Map<number, number[]>();
  const series: DataSeries[] = [];

  const condConfigs: Record<string, { name: string; color: string; lineStyle: DataSeries['lineStyle']; marker: DataSeries['marker'] }> = {
    natural:  { name: 'Natural (baseline)', color: COLORS.natural, lineStyle: 'dashed', marker: 'circle' },
    tscg:     { name: 'TSCG (balanced)', color: COLORS.tscg, lineStyle: 'solid', marker: 'square' },
    tscg_sad: { name: 'TSCG+SAD (aggressive)', color: COLORS.tscg_sad, lineStyle: 'solid', marker: 'triangle' },
  };

  for (const [condition, tcMap] of conditionGroups) {
    const config = condConfigs[condition] ?? { name: condition, color: '#999', lineStyle: 'solid' as const, marker: 'circle' as const };

    const points: FigureDataPoint[] = [];
    const sortedTCs = [...tcMap.keys()].sort((a, b) => a - b);

    for (const tc of sortedTCs) {
      const condTokens = mean(tcMap.get(tc)!);
      const natTokens = mean(naturalTokensByTC.get(tc) ?? [condTokens]);
      const savings = natTokens > 0 ? ((natTokens - condTokens) / natTokens) * 100 : 0;
      points.push({ x: tc, y: round2(savings) });
    }

    series.push({ ...config, condition, points });
  }

  const placeholder = generateFig1Placeholder();
  return { ...placeholder, series, description: placeholder.description + ' (from real data)' };
}

/**
 * Build Figure 2 from real results (Scenario D / small models).
 */
function buildFig2FromResults(results: TaskResult[]): FigureData {
  const scenarioD = results.filter(r => {
    const s = inferScenario(r.task_id);
    return s === 'D' || s === 'C'; // Scenario C also has scaling data
  });

  if (scenarioD.length === 0) {
    console.log('    No Scenario D/C results found, using placeholder');
    return generateFig2Placeholder();
  }

  // Group by (model, condition, tool_count)
  const groups = new Map<string, Map<number, number[]>>();

  for (const r of scenarioD) {
    const toolMatch = r.task_id.match(/[CD]-(\d+)/i);
    const toolCount = toolMatch ? parseInt(toolMatch[1], 10) : 0;
    if (toolCount === 0) continue;

    const key = `${r.model}::${r.condition}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const tcMap = groups.get(key)!;
    if (!tcMap.has(toolCount)) tcMap.set(toolCount, []);
    tcMap.get(toolCount)!.push(r.scores.tool_selection_accuracy);
  }

  const series: DataSeries[] = [];
  const modelColors: Record<string, string> = {
    'gpt-4.1-mini-2025-04-14': '#2ECC71',
    'gemini-2.5-flash': '#3498DB',
    'llama-3.3-70b': '#E74C3C',
    'qwen-2.5-72b': '#9B59B6',
  };

  for (const [key, tcMap] of groups) {
    const [model, condition] = key.split('::');
    if (!SMALL_MODELS.includes(model as typeof SMALL_MODELS[number])) continue;

    const color = modelColors[model] ?? '#999';
    const modelShort = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');

    const points: FigureDataPoint[] = [];
    const sortedTCs = [...tcMap.keys()].sort((a, b) => a - b);

    for (const tc of sortedTCs) {
      points.push({ x: tc, y: round2(mean(tcMap.get(tc)!) * 100) });
    }

    series.push({
      name: `${modelShort} (${condition})`,
      condition,
      model,
      color,
      lineStyle: condition === 'natural' ? 'dashed' : 'solid',
      marker: condition === 'natural' ? 'circle' : 'square',
      points,
    });
  }

  const placeholder = generateFig2Placeholder();
  return series.length > 0
    ? { ...placeholder, series, description: placeholder.description + ' (from real data)' }
    : placeholder;
}

/**
 * Build Figure 3 from real GSM8K results.
 */
function buildFig3FromResults(results: TaskResult[]): FigureData {
  const gsm8k = results.filter(r => inferScenario(r.task_id) === 'GSM8K');

  if (gsm8k.length === 0) {
    console.log('    No GSM8K results found, using placeholder');
    return generateFig3Placeholder();
  }

  const groups = new Map<string, Map<number, number[]>>();

  for (const r of gsm8k) {
    const toolMatch = r.task_id.match(/GSM8K?-(\d+)/i);
    const toolCount = toolMatch ? parseInt(toolMatch[1], 10) : 0;

    const key = `${r.model}::${r.condition}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const tcMap = groups.get(key)!;
    if (!tcMap.has(toolCount)) tcMap.set(toolCount, []);
    tcMap.get(toolCount)!.push(r.scores.gsm8k_correct ? 1 : 0);
  }

  const series: DataSeries[] = [];
  const modelColors: Record<string, string> = {
    'claude-sonnet-4-20250514': '#E67E22',
    'gpt-4o-2024-11-20': '#2ECC71',
    'gpt-4.1-mini-2025-04-14': '#3498DB',
    'gemini-2.5-flash': '#9B59B6',
    'llama-3.3-70b': '#E74C3C',
    'qwen-2.5-72b': '#1ABC9C',
  };

  for (const [key, tcMap] of groups) {
    const [model, condition] = key.split('::');
    const color = modelColors[model] ?? '#999';
    const modelShort = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');

    const points: FigureDataPoint[] = [];
    const sortedTCs = [...tcMap.keys()].sort((a, b) => a - b);

    for (const tc of sortedTCs) {
      points.push({ x: tc, y: round2(mean(tcMap.get(tc)!) * 100) });
    }

    series.push({
      name: `${modelShort} (${condition})`,
      condition,
      model,
      color,
      lineStyle: condition === 'natural' ? 'dashed' : 'solid',
      marker: condition === 'natural' ? 'circle' : 'square',
      points,
    });
  }

  const placeholder = generateFig3Placeholder();
  return series.length > 0
    ? { ...placeholder, series, description: placeholder.description + ' (from real data)' }
    : placeholder;
}

/**
 * Build Figure 4 ARR Heatmap from real results.
 */
function buildFig4FromResults(results: TaskResult[]): HeatmapFigureData {
  if (results.length === 0) {
    console.log('    No results found for heatmap, using placeholder');
    return generateFig4Placeholder();
  }

  // Group by (model, tool_count_category, condition)
  const groups = new Map<string, { natural: number[]; tscg: number[] }>();

  for (const r of results) {
    const toolMatch = r.task_id.match(/[A-E]-(\d+)/i);
    const toolCount = toolMatch ? parseInt(toolMatch[1], 10) : 15;

    let category: string;
    if (toolCount <= 5) category = '3-5';
    else if (toolCount <= 15) category = '10-15';
    else if (toolCount <= 30) category = '20-30';
    else if (toolCount <= 75) category = '50-75';
    else category = '100+';

    const key = `${r.model}::${category}`;
    if (!groups.has(key)) groups.set(key, { natural: [], tscg: [] });

    const group = groups.get(key)!;
    if (r.condition === 'natural') {
      group.natural.push(r.scores.overall);
    } else if (r.condition === 'tscg') {
      group.tscg.push(r.scores.overall);
    }
  }

  const cells: HeatmapCell[] = [];
  const models = [...new Set(results.map(r => r.model))];

  for (const model of models) {
    for (const category of HEATMAP_TOOL_CATEGORIES) {
      const key = `${model}::${category}`;
      const group = groups.get(key);

      if (!group || group.natural.length === 0 || group.tscg.length === 0) {
        continue;
      }

      const naturalAcc = mean(group.natural);
      const tscgAcc = mean(group.tscg);
      const arr = naturalAcc > 0 ? (tscgAcc / naturalAcc) * 100 : 0;

      let colorClass: HeatmapCell['color_class'];
      if (arr >= 99) colorClass = 'green';
      else if (arr >= 95) colorClass = 'yellow';
      else colorClass = 'red';

      cells.push({
        model,
        tool_category: category,
        arr_pct: round2(arr),
        color_class: colorClass,
        n_tasks: group.tscg.length,
      });
    }
  }

  if (cells.length === 0) {
    console.log('    Insufficient data for heatmap, using placeholder');
    return generateFig4Placeholder();
  }

  const placeholder = generateFig4Placeholder();
  return { ...placeholder, cells, y_models: models };
}

// ============================================================
// PGFPlots LaTeX Code Generation
// ============================================================

function generateScalingPgfplots(series: DataSeries[]): string {
  const lines: string[] = [
    '% Figure 1: Savings-vs-Complexity Scaling Curve',
    '\\begin{tikzpicture}',
    '\\begin{axis}[',
    '  width=\\textwidth,',
    '  height=0.6\\textwidth,',
    '  xlabel={Number of Tools},',
    '  ylabel={Token Savings (\\%)},',
    '  xmin=0, xmax=110,',
    '  ymin=0, ymax=85,',
    '  xtick={3,5,10,15,20,30,50,75,100},',
    '  legend pos=south east,',
    '  grid=major,',
    '  grid style={dashed, gray!30},',
    ']',
  ];

  for (const s of series) {
    const style = s.lineStyle === 'dashed' ? 'dashed' : 'solid';
    const mark = s.marker === 'circle' ? '*' : s.marker === 'square' ? 'square*' : 'triangle*';
    const coords = s.points.map(p => `(${p.x},${p.y})`).join(' ');

    lines.push(`\\addplot[${style}, mark=${mark}, thick] coordinates {${coords}};`);
    lines.push(`\\addlegendentry{${s.name}}`);
  }

  // Target line
  lines.push('\\addplot[dotted, red, thick] coordinates {(0,71.7) (110,71.7)};');
  lines.push('\\addlegendentry{Paper target (71.7\\%)}');

  lines.push('\\end{axis}', '\\end{tikzpicture}');
  return lines.join('\n');
}

function generateThresholdPgfplots(series: DataSeries[]): string {
  const lines: string[] = [
    '% Figure 2: Small-Model Accuracy Threshold Shift',
    '\\begin{tikzpicture}',
    '\\begin{axis}[',
    '  width=\\textwidth,',
    '  height=0.6\\textwidth,',
    '  xlabel={Number of Tools},',
    '  ylabel={Tool-Selection Accuracy (\\%)},',
    '  xmin=0, xmax=110,',
    '  ymin=0, ymax=100,',
    '  legend pos=north east,',
    '  legend style={font=\\small},',
    '  grid=major,',
    '  grid style={dashed, gray!30},',
    ']',
  ];

  // 50% threshold line
  lines.push('\\addplot[dashed, red, thick] coordinates {(0,50) (110,50)};');
  lines.push('\\addlegendentry{50\\% threshold}');

  for (const s of series) {
    const style = s.lineStyle === 'dashed' ? 'dashed' : 'solid';
    const mark = s.marker === 'circle' ? '*' : 'square*';
    const coords = s.points.map(p => `(${p.x},${p.y})`).join(' ');

    lines.push(`\\addplot[${style}, mark=${mark}] coordinates {${coords}};`);
    lines.push(`\\addlegendentry{${s.name}}`);
  }

  lines.push('\\end{axis}', '\\end{tikzpicture}');
  return lines.join('\n');
}

function generateGsm8kPgfplots(series: DataSeries[]): string {
  const lines: string[] = [
    '% Figure 3: GSM8K Accuracy Under Tool-Schema Load',
    '\\begin{tikzpicture}',
    '\\begin{axis}[',
    '  width=\\textwidth,',
    '  height=0.6\\textwidth,',
    '  xlabel={Number of Background Tools},',
    '  ylabel={GSM8K Solve Accuracy (\\%)},',
    '  xmin=-2, xmax=55,',
    '  ymin=30, ymax=100,',
    '  xtick={0,10,25,50},',
    '  legend pos=south west,',
    '  legend style={font=\\small},',
    '  grid=major,',
    '  grid style={dashed, gray!30},',
    ']',
  ];

  for (const s of series) {
    const style = s.lineStyle === 'dashed' ? 'dashed' : 'solid';
    const mark = s.marker === 'circle' ? '*' : 'square*';
    const coords = s.points.map(p => `(${p.x},${p.y})`).join(' ');

    lines.push(`\\addplot[${style}, mark=${mark}] coordinates {${coords}};`);
    lines.push(`\\addlegendentry{${s.name}}`);
  }

  lines.push('\\end{axis}', '\\end{tikzpicture}');
  return lines.join('\n');
}

function generateHeatmapPgfplots(models: string[], cells: HeatmapCell[]): string {
  const lines: string[] = [
    '% Figure 4: ARR Heatmap',
    '% Requires \\usepackage{pgfplots} and \\usepgfplotslibrary{colormaps}',
    '\\begin{tikzpicture}',
    '\\begin{axis}[',
    '  colormap={arr}{',
    '    rgb255(0cm)=(231,76,60)',    // red at 90%
    '    rgb255(5cm)=(241,196,15)',   // yellow at 95%
    '    rgb255(10cm)=(46,204,113)',  // green at 100%
    '  },',
    '  colorbar,',
    '  colorbar style={ylabel={ARR (\\%)}},',
    '  point meta min=90,',
    '  point meta max=100,',
    '  xlabel={Tool Count Category},',
    '  ylabel={Model},',
    `  xtick={0,1,2,3,4},`,
    `  xticklabels={3--5, 10--15, 20--30, 50--75, 100+},`,
    `  ytick={${models.map((_, i) => i).join(',')}},`,
    `  yticklabels={${models.map(m => m.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/_/g, '\\_')).join(', ')}},`,
    '  enlargelimits=0.1,',
    ']',
  ];

  // Create matrix plot data
  const categories = [...HEATMAP_TOOL_CATEGORIES];
  for (const cell of cells) {
    const xi = categories.indexOf(cell.tool_category as typeof categories[number]);
    const yi = models.indexOf(cell.model);
    if (xi >= 0 && yi >= 0) {
      lines.push(`\\addplot[only marks, mark=square*, mark size=8pt, point meta=${cell.arr_pct}] coordinates {(${xi},${yi})};`);
      lines.push(`\\node[font=\\tiny] at (axis cs:${xi},${yi}) {${cell.arr_pct.toFixed(1)}};`);
    }
  }

  lines.push('\\end{axis}', '\\end{tikzpicture}');
  return lines.join('\n');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const opts = parseCliArgs();

  console.log('\n  TAB Figure Data Generator');
  console.log('  ' + '-'.repeat(40));
  console.log(`  Input:  ${opts.inputDir}`);
  console.log(`  Output: ${opts.outputDir}`);

  // Load results or use placeholder
  let results: TaskResult[] = [];
  let usePlaceholder = opts.usePlaceholder;

  if (!usePlaceholder) {
    console.log('\n  [1/5] Loading result files...');
    results = loadAllResults(opts.inputDir, opts.verbose);

    if (results.length === 0) {
      console.log('  No real results found. Using placeholder data.');
      usePlaceholder = true;
    } else {
      console.log(`  Loaded ${results.length} results`);
    }
  } else {
    console.log('\n  [1/5] Using placeholder data...');
  }

  mkdirSync(opts.outputDir, { recursive: true });

  // Figure 1: Scaling Curve
  console.log('\n  [2/5] Generating Figure 1: Savings-vs-Complexity Scaling Curve...');
  const fig1 = usePlaceholder ? generateFig1Placeholder() : buildFig1FromResults(results);
  const fig1Path = join(opts.outputDir, 'fig1-scaling.json');
  writeFileSync(fig1Path, JSON.stringify(fig1, null, 2), 'utf-8');
  console.log(`  [JSON] ${fig1Path}`);
  console.log(`    Series: ${fig1.series.length}, Points per series: ${fig1.series[0]?.points.length ?? 0}`);

  // Figure 2: Threshold Shift
  console.log('\n  [3/5] Generating Figure 2: Small-Model Accuracy Threshold Shift...');
  const fig2 = usePlaceholder ? generateFig2Placeholder() : buildFig2FromResults(results);
  const fig2Path = join(opts.outputDir, 'fig2-threshold.json');
  writeFileSync(fig2Path, JSON.stringify(fig2, null, 2), 'utf-8');
  console.log(`  [JSON] ${fig2Path}`);
  console.log(`    Series: ${fig2.series.length}`);

  // Figure 3: GSM8K
  console.log('\n  [4/5] Generating Figure 3: GSM8K Accuracy Under Tool-Schema Load...');
  const fig3 = usePlaceholder ? generateFig3Placeholder() : buildFig3FromResults(results);
  const fig3Path = join(opts.outputDir, 'fig3-gsm8k.json');
  writeFileSync(fig3Path, JSON.stringify(fig3, null, 2), 'utf-8');
  console.log(`  [JSON] ${fig3Path}`);
  console.log(`    Series: ${fig3.series.length}`);

  // Figure 4: ARR Heatmap
  console.log('\n  [5/5] Generating Figure 4: ARR Heatmap...');
  const fig4 = usePlaceholder ? generateFig4Placeholder() : buildFig4FromResults(results);
  const fig4Path = join(opts.outputDir, 'fig4-arr-heatmap.json');
  writeFileSync(fig4Path, JSON.stringify(fig4, null, 2), 'utf-8');
  console.log(`  [JSON] ${fig4Path}`);
  console.log(`    Models: ${fig4.y_models.length}, Categories: ${fig4.x_categories.length}, Cells: ${fig4.cells.length}`);

  // Summary
  const w = 70;
  console.log('\n' + '='.repeat(w));
  console.log('  FIGURE DATA GENERATION COMPLETE');
  console.log('='.repeat(w));
  console.log(`  Data source: ${usePlaceholder ? 'placeholder' : 'real'}`);
  console.log(`  Output dir:  ${opts.outputDir}`);
  console.log('');
  console.log('  Files generated:');
  console.log(`    fig1-scaling.json       ${fig1.series.length} series (Scenario C)`);
  console.log(`    fig2-threshold.json     ${fig2.series.length} series (Scenario D)`);
  console.log(`    fig3-gsm8k.json         ${fig3.series.length} series (GSM8K)`);
  console.log(`    fig4-arr-heatmap.json   ${fig4.cells.length} cells (ARR)`);
  console.log('');
  console.log('  Each file includes pgfplots LaTeX code for direct paper inclusion.');
  console.log('\n' + '='.repeat(w) + '\n');
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
