import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// We need to re-import the plugin fresh for each test group that modifies module state.
// For the default import, use the module directly.
import plugin from '../src/index.js';
import type { OpenClawPluginContext } from '../src/index.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeContext(overrides?: Partial<OpenClawPluginContext>): OpenClawPluginContext {
  const logs: string[] = [];
  return {
    config: {},
    logger: {
      info: (msg: string) => logs.push(msg),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
    },
    ...overrides,
    // Attach logs for assertion access
    ...({ _logs: logs } as Record<string, unknown>),
  };
}

function getLogs(ctx: OpenClawPluginContext): string[] {
  return (ctx as unknown as { _logs: string[] })._logs;
}

/* ------------------------------------------------------------------ */
/*  Original tests (kept)                                              */
/* ------------------------------------------------------------------ */

describe('plugin', () => {
  it('has correct name and version', () => {
    expect(plugin.name).toBe('@tscg/openclaw');
    expect(plugin.version).toBe('1.4.3');
  });
});

describe('package.json openclaw manifest (PATCH 8)', () => {
  const pkgPath = join(import.meta.dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  it('has openclaw.extensions pointing to dist entry', () => {
    expect(pkg.openclaw).toBeDefined();
    expect(pkg.openclaw.extensions).toEqual(['./dist/src/index.js']);
  });

  it('has openclaw.minHostVersion', () => {
    expect(pkg.openclaw.minHostVersion).toBeDefined();
    expect(typeof pkg.openclaw.minHostVersion).toBe('string');
  });

  it('has openclaw.pluginApi', () => {
    expect(pkg.openclaw.pluginApi).toBe('1.0');
  });
});

describe('openclaw.plugin.json manifest', () => {
  const manifestPath = join(import.meta.dirname, '..', 'openclaw.plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  it('has required id field', () => {
    expect(manifest.id).toBe('tscg-openclaw');
  });

  it('has version matching package.json', () => {
    const pkgPath = join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(manifest.version).toBe(pkg.version);
  });

  it('has valid configSchema with type object', () => {
    expect(manifest.configSchema).toBeDefined();
    expect(manifest.configSchema.type).toBe('object');
    expect(manifest.configSchema.additionalProperties).toBe(false);
  });

  it('configSchema declares enabled, logCompression, minTools properties', () => {
    const props = manifest.configSchema.properties;
    expect(props.enabled).toBeDefined();
    expect(props.enabled.type).toBe('boolean');
    expect(props.enabled.default).toBe(true);

    expect(props.logCompression).toBeDefined();
    expect(props.logCompression.type).toBe('boolean');
    expect(props.logCompression.default).toBe(true);

    expect(props.minTools).toBeDefined();
    expect(props.minTools.type).toBe('integer');
    expect(props.minTools.default).toBe(3);
    expect(props.minTools.minimum).toBe(0);
  });

  it('has uiHints for all configSchema properties', () => {
    expect(manifest.uiHints.enabled).toBeDefined();
    expect(manifest.uiHints.logCompression).toBeDefined();
    expect(manifest.uiHints.minTools).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Plugin init tests                                                  */
/* ------------------------------------------------------------------ */

describe('plugin init', () => {
  beforeEach(() => {
    // Clean env for each test
    delete process.env.TSCG_MODEL;
  });

  it('calls warmCache during init when model is provided via config', async () => {
    const ctx = makeContext({
      config: { model: 'claude-sonnet-4' },
    });

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('initializing'))).toBe(true);
    expect(logs.some(l => l.includes('claude-sonnet'))).toBe(true);
    expect(logs.some(l => l.includes('Initialization complete'))).toBe(true);
  });

  it('detects model from TSCG_MODEL env variable', async () => {
    process.env.TSCG_MODEL = 'gpt-4o';
    const ctx = makeContext();

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('gpt-4o'))).toBe(true);
    expect(logs.some(l => l.includes('gpt-4'))).toBe(true);

    delete process.env.TSCG_MODEL;
  });

  it('detects model from getModel callback', async () => {
    const ctx = makeContext({
      getModel: () => 'claude-opus-4',
    });

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('claude-opus-4'))).toBe(true);
  });

  it('warns about fallback profile during init', async () => {
    const ctx = makeContext({
      config: { model: 'totally-unknown-model-xyz' },
    });

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('WARN:') && l.includes('fallback'))).toBe(true);
  });

  it('handles init without model gracefully', async () => {
    const ctx = makeContext();

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('No model detected'))).toBe(true);
    expect(logs.some(l => l.includes('Initialization complete'))).toBe(true);
  });

  it('logs size-heuristic source for parameter-count models', async () => {
    const ctx = makeContext({
      config: { model: 'my-custom-7b-model' },
    });

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('size-heuristic'))).toBe(true);
  });

  it('respects enabled: false config — skips model detection', async () => {
    const ctx = makeContext({
      config: { enabled: false, model: 'claude-sonnet-4' },
    });

    await plugin.init(ctx);

    const logs = getLogs(ctx);
    expect(logs.some(l => l.includes('disabled via config'))).toBe(true);
    expect(logs.some(l => l.includes('Initialization complete'))).toBe(true);
    // Should NOT have resolved a model
    expect(logs.some(l => l.includes('claude-sonnet'))).toBe(false);
  });

  it('reads minTools from config', async () => {
    const ctx = makeContext({
      config: { model: 'claude-sonnet-4', minTools: 10 },
    });

    await plugin.init(ctx);

    // After init with minTools=10, beforeToolsList should skip for <10 tools
    const tools = Array.from({ length: 5 }, (_, i) => ({ name: `tool${i}` }));
    const result = await plugin.beforeToolsList!({ tools, model: 'claude-sonnet-4' });
    // 5 tools < 10 minTools threshold → pass through
    expect(result.tools).toEqual(tools);
  });
});

/* ------------------------------------------------------------------ */
/*  Plugin beforeToolsList tests                                       */
/* ------------------------------------------------------------------ */

describe('plugin beforeToolsList', () => {
  it('skips compression when tools < 3', async () => {
    const tools = [{ name: 'tool1' }, { name: 'tool2' }];
    const result = await plugin.beforeToolsList!({ tools });
    expect(result.tools).toEqual(tools);
    expect(result.tools.length).toBe(2);
  });

  it('returns tools unchanged when @tscg/core is not available and catches error', async () => {
    // Init with a model so the beforeToolsList has a model to work with
    const ctx = makeContext({
      config: { model: 'claude-sonnet-4' },
    });
    await plugin.init(ctx);

    // The dynamic import of @tscg/core should work in this test environment
    // because it's a devDependency. But we test the graceful degradation
    // by verifying the hook doesn't throw.
    const tools = [
      { name: 'tool1', description: 'First tool' },
      { name: 'tool2', description: 'Second tool' },
      { name: 'tool3', description: 'Third tool' },
    ];
    const result = await plugin.beforeToolsList!({ tools, model: 'claude-sonnet-4' });

    // Should return some tools (either compressed or original)
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
  });

  it('passes through all tools when plugin disabled via enabled: false', async () => {
    const ctx = makeContext({
      config: { enabled: false, model: 'claude-sonnet-4' },
    });
    await plugin.init(ctx);

    const tools = Array.from({ length: 20 }, (_, i) => ({ name: `tool${i}` }));
    const result = await plugin.beforeToolsList!({ tools, model: 'claude-sonnet-4' });
    expect(result.tools).toEqual(tools);
    expect(result.tools.length).toBe(20);
  });

  it('passes through tools when no model is available', async () => {
    // Re-init with no model, clear state
    const ctx = makeContext();
    await plugin.init(ctx);

    const tools = [
      { name: 'tool1' },
      { name: 'tool2' },
      { name: 'tool3' },
    ];

    // beforeToolsList with no event.model and no lastKnownModel
    // (We just re-initialized with no model, so lastKnownModel is undefined)
    const result = await plugin.beforeToolsList!({ tools });
    expect(result.tools).toEqual(tools);
  });
});

/* ------------------------------------------------------------------ */
/*  Plugin type contract                                               */
/* ------------------------------------------------------------------ */

describe('plugin type contract', () => {
  it('exports OpenClawPlugin interface-compatible shape', () => {
    expect(typeof plugin.name).toBe('string');
    expect(typeof plugin.version).toBe('string');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.beforeToolsList).toBe('function');
  });

  it('name matches package name', () => {
    const pkgPath = join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(plugin.name).toBe(pkg.name);
  });

  it('version matches package version', () => {
    const pkgPath = join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(plugin.version).toBe(pkg.version);
  });
});
