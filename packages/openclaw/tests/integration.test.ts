import { describe, it, expect } from 'vitest';
import { resolveProfile, clearMemoryCache } from '../src/profile-resolver.js';
import plugin from '../src/index.js';

// Skip all integration tests unless TSCG_INTEGRATION is set
const INTEGRATION = process.env.TSCG_INTEGRATION === '1';

describe.skipIf(!INTEGRATION)('Integration: plugin lifecycle', () => {
  it('plugin init + resolveProfile end-to-end', async () => {
    clearMemoryCache();

    const logs: string[] = [];
    await plugin.init({
      config: { model: 'claude-sonnet-4' },
      logger: {
        info: (msg: string) => logs.push(msg),
        warn: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
        debug: (msg: string) => logs.push(msg),
      },
    });

    // After init, profile should be in memory cache
    const profile = await resolveProfile('claude-sonnet-4');
    expect(profile.source).toBe('static');
    expect(profile.name).toBe('claude-sonnet');
  });
});

// Non-conditional smoke tests
describe('Smoke: module imports', () => {
  it('plugin entry exports are importable', async () => {
    const mod = await import('../src/index.js');

    // Functions (plugin-safe — no network/credential code)
    expect(typeof mod.resolveProfile).toBe('function');
    expect(typeof mod.recommend).toBe('function');
    expect(typeof mod.matchStaticProfile).toBe('function');
    expect(typeof mod.sizeHeuristicProfile).toBe('function');
    expect(typeof mod.normalizeModelString).toBe('function');
    expect(typeof mod.hashModel).toBe('function');
    expect(typeof mod.loadCache).toBe('function');
    expect(typeof mod.saveCache).toBe('function');
    expect(typeof mod.listCache).toBe('function');
    expect(typeof mod.clearCache).toBe('function');
    expect(typeof mod.getCacheDir).toBe('function');
    expect(typeof mod.getCacheAge).toBe('function');
    expect(typeof mod.clearMemoryCache).toBe('function');
    expect(typeof mod.computeConfidence).toBe('function');
    expect(typeof mod.parseOpenClawConfig).toBe('function');
    expect(typeof mod.detectDefaultModel).toBe('function');
    expect(typeof mod.extractAllModels).toBe('function');

    // Constants
    expect(mod.STATIC_PROFILES).toBeDefined();
    expect(mod.CONDITION_TO_OPERATORS).toBeDefined();
    expect(mod.CURRENT_SCHEMA_VERSION).toBe('1.4.3');

    // Default export (plugin)
    expect(mod.default.name).toBe('@tscg/openclaw');
    expect(mod.default.version).toBe('1.4.3');

    // Benchmark-harness should NOT be on the plugin entry (safety scanner)
    expect(mod.estimateCost).toBeUndefined();
    expect(mod.runTune).toBeUndefined();
    expect(mod.createProvider).toBeUndefined();
    expect(mod.QUICK_CONFIG).toBeUndefined();
    expect(mod.FULL_CONFIG).toBeUndefined();
  });

  it('benchmark-harness exports are importable via separate entry', async () => {
    const bm = await import('../src/benchmark-harness.js');

    // Functions
    expect(typeof bm.estimateCost).toBe('function');
    expect(typeof bm.runTune).toBe('function');
    expect(typeof bm.createProvider).toBe('function');
    expect(typeof bm.callWithRetry).toBe('function');
    expect(typeof bm.generateTasks).toBe('function');
    expect(typeof bm.scoreSingleTool).toBe('function');
    expect(typeof bm.scoreNoTool).toBe('function');
    expect(typeof bm.computeParameterF1).toBe('function');

    // Constants
    expect(bm.QUICK_CONFIG).toBeDefined();
    expect(bm.FULL_CONFIG).toBeDefined();
  });

  it('resolveProfile returns valid shape for known model', async () => {
    clearMemoryCache();
    const profile = await resolveProfile('claude-sonnet-4');
    expect(profile).toHaveProperty('name');
    expect(profile).toHaveProperty('operators');
    expect(profile).toHaveProperty('source');
    expect(profile).toHaveProperty('archetype');
    expect(Object.keys(profile.operators)).toHaveLength(8);
  });

  it('resolveProfile returns valid shape for unknown model', async () => {
    clearMemoryCache();
    const profile = await resolveProfile('totally-unknown-model-xyz-999');
    expect(profile.source).toBe('fallback');
    expect(profile.name).toBe('auto');
    expect(Object.keys(profile.operators)).toHaveLength(8);
  });
});
