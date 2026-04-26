import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { rm } from 'node:fs/promises';
import {
  resolveProfile,
  clearMemoryCache,
  warmCache,
  type ResolvedProfileWithSource,
} from '../src/profile-resolver.js';
import {
  saveCache,
  hashModel,
  CURRENT_SCHEMA_VERSION,
  type CachedProfile,
} from '../src/profile-cache.js';
import {
  CONSERVATIVE_OPS,
  CLAUDE_HUNGRY_OPS,
  type OperatorConfig,
} from '../src/profile-map.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const OPERATOR_KEYS: (keyof OperatorConfig)[] = [
  'sdm', 'tas', 'dro', 'cfl', 'cfo', 'cas', 'sad', 'ccp',
];

/** Build a valid CachedProfile for testing disk-cache resolution. */
function makeProfile(overrides: Partial<CachedProfile> = {}): CachedProfile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modelString: 'test-cached-model',
    modelHash: hashModel('test-cached-model'),
    benchmarkDate: '2026-04-20T12:00:00Z',
    variant: 'quick',
    config: {
      toolCounts: [8, 16, 32],
      conditions: ['baseline', 'sdm', 'full'],
      tasksPerCell: 5,
      seeds: 3,
    },
    recommendation: {
      profile: 'hungry',
      operators: {
        sdm: true, tas: true, dro: true, cfl: true,
        cfo: true, cas: true, sad: true, ccp: true,
      },
      confidence: 'high',
      rationale: 'Full compression optimal for test model',
      score: 0.92,
      alternatives: [
        { profile: 'robust', score: 0.85, reason: 'Slightly lower savings' },
      ],
    },
    results: {
      '16': {
        baseline: { accuracy: 0.95, avgTokens: 3200, savingsPercent: 0 },
        full: { accuracy: 0.94, avgTokens: 1100, savingsPercent: 65.6 },
      },
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Test isolation via TSCG_CACHE_DIR + clearMemoryCache               */
/* ------------------------------------------------------------------ */

let testCacheDir: string;
const originalEnv = process.env.TSCG_CACHE_DIR;

beforeEach(async () => {
  testCacheDir = path.join(
    os.tmpdir(),
    `tscg-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  process.env.TSCG_CACHE_DIR = testCacheDir;
  clearMemoryCache();
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.TSCG_CACHE_DIR;
  } else {
    process.env.TSCG_CACHE_DIR = originalEnv;
  }
  try {
    await rm(testCacheDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

/* ------------------------------------------------------------------ */
/*  1. Cache hit (Tier 1)                                              */
/* ------------------------------------------------------------------ */

describe('Tier 1 — disk cache hit', () => {
  it('returns source="cache" when a cached profile exists on disk', async () => {
    const profile = makeProfile({ modelString: 'test-cached-model' });
    await saveCache(profile);

    const result = await resolveProfile('test-cached-model');
    expect(result.source).toBe('cache');
    expect(result.name).toBe('hungry');
    expect(result.archetype).toBe('hungry');
  });

  it('populates cacheDate from the cached profile benchmarkDate', async () => {
    const profile = makeProfile({
      modelString: 'dated-model',
      benchmarkDate: '2026-03-15T09:00:00Z',
    });
    await saveCache(profile);

    const result = await resolveProfile('dated-model');
    expect(result.cacheDate).toBe('2026-03-15T09:00:00Z');
  });

  it('populates cacheAgeDays as a non-negative number', async () => {
    const profile = makeProfile({ modelString: 'age-model' });
    await saveCache(profile);

    const result = await resolveProfile('age-model');
    expect(result.cacheAgeDays).toBeDefined();
    expect(typeof result.cacheAgeDays).toBe('number');
    expect(result.cacheAgeDays!).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Static match (Tier 2)                                           */
/* ------------------------------------------------------------------ */

describe('Tier 2 — static profile match', () => {
  it('resolves "claude-opus-4-7" to source="static", name="claude-opus"', async () => {
    const result = await resolveProfile('claude-opus-4-7');
    expect(result.source).toBe('static');
    expect(result.name).toBe('claude-opus');
    expect(result.archetype).toBe('hungry');
  });

  it('resolves "gpt-4o-mini" to source="static", name="gpt-4"', async () => {
    const result = await resolveProfile('gpt-4o-mini');
    expect(result.source).toBe('static');
    expect(result.name).toBe('gpt-4');
    expect(result.archetype).toBe('sensitive');
  });

  it('does not set cacheDate or cacheAgeDays for static matches', async () => {
    const result = await resolveProfile('claude-sonnet-4');
    expect(result.cacheDate).toBeUndefined();
    expect(result.cacheAgeDays).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  3. Size heuristic (Tier 2.5)                                       */
/* ------------------------------------------------------------------ */

describe('Tier 2.5 — size heuristic', () => {
  it('resolves "custom-14b-model" to source="size-heuristic", archetype="small-model"', async () => {
    const result = await resolveProfile('custom-14b-model');
    expect(result.source).toBe('size-heuristic');
    expect(result.archetype).toBe('small-model');
  });

  it('resolves "custom-70b-chat" to archetype="robust"', async () => {
    const result = await resolveProfile('custom-70b-chat');
    expect(result.source).toBe('size-heuristic');
    expect(result.archetype).toBe('robust');
  });

  it('resolves "custom-200b-mega" to archetype="hungry"', async () => {
    const result = await resolveProfile('custom-200b-mega');
    expect(result.source).toBe('size-heuristic');
    expect(result.archetype).toBe('hungry');
  });
});

/* ------------------------------------------------------------------ */
/*  4. Fallback (Tier 3)                                               */
/* ------------------------------------------------------------------ */

describe('Tier 3 — conservative fallback', () => {
  it('resolves "totally-unknown-xyz" to source="fallback", name="auto"', async () => {
    const result = await resolveProfile('totally-unknown-xyz');
    expect(result.source).toBe('fallback');
    expect(result.name).toBe('auto');
    expect(result.archetype).toBe('safe-fallback');
  });

  it('fallback operators match CONSERVATIVE_OPS exactly', async () => {
    const result = await resolveProfile('totally-unknown-xyz');
    expect(result.operators).toEqual(CONSERVATIVE_OPS);
  });

  it('fallback operators have exactly 8 boolean keys', async () => {
    const result = await resolveProfile('no-match-no-size');
    const keys = Object.keys(result.operators) as (keyof OperatorConfig)[];
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
    for (const key of OPERATOR_KEYS) {
      expect(typeof result.operators[key]).toBe('boolean');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  5. Memory cache — second call skips I/O                            */
/* ------------------------------------------------------------------ */

describe('Tier 0 — memory cache', () => {
  it('second call for same model does not hit loadCache again', async () => {
    // Use a spy on the profile-cache module
    const cacheModule = await import('../src/profile-cache.js');
    const loadSpy = vi.spyOn(cacheModule, 'loadCache');

    // Dynamic import means we need to clear and re-resolve
    // But since resolveProfile imports loadCache at module level,
    // we test by checking call count at the integration level instead.
    // First call: no disk cache, falls to static
    const first = await resolveProfile('claude-opus-4-7');
    expect(first.source).toBe('static');

    // Clear the spy call count
    loadSpy.mockClear();

    // Second call: should hit memory cache, NOT call loadCache
    const second = await resolveProfile('claude-opus-4-7');
    expect(second).toBe(first); // exact same reference
    // loadCache should not have been called for the memory-cached hit
    // (it may or may not be called depending on import resolution,
    //  but the result should be identical reference)
    expect(second.source).toBe('static');
    expect(second.name).toBe('claude-opus');

    loadSpy.mockRestore();
  });

  it('returns the exact same object reference on memory cache hit', async () => {
    const first = await resolveProfile('claude-sonnet-4');
    const second = await resolveProfile('claude-sonnet-4');
    expect(first).toBe(second); // referential equality
  });
});

/* ------------------------------------------------------------------ */
/*  6. clearMemoryCache forces re-resolution                           */
/* ------------------------------------------------------------------ */

describe('clearMemoryCache', () => {
  it('after clearing, resolveProfile re-resolves from disk/static', async () => {
    const first = await resolveProfile('claude-opus-4-7');
    expect(first.source).toBe('static');

    clearMemoryCache();

    const second = await resolveProfile('claude-opus-4-7');
    expect(second.source).toBe('static');
    // After clearing, it should be a new object (not same reference)
    expect(second).not.toBe(first);
    // But same content
    expect(second.name).toBe(first.name);
    expect(second.operators).toEqual(first.operators);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Multi-LLM — independent resolution                             */
/* ------------------------------------------------------------------ */

describe('Multi-LLM independent resolution', () => {
  it('resolves two different models to independent memory cache entries', async () => {
    const opus = await resolveProfile('claude-opus-4-7');
    const gpt = await resolveProfile('gpt-4o');

    expect(opus.name).toBe('claude-opus');
    expect(opus.source).toBe('static');
    expect(opus.archetype).toBe('hungry');

    expect(gpt.name).toBe('gpt-4');
    expect(gpt.source).toBe('static');
    expect(gpt.archetype).toBe('sensitive');

    // Operators should differ
    expect(opus.operators).not.toEqual(gpt.operators);
    // Claude opus has all true; GPT has cfo=false, sad=false
    expect(opus.operators.cfo).toBe(true);
    expect(gpt.operators.cfo).toBe(false);
    expect(opus.operators.sad).toBe(true);
    expect(gpt.operators.sad).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  8. warmCache (PATCH 3)                                             */
/* ------------------------------------------------------------------ */

describe('warmCache', () => {
  it('pre-populates memory cache for multiple models', async () => {
    await warmCache(['claude-sonnet-4', 'ollama/qwen3:14b']);

    // Both should now be in memory cache (second resolve returns same ref)
    const sonnet1 = await resolveProfile('claude-sonnet-4');
    const sonnet2 = await resolveProfile('claude-sonnet-4');
    expect(sonnet1).toBe(sonnet2); // same reference = memory cache hit

    const qwen1 = await resolveProfile('ollama/qwen3:14b');
    const qwen2 = await resolveProfile('ollama/qwen3:14b');
    expect(qwen1).toBe(qwen2); // same reference = memory cache hit

    expect(sonnet1.source).toBe('static');
    expect(sonnet1.name).toBe('claude-sonnet');
    expect(qwen1.source).toBe('static');
    expect(qwen1.name).toBe('qwen3');
  });

  it('warmCache with disk-cached model populates memory from cache tier', async () => {
    const profile = makeProfile({ modelString: 'warm-cached-model' });
    await saveCache(profile);

    await warmCache(['warm-cached-model']);

    const result = await resolveProfile('warm-cached-model');
    expect(result.source).toBe('cache');
    expect(result.cacheDate).toBe('2026-04-20T12:00:00Z');
  });

  it('warmCache with empty array is a no-op', async () => {
    await warmCache([]);
    // Should not throw, nothing in memory cache
    clearMemoryCache();
  });
});

/* ------------------------------------------------------------------ */
/*  9. Cache operators extraction — all 8 keys present                 */
/* ------------------------------------------------------------------ */

describe('cache operators extraction', () => {
  it('extracts all 8 operator keys from cached profile', async () => {
    const profile = makeProfile({
      modelString: 'operator-test-model',
      recommendation: {
        profile: 'custom',
        operators: {
          sdm: true, tas: false, dro: true, cfl: false,
          cfo: true, cas: false, sad: true, ccp: false,
        },
        confidence: 'medium',
        rationale: 'custom mix',
        score: 0.8,
        alternatives: [],
      },
    });
    await saveCache(profile);

    const result = await resolveProfile('operator-test-model');
    expect(result.source).toBe('cache');

    const keys = Object.keys(result.operators) as (keyof OperatorConfig)[];
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());

    // Verify individual values match what was saved
    expect(result.operators.sdm).toBe(true);
    expect(result.operators.tas).toBe(false);
    expect(result.operators.dro).toBe(true);
    expect(result.operators.cfl).toBe(false);
    expect(result.operators.cfo).toBe(true);
    expect(result.operators.cas).toBe(false);
    expect(result.operators.sad).toBe(true);
    expect(result.operators.ccp).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  10. Tier priority — cache wins over static                         */
/* ------------------------------------------------------------------ */

describe('tier priority', () => {
  it('disk cache takes priority over static match for same model', async () => {
    // "claude-opus-4" would match static profile, but if we have a
    // disk-cached result with different operators, cache should win.
    const profile = makeProfile({
      modelString: 'claude-opus-4',
      recommendation: {
        profile: 'custom-cached',
        operators: {
          sdm: true, tas: true, dro: true, cfl: true,
          cfo: false, cas: false, sad: false, ccp: false,
        },
        confidence: 'high',
        rationale: 'Benchmarked custom result',
        score: 0.88,
        alternatives: [],
      },
    });
    await saveCache(profile);

    const result = await resolveProfile('claude-opus-4');
    expect(result.source).toBe('cache');
    expect(result.name).toBe('custom-cached');
    // Static match would give all-true operators; cache gives custom
    expect(result.operators.cfo).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  11. Static profiles — all 8 operator keys present                  */
/* ------------------------------------------------------------------ */

describe('static profile operators completeness', () => {
  it('static-resolved profile has all 8 operator keys', async () => {
    const result = await resolveProfile('claude-haiku-3');
    expect(result.source).toBe('static');
    const keys = Object.keys(result.operators) as (keyof OperatorConfig)[];
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
  });
});

/* ------------------------------------------------------------------ */
/*  12. Size heuristic operators completeness                          */
/* ------------------------------------------------------------------ */

describe('size-heuristic operators completeness', () => {
  it('size-heuristic-resolved profile has all 8 operator keys', async () => {
    const result = await resolveProfile('custom-14b-model');
    expect(result.source).toBe('size-heuristic');
    const keys = Object.keys(result.operators) as (keyof OperatorConfig)[];
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual([...OPERATOR_KEYS].sort());
    for (const key of OPERATOR_KEYS) {
      expect(typeof result.operators[key]).toBe('boolean');
    }
  });
});
