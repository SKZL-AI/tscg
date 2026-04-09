/**
 * @tscg/tool-optimizer — Vercel AI SDK Middleware
 *
 * Provides TSCG compression as middleware for the Vercel AI SDK.
 */

import { compress } from '@tscg/core';
import type { CompilerOptions, AnyToolDefinition } from '@tscg/core';

/**
 * Vercel AI SDK CoreTool-like interface.
 * Intentionally loose to avoid requiring the SDK as a dependency.
 */
export interface CoreToolLike {
  description?: string;
  parameters?: unknown;
  [key: string]: unknown;
}

/**
 * TSCG middleware for the Vercel AI SDK.
 *
 * Returns a middleware object with a `transformTools` method that
 * compresses tool descriptions before they are sent to the LLM.
 *
 * @param options - TSCG compiler options
 * @returns Middleware object compatible with Vercel AI SDK patterns
 *
 * @example
 * ```ts
 * import { tscgMiddleware } from '@tscg/tool-optimizer/vercel';
 * import { generateText } from 'ai';
 *
 * const middleware = tscgMiddleware({ model: 'claude-sonnet' });
 *
 * // Apply before passing tools to generateText
 * const optimizedTools = middleware.transformTools(myTools);
 * ```
 */
export function tscgMiddleware(options?: CompilerOptions): {
  transformTools<T extends Record<string, CoreToolLike>>(tools: T): T;
} {
  return {
    transformTools<T extends Record<string, CoreToolLike>>(tools: T): T {
      const entries = Object.entries(tools);
      if (entries.length === 0) return tools;

      // Convert to AnyToolDefinition format
      const toolDefs: AnyToolDefinition[] = entries.map(([name, tool]) => ({
        name,
        description: tool.description || '',
        input_schema: {
          type: 'object' as const,
          properties: (tool.parameters && typeof tool.parameters === 'object')
            ? (tool.parameters as Record<string, unknown>)
            : {},
        },
      })) as AnyToolDefinition[];

      const result = compress(toolDefs, options);

      // Parse compressed descriptions
      const compressedLines = result.compressed.split('\n').filter((l: string) => l.trim());
      const descMap = new Map<string, string>();

      for (const line of compressedLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          descMap.set(line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim());
        }
      }

      // Apply compressed descriptions
      const optimized = { ...tools };
      for (const [name, tool] of entries) {
        const compressed = descMap.get(name);
        if (compressed) {
          (optimized as Record<string, CoreToolLike>)[name] = {
            ...tool,
            description: compressed,
          };
        }
      }

      return optimized;
    },
  };
}
