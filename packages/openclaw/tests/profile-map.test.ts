import { describe, it, expect } from 'vitest';
import {
  normalizeModelString,
  matchStaticProfile,
  sizeHeuristicProfile,
  STATIC_PROFILES,
  CLAUDE_HUNGRY_OPS,
  GPT_SENSITIVE_OPS,
  SMALL_MODEL_OPS,
  CONSERVATIVE_OPS,
  type OperatorConfig,
  type StaticProfile,
} from '../src/profile-map.js';

// ---------------------------------------------------------------------------
// Helper: The 8 canonical operator keys
// ---------------------------------------------------------------------------
const OPERATOR_KEYS: (keyof OperatorConfig)[] = [
  'sdm', 'tas', 'dro', 'cfl', 'cfo', 'cas', 'sad', 'ccp',
];

// ---------------------------------------------------------------------------
// normalizeModelString
// ---------------------------------------------------------------------------
describe('normalizeModelString', () => {
  it('lowercases uppercase strings', () => {
    expect(normalizeModelString('CLAUDE-OPUS')).toBe('claude-opus');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeModelString('  claude-opus  ')).toBe('claude-opus');
  });

  it('replaces underscores with dashes', () => {
    expect(normalizeModelString('gpt_4o_mini')).toBe('gpt-4o-mini');
  });

  it('replaces whitespace with dashes', () => {
    expect(normalizeModelString('gpt 4o mini')).toBe('gpt-4o-mini');
  });

  it('handles mixed case, whitespace, and underscores together', () => {
    expect(normalizeModelString('  Claude_Opus 4_7  ')).toBe('claude-opus-4-7');
  });

  it('collapses consecutive whitespace and underscores into a single dash', () => {
    expect(normalizeModelString('foo__bar  baz')).toBe('foo-bar-baz');
  });

  it('preserves dashes already in the string', () => {
    expect(normalizeModelString('meta-llama/llama-3.1-8b')).toBe('meta-llama/llama-3.1-8b');
  });
});

// ---------------------------------------------------------------------------
// matchStaticProfile — 15+ model strings
// ---------------------------------------------------------------------------
describe('matchStaticProfile', () => {
  it('matches "claude-opus-4-7" → claude-opus', () => {
    expect(matchStaticProfile('claude-opus-4-7')?.name).toBe('claude-opus');
  });

  it('matches "anthropic/claude-3-5-sonnet-20241022" → claude-sonnet', () => {
    expect(matchStaticProfile('anthropic/claude-3-5-sonnet-20241022')?.name).toBe('claude-sonnet');
  });

  it('matches "claude-3-haiku" → claude-haiku', () => {
    expect(matchStaticProfile('claude-3-haiku')?.name).toBe('claude-haiku');
  });

  it('matches "gpt-5.2" → gpt-5', () => {
    expect(matchStaticProfile('gpt-5.2')?.name).toBe('gpt-5');
  });

  it('matches "gpt-4o-mini" → gpt-4', () => {
    expect(matchStaticProfile('gpt-4o-mini')?.name).toBe('gpt-4');
  });

  it('matches "ollama/qwen3:14b" → qwen3', () => {
    expect(matchStaticProfile('ollama/qwen3:14b')?.name).toBe('qwen3');
  });

  it('matches "phi-4-mini" → phi4', () => {
    expect(matchStaticProfile('phi-4-mini')?.name).toBe('phi4');
  });

  it('matches "meta-llama/llama-3.1-8b" → llama3.1', () => {
    expect(matchStaticProfile('meta-llama/llama-3.1-8b')?.name).toBe('llama3.1');
  });

  it('matches "google/gemma-3-12b" → gemma3', () => {
    expect(matchStaticProfile('google/gemma-3-12b')?.name).toBe('gemma3');
  });

  it('matches "mistral-7b-instruct" → mistral', () => {
    expect(matchStaticProfile('mistral-7b-instruct')?.name).toBe('mistral');
  });

  it('matches "mixtral-8x7b" → mistral', () => {
    expect(matchStaticProfile('mixtral-8x7b')?.name).toBe('mistral');
  });

  it('matches "deepseek-v3" → deepseek-v3', () => {
    expect(matchStaticProfile('deepseek-v3')?.name).toBe('deepseek-v3');
  });

  it('matches "deepseek-r1-distill-qwen-7b" → deepseek-r1', () => {
    expect(matchStaticProfile('deepseek-r1-distill-qwen-7b')?.name).toBe('deepseek-r1');
  });

  it('returns null for "totally-unknown-model"', () => {
    expect(matchStaticProfile('totally-unknown-model')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(matchStaticProfile('')).toBeNull();
  });

  // Additional edge cases
  it('matches case-insensitive "Opus" standalone → claude-opus', () => {
    expect(matchStaticProfile('Opus')?.name).toBe('claude-opus');
  });

  it('matches "Sonnet" standalone → claude-sonnet', () => {
    expect(matchStaticProfile('Sonnet')?.name).toBe('claude-sonnet');
  });

  it('matches "qwen2.5-72b-instruct" → qwen3 (via qwen2.5 pattern)', () => {
    expect(matchStaticProfile('qwen2.5-72b-instruct')?.name).toBe('qwen3');
  });

  it('never returns the auto profile via pattern matching', () => {
    // Auto has empty matchPatterns and should never be returned
    const result = matchStaticProfile('auto');
    // 'auto' does not match any regex pattern
    expect(result === null || result.name !== 'auto').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Operator completeness — every profile has exactly 8 boolean keys
// ---------------------------------------------------------------------------
describe('operator completeness', () => {
  for (const profile of STATIC_PROFILES) {
    it(`profile "${profile.name}" has exactly 8 operator keys, all boolean`, () => {
      const keys = Object.keys(profile.operators);
      expect(keys).toHaveLength(8);
      for (const key of OPERATOR_KEYS) {
        expect(typeof profile.operators[key]).toBe('boolean');
      }
      // Ensure no extra keys
      expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
    });
  }
});

// ---------------------------------------------------------------------------
// Operator config constants — all have exactly 8 keys
// ---------------------------------------------------------------------------
describe('operator config constants', () => {
  const configs: [string, OperatorConfig][] = [
    ['CLAUDE_HUNGRY_OPS', CLAUDE_HUNGRY_OPS],
    ['GPT_SENSITIVE_OPS', GPT_SENSITIVE_OPS],
    ['SMALL_MODEL_OPS', SMALL_MODEL_OPS],
    ['CONSERVATIVE_OPS', CONSERVATIVE_OPS],
  ];

  for (const [name, config] of configs) {
    it(`${name} has exactly 8 boolean keys`, () => {
      const keys = Object.keys(config);
      expect(keys).toHaveLength(8);
      for (const key of OPERATOR_KEYS) {
        expect(typeof config[key]).toBe('boolean');
      }
      expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
    });
  }

  it('CLAUDE_HUNGRY_OPS has all operators enabled', () => {
    for (const key of OPERATOR_KEYS) {
      expect(CLAUDE_HUNGRY_OPS[key]).toBe(true);
    }
  });

  it('GPT_SENSITIVE_OPS disables cfo and sad only', () => {
    expect(GPT_SENSITIVE_OPS.cfo).toBe(false);
    expect(GPT_SENSITIVE_OPS.sad).toBe(false);
    expect(GPT_SENSITIVE_OPS.sdm).toBe(true);
    expect(GPT_SENSITIVE_OPS.tas).toBe(true);
    expect(GPT_SENSITIVE_OPS.dro).toBe(true);
    expect(GPT_SENSITIVE_OPS.cfl).toBe(true);
    expect(GPT_SENSITIVE_OPS.cas).toBe(true);
    expect(GPT_SENSITIVE_OPS.ccp).toBe(true);
  });

  it('SMALL_MODEL_OPS enables sdm, tas, dro, ccp only', () => {
    expect(SMALL_MODEL_OPS.sdm).toBe(true);
    expect(SMALL_MODEL_OPS.tas).toBe(true);
    expect(SMALL_MODEL_OPS.dro).toBe(true);
    expect(SMALL_MODEL_OPS.ccp).toBe(true);
    expect(SMALL_MODEL_OPS.cfl).toBe(false);
    expect(SMALL_MODEL_OPS.cfo).toBe(false);
    expect(SMALL_MODEL_OPS.cas).toBe(false);
    expect(SMALL_MODEL_OPS.sad).toBe(false);
  });

  it('CONSERVATIVE_OPS enables sdm only', () => {
    expect(CONSERVATIVE_OPS.sdm).toBe(true);
    for (const key of OPERATOR_KEYS.filter(k => k !== 'sdm')) {
      expect(CONSERVATIVE_OPS[key]).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// STATIC_PROFILES array
// ---------------------------------------------------------------------------
describe('STATIC_PROFILES', () => {
  it('has exactly 13 entries', () => {
    expect(STATIC_PROFILES).toHaveLength(13);
  });

  it('last entry is auto fallback', () => {
    const last = STATIC_PROFILES[STATIC_PROFILES.length - 1];
    expect(last.name).toBe('auto');
    expect(last.archetype).toBe('safe-fallback');
    expect(last.matchPatterns).toHaveLength(0);
  });

  it('every profile has a non-empty rationale', () => {
    for (const p of STATIC_PROFILES) {
      expect(p.rationale.length).toBeGreaterThan(10);
    }
  });

  it('every profile has a non-empty expectedSavings', () => {
    for (const p of STATIC_PROFILES) {
      expect(p.expectedSavings.length).toBeGreaterThan(5);
    }
  });

  it('profile names are unique', () => {
    const names = STATIC_PROFILES.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// sizeHeuristicProfile
// ---------------------------------------------------------------------------
describe('sizeHeuristicProfile', () => {
  it('returns small for 7b model', () => {
    const result = sizeHeuristicProfile('custom-7b-model');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-small');
    expect(result!.archetype).toBe('small-model');
  });

  it('returns small for 14b model', () => {
    const result = sizeHeuristicProfile('some-14b');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-small');
    expect(result!.archetype).toBe('small-model');
  });

  it('returns small for 32b model', () => {
    const result = sizeHeuristicProfile('model-32b-chat');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-small');
    expect(result!.archetype).toBe('small-model');
  });

  it('returns robust for 70b model', () => {
    const result = sizeHeuristicProfile('llama-70b');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-robust');
    expect(result!.archetype).toBe('robust');
    expect(result!.operators.cfl).toBe(false);
    expect(result!.operators.sad).toBe(false);
    expect(result!.operators.sdm).toBe(true);
    expect(result!.operators.cfo).toBe(true);
  });

  it('returns hungry for 120b model', () => {
    const result = sizeHeuristicProfile('big-120b');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-hungry');
    expect(result!.archetype).toBe('hungry');
  });

  it('returns hungry for 405b model', () => {
    const result = sizeHeuristicProfile('llama-405b-fp8');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('size-heuristic-hungry');
    expect(result!.archetype).toBe('hungry');
    // Should have all operators enabled
    for (const key of OPERATOR_KEYS) {
      expect(result!.operators[key]).toBe(true);
    }
  });

  it('returns null when no size hint present', () => {
    expect(sizeHeuristicProfile('no-size-hint')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sizeHeuristicProfile('')).toBeNull();
  });

  it('size-heuristic profiles have exactly 8 operator keys', () => {
    const profiles = [
      sizeHeuristicProfile('x-7b'),
      sizeHeuristicProfile('x-70b'),
      sizeHeuristicProfile('x-120b'),
    ];
    for (const p of profiles) {
      expect(p).not.toBeNull();
      const keys = Object.keys(p!.operators);
      expect(keys).toHaveLength(8);
      expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
    }
  });

  it('boundary: 39b is small, 40b is robust', () => {
    const small = sizeHeuristicProfile('model-39b');
    expect(small!.archetype).toBe('small-model');

    const robust = sizeHeuristicProfile('model-40b');
    expect(robust!.archetype).toBe('robust');
  });

  it('boundary: 99b is robust, 100b is hungry', () => {
    const robust = sizeHeuristicProfile('model-99b');
    expect(robust!.archetype).toBe('robust');

    const hungry = sizeHeuristicProfile('model-100b');
    expect(hungry!.archetype).toBe('hungry');
  });
});
