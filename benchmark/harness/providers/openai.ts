/**
 * TAB OpenAI Provider
 *
 * OpenAI model provider using the Chat Completions API.
 * Handles function_call / tool_calls response format.
 *
 * Rate limits: 60 rpm, 150K tpm (configurable per tier).
 *
 * Also used for OpenAI-compatible APIs (Together, Groq, etc.)
 * via the baseUrl configuration option.
 *
 * API Reference: https://platform.openai.com/docs/api-reference/chat/create
 */

import type {
  ModelProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderRateLimits,
} from './provider.js';

export const OPENAI_RATE_LIMITS: ProviderRateLimits = {
  requestsPerMinute: 60,
  tokensPerMinute: 150_000,
};

// ============================================================
// OpenAI API Types (subset used by this provider)
// ============================================================

/** OpenAI tool definition format */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** OpenAI tool call in response */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** OpenAI Chat Completions response */
interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAIToolCall[];
      /** Legacy function_call format (deprecated but still seen) */
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'function_call' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenAI API error response */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

// ============================================================
// Model capability detection
// ============================================================

/**
 * Models that use max_completion_tokens instead of max_tokens.
 * GPT-5+ and o-series reasoning models require this parameter.
 */
function usesMaxCompletionTokens(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.startsWith('gpt-5') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  );
}

// ============================================================
// Provider Implementation
// ============================================================

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  /**
   * Execute a completion request against the OpenAI Chat Completions API.
   *
   * 1. POSTs to /v1/chat/completions with Bearer token
   * 2. Maps tools array to OpenAI function/tool format
   * 3. Parses choices[0].message.tool_calls from response
   * 4. Handles both legacy function_call and new tool_calls format
   * 5. Extracts usage.prompt_tokens and usage.completion_tokens
   * 6. Uses max_completion_tokens for GPT-5+ / o-series models
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const t0 = Date.now();

    // Build messages array with system prompt as first message
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: request.system },
      ...request.messages,
    ];

    // Build request body
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature,
    };

    // GPT-5+ and o-series use max_completion_tokens instead of max_tokens
    if (usesMaxCompletionTokens(this.model)) {
      body.max_completion_tokens = request.max_tokens;
    } else {
      body.max_tokens = request.max_tokens;
    }

    // Map tools to OpenAI format if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(tool => formatOpenAITool(tool));
    }

    // Execute API call
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const latency = Date.now() - t0;

    // Handle HTTP errors
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody) as OpenAIErrorResponse;
        errorMessage = parsed.error?.message ?? errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(
        `OpenAI API error (${response.status}): ${errorMessage}`
      );
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;

    // Extract the first choice (we only send non-streaming, n=1 requests)
    const choice = data.choices[0];
    if (!choice) {
      throw new Error('OpenAI API returned no choices');
    }

    const contentText = choice.message.content ?? '';

    // Parse tool calls (new format: tool_calls array)
    let toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> | undefined;

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map(tc => ({
        name: tc.function.name,
        arguments: safeParseJSON(tc.function.arguments),
      }));
    } else if (choice.message.function_call) {
      // Legacy function_call format (deprecated but still used by some models)
      toolCalls = [
        {
          name: choice.message.function_call.name,
          arguments: safeParseJSON(choice.message.function_call.arguments),
        },
      ];
    }

    return {
      content: contentText,
      tool_calls: toolCalls,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
      latency_ms: latency,
    };
  }

  /**
   * Estimate token count for text.
   * Uses a rough heuristic. In production, use tiktoken for exact counts.
   * The heuristic is sufficient for benchmark cost estimation.
   */
  async countTokens(text: string): Promise<number> {
    return this.estimateTokensSync(text);
  }

  private estimateTokensSync(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================
// Tool Format Mapping
// ============================================================

/**
 * Convert a tool definition to OpenAI function-calling format.
 *
 * Accepts multiple input formats:
 * - Already in OpenAI format: { type: "function", function: { ... } }
 * - Anthropic format: { name, description, input_schema }
 * - Raw: { name, description, parameters }
 */
function formatOpenAITool(tool: unknown): OpenAITool {
  const t = tool as Record<string, unknown>;

  // Already in OpenAI format
  if (t.type === 'function' && t.function) {
    return tool as OpenAITool;
  }

  // Anthropic format or raw format
  if (typeof t.name === 'string') {
    const parameters =
      (t.input_schema as OpenAITool['function']['parameters']) ??
      (t.parameters as OpenAITool['function']['parameters']) ?? {
        type: 'object' as const,
        properties: {},
      };

    return {
      type: 'function',
      function: {
        name: t.name,
        description: (t.description as string) ?? '',
        parameters,
      },
    };
  }

  // Fallback: wrap as-is (may cause API error)
  return tool as OpenAITool;
}

// ============================================================
// Utilities
// ============================================================

/**
 * Safely parse a JSON string of function arguments.
 * OpenAI returns arguments as a JSON string that may be malformed
 * (e.g., truncated due to max_tokens). Returns empty object on failure.
 */
function safeParseJSON(jsonString: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(jsonString);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
