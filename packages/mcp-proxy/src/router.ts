/**
 * @tscg/mcp-proxy — Tool Router
 *
 * Maps tool names to their originating downstream server IDs.
 * Routes tools/call requests to the correct downstream.
 */

import type { MCPToolDefinition } from './compressor.js';

export class ToolRouter {
  /** Map from tool name to downstream server ID */
  private readonly toolToServer = new Map<string, string>();

  /**
   * Register tools from a downstream server.
   */
  registerTools(serverId: string, tools: MCPToolDefinition[]): void {
    for (const tool of tools) {
      this.toolToServer.set(tool.name, serverId);
    }
  }

  /**
   * Clear all registrations for a server (e.g., on reconnect).
   */
  clearServer(serverId: string): void {
    for (const [toolName, sid] of this.toolToServer) {
      if (sid === serverId) {
        this.toolToServer.delete(toolName);
      }
    }
  }

  /**
   * Look up which downstream server owns a tool.
   */
  getServer(toolName: string): string | undefined {
    return this.toolToServer.get(toolName);
  }

  /**
   * Get all registered tool names.
   */
  getAllToolNames(): string[] {
    return Array.from(this.toolToServer.keys());
  }

  /**
   * Get tool count per server.
   */
  getToolCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const serverId of this.toolToServer.values()) {
      counts.set(serverId, (counts.get(serverId) || 0) + 1);
    }
    return counts;
  }
}
