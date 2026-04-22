/**
 * @tscg/mcp-proxy — Compressor
 *
 * TSCG compression layer for MCP tool schemas.
 * Supports both description-only and full-text compression modes.
 */

import { compressDescriptions, compress } from '@tscg/core';
import type { AnyToolDefinition, DescriptionOnlyResult } from '@tscg/core';
import { resolveProfile } from './auto-profile.js';
import { resolveModelProfile } from './model-profiles.js';
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

  // Normalize legacy 'full-text' to 'full' for backward compatibility
  const effectiveMode = config.mode === 'full-text' ? 'full' : config.mode;

  if (effectiveMode === 'description-only') {
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

  // Full / full-text mode — compress everything into text
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

/**
 * Result from full per-model compression via compressMCPToolsFull().
 */
export interface FullCompressionResult {
  tools: MCPToolDefinition[];
  compressedText: string;
  compressionTimeMs: number;
  savingsPercent: number;
  originalTokens: number;
  compressedTokens: number;
  appliedPrinciples: string[];
  archetype: string;
  rationale: string;
  profile: string;
}

/**
 * Compress MCP tools using the full @tscg/core pipeline with per-model profile.
 *
 * This is the recommended path for known model targets (claude-opus-4-7, etc.).
 * Uses resolveModelProfile() to select the optimal operator set for the target model,
 * based on 720-call E2E benchmark data.
 */
export function compressMCPToolsFull(
  tools: MCPToolDefinition[],
  config: { target?: string; mode?: string },
): FullCompressionResult {
  if (tools.length === 0) {
    return {
      tools: [],
      compressedText: '',
      compressionTimeMs: 0,
      savingsPercent: 0,
      originalTokens: 0,
      compressedTokens: 0,
      appliedPrinciples: [],
      archetype: 'safe-fallback',
      rationale: 'No tools to compress',
      profile: 'conservative',
    };
  }

  const modelProfile = resolveModelProfile(config.target);
  const anyTools = tools.map(mcpToAnyTool);

  const t0 = performance.now();
  const result = compress(anyTools, {
    model: modelProfile.target as NonNullable<Parameters<typeof compress>[1]>['model'],
    profile: modelProfile.profile,
    principles: modelProfile.operators,
  });
  const elapsed = performance.now() - t0;

  return {
    tools, // Original tools — compressed text is separate
    compressedText: result.compressed,
    compressionTimeMs: elapsed,
    savingsPercent: result.metrics.tokens.savingsPercent,
    originalTokens: result.metrics.tokens.original,
    compressedTokens: result.metrics.tokens.compressed,
    appliedPrinciples: result.appliedPrinciples,
    archetype: modelProfile.archetype,
    rationale: modelProfile.rationale,
    profile: modelProfile.profile,
  };
}
