/**
 * @tscg/mcp-proxy — Configuration
 *
 * ENV-based configuration for the TSCG MCP Proxy.
 */

import type { ModelTarget } from '@tscg/core';
import type { ProxyConfig, DownstreamConfig, CompressionMode, TSCGProfile } from './types.js';

/**
 * Parse proxy configuration from environment variables.
 *
 * ENV variables:
 *   TSCG_DOWNSTREAM_SERVERS — JSON array of DownstreamConfig
 *   TSCG_MODE               — description-only | full-text (default: description-only)
 *   TSCG_PROFILE            — conservative | balanced | aggressive | auto (default: auto)
 *   TSCG_MODEL              — Model target (default: auto)
 *   TSCG_AUTO_DISABLE_THRESHOLD — Tool count threshold for CFL/CFO disable (default: 30)
 *   TSCG_LOG_LEVEL          — silent | info | debug (default: info)
 */
export function parseConfig(env: Record<string, string | undefined> = process.env): ProxyConfig {
  // Parse downstream servers
  const downstreamsRaw = env['TSCG_DOWNSTREAM_SERVERS'];
  let downstreams: DownstreamConfig[] = [];
  if (downstreamsRaw) {
    try {
      downstreams = JSON.parse(downstreamsRaw) as DownstreamConfig[];
    } catch {
      throw new Error(`Invalid TSCG_DOWNSTREAM_SERVERS JSON: ${downstreamsRaw}`);
    }
  }

  // Validate downstream configs
  for (const ds of downstreams) {
    if (!ds.id || !ds.command) {
      throw new Error(`Each downstream server must have 'id' and 'command': ${JSON.stringify(ds)}`);
    }
    if (!ds.args) ds.args = [];
  }

  const mode = (env['TSCG_MODE'] || 'description-only') as CompressionMode;
  if (mode !== 'description-only' && mode !== 'full-text') {
    throw new Error(`Invalid TSCG_MODE: ${mode}. Must be 'description-only' or 'full-text'.`);
  }

  const profile = (env['TSCG_PROFILE'] || 'auto') as TSCGProfile;
  if (!['conservative', 'balanced', 'aggressive', 'auto'].includes(profile)) {
    throw new Error(`Invalid TSCG_PROFILE: ${profile}.`);
  }

  const model = (env['TSCG_MODEL'] || 'auto') as ModelTarget;

  const threshold = parseInt(env['TSCG_AUTO_DISABLE_THRESHOLD'] || '30', 10);

  const logLevel = (env['TSCG_LOG_LEVEL'] || 'info') as 'silent' | 'info' | 'debug';

  return {
    downstreams,
    mode,
    profile,
    model,
    autoDisableThreshold: threshold,
    metrics: true,
    logLevel,
  };
}
