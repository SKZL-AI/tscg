/**
 * @tscg/mcp-proxy — Mode Resolution
 *
 * Resolves the effective compression mode from config.
 *
 * CRITICAL BEHAVIOR -- Anthropic-pitch default:
 * - target set explicitly + mode unset  -> AUTO 'full' (optimized, 55-59% savings)
 * - no target + no mode                 -> 'description-only' (legacy safe)
 * - explicit mode                       -> respect user choice
 *
 * This ensures `npx @tscg/mcp-proxy --target=claude-opus-4-7` activates
 * full optimization without requiring --mode=full.
 */

import type { CompressionMode } from './types.js';

export type EffectiveMode = 'full' | 'description-only' | 'off';

/**
 * Normalize legacy mode values.
 * 'full-text' (v1.0.x) is mapped to 'full' for backward compatibility.
 */
function normalizeMode(mode: CompressionMode): EffectiveMode {
  if (mode === 'full-text') return 'full';
  return mode as EffectiveMode;
}

/**
 * Resolve the effective compression mode from proxy configuration.
 *
 * Priority:
 * 1. Explicit mode (if set) -- user intent always wins
 * 2. Target-based inference -- known target auto-enables 'full'
 * 3. Legacy default -- 'description-only' (backward-compat with v1.0.x)
 */
export function resolveEffectiveMode(
  config: { target?: string; mode?: CompressionMode },
): EffectiveMode {
  if (config.mode) return normalizeMode(config.mode);
  if (config.target && config.target !== 'auto') return 'full';
  return 'description-only';
}
