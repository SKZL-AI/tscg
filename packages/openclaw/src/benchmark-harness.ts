/**
 * @tscg/openclaw --- Benchmark Harness
 *
 * Quick (30 calls) and Full (600 calls) self-tune benchmarks.
 * Sweep (180 calls): per-operator isolation sweep for empirical profiling.
 * Inline scoring and provider implementations for npm portability.
 *
 * Wave 3a: Provider adapters, scoring, task generation, retry logic
 * Wave 3b: Main runTune loop, configs, pricing, SIGINT handling
 * v1.4.2:  Per-operator isolation sweep engine (9 conditions)
 */

import {
  CONDITION_TO_OPERATORS,
  recommend,
  type BenchmarkResults,
  type Recommendation,
} from './recommendation.js';

// Re-export types used by tests and consumers
export type { BenchmarkResults, CellResult } from './recommendation.js';
export type { OperatorConfig } from './profile-map.js';
import type { OperatorConfig } from './profile-map.js';

// ---------------------------------------------------------------------------
// Dynamic @tscg/core import (peer dependency)
// ---------------------------------------------------------------------------

let compress: ((tools: unknown[], options?: unknown) => unknown) | null = null;
let _coreLoaded = false;

async function ensureCore(): Promise<void> {
  if (_coreLoaded) return;
  try {
    const core = await import('@tscg/core');
    compress = core.compress as (tools: unknown[], options?: unknown) => unknown;
  } catch {
    // @tscg/core not available --- will skip compression in benchmark
    compress = null;
  }
  _coreLoaded = true;
}

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface TuneConfig {
  model: string;
  full: boolean;
  dryRun: boolean;
  force: boolean;
  maxCost?: number;
  optimizeFor?: 'accuracy' | 'savings' | 'balanced';
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export interface CostEstimate {
  totalCalls: number;
  estimatedCostUsd: number;
  provider: string;
  isLocal: boolean;
}

export interface TuneResult {
  modelString: string;
  variant: 'quick' | 'full';
  config: { toolCounts: number[]; conditions: string[]; tasksPerCell: number; seeds: number };
  results: BenchmarkResults;
  recommendation: Recommendation;
  benchmarkDate: string;
  totalCalls: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Sweep Types (v1.4.2)
// ---------------------------------------------------------------------------

export interface SweepResult {
  condition: string;
  operator: string;       // 'none' for baseline-no-ops
  accuracy: number;       // 0-1
  correct: number;
  total: number;
  avgInputTokens: number;
  avgLatency: number;
  tokenSavingsPercent: number;
}

export interface SweepTuneResult {
  modelString: string;
  sweepResults: SweepResult[];
  classifications: Record<string, 'helpful' | 'neutral' | 'harmful'>;
  optimalProfile: { operators: OperatorConfig; rationale: string };
  classification: 'compression-friendly' | 'partial-sensitive' | 'combination-fragile';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  totalCalls: number;
  totalDurationMs: number;
  benchmarkDate: string;
}

// ---------------------------------------------------------------------------
// Provider Interfaces
// ---------------------------------------------------------------------------

export interface CompletionRequest {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools?: unknown[];
  temperature: number;
  max_tokens: number;
}

export interface CompletionResponse {
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
}

export interface ModelProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Provider Implementations
// ---------------------------------------------------------------------------

class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startMs = Date.now();

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      system: request.system,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        `Anthropic API error ${res.status}: ${text}`,
        res.status,
      );
    }

    const data = await res.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;

    // Parse content blocks
    let content = '';
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

    const contentBlocks = data.content as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(contentBlocks)) {
      for (const block of contentBlocks) {
        if (block.type === 'text') {
          content += block.text as string;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            name: block.name as string,
            arguments: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }
    }

    const usage = data.usage as Record<string, number> | undefined;

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
      },
      latency_ms: latencyMs,
    };
  }
}

class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startMs = Date.now();

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: request.system },
      ...request.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature,
    };

    // GPT-5+ and o-series use max_completion_tokens instead of max_tokens
    const useNewTokenField = /^(gpt-5|o[1-9])/.test(this.model);
    if (useNewTokenField) {
      body.max_completion_tokens = request.max_tokens;
    } else {
      body.max_tokens = request.max_tokens;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        `OpenAI API error ${res.status}: ${text}`,
        res.status,
      );
    }

    const data = await res.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;

    const content = (message?.content as string) ?? '';
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

    // Handle tool_calls format (modern)
    const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(rawToolCalls)) {
      for (const tc of rawToolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined;
        if (fn) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse((fn.arguments as string) ?? '{}') as Record<string, unknown>;
          } catch {
            // malformed JSON from model --- treat as empty
          }
          toolCalls.push({
            name: fn.name as string,
            arguments: args,
          });
        }
      }
    }

    // Handle legacy function_call format
    const functionCall = message?.function_call as Record<string, unknown> | undefined;
    if (functionCall && toolCalls.length === 0) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse((functionCall.arguments as string) ?? '{}') as Record<string, unknown>;
      } catch {
        // malformed JSON
      }
      toolCalls.push({
        name: functionCall.name as string,
        arguments: args,
      });
    }

    const usage = data.usage as Record<string, number> | undefined;

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        input_tokens: usage?.prompt_tokens ?? 0,
        output_tokens: usage?.completion_tokens ?? 0,
      },
      latency_ms: latencyMs,
    };
  }
}

class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(model: string) {
    // Strip "ollama/" prefix if present
    this.model = model.replace(/^ollama\//, '');
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startMs = Date.now();

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: request.system },
      ...request.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.max_tokens,
      },
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        `Ollama API error ${res.status}: ${text}`,
        res.status,
      );
    }

    const data = await res.json() as Record<string, unknown>;
    const latencyMs = Date.now() - startMs;

    const message = data.message as Record<string, unknown> | undefined;
    const content = (message?.content as string) ?? '';

    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(rawToolCalls)) {
      for (const tc of rawToolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined;
        if (fn) {
          toolCalls.push({
            name: fn.name as string,
            arguments: (fn.arguments as Record<string, unknown>) ?? {},
          });
        }
      }
    }

    // Ollama provides prompt_eval_count and eval_count
    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        input_tokens: (data.prompt_eval_count as number) ?? 0,
        output_tokens: (data.eval_count as number) ?? 0,
      },
      latency_ms: latencyMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider Error
// ---------------------------------------------------------------------------

export class ProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

export function createProvider(model: string, apiKey?: string): ModelProvider {
  const lower = model.toLowerCase();

  // Anthropic: claude-*
  if (lower.startsWith('claude')) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey.',
      );
    }
    return new AnthropicProvider(model, key);
  }

  // OpenAI: gpt-*, o1-*, o3-*, o4-*
  if (/^(gpt-|o[1-4])/.test(lower)) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OpenAI API key required. Set OPENAI_API_KEY or pass apiKey.',
      );
    }
    return new OpenAIProvider(model, key);
  }

  // Ollama: ollama/* prefix or no recognized prefix (default to local)
  return new OllamaProvider(model);
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxJitterMs?: number;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderError) {
    if (err.status === 429 || err.status === 503) return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('rate limit')) return true;
    if (msg.includes('timeout')) return true;
    if (msg.includes('econnreset')) return true;
    if (msg.includes('econnrefused')) return true;
    if (msg.includes('fetch failed')) return true;
  }
  return false;
}

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxJitterMs = options?.maxJitterMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s + jitter
      const delayMs =
        baseDelayMs * Math.pow(2, attempt - 1) +
        Math.random() * maxJitterMs;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable in practice, but TypeScript needs it
  throw lastError;
}

// ---------------------------------------------------------------------------
// Inline Scoring (TABEvaluator)
// ---------------------------------------------------------------------------

/**
 * Compute parameter F1 score between predicted and expected parameter sets.
 * - String values: case-insensitive comparison
 * - Number values: within +/-5% tolerance
 * - Boolean values: exact match
 */
export function computeParameterF1(
  predicted: Record<string, unknown>,
  expected: Record<string, unknown>,
): number {
  const expectedKeys = Object.keys(expected);
  const predictedKeys = Object.keys(predicted);

  if (expectedKeys.length === 0 && predictedKeys.length === 0) {
    return 1.0;
  }
  if (expectedKeys.length === 0 || predictedKeys.length === 0) {
    return 0.0;
  }

  // Count true positives: predicted keys that match expected values
  let truePositives = 0;

  for (const key of predictedKeys) {
    if (!(key in expected)) continue;

    const pVal = predicted[key];
    const eVal = expected[key];

    if (valuesMatch(pVal, eVal)) {
      truePositives++;
    }
  }

  const precision = truePositives / predictedKeys.length;
  const recall = truePositives / expectedKeys.length;

  if (precision + recall === 0) return 0.0;
  return (2 * precision * recall) / (precision + recall);
}

function valuesMatch(predicted: unknown, expected: unknown): boolean {
  // Both null/undefined
  if (predicted == null && expected == null) return true;
  if (predicted == null || expected == null) return false;

  // String comparison: case-insensitive
  if (typeof expected === 'string' && typeof predicted === 'string') {
    return predicted.toLowerCase() === expected.toLowerCase();
  }

  // Number comparison: within 5% tolerance
  if (typeof expected === 'number' && typeof predicted === 'number') {
    if (expected === 0) return predicted === 0;
    return Math.abs(predicted - expected) / Math.abs(expected) <= 0.05;
  }

  // Boolean comparison: exact
  if (typeof expected === 'boolean' && typeof predicted === 'boolean') {
    return predicted === expected;
  }

  // Fallback: strict equality
  return predicted === expected;
}

/**
 * Score a single tool call prediction against expected ground truth.
 * Returns weighted score: tool_selection * 0.6 + parameter_f1 * 0.4
 */
export function scoreSingleTool(
  predicted: { name: string; arguments: Record<string, unknown> } | undefined,
  expected: { name: string; arguments: Record<string, unknown> },
): number {
  if (!predicted) return 0.0;

  // Tool selection: case-insensitive name match
  const nameMatch =
    predicted.name.toLowerCase() === expected.name.toLowerCase() ? 1.0 : 0.0;

  if (nameMatch === 0.0) return 0.0; // Wrong tool = 0 total score

  const paramF1 = computeParameterF1(
    predicted.arguments,
    expected.arguments,
  );

  return nameMatch * 0.6 + paramF1 * 0.4;
}

/**
 * Score a response where no tool should be called.
 * Returns 1.0 if no tool was called, 0.0 otherwise.
 */
export function scoreNoTool(
  parsed: CompletionResponse,
): number {
  return (!parsed.tool_calls || parsed.tool_calls.length === 0) ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// Synthetic Task Generation
// ---------------------------------------------------------------------------

export interface BenchmarkTask {
  taskId: string;
  userMessage: string;
  expectedToolName: string;
  expectedParameters: Record<string, unknown>;
}

/** Simple seeded PRNG (mulberry32) for deterministic task generation */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SyntheticTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

const TOOL_DOMAINS = [
  { prefix: 'search', desc: 'Search for', params: ['query', 'limit', 'offset'] },
  { prefix: 'create', desc: 'Create a new', params: ['name', 'description', 'priority'] },
  { prefix: 'update', desc: 'Update an existing', params: ['id', 'field', 'value'] },
  { prefix: 'delete', desc: 'Delete a', params: ['id', 'confirm'] },
  { prefix: 'list', desc: 'List all', params: ['filter', 'page', 'pageSize'] },
  { prefix: 'get', desc: 'Get details of a', params: ['id', 'includeMetadata'] },
  { prefix: 'send', desc: 'Send a', params: ['recipient', 'message', 'urgent'] },
  { prefix: 'analyze', desc: 'Analyze the', params: ['target', 'depth', 'format'] },
  { prefix: 'export', desc: 'Export the', params: ['format', 'range', 'includeHeaders'] },
  { prefix: 'validate', desc: 'Validate the', params: ['input', 'strict', 'schema'] },
];

const ENTITIES = [
  'document', 'user', 'task', 'report', 'email', 'ticket',
  'project', 'invoice', 'notification', 'schedule', 'file',
  'contact', 'event', 'order', 'payment', 'review', 'comment',
  'workflow', 'template', 'dashboard',
];

const PARAM_TYPES: Record<string, unknown> = {
  query: { type: 'string', description: 'Search query string' },
  limit: { type: 'number', description: 'Maximum results to return' },
  offset: { type: 'number', description: 'Number of results to skip' },
  name: { type: 'string', description: 'Name of the resource' },
  description: { type: 'string', description: 'Description text' },
  priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority level' },
  id: { type: 'string', description: 'Unique identifier' },
  field: { type: 'string', description: 'Field name to update' },
  value: { type: 'string', description: 'New value for the field' },
  confirm: { type: 'boolean', description: 'Confirmation flag' },
  filter: { type: 'string', description: 'Filter expression' },
  page: { type: 'number', description: 'Page number (1-based)' },
  pageSize: { type: 'number', description: 'Items per page' },
  includeMetadata: { type: 'boolean', description: 'Include metadata in response' },
  recipient: { type: 'string', description: 'Recipient address or ID' },
  message: { type: 'string', description: 'Message content' },
  urgent: { type: 'boolean', description: 'Mark as urgent' },
  target: { type: 'string', description: 'Target to analyze' },
  depth: { type: 'string', enum: ['shallow', 'medium', 'deep'], description: 'Analysis depth' },
  format: { type: 'string', enum: ['json', 'csv', 'pdf', 'xml'], description: 'Output format' },
  range: { type: 'string', description: 'Date range for export' },
  includeHeaders: { type: 'boolean', description: 'Include column headers' },
  input: { type: 'string', description: 'Input to validate' },
  strict: { type: 'boolean', description: 'Enable strict validation' },
  schema: { type: 'string', description: 'Schema name to validate against' },
};

function generateSyntheticTools(count: number, rng: () => number): SyntheticTool[] {
  const tools: SyntheticTool[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const domain = TOOL_DOMAINS[Math.floor(rng() * TOOL_DOMAINS.length)];
    const entity = ENTITIES[Math.floor(rng() * ENTITIES.length)];
    let name = `${domain.prefix}_${entity}`;

    // Ensure uniqueness by appending index if needed
    if (usedNames.has(name)) {
      name = `${name}_${i + 1}`;
    }
    usedNames.add(name);

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (let p = 0; p < domain.params.length; p++) {
      const paramName = domain.params[p];
      properties[paramName] = PARAM_TYPES[paramName] ?? { type: 'string', description: paramName };
      // First param is always required, rest are random
      if (p === 0 || rng() > 0.5) {
        required.push(paramName);
      }
    }

    tools.push({
      type: 'function',
      function: {
        name,
        description: `${domain.desc} ${entity}`,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      },
    });
  }

  return tools;
}

function generateExpectedParams(
  tool: SyntheticTool,
  rng: () => number,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const props = tool.function.parameters.properties;
  const required = new Set(tool.function.parameters.required);

  for (const [key, schema] of Object.entries(props)) {
    // Always fill required params; optionally fill non-required
    if (!required.has(key) && rng() > 0.6) continue;

    const s = schema as Record<string, unknown>;
    if (s.enum) {
      const values = s.enum as string[];
      params[key] = values[Math.floor(rng() * values.length)];
    } else if (s.type === 'number') {
      params[key] = Math.floor(rng() * 100) + 1;
    } else if (s.type === 'boolean') {
      params[key] = rng() > 0.5;
    } else {
      // string
      params[key] = `test_${key}_${Math.floor(rng() * 1000)}`;
    }
  }

  return params;
}

const USER_TEMPLATES = [
  'Please {action} the {entity} with these details: {params}',
  'I need to {action} a {entity}. Parameters: {params}',
  'Can you {action} the {entity}? Use: {params}',
  '{action} {entity} using the following: {params}',
  'Help me {action} this {entity}: {params}',
];

export function generateTasks(
  toolCount: number,
  tasksPerCell: number,
  seed: number = 42,
): { tools: SyntheticTool[]; tasks: BenchmarkTask[] } {
  const rng = mulberry32(seed + toolCount * 1000);
  const tools = generateSyntheticTools(toolCount, rng);
  const tasks: BenchmarkTask[] = [];

  for (let i = 0; i < tasksPerCell; i++) {
    const toolIdx = Math.floor(rng() * tools.length);
    const tool = tools[toolIdx];
    const expectedParams = generateExpectedParams(tool, rng);

    // Build user message from template
    const template = USER_TEMPLATES[Math.floor(rng() * USER_TEMPLATES.length)];
    const action = tool.function.name.split('_')[0];
    const entity = tool.function.name.split('_').slice(1).join('_');
    const paramsStr = Object.entries(expectedParams)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');

    const userMessage = template
      .replace('{action}', action)
      .replace('{entity}', entity)
      .replace('{params}', paramsStr);

    tasks.push({
      taskId: `task_${toolCount}_${i + 1}`,
      userMessage,
      expectedToolName: tool.function.name,
      expectedParameters: expectedParams,
    });
  }

  return { tools, tasks };
}

// ---------------------------------------------------------------------------
// Configs
// ---------------------------------------------------------------------------

export const QUICK_CONFIG = {
  toolCounts: [10, 50],
  conditions: ['baseline', 'balanced', 'small-model'] as const,
  tasksPerCell: 5,
  seeds: 1,
};

export const FULL_CONFIG = {
  toolCounts: [10, 20, 40, 50, 75, 100],
  conditions: ['baseline', 'conservative', 'balanced', 'sensitive', 'small-model'] as const,
  tasksPerCell: 10,
  seeds: 2,
};

// ---------------------------------------------------------------------------
// Sweep Conditions (v1.4.2) — 9 leave-one-in isolation probes
// ---------------------------------------------------------------------------

const ALL_OPS_OFF: OperatorConfig = {
  sdm: false, tas: false, dro: false, cfl: false,
  cfo: false, cas: false, sad: false, ccp: false,
};

export const SWEEP_CONDITIONS: Array<{ name: string; operator: string; ops: OperatorConfig }> = [
  { name: 'baseline-no-ops', operator: 'none', ops: { ...ALL_OPS_OFF } },
  { name: 'sdm-only', operator: 'sdm', ops: { ...ALL_OPS_OFF, sdm: true } },
  { name: 'tas-only', operator: 'tas', ops: { ...ALL_OPS_OFF, tas: true } },
  { name: 'dro-only', operator: 'dro', ops: { ...ALL_OPS_OFF, dro: true } },
  { name: 'cfl-only', operator: 'cfl', ops: { ...ALL_OPS_OFF, cfl: true } },
  { name: 'cfo-only', operator: 'cfo', ops: { ...ALL_OPS_OFF, cfo: true } },
  { name: 'cas-only', operator: 'cas', ops: { ...ALL_OPS_OFF, cas: true } },
  { name: 'sad-only', operator: 'sad', ops: { ...ALL_OPS_OFF, sad: true } },
  { name: 'ccp-only', operator: 'ccp', ops: { ...ALL_OPS_OFF, ccp: true } },
];

export const SWEEP_CONFIG = {
  toolCounts: [43] as const,      // MCP-combined catalog size
  tasksPerCondition: 20,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const DEFAULT_PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5': { input: 10, output: 30 },
  'ollama': { input: 0, output: 0 },
  'default': { input: 5, output: 15 },
};

function matchPricingKey(model: string): string {
  const lower = model.toLowerCase();

  if (lower.includes('opus')) return 'claude-opus';
  if (lower.includes('sonnet')) return 'claude-sonnet';
  if (lower.includes('haiku')) return 'claude-haiku';
  if (lower.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (lower.includes('gpt-4o')) return 'gpt-4o';
  if (lower.includes('gpt-5')) return 'gpt-5';

  // Ollama detection: ollama/ prefix, or no recognized prefix
  if (lower.startsWith('ollama/')) return 'ollama';
  if (!lower.startsWith('claude') && !lower.startsWith('gpt-') && !lower.startsWith('o1') && !lower.startsWith('o3') && !lower.startsWith('o4')) {
    return 'ollama';
  }

  return 'default';
}

function detectProviderName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith('claude')) return 'anthropic';
  if (/^(gpt-|o[1-4])/.test(lower)) return 'openai';
  return 'ollama';
}

export function estimateCost(config: TuneConfig): CostEstimate {
  const benchConfig = config.full ? FULL_CONFIG : QUICK_CONFIG;

  const totalCalls =
    benchConfig.toolCounts.length *
    benchConfig.conditions.length *
    benchConfig.tasksPerCell *
    benchConfig.seeds;

  const pricingKey = matchPricingKey(config.model);
  const pricing = DEFAULT_PRICING_USD_PER_M[pricingKey] ?? DEFAULT_PRICING_USD_PER_M['default'];

  // Estimate ~2000 input tokens + ~500 output tokens per call (average)
  const avgInputTokens = 2000;
  const avgOutputTokens = 500;

  const estimatedCostUsd =
    totalCalls *
    ((avgInputTokens / 1_000_000) * pricing.input +
     (avgOutputTokens / 1_000_000) * pricing.output);

  const providerName = detectProviderName(config.model);
  const isLocal = pricingKey === 'ollama';

  return {
    totalCalls,
    estimatedCostUsd: isLocal ? 0 : estimatedCostUsd,
    provider: providerName,
    isLocal,
  };
}

export function estimateSweepCost(model: string): CostEstimate {
  const totalCalls = SWEEP_CONDITIONS.length * SWEEP_CONFIG.tasksPerCondition; // 9 × 20 = 180

  const pricingKey = matchPricingKey(model);
  const pricing = DEFAULT_PRICING_USD_PER_M[pricingKey] ?? DEFAULT_PRICING_USD_PER_M['default'];

  const avgInputTokens = 3300;  // empirical average from Step 5.8 sweep
  const avgOutputTokens = 400;

  const estimatedCostUsd =
    totalCalls *
    ((avgInputTokens / 1_000_000) * pricing.input +
     (avgOutputTokens / 1_000_000) * pricing.output);

  const providerName = detectProviderName(model);
  const isLocal = pricingKey === 'ollama';

  return {
    totalCalls,
    estimatedCostUsd: isLocal ? 0 : estimatedCostUsd,
    provider: providerName,
    isLocal,
  };
}

// ---------------------------------------------------------------------------
// Main Benchmark Loop
// ---------------------------------------------------------------------------

export async function runTune(config: TuneConfig): Promise<TuneResult> {
  const startMs = Date.now();

  // --- SIGINT handler for graceful partial results ---
  let interrupted = false;
  const partialResults: BenchmarkResults = {};
  let completedCalls = 0;

  const sigintHandler = () => {
    interrupted = true;
  };
  process.on('SIGINT', sigintHandler);

  try {
    // Load @tscg/core dynamically
    await ensureCore();

    // Create provider
    const provider = createProvider(config.model);

    // Select benchmark config
    const benchConfig = config.full ? FULL_CONFIG : QUICK_CONFIG;

    const totalCalls =
      benchConfig.toolCounts.length *
      benchConfig.conditions.length *
      benchConfig.tasksPerCell *
      benchConfig.seeds;

    // Emit initial progress
    config.onProgress?.({
      phase: 'setup',
      current: 0,
      total: totalCalls,
      message: `Starting ${config.full ? 'full' : 'quick'} benchmark: ${totalCalls} calls`,
    });

    // Dry run: return estimate without executing
    if (config.dryRun) {
      const estimate = estimateCost(config);
      const emptyRecommendation = recommend({}, { optimizeFor: config.optimizeFor });

      return {
        modelString: config.model,
        variant: config.full ? 'full' : 'quick',
        config: {
          toolCounts: [...benchConfig.toolCounts],
          conditions: [...benchConfig.conditions],
          tasksPerCell: benchConfig.tasksPerCell,
          seeds: benchConfig.seeds,
        },
        results: {},
        recommendation: emptyRecommendation,
        benchmarkDate: new Date().toISOString(),
        totalCalls: estimate.totalCalls,
        totalDurationMs: Date.now() - startMs,
      };
    }

    // --- Main loop ---
    for (const toolCount of benchConfig.toolCounts) {
      if (interrupted) break;

      const tcKey = String(toolCount);
      partialResults[tcKey] = {};

      for (const condition of benchConfig.conditions) {
        if (interrupted) break;

        // Get operator config for this condition
        const operators = CONDITION_TO_OPERATORS[condition];
        if (!operators) continue;

        const scores: number[] = [];
        const tokenCounts: number[] = [];
        let estimatedBaselineTokens: number | null = null;

        for (let seed = 0; seed < benchConfig.seeds; seed++) {
          if (interrupted) break;

          // Generate tasks and tools for this (toolCount, seed) pair
          const { tools, tasks } = generateTasks(
            toolCount,
            benchConfig.tasksPerCell,
            42 + seed * 7919, // Different prime offset per seed
          );

          // Apply compression for non-baseline conditions
          let activeTools: unknown[] = tools;

          // Estimate baseline tokens from raw tools (keep last seed's estimate)
          const rawJson = JSON.stringify(tools);
          estimatedBaselineTokens = Math.ceil(rawJson.length / 4); // rough token estimate

          if (condition !== 'baseline' && compress) {
            try {
              const compressed = compress(tools, {
                profile: condition === 'conservative' ? 'conservative' : 'balanced',
                principles: {
                  sdm: operators.sdm,
                  tas: operators.tas,
                  dro: operators.dro,
                  cfl: operators.cfl,
                  cfo: operators.cfo,
                  cas: operators.cas,
                  sad: operators.sad,
                  ccp: operators.ccp,
                },
              }) as Record<string, unknown>;

              // Use compressed tools if available
              if (compressed.compressed) {
                // For compressed text output, we still need tool definitions for the API
                // The compressed output goes in the system prompt
                activeTools = tools; // Keep original tools for API format
              }
            } catch {
              // Compression failed --- use original tools
              activeTools = tools;
            }
          }

          for (const task of tasks) {
            if (interrupted) break;

            completedCalls++;

            config.onProgress?.({
              phase: 'benchmark',
              current: completedCalls,
              total: totalCalls,
              message: `[${tcKey} tools] ${condition} - ${task.taskId}`,
            });

            try {
              const response = await callWithRetry(() =>
                provider.complete({
                  system: `You are a helpful assistant. You have access to tools. Use the appropriate tool to fulfill the user's request. Call exactly one tool with the correct parameters.`,
                  messages: [{ role: 'user', content: task.userMessage }],
                  tools: activeTools,
                  temperature: 0,
                  max_tokens: 1024,
                }),
              );

              // Score the response
              const firstToolCall = response.tool_calls?.[0];
              const score = scoreSingleTool(firstToolCall, {
                name: task.expectedToolName,
                arguments: task.expectedParameters,
              });

              scores.push(score);
              tokenCounts.push(response.usage.input_tokens);
            } catch (err) {
              // Non-retryable error --- score as 0
              scores.push(0);
              tokenCounts.push(0);

              config.onProgress?.({
                phase: 'error',
                current: completedCalls,
                total: totalCalls,
                message: `Error on ${task.taskId}: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          }
        }

        // Aggregate cell results
        if (scores.length > 0) {
          const accuracy =
            scores.reduce((a, b) => a + b, 0) / scores.length;
          const avgTokens =
            tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;

          // Calculate savings relative to baseline
          const baselineCell = partialResults[tcKey]?.['baseline'];
          let savingsPercent = 0;
          if (condition === 'baseline') {
            savingsPercent = 0;
          } else if (baselineCell && baselineCell.avgTokens > 0) {
            savingsPercent =
              ((baselineCell.avgTokens - avgTokens) / baselineCell.avgTokens) * 100;
          } else if (estimatedBaselineTokens && estimatedBaselineTokens > 0) {
            // Fallback: use estimated baseline tokens
            savingsPercent =
              ((estimatedBaselineTokens - avgTokens) / estimatedBaselineTokens) * 100;
          }

          partialResults[tcKey][condition] = {
            accuracy,
            avgTokens,
            savingsPercent: Math.max(0, savingsPercent),
          };
        }
      }
    }

    // --- Build recommendation ---
    const recommendation = recommend(partialResults, {
      optimizeFor: config.optimizeFor ?? 'balanced',
      samplesPerCell: benchConfig.tasksPerCell * benchConfig.seeds,
    });

    return {
      modelString: config.model,
      variant: config.full ? 'full' : 'quick',
      config: {
        toolCounts: [...benchConfig.toolCounts],
        conditions: [...benchConfig.conditions],
        tasksPerCell: benchConfig.tasksPerCell,
        seeds: benchConfig.seeds,
      },
      results: partialResults,
      recommendation,
      benchmarkDate: new Date().toISOString(),
      totalCalls: completedCalls,
      totalDurationMs: Date.now() - startMs,
    };
  } finally {
    // Deregister SIGINT handler on completion (normal or interrupted)
    process.removeListener('SIGINT', sigintHandler);
  }
}

// ---------------------------------------------------------------------------
// Per-Operator Isolation Sweep (v1.4.2)
// ---------------------------------------------------------------------------

export interface SweepConfig {
  model: string;
  dryRun: boolean;
  onProgress?: (event: ProgressEvent) => void;
}

/**
 * Run a per-operator isolation sweep: 9 conditions × 20 tasks = 180 calls.
 *
 * Tests each TSCG operator individually against a no-ops baseline
 * to classify operators as helpful (≥ +2.5pp), neutral, or harmful (≤ -2.5pp).
 */
export async function runSweep(config: SweepConfig): Promise<SweepTuneResult> {
  const startMs = Date.now();

  let interrupted = false;
  let completedCalls = 0;

  const sigintHandler = () => { interrupted = true; };
  process.on('SIGINT', sigintHandler);

  try {
    await ensureCore();

    const provider = createProvider(config.model);
    const toolCount = SWEEP_CONFIG.toolCounts[0]; // 43
    const totalCalls = SWEEP_CONDITIONS.length * SWEEP_CONFIG.tasksPerCondition;

    config.onProgress?.({
      phase: 'setup',
      current: 0,
      total: totalCalls,
      message: `Starting per-operator sweep: ${SWEEP_CONDITIONS.length} conditions × ${SWEEP_CONFIG.tasksPerCondition} tasks = ${totalCalls} calls`,
    });

    // Dry run: return cost estimate without executing
    if (config.dryRun) {
      return {
        modelString: config.model,
        sweepResults: [],
        classifications: {},
        optimalProfile: {
          operators: { ...ALL_OPS_OFF },
          rationale: 'Dry run — no data',
        },
        classification: 'combination-fragile',
        confidence: 'LOW',
        totalCalls,
        totalDurationMs: Date.now() - startMs,
        benchmarkDate: new Date().toISOString(),
      };
    }

    // Generate tasks once for all conditions (same seed = same tasks)
    const { tools, tasks } = generateTasks(
      toolCount,
      SWEEP_CONFIG.tasksPerCondition,
      SWEEP_CONFIG.seed,
    );

    const sweepResults: SweepResult[] = [];

    // Estimate raw baseline tokens for savings calculation
    const rawJson = JSON.stringify(tools);
    const estimatedBaselineTokens = Math.ceil(rawJson.length / 4);

    for (const cond of SWEEP_CONDITIONS) {
      if (interrupted) break;

      const scores: number[] = [];
      const tokenCounts: number[] = [];
      const latencies: number[] = [];

      // Compress tools with this condition's operator config
      let systemPrompt = `You have access to tools. Use the appropriate tool to fulfill the user's request. Call exactly one tool with the correct parameters.`;

      if (compress && cond.name !== 'baseline-no-ops') {
        try {
          const compressed = compress(tools, {
            profile: 'balanced',
            principles: { ...cond.ops },
          }) as Record<string, unknown>;

          if (typeof compressed.compressed === 'string') {
            systemPrompt =
              'You have access to the following tools:\n\n' +
              compressed.compressed +
              '\n\nTo use a tool, respond with ONLY a JSON object in this exact format:\n' +
              '{"name": "<tool_name>", "arguments": {"param": "value"}}\n' +
              'If no tool is needed, respond normally in plain text.\n' +
              'IMPORTANT: Output the JSON directly. Do not wrap it in markdown, do not explain.';
          }
        } catch {
          // Compression failed — use raw tools via standard prompt
        }
      }

      for (const task of tasks) {
        if (interrupted) break;

        completedCalls++;
        config.onProgress?.({
          phase: 'sweep',
          current: completedCalls,
          total: totalCalls,
          message: `[${cond.name}] ${task.taskId}`,
        });

        try {
          const response = await callWithRetry(() =>
            provider.complete({
              system: systemPrompt,
              messages: [{ role: 'user', content: task.userMessage }],
              tools,
              temperature: 0,
              max_tokens: 1024,
            }),
          );

          const firstToolCall = response.tool_calls?.[0];
          const score = scoreSingleTool(firstToolCall, {
            name: task.expectedToolName,
            arguments: task.expectedParameters,
          });

          scores.push(score);
          tokenCounts.push(response.usage.input_tokens);
          latencies.push(response.latency_ms);
        } catch {
          scores.push(0);
          tokenCounts.push(0);
          latencies.push(0);
        }
      }

      // Aggregate
      const correct = scores.filter(s => s >= 0.5).length;
      const total = scores.length;
      const accuracy = total > 0 ? correct / total : 0;
      const avgInputTokens = tokenCounts.length > 0
        ? tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
        : 0;
      const avgLatency = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

      let tokenSavingsPercent = 0;
      if (estimatedBaselineTokens > 0 && avgInputTokens > 0) {
        tokenSavingsPercent =
          ((estimatedBaselineTokens - avgInputTokens) / estimatedBaselineTokens) * 100;
      }

      sweepResults.push({
        condition: cond.name,
        operator: cond.operator,
        accuracy,
        correct,
        total,
        avgInputTokens,
        avgLatency,
        tokenSavingsPercent: Math.max(0, tokenSavingsPercent),
      });

      config.onProgress?.({
        phase: 'sweep-result',
        current: completedCalls,
        total: totalCalls,
        message: `${cond.name}: ${correct}/${total} (${(accuracy * 100).toFixed(1)}%)`,
      });
    }

    // --- Classify operators ---
    const baselineResult = sweepResults.find(r => r.operator === 'none');
    const baselineAcc = baselineResult?.accuracy ?? 0;
    const HELPFUL_THRESHOLD = 0.025;  // +2.5pp
    const HARMFUL_THRESHOLD = -0.025; // -2.5pp

    const classifications: Record<string, 'helpful' | 'neutral' | 'harmful'> = {};
    let helpfulCount = 0;
    let neutralCount = 0;
    let harmfulCount = 0;

    for (const r of sweepResults) {
      if (r.operator === 'none') continue;
      const delta = r.accuracy - baselineAcc;
      if (delta >= HELPFUL_THRESHOLD) {
        classifications[r.operator] = 'helpful';
        helpfulCount++;
      } else if (delta <= HARMFUL_THRESHOLD) {
        classifications[r.operator] = 'harmful';
        harmfulCount++;
      } else {
        classifications[r.operator] = 'neutral';
        neutralCount++;
      }
    }

    // --- Build optimal operator set ---
    const optimalOps = { ...ALL_OPS_OFF };
    for (const [op, cls] of Object.entries(classifications)) {
      if (cls === 'helpful' || cls === 'neutral') {
        (optimalOps as unknown as Record<string, boolean>)[op] = true;
      }
    }

    // --- Determine archetype + confidence ---
    let classification: SweepTuneResult['classification'];
    let confidence: SweepTuneResult['confidence'];

    if (neutralCount >= 4 && harmfulCount >= 1) {
      // Scenario B: combination-fragile (GPT-5.5 pattern)
      classification = 'combination-fragile';
      confidence = 'LOW';
      // Override to SDM-only conservative
      for (const key of Object.keys(optimalOps)) {
        (optimalOps as unknown as Record<string, boolean>)[key] = key === 'sdm';
      }
    } else if (helpfulCount >= 3) {
      classification = 'compression-friendly';
      confidence = 'HIGH';
    } else {
      classification = 'partial-sensitive';
      confidence = 'MEDIUM';
    }

    // --- Build rationale ---
    const enabled = Object.entries(classifications)
      .filter(([, cls]) => cls === 'helpful' || cls === 'neutral')
      .map(([op]) => {
        const r = sweepResults.find(sr => sr.operator === op)!;
        const delta = ((r.accuracy - baselineAcc) * 100).toFixed(1);
        return `${op.toUpperCase()}(${Number(delta) >= 0 ? '+' : ''}${delta}pp)`;
      });

    const excluded = Object.entries(classifications)
      .filter(([, cls]) => cls === 'harmful')
      .map(([op]) => {
        const r = sweepResults.find(sr => sr.operator === op)!;
        const delta = ((r.accuracy - baselineAcc) * 100).toFixed(1);
        return `${op.toUpperCase()}(${delta}pp)`;
      });

    const rationale =
      `Empirical sweep (${totalCalls} calls): ` +
      `enabled=[${enabled.join(',')}], excluded=[${excluded.join(',')}]. ` +
      `Classification: ${classification} (${helpfulCount}H/${neutralCount}N/${harmfulCount}X). ` +
      `Confidence: ${confidence}.` +
      (classification === 'combination-fragile'
        ? ' Overridden to SDM-only conservative (combination-fragile detected).'
        : '');

    return {
      modelString: config.model,
      sweepResults,
      classifications,
      optimalProfile: { operators: optimalOps, rationale },
      classification,
      confidence,
      totalCalls: completedCalls,
      totalDurationMs: Date.now() - startMs,
      benchmarkDate: new Date().toISOString(),
    };
  } finally {
    process.removeListener('SIGINT', sigintHandler);
  }
}
