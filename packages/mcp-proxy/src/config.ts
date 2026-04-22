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
 *   TSCG_MODE               — full | description-only | off (default: auto-resolved)
 *   TSCG_PROFILE            — conservative | balanced | aggressive | auto (default: auto)
 *   TSCG_MODEL              — Model target for tokenizer alignment (default: auto)
 *   TSCG_AUTO_DISABLE_THRESHOLD — Tool count threshold for CFL/CFO disable (default: 30)
 *   TSCG_LOG_LEVEL          — silent | info | debug (default: info)
 *   MCP_PROXY_TARGET        — Per-model target (claude-opus-4-7, claude-sonnet-4, gpt-5.2, auto)
 *   MCP_PROXY_MODE          — Compression mode override (full, description-only, off)
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

  // Mode: MCP_PROXY_MODE takes priority over TSCG_MODE
  const modeRaw = env['MCP_PROXY_MODE'] || env['TSCG_MODE'] || 'description-only';
  const mode = modeRaw as CompressionMode;
  if (!['full', 'description-only', 'off', 'full-text'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Must be 'full', 'description-only', 'off', or 'full-text' (deprecated).`);
  }

  const profile = (env['TSCG_PROFILE'] || 'auto') as TSCGProfile;
  if (!['conservative', 'balanced', 'aggressive', 'auto'].includes(profile)) {
    throw new Error(`Invalid TSCG_PROFILE: ${profile}.`);
  }

  const model = (env['TSCG_MODEL'] || 'auto') as ModelTarget;

  const threshold = parseInt(env['TSCG_AUTO_DISABLE_THRESHOLD'] || '30', 10);

  const logLevel = (env['TSCG_LOG_LEVEL'] || 'info') as 'silent' | 'info' | 'debug';

  // Per-model target (new in v1.4.1)
  const target = env['MCP_PROXY_TARGET'];

  return {
    downstreams,
    mode,
    profile,
    model,
    autoDisableThreshold: threshold,
    metrics: true,
    logLevel,
    target,
  };
}
