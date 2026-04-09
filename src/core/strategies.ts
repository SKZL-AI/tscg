/**
 * TSCG Benchmark Strategies
 * Defines the 6 prompt strategies compared in benchmarks
 * v1.1 — Improved SAD-F anchor extraction (skip [ANSWER:...] tags, better kv extraction)
 */

import type { Strategy, TestCase, StrategyName, ProviderName } from './types.js';
import { getModelProfile } from './types.js';

/** Extract fragile anchors from TSCG prompt for SAD-F strategy
 *  v1.1: Skip constraint tags like [ANSWER:...] and [CLASSIFY:...] from anchors.
 *  Only duplicate semantically critical key:value pairs.
 */
function extractAnchors(tscg: string, topK = 4): string {
  // Extract key:value pairs but skip constraint brackets and operation arrows
  const kvs = tscg.match(/\b\w+:[^\s\u2192|,\]]+/g) || [];
  // Filter out constraint-internal fragments (e.g. "ANSWER:letter")
  const filtered = kvs.filter((kv) => !/^(ANSWER|CLASSIFY|ANCHOR):/i.test(kv));
  const sorted = filtered.sort((a, b) => b.length - a.length);
  const anchors = sorted.slice(0, topK).filter(Boolean);
  if (anchors.length === 0) return tscg;
  return `${tscg} [ANCHOR:${anchors.join(',')}]`;
}

/** CCP-style causal closure block */
function ccpClosure(nat: string, expectedFormat = 'direct'): string {
  const words = nat.split(/\s+/).filter((w) => w.length > 3);
  const keyWords = words.slice(0, 6).join(';');
  const op = expectedFormat === 'json' ? 'OP=EMIT_JSON' : 'OP=EMIT_DIRECT';
  return `${nat}\n###<CC>\nt=${keyWords};\n${op};\n###</CC>`;
}

export const STRATEGIES: Strategy[] = [
  {
    name: 'natural',
    description: 'Standard NL prompt (baseline)',
    transform: (t: TestCase) => t.natural,
  },
  {
    name: 'repetition',
    description: 'NL prompt duplicated (Leviathan method)',
    transform: (t: TestCase) => `${t.natural}\n\n${t.natural}`,
  },
  {
    name: 'tscg',
    description: 'TSCG grammar prompt',
    transform: (t: TestCase) => t.tscg,
  },
  {
    name: 'tscg+sad',
    description: 'TSCG + Selective Anchor Duplication with Fragility scoring',
    transform: (t: TestCase) => extractAnchors(t.tscg),
  },
  {
    name: 'tscg+rep',
    description: 'TSCG prompt duplicated',
    transform: (t: TestCase) => `${t.tscg}\n${t.tscg}`,
  },
  {
    name: 'ccp',
    description: 'NL + Causal Closure Block',
    transform: (t: TestCase) => ccpClosure(t.natural),
  },
];

export function getStrategy(name: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.name === name);
}

export function getStrategyNames(): string[] {
  return STRATEGIES.map((s) => s.name);
}

/**
 * Strip CFL annotations ([ANSWER:...], [CLASSIFY:...]) from a prompt.
 * Used when the target model doesn't support CFL meta-instructions.
 */
function stripCFLTags(prompt: string): string {
  return prompt.replace(/\[ANSWER:[^\]]*\]\s*/g, '').replace(/\[CLASSIFY:[^\]]*\]\s*/g, '').trim();
}

/**
 * Strip SAD anchor tags ([ANCHOR:...]) from a prompt.
 * Used when the target model doesn't benefit from anchor duplication.
 */
function stripSADTags(prompt: string): string {
  return prompt.replace(/\s*\[ANCHOR:[^\]]*\]/g, '').trim();
}

/**
 * Apply model-aware profile to strip incompatible annotations.
 * Called after strategy.transform() to remove CFL/SAD tags for models that echo them back.
 *
 * - Only applies to TSCG-based strategies (tscg, tscg+sad, tscg+rep)
 * - No-op for natural, repetition, ccp strategies
 * - No-op if provider is not specified (backwards-compatible)
 */
export function applyModelProfile(
  prompt: string,
  strategyName: StrategyName,
  provider?: ProviderName,
  model?: string,
): string {
  // No provider info = no filtering (backwards-compatible)
  if (!provider || !model) return prompt;

  // Only filter TSCG-based strategies
  const tscgStrategies: StrategyName[] = ['tscg', 'tscg+sad', 'tscg+rep'];
  if (!tscgStrategies.includes(strategyName)) return prompt;

  const profile = getModelProfile(provider, model);

  let result = prompt;
  if (!profile.enableCFL) {
    result = stripCFLTags(result);
  }
  if (!profile.enableSAD) {
    result = stripSADTags(result);
  }

  return result;
}
