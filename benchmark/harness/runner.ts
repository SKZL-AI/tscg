/**
 * TAB BenchmarkRunner
 *
 * The main benchmark execution engine. Iterates over:
 *   model x condition x run x task
 *
 * Features:
 * - Checkpoint/resume: skip completed tasks, save progress every 10 results
 * - Rate limiting between API calls (delay-based, per provider limits)
 * - Thinking model detection (LUECKE 2): warns and skips o1/o3/DeepSeek-R1
 * - Structured result collection with parsed responses and scores
 */

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import type {
  RunConfig,
  ModelConfig,
  BenchmarkTask,
  CompressedSchemaSet,
  TaskResult,
  ParsedResponse,
  Scores,
  BenchmarkReport,
  Condition,
  Scenario,
} from './types.js';
import { isThinkingModel } from './types.js';
import { TABEvaluator } from './evaluator.js';
import { CheckpointManager } from './checkpoint.js';
import { aggregateResults } from './aggregate.js';
import type { ModelProvider } from './providers/provider.js';
import { createProvider } from './providers/index.js';
import type { RunMetadata } from './run-metadata.js';
import { createRunMetadata, finalizeRunMetadata } from './run-metadata.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Task execution timeout in milliseconds (FIX-09: 60s per call) */
const TASK_TIMEOUT_MS = 60_000;

/**
 * Per-provider inter-call delay (ms) to avoid rate limits.
 *
 * Ollama:    No API limits — minimal delay for throughput.
 * Anthropic: 50 req/min = 1200ms gap. Response latency (~2-10s) absorbs most,
 *            so a 500ms floor is safe.
 * OpenAI:    60 req/min = 1000ms, but TPM limit dominates. The 5s retry
 *            backoff on 429 handles spikes; 500ms floor for steady state.
 */
const PROVIDER_DELAY_MS: Record<string, number> = {
  ollama: 55,
  anthropic: 500,
  openai: 500,
};

/**
 * Result status codes for invalid-output handling (FIX-09).
 * Defines how each outcome is treated in statistical analysis:
 * - 'success': counted normally
 * - 'timeout': counted as incorrect
 * - 'no_tool_call': counted as incorrect (for tool-use scenarios)
 * - 'parse_error': counted as incorrect
 * - 'provider_error': EXCLUDED from analysis, logged in RUN_METADATA.json
 * - 'rate_limit_exhausted': counted as incorrect
 */
type ResultStatus = 'success' | 'timeout' | 'no_tool_call' | 'parse_error' | 'provider_error' | 'rate_limit_exhausted';

export class BenchmarkRunner {
  private readonly config: RunConfig;
  private readonly evaluator: TABEvaluator;
  private checkpoint: CheckpointManager | null = null;

  constructor(config: RunConfig) {
    this.config = config;
    this.evaluator = new TABEvaluator();
  }

  /**
   * Execute the full benchmark run.
   *
   * @param tasks - Array of benchmark tasks to evaluate
   * @param schemas - Compressed schema sets for each condition
   * @returns Complete benchmark report with results and aggregates
   */
  async run(tasks: BenchmarkTask[], schemas: CompressedSchemaSet): Promise<BenchmarkReport> {
    const startTime = new Date().toISOString();
    const startMs = Date.now();

    // Ensure output directory exists
    mkdirSync(this.config.outputDir, { recursive: true });

    // Initialize checkpoint manager
    const checkpointPath = this.config.checkpoint
      ?? join(this.config.outputDir, 'checkpoint.json');
    this.checkpoint = new CheckpointManager(checkpointPath);

    // Pre-flight: check for thinking models (LUECKE 2)
    const validModels = this.filterThinkingModels(this.config.models);

    // Initialize run metadata for provenance tracking (FIX-04)
    const runMeta = createRunMetadata({
      scenario: this.config.scenario,
      models: validModels.map(m => m.name),
      conditions: this.config.conditions,
      runs: this.config.runsPerCondition,
      seed: 42,
    });

    const allResults: TaskResult[] = [];

    // Load previously completed results from checkpoint
    const previousResults = this.checkpoint.load();
    allResults.push(...previousResults);

    let completedCount = previousResults.length;
    const totalTasks = validModels.length * this.config.conditions.length *
      this.config.runsPerCondition * tasks.length;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`  TAB Benchmark Runner`);
    console.log(`  Scenario: ${this.config.scenario}`);
    console.log(`  Models: ${validModels.map(m => m.name).join(', ')}`);
    console.log(`  Conditions: ${this.config.conditions.join(', ')}`);
    console.log(`  Runs per condition: ${this.config.runsPerCondition}`);
    console.log(`  Tasks: ${tasks.length}`);
    console.log(`  Total API calls: ${totalTasks}`);
    if (previousResults.length > 0) {
      console.log(`  Resuming from checkpoint: ${previousResults.length} completed`);
    }
    console.log(`${'='.repeat(80)}\n`);

    // Main execution loop: model x condition x run x task
    for (const modelConfig of validModels) {
      const provider = createProvider({
        provider: modelConfig.provider,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
      });

      for (const condition of this.config.conditions) {
        for (let run = 1; run <= this.config.runsPerCondition; run++) {
          for (const task of tasks) {
            // Skip if already completed (checkpoint)
            if (
              this.checkpoint.isCompleted(
                task.task_id,
                modelConfig.name,
                condition,
                run,
              )
            ) {
              continue;
            }

            completedCount++;
            const progress = `[${completedCount}/${totalTasks}]`;

            process.stdout.write(
              `  ${progress} ${modelConfig.name} | ${condition.padEnd(8)} | run ${run} | ${task.task_id} ... `,
            );

            // Execute with retry
            let result: TaskResult | null = null;
            for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
              try {
                result = await this.executeTask(
                  provider,
                  task,
                  schemas,
                  modelConfig,
                  condition,
                  run,
                );
                break;
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit');
                const isProviderError = errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503');

                if (attempt < this.config.retryAttempts) {
                  const delay = this.config.retryDelayMs * Math.pow(2, attempt);
                  console.log(
                    `\n    Retry ${attempt + 1}/${this.config.retryAttempts} after ${delay}ms: ${errMsg}`,
                  );
                  await sleep(delay);
                } else {
                  // Final attempt failed — classify per FIX-09
                  if (isProviderError) {
                    // Provider errors (5xx) are EXCLUDED from analysis
                    runMeta.errors.push({ timestamp: new Date().toISOString(), message: `provider_error: ${errMsg}`, task: task.task_id });
                  } else if (isRateLimit) {
                    runMeta.errors.push({ timestamp: new Date().toISOString(), message: `rate_limit_exhausted: ${errMsg}`, task: task.task_id });
                  }
                  result = this.makeErrorResult(
                    task,
                    modelConfig,
                    condition,
                    run,
                    errMsg,
                  );
                }
              }
            }

            if (result) {
              allResults.push(result);
              this.checkpoint.save(result);
              const symbol = result.scores.overall >= 0.5 ? '+' : '-';
              console.log(
                `${symbol} (overall=${result.scores.overall.toFixed(2)}, ${result.metrics.total_latency_ms}ms)`,
              );
            }

            // Per-provider rate limiting delay between calls
            const providerDelay = PROVIDER_DELAY_MS[modelConfig.provider] ?? 500;
            if (providerDelay > 0) {
              await sleep(providerDelay);
            }
          }
        }
      }
    }

    // Final checkpoint flush
    this.checkpoint.flush();

    // Finalize and save run metadata (FIX-04)
    finalizeRunMetadata(runMeta, this.config.outputDir);
    console.log(`  [META] RUN_METADATA.json saved to ${this.config.outputDir}`);

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    // Aggregate results
    const aggregates = aggregateResults(allResults);

    const report: BenchmarkReport = {
      meta: {
        scenario: this.config.scenario,
        models: validModels.map(m => m.name),
        conditions: this.config.conditions,
        runs_per_condition: this.config.runsPerCondition,
        total_tasks: tasks.length,
        total_api_calls: allResults.length,
        start_time: startTime,
        end_time: endTime,
        duration_ms: durationMs,
      },
      results: allResults,
      aggregates,
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`  Benchmark complete: ${allResults.length} results in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`${'='.repeat(80)}\n`);

    return report;
  }

  /**
   * Execute a single task against a provider and score the result.
   *
   * Native tool calling strategy:
   * - `natural` condition: Pass raw tool definitions via the provider's native
   *   `tools` API parameter. This is the production baseline — how tools are
   *   actually used with OpenAI/Anthropic/Ollama APIs. The system prompt is
   *   minimal (no schema text) to avoid double-counting tokens.
   * - `tscg` / `tscg_sad` conditions: Embed compressed schemas as text in the
   *   system prompt with explicit JSON output instructions. This is the TSCG
   *   use case — replacing native tool definitions with compressed text.
   *
   * This design tests: "Can TSCG-compressed text schemas achieve comparable
   * accuracy to native tool calling while saving N% of tokens?"
   */
  private async executeTask(
    provider: ModelProvider,
    task: BenchmarkTask,
    schemas: CompressedSchemaSet,
    model: ModelConfig,
    condition: Condition,
    run: number,
  ): Promise<TaskResult> {
    // Determine whether to use native tool calling.
    // Only use native tools for API providers (OpenAI, Anthropic) where all models
    // support function calling. Ollama models vary — some support tools (Mistral),
    // others don't (Phi-4, Gemma). Using text-based mode for Ollama is safer and
    // provides a fair comparison since ALL conditions use the same mechanism.
    const supportsNativeTools = model.provider === 'openai' || model.provider === 'anthropic';
    const useNativeTools = condition === 'natural' && supportsNativeTools && this.config.scenario !== 'GSM8K';

    let systemPrompt: string;
    let nativeTools: unknown[] | undefined;

    if (useNativeTools) {
      // Native tool calling: parse tool definitions from natural JSON schema
      try {
        nativeTools = JSON.parse(schemas.natural) as unknown[];
      } catch {
        // Fallback: if natural schema isn't parseable JSON, use text mode
        nativeTools = undefined;
      }

      if (nativeTools && nativeTools.length > 0) {
        // Minimal system prompt — tools are passed via API parameter
        systemPrompt = [
          'You are a helpful assistant with access to tools.',
          'Use the appropriate tool when the user request requires one.',
          'If no tool is needed, respond normally without using a tool.',
        ].join(' ');
      } else {
        // Fallback to text-based if parsing failed
        const schemaText = this.getSchemaForCondition(schemas, condition);
        systemPrompt = this.buildSystemPrompt(schemaText, this.config.scenario);
        nativeTools = undefined;
      }
    } else {
      // Text-based mode for tscg/tscg_sad (or GSM8K)
      const schemaText = this.getSchemaForCondition(schemas, condition);
      systemPrompt = this.buildSystemPrompt(schemaText, this.config.scenario);
    }

    // Make the API call
    const t0 = Date.now();
    const response = await provider.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: task.user_message }],
      tools: nativeTools,
      temperature: 0.0, // Deterministic for benchmark reproducibility
      max_tokens: 1024,
    });
    const totalLatency = Date.now() - t0;

    // Parse the response
    const parsed = this.parseResponse(response.content, response.tool_calls);

    // Score against ground truth
    const scores = this.evaluator.score(parsed, task.ground_truth);

    // Compute cost estimate (rough)
    const costUsd = this.estimateCost(
      model.provider,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    return {
      result_id: randomUUID(),
      task_id: task.task_id,
      model: model.name,
      condition,
      run,
      response: parsed,
      scores,
      metrics: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_latency_ms: totalLatency,
        cost_usd: costUsd,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build the system prompt for text-based tool calling (tscg/tscg_sad conditions).
   *
   * This prompt is used when tool schemas are embedded as text rather than
   * passed via native API tool parameters. The instructions must be explicit
   * enough that models produce parseable JSON tool calls.
   */
  private buildSystemPrompt(schemas: string, scenario: Scenario): string {
    const toolInstructions = scenario === 'GSM8K'
      ? 'Solve the math problem step by step. Output ONLY the final numeric answer on the last line.'
      : [
          'You are a helpful assistant with access to the following tools.',
          'When the user request requires a tool, respond with ONLY a JSON tool call object.',
          'Use this exact format: {"name": "tool_name", "arguments": {"param": "value"}}',
          'For multiple sequential tools, output each JSON object on its own line.',
          'If no tool is needed, respond normally in plain text.',
          'IMPORTANT: Output the JSON directly. Do not wrap it in markdown, do not explain.',
          '',
          'Available tools:',
          schemas,
        ].join('\n');

    return toolInstructions;
  }

  /**
   * Parse a raw response into a structured ParsedResponse.
   * Handles both native tool_calls (from API) and JSON-in-text formats.
   *
   * Extraction strategy (in priority order):
   * 1. Native tool_calls from provider API (Anthropic/OpenAI)
   * 2. JSON array format: [{"name": ..., "arguments": ...}, ...]
   * 3. Multiple JSON objects in text: {"name": "A", ...} ... {"name": "B", ...}
   * 4. Single JSON object in text: {"name": ..., "arguments": ...}
   * 5. No tool call (no_tool / GSM8K plain-text answer)
   */
  private parseResponse(
    content: string,
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>,
  ): ParsedResponse {
    // 1. If provider returned native tool calls, use those directly
    if (toolCalls && toolCalls.length > 0) {
      if (toolCalls.length === 1) {
        return {
          raw_output: content,
          parsed_tool_call: toolCalls[0],
          parse_success: true,
        };
      }
      return {
        raw_output: content,
        parsed_sequence: toolCalls,
        parse_success: true,
      };
    }

    // 2. Try JSON array format first: [{"name": ..., "arguments": ...}, ...]
    try {
      const arrayMatch = content.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]) as Array<Record<string, unknown>>;
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].name === 'string') {
          if (parsed.length === 1) {
            return {
              raw_output: content,
              parsed_tool_call: {
                name: parsed[0].name as string,
                arguments: (parsed[0].arguments as Record<string, unknown>) ?? {},
              },
              parse_success: true,
            };
          }
          return {
            raw_output: content,
            parsed_sequence: parsed.map(p => ({
              name: p.name as string,
              arguments: (p.arguments as Record<string, unknown>) ?? {},
            })),
            parse_success: true,
          };
        }
      }
    } catch {
      // Not a valid array — fall through to object extraction
    }

    // 3. Extract ALL JSON objects from text (handles multi-tool in narrative)
    const extractedCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    // Use a balanced-brace approach: find each top-level { ... } block
    let depth = 0;
    let start = -1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const candidate = content.slice(start, i + 1);
          try {
            const obj = JSON.parse(candidate) as Record<string, unknown>;
            if (typeof obj.name === 'string') {
              extractedCalls.push({
                name: obj.name as string,
                arguments: (obj.arguments as Record<string, unknown>) ?? {},
              });
            }
          } catch {
            // Not valid JSON — skip this block
          }
          start = -1;
        }
      }
    }

    if (extractedCalls.length > 1) {
      // Multiple tool calls found in text → multi-tool sequence
      return {
        raw_output: content,
        parsed_sequence: extractedCalls,
        parse_success: true,
      };
    }

    if (extractedCalls.length === 1) {
      // Single tool call found
      return {
        raw_output: content,
        parsed_tool_call: extractedCalls[0],
        parse_success: true,
      };
    }

    // 4. No tool call detected (could be no_tool or GSM8K)
    return {
      raw_output: content,
      parse_success: true, // Successfully determined no tool call
    };
  }

  /**
   * Get the appropriate schema text based on experimental condition.
   */
  private getSchemaForCondition(schemas: CompressedSchemaSet, condition: Condition): string {
    switch (condition) {
      case 'natural':
      case 'natural_text':
        return schemas.natural;
      case 'tscg':
        return schemas.tscg;
      case 'tscg_sad':
        return schemas.tscg_sad;
      case 'tscg_conservative':
        return schemas.tscg_conservative ?? schemas.tscg;
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown condition: ${_exhaustive}`);
      }
    }
  }

  /**
   * Rough cost estimation based on provider and token counts.
   * Uses approximate per-1K-token pricing (as of 2025).
   */
  private estimateCost(
    provider: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    // Approximate pricing per 1K tokens (USD)
    const pricing: Record<string, { input: number; output: number }> = {
      anthropic: { input: 0.003, output: 0.015 }, // Claude Sonnet 4
      openai: { input: 0.005, output: 0.015 },    // GPT-4o
      ollama: { input: 0, output: 0 },             // Local
      together: { input: 0.001, output: 0.003 },   // Together hosted
    };

    const rate = pricing[provider] ?? { input: 0, output: 0 };
    return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  }

  /**
   * Create an error result when task execution fails after all retries.
   */
  private makeErrorResult(
    task: BenchmarkTask,
    model: ModelConfig,
    condition: Condition,
    run: number,
    errorMessage: string,
  ): TaskResult {
    return {
      result_id: randomUUID(),
      task_id: task.task_id,
      model: model.name,
      condition,
      run,
      response: {
        raw_output: `ERROR: ${errorMessage}`,
        parse_success: false,
      },
      scores: {
        tool_selection_accuracy: 0,
        parameter_f1: 0,
        overall: 0,
      },
      metrics: {
        input_tokens: 0,
        output_tokens: 0,
        total_latency_ms: 0,
        cost_usd: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * LUECKE 2: Filter out thinking models and warn.
   *
   * Thinking models (o1, o3, DeepSeek-R1) produce reasoning traces that
   * interfere with structured tool-call output. They are excluded from TAB.
   */
  private filterThinkingModels(models: ModelConfig[]): ModelConfig[] {
    const valid: ModelConfig[] = [];

    for (const model of models) {
      const thinkingPattern = isThinkingModel(model.model);
      if (thinkingPattern) {
        console.warn(
          `\n  WARNING [LUECKE 2]: Skipping thinking model "${model.name}" (${model.model})` +
          `\n  Matched pattern: "${thinkingPattern}"` +
          `\n  Thinking models are excluded from TAB evaluation.` +
          `\n  See LUECKE 2 documentation for details.\n`,
        );
      } else {
        valid.push(model);
      }
    }

    if (valid.length === 0 && models.length > 0) {
      throw new Error(
        'All configured models are thinking models (LUECKE 2 excluded). ' +
        'Please add at least one non-thinking model to the configuration.',
      );
    }

    return valid;
  }
}
