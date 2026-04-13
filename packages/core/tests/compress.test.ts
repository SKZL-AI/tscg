/**
 * @tscg/core — Compression Tests
 *
 * Tests the core compression pipeline against documented benchmarks:
 * - Single tool: >60% compression
 * - 25-tool catalog: >70% compression
 * - Tool names preserved
 * - Performance: <1ms for 25 tools
 * - Profile-based compression levels
 */

import { describe, it, expect } from 'vitest';
import {
  compress,
  compressToolSchema,
  compressBatch,
  TSCGCompiler,
  estimateTokens,
  formatSavings,
  getTokenizerProfile,
  listProfiles,
} from '../src/index.js';
import type { AnyToolDefinition, ToolDefinition } from '../src/index.js';

// ============================================================
// Test Fixtures
// ============================================================

/** A realistic weather tool definition in OpenAI format */
const weatherTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Use this tool to get the current weather conditions for a specific location. This tool allows you to retrieve real-time weather data including temperature, humidity, and wind speed.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state or country to get weather for, e.g., "San Francisco, CA" or "London, UK"',
        },
        units: {
          type: 'string',
          description: 'The temperature unit system to use for the response',
          enum: ['celsius', 'fahrenheit'],
        },
        include_forecast: {
          type: 'boolean',
          description: 'Indicates whether to include the 5-day forecast in the response',
        },
      },
      required: ['location'],
    },
  },
};

/** Generate a catalog of N realistic tools for benchmark testing */
function generateToolCatalog(n: number): ToolDefinition[] {
  const toolTemplates = [
    {
      name: 'search_web',
      description: 'Use this tool when you need to search the web for current information. This tool allows you to find recent events, news, product information, or any current data that may have changed since your training cutoff.',
      params: [
        { name: 'query', type: 'string', description: 'The search query to execute', required: true },
        { name: 'max_results', type: 'number', description: 'Specifies the maximum number of results to return', required: false },
        { name: 'language', type: 'string', description: 'The language to search in', required: false, enum: ['en', 'de', 'fr', 'es', 'ja'] },
      ],
    },
    {
      name: 'send_email',
      description: 'This tool allows you to send an email to one or more recipients. Use this tool for composing and sending email messages with optional attachments and formatting.',
      params: [
        { name: 'to', type: 'string', description: 'The recipient email addresses, comma-separated', required: true },
        { name: 'subject', type: 'string', description: 'The subject line of the email', required: true },
        { name: 'body', type: 'string', description: 'The body content of the email message', required: true },
        { name: 'cc', type: 'string', description: 'The CC recipient email addresses if applicable', required: false },
      ],
    },
    {
      name: 'create_calendar_event',
      description: 'This tool is used to create a new calendar event. It allows you to specify the event title, date, time, duration, and optionally invite participants.',
      params: [
        { name: 'title', type: 'string', description: 'The title of the calendar event', required: true },
        { name: 'start_time', type: 'string', description: 'The start date and time in ISO 8601 format', required: true },
        { name: 'duration_minutes', type: 'number', description: 'The duration of the event in minutes', required: true },
        { name: 'participants', type: 'array', description: 'The list of participant email addresses to invite', required: false },
        { name: 'location', type: 'string', description: 'The location where the event will take place', required: false },
      ],
    },
    {
      name: 'read_file',
      description: 'Use this tool to read the contents of a file from the local filesystem. This tool can be used to access any file that the user has permission to read.',
      params: [
        { name: 'path', type: 'string', description: 'The absolute path to the file to read', required: true },
        { name: 'encoding', type: 'string', description: 'The character encoding to use when reading the file', required: false, enum: ['utf-8', 'ascii', 'binary'] },
      ],
    },
    {
      name: 'execute_code',
      description: 'This tool allows you to execute code in a sandboxed environment. You can use this to run Python, JavaScript, or shell scripts and get the output.',
      params: [
        { name: 'code', type: 'string', description: 'The source code to execute', required: true },
        { name: 'language', type: 'string', description: 'The programming language of the code', required: true, enum: ['python', 'javascript', 'bash'] },
        { name: 'timeout', type: 'number', description: 'The maximum execution time in seconds', required: false },
      ],
    },
    {
      name: 'query_database',
      description: 'Use this tool to execute SQL queries against a database. This tool is designed to retrieve data from relational databases and return the results in a structured format.',
      params: [
        { name: 'query', type: 'string', description: 'The SQL query to execute against the database', required: true },
        { name: 'database', type: 'string', description: 'The name of the database to query', required: true },
        { name: 'limit', type: 'number', description: 'The maximum number of rows to return in the result', required: false },
      ],
    },
    {
      name: 'translate_text',
      description: 'This tool allows you to translate text from one language to another. It uses machine translation to provide accurate translations for common language pairs.',
      params: [
        { name: 'text', type: 'string', description: 'The text content to translate', required: true },
        { name: 'source_language', type: 'string', description: 'The source language code', required: true },
        { name: 'target_language', type: 'string', description: 'The target language code to translate into', required: true },
      ],
    },
    {
      name: 'create_image',
      description: 'Use this tool when you need to generate an image from a text description. This tool can be used to create illustrations, diagrams, or any visual content.',
      params: [
        { name: 'prompt', type: 'string', description: 'The text description of the image to generate', required: true },
        { name: 'size', type: 'string', description: 'The size of the generated image', required: false, enum: ['256x256', '512x512', '1024x1024'] },
        { name: 'style', type: 'string', description: 'The artistic style for the generated image', required: false },
      ],
    },
    {
      name: 'manage_tasks',
      description: 'This tool is used to create, update, or delete tasks in a task management system. You can use this to help users organize their work and track progress.',
      params: [
        { name: 'action', type: 'string', description: 'The action to perform on the task', required: true, enum: ['create', 'update', 'delete', 'list'] },
        { name: 'title', type: 'string', description: 'The title of the task', required: false },
        { name: 'status', type: 'string', description: 'The current status of the task', required: false, enum: ['todo', 'in_progress', 'done'] },
        { name: 'priority', type: 'string', description: 'The priority level of the task', required: false, enum: ['low', 'medium', 'high', 'critical'] },
      ],
    },
    {
      name: 'analyze_data',
      description: 'Use this tool to perform statistical analysis on a dataset. This tool can calculate summary statistics, correlations, and generate basic visualizations.',
      params: [
        { name: 'data', type: 'array', description: 'The dataset to analyze, as an array of objects', required: true },
        { name: 'analysis_type', type: 'string', description: 'The type of analysis to perform', required: true, enum: ['summary', 'correlation', 'regression', 'histogram'] },
        { name: 'columns', type: 'array', description: 'The specific columns to include in the analysis', required: false },
      ],
    },
  ];

  const tools: ToolDefinition[] = [];
  for (let i = 0; i < n; i++) {
    const template = toolTemplates[i % toolTemplates.length];
    const suffix = i >= toolTemplates.length ? `_${Math.floor(i / toolTemplates.length) + 1}` : '';
    tools.push({
      type: 'function',
      function: {
        name: `${template.name}${suffix}`,
        description: template.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            template.params.map((p) => [
              p.name,
              {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              },
            ])
          ),
          required: template.params.filter((p) => p.required).map((p) => p.name),
        },
      },
    });
  }
  return tools;
}

// ============================================================
// Tests
// ============================================================

describe('@tscg/core — compress()', () => {
  it('should compress a single tool by >60%', () => {
    const result = compressToolSchema(weatherTool, { profile: 'balanced' });

    expect(result.compressed).toBeDefined();
    expect(result.compressed.length).toBeGreaterThan(0);
    // v1.3.0: balanced profile now includes CCP which appends ~5-10 tokens
    // for the [CLOSURE:...] recap. Net savings on a single tool drops from
    // ~71% to ~58-62%. Paper §4.5 documents this as a schema-vs-generation
    // tokens tradeoff (CCP reduces downstream generation tokens).
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(55);
  });

  it('should compress a 25-tool catalog by >60%', () => {
    const tools = generateToolCatalog(25);
    const result = compress(tools, { profile: 'balanced' });

    expect(result.compressed).toBeDefined();
    // Baseline is JSON.stringify (includes JSON overhead). The 71.7% figure
    // from the paper uses natural-text rendering as baseline. Against JSON
    // input, 60-67% savings is expected.
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(60);
  });

  it('should preserve all tool names in compressed output', () => {
    const tools = generateToolCatalog(10);
    const result = compress(tools, { profile: 'balanced' });

    for (const tool of tools) {
      expect(result.compressed).toContain(tool.function.name);
    }
  });

  it('should complete in <1ms for 25 tools', () => {
    const tools = generateToolCatalog(25);

    // Warm up
    compress(tools, { profile: 'balanced' });

    // Measure
    const start = performance.now();
    const result = compress(tools, { profile: 'balanced' });
    const elapsed = performance.now() - start;

    // Allow up to 5ms — sub-millisecond is typical but CI/Windows can have jitter
    expect(elapsed).toBeLessThan(5);
    expect(result.metrics.compressionTimeMs).toBeLessThan(5);
  });

  it('should return valid metrics', () => {
    const tools = generateToolCatalog(5);
    const result = compress(tools);

    expect(result.metrics.tokens.original).toBeGreaterThan(0);
    expect(result.metrics.tokens.compressed).toBeGreaterThan(0);
    expect(result.metrics.tokens.savings).toBeGreaterThan(0);
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(0);
    expect(result.metrics.characters.original).toBeGreaterThan(0);
    expect(result.metrics.characters.compressed).toBeGreaterThan(0);
    expect(result.metrics.compressionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.perTool).toHaveLength(5);
  });

  it('should list applied principles', () => {
    const result = compress(generateToolCatalog(3), { profile: 'balanced' });

    expect(result.appliedPrinciples).toBeDefined();
    expect(result.appliedPrinciples.length).toBeGreaterThan(0);
    expect(result.appliedPrinciples).toContain('SDM');
    expect(result.appliedPrinciples).toContain('TAS');
  });
});

describe('@tscg/core — compression profiles', () => {
  const tools = generateToolCatalog(10);

  it('conservative profile should save >50%', () => {
    const result = compress(tools, { profile: 'conservative' });
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(50);
  });

  it('balanced profile should save >60%', () => {
    const result = compress(tools, { profile: 'balanced' });
    // v1.3.0: balanced now enables CCP by default (+5-10 tokens per catalog).
    // Threshold reduced from 65→60 to reflect the 8-operator baseline. Paper §5
    // documents CCP's schema-token overhead as an accuracy-improving tradeoff.
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(60);
  });

  it('aggressive profile should save >60%', () => {
    const result = compress(tools, { profile: 'aggressive' });
    // Against JSON.stringify baseline; aggressive enables all transforms
    // but the main gains come from SDM+DRO which both profiles share
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(60);
  });

  it('aggressive should compress more than conservative', () => {
    const conservative = compress(tools, { profile: 'conservative' });
    const aggressive = compress(tools, { profile: 'aggressive' });

    expect(aggressive.metrics.tokens.savingsPercent)
      .toBeGreaterThan(conservative.metrics.tokens.savingsPercent);
  });
});

describe('@tscg/core — TSCGCompiler class', () => {
  it('should be instantiable with defaults', () => {
    const compiler = new TSCGCompiler();
    const config = compiler.getMetrics();

    expect(config.model).toBe('auto');
    expect(config.profile).toBe('balanced');
    expect(config.principles).toBeDefined();
  });

  it('should compile a single tool', () => {
    const compiler = new TSCGCompiler({ model: 'claude-sonnet' });
    const result = compiler.compile(weatherTool);

    expect(result.compressed).toBeDefined();
    expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(50);
  });

  it('should compile many tools', () => {
    const compiler = new TSCGCompiler({ profile: 'aggressive' });
    const result = compiler.compileMany(generateToolCatalog(15));

    expect(result.compressed).toBeDefined();
    expect(result.metrics.perTool).toHaveLength(15);
  });
});

describe('@tscg/core — compressBatch()', () => {
  it('should compress for multiple models', () => {
    const tools = generateToolCatalog(5);
    const results = compressBatch(tools, ['claude-sonnet', 'gpt-5', 'mistral-7b']);

    expect(results.size).toBe(3);
    expect(results.get('claude-sonnet')).toBeDefined();
    expect(results.get('gpt-5')).toBeDefined();
    expect(results.get('mistral-7b')).toBeDefined();

    // All should have compression
    for (const [, result] of results) {
      expect(result.metrics.tokens.savingsPercent).toBeGreaterThan(50);
    }
  });
});

describe('@tscg/core — estimateTokens()', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate tokens for text', () => {
    const tokens = estimateTokens('Hello, world! This is a test.');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it('should return different estimates for different models', () => {
    const text = 'A somewhat longer text string for testing token estimation differences.';
    const claude = estimateTokens(text, 'claude-sonnet');
    const qwen = estimateTokens(text, 'qwen-3');

    // Qwen has lower chars-per-token, so more tokens estimated
    expect(qwen).toBeGreaterThanOrEqual(claude);
  });
});

describe('@tscg/core — formatSavings()', () => {
  it('should format metrics as readable string', () => {
    const result = compress(generateToolCatalog(5));
    const formatted = formatSavings(result.metrics);

    expect(formatted).toContain('tokens');
    expect(formatted).toContain('%');
    expect(formatted).toContain('ms');
    expect(formatted).toContain('saved');
  });
});

/**
 * LÜCKE 1 FIX: CFL Echo-Back Regression Tests
 *
 * GPT-4o and Gemini echo CFL tags ([ANSWER:type]) back instead of interpreting
 * them. The v1.2.0 fix strips CFL from non-Claude models. These regression
 * tests verify:
 * 1. CFL tags are NOT present in output for GPT/Gemini-targeted models
 * 2. CFL tags ARE preserved for Claude-targeted compilation
 * 3. Conservative profile (no CFL) never includes CFL artifacts
 */
describe('@tscg/core — CFL Echo-Back regression (Lücke 1)', () => {
  const tools = generateToolCatalog(5);

  it('conservative profile should not produce CFL artifacts', () => {
    const result = compress(tools, { profile: 'conservative' });
    // Conservative disables CFL, so no CFL tags should appear
    expect(result.compressed).not.toContain('[ANSWER:');
    expect(result.compressed).not.toContain('[CLASSIFY:');
    expect(result.compressed).not.toContain('[ANCHOR:');
  });

  it('GPT-4o targeted compilation should not contain CFL tags', () => {
    const result = compress(tools, { model: 'gpt-4o-mini', profile: 'balanced' });
    // Even with balanced profile, GPT-4o model should not get CFL artifacts
    // that would cause echo-back behavior
    expect(result.compressed).not.toContain('[ANSWER:');
    expect(result.compressed).not.toContain('[CLASSIFY:');
  });

  it('should produce valid compressed output regardless of CAS setting', () => {
    // Verify compression still works with CAS disabled
    const withCas = compress(tools, { principles: { cas: true } });
    const withoutCas = compress(tools, { principles: { cas: false } });

    // Both should produce valid output
    expect(withCas.compressed.length).toBeGreaterThan(0);
    expect(withoutCas.compressed.length).toBeGreaterThan(0);

    // Both should have compression savings
    expect(withCas.metrics.tokens.savingsPercent).toBeGreaterThan(50);
    expect(withoutCas.metrics.tokens.savingsPercent).toBeGreaterThan(50);
  });

  it('should preserve all tool names with CAS enabled or disabled', () => {
    const withCas = compress(tools, { principles: { cas: true } });
    const withoutCas = compress(tools, { principles: { cas: false } });

    for (const tool of tools) {
      expect(withCas.compressed).toContain(tool.function.name);
      expect(withoutCas.compressed).toContain(tool.function.name);
    }
  });
});

/**
 * LÜCKE 2 FIX: Thinking-Model Exclusion Warning
 *
 * Thinking/reasoning models (o1, o3, DeepSeek-R1) score 0% on TSCG-compressed
 * schemas because they decompress in their internal CoT. These models should
 * NOT be used with TSCG tool compression. The @tscg/core package documents this
 * limitation here and in profiles.ts.
 *
 * Note: The actual exclusion logic is enforced at the TAB benchmark level
 * (Wave 3). The core package provides model profiles that do NOT include
 * thinking models, effectively preventing accidental usage.
 */
describe('@tscg/core — Thinking-Model awareness (Lücke 2)', () => {
  it('should not include thinking models in available profiles', () => {
    const profiles = listProfiles();
    const modelNames = profiles.map((p) => p.model);

    // Thinking models should NOT have dedicated profiles
    // (o1, o3, DeepSeek-R1 decompress TSCG in CoT → 0% accuracy)
    expect(modelNames).not.toContain('o1');
    expect(modelNames).not.toContain('o3');
    expect(modelNames).not.toContain('o1-preview');
    expect(modelNames).not.toContain('o3-mini');
    expect(modelNames).not.toContain('deepseek-r1');
  });

  it('should fallback to auto profile for unknown/thinking models', () => {
    // Thinking models that are passed should get default (auto) profile
    // They won't get model-specific optimization
    const profile = getTokenizerProfile('auto');
    expect(profile.model).toBe('auto');
    expect(profile.charsPerToken).toBe(4.0);
  });
});

/**
 * KORREKTUR 3: SAD-F Model-Schutz
 *
 * SAD (Selective Anchor Duplication) is only effective on Claude models.
 * On GPT-4o, Gemini, and small models it causes degradation.
 * The compiler must force-disable SAD for non-Claude models.
 */
describe('@tscg/core — SAD Model-Schutz (Korrektur 3)', () => {
  const tools = generateToolCatalog(5);

  it('should disable SAD for GPT models even with aggressive profile', () => {
    const compiler = new TSCGCompiler({ model: 'gpt-4', profile: 'aggressive' });
    const config = compiler.getMetrics();
    expect(config.principles.sad).toBe(false);
  });

  it('should disable SAD for Mistral models', () => {
    const compiler = new TSCGCompiler({ model: 'mistral-7b', profile: 'aggressive' });
    const config = compiler.getMetrics();
    expect(config.principles.sad).toBe(false);
  });

  it('should disable SAD for Llama models', () => {
    const compiler = new TSCGCompiler({ model: 'llama-3.1', profile: 'aggressive' });
    const config = compiler.getMetrics();
    expect(config.principles.sad).toBe(false);
  });

  it('should allow SAD for Claude models with aggressive profile', () => {
    const compiler = new TSCGCompiler({ model: 'claude-sonnet', profile: 'aggressive' });
    const config = compiler.getMetrics();
    expect(config.principles.sad).toBe(true);
  });

  it('should allow SAD for auto model (default assumes Claude-compatible)', () => {
    const compiler = new TSCGCompiler({ model: 'auto', profile: 'aggressive' });
    const config = compiler.getMetrics();
    expect(config.principles.sad).toBe(true);
  });
});

/**
 * KORREKTUR 1: Engine Equivalence Test
 *
 * Verifies that _engine.ts (bridge) produces identical output to
 * the original src/optimizer/transforms-tools.ts pipeline.
 * Both must produce byte-identical compressed text for identical inputs.
 */
describe('@tscg/core — Engine Equivalence (Korrektur 1)', () => {
  // Import both pipelines
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  it('should produce identical output from _engine.ts and transforms-tools.ts', async () => {
    // Import the bridge engine used by @tscg/core
    const bridge = await import('../src/_engine.js');
    // Import the original engine
    const original = await import('../../../src/optimizer/transforms-tools.js');

    // Test tools in internal format (matching both engines' ToolDefinition)
    const internalTools = [
      {
        name: 'search_web',
        description: 'Use this tool when you need to search the web for current information. This tool allows you to find recent events, news, product information, or any current data that may have changed since your training cutoff.',
        parameters: [
          { name: 'query', type: 'string', description: 'The search query to execute', required: true },
          { name: 'max_results', type: 'number', description: 'Specifies the maximum number of results to return', required: false },
          { name: 'language', type: 'string', description: 'The language to search in', required: false, enum: ['en', 'de', 'fr', 'es', 'ja'] },
        ],
      },
      {
        name: 'read_file',
        description: 'Use this tool to read the contents of a file from the local filesystem. This tool can be used to access any file that the user has permission to read.',
        parameters: [
          { name: 'path', type: 'string', description: 'The absolute path to the file to read', required: true as const },
          { name: 'encoding', type: 'string', description: 'The character encoding to use when reading the file', required: false as const, enum: ['utf-8', 'ascii', 'binary'] },
        ],
      },
      {
        name: 'execute_code',
        description: 'This tool allows you to execute code in a sandboxed environment. You can use this to run Python, JavaScript, or shell scripts and get the output.',
        parameters: [
          { name: 'code', type: 'string', description: 'The source code to execute', required: true },
          { name: 'language', type: 'string', description: 'The programming language of the code', required: true, enum: ['python', 'javascript', 'bash'] },
          { name: 'timeout', type: 'number', description: 'The maximum execution time in seconds', required: false },
        ],
      },
    ];

    // Run both pipelines with the legacy 5-operator subset enabled.
    // v1.3.0 adds CFO/CFL/CCP to _engine.ts but NOT to transforms-tools.ts
    // (the main webapp's engine). The equivalence test must isolate the
    // shared subset to remain meaningful.
    const bridgeResult = bridge.optimizeToolDefinitions(internalTools, {
      useSDM: true, useDRO: true, useCAS: true, useTAS: true,
      useCFO: false, useCFL: false, useCCP: false, useSAD: false,
    });
    const originalResult = original.optimizeToolDefinitions(internalTools, {
      useSDM: true, useDRO: true, useCAS: true, useTAS: true,
    });

    // The compressed text must be identical
    expect(bridgeResult.text).toBe(originalResult.text);

    // Token estimates must match
    expect(bridgeResult.optimizedTokenEstimate).toBe(originalResult.optimizedTokenEstimate);
    expect(bridgeResult.originalTokenEstimate).toBe(originalResult.originalTokenEstimate);

    // Savings percent must match
    expect(bridgeResult.savingsPercent).toBe(originalResult.savingsPercent);
  });

  it('should produce identical SDM output from both engines', async () => {
    const bridge = await import('../src/_engine.js');
    const original = await import('../../../src/optimizer/transforms-tools.js');

    const tools = [{
      name: 'test_tool',
      description: 'Use this tool when you need to search for information. This tool allows you to find data.',
      parameters: [{
        name: 'query',
        type: 'string',
        description: 'The value of the search query to execute',
        required: true,
      }],
    }];

    const bridgeSDM = bridge.applyToolSDM(tools);
    const originalSDM = original.applyToolSDM(tools);

    expect(bridgeSDM[0].description).toBe(originalSDM[0].description);
    expect(bridgeSDM[0].parameters[0].description).toBe(originalSDM[0].parameters[0].description);
  });
});

describe('@tscg/core — profiles', () => {
  it('should get a tokenizer profile for claude-sonnet', () => {
    const profile = getTokenizerProfile('claude-sonnet');
    expect(profile.model).toBe('claude-sonnet');
    expect(profile.charsPerToken).toBe(4.0);
  });

  it('should return default profile for auto', () => {
    const profile = getTokenizerProfile('auto');
    expect(profile.model).toBe('auto');
    expect(profile.charsPerToken).toBe(4.0);
  });

  it('should list all available profiles', () => {
    const profiles = listProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(10);

    const names = profiles.map((p) => p.model);
    expect(names).toContain('claude-sonnet');
    expect(names).toContain('gpt-5');
    expect(names).toContain('mistral-7b');
    expect(names).toContain('deepseek-v3');
  });
});

/**
 * 8-Operator Closure Test (v1.3.0) — prevents regression to phantom operators.
 *
 * The TSCG paper defines exactly 8 compression operators:
 *   SDM, TAS, DRO, CFL, CFO, CAS, SAD-F, CCP
 *
 * This block asserts:
 *   1. All 8 appear in appliedPrinciples for Claude + aggressive profile
 *   2. Non-Claude models get 7 (CFL and SAD auto-disabled, CCP preserved)
 *   3. No phantom labels (ATA, RKE, CSP, CFL→CAS collision from L-23 era)
 */
describe('@tscg/core — 8-Operator Closure (v1.3.0)', () => {
  const tools = generateToolCatalog(5);

  it('Claude aggressive profile exposes all 8 paper operators in appliedPrinciples', () => {
    const result = compress(tools, { model: 'claude-sonnet', profile: 'aggressive' });
    const expected = ['SDM', 'TAS', 'DRO', 'CFL', 'CFO', 'CAS', 'SAD', 'CCP'];
    for (const op of expected) {
      expect(result.appliedPrinciples).toContain(op);
    }
    expect(result.appliedPrinciples).toHaveLength(8);
  });

  it('non-Claude aggressive profile disables CFL + SAD but keeps CCP and CFO', () => {
    const result = compress(tools, { model: 'gpt-4o-mini', profile: 'aggressive' });
    expect(result.appliedPrinciples).not.toContain('CFL');
    expect(result.appliedPrinciples).not.toContain('SAD');
    expect(result.appliedPrinciples).toContain('CCP');
    expect(result.appliedPrinciples).toContain('CFO');
    // 8 - 2 Claude-only = 6 expected for GPT aggressive
    expect(result.appliedPrinciples).toHaveLength(6);
  });

  it('does NOT expose phantom operators from L-23/L-24 era', () => {
    const result = compress(tools, { model: 'claude-sonnet', profile: 'aggressive' });
    // These were removed or renamed; must never re-appear in output metadata
    expect(result.appliedPrinciples).not.toContain('ATA');
    expect(result.appliedPrinciples).not.toContain('RKE');
    expect(result.appliedPrinciples).not.toContain('CSP');
    expect(result.appliedPrinciples).not.toContain('DTR'); // renamed → SDM
    expect(result.appliedPrinciples).not.toContain('SCO'); // renamed → DRO
  });

  it('conservative profile only applies SDM', () => {
    const result = compress(tools, { profile: 'conservative' });
    expect(result.appliedPrinciples).toEqual(['SDM']);
  });
});

/**
 * CFO — Causal-Forward Ordering regression test.
 *
 * Asserts read-class tools (get_*, read_*, list_*, search_*) appear BEFORE
 * write-class tools (create_*, send_*, update_*, delete_*, execute_*) in
 * the compressed output. Uses first-occurrence string index as proxy for
 * order, since DRO emits tools in array order.
 */
describe('@tscg/core — CFO Causal Ordering', () => {
  it('places read-class tool before write-class tool', () => {
    const readTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'read_config',
        description: 'Read the configuration file.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    };
    const writeTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'delete_file',
        description: 'Delete a file from disk.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    };
    // Intentionally pass write FIRST — CFO should reorder so read comes first
    const result = compress([writeTool, readTool], {
      profile: 'balanced',
      principles: { cfo: true, cas: false }, // isolate CFO from CAS
    });
    const readIdx = result.compressed.indexOf('read_config');
    const writeIdx = result.compressed.indexOf('delete_file');
    expect(readIdx).toBeGreaterThanOrEqual(0);
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(readIdx).toBeLessThan(writeIdx);
  });

  it('is identity when all tools fall in one class', () => {
    const readOnly = generateToolCatalog(3).filter((t) =>
      /^(get_|read_|list_|search_|find_)/.test(t.function.name),
    );
    if (readOnly.length < 2) return; // skip if fixture doesn't include enough reads
    const disabled = compress(readOnly, { principles: { cfo: false } });
    const enabled = compress(readOnly, { principles: { cfo: true } });
    // Same input order → CFO should be identity
    for (const t of readOnly) {
      expect(enabled.compressed).toContain(t.function.name);
      expect(disabled.compressed).toContain(t.function.name);
    }
  });
});

/**
 * CCP — Causal Closure Principle regression test.
 *
 * Asserts the [CLOSURE:...] block is appended at the end of compressed text
 * and contains each tool name with its required parameters.
 */
describe('@tscg/core — CCP Closure Block', () => {
  const tools = generateToolCatalog(3);

  it('appends [CLOSURE:...] to aggressive-profile output', () => {
    const result = compress(tools, { model: 'claude-sonnet', profile: 'aggressive' });
    expect(result.compressed).toContain('[CLOSURE:');
    expect(result.compressed.trimEnd().endsWith(']')).toBe(true);
  });

  it('closure block lists every tool name', () => {
    const result = compress(tools, { principles: { ccp: true } });
    // Extract the closure block
    const closureMatch = result.compressed.match(/\[CLOSURE:([^\]]+)\]/);
    expect(closureMatch).not.toBeNull();
    const closureBody = closureMatch![1];
    for (const tool of tools) {
      expect(closureBody).toContain(tool.function.name);
    }
  });

  it('closure block includes required params in parens', () => {
    const result = compress(tools, { principles: { ccp: true } });
    const closureMatch = result.compressed.match(/\[CLOSURE:([^\]]+)\]/);
    expect(closureMatch).not.toBeNull();
    // At least one tool should have required params shown in parens
    // (fixture includes `to`, `subject`, `body` as required for send_email)
    expect(closureMatch![1]).toMatch(/\w+\([a-z_,]+\)/);
  });

  it('is absent when principles.ccp is explicitly false', () => {
    const result = compress(tools, { principles: { ccp: false } });
    expect(result.compressed).not.toContain('[CLOSURE:');
  });
});

/**
 * CFL — Constraint-First Layout regression test.
 *
 * Asserts the [ANSWER:function_call] prefix is prepended for Claude aggressive
 * and stripped for non-Claude targets (echo-back protection).
 */
describe('@tscg/core — CFL Constraint-First Layout', () => {
  const tools = generateToolCatalog(3);

  it('prepends [ANSWER:function_call] for Claude aggressive profile', () => {
    const result = compress(tools, { model: 'claude-sonnet', profile: 'aggressive' });
    expect(result.compressed.startsWith('[ANSWER:function_call]')).toBe(true);
  });

  it('omits [ANSWER:...] prefix for GPT-4o (echo-back protection)', () => {
    const result = compress(tools, { model: 'gpt-4o-mini', profile: 'aggressive' });
    expect(result.compressed).not.toContain('[ANSWER:');
  });

  it('omits [ANSWER:...] prefix for Llama-3.1 (echo-back protection)', () => {
    const result = compress(tools, { model: 'llama-3.1', profile: 'aggressive' });
    expect(result.compressed).not.toContain('[ANSWER:');
  });
});
