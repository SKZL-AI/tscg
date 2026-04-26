/**
 * @tscg/openclaw — Static Profile Map + Size Heuristic
 *
 * 13 static profiles for known model families + parameter-count
 * heuristic for cold-start resolution of unknown models.
 */

/** All 8 TSCG operator toggles. Every field is required. */
export interface OperatorConfig {
  sdm: boolean;
  tas: boolean;
  dro: boolean;
  cfl: boolean;
  cfo: boolean;
  cas: boolean;
  sad: boolean;
  ccp: boolean;
}

/** A static profile entry for a known model family */
export interface StaticProfile {
  name: string;
  archetype: 'hungry' | 'robust' | 'sensitive' | 'small-model' | 'safe-fallback';
  matchPatterns: RegExp[];
  operators: OperatorConfig;
  rationale: string;
  expectedSavings: string;
}

// ---------------------------------------------------------------------------
// Operator Config Constants
// ---------------------------------------------------------------------------

/** All 8 operators enabled. For frontier models that tolerate aggressive compression. */
export const CLAUDE_HUNGRY_OPS: OperatorConfig = {
  sdm: true,
  tas: true,
  dro: true,
  cfl: true,
  cfo: true,
  cas: true,
  sad: true,
  ccp: true,
};

/** CFO and SAD disabled. For GPT-class models sensitive to field reordering and aggressive deduplication. */
export const GPT_SENSITIVE_OPS: OperatorConfig = {
  sdm: true,
  tas: true,
  dro: true,
  cfl: true,
  cfo: false,
  cas: true,
  sad: false,
  ccp: true,
};

/** Only structural operators. For smaller/local models where aggressive transforms risk accuracy loss. */
export const SMALL_MODEL_OPS: OperatorConfig = {
  sdm: true,
  tas: true,
  dro: true,
  cfl: false,
  cfo: false,
  cas: false,
  sad: false,
  ccp: true,
};

/** Minimal safe-only operators. SDM only — guaranteed lossless baseline. */
export const CONSERVATIVE_OPS: OperatorConfig = {
  sdm: true,
  tas: false,
  dro: false,
  cfl: false,
  cfo: false,
  cas: false,
  sad: false,
  ccp: false,
};

// ---------------------------------------------------------------------------
// Static Profiles — 13 entries
// ---------------------------------------------------------------------------

export const STATIC_PROFILES: StaticProfile[] = [
  // --- Claude family (3) ---
  {
    name: 'claude-opus',
    archetype: 'hungry',
    matchPatterns: [/claude.*opus/, /opus/i],
    operators: CLAUDE_HUNGRY_OPS,
    rationale:
      'Opus-class models handle all 8 operators with zero accuracy loss in 720-call benchmarks.',
    expectedSavings: '55-70% token reduction',
  },
  {
    name: 'claude-sonnet',
    archetype: 'robust',
    matchPatterns: [/claude.*sonnet/, /sonnet/i],
    operators: CLAUDE_HUNGRY_OPS,
    rationale:
      'Sonnet tolerates full operator set. 720-call benchmark confirms robust performance under all transforms.',
    expectedSavings: '55-70% token reduction',
  },
  {
    name: 'claude-haiku',
    archetype: 'robust',
    matchPatterns: [/claude.*haiku/, /haiku/i],
    operators: CLAUDE_HUNGRY_OPS,
    rationale:
      'Haiku handles all operators well despite smaller size. Speed-optimized model still robust under compression.',
    expectedSavings: '55-70% token reduction',
  },

  // --- GPT family (2) ---
  {
    name: 'gpt-5',
    archetype: 'sensitive',
    matchPatterns: [/gpt[-.]?5/],
    operators: GPT_SENSITIVE_OPS,
    rationale:
      'GPT-5 class is sensitive to field reordering (CFO) and aggressive dedup (SAD). Other operators safe.',
    expectedSavings: '40-55% token reduction',
  },
  {
    name: 'gpt-4',
    archetype: 'sensitive',
    matchPatterns: [/gpt[-.]?4/, /gpt-4o/],
    operators: GPT_SENSITIVE_OPS,
    rationale:
      'GPT-4/4o variants show sensitivity to canonical field ordering and sub-array dedup. Conservative on those two.',
    expectedSavings: '40-55% token reduction',
  },

  // --- Local / open-weight models (7) ---
  {
    name: 'qwen3',
    archetype: 'small-model',
    matchPatterns: [/qwen[-.]?3/, /qwen[-.]?2\.5/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'Qwen-class local models benefit from structural compression but risk accuracy under semantic transforms.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'phi4',
    archetype: 'small-model',
    matchPatterns: [/phi[-.]?4/, /phi[-.]?3/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'Phi family is compact by design. Structural operators safe; semantic operators may exceed model capacity.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'llama3.1',
    archetype: 'small-model',
    matchPatterns: [/llama[-.]?3/, /llama[-.]?2/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'LLaMA models vary by size but small-model defaults are safe across the family. Benchmark to unlock more.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'gemma3',
    archetype: 'small-model',
    matchPatterns: [/gemma[-.]?3/, /gemma[-.]?2/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'Gemma family trained for efficiency. Structural compression additive; semantic transforms not yet validated.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'mistral',
    archetype: 'small-model',
    matchPatterns: [/mistral/, /mixtral/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'Mistral/Mixtral benefit from structural compression. MoE architecture handles dedup but not field reordering.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'deepseek-v3',
    archetype: 'small-model',
    matchPatterns: [/deepseek[-.]?v3/, /deepseek[-.]?v2/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'DeepSeek V3/V2 are capable but not yet benchmarked under full TSCG. Structural operators safe default.',
    expectedSavings: '30-45% token reduction',
  },
  {
    name: 'deepseek-r1',
    archetype: 'small-model',
    matchPatterns: [/deepseek[-.]?r1/],
    operators: SMALL_MODEL_OPS,
    rationale:
      'DeepSeek-R1 reasoning model. Structural compression safe; semantic operators may interfere with CoT.',
    expectedSavings: '30-45% token reduction',
  },

  // --- Fallback (1) ---
  {
    name: 'auto',
    archetype: 'safe-fallback',
    matchPatterns: [],
    operators: CONSERVATIVE_OPS,
    rationale:
      'Unknown model — apply only guaranteed-safe SDM. Benchmark or size heuristic can upgrade later.',
    expectedSavings: '10-20% token reduction',
  },
];

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Normalize a model string for matching: lowercase, trim, replace
 * whitespace and underscores with dashes.
 */
export function normalizeModelString(model: string): string {
  return model.toLowerCase().trim().replace(/[\s_]+/g, '-');
}

/**
 * Match a model string against the static profile table.
 * Returns the first matching profile, or null if no pattern matches.
 * The 'auto' entry (empty matchPatterns) is never returned by this function.
 */
export function matchStaticProfile(modelString: string): StaticProfile | null {
  const normalized = normalizeModelString(modelString);

  for (const profile of STATIC_PROFILES) {
    // Skip profiles with no patterns (auto fallback)
    if (profile.matchPatterns.length === 0) continue;

    for (const pattern of profile.matchPatterns) {
      if (pattern.test(normalized)) {
        return profile;
      }
    }
  }

  return null;
}

/**
 * Size-heuristic fallback: extract parameter count from model string
 * (e.g. "7b", "70b", "405b") and return a synthetic profile based
 * on size thresholds.
 *
 * Thresholds:
 *   <40B  → small-model (SMALL_MODEL_OPS)
 *   40-99B → robust (CLAUDE_HUNGRY_OPS minus cfl, sad)
 *   >=100B → hungry (CLAUDE_HUNGRY_OPS)
 *
 * Returns null if no parameter count is detected.
 */
export function sizeHeuristicProfile(modelString: string): StaticProfile | null {
  const normalized = normalizeModelString(modelString);
  const match = normalized.match(/\b(\d+)b\b/i);

  if (!match) return null;

  const paramBillions = parseInt(match[1], 10);

  if (paramBillions < 40) {
    return {
      name: 'size-heuristic-small',
      archetype: 'small-model',
      matchPatterns: [],
      operators: { ...SMALL_MODEL_OPS },
      rationale: `Detected ${paramBillions}B parameters — applying small-model operators for safety.`,
      expectedSavings: '30-45% token reduction',
    };
  }

  if (paramBillions < 100) {
    return {
      name: 'size-heuristic-robust',
      archetype: 'robust',
      matchPatterns: [],
      operators: {
        ...CLAUDE_HUNGRY_OPS,
        cfl: false,
        sad: false,
      },
      rationale: `Detected ${paramBillions}B parameters — mid-size model, enabling most operators but disabling cfl and sad for safety.`,
      expectedSavings: '40-55% token reduction',
    };
  }

  // >= 100B
  return {
    name: 'size-heuristic-hungry',
    archetype: 'hungry',
    matchPatterns: [],
    operators: { ...CLAUDE_HUNGRY_OPS },
    rationale: `Detected ${paramBillions}B parameters — large model, enabling all operators.`,
    expectedSavings: '55-70% token reduction',
  };
}
