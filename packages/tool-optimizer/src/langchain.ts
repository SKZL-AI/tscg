/**
 * @tscg/tool-optimizer — LangChain Integration
 *
 * Wraps tool definitions with TSCG compression for LangChain-compatible
 * agent frameworks. Works with any tool array that has name + description.
 */

import { compress } from '@tscg/core';
import type { CompilerOptions, AnyToolDefinition } from '@tscg/core';

/**
 * Generic tool interface matching LangChain's BaseTool shape.
 * This is intentionally loose to avoid requiring LangChain as a dependency.
 */
export interface ToolLike {
  name: string;
  description: string;
  [key: string]: unknown;
}

/**
 * Wrap tools with TSCG compression.
 *
 * Takes an array of tool-like objects, compresses their descriptions
 * using TSCG principles, and returns modified copies.
 *
 * Works with LangChain tools, raw objects, or any tool format
 * that has `name` and `description` properties.
 *
 * @param tools   - Array of tools to compress
 * @param options - TSCG compiler options
 * @returns Array of tools with compressed descriptions
 *
 * @example
 * ```ts
 * import { withTSCG } from '@tscg/tool-optimizer';
 *
 * const optimizedTools = withTSCG(myLangChainTools, {
 *   model: 'claude-sonnet',
 *   profile: 'balanced',
 * });
 * ```
 */
export function withTSCG<T extends ToolLike>(
  tools: T[],
  options?: CompilerOptions,
): T[] {
  // Convert to AnyToolDefinition format for compression
  const toolDefs: AnyToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  }));

  const result = compress(toolDefs, options);

  // The compressed text contains all tools in compact format.
  // Parse compressed descriptions back and apply to original tools.
  const compressedLines = result.compressed.split('\n').filter((l: string) => l.trim());
  const compressedMap = new Map<string, string>();

  for (const line of compressedLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const name = line.slice(0, colonIdx).trim();
      const desc = line.slice(colonIdx + 1).trim();
      compressedMap.set(name, desc);
    }
  }

  return tools.map((tool) => ({
    ...tool,
    description: compressedMap.get(tool.name) || tool.description,
  }));
}
