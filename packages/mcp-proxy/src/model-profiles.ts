/**
 * @tscg/mcp-proxy — Per-Model Operator Configurations
 *
 * Defaults derived from 720-call E2E benchmark (April 2026) +
 * Session 8 per-operator isolation experiments.
 */

import type { CompilerOptions } from '@tscg/core';

export interface ModelProfile {
  readonly target: string;
  readonly profile: NonNullable<CompilerOptions['profile']>;
  readonly operators: NonNullable<CompilerOptions['principles']>;
  readonly archetype: 'hungry' | 'robust' | 'sensitive' | 'safe-fallback';
  readonly rationale: string;
  readonly expectedSavings: string;
}

/**
 * Known model profiles derived from 720-call E2E benchmark data.
 *
 * Key findings:
 * - Opus 4.7 (hungry): All operators help. CCP +20pp alone. Conservative HURTS (-2.5 to -15pp).
 * - Sonnet 4 (robust): Config-agnostic. 6 of 7 configs identical accuracy.
 * - GPT-5.2 (sensitive): CFO hurts -5pp. Best config = balanced with CFO disabled.
 * - auto (safe-fallback): SDM-only conservative. Zero regression guaranteed.
 */
export const MODEL_PROFILES: Record<string, ModelProfile> = {
  'claude-opus-4-7': {
    target: 'claude-opus',
    profile: 'balanced',
    operators: {
      sdm: true, tas: true, dro: true, cfl: true,
      cfo: true, cas: true, sad: true, ccp: true,
    },
    archetype: 'hungry',
    rationale: 'Opus 4.7 benefits from all 8 operators. 720-call benchmark: +2.5 to +7.5pp accuracy with 55-59% char savings. Conservative (SDM-only) regresses by -2.5 to -15pp.',
    expectedSavings: '55-59% chars, matches-or-beats baseline accuracy',
  },

  'claude-sonnet-4': {
    target: 'claude-sonnet',
    profile: 'balanced',
    operators: {
      sdm: true, tas: true, dro: true, cfl: true,
      cfo: true, cas: true, sad: true, ccp: true,
    },
    archetype: 'robust',
    rationale: 'Sonnet 4 is config-robust. Session 8: 6 of 7 configs produce identical accuracy. Balanced safe default.',
    expectedSavings: '55-59% chars, -5 to +2.5pp accuracy delta (within noise)',
  },

  'gpt-5.2': {
    target: 'gpt-5',
    profile: 'balanced',
    operators: {
      sdm: true, tas: true, dro: true, cfl: true,
      cfo: false, cas: true, sad: true, ccp: true,
    },
    archetype: 'sensitive',
    rationale: 'GPT-5.2: CFO hurts -5pp, all-8 is worst case (-10pp). CFL+no-CFO optimal per Session 8 per-operator isolation.',
    expectedSavings: '55-60% tokens, text-mode improvement',
  },

  'auto': {
    target: 'auto',
    profile: 'conservative',
    operators: {
      sdm: true, tas: false, dro: false, cfl: false,
      cfo: false, cas: false, sad: false, ccp: false,
    },
    archetype: 'safe-fallback',
    rationale: 'Unknown target -- SDM-only conservative fallback. Zero regression guaranteed.',
    expectedSavings: '0-15% tokens, zero accuracy regression',
  },
};

/**
 * Resolve a target model identifier to its ModelProfile.
 *
 * Supports exact matches (claude-opus-4-7) and loose aliases (opus, sonnet).
 * Returns 'auto' profile with stderr warning for unknown targets.
 */
export function resolveModelProfile(target?: string): ModelProfile {
  if (!target || target === 'auto') return MODEL_PROFILES['auto'];
  if (MODEL_PROFILES[target]) return MODEL_PROFILES[target];

  // Loose alias resolution
  const normalized = target.toLowerCase().replace(/[\s_]/g, '-');
  if (normalized.includes('opus')) return MODEL_PROFILES['claude-opus-4-7'];
  if (normalized.includes('sonnet')) return MODEL_PROFILES['claude-sonnet-4'];
  if (normalized.includes('gpt-5') || normalized.includes('gpt5')) return MODEL_PROFILES['gpt-5.2'];

  process.stderr.write(
    `[@tscg/mcp-proxy] Unknown target "${target}". Falling back to conservative (SDM only). ` +
    `Supported: claude-opus-4-7, claude-sonnet-4, gpt-5.2, auto.\n`,
  );
  return MODEL_PROFILES['auto'];
}
