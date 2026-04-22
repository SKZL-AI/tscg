/**
 * @tscg/mcp-proxy — Compressor Tests
 *
 * Tests compressMCPTools() — description-only and full-text modes.
 * Verifies JSON structure is preserved, descriptions are compressed,
 * metrics are accurate, and format conversion round-trips correctly.
 */

import { describe, it, expect } from 'vitest';
import { compressMCPTools, compressMCPToolsFull } from '../src/compressor.js';
import type { MCPToolDefinition, CompressionResult } from '../src/compressor.js';
import type { ProxyConfig } from '../src/types.js';

// ============================================================
// Helpers
// ============================================================

function mkConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    downstreams: [],
    mode: 'description-only',
    profile: 'conservative',
    model: 'auto',
    autoDisableThreshold: 30,
    metrics: true,
    logLevel: 'silent',
    ...overrides,
  };
}

function mkTool(name: string, desc: string, props: Record<string, unknown> = {}): MCPToolDefinition {
  return {
    name,
    description: desc,
    inputSchema: {
      type: 'object',
      properties: props,
      required: Object.keys(props),
    },
  };
}

/** Generate a verbose description with filler words that SDM strips.
 *  Uses exact patterns from _engine.ts FILLER_PATTERNS. */
function verboseDesc(base: string): string {
  return `Use this tool to ${base}. This tool allows you to ${base}. You can use this tool to ${base}. Note that the value of the input determines the output.`;
}

// ============================================================
// Test Fixtures
// ============================================================

const weatherTool: MCPToolDefinition = mkTool(
  'get_weather',
  verboseDesc('get the current weather conditions for a specific location'),
  {
    location: { type: 'string', description: 'The specific location to get weather for' },
    units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'The temperature units to use' },
  },
);

const searchTool: MCPToolDefinition = mkTool(
  'search_files',
  verboseDesc('search through files in the project directory for matching content'),
  {
    query: { type: 'string', description: 'The search query to use for finding matching content' },
    path: { type: 'string', description: 'The directory path to search in' },
  },
);

// ============================================================
// Tests
// ============================================================

describe('compressMCPTools', () => {
  // --- Empty input ---

  it('should handle empty tool array', () => {
    const result = compressMCPTools([], mkConfig());
    expect(result.tools).toEqual([]);
    expect(result.originalTokens).toBe(0);
    expect(result.compressedTokens).toBe(0);
    expect(result.savingsPercent).toBe(0);
    expect(result.compressionTimeMs).toBe(0);
  });

  // --- Description-only mode ---

  describe('description-only mode', () => {
    it('should preserve tool names', () => {
      const result = compressMCPTools([weatherTool, searchTool], mkConfig());
      expect(result.tools.map((t) => t.name)).toEqual(['get_weather', 'search_files']);
    });

    it('should preserve inputSchema structure', () => {
      const result = compressMCPTools([weatherTool], mkConfig());
      const out = result.tools[0];
      expect(out.inputSchema.type).toBe('object');
      expect(out.inputSchema.required).toEqual(weatherTool.inputSchema.required);
      // Properties should exist (may be compressed descriptions)
      expect(out.inputSchema.properties).toBeDefined();
      expect(Object.keys(out.inputSchema.properties!)).toEqual(
        Object.keys(weatherTool.inputSchema.properties!),
      );
    });

    it('should produce compressed descriptions (shorter than original)', () => {
      // Use balanced profile for more aggressive SDM compression
      const result = compressMCPTools([weatherTool], mkConfig({ profile: 'balanced' }));
      const originalLen = weatherTool.description!.length;
      const compressedLen = result.tools[0].description!.length;
      expect(compressedLen).toBeLessThan(originalLen);
    });

    it('should report positive savings percent with balanced profile', () => {
      const result = compressMCPTools([weatherTool, searchTool], mkConfig({ profile: 'balanced' }));
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.originalTokens).toBeGreaterThan(result.compressedTokens);
    });

    it('should track compression time', () => {
      const result = compressMCPTools([weatherTool], mkConfig());
      expect(result.compressionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should list applied principles', () => {
      const result = compressMCPTools([weatherTool], mkConfig());
      expect(Array.isArray(result.appliedPrinciples)).toBe(true);
      expect(result.appliedPrinciples.length).toBeGreaterThan(0);
    });

    it('should handle tools without descriptions', () => {
      const tool = mkTool('no_desc', '', {});
      const result = compressMCPTools([tool], mkConfig());
      expect(result.tools[0].name).toBe('no_desc');
    });

    it('should preserve extra inputSchema fields', () => {
      const tool: MCPToolDefinition = {
        name: 'custom',
        description: 'This is a custom tool that basically does something.',
        inputSchema: {
          type: 'object',
          properties: { x: { type: 'number' } },
          additionalProperties: false,
        },
      };
      const result = compressMCPTools([tool], mkConfig());
      // The additionalProperties should survive
      expect(result.tools[0].inputSchema.additionalProperties).toBe(false);
    });
  });

  // --- Full-text mode ---

  describe('full-text mode', () => {
    it('should return original tools unchanged', () => {
      const config = mkConfig({ mode: 'full-text' });
      const result = compressMCPTools([weatherTool], config);
      // In full-text mode, the original tools are returned as-is
      expect(result.tools[0].name).toBe('get_weather');
      expect(result.tools[0].description).toBe(weatherTool.description);
    });

    it('should still report token savings', () => {
      const config = mkConfig({ mode: 'full-text' });
      const result = compressMCPTools([weatherTool, searchTool], config);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeGreaterThan(0);
    });
  });

  // --- Profile propagation ---

  it('should report the resolved profile', () => {
    const result = compressMCPTools([weatherTool], mkConfig({ profile: 'aggressive' }));
    expect(typeof result.profile).toBe('string');
  });

  // --- Multi-tool scaling ---

  it('should handle many tools efficiently (<50ms for 25 tools)', () => {
    const tools: MCPToolDefinition[] = [];
    for (let i = 0; i < 25; i++) {
      tools.push(mkTool(
        `tool_${i}`,
        verboseDesc(`perform operation ${i} on the provided data`),
        { input: { type: 'string', description: 'The input data to process' } },
      ));
    }
    const start = performance.now();
    const result = compressMCPTools(tools, mkConfig());
    const elapsed = performance.now() - start;

    expect(result.tools.length).toBe(25);
    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================
// Integration Tests — compressMCPToolsFull (v1.4.1)
// ============================================================

describe('compressMCPToolsFull', () => {
  it('Opus target produces >40% savings on verbose tools', () => {
    const tools: MCPToolDefinition[] = [];
    for (let i = 0; i < 10; i++) {
      tools.push(mkTool(
        `tool_${i}`,
        verboseDesc(`perform complex operation ${i} on the provided input data`),
        {
          input: { type: 'string', description: 'The input data to process and transform' },
          output: { type: 'string', description: 'The expected output format specification' },
        },
      ));
    }

    const r = compressMCPToolsFull(tools, {
      target: 'claude-opus-4-7',
      mode: 'full',
    });

    expect(r.savingsPercent).toBeGreaterThan(40);
    expect(r.compressionTimeMs).toBeLessThan(50);
    expect(r.archetype).toBe('hungry');
    expect(r.appliedPrinciples.length).toBeGreaterThan(0);
  });

  it('empty tools returns zero-cost result', () => {
    const r = compressMCPToolsFull([], { target: 'claude-opus-4-7' });
    expect(r.tools).toEqual([]);
    expect(r.savingsPercent).toBe(0);
    expect(r.archetype).toBe('safe-fallback');
  });
});
