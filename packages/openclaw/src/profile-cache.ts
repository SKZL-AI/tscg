/**
 * @tscg/openclaw — Profile Cache System
 *
 * SHA-256 hashed file cache at ~/.openclaw/tscg-profiles/.
 * Atomic writes via temp+rename. Schema version validation.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { normalizeModelString } from './profile-map.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CachedProfile {
  schemaVersion: string;
  modelString: string;
  modelHash: string;
  benchmarkDate: string;
  variant: 'quick' | 'full' | 'sweep';
  config: {
    toolCounts: number[];
    conditions: string[];
    tasksPerCell: number;
    seeds: number;
  };
  recommendation: {
    profile: string;
    operators: Record<string, boolean>;
    confidence: string;
    rationale: string;
    score: number;
    alternatives: Array<{ profile: string; score: number; reason: string }>;
  };
  results: Record<string, Record<string, {
    accuracy: number;
    avgTokens: number;
    savingsPercent: number;
  }>>;
  /** v1.4.2: Per-operator sweep data (optional — only present after tune --sweep) */
  sweepData?: {
    results: Array<{
      condition: string;
      operator: string;
      accuracy: number;
      correct: number;
      total: number;
      avgInputTokens: number;
      avgLatency: number;
      tokenSavingsPercent: number;
    }>;
    classifications: Record<string, 'helpful' | 'neutral' | 'harmful'>;
    classification: string;
    confidence: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const CURRENT_SCHEMA_VERSION = '1.4.3';

const DEFAULT_CACHE_DIR = join(homedir(), '.openclaw', 'tscg-profiles');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Returns the cache directory path.
 * Overridable via TSCG_CACHE_DIR env var (useful for testing).
 */
export function getCacheDir(): string {
  return process.env.TSCG_CACHE_DIR || DEFAULT_CACHE_DIR;
}

/**
 * SHA-256 hash of the normalised model string, truncated to 16 hex chars.
 */
export function hashModel(modelString: string): string {
  const normalised = normalizeModelString(modelString);
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

/**
 * Returns age in days since `profile.benchmarkDate`.
 */
export function getCacheAge(profile: CachedProfile): number {
  const benchDate = new Date(profile.benchmarkDate);
  const now = new Date();
  const diffMs = now.getTime() - benchDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/* ------------------------------------------------------------------ */
/*  Core cache operations                                              */
/* ------------------------------------------------------------------ */

/**
 * Load a cached profile for the given model string.
 *
 * Schema-migration logic (PATCH 2):
 *  - Missing schemaVersion  -> treat as v1.0, return null
 *  - schemaVersion < current -> silent invalidate, return null
 *  - schemaVersion > current -> throw with upgrade instructions
 *  - schemaVersion === current -> return parsed profile
 */
export async function loadCache(modelString: string): Promise<CachedProfile | null> {
  const filePath = join(getCacheDir(), hashModel(modelString) + '.json');

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return null;
    throw err;
  }

  let parsed: CachedProfile;
  try {
    parsed = JSON.parse(raw) as CachedProfile;
  } catch {
    process.stderr.write(`[openclaw] warning: corrupt cache file ${filePath}, ignoring\n`);
    return null;
  }

  // PATCH 2 — Schema migration logic
  if (!parsed.schemaVersion) {
    // Treat as v1.0 — silently invalidate
    return null;
  }

  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Cache file requires @tscg/openclaw >= ${parsed.schemaVersion}. ` +
      `Please upgrade: npm i -g @tscg/openclaw@latest`
    );
  }

  if (parsed.schemaVersion < '1.4.1') {
    // Pre-1.4.1 schemas — silently invalidate
    return null;
  }
  // 1.4.1 → 1.4.2 is backward-compatible (sweepData is optional)

  // Exact match
  return parsed;
}

/**
 * Save a profile to the cache. Uses atomic write (tmp + rename).
 */
export async function saveCache(profile: CachedProfile): Promise<void> {
  const dir = getCacheDir();
  await mkdir(dir, { recursive: true });

  const finalPath = join(dir, hashModel(profile.modelString) + '.json');
  const tmpPath = `${finalPath}.tmp.${process.pid}`;

  await writeFile(tmpPath, JSON.stringify(profile, null, 2), 'utf-8');
  await rename(tmpPath, finalPath);
}

/**
 * List all cached model strings.
 * Falls back to returning bare filenames if a file can't be parsed.
 */
export async function listCache(): Promise<string[]> {
  const dir = getCacheDir();

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return [];
    throw err;
  }

  const jsonFiles = entries.filter(f => f.endsWith('.json'));
  const models: string[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const parsed = JSON.parse(raw) as CachedProfile;
      models.push(parsed.modelString);
    } catch {
      // Can't parse — return filename (minus extension) as fallback
      models.push(file.replace(/\.json$/, ''));
    }
  }

  return models;
}

/**
 * Clear cached profiles.
 * If `model` is provided, delete only that model's cache file.
 * Otherwise delete all .json files in the cache directory.
 * Returns the number of files removed.
 */
export async function clearCache(model?: string): Promise<number> {
  const dir = getCacheDir();

  if (model) {
    const filePath = join(dir, hashModel(model) + '.json');
    try {
      await unlink(filePath);
      return 1;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return 0;
      throw err;
    }
  }

  // Delete all .json files
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return 0;
    throw err;
  }

  const jsonFiles = entries.filter(f => f.endsWith('.json'));
  let removed = 0;
  for (const file of jsonFiles) {
    try {
      await unlink(join(dir, file));
      removed++;
    } catch {
      // Ignore individual file deletion errors
    }
  }
  return removed;
}

/* ------------------------------------------------------------------ */
/*  Internal utilities                                                 */
/* ------------------------------------------------------------------ */

interface NodeError extends Error {
  code?: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
