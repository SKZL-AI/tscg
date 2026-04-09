/**
 * @tscg/core — Engine Bridge
 *
 * This module bridges the @tscg/core package to the existing TSCG
 * transform engine in ../../src/optimizer/transforms-tools.ts.
 *
 * It re-exports the transform types and functions with proper typing,
 * enabling the core package to use the existing transforms without
 * code duplication (DRY principle).
 *
 * The types here match the existing ToolDefinition interface from
 * the TSCG engine. At build time (tsup), the relative imports resolve
 * to the actual implementation.
 */

// ============================================================
// Internal Engine Types (matching src/optimizer/transforms-tools.ts)
// ============================================================

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  usageFrequency?: number;
}

export interface OptimizedToolDefs {
  text: string;
  originalTokenEstimate: number;
  optimizedTokenEstimate: number;
  savingsPercent: number;
}

// ============================================================
// Transform Functions
// ============================================================

/**
 * SDM: Semantic Density Maximization — strip filler from tool descriptions.
 */
export function applyToolSDM(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => ({
    ...tool,
    description: stripFiller(tool.description),
    parameters: tool.parameters.map((param) => ({
      ...param,
      description: stripFiller(param.description),
    })),
  }));
}

/** Filler patterns for SDM compression */
const FILLER_PATTERNS: Array<[RegExp, string]> = [
  [/\bUse this tool when you need to\s*/gi, ''],
  [/\bUse this (?:tool|function) (?:to|for)\s*/gi, ''],
  [/\bThis tool (?:allows you to|lets you|enables you to|is used to|can be used to|will)\s*/gi, ''],
  [/\bYou can use this (?:tool )? ?to\s*/gi, ''],
  [/\bThis (?:tool|function) (?:is designed|was designed) to\s*/gi, ''],
  [/\bPlease note that\s*/gi, ''],
  [/\bNote that\s*/gi, ''],
  [/\bIt (?:is|can be) (?:useful|helpful) (?:for|when)\s*/gi, ''],
  [/\bThis is (?:a|the) tool (?:for|that)\s*/gi, ''],
  [/\bThe (?:value|name|text|content|data|input|output) (?:of |for )?(?:the |a )?/gi, ''],
  [/\bSpecifies the\s*/gi, ''],
  [/\bIndicates (?:the|whether)\s*/gi, ''],
  [/\bDetermines (?:the|whether)\s*/gi, ''],
  [/\bRepresents (?:the|a)\s*/gi, ''],
  [/\s*\bif needed\.?\s*$/gi, ''],
  [/\s*\bif applicable\.?\s*$/gi, ''],
  [/\s*\bas needed\.?\s*$/gi, ''],
  [/\s*\bwhen available\.?\s*$/gi, ''],
  [/\bthat may have changed since your training cutoff\b/gi, ''],
  [/\bsince (?:the|your) (?:training|knowledge) cutoff\b/gi, ''],
  [/\bor any (?:other )?(?:current |relevant )?(?:data|information)\b/gi, ''],
  [/\bor any (?:other )?\w+ that (?:you |might |may )?\w+\b/gi, ''],
  [/\bto execute\b/gi, ''],
  [/\bto perform\b/gi, ''],
  [/\bto carry out\b/gi, ''],
  [/\s{2,}/g, ' '],
  [/\s+\./g, '.'],
  [/,\s*\./g, '.'],
  [/,\s*,/g, ','],
  [/^\s*,\s*/g, ''],
];

function stripFiller(text: string): string {
  let result = text;
  for (const [pattern, replacement] of FILLER_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  result = result.trim();
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  if (result.length > 0 && !/[.!?]$/.test(result)) {
    result += '.';
  }
  return result;
}

/** Type abbreviation map */
const TYPE_ABBREV: Record<string, string> = {
  string: 'str', number: 'num', boolean: 'bool', array: 'arr', object: 'obj',
};

/**
 * DRO: Delimiter-Role Optimization — compact parameter format.
 */
export function applyToolDRO(tools: ToolDefinition[]): string[] {
  return tools.map((tool) => {
    const paramParts = tool.parameters.map((param) => {
      const reqMark = param.required ? '*' : '';
      const typeAbbrev = TYPE_ABBREV[param.type] || param.type;
      const enumStr = param.enum && param.enum.length > 0 ? `: ${param.enum.join('|')}` : '';
      const typeStr = `${typeAbbrev}${enumStr}`;
      return `${param.name}${reqMark} (${typeStr}): ${param.description}`;
    });
    const paramLine = paramParts.length > 0 ? `\n  ${paramParts.join(' | ')}` : '';
    return `${tool.name}: ${tool.description}${paramLine}`;
  });
}

/**
 * CAS: Causal Access Score — U-shape reorder by usage frequency.
 */
export function applyToolCAS(tools: ToolDefinition[]): ToolDefinition[] {
  if (tools.length <= 2) return [...tools];
  const sorted = tools
    .map((tool, idx) => ({ tool, idx }))
    .sort((a, b) => {
      const freqA = a.tool.usageFrequency ?? 0.5;
      const freqB = b.tool.usageFrequency ?? 0.5;
      return freqB - freqA || a.idx - b.idx;
    })
    .map((entry) => entry.tool);
  const result: ToolDefinition[] = new Array(sorted.length);
  let left = 0;
  let right = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) result[left++] = sorted[i];
    else result[right--] = sorted[i];
  }
  return result;
}

/**
 * TAS: Tokenizer-Aligned Syntax — BPE-optimal formatting.
 */
export function applyToolTAS(toolLines: string[]): string {
  return toolLines
    .map((line) => {
      let result = line;
      result = result.replace(/=>/g, ':');
      result = result.replace(/-->/g, ':');
      result = result.replace(/\s*\|\s*/g, ' | ');
      result = result.replace(/:\s{2,}/g, ': ');
      return result;
    })
    .join('\n');
}

/**
 * SAD-F: Selective Anchor Duplication with Fragility Weighting.
 *
 * Extracts key:value pairs from the DRO-compressed text, sorts by length
 * (longer = more information = higher fragility), and appends the top-K
 * as an [ANCHOR:...] tag. This exploits recency bias in autoregressive
 * decoding to reinforce critical tool parameters.
 *
 * Adds ~5-15 tokens but improves accuracy on constrained tasks.
 * Only effective on Claude models (GPT/Gemini echo-back the tags).
 */
export function applyToolSAD(text: string, topK = 4): string {
  const anchors: string[] = [];

  // Strategy 1: Extract tool_name:first_key_param pairs from DRO format
  // DRO format: "ToolName: description\n  param* (type): desc | ..."
  const toolBlocks = text.split('\n').filter((l) => /^\w+:/.test(l) && !l.startsWith(' '));
  for (const line of toolBlocks) {
    const match = line.match(/^(\w+):/);
    if (match) anchors.push(match[1]);
  }

  // Strategy 2: Extract required params (marked with *)
  const reqParams = text.match(/\b(\w+)\*\s*\(/g) || [];
  for (const rp of reqParams) {
    const name = rp.match(/^(\w+)\*/)?.[1];
    if (name) anchors.push(`${name}*`);
  }

  // Strategy 3: Extract enum values (format: "type: val1|val2|val3")
  const enums = text.match(/\b\w+:\s*[\w]+(?:\|[\w]+)+/g) || [];
  for (const e of enums) {
    anchors.push(e.replace(/\s+/g, ''));
  }

  if (anchors.length === 0) return text;

  // Deduplicate and take top-K
  const unique = [...new Set(anchors)].slice(0, topK);
  return `${text}\n[ANCHOR:${unique.join(',')}]`;
}

/**
 * Full pipeline: SDM -> CAS -> DRO -> TAS (-> SAD) with metrics.
 */
export function optimizeToolDefinitions(
  tools: ToolDefinition[],
  options?: {
    useSDM?: boolean;
    useDRO?: boolean;
    useCAS?: boolean;
    useTAS?: boolean;
    useSAD?: boolean;
    sadTopK?: number;
  },
): OptimizedToolDefs {
  const opts = { useSDM: true, useDRO: true, useCAS: true, useTAS: true, useSAD: false, sadTopK: 4, ...options };

  // Original token estimate
  const originalLines: string[] = [];
  for (const tool of tools) {
    originalLines.push(`Tool: ${tool.name}`);
    originalLines.push(`Description: ${tool.description}`);
    originalLines.push('Parameters:');
    for (const param of tool.parameters) {
      const reqStr = param.required ? ' (required)' : ' (optional)';
      const enumStr = param.enum ? ` Allowed values: ${param.enum.join(', ')}.` : '';
      originalLines.push(`  - ${param.name} (${param.type})${reqStr}: ${param.description}${enumStr}`);
    }
    originalLines.push('');
  }
  const originalText = originalLines.join('\n');
  const originalTokenEstimate = Math.ceil(originalText.length / 4);

  let processed = tools;
  if (opts.useSDM) processed = applyToolSDM(processed);
  if (opts.useCAS) processed = applyToolCAS(processed);

  let toolLines: string[];
  if (opts.useDRO) {
    toolLines = applyToolDRO(processed);
  } else {
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

  let text: string;
  if (opts.useTAS) {
    text = applyToolTAS(toolLines);
  } else {
    text = toolLines.join('\n\n');
  }

  // 5. SAD-F: Selective Anchor Duplication (append anchors at end)
  if (opts.useSAD) {
    text = applyToolSAD(text, opts.sadTopK);
  }

  const optimizedTokenEstimate = Math.ceil(text.length / 4);
  const savingsPercent = originalTokenEstimate > 0
    ? Math.round(((originalTokenEstimate - optimizedTokenEstimate) / originalTokenEstimate) * 1000) / 10
    : 0;

  return { text, originalTokenEstimate, optimizedTokenEstimate, savingsPercent };
}
