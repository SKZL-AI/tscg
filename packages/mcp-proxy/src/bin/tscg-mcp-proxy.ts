#!/usr/bin/env node
/**
 * @tscg/mcp-proxy — CLI Entry Point
 *
 * Usage:
 *   npx @tscg/mcp-proxy
 *
 * Configuration via environment variables (see config.ts).
 */

import { TSCGMCPProxyServer } from '../server.js';
import { parseConfig } from '../config.js';

async function main(): Promise<void> {
  try {
    const config = parseConfig();

    if (config.downstreams.length === 0) {
      process.stderr.write(
        '[tscg-proxy] Error: No downstream servers configured.\n' +
        '[tscg-proxy] Set TSCG_DOWNSTREAM_SERVERS environment variable.\n' +
        '[tscg-proxy] Example: TSCG_DOWNSTREAM_SERVERS=\'[{"id":"fs","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}]\'\n',
      );
      process.exit(1);
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
