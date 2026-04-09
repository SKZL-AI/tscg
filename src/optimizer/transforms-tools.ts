/**
 * TSCG Tool-Description Transforms
 *
 * Deterministic, pure transforms for compressing and optimizing how tool
 * definitions are presented to an LLM. These reduce token costs on every
 * API call where tool definitions are sent as part of the system prompt,
 * while preserving tool selection accuracy.
 *
 * Transforms (applied in pipeline order):
 *   1. SDM  -- Semantic Density Maximization (strip verbose filler from descriptions)
 *   2. CAS  -- Causal Access Score (U-shape reorder by usage frequency)
 *   3. DRO  -- Delimiter-Role Optimization (compact parameter format)
 *   4. TAS  -- Tokenizer-Aligned Syntax (BPE-optimal formatting)
 *
 * All functions are pure (no side effects, no API calls) and deterministic
 * (same input always produces same output). This file is self-contained --
 * it does not import from other TSCG modules.
 */

// === Types ===

export interface ToolParameter {
  name: string;
  type: string;           // 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  usageFrequency?: number;  // 0-1, how often this tool is called (for CAS ordering)
}

export interface OptimizedToolDefs {
  text: string;              // The optimized tool definitions as a string
  originalTokenEstimate: number;
  optimizedTokenEstimate: number;
  savingsPercent: number;
}

// === Helper: estimate tokens ===

/**
 * Estimate token count using the ~4 characters per token heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// === Helper: format tool as natural text (for original token estimation) ===

/**
 * Render a ToolDefinition array as a natural JSON-Schema-style text block,
 * the way tools are typically presented to an LLM before optimization.
 */
function renderToolsNatural(tools: ToolDefinition[]): string {
  const lines: string[] = [];

  for (const tool of tools) {
    lines.push(`Tool: ${tool.name}`);
    lines.push(`Description: ${tool.description}`);
    lines.push('Parameters:');
    for (const param of tool.parameters) {
      const reqStr = param.required ? ' (required)' : ' (optional)';
      const enumStr = param.enum ? ` Allowed values: ${param.enum.join(', ')}.` : '';
      lines.push(`  - ${param.name} (${param.type})${reqStr}: ${param.description}${enumStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// === 1. applyToolSDM -- Description Compression ===

/**
 * Filler patterns to remove from tool descriptions.
 * Each entry is [pattern, replacement].
 * Order matters: broader patterns come after more specific ones so that
 * specific removals are not clobbered.
 */
const TOOL_FILLER_PATTERNS: Array<[RegExp, string]> = [
  // Verbose tool-description intros
  [/\bUse this tool when you need to\s*/gi, ''],
  [/\bUse this (?:tool|function) (?:to|for)\s*/gi, ''],
  [/\bThis tool (?:allows you to|lets you|enables you to|is used to|can be used to|will)\s*/gi, ''],
  [/\bYou can use this (?:tool )? ?to\s*/gi, ''],
  [/\bThis (?:tool|function) (?:is designed|was designed) to\s*/gi, ''],
  [/\bPlease note that\s*/gi, ''],
  [/\bNote that\s*/gi, ''],
  [/\bIt (?:is|can be) (?:useful|helpful) (?:for|when)\s*/gi, ''],
  [/\bThis is (?:a|the) tool (?:for|that)\s*/gi, ''],

  // Verbose parameter-description intros
  [/\bThe (?:value|name|text|content|data|input|output) (?:of |for )?(?:the |a )?/gi, ''],
  [/\bSpecifies the\s*/gi, ''],
  [/\bIndicates (?:the|whether)\s*/gi, ''],
  [/\bDetermines (?:the|whether)\s*/gi, ''],
  [/\bRepresents (?:the|a)\s*/gi, ''],

  // Trailing filler
  [/\s*\bif needed\.?\s*$/gi, ''],
  [/\s*\bif applicable\.?\s*$/gi, ''],
  [/\s*\bas needed\.?\s*$/gi, ''],
  [/\s*\bwhen available\.?\s*$/gi, ''],

  // Generic hedging in tool descriptions
  [/\bthat may have changed since your training cutoff\b/gi, ''],
  [/\bsince (?:the|your) (?:training|knowledge) cutoff\b/gi, ''],
  [/\bor any (?:other )?(?:current |relevant )?(?:data|information)\b/gi, ''],
  [/\bor any (?:other )?\w+ that (?:you |might |may )?\w+\b/gi, ''],

  // Redundant "to execute", "to perform"
  [/\bto execute\b/gi, ''],
  [/\bto perform\b/gi, ''],
  [/\bto carry out\b/gi, ''],

  // Clean up double spaces
  [/\s{2,}/g, ' '],
  // Clean up orphaned periods and commas
  [/\s+\./g, '.'],
  [/,\s*\./g, '.'],
  [/,\s*,/g, ','],
  [/^\s*,\s*/g, ''],
];

/**
 * Compress verbose tool descriptions by removing filler phrases.
 *
 * Example:
 *   "Search the web for current information. Use this tool when you need to
 *    find recent events, news, product information, or any current data."
 *   -> "Search the web for current information: events, news, products."
 *
 * Also compresses parameter descriptions using the same filler patterns.
 */
export function applyToolSDM(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => ({
    ...tool,
    description: compressText(tool.description),
    parameters: tool.parameters.map((param) => ({
      ...param,
      description: compressText(param.description),
    })),
  }));
}

/**
 * Apply filler removal patterns to a single text string.
 */
function compressText(text: string): string {
  let result = text;

  for (const [pattern, replacement] of TOOL_FILLER_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  result = result.trim();

  // Capitalize first letter if it was lowered by removal
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // Ensure the description ends with a period
  if (result.length > 0 && !/[.!?]$/.test(result)) {
    result += '.';
  }

  return result;
}

// === 2. applyToolDRO -- Parameter Format Optimization ===

/**
 * Type abbreviation map for compact parameter format.
 */
const TYPE_ABBREV: Record<string, string> = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  array: 'arr',
  object: 'obj',
};

/**
 * Convert verbose JSON Schema parameter definitions to compact format.
 *
 * BEFORE: { name: "query", type: "string", description: "The search query to execute", required: true }
 * AFTER:  "query* (str): Search query"
 *
 * BEFORE: { name: "limit", type: "number", description: "Maximum results", required: false }
 * AFTER:  "limit (num): Max results"
 *
 * Format per tool:
 *   tool_name: compressed_description
 *     param1* (type): desc | param2 (type): desc
 *
 * Where * marks required params. Enum values shown as:
 *   priority (str: low|med|high|critical): Task priority
 */
export function applyToolDRO(tools: ToolDefinition[]): string[] {
  return tools.map((tool) => {
    const paramParts = tool.parameters.map((param) => {
      const reqMark = param.required ? '*' : '';
      const typeAbbrev = TYPE_ABBREV[param.type] || param.type;
      const enumStr = param.enum && param.enum.length > 0
        ? `: ${param.enum.join('|')}`
        : '';
      const typeStr = `${typeAbbrev}${enumStr}`;
      return `${param.name}${reqMark} (${typeStr}): ${param.description}`;
    });

    const paramLine = paramParts.length > 0
      ? `\n  ${paramParts.join(' | ')}`
      : '';

    return `${tool.name}: ${tool.description}${paramLine}`;
  });
}

// === 3. applyToolCAS -- U-Shape Ordering by Frequency ===

/**
 * Reorder tools in a U-shape by usage frequency.
 *
 * High-frequency tools are placed at position 0 (attention sink / primacy)
 * and position N (recency bias). Low-frequency tools are pushed to the
 * middle where LLM attention is weakest ("Lost in the Middle" effect).
 *
 * Algorithm:
 *   1. Sort tools by usageFrequency descending
 *   2. Place them alternately at the left (start) and right (end):
 *      - Rank 1 (highest)  -> position 0
 *      - Rank 2            -> position N-1
 *      - Rank 3            -> position 1
 *      - Rank 4            -> position N-2
 *      - ...
 *      - Lowest frequency  -> middle positions
 *
 * Tools without a usageFrequency default to 0.5 (medium).
 */
export function applyToolCAS(tools: ToolDefinition[]): ToolDefinition[] {
  if (tools.length <= 2) return [...tools];

  // Sort by usageFrequency descending, preserving original order for ties
  const sorted = tools
    .map((tool, idx) => ({ tool, idx }))
    .sort((a, b) => {
      const freqA = a.tool.usageFrequency ?? 0.5;
      const freqB = b.tool.usageFrequency ?? 0.5;
      return freqB - freqA || a.idx - b.idx;
    })
    .map((entry) => entry.tool);

  // U-shape placement: alternate left and right
  const result: ToolDefinition[] = new Array(sorted.length);
  let left = 0;
  let right = sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      result[left++] = sorted[i];
    } else {
      result[right--] = sorted[i];
    }
  }

  return result;
}

// === 4. applyToolTAS -- BPE-Optimal Formatting ===

/**
 * Format tool definition lines using BPE-optimal delimiters.
 *
 * Optimizations applied:
 *   - No JSON quotes around keys
 *   - Use : instead of =>
 *   - Use | for enum values (already done by DRO)
 *   - Compact whitespace (no blank lines between tools)
 *   - Single newline separators
 *
 * Takes the string[] output from applyToolDRO and produces a single
 * optimized text block.
 */
export function applyToolTAS(toolLines: string[]): string {
  return toolLines
    .map((line) => {
      let result = line;

      // Replace any remaining => with : (BPE-optimal)
      result = result.replace(/=>/g, ':');

      // Replace --> or -> with : in non-arrow contexts
      result = result.replace(/-->/g, ':');

      // Collapse whitespace around delimiters for tighter packing
      result = result.replace(/\s*\|\s*/g, ' | ');

      // Remove redundant spaces after colons in key:value pairs
      result = result.replace(/:\s{2,}/g, ': ');

      return result;
    })
    .join('\n');
}

// === 5. optimizeToolDefinitions -- Full Pipeline ===

/**
 * Apply all tool transforms in order and return optimized tool definitions
 * as a formatted string with token savings metrics.
 *
 * Pipeline order: SDM -> CAS -> DRO -> TAS
 *
 * Default: all options enabled.
 */
export function optimizeToolDefinitions(
  tools: ToolDefinition[],
  options?: {
    useSDM?: boolean;
    useDRO?: boolean;
    useCAS?: boolean;
    useTAS?: boolean;
  },
): OptimizedToolDefs {
  const opts = {
    useSDM: true,
    useDRO: true,
    useCAS: true,
    useTAS: true,
    ...options,
  };

  // Compute original token estimate from natural rendering
  const originalText = renderToolsNatural(tools);
  const originalTokenEstimate = estimateTokens(originalText);

  // Pipeline: SDM -> CAS -> DRO -> TAS
  let processed = tools;

  // 1. SDM: compress descriptions
  if (opts.useSDM) {
    processed = applyToolSDM(processed);
  }

  // 2. CAS: reorder by frequency (U-shape)
  if (opts.useCAS) {
    processed = applyToolCAS(processed);
  }

  // 3. DRO: compact parameter format
  let toolLines: string[];
  if (opts.useDRO) {
    toolLines = applyToolDRO(processed);
  } else {
    // Fall back to a simple natural rendering of the (potentially SDM/CAS-processed) tools
    toolLines = processed.map((tool) => {
      const params = tool.parameters
        .map((p) => {
          const req = p.required ? ' (required)' : ' (optional)';
          const enumStr = p.enum ? ` Allowed values: ${p.enum.join(', ')}.` : '';
          return `  - ${p.name} (${p.type})${req}: ${p.description}${enumStr}`;
        })
        .join('\n');
      return `${tool.name}: ${tool.description}\n${params}`;
    });
  }

  // 4. TAS: BPE-optimal formatting
  let text: string;
  if (opts.useTAS) {
    text = applyToolTAS(toolLines);
  } else {
    text = toolLines.join('\n\n');
  }

  const optimizedTokenEstimate = estimateTokens(text);
  const savingsPercent = originalTokenEstimate > 0
    ? Math.round(((originalTokenEstimate - optimizedTokenEstimate) / originalTokenEstimate) * 1000) / 10
    : 0;

  return {
    text,
    originalTokenEstimate,
    optimizedTokenEstimate,
    savingsPercent,
  };
}
