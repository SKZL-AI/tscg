#!/usr/bin/env node
/**
 * @tscg/mcp-proxy — CLI Entry Point
 *
 * Usage:
 *   npx @tscg/mcp-proxy
 *   npx @tscg/mcp-proxy --target=claude-opus-4-7 --server=<mcp-command>
 *
 * CLI Flags:
 *   --target=<model>   Per-model target (claude-opus-4-7, claude-sonnet-4, gpt-5.2, auto)
 *   --mode=<mode>      Compression mode (full, description-only, off)
 *
 * Environment Variables:
 *   MCP_PROXY_TARGET   Same as --target
 *   MCP_PROXY_MODE     Same as --mode
 *
 * Configuration via environment variables (see config.ts).
 */

import { TSCGMCPProxyServer } from '../server.js';
import { parseConfig } from '../config.js';
import { resolveEffectiveMode } from '../mode-resolver.js';

/**
 * Parse a --flag=value from process.argv.
 */
function parseFlag(flag: string): string | undefined {
  const prefix = `${flag}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  try {
    // CLI flags override env vars
    const cliTarget = parseFlag('--target');
    const cliMode = parseFlag('--mode');

    if (cliTarget) process.env['MCP_PROXY_TARGET'] = cliTarget;
    if (cliMode) process.env['MCP_PROXY_MODE'] = cliMode;

    const config = parseConfig();

    if (config.downstreams.length === 0) {
      process.stderr.write(
        '[tscg-proxy] Error: No downstream servers configured.\n' +
        '[tscg-proxy] Set TSCG_DOWNSTREAM_SERVERS environment variable.\n' +
        '[tscg-proxy] Example: TSCG_DOWNSTREAM_SERVERS=\'[{"id":"fs","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}]\'\n',
      );
      process.exit(1);
    }

    // Log startup info about target/mode resolution
    const effectiveMode = resolveEffectiveMode(config);
    if (config.target && config.target !== 'auto' && !cliMode) {
      process.stderr.write(
        `[tscg-proxy] target=${config.target} -> auto-enabling full compression pipeline (mode=full)\n`,
      );
    }
    if (!config.target) {
      process.stderr.write(
        `[tscg-proxy] No target specified -- running in legacy ${effectiveMode} mode.\n` +
        `[tscg-proxy] For full optimization with Claude models (55-59% savings, +2.5 to +7.5pp accuracy):\n` +
        `[tscg-proxy]   npx @tscg/mcp-proxy --target=claude-opus-4-7\n` +
        `[tscg-proxy] Supported targets: claude-opus-4-7, claude-sonnet-4, gpt-5.2, auto\n`,
      );
    }

    const server = new TSCGMCPProxyServer(config);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await server.stop();
      process.exit(0);
    });

    await server.start();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[tscg-proxy] Fatal: ${msg}\n`);
    process.exit(1);
  }
}

main();
