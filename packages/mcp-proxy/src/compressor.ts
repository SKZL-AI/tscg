/**
 * @tscg/mcp-proxy — Compressor
 *
 * TSCG compression layer for MCP tool schemas.
 * Supports both description-only and full-text compression modes.
 */

import { compressDescriptions, compress } from '@tscg/core';
import type { AnyToolDefinition, DescriptionOnlyResult } from '@tscg/core';
import { resolveProfile } from './auto-profile.js';
import type { ProxyConfig } from './types.js';

/** MCP tool definition as received from downstream servers */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface CompressionResult {
  tools: MCPToolDefinition[];
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  compressionTimeMs: number;
  appliedPrinciples: string[];
  profile: string;
}

/**
 * Convert MCP tool format to Anthropic AnyToolDefinition format.
 * MCP uses { name, description, inputSchema } which maps to Anthropic format.
 */
function mcpToAnyTool(tool: MCPToolDefinition): AnyToolDefinition {
  return {
    name: tool.name,
    description: tool.description || '',
    input_schema: {
      type: 'object',
      properties: (tool.inputSchema.properties || {}) as Record<string, { type: string; description?: string; enum?: string[] }>,
      required: tool.inputSchema.required,
    },
  };
}

/**
 * Convert Anthropic tool back to MCP format.
 */
function anyToolToMcp(tool: AnyToolDefinition, originalTool: MCPToolDefinition): MCPToolDefinition {
  if ('input_schema' in tool) {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        ...originalTool.inputSchema,
        properties: tool.input_schema.properties as Record<string, unknown>,
        required: tool.input_schema.required,
      },
    };
  }
  // Fallback — return original
  return originalTool;
}

/**
 * Compress MCP tools using TSCG.
 *
 * In description-only mode (default): compresses descriptions, preserves JSON schema.
 * In full-text mode: produces compressed text for system prompt injection.
 */
export function compressMCPTools(
  tools: MCPToolDefinition[],
  config: ProxyConfig,
): CompressionResult {
  if (tools.length === 0) {
    return {
      tools: [],
      originalTokens: 0,
      compressedTokens: 0,
      savingsPercent: 0,
      compressionTimeMs: 0,
      appliedPrinciples: [],
      profile: config.profile,
    };
  }

  // Convert MCP tools to AnyToolDefinition for @tscg/core
  const anyTools = tools.map(mcpToAnyTool);

  // Resolve profile based on tool count
  const options = resolveProfile(config, tools.length);

  if (config.mode === 'description-only') {
    const result: DescriptionOnlyResult = compressDescriptions(anyTools, options);

    // Convert back to MCP format
    const compressedMCPTools = result.tools.map((t: AnyToolDefinition, i: number) => anyToolToMcp(t, tools[i]));

    return {
      tools: compressedMCPTools,
      originalTokens: result.metrics.descriptions.originalTokens,
      compressedTokens: result.metrics.descriptions.compressedTokens,
      savingsPercent: result.metrics.descriptions.savingsPercent,
      compressionTimeMs: result.metrics.compressionTimeMs,
      appliedPrinciples: result.appliedPrinciples,
      profile: options.profile || config.profile,
    };
  }

  // Full-text mode — compress everything into text
  const result = compress(anyTools, options);
  return {
    tools, // Return original tools unchanged — the compressed text goes elsewhere
    originalTokens: result.metrics.tokens.original,
    compressedTokens: result.metrics.tokens.compressed,
    savingsPercent: result.metrics.tokens.savingsPercent,
    compressionTimeMs: result.metrics.compressionTimeMs,
    appliedPrinciples: result.appliedPrinciples,
    profile: options.profile || config.profile,
  };
}
