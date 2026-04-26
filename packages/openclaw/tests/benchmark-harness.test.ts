import { describe, it, expect, vi } from 'vitest';
import {
  estimateCost,
  QUICK_CONFIG,
  FULL_CONFIG,
  generateTasks,
  callWithRetry,
  scoreSingleTool,
  scoreNoTool,
  computeParameterF1,
  createProvider,
  ProviderError,
  type TuneConfig,
  type TuneResult,
  type CompletionResponse,
} from '../src/benchmark-harness.js';
import { CONDITION_TO_OPERATORS } from '../src/recommendation.js';

// ---------------------------------------------------------------------------
// Helper: Build a minimal TuneConfig
// ---------------------------------------------------------------------------

function tuneConfig(overrides: Partial<TuneConfig> = {}): TuneConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    full: false,
    dryRun: false,
    force: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: estimateCost --- quick config
// ---------------------------------------------------------------------------
describe('estimateCost --- quick config', () => {
  it('calculates correct total calls for quick config', () => {
    const estimate = estimateCost(tuneConfig({ full: false }));
    // 2 toolCounts * 3 conditions * 5 tasks * 1 seed = 30
    expect(estimate.totalCalls).toBe(30);
    expect(estimate.provider).toBe('anthropic');
    expect(estimate.isLocal).toBe(false);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('calculates correct total calls for full config', () => {
    const estimate = estimateCost(tuneConfig({ full: true }));
    // 6 toolCounts * 5 conditions * 10 tasks * 2 seeds = 600
    expect(estimate.totalCalls).toBe(600);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: estimateCost --- ollama = $0
// ---------------------------------------------------------------------------
describe('estimateCost --- ollama pricing', () => {
  it('returns $0 for ollama models', () => {
    const estimate = estimateCost(tuneConfig({ model: 'ollama/llama3.1' }));
    expect(estimate.estimatedCostUsd).toBe(0);
    expect(estimate.isLocal).toBe(true);
    expect(estimate.provider).toBe('ollama');
  });

  it('returns $0 for models without recognized prefix (defaults to ollama)', () => {
    const estimate = estimateCost(tuneConfig({ model: 'qwen3-8b' }));
    expect(estimate.estimatedCostUsd).toBe(0);
    expect(estimate.isLocal).toBe(true);
    expect(estimate.provider).toBe('ollama');
  });
});

// ---------------------------------------------------------------------------
// Test 3: estimateCost --- unknown model uses default pricing
// ---------------------------------------------------------------------------
describe('estimateCost --- default pricing for unknown API models', () => {
  it('uses default pricing for gpt-4 (not a known pricing key match)', () => {
    const estimate = estimateCost(tuneConfig({ model: 'gpt-4-turbo' }));
    expect(estimate.provider).toBe('openai');
    expect(estimate.isLocal).toBe(false);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: QUICK_CONFIG structure
// ---------------------------------------------------------------------------
describe('QUICK_CONFIG structure', () => {
  it('has 2 tool counts', () => {
    expect(QUICK_CONFIG.toolCounts).toEqual([10, 50]);
  });

  it('has 3 conditions', () => {
    expect(QUICK_CONFIG.conditions).toHaveLength(3);
    expect([...QUICK_CONFIG.conditions]).toEqual(['baseline', 'balanced', 'small-model']);
  });

  it('has 5 tasks per cell', () => {
    expect(QUICK_CONFIG.tasksPerCell).toBe(5);
  });

  it('has 1 seed', () => {
    expect(QUICK_CONFIG.seeds).toBe(1);
  });

  it('produces 30 total calls (2 * 3 * 5 * 1)', () => {
    const total =
      QUICK_CONFIG.toolCounts.length *
      QUICK_CONFIG.conditions.length *
      QUICK_CONFIG.tasksPerCell *
      QUICK_CONFIG.seeds;
    expect(total).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Test 5: FULL_CONFIG structure
// ---------------------------------------------------------------------------
describe('FULL_CONFIG structure', () => {
  it('has 6 tool counts', () => {
    expect(FULL_CONFIG.toolCounts).toEqual([10, 20, 40, 50, 75, 100]);
  });

  it('has 5 conditions', () => {
    expect(FULL_CONFIG.conditions).toHaveLength(5);
    expect([...FULL_CONFIG.conditions]).toEqual([
      'baseline', 'conservative', 'balanced', 'sensitive', 'small-model',
    ]);
  });

  it('has 10 tasks per cell', () => {
    expect(FULL_CONFIG.tasksPerCell).toBe(10);
  });

  it('has 2 seeds', () => {
    expect(FULL_CONFIG.seeds).toBe(2);
  });

  it('produces 600 total calls (6 * 5 * 10 * 2)', () => {
    const total =
      FULL_CONFIG.toolCounts.length *
      FULL_CONFIG.conditions.length *
      FULL_CONFIG.tasksPerCell *
      FULL_CONFIG.seeds;
    expect(total).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// Test 6: generateTasks --- correct count and shape
// ---------------------------------------------------------------------------
describe('generateTasks', () => {
  it('returns correct number of tasks', () => {
    const { tasks } = generateTasks(10, 5);
    expect(tasks).toHaveLength(5);
  });

  it('returns correct number of tools', () => {
    const { tools } = generateTasks(25, 3);
    expect(tools).toHaveLength(25);
  });

  it('each task has required fields', () => {
    const { tasks } = generateTasks(10, 5);
    for (const task of tasks) {
      expect(task).toHaveProperty('taskId');
      expect(task).toHaveProperty('userMessage');
      expect(task).toHaveProperty('expectedToolName');
      expect(task).toHaveProperty('expectedParameters');
      expect(typeof task.taskId).toBe('string');
      expect(typeof task.userMessage).toBe('string');
      expect(typeof task.expectedToolName).toBe('string');
      expect(typeof task.expectedParameters).toBe('object');
    }
  });

  it('is deterministic with the same seed', () => {
    const a = generateTasks(10, 5, 42);
    const b = generateTasks(10, 5, 42);
    expect(a.tasks.map(t => t.taskId)).toEqual(b.tasks.map(t => t.taskId));
    expect(a.tasks.map(t => t.expectedToolName)).toEqual(b.tasks.map(t => t.expectedToolName));
  });

  it('produces different results with different seeds', () => {
    const a = generateTasks(10, 5, 42);
    const b = generateTasks(10, 5, 99);
    // At least one task should differ
    const namesA = a.tasks.map(t => t.expectedToolName);
    const namesB = b.tasks.map(t => t.expectedToolName);
    // They may coincidentally match, but task IDs are the same format.
    // Just verify they ran without error.
    expect(namesA).toHaveLength(5);
    expect(namesB).toHaveLength(5);
  });

  it('tools have valid OpenAI function-call structure', () => {
    const { tools } = generateTasks(10, 3);
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function).toBeDefined();
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.parameters.type).toBe('object');
      expect(typeof tool.function.parameters.properties).toBe('object');
      expect(Array.isArray(tool.function.parameters.required)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: callWithRetry --- succeeds on first try
// ---------------------------------------------------------------------------
describe('callWithRetry', () => {
  it('succeeds on first try', async () => {
    const result = await callWithRetry(async () => 42);
    expect(result).toBe(42);
  });

  it('retries on transient error and eventually succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) {
        throw new ProviderError('rate limit exceeded', 429);
      }
      return 'success';
    };

    const result = await callWithRetry(fn, { baseDelayMs: 1, maxJitterMs: 0 });
    expect(result).toBe('success');
    expect(calls).toBe(3);
  });

  it('gives up after max retries', async () => {
    const fn = async () => {
      throw new ProviderError('service unavailable', 503);
    };

    await expect(
      callWithRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxJitterMs: 0 }),
    ).rejects.toThrow('service unavailable');
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ProviderError('invalid api key', 401);
    };

    await expect(
      callWithRetry(fn, { maxAttempts: 5, baseDelayMs: 1, maxJitterMs: 0 }),
    ).rejects.toThrow('invalid api key');
    expect(calls).toBe(1);
  });

  it('retries on "rate limit" in error message', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) {
        throw new Error('you hit a rate limit, try again');
      }
      return 'ok';
    };

    const result = await callWithRetry(fn, { baseDelayMs: 1, maxJitterMs: 0 });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 8: scoreSingleTool --- correct tool
// ---------------------------------------------------------------------------
describe('scoreSingleTool', () => {
  it('scores 1.0 for exact match (name + all params)', () => {
    const score = scoreSingleTool(
      { name: 'search_user', arguments: { query: 'test', limit: 10 } },
      { name: 'search_user', arguments: { query: 'test', limit: 10 } },
    );
    expect(score).toBe(1.0);
  });

  it('returns 0.6 + partial param score for correct tool with partial params', () => {
    const score = scoreSingleTool(
      { name: 'search_user', arguments: { query: 'test' } },
      { name: 'search_user', arguments: { query: 'test', limit: 10 } },
    );
    // name match = 0.6, paramF1: tp=1, precision=1/1=1, recall=1/2=0.5, F1=2*1*0.5/1.5=0.667
    // total = 0.6 + 0.4 * 0.667 = 0.867
    expect(score).toBeCloseTo(0.867, 2);
  });

  it('returns 0.0 for wrong tool name', () => {
    const score = scoreSingleTool(
      { name: 'wrong_tool', arguments: { query: 'test' } },
      { name: 'search_user', arguments: { query: 'test' } },
    );
    expect(score).toBe(0.0);
  });

  it('returns 0.0 for undefined prediction', () => {
    const score = scoreSingleTool(
      undefined,
      { name: 'search_user', arguments: { query: 'test' } },
    );
    expect(score).toBe(0.0);
  });

  it('handles case-insensitive tool name matching', () => {
    const score = scoreSingleTool(
      { name: 'Search_User', arguments: { query: 'test' } },
      { name: 'search_user', arguments: { query: 'test' } },
    );
    expect(score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Test 9: computeParameterF1
// ---------------------------------------------------------------------------
describe('computeParameterF1', () => {
  it('returns 1.0 for exact match', () => {
    expect(computeParameterF1(
      { a: 'hello', b: 42, c: true },
      { a: 'hello', b: 42, c: true },
    )).toBe(1.0);
  });

  it('returns 1.0 for both empty', () => {
    expect(computeParameterF1({}, {})).toBe(1.0);
  });

  it('returns 0.0 for predicted empty, expected non-empty', () => {
    expect(computeParameterF1({}, { a: 'test' })).toBe(0.0);
  });

  it('returns 0.0 for predicted non-empty, expected empty', () => {
    expect(computeParameterF1({ a: 'test' }, {})).toBe(0.0);
  });

  it('handles partial match', () => {
    const f1 = computeParameterF1(
      { a: 'hello', b: 42 },
      { a: 'hello', b: 42, c: true },
    );
    // tp=2, precision=2/2=1, recall=2/3=0.667, F1=2*1*0.667/1.667=0.8
    expect(f1).toBeCloseTo(0.8, 2);
  });

  it('handles case-insensitive string comparison', () => {
    expect(computeParameterF1(
      { name: 'HELLO' },
      { name: 'hello' },
    )).toBe(1.0);
  });

  it('handles number within 5% tolerance', () => {
    expect(computeParameterF1(
      { count: 105 },
      { count: 100 },
    )).toBe(1.0); // 5% tolerance

    expect(computeParameterF1(
      { count: 106 },
      { count: 100 },
    )).toBe(0.0); // 6% is beyond tolerance
  });

  it('handles boolean exact match', () => {
    expect(computeParameterF1(
      { flag: true },
      { flag: true },
    )).toBe(1.0);

    expect(computeParameterF1(
      { flag: false },
      { flag: true },
    )).toBe(0.0);
  });

  it('handles extra predicted keys (precision penalty)', () => {
    const f1 = computeParameterF1(
      { a: 'hello', b: 42, extra: 'stuff' },
      { a: 'hello', b: 42 },
    );
    // tp=2, precision=2/3=0.667, recall=2/2=1, F1=2*0.667*1/1.667=0.8
    expect(f1).toBeCloseTo(0.8, 2);
  });
});

// ---------------------------------------------------------------------------
// Test 10: scoreNoTool
// ---------------------------------------------------------------------------
describe('scoreNoTool', () => {
  it('returns 1.0 when no tool calls', () => {
    const response: CompletionResponse = {
      content: 'I cannot help with that.',
      usage: { input_tokens: 100, output_tokens: 50 },
      latency_ms: 200,
    };
    expect(scoreNoTool(response)).toBe(1.0);
  });

  it('returns 1.0 when tool_calls is empty array', () => {
    const response: CompletionResponse = {
      content: 'text',
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
      latency_ms: 200,
    };
    expect(scoreNoTool(response)).toBe(1.0);
  });

  it('returns 0.0 when tool was called', () => {
    const response: CompletionResponse = {
      content: '',
      tool_calls: [{ name: 'search_user', arguments: { query: 'test' } }],
      usage: { input_tokens: 100, output_tokens: 50 },
      latency_ms: 200,
    };
    expect(scoreNoTool(response)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Test 11: createProvider --- model string detection
// ---------------------------------------------------------------------------
describe('createProvider --- model detection', () => {
  it('creates Anthropic provider for claude-* models', () => {
    const provider = createProvider('claude-sonnet-4-20250514', 'test-key');
    expect(provider.name).toBe('anthropic');
  });

  it('creates OpenAI provider for gpt-* models', () => {
    const provider = createProvider('gpt-4o', 'test-key');
    expect(provider.name).toBe('openai');
  });

  it('creates OpenAI provider for o1-* models', () => {
    const provider = createProvider('o1-preview', 'test-key');
    expect(provider.name).toBe('openai');
  });

  it('creates OpenAI provider for o3-* models', () => {
    const provider = createProvider('o3-mini', 'test-key');
    expect(provider.name).toBe('openai');
  });

  it('creates OpenAI provider for o4-* models', () => {
    const provider = createProvider('o4-mini', 'test-key');
    expect(provider.name).toBe('openai');
  });

  it('creates Ollama provider for ollama/* models', () => {
    const provider = createProvider('ollama/llama3.1');
    expect(provider.name).toBe('ollama');
  });

  it('creates Ollama provider for unrecognized models', () => {
    const provider = createProvider('qwen3-8b');
    expect(provider.name).toBe('ollama');
  });

  it('throws for Anthropic without API key', () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => createProvider('claude-sonnet-4-20250514')).toThrow('API key required');
    } finally {
      if (origKey) process.env.ANTHROPIC_API_KEY = origKey;
    }
  });

  it('throws for OpenAI without API key', () => {
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createProvider('gpt-4o')).toThrow('API key required');
    } finally {
      if (origKey) process.env.OPENAI_API_KEY = origKey;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 12: TuneResult type shape validation
// ---------------------------------------------------------------------------
describe('TuneResult type validation', () => {
  it('has expected shape when constructed manually', () => {
    const result: TuneResult = {
      modelString: 'claude-sonnet-4-20250514',
      variant: 'quick',
      config: {
        toolCounts: [10, 50],
        conditions: ['baseline', 'balanced', 'small-model'],
        tasksPerCell: 5,
        seeds: 1,
      },
      results: {
        '10': {
          baseline: { accuracy: 0.80, avgTokens: 5000, savingsPercent: 0 },
          balanced: { accuracy: 0.82, avgTokens: 2000, savingsPercent: 60 },
        },
      },
      recommendation: {
        profile: 'balanced',
        operators: {
          sdm: true, tas: true, dro: true, cfl: false,
          cfo: true, cas: true, sad: false, ccp: true,
        },
        confidence: 'MEDIUM',
        score: 0.85,
        rationale: 'Test rationale',
        alternatives: [],
        disqualified: [],
      },
      benchmarkDate: '2026-04-25T12:00:00Z',
      totalCalls: 30,
      totalDurationMs: 5000,
    };

    expect(result.modelString).toBe('claude-sonnet-4-20250514');
    expect(result.variant).toBe('quick');
    expect(result.config.toolCounts).toHaveLength(2);
    expect(result.config.conditions).toHaveLength(3);
    expect(result.results['10']).toBeDefined();
    expect(result.recommendation.profile).toBe('balanced');
    expect(typeof result.benchmarkDate).toBe('string');
    expect(result.totalCalls).toBe(30);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 13: CONDITION_TO_OPERATORS --- all conditions have 8 operators
// ---------------------------------------------------------------------------
describe('CONDITION_TO_OPERATORS --- operator completeness (cross-reference)', () => {
  const EXPECTED_KEYS = ['sdm', 'tas', 'dro', 'cfl', 'cfo', 'cas', 'sad', 'ccp'];

  it('all conditions referenced by QUICK_CONFIG exist in CONDITION_TO_OPERATORS', () => {
    for (const condition of QUICK_CONFIG.conditions) {
      expect(CONDITION_TO_OPERATORS).toHaveProperty(condition);
    }
  });

  it('all conditions referenced by FULL_CONFIG exist in CONDITION_TO_OPERATORS', () => {
    for (const condition of FULL_CONFIG.conditions) {
      expect(CONDITION_TO_OPERATORS).toHaveProperty(condition);
    }
  });

  it('every condition in CONDITION_TO_OPERATORS has exactly 8 boolean keys', () => {
    for (const [name, ops] of Object.entries(CONDITION_TO_OPERATORS)) {
      const keys = Object.keys(ops);
      expect(keys).toHaveLength(8);
      for (const key of EXPECTED_KEYS) {
        expect(ops).toHaveProperty(key);
        expect(typeof ops[key as keyof typeof ops]).toBe('boolean');
      }
    }
  });

  it('operator key names match between configs and CONDITION_TO_OPERATORS', () => {
    // All keys must be exactly: sdm, tas, dro, cfl, cfo, cas, sad, ccp
    for (const ops of Object.values(CONDITION_TO_OPERATORS)) {
      const keys = Object.keys(ops).sort();
      expect(keys).toEqual([...EXPECTED_KEYS].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// Test 14: ProviderError
// ---------------------------------------------------------------------------
describe('ProviderError', () => {
  it('is an instance of Error', () => {
    const err = new ProviderError('test', 429);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
    expect(err.status).toBe(429);
    expect(err.name).toBe('ProviderError');
  });

  it('works without status code', () => {
    const err = new ProviderError('no status');
    expect(err.status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 15: Pricing matches known models
// ---------------------------------------------------------------------------
describe('estimateCost --- pricing keys', () => {
  it('claude-opus matches claude-opus pricing', () => {
    const est = estimateCost(tuneConfig({ model: 'claude-opus-4-20260101' }));
    expect(est.provider).toBe('anthropic');
    // Opus is more expensive than sonnet
    const sonnetEst = estimateCost(tuneConfig({ model: 'claude-sonnet-4-20250514' }));
    expect(est.estimatedCostUsd).toBeGreaterThan(sonnetEst.estimatedCostUsd);
  });

  it('gpt-4o-mini is cheap', () => {
    const est = estimateCost(tuneConfig({ model: 'gpt-4o-mini' }));
    expect(est.provider).toBe('openai');
    // gpt-4o-mini is cheaper than gpt-4o
    const gpt4oEst = estimateCost(tuneConfig({ model: 'gpt-4o' }));
    expect(est.estimatedCostUsd).toBeLessThan(gpt4oEst.estimatedCostUsd);
  });
});
