import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import {
  hashModel,
  loadCache,
  saveCache,
  listCache,
  clearCache,
  getCacheAge,
  getCacheDir,
  CURRENT_SCHEMA_VERSION,
  type CachedProfile,
} from '../src/profile-cache.js';

/* ------------------------------------------------------------------ */
/*  Test fixture                                                       */
/* ------------------------------------------------------------------ */

function makeProfile(overrides: Partial<CachedProfile> = {}): CachedProfile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modelString: 'claude-opus-4',
    modelHash: hashModel('claude-opus-4'),
    benchmarkDate: '2025-04-20T12:00:00Z',
    variant: 'quick',
    config: {
      toolCounts: [8, 16, 32],
      conditions: ['baseline', 'sdm', 'full'],
      tasksPerCell: 5,
      seeds: 3,
    },
    recommendation: {
      profile: 'hungry',
      operators: { sdm: true, tas: true, dro: true, cfl: true, cfo: true, cas: true, sad: true, ccp: true },
      confidence: 'high',
      rationale: 'Full compression optimal for high-capacity model',
      score: 0.92,
      alternatives: [
        { profile: 'robust', score: 0.85, reason: 'Slightly lower savings but safer' },
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
/*  Test isolation via TSCG_CACHE_DIR env var                          */
/* ------------------------------------------------------------------ */

let testCacheDir: string;
const originalEnv = process.env.TSCG_CACHE_DIR;

beforeEach(async () => {
  testCacheDir = path.join(os.tmpdir(), `tscg-test-cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  process.env.TSCG_CACHE_DIR = testCacheDir;
});

afterEach(async () => {
  // Restore env
  if (originalEnv === undefined) {
    delete process.env.TSCG_CACHE_DIR;
  } else {
    process.env.TSCG_CACHE_DIR = originalEnv;
  }
  // Clean up temp dir
  try {
    await rm(testCacheDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

/* ------------------------------------------------------------------ */
/*  hashModel tests                                                    */
/* ------------------------------------------------------------------ */

describe('hashModel', () => {
  it('returns stable output for the same input', () => {
    const h1 = hashModel('claude-opus-4');
    const h2 = hashModel('claude-opus-4');
    expect(h1).toBe(h2);
  });

  it('returns different output for different inputs', () => {
    const h1 = hashModel('claude-opus-4');
    const h2 = hashModel('gpt-4o');
    expect(h1).not.toBe(h2);
  });

  it('returns exactly 16 hex characters', () => {
    const h = hashModel('claude-opus-4');
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalizes before hashing — spaces/underscores/case are equivalent', () => {
    const h1 = hashModel('Claude Opus');
    const h2 = hashModel('claude-opus');
    const h3 = hashModel('CLAUDE_OPUS');
    const h4 = hashModel('  Claude  Opus  ');
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
    // trimmed + lowered + space->dash
    expect(hashModel('Claude Opus')).toBe(hashModel('claude-opus'));
  });
});

/* ------------------------------------------------------------------ */
/*  getCacheDir tests                                                  */
/* ------------------------------------------------------------------ */

describe('getCacheDir', () => {
  it('returns TSCG_CACHE_DIR when set', () => {
    process.env.TSCG_CACHE_DIR = '/tmp/custom-dir';
    expect(getCacheDir()).toBe('/tmp/custom-dir');
    process.env.TSCG_CACHE_DIR = testCacheDir; // restore for subsequent tests
  });
});

/* ------------------------------------------------------------------ */
/*  saveCache + loadCache round-trip                                   */
/* ------------------------------------------------------------------ */

describe('saveCache + loadCache round-trip', () => {
  it('saves and loads a profile with full fidelity', async () => {
    const profile = makeProfile();
    await saveCache(profile);
    const loaded = await loadCache('claude-opus-4');
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(profile);
  });

  it('preserves all nested fields', async () => {
    const profile = makeProfile();
    await saveCache(profile);
    const loaded = await loadCache('claude-opus-4');
    expect(loaded!.recommendation.alternatives).toHaveLength(1);
    expect(loaded!.recommendation.alternatives[0].profile).toBe('robust');
    expect(loaded!.config.toolCounts).toEqual([8, 16, 32]);
    expect(loaded!.results['16'].full.savingsPercent).toBe(65.6);
  });
});

/* ------------------------------------------------------------------ */
/*  loadCache — missing file                                           */
/* ------------------------------------------------------------------ */

describe('loadCache — missing file', () => {
  it('returns null for a non-existent model (no throw)', async () => {
    const result = await loadCache('nonexistent-model-xyz');
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  loadCache — corrupt JSON                                           */
/* ------------------------------------------------------------------ */

describe('loadCache — corrupt JSON', () => {
  it('returns null and warns on stderr for corrupt JSON (no throw)', async () => {
    // Write garbage to the expected file path
    await mkdir(testCacheDir, { recursive: true });
    const hash = hashModel('corrupt-model');
    const filePath = path.join(testCacheDir, hash + '.json');
    await writeFile(filePath, '{{{{not json at all!!!!', 'utf-8');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await loadCache('corrupt-model');
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('warning: corrupt cache file')
    );
    stderrSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  loadCache — PATCH 2: schema migration logic                        */
/* ------------------------------------------------------------------ */

describe('loadCache — PATCH 2: schema migration', () => {
  it('returns null for old schema version (no throw)', async () => {
    const profile = makeProfile({ schemaVersion: '1.0.0' });
    // Manually write so we bypass saveCache's own schema version
    await mkdir(testCacheDir, { recursive: true });
    const hash = hashModel(profile.modelString);
    await writeFile(
      path.join(testCacheDir, hash + '.json'),
      JSON.stringify(profile, null, 2),
      'utf-8',
    );

    const loaded = await loadCache(profile.modelString);
    expect(loaded).toBeNull();
  });

  it('throws with upgrade message for future schema version', async () => {
    const futureVersion = '99.0.0';
    const profile = makeProfile({ schemaVersion: futureVersion });
    await mkdir(testCacheDir, { recursive: true });
    const hash = hashModel(profile.modelString);
    await writeFile(
      path.join(testCacheDir, hash + '.json'),
      JSON.stringify(profile, null, 2),
      'utf-8',
    );

    await expect(loadCache(profile.modelString)).rejects.toThrow(
      `Cache file requires @tscg/openclaw >= ${futureVersion}`
    );
    await expect(loadCache(profile.modelString)).rejects.toThrow(
      'npm i -g @tscg/openclaw@latest'
    );
  });

  it('returns null when schemaVersion field is missing', async () => {
    const profile = makeProfile();
    // Remove schemaVersion from the serialised object
    const raw = JSON.parse(JSON.stringify(profile));
    delete raw.schemaVersion;

    await mkdir(testCacheDir, { recursive: true });
    const hash = hashModel(profile.modelString);
    await writeFile(
      path.join(testCacheDir, hash + '.json'),
      JSON.stringify(raw, null, 2),
      'utf-8',
    );

    const loaded = await loadCache(profile.modelString);
    expect(loaded).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  clearCache                                                         */
/* ------------------------------------------------------------------ */

describe('clearCache', () => {
  it('removes a specific model file and subsequent load returns null', async () => {
    const profile = makeProfile();
    await saveCache(profile);

    // Verify it exists
    expect(await loadCache(profile.modelString)).not.toBeNull();

    const removed = await clearCache(profile.modelString);
    expect(removed).toBe(1);

    const loaded = await loadCache(profile.modelString);
    expect(loaded).toBeNull();
  });

  it('returns 0 when clearing a non-existent model', async () => {
    const removed = await clearCache('does-not-exist');
    expect(removed).toBe(0);
  });

  it('removes all cache files when called without arguments', async () => {
    await saveCache(makeProfile({ modelString: 'model-a' }));
    await saveCache(makeProfile({ modelString: 'model-b' }));
    await saveCache(makeProfile({ modelString: 'model-c' }));

    const removed = await clearCache();
    expect(removed).toBe(3);

    const list = await listCache();
    expect(list).toHaveLength(0);
  });

  it('returns 0 when cache directory does not exist', async () => {
    // Point to a directory that definitely doesn't exist
    process.env.TSCG_CACHE_DIR = path.join(os.tmpdir(), 'nonexistent-' + Date.now());
    const removed = await clearCache();
    expect(removed).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  listCache                                                          */
/* ------------------------------------------------------------------ */

describe('listCache', () => {
  it('returns model strings from saved caches', async () => {
    await saveCache(makeProfile({ modelString: 'claude-opus-4' }));
    await saveCache(makeProfile({ modelString: 'gpt-4o' }));

    const models = await listCache();
    expect(models).toHaveLength(2);
    expect(models).toContain('claude-opus-4');
    expect(models).toContain('gpt-4o');
  });

  it('returns empty array when cache dir does not exist', async () => {
    process.env.TSCG_CACHE_DIR = path.join(os.tmpdir(), 'nonexistent-' + Date.now());
    const models = await listCache();
    expect(models).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  getCacheAge                                                        */
/* ------------------------------------------------------------------ */

describe('getCacheAge', () => {
  it('returns correct day count for a profile benchmarked 10 days ago', () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const profile = makeProfile({ benchmarkDate: tenDaysAgo.toISOString() });
    const age = getCacheAge(profile);
    // Allow for slight timing: should be 10 (or 9 if test runs exactly at midnight boundary)
    expect(age).toBeGreaterThanOrEqual(9);
    expect(age).toBeLessThanOrEqual(10);
  });

  it('returns 0 for a profile benchmarked today', () => {
    const profile = makeProfile({ benchmarkDate: new Date().toISOString() });
    const age = getCacheAge(profile);
    expect(age).toBe(0);
  });

  it('returns correct large value for old profiles', () => {
    const profile = makeProfile({ benchmarkDate: '2024-01-01T00:00:00Z' });
    const age = getCacheAge(profile);
    // Should be > 365 days (we're past Jan 2025)
    expect(age).toBeGreaterThan(365);
  });
});
