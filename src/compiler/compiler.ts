/**
 * TSCG Compiler
 * Compiles natural language prompts into TSCG grammar notation
 * Uses Claude API to parse NL into semantic atoms, then applies TSCG principles
 */

import { callClaude } from '../core/api.js';
import type { TscgConfig, CompilerOptions, DEFAULT_COMPILER_OPTIONS } from '../core/types.js';

const COMPILER_SYSTEM_PROMPT = `You are a TSCG (Token-Context Semantic Grammar) compiler. Your task is to convert natural language prompts into TSCG notation.

TSCG Principles:
1. CFL (Constraint-First Layout): Output format constraint goes FIRST in brackets: [ANSWER:type] or [CLASSIFY:options]
2. CFO (Causal-Forward Ordering): Dependencies flow left-to-right using → arrows
3. SDM (Semantic Density Maximization): Remove filler words, keep only semantic atoms
4. DRO (Delimiter-Role Optimization): Use key:value pairs, | for alternatives, → for flow
5. TAS (Tokenizer-Aligned Syntax): Use delimiters that tokenize as single tokens (→, |, :)

TSCG Syntax:
- Constraint: [ANSWER:type] or [CLASSIFY:opt1|opt2|opt3]
- Parameters: key:value pairs
- Flow: → connects steps left to right
- Context: <<CTX>>...<<CTX>> for large context blocks
- Lists: [item1,item2,item3]

Examples:
NL: "What is the capital of France?"
TSCG: [ANSWER:single_word] country:France → capital_city →

NL: "Classify this text as positive, negative, or neutral: 'Great product!'"
TSCG: [CLASSIFY:positive|negative|neutral] text:'Great product!' → sentiment →

NL: "A store has 45 apples. They sell 12 and receive 30. How many remain?"
TSCG: [ANSWER:integer] initial:45 → subtract:12 → add:30 → result →

NL: "List the top 3 countries by GDP as JSON with name and value fields"
TSCG: [ANSWER:json{name:string,value:number}[3]] query:countries_by_GDP → sort:descending → limit:3 → emit:json →

Rules:
- ALWAYS start with a constraint bracket [ANSWER:...] or [CLASSIFY:...]
- Use semantic compression: remove articles, prepositions, filler
- Preserve ALL critical information (numbers, names, constraints)
- Use causal ordering: put causes/inputs before effects/outputs
- Output ONLY the TSCG notation, nothing else`;

export interface CompileResult {
  input: string;
  tscg: string;
  inputTokens: number;
  outputTokens: number;
  inputCharCount: number;
  tscgCharCount: number;
  compressionRatio: number;
}

/**
 * Compile a natural language prompt to TSCG notation
 */
export async function compileTscg(
  nlPrompt: string,
  config: TscgConfig,
  _options?: Partial<CompilerOptions>
): Promise<CompileResult> {
  const compilerConfig: TscgConfig = {
    ...config,
    systemPrompt: COMPILER_SYSTEM_PROMPT,
    maxTokens: 500,
  };

  const response = await callClaude(
    `Convert this natural language prompt to TSCG notation:\n\n${nlPrompt}`,
    compilerConfig
  );

  if (response.error) {
    throw new Error(`Compilation failed: ${response.error}`);
  }

  const tscg = response.text.trim();

  return {
    input: nlPrompt,
    tscg,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    inputCharCount: nlPrompt.length,
    tscgCharCount: tscg.length,
    compressionRatio: tscg.length / nlPrompt.length,
  };
}

/**
 * Compile multiple prompts in batch
 */
export async function batchCompile(
  prompts: string[],
  config: TscgConfig,
  options?: Partial<CompilerOptions>,
  delayMs = 600
): Promise<CompileResult[]> {
  const results: CompileResult[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < prompts.length; i++) {
    console.log(`  Compiling [${i + 1}/${prompts.length}]...`);
    const result = await compileTscg(prompts[i], config, options);
    results.push(result);
    if (i < prompts.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}

/**
 * Apply SAD-F (Selective Anchor Duplication with Fragility scoring)
 * to an existing TSCG prompt
 */
export function applySADF(tscg: string, topK = 4): string {
  // Extract the constraint spec
  const spec = tscg.match(/\[[^\]]+\]/)?.[0] || '';

  // Extract key:value pairs
  const kvs = tscg.match(/\b\w+:[^\s\u2192|,\]]+/g) || [];

  // Sort by length (longer = more fragile, more information to preserve)
  const sorted = [...kvs].sort((a, b) => b.length - a.length);

  // Select top-K most fragile anchors
  const anchors = [spec, ...sorted.slice(0, topK)].filter(Boolean);

  return `${tscg} [ANCHOR:${anchors.join(',')}]`;
}

/**
 * Apply CCP (Causal Closure Principle) to an NL prompt
 */
export function applyCCP(nlPrompt: string, format: 'direct' | 'json' = 'direct'): string {
  const words = nlPrompt.split(/\s+/).filter((w) => w.length > 3);
  const keyWords = words.slice(0, 6).join(';');
  const op = format === 'json' ? 'OP=EMIT_JSON' : 'OP=EMIT_DIRECT';
  return `${nlPrompt}\n###<CC>\nt=${keyWords};\n${op};\n###</CC>`;
}
