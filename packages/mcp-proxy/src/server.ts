/**
 * @tscg/mcp-proxy — MCP Server
 *
 * The main TSCG MCP Proxy server. Communicates via stdio with the upstream
 * client (e.g., Claude Code) and routes to downstream MCP servers.
 *
 * Architecture:
 *   Claude Code ←(stdio)→ TSCG-MCP-Proxy ←(stdio)→ Downstream MCP Server(s)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { ProxyConfig } from './types.js';
import { DownstreamManager } from './downstream.js';
import { compressMCPTools, compressMCPToolsFull } from './compressor.js';
import { MetricsCollector } from './metrics.js';
import { resolveEffectiveMode } from './mode-resolver.js';

export class TSCGMCPProxyServer {
  private readonly server: Server;
  private readonly downstream: DownstreamManager;
  private readonly metrics: MetricsCollector;
  private readonly config: ProxyConfig;
  private hasLoggedProfile = false;

  constructor(config: ProxyConfig) {
    this.config = config;
    this.downstream = new DownstreamManager(config.logLevel);
    this.metrics = new MetricsCollector(config.mode);

    this.server = new Server(
      {
        name: 'tscg-mcp-proxy',
        version: '1.4.1',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.registerHandlers();
  }

  private log(msg: string): void {
    if (this.config.logLevel !== 'silent') {
      process.stderr.write(`[tscg-proxy] ${msg}\n`);
    }
  }

  private registerHandlers(): void {
    // Handle tools/list — compress tool descriptions based on effective mode
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = this.downstream.getAllTools();
      const effectiveMode = resolveEffectiveMode(this.config);

      // Mode: off — pass-through, no compression
      if (effectiveMode === 'off') {
        this.log(`tools/list: ${allTools.length} tools, mode=off (pass-through)`);
        return {
          tools: allTools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        };
      }

      // Mode: full — per-model optimized compression
      if (effectiveMode === 'full') {
        const fullResult = compressMCPToolsFull(allTools, this.config);

        if (!this.hasLoggedProfile) {
          this.log(
            `target=${this.config.target || 'auto'} archetype=${fullResult.archetype}: ${fullResult.rationale}`,
          );
          this.hasLoggedProfile = true;
        }

        this.log(
          `tools/list: ${allTools.length} tools, mode=full, ${fullResult.savingsPercent}% savings (${fullResult.appliedPrinciples.join(', ')})`,
        );

        // Record metrics per-server
        const toolCounts = this.downstream.router.getToolCounts();
        for (const [serverId, count] of toolCounts) {
          const serverTools = this.downstream.getServerTools(serverId);
          const serverResult = compressMCPToolsFull(serverTools, this.config);
          this.metrics.recordCompression(
            serverId,
            count,
            serverResult.originalTokens,
            serverResult.compressedTokens,
            serverResult.compressionTimeMs,
            serverResult.profile,
            serverResult.appliedPrinciples,
          );
        }

        return {
          tools: fullResult.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        };
      }

      // Mode: description-only — legacy v1.0.x behavior (default)
      const result = compressMCPTools(allTools, this.config);

      // Record metrics per-server
      const toolCounts = this.downstream.router.getToolCounts();
      for (const [serverId, count] of toolCounts) {
        const serverTools = this.downstream.getServerTools(serverId);
        const serverResult = compressMCPTools(serverTools, this.config);
        this.metrics.recordCompression(
          serverId,
          count,
          serverResult.originalTokens,
          serverResult.compressedTokens,
          serverResult.compressionTimeMs,
          serverResult.profile,
          serverResult.appliedPrinciples,
        );
      }

      this.log(
        `tools/list: ${allTools.length} tools, mode=description-only, ${result.savingsPercent}% savings (${result.appliedPrinciples.join(', ')})`,
      );

      return {
        tools: result.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });

    // Handle tools/call — route to correct downstream
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const serverId = this.downstream.router.getServer(name);
      if (serverId) {
        this.metrics.recordCall(serverId);
      }

      try {
        const result = await this.downstream.callTool(
          name,
          (args || {}) as Record<string, unknown>,
        );
        return result as { content: Array<{ type: string; text: string }> };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the proxy server.
   * Connects to all downstream servers, then starts the stdio transport.
   */
  async start(): Promise<void> {
    // Connect to all downstream servers
    await this.downstream.connectAll(this.config.downstreams);

    this.log(
      `Connected to ${this.downstream.serverCount} downstream(s), ${this.downstream.getAllTools().length} total tools`,
    );
    this.log(`Mode: ${this.config.mode}, Profile: ${this.config.profile}`);

    // Start the stdio server for upstream (Claude Code)
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.log('TSCG MCP Proxy ready (stdio)');
  }

  /**
   * Get current aggregated metrics.
   */
  getMetrics() {
    return this.metrics.getAggregated();
  }

  /**
   * Stop the proxy server and disconnect all downstreams.
   */
  async stop(): Promise<void> {
    await this.downstream.disconnectAll();
    await this.server.close();
    this.log('TSCG MCP Proxy stopped');
  }
}
