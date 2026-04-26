/**
 * @tscg/openclaw — Four-Tier Profile Resolver
 *
 * Resolution order:
 *   Tier 0: In-memory Map (instant, no I/O)
 *   Tier 1: Disk cache  (loadCache — SHA-256 hashed JSON files)
 *   Tier 2: Static map  (matchStaticProfile — 13 known model families)
 *   Tier 2.5: Size heuristic (sizeHeuristicProfile — parameter-count regex)
 *   Tier 3: Fallback    (CONSERVATIVE_OPS — SDM only)
 *
 * warmCache() pre-populates the memory cache during plugin init,
 * preventing filesystem I/O in the hot path.
 */

import type { OperatorConfig } from './profile-map.js';
import {
  matchStaticProfile,
  sizeHeuristicProfile,
  CONSERVATIVE_OPS,
} from './profile-map.js';
import { loadCache, getCacheAge } from './profile-cache.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ResolvedProfileWithSource {
  name: string;
  operators: OperatorConfig;
  source: 'cache' | 'static' | 'size-heuristic' | 'fallback';
  archetype: string;
  cacheDate?: string;
  cacheAgeDays?: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level state                                                 */
/* ------------------------------------------------------------------ */

const memoryCache = new Map<string, ResolvedProfileWithSource>();

/* ------------------------------------------------------------------ */
/*  Core resolver                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve a model string to an operator profile using the 4-tier
 * resolution chain. Results are memoised in an in-memory Map so
 * repeated calls for the same model are zero-cost.
 */
export async function resolveProfile(
  modelString: string,
): Promise<ResolvedProfileWithSource> {
  // ----- Tier 0: memory cache -----
  const cached = memoryCache.get(modelString);
  if (cached) return cached;

  // ----- Tier 1: disk cache -----
  const diskCached = await loadCache(modelString);
  if (diskCached) {
    const result: ResolvedProfileWithSource = {
      name: diskCached.recommendation.profile,
      operators: diskCached.recommendation.operators as unknown as OperatorConfig,
      source: 'cache',
      archetype: diskCached.recommendation.profile,
      cacheDate: diskCached.benchmarkDate,
      cacheAgeDays: getCacheAge(diskCached),
    };
    memoryCache.set(modelString, result);
    return result;
  }

  // ----- Tier 2: static profile map -----
  const staticMatch = matchStaticProfile(modelString);
  if (staticMatch && staticMatch.name !== 'auto') {
    const result: ResolvedProfileWithSource = {
      name: staticMatch.name,
      operators: staticMatch.operators,
      source: 'static',
      archetype: staticMatch.archetype,
    };
    memoryCache.set(modelString, result);
    return result;
  }

  // ----- Tier 2.5: size heuristic -----
  const sizeMatch = sizeHeuristicProfile(modelString);
  if (sizeMatch) {
    const result: ResolvedProfileWithSource = {
      name: sizeMatch.name,
      operators: sizeMatch.operators,
      source: 'size-heuristic',
      archetype: sizeMatch.archetype,
    };
    memoryCache.set(modelString, result);
    return result;
  }

  // ----- Tier 3: conservative fallback -----
  const result: ResolvedProfileWithSource = {
    name: 'auto',
    operators: { ...CONSERVATIVE_OPS },
    source: 'fallback',
    archetype: 'safe-fallback',
  };
  memoryCache.set(modelString, result);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Cache management                                                   */
/* ------------------------------------------------------------------ */

/**
 * Clear the in-memory profile cache. Subsequent resolveProfile calls
 * will re-read from disk/static/heuristic.
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Pre-populate the memory cache for a list of models.
 * Call during plugin init to move all filesystem I/O out of the
 * hot path. Each model is resolved sequentially to avoid
 * overwhelming the filesystem on machines with many models.
 */
export async function warmCache(models: string[]): Promise<void> {
  for (const model of models) {
    await resolveProfile(model);
  }
}
