/**
 * TAB Results Aggregation
 *
 * Computes aggregate metrics from individual TaskResult entries:
 * - Mean accuracy with 95% Wilson confidence intervals
 * - Accuracy Retention Rate (ARR): tscg_accuracy / natural_accuracy
 * - Token savings percentage
 * - Cost savings percentage
 *
 * Groups results by model x condition x scenario.
 */

import type { TaskResult, AggregateMetrics, Condition, Scenario } from './types.js';

/**
 * Aggregate individual results into summary metrics.
 *
 * Groups by (model, condition, scenario) and computes:
 * - accuracy: mean overall score with Wilson CI
 * - tool_selection_accuracy: mean with CI
 * - parameter_f1: mean with CI
 * - arr: Accuracy Retention Rate vs natural baseline
 * - token_savings_pct: token reduction vs natural baseline
 * - cost_savings_pct: cost reduction vs natural baseline
 */
export function aggregateResults(results: TaskResult[]): AggregateMetrics[] {
  if (results.length === 0) return [];

  // Group results by (model, condition, scenario)
  const groups = new Map<string, TaskResult[]>();

  for (const result of results) {
    // Infer scenario from task_id prefix or default
    const scenario = inferScenario(result.task_id);
    const key = `${result.model}::${result.condition}::${scenario}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(result);
  }

  // Compute per-group aggregates
  const aggregates: AggregateMetrics[] = [];

  for (const [key, groupResults] of groups) {
    const [model, condition, scenario] = key.split('::') as [string, Condition, Scenario];

    const overallScores = groupResults.map(r => r.scores.overall);
    const toolSelScores = groupResults.map(r => r.scores.tool_selection_accuracy);
    const paramF1Scores = groupResults.map(r => r.scores.parameter_f1);
    const totalInputTokens = groupResults.reduce((s, r) => s + r.metrics.input_tokens, 0);
    const totalCost = groupResults.reduce((s, r) => s + r.metrics.cost_usd, 0);

    aggregates.push({
      model,
      condition: condition as Condition,
      scenario: scenario as Scenario,
      accuracy: {
        mean: mean(overallScores),
        ci95: wilsonCI(
          overallScores.filter(s => s >= 0.5).length,
          overallScores.length,
        ),
      },
      tool_selection_accuracy: {
        mean: mean(toolSelScores),
        ci95: wilsonCI(
          toolSelScores.filter(s => s >= 0.5).length,
          toolSelScores.length,
        ),
      },
      parameter_f1: {
        mean: mean(paramF1Scores),
        ci95: wilsonCI(
          paramF1Scores.filter(s => s >= 0.5).length,
          paramF1Scores.length,
        ),
      },
      arr: 0, // Computed in post-processing pass below
      token_savings_pct: 0,
      cost_savings_pct: 0,
      n_tasks: groupResults.length,
    });
  }

  // Post-processing: compute ARR and savings relative to natural baseline
  for (const agg of aggregates) {
    if (agg.condition === 'natural') continue;

    const natural = aggregates.find(
      a => a.model === agg.model && a.scenario === agg.scenario && a.condition === 'natural',
    );

    if (natural) {
      agg.arr = computeARR(agg.accuracy.mean, natural.accuracy.mean);

      // Token savings
      const naturalResults = groups.get(`${agg.model}::natural::${agg.scenario}`) ?? [];
      const conditionResults = groups.get(`${agg.model}::${agg.condition}::${agg.scenario}`) ?? [];

      const naturalTokens = naturalResults.reduce((s, r) => s + r.metrics.input_tokens, 0);
      const conditionTokens = conditionResults.reduce((s, r) => s + r.metrics.input_tokens, 0);

      if (naturalTokens > 0) {
        agg.token_savings_pct = ((naturalTokens - conditionTokens) / naturalTokens) * 100;
      }

      // Cost savings
      const naturalCost = naturalResults.reduce((s, r) => s + r.metrics.cost_usd, 0);
      const conditionCost = conditionResults.reduce((s, r) => s + r.metrics.cost_usd, 0);

      if (naturalCost > 0) {
        agg.cost_savings_pct = ((naturalCost - conditionCost) / naturalCost) * 100;
      }
    }
  }

  return aggregates;
}

/**
 * Compute Accuracy Retention Rate (ARR).
 *
 * ARR = tscg_accuracy / natural_accuracy
 *
 * Values:
 * - ARR = 1.0: TSCG maintains same accuracy as natural
 * - ARR > 1.0: TSCG improves accuracy
 * - ARR < 1.0: TSCG reduces accuracy
 * - ARR = 0.0: natural baseline has 0 accuracy (undefined, return 0)
 */
export function computeARR(tscgAccuracy: number, naturalAccuracy: number): number {
  if (naturalAccuracy === 0) return 0;
  return tscgAccuracy / naturalAccuracy;
}

// === Helper Functions ===

/** Arithmetic mean */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Wilson score confidence interval.
 * Matches the implementation in src/core/statistics.ts.
 */
function wilsonCI(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const d = 1 + (z * z) / total;
  const c = (p + (z * z) / (2 * total)) / d;
  const h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * Infer scenario from task_id prefix.
 * Convention: task IDs start with scenario letter (e.g., "A-001", "GSM8K-042")
 */
function inferScenario(taskId: string): Scenario {
  const upper = taskId.toUpperCase();
  if (upper.startsWith('GSM8K') || upper.startsWith('GSM')) return 'GSM8K';
  if (upper.startsWith('A-') || upper.startsWith('A_')) return 'A';
  if (upper.startsWith('B-') || upper.startsWith('B_')) return 'B';
  if (upper.startsWith('C-') || upper.startsWith('C_')) return 'C';
  if (upper.startsWith('D-') || upper.startsWith('D_')) return 'D';
  if (upper.startsWith('E-') || upper.startsWith('E_')) return 'E';
  // Default: try to match single character
  const first = upper.charAt(0);
  if ('ABCDE'.includes(first)) return first as Scenario;
  return 'A'; // Fallback
}
