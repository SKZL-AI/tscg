/**
 * @tscg/openclaw — Recommendation Algorithm
 *
 * Scoring, disqualification gates, confidence calibration,
 * and per-operator optimal profile selection (v1.4.2).
 */

import type { OperatorConfig } from './profile-map.js';
import { CONSERVATIVE_OPS } from './profile-map.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellResult {
  accuracy: number;      // 0-1 (e.g., 0.80 = 80%)
  avgTokens: number;
  savingsPercent: number; // 0-100
}

export type BenchmarkResults = Record<string, Record<string, CellResult>>;

export type OptimizeFor = 'accuracy' | 'savings' | 'balanced';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RecommendOptions {
  optimizeFor?: OptimizeFor;
  samplesPerCell?: number;
}

export interface Recommendation {
  profile: string;
  operators: OperatorConfig;
  confidence: ConfidenceLevel;
  score: number;
  rationale: string;
  alternatives: Array<{ profile: string; score: number; reason: string }>;
  disqualified: Array<{ profile: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Condition-to-Operator Map
// ---------------------------------------------------------------------------

export const CONDITION_TO_OPERATORS: Record<string, OperatorConfig> = {
  baseline: {
    sdm: false, tas: false, dro: false, cfl: false,
    cfo: false, cas: false, sad: false, ccp: false,
  },
  conservative: {
    sdm: true, tas: false, dro: false, cfl: false,
    cfo: false, cas: false, sad: false, ccp: false,
  },
  balanced: {
    sdm: true, tas: true, dro: true, cfl: false,
    cfo: true, cas: true, sad: false, ccp: true,
  },
  sensitive: {
    sdm: true, tas: true, dro: true, cfl: true,
    cfo: false, cas: true, sad: false, ccp: true,
  },
  'small-model': {
    sdm: true, tas: true, dro: true, cfl: false,
    cfo: false, cas: false, sad: false, ccp: true,
  },
};

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHTS: Record<OptimizeFor, { savings: number; accuracy: number }> = {
  accuracy: { savings: 0.2, accuracy: 0.8 },
  savings:  { savings: 0.8, accuracy: 0.2 },
  balanced: { savings: 0.5, accuracy: 0.5 },
};

// ---------------------------------------------------------------------------
// Auto-Fallback Builder
// ---------------------------------------------------------------------------

function autoFallback(
  disqualifiedList: Array<{ profile: string; reason: string }>,
): Recommendation {
  return {
    profile: 'auto',
    operators: { ...CONSERVATIVE_OPS },
    confidence: 'LOW',
    score: 0,
    rationale:
      'Insufficient benchmark data or all conditions disqualified. Falling back to conservative auto profile (SDM only).',
    alternatives: [],
    disqualified: disqualifiedList,
  };
}

// ---------------------------------------------------------------------------
// Confidence Calculation
// ---------------------------------------------------------------------------

/**
 * Compute a confidence level based on sample size, score margin to the
 * second-best candidate, and the absolute accuracy delta (in percentage
 * points, e.g. 5 for 5pp).
 */
export function computeConfidence(
  samplesPerCell: number,
  margin: number,
  absAccDelta: number,
): ConfidenceLevel {
  // HIGH: strong sample size, clear separation, meaningful accuracy change
  if (samplesPerCell >= 20 && margin >= 0.15 && absAccDelta >= 10) {
    return 'HIGH';
  }

  // MEDIUM: either decent samples + decent margin, OR small samples but huge accuracy effect
  if (
    (samplesPerCell >= 10 && margin >= 0.10) ||
    (samplesPerCell >= 5 && absAccDelta >= 15)
  ) {
    return 'MEDIUM';
  }

  return 'LOW';
}

// ---------------------------------------------------------------------------
// Internal Candidate Type
// ---------------------------------------------------------------------------

interface Candidate {
  condition: string;
  avgSavings: number;
  avgAccuracyDelta: number;
  worstCaseDelta: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Main Recommendation Algorithm
// ---------------------------------------------------------------------------

export function recommend(
  results: BenchmarkResults,
  options?: RecommendOptions,
): Recommendation {
  const optimizeFor: OptimizeFor = options?.optimizeFor ?? 'balanced';
  const samplesPerCell: number = options?.samplesPerCell ?? 1;
  const weights = WEIGHTS[optimizeFor];

  // Gather all tool counts present in the results
  const toolCounts = Object.keys(results);

  // Quick bail: no data at all
  if (toolCounts.length === 0) {
    return autoFallback([]);
  }

  // Collect all unique condition names across all tool counts
  const allConditions = new Set<string>();
  for (const tc of toolCounts) {
    for (const cond of Object.keys(results[tc])) {
      allConditions.add(cond);
    }
  }

  // If only baseline exists, bail
  const nonBaselineConditions = [...allConditions].filter(c => c !== 'baseline');
  if (nonBaselineConditions.length === 0) {
    return autoFallback([]);
  }

  // Score each non-baseline condition
  const candidates: Candidate[] = [];
  const disqualified: Array<{ profile: string; reason: string }> = [];

  for (const condition of nonBaselineConditions) {
    const accuracyDeltas: number[] = [];
    const savingsValues: number[] = [];

    for (const tc of toolCounts) {
      const cell = results[tc][condition];
      const baselineCell = results[tc]?.['baseline'];

      if (!cell || !baselineCell) continue;

      // Accuracy delta in fractional form (e.g. 0.05 = +5pp)
      const delta = cell.accuracy - baselineCell.accuracy;
      accuracyDeltas.push(delta);
      savingsValues.push(cell.savingsPercent);
    }

    // Skip conditions with no valid comparison data
    if (accuracyDeltas.length === 0 || savingsValues.length === 0) continue;

    const avgAccuracyDelta =
      accuracyDeltas.reduce((a, b) => a + b, 0) / accuracyDeltas.length;
    const avgSavings =
      savingsValues.reduce((a, b) => a + b, 0) / savingsValues.length;
    const worstCaseDelta = Math.min(...accuracyDeltas);

    // --- Disqualification gates ---

    // Gate 1: insufficient savings
    if (avgSavings < 30) {
      disqualified.push({
        profile: condition,
        reason: `Insufficient savings: ${avgSavings.toFixed(1)}% average (threshold: 30%)`,
      });
      continue;
    }

    // Gate 2: unacceptable accuracy regression (worst case < -5pp)
    if (worstCaseDelta < -0.05) {
      disqualified.push({
        profile: condition,
        reason: `Unacceptable accuracy regression: ${(worstCaseDelta * 100).toFixed(1)}pp worst-case (threshold: -5pp)`,
      });
      continue;
    }

    // --- Scoring ---
    const score =
      weights.savings * (avgSavings / 100) +
      weights.accuracy * Math.max(0, 1 + avgAccuracyDelta);

    candidates.push({
      condition,
      avgSavings,
      avgAccuracyDelta,
      worstCaseDelta,
      score,
    });
  }

  // All conditions disqualified
  if (candidates.length === 0) {
    return autoFallback(disqualified);
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const margin =
    candidates.length >= 2
      ? best.score - candidates[1].score
      : best.score; // single candidate: margin = score itself

  const absAccDelta = Math.abs(best.avgAccuracyDelta) * 100; // convert to percentage points

  const confidence = computeConfidence(samplesPerCell, margin, absAccDelta);

  // Build rationale
  const savingsStr = best.avgSavings.toFixed(1);
  const accDeltaStr =
    best.avgAccuracyDelta >= 0
      ? `+${(best.avgAccuracyDelta * 100).toFixed(1)}pp`
      : `${(best.avgAccuracyDelta * 100).toFixed(1)}pp`;
  const rationale =
    `Recommending "${best.condition}" profile: ${savingsStr}% avg savings with ${accDeltaStr} accuracy delta. ` +
    `Score: ${best.score.toFixed(4)} (optimized for ${optimizeFor}). ` +
    `Confidence: ${confidence} (n=${samplesPerCell}, margin=${margin.toFixed(4)}).`;

  // Build alternatives (all non-best candidates)
  const alternatives = candidates.slice(1).map(c => ({
    profile: c.condition,
    score: c.score,
    reason:
      `${c.avgSavings.toFixed(1)}% savings, ` +
      `${c.avgAccuracyDelta >= 0 ? '+' : ''}${(c.avgAccuracyDelta * 100).toFixed(1)}pp accuracy delta`,
  }));

  // Resolve operators: use CONDITION_TO_OPERATORS if available, else fall back to conservative
  const operators: OperatorConfig =
    CONDITION_TO_OPERATORS[best.condition] ?? { ...CONSERVATIVE_OPS };

  return {
    profile: best.condition,
    operators,
    confidence,
    score: best.score,
    rationale,
    alternatives,
    disqualified,
  };
}

// ---------------------------------------------------------------------------
// Per-Operator Optimal Profile Selection (v1.4.2)
// ---------------------------------------------------------------------------

/** Input format for selectOptimalProfile — matches SweepResult from harness */
export interface OperatorSweepEntry {
  condition: string;
  operator: string;
  accuracy: number;
  correct: number;
  total: number;
}

export interface OptimalProfileResult {
  operators: OperatorConfig;
  classifications: Record<string, 'helpful' | 'neutral' | 'harmful'>;
  classification: 'compression-friendly' | 'partial-sensitive' | 'combination-fragile';
  confidence: ConfidenceLevel;
  rationale: string;
  verificationRecommended: boolean;
}

const HELPFUL_PP = 0.025;  // +2.5pp
const HARMFUL_PP = -0.025; // -2.5pp

/**
 * Derive optimal operator profile from per-operator sweep results.
 *
 * Classification rules:
 * - helpful:  delta >= +2.5pp above baseline-no-ops
 * - harmful:  delta <= -2.5pp below baseline-no-ops
 * - neutral:  between thresholds
 *
 * Combination-fragile detection (Scenario B):
 * If >= 4 neutral AND >= 1 harmful → LOW confidence, override to SDM-only conservative.
 *
 * Otherwise: enable helpful + neutral operators, exclude harmful.
 */
export function selectOptimalProfile(sweepResults: OperatorSweepEntry[]): OptimalProfileResult {
  const baseline = sweepResults.find(r => r.operator === 'none');
  const baselineAcc = baseline?.accuracy ?? 0;

  const classifications: Record<string, 'helpful' | 'neutral' | 'harmful'> = {};
  let helpfulCount = 0;
  let neutralCount = 0;
  let harmfulCount = 0;

  for (const r of sweepResults) {
    if (r.operator === 'none') continue;
    const delta = Math.round((r.accuracy - baselineAcc) * 1e6) / 1e6;
    if (delta >= HELPFUL_PP) {
      classifications[r.operator] = 'helpful';
      helpfulCount++;
    } else if (delta <= HARMFUL_PP) {
      classifications[r.operator] = 'harmful';
      harmfulCount++;
    } else {
      classifications[r.operator] = 'neutral';
      neutralCount++;
    }
  }

  // Build optimal operator set: enable helpful + neutral, exclude harmful
  const ops: OperatorConfig = { ...CONSERVATIVE_OPS }; // start from all-off
  for (const key of Object.keys(ops)) {
    const cls = classifications[key];
    (ops as unknown as Record<string, boolean>)[key] =
      cls === 'helpful' || cls === 'neutral';
  }

  // Combination-fragile detection (Scenario B: GPT-5.5 pattern)
  let classification: OptimalProfileResult['classification'];
  let confidence: ConfidenceLevel;
  let verificationRecommended = false;

  if (neutralCount >= 4 && harmfulCount >= 1) {
    classification = 'combination-fragile';
    confidence = 'LOW';
    verificationRecommended = true;
    // Override to SDM-only conservative
    for (const key of Object.keys(ops)) {
      (ops as unknown as Record<string, boolean>)[key] = key === 'sdm';
    }
  } else if (helpfulCount >= 3) {
    classification = 'compression-friendly';
    confidence = 'HIGH';
  } else {
    classification = 'partial-sensitive';
    confidence = 'MEDIUM';
    verificationRecommended = harmfulCount > 0;
  }

  // Build rationale
  const enabledStrs: string[] = [];
  const excludedStrs: string[] = [];

  for (const r of sweepResults) {
    if (r.operator === 'none') continue;
    const delta = ((r.accuracy - baselineAcc) * 100).toFixed(1);
    const sign = Number(delta) >= 0 ? '+' : '';
    const cls = classifications[r.operator];
    if (cls === 'harmful') {
      excludedStrs.push(`${r.operator.toUpperCase()}(${sign}${delta}pp)`);
    } else {
      enabledStrs.push(`${r.operator.toUpperCase()}(${sign}${delta}pp)`);
    }
  }

  const rationale =
    `enabled=[${enabledStrs.join(',')}], excluded=[${excludedStrs.join(',')}]. ` +
    `${classification} (${helpfulCount}H/${neutralCount}N/${harmfulCount}X). ` +
    `Confidence: ${confidence}.` +
    (classification === 'combination-fragile'
      ? ' Overridden to SDM-only conservative.'
      : '');

  return {
    operators: ops,
    classifications,
    classification,
    confidence,
    rationale,
    verificationRecommended,
  };
}
