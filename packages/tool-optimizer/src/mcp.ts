/**
 * @tscg/tool-optimizer — MCP Server Proxy
 *
 * Creates a transparent proxy that intercepts MCP tool definitions
 * and applies TSCG compression before forwarding to the client.
 */

import { compress } from '@tscg/core';
import type { CompilerOptions, ModelTarget, AnyToolDefinition } from '@tscg/core';

/**
 * MCP Proxy configuration.
 */
export interface MCPProxyConfig {
  /** Command to launch the MCP server */
  serverCommand: string;

  /** Arguments for the server command */
  serverArgs: string[];

  /** Target model for optimization */
  model?: ModelTarget;

  /** Additional compiler options */
  compilerOptions?: CompilerOptions;
}

/**
 * MCP Proxy handle returned by createTSCGMCPProxy.
 */
export interface MCPProxyHandle {
  /** The proxy configuration */
  config: MCPProxyConfig;

  /** Compress a tools/list response */
  compressToolsList(toolsResponse: unknown): unknown;
}

/**
 * Create a TSCG-enabled MCP server proxy.
 *
 * The proxy intercepts `tools/list` responses from the MCP server
 * and compresses tool descriptions/schemas using TSCG principles.
 * All other messages pass through unmodified.
 *
 * NOTE: This is a configuration-only function in v1.0.0.
 * Full stdio proxy support will be added in a future release.
 * Currently provides the `compressToolsList` helper for manual integration.
 *
 * @example
 * ```ts
 * import { createTSCGMCPProxy } from '@tscg/tool-optimizer/mcp';
 *
 * const proxy = createTSCGMCPProxy({
 *   serverCommand: 'npx',
 *   serverArgs: ['-y', '@modelcontextprotocol/server-github'],
 *   model: 'claude-sonnet',
 * });
 *
 * // Use proxy.compressToolsList() to compress tool definitions
 * const compressed = proxy.compressToolsList(toolsListResponse);
 * ```
 */
export function createTSCGMCPProxy(config: MCPProxyConfig): MCPProxyHandle {
  const options: CompilerOptions = {
    model: config.model ?? 'auto',
    ...config.compilerOptions,
  };

  return {
    config,

    compressToolsList(toolsResponse: unknown): unknown {
      // MCP tools/list response has shape: { tools: [...] }
      if (
        typeof toolsResponse !== 'object' ||
        toolsResponse === null ||
        !('tools' in toolsResponse)
      ) {
        return toolsResponse;
      }

      const response = toolsResponse as { tools: Array<Record<string, unknown>> };
      const tools = response.tools;

      if (!Array.isArray(tools) || tools.length === 0) {
        return toolsResponse;
      }

      // Convert MCP tool format to AnyToolDefinition
      const toolDefs: AnyToolDefinition[] = tools.map((t) => ({
        name: (t.name as string) || '',
        description: (t.description as string) || '',
        input_schema: (t.inputSchema || { type: 'object' as const, properties: {} }),
      })) as AnyToolDefinition[];

      const result = compress(toolDefs, options);

      // Parse compressed output and update tool descriptions
      const compressedLines = result.compressed.split('\n').filter((l: string) => l.trim());
      const descMap = new Map<string, string>();

      for (const line of compressedLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          descMap.set(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim());
        }
      }

      return {
        ...response,
        tools: tools.map((t) => ({
          ...t,
          description: descMap.get(t.name as string) || t.description,
        })),
      };
    },
  };
}
