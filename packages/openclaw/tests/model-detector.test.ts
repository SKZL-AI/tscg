import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectDefaultModel,
  parseOpenClawConfig,
  extractAllModels,
  type OpenClawConfig,
} from '../src/model-detector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory and return its path. */
function makeTmpDir(): string {
  const dir = join(tmpdir(), `tscg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a JSON config into a temp file and return the file path. */
function writeTmpConfig(dir: string, data: unknown): string {
  const file = join(dir, 'openclaw.json');
  writeFileSync(file, JSON.stringify(data), 'utf-8');
  return file;
}

// ---------------------------------------------------------------------------
// Environment variable save/restore
// ---------------------------------------------------------------------------

let savedTscgModel: string | undefined;

beforeEach(() => {
  savedTscgModel = process.env.TSCG_MODEL;
  delete process.env.TSCG_MODEL;
});

afterEach(() => {
  if (savedTscgModel !== undefined) {
    process.env.TSCG_MODEL = savedTscgModel;
  } else {
    delete process.env.TSCG_MODEL;
  }
});

// ---------------------------------------------------------------------------
// detectDefaultModel
// ---------------------------------------------------------------------------

describe('detectDefaultModel', () => {
  it('returns TSCG_MODEL env var when set', () => {
    process.env.TSCG_MODEL = 'claude-opus-4-20250514';
    expect(detectDefaultModel()).toBe('claude-opus-4-20250514');
  });

  it('env var takes priority over config file', () => {
    const dir = makeTmpDir();
    try {
      const configPath = writeTmpConfig(dir, {
        agents: {
          defaults: { model: { primary: 'gpt-4o' } },
        },
      });
      process.env.TSCG_MODEL = 'claude-sonnet-4-20250514';
      expect(detectDefaultModel(configPath)).toBe('claude-sonnet-4-20250514');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns primary from config when env var is absent', () => {
    const dir = makeTmpDir();
    try {
      const configPath = writeTmpConfig(dir, {
        agents: {
          defaults: { model: { primary: 'gpt-4o' } },
        },
      });
      expect(detectDefaultModel(configPath)).toBe('gpt-4o');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when no env and no config', () => {
    const nonExistent = join(tmpdir(), 'does-not-exist-config.json');
    expect(detectDefaultModel(nonExistent)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseOpenClawConfig
// ---------------------------------------------------------------------------

describe('parseOpenClawConfig', () => {
  it('returns null for missing file (no throw)', () => {
    const result = parseOpenClawConfig('/tmp/this-file-does-not-exist-12345.json');
    expect(result).toBeNull();
  });

  it('returns null for corrupt JSON (no throw)', () => {
    const dir = makeTmpDir();
    try {
      const file = join(dir, 'openclaw.json');
      writeFileSync(file, '{not valid json!!!', 'utf-8');
      const result = parseOpenClawConfig(file);
      expect(result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses valid config correctly', () => {
    const dir = makeTmpDir();
    try {
      const data: OpenClawConfig = {
        agents: {
          defaults: {
            model: {
              primary: 'claude-opus-4-20250514',
              fallbacks: ['gpt-4o'],
            },
          },
          list: [
            { name: 'coder', model: 'claude-sonnet-4-20250514' },
          ],
        },
        plugins: [{ name: 'tscg' }],
      };
      const configPath = writeTmpConfig(dir, data);
      const result = parseOpenClawConfig(configPath);
      expect(result).not.toBeNull();
      expect(result!.agents?.defaults?.model?.primary).toBe('claude-opus-4-20250514');
      expect(result!.agents?.defaults?.model?.fallbacks).toEqual(['gpt-4o']);
      expect(result!.agents?.list).toHaveLength(1);
      expect(result!.plugins).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// extractAllModels
// ---------------------------------------------------------------------------

describe('extractAllModels', () => {
  it('collects from defaults + list + fallbacks', () => {
    const config: OpenClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: 'claude-opus-4-20250514',
            fallbacks: ['gpt-4o'],
          },
        },
        list: [
          { name: 'coder', model: 'claude-sonnet-4-20250514', fallbacks: ['gemini-2.5-pro'] },
          { name: 'reviewer', model: 'gpt-4-turbo' },
        ],
      },
    };

    const models = extractAllModels(config);
    expect(models).toContain('claude-opus-4-20250514');
    expect(models).toContain('gpt-4o');
    expect(models).toContain('claude-sonnet-4-20250514');
    expect(models).toContain('gemini-2.5-pro');
    expect(models).toContain('gpt-4-turbo');
    expect(models).toHaveLength(5);
  });

  it('deduplicates models', () => {
    const config: OpenClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: 'claude-opus-4-20250514',
            fallbacks: ['gpt-4o', 'claude-opus-4-20250514'],
          },
        },
        list: [
          { name: 'a', model: 'gpt-4o' },
          { name: 'b', model: 'claude-opus-4-20250514', fallbacks: ['gpt-4o'] },
        ],
      },
    };

    const models = extractAllModels(config);
    expect(models).toHaveLength(2);
    expect(models).toEqual(['claude-opus-4-20250514', 'gpt-4o']);
  });

  it('returns sorted array', () => {
    const config: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: 'z-model', fallbacks: ['a-model'] },
        },
        list: [{ model: 'm-model' }],
      },
    };

    const models = extractAllModels(config);
    expect(models).toEqual(['a-model', 'm-model', 'z-model']);
  });

  it('returns empty array for empty config', () => {
    expect(extractAllModels({})).toEqual([]);
    expect(extractAllModels({ agents: {} })).toEqual([]);
    expect(extractAllModels({ agents: { defaults: {} } })).toEqual([]);
    expect(extractAllModels({ agents: { list: [] } })).toEqual([]);
  });
});
