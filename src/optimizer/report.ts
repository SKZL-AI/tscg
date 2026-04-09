/**
 * TSCG Optimization Report
 * Generates human-readable reports showing before/after comparison,
 * transform pipeline details, and optimization metrics.
 */

import type { OptimizeResult, OptimizeMetrics } from './optimizer.js';
import type { TransformResult } from './transforms.js';

// === Report Formatting ===

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const LINE = '─'.repeat(72);
const DLINE = '═'.repeat(72);

/**
 * Print a full optimization report to console
 */
export function printReport(result: OptimizeResult): void {
  const { metrics, pipeline } = result;

  console.log(`\n${DLINE}`);
  console.log(`${BOLD}  TSCG PROMPT OPTIMIZER — Report${RESET}`);
  console.log(DLINE);

  // Analysis summary
  console.log(`\n${CYAN}  Analysis${RESET}`);
  console.log(`  ${LINE}`);
  console.log(`  Prompt type:     ${BOLD}${metrics.promptType}${RESET}`);
  console.log(`  Output format:   ${metrics.outputFormat}`);
  console.log(`  Profile:         ${result.profile}`);
  console.log(`  Parameters:      ${result.analysis.parameters.length}`);
  console.log(`  Operations:      ${result.analysis.operations.length}`);
  console.log(`  Constraints:     ${result.analysis.constraints.length}`);
  if (result.analysis.fillerWords.length > 0) {
    console.log(`  Filler words:    ${result.analysis.fillerWords.join(', ')}`);
  }
  if (result.analysis.hasMultipleChoice) {
    console.log(`  Multiple choice: ${result.analysis.mcOptions.length} options`);
  }

  // Original prompt
  console.log(`\n${CYAN}  Original Prompt${RESET}`);
  console.log(`  ${LINE}`);
  printWrapped(result.original, 68);

  // Optimized prompt
  console.log(`\n${GREEN}  Optimized Prompt${RESET}`);
  console.log(`  ${LINE}`);
  printWrapped(result.optimized, 68);

  // Transform pipeline
  console.log(`\n${CYAN}  Transform Pipeline${RESET}`);
  console.log(`  ${LINE}`);

  const applied = pipeline.transforms.filter((t) => t.applied);
  const skipped = pipeline.transforms.filter((t) => !t.applied);

  for (const t of pipeline.transforms) {
    const icon = t.applied ? `${GREEN}✓${RESET}` : `${DIM}○${RESET}`;
    const tokenInfo = t.tokensRemoved > 0
      ? `${GREEN}-${t.tokensRemoved} tok${RESET}`
      : t.tokensRemoved < 0
        ? `${YELLOW}+${Math.abs(t.tokensRemoved)} tok${RESET}`
        : `${DIM}±0 tok${RESET}`;
    console.log(`  ${icon} ${t.name.padEnd(12)} ${tokenInfo.padEnd(20)} ${DIM}${t.description}${RESET}`);
  }

  // Metrics summary
  console.log(`\n${CYAN}  Metrics${RESET}`);
  console.log(`  ${LINE}`);
  console.log(`  Original:   ${metrics.originalChars} chars  (~${metrics.originalTokensEst} tokens)`);
  console.log(`  Optimized:  ${metrics.optimizedChars} chars  (~${metrics.optimizedTokensEst} tokens)`);

  const ratio = metrics.compressionRatio;
  const ratioColor = ratio < 1 ? GREEN : ratio > 1 ? YELLOW : RESET;
  console.log(`  Ratio:      ${ratioColor}${(ratio * 100).toFixed(1)}%${RESET}`);

  if (metrics.tokensSaved > 0) {
    console.log(`  ${GREEN}Saved:       ~${metrics.tokensSaved} tokens (${((1 - ratio) * 100).toFixed(1)}% reduction)${RESET}`);
  } else if (metrics.tokensRemoved < 0) {
    console.log(`  ${YELLOW}Added:       ~${Math.abs(metrics.tokensRemoved)} tokens (SAD-F/CCP overhead for accuracy)${RESET}`);
  }

  console.log(`  Transforms: ${applied.length} applied, ${skipped.length} skipped`);
  console.log(`\n${DLINE}\n`);
}

/**
 * Print a compact one-line summary
 */
export function printCompact(result: OptimizeResult): void {
  const { metrics } = result;
  const ratio = metrics.compressionRatio;
  const ratioStr = ratio < 1
    ? `${GREEN}${((1 - ratio) * 100).toFixed(1)}% saved${RESET}`
    : ratio > 1
      ? `${YELLOW}${((ratio - 1) * 100).toFixed(1)}% added${RESET}`
      : 'no change';

  console.log(`  [${metrics.promptType}] ${metrics.originalTokensEst}→${metrics.optimizedTokensEst} tok (${ratioStr}) | ${metrics.transformsApplied} transforms`);
}

/**
 * Generate a JSON-serializable report
 */
export function toJSON(result: OptimizeResult): Record<string, unknown> {
  return {
    original: result.original,
    optimized: result.optimized,
    profile: result.profile,
    analysis: {
      type: result.analysis.type,
      outputFormat: result.analysis.outputFormat,
      wordCount: result.analysis.wordCount,
      sentenceCount: result.analysis.sentenceCount,
      parameterCount: result.analysis.parameters.length,
      operationCount: result.analysis.operations.length,
      constraintCount: result.analysis.constraints.length,
      fillerWords: result.analysis.fillerWords,
      hasMultipleChoice: result.analysis.hasMultipleChoice,
    },
    metrics: result.metrics,
    transforms: result.pipeline.transforms.map((t) => ({
      name: t.name,
      applied: t.applied,
      tokensRemoved: t.tokensRemoved,
      description: t.description,
    })),
  };
}

/**
 * Generate a markdown report
 */
export function toMarkdown(result: OptimizeResult): string {
  const { metrics, pipeline } = result;
  const lines: string[] = [];

  lines.push('# TSCG Optimization Report\n');

  lines.push('## Analysis');
  lines.push(`- **Prompt type:** ${metrics.promptType}`);
  lines.push(`- **Output format:** ${metrics.outputFormat}`);
  lines.push(`- **Profile:** ${result.profile}`);
  lines.push('');

  lines.push('## Original Prompt');
  lines.push('```');
  lines.push(result.original);
  lines.push('```\n');

  lines.push('## Optimized Prompt');
  lines.push('```');
  lines.push(result.optimized);
  lines.push('```\n');

  lines.push('## Transform Pipeline');
  lines.push('| Transform | Applied | Tokens | Description |');
  lines.push('|-----------|---------|--------|-------------|');
  for (const t of pipeline.transforms) {
    const icon = t.applied ? '✓' : '○';
    const tok = t.tokensRemoved > 0 ? `-${t.tokensRemoved}` : t.tokensRemoved < 0 ? `+${Math.abs(t.tokensRemoved)}` : '±0';
    lines.push(`| ${icon} ${t.name} | ${t.applied ? 'Yes' : 'No'} | ${tok} | ${t.description} |`);
  }
  lines.push('');

  lines.push('## Metrics');
  lines.push(`- **Original:** ${metrics.originalChars} chars (~${metrics.originalTokensEst} tokens)`);
  lines.push(`- **Optimized:** ${metrics.optimizedChars} chars (~${metrics.optimizedTokensEst} tokens)`);
  lines.push(`- **Compression:** ${(metrics.compressionRatio * 100).toFixed(1)}%`);
  if (metrics.tokensSaved > 0) {
    lines.push(`- **Saved:** ~${metrics.tokensSaved} tokens (${((1 - metrics.compressionRatio) * 100).toFixed(1)}% reduction)`);
  }
  lines.push(`- **Transforms applied:** ${metrics.transformsApplied}/${pipeline.transforms.length}`);

  return lines.join('\n');
}

/**
 * Compare multiple optimization profiles side by side
 */
export function printComparison(results: OptimizeResult[]): void {
  console.log(`\n${DLINE}`);
  console.log(`${BOLD}  TSCG Profile Comparison${RESET}`);
  console.log(DLINE);

  console.log(`\n  ${'Profile'.padEnd(16)} ${'Tokens'.padStart(8)} ${'Ratio'.padStart(8)} ${'Transforms'.padStart(12)} ${'Saved'.padStart(8)}`);
  console.log(`  ${'─'.repeat(56)}`);

  for (const r of results) {
    const m = r.metrics;
    const saved = m.tokensSaved > 0 ? `${GREEN}${m.tokensSaved}${RESET}` : `${YELLOW}${m.tokensRemoved}${RESET}`;
    console.log(
      `  ${r.profile.padEnd(16)} ${String(m.optimizedTokensEst).padStart(8)} ${(m.compressionRatio * 100).toFixed(1).padStart(7)}% ${String(m.transformsApplied).padStart(12)} ${saved.padStart(8)}`
    );
  }

  console.log(`\n  Original: ~${results[0]?.metrics.originalTokensEst} tokens`);
  console.log(`\n${DLINE}\n`);
}

// === Helpers ===

function printWrapped(text: string, width: number): void {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.length <= width) {
      console.log(`  ${line}`);
    } else {
      // Wrap long lines
      let remaining = line;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, width);
        console.log(`  ${chunk}`);
        remaining = remaining.slice(width);
      }
    }
  }
}
