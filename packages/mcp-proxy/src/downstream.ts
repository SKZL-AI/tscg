/**
 * @tscg/mcp-proxy — Downstream Manager
 *
 * Spawns and manages connections to downstream MCP servers.
 * Aggregates tool lists from all downstreams.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { DownstreamConfig } from './types.js';
import type { MCPToolDefinition } from './compressor.js';
import { ToolRouter } from './router.js';

export interface DownstreamConnection {
  config: DownstreamConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPToolDefinition[];
}

export class DownstreamManager {
  private readonly connections = new Map<string, DownstreamConnection>();
  readonly router = new ToolRouter();
  private readonly logLevel: 'silent' | 'info' | 'debug';

  constructor(logLevel: 'silent' | 'info' | 'debug' = 'info') {
    this.logLevel = logLevel;
  }

  private log(level: 'info' | 'debug', msg: string): void {
    if (this.logLevel === 'silent') return;
    if (level === 'debug' && this.logLevel !== 'debug') return;
    process.stderr.write(`[tscg-proxy] ${msg}\n`);
  }

  /**
   * Connect to all downstream MCP servers.
   */
  async connectAll(configs: DownstreamConfig[]): Promise<void> {
    for (const config of configs) {
      await this.connect(config);
    }
  }

  /**
   * Connect to a single downstream MCP server.
   */
  async connect(config: DownstreamConfig): Promise<void> {
    this.log('info', `Connecting to downstream: ${config.id} (${config.command} ${config.args.join(' ')})`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env as Record<string, string>,
    });

    const client = new Client({
      name: `tscg-proxy-for-${config.id}`,
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    this.log('info', `Connected to downstream: ${config.id}`);

    // Fetch tools from this downstream
    const toolsResult = await client.listTools();
    const tools: MCPToolDefinition[] = (toolsResult.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as MCPToolDefinition['inputSchema'],
    }));

    this.log('info', `Downstream ${config.id}: ${tools.length} tools`);

    // Register tools in router
    this.router.registerTools(config.id, tools);

    this.connections.set(config.id, {
      config,
      client,
      transport,
      tools,
    });
  }

  /**
   * Get all tools aggregated from all downstream servers.
   */
  getAllTools(): MCPToolDefinition[] {
    const allTools: MCPToolDefinition[] = [];
    for (const conn of this.connections.values()) {
      allTools.push(...conn.tools);
    }
    return allTools;
  }

  /**
   * Get tools for a specific downstream server.
   */
  getServerTools(serverId: string): MCPToolDefinition[] {
    return this.connections.get(serverId)?.tools || [];
  }

  /**
   * Route a tool call to the correct downstream server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const serverId = this.router.getServer(toolName);
    if (!serverId) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const conn = this.connections.get(serverId);
    if (!conn) {
      throw new Error(`Downstream server not connected: ${serverId}`);
    }

    this.log('debug', `Routing ${toolName} → ${serverId}`);
    const result = await conn.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  /**
   * Disconnect all downstream servers.
   */
  async disconnectAll(): Promise<void> {
    for (const [id, conn] of this.connections) {
      this.log('info', `Disconnecting downstream: ${id}`);
      try {
        await conn.client.close();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.connections.clear();
  }

  /**
   * Get the number of connected downstream servers.
   */
  get serverCount(): number {
    return this.connections.size;
  }
}
