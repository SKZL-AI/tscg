/**
 * @tscg/openclaw -- Model Detector
 *
 * Reads OpenClaw configuration to detect the active model(s).
 * Supports TSCG_MODEL env override and multi-model extraction.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
        fallbacks?: string[];
      };
    };
    list?: Array<{
      name?: string;
      model?: string;
      fallbacks?: string[];
    }>;
  };
  plugins?: Array<{
    name: string;
    config?: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG_PATH = join(
  homedir(),
  '.openclaw',
  'openclaw.json',
);

// ---------------------------------------------------------------------------
// parseOpenClawConfig
// ---------------------------------------------------------------------------

/**
 * Read and parse the OpenClaw JSON configuration file.
 *
 * @param configPath - Absolute path to the config file.
 *                     Falls back to `~/.openclaw/openclaw.json`.
 * @returns The parsed config object, or `null` when the file is missing
 *          or contains invalid JSON.
 */
export function parseOpenClawConfig(
  configPath?: string,
): OpenClawConfig | null {
  const target = configPath ?? DEFAULT_CONFIG_PATH;

  let raw: string;
  try {
    raw = readFileSync(target, 'utf-8');
  } catch (err: unknown) {
    // File not found is a normal "no config" situation -- return silently.
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }
    // Any other FS error: also return null but warn.
    process.stderr.write(
      `[tscg/openclaw] Warning: could not read config at ${target}: ${String(err)}\n`,
    );
    return null;
  }

  try {
    return JSON.parse(raw) as OpenClawConfig;
  } catch {
    process.stderr.write(
      `[tscg/openclaw] Warning: invalid JSON in ${target}\n`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// detectDefaultModel
// ---------------------------------------------------------------------------

/**
 * Detect the default model identifier.
 *
 * Resolution order:
 *   1. `process.env.TSCG_MODEL` (if set and non-empty)
 *   2. `config.agents.defaults.model.primary` from the config file
 *   3. `undefined`
 */
export function detectDefaultModel(
  configPath?: string,
): string | undefined {
  // Priority 1: environment variable
  const envModel = process.env.TSCG_MODEL;
  if (envModel !== undefined && envModel !== '') {
    return envModel;
  }

  // Priority 2: config file
  const config = parseOpenClawConfig(configPath);
  if (config) {
    const primary = config.agents?.defaults?.model?.primary;
    if (primary !== undefined && primary !== '') {
      return primary;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// extractAllModels
// ---------------------------------------------------------------------------

/**
 * Collect every unique model identifier referenced in the given config.
 *
 * Sources (in collection order):
 *   - `agents.defaults.model.primary`
 *   - `agents.defaults.model.fallbacks[]`
 *   - For each entry in `agents.list[]`: `.model` and `.fallbacks[]`
 *
 * The returned array is deduplicated and sorted alphabetically.
 */
export function extractAllModels(config: OpenClawConfig): string[] {
  const models: string[] = [];

  // Defaults
  const defaults = config.agents?.defaults?.model;
  if (defaults?.primary) {
    models.push(defaults.primary);
  }
  if (defaults?.fallbacks) {
    models.push(...defaults.fallbacks);
  }

  // Per-agent list
  const list = config.agents?.list;
  if (list) {
    for (const agent of list) {
      if (agent.model) {
        models.push(agent.model);
      }
      if (agent.fallbacks) {
        models.push(...agent.fallbacks);
      }
    }
  }

  // Filter empty strings / undefined that may have slipped in, deduplicate, sort
  const unique = new Set(models.filter((m) => m !== undefined && m !== ''));
  return [...unique].sort();
}
