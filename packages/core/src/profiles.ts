/**
 * @tscg/core — Tokenizer Profiles
 *
 * Model-specific tokenizer profiles that control:
 * - Character-to-token ratio (for estimation)
 * - BPE-optimal delimiters (for TAS principle)
 *
 * Zero dependencies. Based on empirical measurements from the
 * TSCG benchmark suite across 10+ model families.
 */

import type { TokenizerProfile, ModelTarget } from './types.js';

// ============================================================
// Profile Registry
// ============================================================

const PROFILES: Record<string, TokenizerProfile> = {
  'claude-sonnet': {
    model: 'claude-sonnet',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.8,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'claude-opus': {
    model: 'claude-opus',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.8,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'claude-haiku': {
    model: 'claude-haiku',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.8,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'gpt-4': {
    model: 'gpt-4',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'gpt-5': {
    model: 'gpt-5',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    charsPerToken: 4.0,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'llama-3.1': {
    model: 'llama-3.1',
    charsPerToken: 3.8,
    charsPerTokenCode: 2.6,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'llama-3.2': {
    model: 'llama-3.2',
    charsPerToken: 3.8,
    charsPerTokenCode: 2.6,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'mistral-7b': {
    model: 'mistral-7b',
    charsPerToken: 3.8,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'mistral-large': {
    model: 'mistral-large',
    charsPerToken: 3.9,
    charsPerTokenCode: 2.6,
    delimiters: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },
  },
  'gemma-3': {
    model: 'gemma-3',
    charsPerToken: 3.7,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '-', pipe: '|', dot: ':' },
  },
  'phi-4': {
    model: 'phi-4',
    charsPerToken: 3.8,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '-', pipe: '|', dot: ':' },
  },
  'qwen-3': {
    model: 'qwen-3',
    charsPerToken: 3.5,
    charsPerTokenCode: 2.4,
    delimiters: { arrow: '\u2192', pipe: '|', dot: ':' },
  },
  'deepseek-v3': {
    model: 'deepseek-v3',
    charsPerToken: 3.6,
    charsPerTokenCode: 2.5,
    delimiters: { arrow: '\u2192', pipe: '|', dot: ':' },
  },
};

/** Default profile for unknown or 'auto' model targets */
const DEFAULT_PROFILE: TokenizerProfile = {
  model: 'auto',
  charsPerToken: 4.0,
  charsPerTokenCode: 2.5,
  delimiters: { arrow: '-', pipe: '|', dot: ':' },
};

// ============================================================
// Public API
// ============================================================

/**
 * Get the tokenizer profile for a specific model target.
 *
 * Returns a default (conservative) profile for 'auto' or unknown models.
 *
 * @example
 * ```ts
 * const profile = getTokenizerProfile('claude-sonnet');
 * console.log(profile.charsPerToken); // 4.0
 * ```
 */
export function getTokenizerProfile(model: ModelTarget): TokenizerProfile {
  if (model === 'auto') return { ...DEFAULT_PROFILE };
  return PROFILES[model] ? { ...PROFILES[model] } : { ...DEFAULT_PROFILE, model };
}

/**
 * List all available tokenizer profiles.
 *
 * @returns Array of all registered profiles (not including 'auto')
 */
export function listProfiles(): TokenizerProfile[] {
  return Object.values(PROFILES).map((p) => ({ ...p }));
}
