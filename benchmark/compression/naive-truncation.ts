/**
 * Naive Truncation Baseline (FIX-05)
 *
 * Strips all descriptions, optional parameters, and metadata from tool schemas.
 * Keeps only tool name + required parameter names with types.
 *
 * This is the "dumbest possible compression" baseline. It demonstrates that
 * TSCG's intelligent compression preserves accuracy where naive truncation
 * destroys it — i.e., TSCG is not just "shortening" but "smart compression".
 *
 * Expected result: higher token savings than TSCG but significantly lower accuracy.
 */

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string; description?: string }>;
  };
}

/**
 * Naive truncation: keep only tool name + required parameters (name:type).
 * Strips all descriptions, optional parameters, and metadata.
 */
export function naiveTruncate(tools: ToolDefinition[]): string {
  return tools.map(tool => {
    const params = tool.parameters?.required?.map(name => {
      const prop = tool.parameters?.properties?.[name];
      return `${name}:${prop?.type || 'any'}`;
    }) || [];
    return `${tool.name}(${params.join(',')})`;
  }).join('\n');
}

/**
 * Estimate token count for naive truncation output.
 * Uses rough 4-chars-per-token heuristic.
 */
export function estimateNaiveTruncationTokens(tools: ToolDefinition[]): number {
  const text = naiveTruncate(tools);
  return Math.ceil(text.length / 4);
}
