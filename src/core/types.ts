/**
 * TSCG Core Types
 * Token-Context Semantic Grammar type definitions
 */

// === Grammar Atoms ===

export interface TscgAtom {
  type: AtomType;
  key: string;
  value: string;
  position?: number;
  fragilityScore?: number;
}

export type AtomType =
  | 'constraint'    // [ANSWER:type] output format constraint
  | 'parameter'     // key:value input parameter
  | 'operation'     // → operator → operation step
  | 'context'       // <<CTX>>...<<CTX>> context block
  | 'anchor'        // [ANCHOR:...] duplicated anchor
  | 'delimiter'     // →, |, etc.
  | 'section';      // logical grouping

// === Compiled TSCG Prompt ===

export interface TscgPrompt {
  constraint: string;         // [ANSWER:type] or [CLASSIFY:options]
  parameters: TscgAtom[];     // key:value pairs
  operations: TscgAtom[];     // → step → step
  context?: string;           // optional <<CTX>>...<<CTX>>
  anchors?: string[];         // optional [ANCHOR:...] items
  raw: string;                // final compiled string
}

// === Strategy Definitions ===

export type StrategyName =
  | 'natural'
  | 'repetition'
  | 'tscg'
  | 'tscg+sad'
  | 'tscg+rep'
  | 'ccp';

export interface Strategy {
  name: StrategyName;
  description: string;
  transform: (test: TestCase) => string;
}

// === Test Case ===

export interface TestCase {
  id: string;
  category: TestCategory;
  name: string;
  expected: string;
  natural: string;          // NL prompt
  tscg: string;             // TSCG grammar prompt
  check: (response: string) => boolean;
  tags?: string[];
}

export type TestCategory =
  | 'Factual'
  | 'Reasoning'
  | 'Classification'
  | 'Extraction'
  | 'OptFirst'
  | 'Complex'
  | 'NearDup'
  | 'LongContext'
  | 'MultiConstraint'
  | 'MultiConstraint_Hard'
  | 'AmbiguousMath'
  | 'PrecisionExtraction'
  | 'FormatCritical'
  | 'LongDependency'
  | 'RAG_SingleFact'
  | 'RAG_MultiFact'
  | 'RAG_Reasoning'
  | 'RAG_Conflicting'
  | 'Tool_SingleTool'
  | 'Tool_MultiTool'
  | 'Tool_Ambiguous'
  | 'Tool_NoTool'
  | 'LongContext_NIAH';

// === API Response ===

export interface ApiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error: string | null;
}

// === Benchmark Result ===

export interface BenchmarkResult {
  id: string;
  category: TestCategory;
  name: string;
  strategy: StrategyName;
  correct: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  response: string;
  error: string | null;
  expected: string;
  promptLength: number;
}

// === Strategy Summary ===

export interface StrategySummary {
  name: StrategyName;
  correct: number;
  total: number;
  accuracy: number;
  ci95: [number, number];
  avgInputTokens: number;
  avgOutputTokens: number;
  avgLatencyMs: number;
  accuracyPerToken: number;
}

// === Benchmark Report ===

export interface BenchmarkReport {
  meta: {
    model: string;
    timestamp: string;
    totalTests: number;
    totalStrategies: number;
    totalApiCalls: number;
    durationMs: number;
    provider: string;
    rateLimitStats?: {
      totalRetries: number;
      totalWaitMs: number;
    };
  };
  summaries: Record<StrategyName, StrategySummary>;
  categoryBreakdown: Record<string, Record<string, { correct: number; total: number }>>;
  mcnemarTests: Record<string, { b: number; c: number; pValue: number; significant: boolean; direction: string }>;
  headToHead: Array<{ a: StrategyName; b: StrategyName; wins: number; losses: number; ties: number }>;
  tokenCost: Record<StrategyName, { avgInput: number; ratio: number; savingPct: number }>;
  results: BenchmarkResult[];
}

// === Compiler Types ===

export interface CompilerOptions {
  enableSAD: boolean;       // Selective Anchor Duplication
  sadBudget: number;        // max extra tokens for anchors (fraction 0-1)
  sadTopK: number;          // max anchors
  enableTAS: boolean;       // Tokenizer-Aligned Syntax
  enableCFL: boolean;       // Constraint-First Layout
  enableCFO: boolean;       // Causal-Forward Ordering
}

export const DEFAULT_COMPILER_OPTIONS: CompilerOptions = {
  enableSAD: true,
  sadBudget: 0.3,
  sadTopK: 4,
  enableTAS: true,
  enableCFL: true,
  enableCFO: true,
};

// === Provider ===

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'moonshot';

// === Model Profiles ===

export type ModelFamily = 'claude' | 'gpt5' | 'gpt4o' | 'gemini' | 'unknown';

export interface ModelProfile {
  family: ModelFamily;
  enableCFL: boolean;
  enableSAD: boolean;
}

export const MODEL_PROFILES: Record<ModelFamily, ModelProfile> = {
  claude:  { family: 'claude',  enableCFL: true,  enableSAD: true  },
  gpt5:    { family: 'gpt5',    enableCFL: true,  enableSAD: true  },
  gpt4o:   { family: 'gpt4o',   enableCFL: false, enableSAD: false },
  gemini:  { family: 'gemini',  enableCFL: false, enableSAD: false },
  unknown: { family: 'unknown', enableCFL: false, enableSAD: false },
};

export function getModelFamily(provider: ProviderName, model: string): ModelFamily {
  if (provider === 'anthropic') return 'claude';
  if (provider === 'openai') {
    if (model.startsWith('gpt-5') || model.startsWith('gpt5')) return 'gpt5';
    if (model.startsWith('gpt-4o') || model.startsWith('gpt4o')) return 'gpt4o';
    if (model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'gpt5'; // reasoning models
    return 'unknown';
  }
  if (provider === 'gemini') return 'gemini';
  if (provider === 'moonshot') return 'unknown';
  return 'unknown';
}

export function getModelProfile(provider: ProviderName, model: string): ModelProfile {
  const family = getModelFamily(provider, model);
  return MODEL_PROFILES[family];
}

// === Config ===

export interface TscgConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  maxTokens: number;
  delayMs: number;
  systemPrompt: string;
  resultsDir: string;
}

export const DEFAULT_CONFIG: Omit<TscgConfig, 'apiKey'> = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 200,
  delayMs: 600,
  systemPrompt: 'Answer concisely. Follow the output format if specified. Do not explain your reasoning.',
  resultsDir: './tscg-results',
};
