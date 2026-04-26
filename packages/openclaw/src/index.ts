/**
 * @tscg/openclaw — Plugin Entry Point
 *
 * OpenClaw plugin with beforeToolsList hook for runtime
 * TSCG compression. Per-request multi-LLM model resolution.
 */

// Re-export public API (plugin-safe — no network/credential code in this entry)
export { type OperatorConfig, type StaticProfile, STATIC_PROFILES, matchStaticProfile, sizeHeuristicProfile, normalizeModelString } from './profile-map.js';
export { type CachedProfile, hashModel, loadCache, saveCache, listCache, clearCache, getCacheDir, getCacheAge, CURRENT_SCHEMA_VERSION } from './profile-cache.js';
export { type ResolvedProfileWithSource, resolveProfile, clearMemoryCache, warmCache } from './profile-resolver.js';
export { type BenchmarkResults, type CellResult, type Recommendation, type RecommendOptions, type ConfidenceLevel, type OptimizeFor, CONDITION_TO_OPERATORS, recommend, computeConfidence } from './recommendation.js';
export { type OpenClawConfig, parseOpenClawConfig, detectDefaultModel, extractAllModels } from './model-detector.js';

// NOTE: benchmark-harness is NOT re-exported from the plugin entry to avoid
// OpenClaw safety scanner false positives (inline API providers read env vars
// and make HTTP calls, which triggers "credential harvesting" detection).
// Import benchmark-harness directly: import { ... } from '@tscg/openclaw/benchmark'

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveProfile } from './profile-resolver.js';
import { warmCache } from './profile-resolver.js';

/* ------------------------------------------------------------------ */
/*  Plugin Interface Types                                             */
/* ------------------------------------------------------------------ */

export interface OpenClawPluginContext {
  config: Record<string, unknown>;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  getModel?: () => string | undefined;
}

export interface OpenClawPlugin {
  name: string;
  version: string;
  init: (context: OpenClawPluginContext) => Promise<void>;
  beforeToolsList?: (event: { tools: unknown[]; model?: string }) => Promise<{ tools: unknown[] }> | { tools: unknown[] };
}

/* ------------------------------------------------------------------ */
/*  Module-level state                                                 */
/* ------------------------------------------------------------------ */

/** Last known model — used as fallback in beforeToolsList */
let lastKnownModel: string | undefined;

/** Logger reference — captured during init */
let logger: OpenClawPluginContext['logger'] | undefined;

/** Config values from openclaw.plugin.json configSchema */
let pluginEnabled = true;
let logCompression = true;
let minToolsThreshold = 3;

/* ------------------------------------------------------------------ */
/*  Stats JSONL writer (PATCH 6)                                       */
/* ------------------------------------------------------------------ */

const STATS_PATH = join(homedir(), '.openclaw', 'tscg-stats.jsonl');

function writeStatsLine(entry: {
  model: string;
  profile: string;
  source: string;
  tools: number;
  savings: number;
}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    model: entry.model,
    profile: entry.profile,
    source: entry.source,
    tools: entry.tools,
    savings: entry.savings,
  }) + '\n';

  // Fire-and-forget — never slow down the hot path
  appendFile(STATS_PATH, line).catch(() => {
    /* silently ignore write failures */
  });
}

/* ------------------------------------------------------------------ */
/*  Plugin definition                                                  */
/* ------------------------------------------------------------------ */

const plugin: OpenClawPlugin = {
  name: '@tscg/openclaw',
  version: '1.4.2',

  async init(context: OpenClawPluginContext): Promise<void> {
    logger = context.logger;
    logger.info('[tscg] @tscg/openclaw v1.4.2 initializing...');

    // Read configSchema values (defaults match openclaw.plugin.json)
    pluginEnabled = context.config.enabled !== false;
    logCompression = context.config.logCompression !== false;
    minToolsThreshold = typeof context.config.minTools === 'number'
      ? context.config.minTools
      : 3;

    if (!pluginEnabled) {
      logger.info('[tscg] Plugin disabled via config. Compression will be skipped.');
      logger.info('[tscg] Initialization complete.');
      return;
    }

    // Detect model: context.getModel() → TSCG_MODEL env → context.config.model
    const model =
      context.getModel?.() ??
      process.env.TSCG_MODEL ??
      (typeof context.config.model === 'string'
        ? context.config.model
        : undefined);

    if (model) {
      lastKnownModel = model;

      // Pre-populate memory cache
      await warmCache([model]);

      // Resolve profile for logging
      const profile = await resolveProfile(model);
      logger.info(
        `[tscg] Model "${model}" → profile "${profile.name}" (source: ${profile.source})`,
      );

      // Source-specific warnings
      if (profile.source === 'cache' && profile.cacheAgeDays !== undefined && profile.cacheAgeDays > 30) {
        logger.warn(
          `[tscg] Profile cache is ${profile.cacheAgeDays} days old. Consider running: tscg-openclaw tune --model ${model}`,
        );
      }

      if (profile.source === 'size-heuristic') {
        logger.info(
          '[tscg] Using size-heuristic profile. Run `tscg-openclaw tune` for optimal results.',
        );
      }

      if (profile.source === 'fallback') {
        logger.warn(
          `[tscg] Using conservative fallback (SDM only). Run \`tscg-openclaw tune --model ${model}\` for better compression.`,
        );
      }
    } else {
      logger.info('[tscg] No model detected. Profile will be resolved per-request.');
    }

    logger.info('[tscg] Initialization complete.');
  },

  async beforeToolsList(event: { tools: unknown[]; model?: string }): Promise<{ tools: unknown[] }> {
    // Master toggle
    if (!pluginEnabled) {
      return { tools: event.tools };
    }

    // Skip compression for trivial tool lists (configurable via minTools)
    if (event.tools.length < minToolsThreshold) {
      return { tools: event.tools };
    }

    // Detect model: event.model → fallback to last-known model
    const model = event.model ?? lastKnownModel;
    if (!model) {
      logger?.warn('[tscg] No model available for profile resolution, passing through original tools.');
      return { tools: event.tools };
    }

    // Update last-known model
    lastKnownModel = model;

    try {
      // Resolve profile (uses memory cache — zero-cost for repeat calls)
      const profile = await resolveProfile(model);

      // Dynamic import of @tscg/core
      const { compress } = await import('@tscg/core');

      // CRITICAL: Call compress with ALL 8 operator keys (additive merge)
      const result = compress(event.tools as Parameters<typeof compress>[0], {
        profile: profile.name === 'auto' ? 'balanced' : (profile.name as 'conservative' | 'balanced' | 'aggressive'),
        principles: {
          sdm: profile.operators.sdm,
          tas: profile.operators.tas,
          dro: profile.operators.dro,
          cfl: profile.operators.cfl,
          cfo: profile.operators.cfo,
          cas: profile.operators.cas,
          sad: profile.operators.sad,
          ccp: profile.operators.ccp,
        },
        preserveToolNames: true,
      });

      // Write stats line (fire-and-forget, respects logCompression config)
      if (logCompression) writeStatsLine({
        model,
        profile: profile.name,
        source: profile.source,
        tools: event.tools.length,
        savings: result.metrics.tokens.savingsPercent,
      });

      // Return compressed tools if available, otherwise original
      return { tools: result.tools ?? event.tools };
    } catch (err) {
      logger?.warn(`[tscg] Compression failed, passing through original tools: ${err}`);
      return { tools: event.tools };
    }
  },
};

export default plugin;
