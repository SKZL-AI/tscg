/**
 * TAB Ollama Provider
 *
 * Local model provider using the Ollama /api/chat endpoint.
 * No rate limiting needed (runs locally).
 *
 * Supported models: mistral, phi4, llama3.1, gemma3, qwen3, deepseek-v3
 *
 * API Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import type {
  ModelProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderRateLimits,
} from './provider.js';

/** Ollama runs locally -- no external rate limits */
export const OLLAMA_RATE_LIMITS: ProviderRateLimits = {
  requestsPerMinute: Infinity,
  tokensPerMinute: Infinity,
};

/** Models known to work well with Ollama for TAB evaluation */
export const OLLAMA_SUPPORTED_MODELS = [
  'mistral',
  'phi4',
  'llama3.1',
  'gemma3',
  'qwen3',
  'deepseek-v3',
] as const;

// ============================================================
// Ollama API Types (subset used by this provider)
// ============================================================

/** Ollama tool definition format (mirrors OpenAI format) */
interface OllamaTool {
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

/** Ollama tool call in response */
interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/** Ollama /api/chat response (non-streaming) */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  /** Total duration in nanoseconds */
  total_duration?: number;
  /** Time to load the model in nanoseconds */
  load_duration?: number;
  /** Number of tokens in the prompt */
  prompt_eval_count?: number;
  /** Time to process prompt in nanoseconds */
  prompt_eval_duration?: number;
  /** Number of tokens generated */
  eval_count?: number;
  /** Time to generate response in nanoseconds */
  eval_duration?: number;
}

// ============================================================
// Provider Implementation
// ============================================================

export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: { model: string; baseUrl?: string }) {
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  /**
   * Execute a completion request against the Ollama /api/chat endpoint.
   *
   * 1. POSTs to /api/chat with model, messages, tools, stream: false
   * 2. Parses message.tool_calls from response
   * 3. Extracts prompt_eval_count and eval_count for token usage
   * 4. Uses options.temperature and options.num_predict for control
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const t0 = Date.now();

    // Build messages array with system message first
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: request.system },
      ...request.messages,
    ];

    // Build request body
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.max_tokens,
      },
    };

    // Map tools to Ollama format (same as OpenAI format) if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(tool => formatOllamaTool(tool));
    }

    // Execute API call
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Ollama connection error (is Ollama running at ${this.baseUrl}?): ${msg}`
      );
    }

    const latency = Date.now() - t0;

    // Handle HTTP errors
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Ollama API error (${response.status}): ${errorBody}`
      );
    }

    const data = (await response.json()) as OllamaChatResponse;

    const contentText = data.message.content ?? '';

    // Parse tool calls from response
    let toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> | undefined;

    if (data.message.tool_calls && data.message.tool_calls.length > 0) {
      toolCalls = data.message.tool_calls.map(tc => ({
        name: tc.function.name,
        arguments: tc.function.arguments ?? {},
      }));
    }

    // Extract token counts from Ollama response metrics
    // Ollama provides prompt_eval_count and eval_count directly
    const inputTokens = data.prompt_eval_count ?? this.estimateTokensSync(
      request.system + request.messages.map(m => m.content).join(' ')
    );
    const outputTokens = data.eval_count ?? this.estimateTokensSync(contentText);

    return {
      content: contentText,
      tool_calls: toolCalls,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      latency_ms: latency,
    };
  }

  /**
   * Estimate token count for text.
   * Uses a rough heuristic. Ollama models vary in tokenizer, but
   * ~4 chars per token is a reasonable approximation.
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
 * Convert a tool definition to Ollama tool format.
 *
 * Ollama uses the same tool format as OpenAI:
 * { type: "function", function: { name, description, parameters } }
 */
function formatOllamaTool(tool: unknown): OllamaTool {
  const t = tool as Record<string, unknown>;

  // Already in OpenAI/Ollama format
  if (t.type === 'function' && t.function) {
    return tool as OllamaTool;
  }

  // Anthropic format or raw format
  if (typeof t.name === 'string') {
    const parameters =
      (t.input_schema as OllamaTool['function']['parameters']) ??
      (t.parameters as OllamaTool['function']['parameters']) ?? {
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

  // Fallback: pass through
  return tool as OllamaTool;
}
