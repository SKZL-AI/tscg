/**
 * @tscg/mcp-proxy — Auto-Profile Resolution
 *
 * Resolves the 'auto' profile based on tool count and test findings.
 * Auto-disables CFL/CFO for >30 tools (v1.3.0 test finding: 5,580 API calls).
 */

import type { CompilerOptions } from '@tscg/core';
import type { ProxyConfig } from './types.js';

/**
 * Resolve profile and principle overrides based on tool count.
 *
 * Test findings (v1.3.0 verification, 5,580 calls across 11 models):
 * - CFL/CFO are neutral-to-harmful at large catalogs (>30 tools)
 * - CAS is the most impactful accuracy operator (-1.8pp when removed)
 * - DRO drives 95% of token savings
 * - Conservative profile is safest for production
 */
export function resolveProfile(
  config: ProxyConfig,
  toolCount: number,
): CompilerOptions {
  let profile = config.profile;

  // Auto-select based on tool count
  if (profile === 'auto') {
    profile = toolCount <= 10 ? 'balanced' : 'conservative';
  }

  const options: CompilerOptions = {
    model: config.model,
    profile,
  };

  // Auto-disable CFL/CFO for large catalogs
  if (toolCount > config.autoDisableThreshold) {
    options.principles = {
      ...options.principles,
      cfl: false,
      cfo: false,
    };
  }

  return options;
}
