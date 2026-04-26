import { describe, it, expect } from 'vitest';
import {
  recommend,
  computeConfidence,
  selectOptimalProfile,
  CONDITION_TO_OPERATORS,
  type BenchmarkResults,
  type OperatorSweepEntry,
} from '../src/recommendation.js';

// ---------------------------------------------------------------------------
// Helpers — synthetic benchmark result builders
// ---------------------------------------------------------------------------

/** Build a cell result shorthand */
function cell(accuracy: number, avgTokens: number, savingsPercent: number) {
  return { accuracy, avgTokens, savingsPercent };
}

// ---------------------------------------------------------------------------
// Test 1: Balanced dominates
// ---------------------------------------------------------------------------
describe('recommend — balanced dominates', () => {
  it('recommends balanced when it has 60% savings and +5pp accuracy', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:      cell(0.75, 5000, 0),
        balanced:      cell(0.80, 2000, 60),
        'small-model': cell(0.73, 2500, 50),
      },
      '50': {
        baseline:      cell(0.70, 15000, 0),
        balanced:      cell(0.75, 6000, 60),
        'small-model': cell(0.72, 7500, 50),
      },
    };

    const rec = recommend(results);
    expect(rec.profile).toBe('balanced');
    expect(rec.score).toBeGreaterThan(0);
    expect(rec.operators).toEqual(CONDITION_TO_OPERATORS['balanced']);
    expect(rec.disqualified).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Small-model wins when balanced regresses at high tool count
// ---------------------------------------------------------------------------
describe('recommend — small-model wins over regressing balanced', () => {
  it('recommends small-model when balanced has -10pp regression at 50 tools', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:      cell(0.80, 5000, 0),
        balanced:      cell(0.82, 2000, 60),   // +2pp at 10 tools
        'small-model': cell(0.79, 2500, 50),   // -1pp at 10 tools
      },
      '50': {
        baseline:      cell(0.80, 15000, 0),
        balanced:      cell(0.70, 6000, 60),   // -10pp at 50 tools: triggers worst-case gate
        'small-model': cell(0.78, 7500, 50),   // -2pp at 50 tools: within -5pp threshold
      },
    };

    const rec = recommend(results);
    // balanced should be disqualified for worst-case regression
    expect(rec.profile).toBe('small-model');
    expect(rec.disqualified.some(d => d.profile === 'balanced')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: All disqualified — falls back to auto
// ---------------------------------------------------------------------------
describe('recommend — all conditions disqualified', () => {
  it('returns auto fallback when all conditions have < 30% savings', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:     cell(0.80, 5000, 0),
        conservative: cell(0.80, 4000, 20),   // 20% savings < 30% threshold
        balanced:     cell(0.82, 3800, 25),   // 25% savings < 30% threshold
      },
      '50': {
        baseline:     cell(0.75, 15000, 0),
        conservative: cell(0.75, 12000, 20),
        balanced:     cell(0.77, 11500, 25),
      },
    };

    const rec = recommend(results);
    expect(rec.profile).toBe('auto');
    expect(rec.confidence).toBe('LOW');
    expect(rec.score).toBe(0);
    expect(rec.disqualified.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Accuracy regression disqualifies
// ---------------------------------------------------------------------------
describe('recommend — accuracy regression disqualifies', () => {
  it('disqualifies balanced when it has -10pp worst-case regression', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 5000, 0),
        balanced: cell(0.85, 2000, 60),    // +5pp at 10 tools (looks great)
      },
      '50': {
        baseline: cell(0.80, 15000, 0),
        balanced: cell(0.70, 6000, 60),    // -10pp at 50 tools (disaster)
      },
    };

    const rec = recommend(results);
    expect(rec.profile).toBe('auto');
    expect(rec.disqualified).toHaveLength(1);
    expect(rec.disqualified[0].profile).toBe('balanced');
    expect(rec.disqualified[0].reason).toContain('accuracy regression');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Empty results
// ---------------------------------------------------------------------------
describe('recommend — empty results', () => {
  it('returns auto with LOW confidence for empty results object', () => {
    const rec = recommend({});
    expect(rec.profile).toBe('auto');
    expect(rec.confidence).toBe('LOW');
    expect(rec.score).toBe(0);
    expect(rec.alternatives).toHaveLength(0);
    expect(rec.disqualified).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Results with only baseline
// ---------------------------------------------------------------------------
describe('recommend — only baseline data', () => {
  it('returns auto with LOW confidence when only baseline exists', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 5000, 0),
      },
      '50': {
        baseline: cell(0.75, 15000, 0),
      },
    };

    const rec = recommend(results);
    expect(rec.profile).toBe('auto');
    expect(rec.confidence).toBe('LOW');
    expect(rec.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7: optimizeFor=savings favors high savings even with slight regression
// ---------------------------------------------------------------------------
describe('recommend — optimizeFor=savings', () => {
  it('picks high-savings condition over high-accuracy condition', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:  cell(0.80, 10000, 0),
        balanced:  cell(0.78, 3000, 70),    // -2pp but 70% savings
        sensitive: cell(0.85, 6000, 40),    // +5pp but 40% savings
      },
      '50': {
        baseline:  cell(0.80, 20000, 0),
        balanced:  cell(0.78, 6000, 70),    // -2pp but 70% savings
        sensitive: cell(0.85, 12000, 40),   // +5pp but 40% savings
      },
    };

    const rec = recommend(results, { optimizeFor: 'savings' });
    expect(rec.profile).toBe('balanced');
  });
});

// ---------------------------------------------------------------------------
// Test 8: optimizeFor=accuracy favors accuracy improvement
// ---------------------------------------------------------------------------
describe('recommend — optimizeFor=accuracy', () => {
  it('picks high-accuracy condition over high-savings condition', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:      cell(0.70, 10000, 0),
        balanced:      cell(0.78, 3500, 65),     // +8pp, 65% savings
        'small-model': cell(0.71, 4000, 60),     // +1pp, 60% savings
      },
      '50': {
        baseline:      cell(0.70, 25000, 0),
        balanced:      cell(0.78, 8750, 65),     // +8pp, 65% savings
        'small-model': cell(0.71, 10000, 60),    // +1pp, 60% savings
      },
    };

    const rec = recommend(results, { optimizeFor: 'accuracy' });
    // balanced has +8pp accuracy delta, small-model only +1pp
    // With accuracy weight=0.8, balanced should dominate
    expect(rec.profile).toBe('balanced');

    // Now verify small-model appears in alternatives, not disqualified
    expect(rec.alternatives.some(a => a.profile === 'small-model')).toBe(true);
    expect(rec.disqualified).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 9: HIGH confidence — n=20, clear margin, big accuracy delta
// ---------------------------------------------------------------------------
describe('computeConfidence — HIGH', () => {
  it('returns HIGH when n>=20, margin>=0.15, absAccDelta>=10', () => {
    expect(computeConfidence(20, 0.15, 10)).toBe('HIGH');
    expect(computeConfidence(30, 0.20, 15)).toBe('HIGH');
    expect(computeConfidence(25, 0.30, 12)).toBe('HIGH');
  });

  it('does not return HIGH when any condition is below threshold', () => {
    expect(computeConfidence(19, 0.15, 10)).not.toBe('HIGH'); // n too low
    expect(computeConfidence(20, 0.14, 10)).not.toBe('HIGH'); // margin too low
    expect(computeConfidence(20, 0.15, 9)).not.toBe('HIGH');  // absAccDelta too low
  });
});

// ---------------------------------------------------------------------------
// Test 10: LOW confidence — n=5, close margins
// ---------------------------------------------------------------------------
describe('computeConfidence — LOW', () => {
  it('returns LOW when samples are small and margins are close', () => {
    expect(computeConfidence(3, 0.05, 3)).toBe('LOW');
    expect(computeConfidence(4, 0.08, 8)).toBe('LOW');
    expect(computeConfidence(1, 0.01, 1)).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// Test 10b: MEDIUM confidence paths
// ---------------------------------------------------------------------------
describe('computeConfidence — MEDIUM', () => {
  it('returns MEDIUM via path 1: n>=10 and margin>=0.10', () => {
    expect(computeConfidence(10, 0.10, 5)).toBe('MEDIUM');
    expect(computeConfidence(15, 0.12, 3)).toBe('MEDIUM');
  });

  it('returns MEDIUM via path 2: n>=5 and absAccDelta>=15', () => {
    expect(computeConfidence(5, 0.05, 15)).toBe('MEDIUM');
    expect(computeConfidence(8, 0.02, 20)).toBe('MEDIUM');
  });
});

// ---------------------------------------------------------------------------
// Test 11: CONDITION_TO_OPERATORS completeness
// ---------------------------------------------------------------------------
describe('CONDITION_TO_OPERATORS — completeness', () => {
  const expectedKeys = ['sdm', 'tas', 'dro', 'cfl', 'cfo', 'cas', 'sad', 'ccp'];

  it('has exactly 5 conditions', () => {
    expect(Object.keys(CONDITION_TO_OPERATORS)).toHaveLength(5);
  });

  it('every condition has exactly 8 boolean keys', () => {
    for (const [name, ops] of Object.entries(CONDITION_TO_OPERATORS)) {
      const keys = Object.keys(ops);
      expect(keys).toHaveLength(8);
      for (const key of expectedKeys) {
        expect(ops).toHaveProperty(key);
        expect(typeof ops[key as keyof typeof ops]).toBe('boolean');
      }
      // Also verify no extra keys
      for (const key of keys) {
        expect(expectedKeys).toContain(key);
      }
    }
  });

  it('baseline has all operators false', () => {
    const baseline = CONDITION_TO_OPERATORS['baseline'];
    for (const key of expectedKeys) {
      expect(baseline[key as keyof typeof baseline]).toBe(false);
    }
  });

  it('balanced enables expected operators', () => {
    const bal = CONDITION_TO_OPERATORS['balanced'];
    expect(bal.sdm).toBe(true);
    expect(bal.tas).toBe(true);
    expect(bal.dro).toBe(true);
    expect(bal.cfl).toBe(false);
    expect(bal.cfo).toBe(true);
    expect(bal.cas).toBe(true);
    expect(bal.sad).toBe(false);
    expect(bal.ccp).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 12: Disqualified list is populated in result
// ---------------------------------------------------------------------------
describe('recommend — disqualified list', () => {
  it('populates disqualified array with reasons for each failed condition', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:     cell(0.80, 5000, 0),
        conservative: cell(0.80, 4000, 20),   // fails: < 30% savings
        balanced:     cell(0.60, 2000, 60),   // fails: -20pp regression
        'small-model': cell(0.79, 2500, 50),  // passes: -1pp only, 50% savings
      },
      '50': {
        baseline:     cell(0.80, 15000, 0),
        conservative: cell(0.80, 12000, 20),
        balanced:     cell(0.55, 6000, 60),   // even worse regression
        'small-model': cell(0.78, 7500, 50),
      },
    };

    const rec = recommend(results);
    // conservative disqualified for low savings
    expect(rec.disqualified.some(d => d.profile === 'conservative')).toBe(true);
    // balanced disqualified for accuracy regression
    expect(rec.disqualified.some(d => d.profile === 'balanced')).toBe(true);
    // small-model should be the winner
    expect(rec.profile).toBe('small-model');
    expect(rec.disqualified).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test 13: Recommendation rationale contains key information
// ---------------------------------------------------------------------------
describe('recommend — rationale content', () => {
  it('includes savings, accuracy delta, score, and confidence in rationale', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.75, 5000, 0),
        balanced: cell(0.80, 2000, 60),
      },
      '50': {
        baseline: cell(0.70, 15000, 0),
        balanced: cell(0.75, 6000, 60),
      },
    };

    const rec = recommend(results, { samplesPerCell: 5 });
    expect(rec.rationale).toContain('balanced');
    expect(rec.rationale).toContain('60.0%');
    expect(rec.rationale).toContain('+5.0pp');
    expect(rec.rationale).toContain('Score:');
    expect(rec.rationale).toContain('Confidence:');
  });
});

// ---------------------------------------------------------------------------
// Test 14: Score formula verification
// ---------------------------------------------------------------------------
describe('recommend — score formula', () => {
  it('computes correct score with balanced weights', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 10000, 0),
        balanced: cell(0.80, 4000, 60),  // 0pp delta, 60% savings
      },
    };

    const rec = recommend(results, { optimizeFor: 'balanced' });
    // score = 0.5 * (60/100) + 0.5 * max(0, 1 + 0) = 0.5 * 0.6 + 0.5 * 1.0 = 0.3 + 0.5 = 0.8
    expect(rec.score).toBeCloseTo(0.8, 4);
  });

  it('computes correct score with savings weights', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 10000, 0),
        balanced: cell(0.80, 4000, 60),
      },
    };

    const rec = recommend(results, { optimizeFor: 'savings' });
    // score = 0.8 * (60/100) + 0.2 * max(0, 1 + 0) = 0.8 * 0.6 + 0.2 * 1.0 = 0.48 + 0.2 = 0.68
    expect(rec.score).toBeCloseTo(0.68, 4);
  });

  it('computes correct score with accuracy weights', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 10000, 0),
        balanced: cell(0.80, 4000, 60),
      },
    };

    const rec = recommend(results, { optimizeFor: 'accuracy' });
    // score = 0.2 * (60/100) + 0.8 * max(0, 1 + 0) = 0.2 * 0.6 + 0.8 * 1.0 = 0.12 + 0.8 = 0.92
    expect(rec.score).toBeCloseTo(0.92, 4);
  });
});

// ---------------------------------------------------------------------------
// Test 15: Confidence integration in recommend()
// ---------------------------------------------------------------------------
describe('recommend — confidence integration', () => {
  it('returns HIGH confidence with adequate samples, margin, and accuracy delta', () => {
    // Need: n >= 20, margin >= 0.15, absAccDelta >= 10pp
    // Single candidate (margin = score itself), accuracy delta = +10pp
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.70, 10000, 0),
        balanced: cell(0.80, 3000, 70),  // +10pp, 70% savings
      },
    };

    // balanced score = 0.5 * 0.7 + 0.5 * max(0, 1.1) = 0.35 + 0.55 = 0.90
    // margin = 0.90 (single candidate), absAccDelta = 10
    const rec = recommend(results, { samplesPerCell: 20 });
    expect(rec.confidence).toBe('HIGH');
  });

  it('returns LOW confidence with tiny sample size and close margins', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline:      cell(0.80, 10000, 0),
        balanced:      cell(0.80, 4000, 60),   // 0pp, 60% savings
        'small-model': cell(0.80, 4500, 55),   // 0pp, 55% savings
      },
    };

    const rec = recommend(results, { samplesPerCell: 3 });
    // Both have 0pp accuracy delta → absAccDelta = 0
    // Scores are close → small margin
    expect(rec.confidence).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// Test 16: Edge case — negative accuracy delta clamps in score
// ---------------------------------------------------------------------------
describe('recommend — negative accuracy clamping', () => {
  it('clamps 1+delta at 0 when delta is severely negative (but within -5pp gate)', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 10000, 0),
        balanced: cell(0.76, 3000, 70),  // -4pp (just within gate), 70% savings
      },
    };

    const rec = recommend(results, { optimizeFor: 'balanced' });
    // delta = -0.04, 1 + (-0.04) = 0.96
    // score = 0.5 * 0.7 + 0.5 * max(0, 0.96) = 0.35 + 0.48 = 0.83
    expect(rec.score).toBeCloseTo(0.83, 4);
    expect(rec.profile).toBe('balanced');
  });
});

// ---------------------------------------------------------------------------
// Test 17: Multiple tool counts averaging
// ---------------------------------------------------------------------------
describe('recommend — multiple tool count averaging', () => {
  it('averages metrics across tool counts correctly', () => {
    const results: BenchmarkResults = {
      '10': {
        baseline: cell(0.80, 5000, 0),
        balanced: cell(0.84, 2000, 50),  // +4pp, 50% savings
      },
      '50': {
        baseline: cell(0.80, 15000, 0),
        balanced: cell(0.86, 4500, 70),  // +6pp, 70% savings
      },
    };

    const rec = recommend(results, { optimizeFor: 'balanced' });
    // avgAccDelta = (0.04 + 0.06) / 2 = 0.05
    // avgSavings = (50 + 70) / 2 = 60
    // score = 0.5 * (60/100) + 0.5 * max(0, 1 + 0.05)
    //       = 0.5 * 0.6 + 0.5 * 1.05
    //       = 0.30 + 0.525 = 0.825
    expect(rec.score).toBeCloseTo(0.825, 4);
  });
});

// ===========================================================================
// selectOptimalProfile() tests — per-operator sweep classification
// ===========================================================================

// ---------------------------------------------------------------------------
// Helper — build sweep entries from accuracy map
// ---------------------------------------------------------------------------

function sweepEntry(operator: string, accuracy: number, total = 20): OperatorSweepEntry {
  return {
    condition: operator === 'none' ? 'baseline-no-ops' : `${operator}-only`,
    operator,
    accuracy,
    correct: Math.round(accuracy * total),
    total,
  };
}

// ---------------------------------------------------------------------------
// Test 18: GPT-5.4 — compression-friendly (real Step 5.8 data)
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — GPT-5.4 (compression-friendly)', () => {
  const sweepData: OperatorSweepEntry[] = [
    sweepEntry('none', 0.70),   // baseline-no-ops
    sweepEntry('sdm', 0.60),    // -10.0pp → harmful
    sweepEntry('tas', 0.75),    // +5.0pp  → helpful
    sweepEntry('dro', 0.70),    // +0.0pp  → neutral
    sweepEntry('cfl', 0.75),    // +5.0pp  → helpful
    sweepEntry('cfo', 0.85),    // +15.0pp → helpful
    sweepEntry('cas', 0.75),    // +5.0pp  → helpful
    sweepEntry('sad', 0.70),    // +0.0pp  → neutral
    sweepEntry('ccp', 0.75),    // +5.0pp  → helpful
  ];

  it('classifies as compression-friendly', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.classification).toBe('compression-friendly');
  });

  it('returns HIGH confidence (5 helpful operators)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.confidence).toBe('HIGH');
  });

  it('excludes SDM (harmful at -10pp)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.sdm).toBe(false);
    expect(result.classifications['sdm']).toBe('harmful');
  });

  it('enables all helpful + neutral operators', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.tas).toBe(true);   // helpful
    expect(result.operators.dro).toBe(true);   // neutral
    expect(result.operators.cfl).toBe(true);   // helpful
    expect(result.operators.cfo).toBe(true);   // helpful
    expect(result.operators.cas).toBe(true);   // helpful
    expect(result.operators.sad).toBe(true);   // neutral
    expect(result.operators.ccp).toBe(true);   // helpful
  });

  it('does NOT recommend verification (no combination-fragile)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.verificationRecommended).toBe(false);
  });

  it('classifies CFO as helpful (+15pp — most helpful single operator)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.classifications['cfo']).toBe('helpful');
  });
});

// ---------------------------------------------------------------------------
// Test 19: GPT-5.5 — partial-sensitive (real Step 5.8 data)
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — GPT-5.5 (partial-sensitive)', () => {
  const sweepData: OperatorSweepEntry[] = [
    sweepEntry('none', 0.80),   // baseline-no-ops
    sweepEntry('sdm', 0.85),    // +5.0pp  → helpful
    sweepEntry('tas', 0.80),    // +0.0pp  → neutral
    sweepEntry('dro', 0.75),    // -5.0pp  → harmful
    sweepEntry('cfl', 0.75),    // -5.0pp  → harmful
    sweepEntry('cfo', 0.80),    // +0.0pp  → neutral
    sweepEntry('cas', 0.85),    // +5.0pp  → helpful
    sweepEntry('sad', 0.85),    // +5.0pp  → helpful
    sweepEntry('ccp', 0.80),    // +0.0pp  → neutral
  ];

  it('classifies as compression-friendly (3H/3N/2X — 3 helpful >= threshold)', () => {
    const result = selectOptimalProfile(sweepData);
    // 3 helpful (SDM, CAS, SAD), 3 neutral (TAS, CFO, CCP), 2 harmful (DRO, CFL)
    // NOT combination-fragile (not ≥4 neutral + ≥1 harmful)
    // helpfulCount=3 >= 3 → compression-friendly
    expect(result.classification).toBe('compression-friendly');
  });

  it('excludes DRO and CFL (harmful at -5pp)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.dro).toBe(false);
    expect(result.operators.cfl).toBe(false);
    expect(result.classifications['dro']).toBe('harmful');
    expect(result.classifications['cfl']).toBe('harmful');
  });

  it('enables helpful + neutral operators', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.sdm).toBe(true);   // helpful
    expect(result.operators.tas).toBe(true);   // neutral
    expect(result.operators.cfo).toBe(true);   // neutral
    expect(result.operators.cas).toBe(true);   // helpful
    expect(result.operators.sad).toBe(true);   // helpful
    expect(result.operators.ccp).toBe(true);   // neutral
  });
});

// ---------------------------------------------------------------------------
// Test 20: Combination-fragile scenario (synthetic, matches Scenario B)
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — combination-fragile (Scenario B)', () => {
  // ≥4 neutral AND ≥1 harmful triggers combination-fragile
  const sweepData: OperatorSweepEntry[] = [
    sweepEntry('none', 0.80),   // baseline
    sweepEntry('sdm', 0.81),    // +1pp  → neutral
    sweepEntry('tas', 0.80),    // +0pp  → neutral
    sweepEntry('dro', 0.79),    // -1pp  → neutral
    sweepEntry('cfl', 0.81),    // +1pp  → neutral
    sweepEntry('cfo', 0.74),    // -6pp  → harmful
    sweepEntry('cas', 0.80),    // +0pp  → neutral
    sweepEntry('sad', 0.79),    // -1pp  → neutral
    sweepEntry('ccp', 0.80),    // +0pp  → neutral
  ];

  it('classifies as combination-fragile', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.classification).toBe('combination-fragile');
  });

  it('returns LOW confidence', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.confidence).toBe('LOW');
  });

  it('overrides to SDM-only conservative', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.sdm).toBe(true);
    expect(result.operators.tas).toBe(false);
    expect(result.operators.dro).toBe(false);
    expect(result.operators.cfl).toBe(false);
    expect(result.operators.cfo).toBe(false);
    expect(result.operators.cas).toBe(false);
    expect(result.operators.sad).toBe(false);
    expect(result.operators.ccp).toBe(false);
  });

  it('recommends verification', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.verificationRecommended).toBe(true);
  });

  it('rationale mentions SDM-only override', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.rationale).toContain('SDM-only conservative');
  });
});

// ---------------------------------------------------------------------------
// Test 21: All-neutral scenario
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — all neutral', () => {
  const sweepData: OperatorSweepEntry[] = [
    sweepEntry('none', 0.80),
    sweepEntry('sdm', 0.80),    // 0pp → neutral
    sweepEntry('tas', 0.81),    // +1pp → neutral
    sweepEntry('dro', 0.79),    // -1pp → neutral
    sweepEntry('cfl', 0.80),    // 0pp → neutral
    sweepEntry('cfo', 0.81),    // +1pp → neutral
    sweepEntry('cas', 0.79),    // -1pp → neutral
    sweepEntry('sad', 0.80),    // 0pp → neutral
    sweepEntry('ccp', 0.80),    // 0pp → neutral
  ];

  it('classifies as partial-sensitive (0 helpful, no fragile trigger without harmful)', () => {
    const result = selectOptimalProfile(sweepData);
    // 0 helpful, 8 neutral, 0 harmful
    // NOT ≥4 neutral + ≥1 harmful (no harmful) → NOT combination-fragile
    // NOT ≥3 helpful → NOT compression-friendly
    // → partial-sensitive
    expect(result.classification).toBe('partial-sensitive');
  });

  it('returns MEDIUM confidence', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('enables all operators (all neutral)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.operators.sdm).toBe(true);
    expect(result.operators.tas).toBe(true);
    expect(result.operators.dro).toBe(true);
    expect(result.operators.cfl).toBe(true);
    expect(result.operators.cfo).toBe(true);
    expect(result.operators.cas).toBe(true);
    expect(result.operators.sad).toBe(true);
    expect(result.operators.ccp).toBe(true);
  });

  it('does NOT recommend verification (no harmful operators)', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.verificationRecommended).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 22: All helpful — robust model
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — all helpful', () => {
  const sweepData: OperatorSweepEntry[] = [
    sweepEntry('none', 0.60),
    sweepEntry('sdm', 0.66),    // +6pp → helpful
    sweepEntry('tas', 0.65),    // +5pp → helpful
    sweepEntry('dro', 0.64),    // +4pp → helpful
    sweepEntry('cfl', 0.63),    // +3pp → helpful (just above 2.5pp)
    sweepEntry('cfo', 0.70),    // +10pp → helpful
    sweepEntry('cas', 0.65),    // +5pp → helpful
    sweepEntry('sad', 0.64),    // +4pp → helpful
    sweepEntry('ccp', 0.63),    // +3pp → helpful
  ];

  it('classifies as compression-friendly', () => {
    const result = selectOptimalProfile(sweepData);
    expect(result.classification).toBe('compression-friendly');
    expect(result.confidence).toBe('HIGH');
  });

  it('enables all operators', () => {
    const result = selectOptimalProfile(sweepData);
    for (const key of Object.keys(result.operators)) {
      expect(result.operators[key as keyof typeof result.operators]).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 23: Threshold boundary — exactly at ±2.5pp
// ---------------------------------------------------------------------------
describe('selectOptimalProfile — boundary thresholds', () => {
  it('classifies +2.5pp as helpful (>= threshold)', () => {
    const data: OperatorSweepEntry[] = [
      sweepEntry('none', 0.80),
      sweepEntry('sdm', 0.825),   // +2.5pp exactly
      sweepEntry('tas', 0.80),
      sweepEntry('dro', 0.80),
      sweepEntry('cfl', 0.80),
      sweepEntry('cfo', 0.80),
      sweepEntry('cas', 0.80),
      sweepEntry('sad', 0.80),
      sweepEntry('ccp', 0.80),
    ];
    const result = selectOptimalProfile(data);
    expect(result.classifications['sdm']).toBe('helpful');
  });

  it('classifies -2.5pp as harmful (<= threshold)', () => {
    const data: OperatorSweepEntry[] = [
      sweepEntry('none', 0.80),
      sweepEntry('sdm', 0.775),   // -2.5pp exactly
      sweepEntry('tas', 0.80),
      sweepEntry('dro', 0.80),
      sweepEntry('cfl', 0.80),
      sweepEntry('cfo', 0.80),
      sweepEntry('cas', 0.80),
      sweepEntry('sad', 0.80),
      sweepEntry('ccp', 0.80),
    ];
    const result = selectOptimalProfile(data);
    expect(result.classifications['sdm']).toBe('harmful');
  });

  it('classifies +2.4pp as neutral (below threshold)', () => {
    const data: OperatorSweepEntry[] = [
      sweepEntry('none', 0.80),
      sweepEntry('sdm', 0.824),   // +2.4pp
      sweepEntry('tas', 0.80),
      sweepEntry('dro', 0.80),
      sweepEntry('cfl', 0.80),
      sweepEntry('cfo', 0.80),
      sweepEntry('cas', 0.80),
      sweepEntry('sad', 0.80),
      sweepEntry('ccp', 0.80),
    ];
    const result = selectOptimalProfile(data);
    expect(result.classifications['sdm']).toBe('neutral');
  });
});
